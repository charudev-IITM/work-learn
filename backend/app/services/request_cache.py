"""
Request Caching Layer

Implements intelligent caching for API requests to reduce redundant calls
and improve performance while respecting rate limits.
"""

import asyncio
import hashlib
import time
import logging
from typing import Optional, Dict, Any, Tuple
from dataclasses import dataclass
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


@dataclass
class CacheEntry:
    """Cache entry with expiration and metadata"""
    data: str
    timestamp: float
    ttl: int
    url: str
    status_code: int = 200


class RequestCache:
    """
    Intelligent request cache with TTL and deduplication
    
    Features:
    - TTL-based expiration
    - Request deduplication for concurrent requests
    - Size-based eviction (LRU)
    - Per-URL cache control
    """
    
    def __init__(self, max_size: int = 1000, default_ttl: int = 30):
        self.cache: Dict[str, CacheEntry] = {}
        self.max_size = max_size
        self.default_ttl = default_ttl
        self.access_times: Dict[str, float] = {}  # For LRU eviction
        self.pending_requests: Dict[str, asyncio.Future] = {}  # Request deduplication
        
    def _generate_key(self, url: str, method: str = "GET", **kwargs) -> str:
        """Generate cache key from request parameters"""
        # Include relevant parameters in cache key
        key_data = {
            'url': url,
            'method': method,
            'params': kwargs.get('params'),
            'headers': dict(sorted((kwargs.get('headers') or {}).items()))
        }
        
        key_string = str(sorted(key_data.items()))
        return hashlib.md5(key_string.encode()).hexdigest()
    
    def _is_expired(self, entry: CacheEntry) -> bool:
        """Check if cache entry is expired"""
        return time.time() - entry.timestamp > entry.ttl
    
    def _evict_expired(self):
        """Remove expired entries"""
        current_time = time.time()
        expired_keys = [
            key for key, entry in self.cache.items()
            if current_time - entry.timestamp > entry.ttl
        ]
        
        for key in expired_keys:
            self.cache.pop(key, None)
            self.access_times.pop(key, None)
    
    def _evict_lru(self):
        """Evict least recently used entries to maintain max_size"""
        if len(self.cache) <= self.max_size:
            return
        
        # Sort by access time and remove oldest
        sorted_keys = sorted(self.access_times.items(), key=lambda x: x[1])
        keys_to_remove = [key for key, _ in sorted_keys[:len(self.cache) - self.max_size]]
        
        for key in keys_to_remove:
            self.cache.pop(key, None)
            self.access_times.pop(key, None)
            
        logger.debug(f"Evicted {len(keys_to_remove)} entries from request cache")
    
    async def get_or_fetch(self, 
                          url: str, 
                          fetch_func, 
                          method: str = "GET", 
                          ttl: Optional[int] = None,
                          **kwargs) -> Optional[str]:
        """
        Get from cache or fetch if not cached/expired
        
        Args:
            url: Request URL
            fetch_func: Async function to fetch data if not cached
            method: HTTP method
            ttl: Cache TTL in seconds (overrides default)
            **kwargs: Additional parameters for cache key generation
        
        Returns:
            Response text or None if fetch failed
        """
        cache_key = self._generate_key(url, method, **kwargs)
        current_time = time.time()
        
        # Clean up expired entries periodically
        if len(self.cache) > 100:  # Only clean when cache is sizable
            self._evict_expired()
        
        # Check if we have a valid cached entry
        if cache_key in self.cache:
            entry = self.cache[cache_key]
            if not self._is_expired(entry):
                self.access_times[cache_key] = current_time
                logger.debug(f"Cache hit for {url}")
                return entry.data
            else:
                # Remove expired entry
                del self.cache[cache_key]
                self.access_times.pop(cache_key, None)
        
        # Check if request is already in flight (deduplication)
        if cache_key in self.pending_requests:
            logger.debug(f"Request deduplication for {url}")
            try:
                return await self.pending_requests[cache_key]
            except Exception as e:
                logger.warning(f"Pending request failed for {url}: {e}")
                self.pending_requests.pop(cache_key, None)
                return None
        
        # Create future for request deduplication
        future = asyncio.Future()
        self.pending_requests[cache_key] = future
        
        try:
            # Fetch data
            logger.debug(f"Cache miss, fetching {url}")
            result = await fetch_func()
            
            if result is not None:
                # Cache the result
                cache_ttl = ttl or self.default_ttl
                entry = CacheEntry(
                    data=result,
                    timestamp=current_time,
                    ttl=cache_ttl,
                    url=url
                )
                
                self.cache[cache_key] = entry
                self.access_times[cache_key] = current_time
                
                # Evict LRU if cache is full
                self._evict_lru()
                
                logger.debug(f"Cached response for {url} (TTL: {cache_ttl}s)")
            
            future.set_result(result)
            return result
            
        except Exception as e:
            logger.error(f"Error fetching {url}: {e}")
            future.set_exception(e)
            return None
            
        finally:
            self.pending_requests.pop(cache_key, None)
    
    def invalidate(self, url: str, method: str = "GET", **kwargs):
        """Invalidate specific cache entry"""
        cache_key = self._generate_key(url, method, **kwargs)
        self.cache.pop(cache_key, None)
        self.access_times.pop(cache_key, None)
        logger.debug(f"Invalidated cache for {url}")
    
    def clear(self):
        """Clear all cache entries"""
        self.cache.clear()
        self.access_times.clear()
        self.pending_requests.clear()
        logger.info("Cleared request cache")
    
    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        current_time = time.time()
        expired_count = sum(1 for entry in self.cache.values() 
                          if current_time - entry.timestamp > entry.ttl)
        
        return {
            "total_entries": len(self.cache),
            "expired_entries": expired_count,
            "pending_requests": len(self.pending_requests),
            "max_size": self.max_size,
            "default_ttl": self.default_ttl,
            "cache_utilization": len(self.cache) / self.max_size if self.max_size > 0 else 0
        }


# Global cache instance
request_cache = RequestCache(max_size=500, default_ttl=15)  # 15 second default TTL