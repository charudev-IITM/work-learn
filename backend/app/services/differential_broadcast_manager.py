"""
Differential Broadcasting Manager for WebSocket rate updates
Reduces CPU and network overhead by sending only changed rates
"""

import json
import logging
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime
from dataclasses import dataclass
from .websocket_manager import WebSocketManager
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '../../'))
from scrapers.base.scraper import RateData

logger = logging.getLogger(__name__)

@dataclass
class RateChange:
    """Represents a single rate change"""
    symbol: str
    script_name: str
    buy_rate: Optional[float]
    sell_rate: Optional[float]
    high_rate: Optional[float]
    low_rate: Optional[float]
    timestamp: str
    change_type: str  # 'updated', 'added', 'removed'

class DifferentialBroadcastManager:
    """
    Manages differential WebSocket broadcasting for rate updates.
    Only sends changed rates instead of full competitor rate sets.
    """
    
    def __init__(self, websocket_manager: WebSocketManager):
        self.websocket_manager = websocket_manager
        
        # ULTRA-LIGHTWEIGHT: Only store hashes for comparison (no full rate data)
        self.previous_rate_hashes: Dict[str, Dict[str, int]] = {}
        
        # ELIMINATED: previous_rates - was redundant with current_rates in CachedRateService
        # Full rate data accessible from cached_rate_service when needed
        
        # Track sequence numbers for ordering
        self.sequence_numbers: Dict[str, int] = {}
        
        # Configuration
        self.full_sync_interval = 50  # Send full sync every N updates
        self.update_counters: Dict[str, int] = {}
        
        # Timestamp caching to reduce datetime overhead
        self._last_timestamp = None
        self._last_timestamp_time = 0
        
        # MEMORY LEAK FIXES: Add cleanup tracking and limits
        self.max_competitors = 20  # Limit total competitors to prevent unbounded growth
        self.max_symbols_per_competitor = 100  # Limit symbols per competitor
        self._last_cleanup = datetime.utcnow()
        self._cleanup_interval_minutes = 30  # Clean up every 30 minutes
        self._last_update_time: Dict[str, datetime] = {}  # Track last update per competitor
        
    def _get_cached_timestamp(self) -> str:
        """Get ISO timestamp with 1-second caching to reduce datetime overhead"""
        import time
        current_time = int(time.time())
        
        if self._last_timestamp_time != current_time:
            self._last_timestamp = datetime.utcnow().isoformat()
            self._last_timestamp_time = current_time
            
        return self._last_timestamp
        
    def _create_rate_hash(self, rate: RateData) -> int:
        """Create ultra-fast numeric hash for rate comparison (no string serialization)"""
        # Use tuple hashing which is optimized in CPython
        return hash((
            rate.symbol,
            rate.buy_rate or 0.0,
            rate.sell_rate or 0.0, 
            rate.high_rate or 0.0,
            rate.low_rate or 0.0
        ))
        
    def _rate_to_dict(self, rate: RateData) -> Dict[str, Any]:
        """Convert RateData to dictionary for storage and comparison"""
        d = rate.to_dict()
        # Override timestamp with cached version if original is None
        if not rate.timestamp:
            d['timestamp'] = self._get_cached_timestamp()
        return d
        
    def compute_changes_optimized(self, competitor: str, new_rates: List[RateData]) -> Tuple[List[Dict], List[Dict], List[str]]:
        """
        Optimized differential change computation using hash-based comparison.
        Avoids dictionary creation for unchanged rates.
        Returns: (updated_rates, added_rates, removed_symbols)
        """
        
        # ULTRA-LIGHTWEIGHT: Only use hashes for comparison
        previous_hashes = self.previous_rate_hashes.get(competitor, {})
        
        # Compute hashes for new rates (O(N) but no dict creation)
        new_hashes = {}
        changed_rates = {}  # Only create dicts for changed rates
        
        updated_rates = []
        added_rates = []
        
        # Check each new rate using hash comparison
        for rate in new_rates:
            symbol = rate.symbol
            new_hash = self._create_rate_hash(rate)
            new_hashes[symbol] = new_hash
            
            if symbol in previous_hashes:
                # Compare hashes (O(1) numeric comparison vs dict comparison)
                if previous_hashes[symbol] != new_hash:
                    # Hash changed - rate updated, convert to dict only now
                    rate_dict = self._rate_to_dict(rate)
                    updated_rates.append(rate_dict)
                    changed_rates[symbol] = rate_dict
                # Hash unchanged - no dict creation needed!
            else:
                # New rate added
                rate_dict = self._rate_to_dict(rate)
                added_rates.append(rate_dict)
                changed_rates[symbol] = rate_dict
                
        # Check for removed rates
        previous_symbols = set(previous_hashes.keys())
        new_symbols = set(new_hashes.keys())
        removed_symbols = list(previous_symbols - new_symbols)
        
        # ULTRA-LIGHTWEIGHT: Only update hashes (no redundant rate storage)
        self.previous_rate_hashes[competitor] = new_hashes
        
        # MEMORY LEAK FIX: Periodic cleanup to prevent unbounded growth
        self._cleanup_if_needed()
        
        return updated_rates, added_rates, removed_symbols
        
    async def broadcast_rate_changes(self, competitor: str, new_rates: List[RateData]) -> bool:
        """
        Broadcast differential rate changes. Returns True if changes were sent.
        """
        if not new_rates:
            return False
            
        try:
            # Increment sequence number for this competitor
            self.sequence_numbers[competitor] = self.sequence_numbers.get(competitor, 0) + 1
            sequence = self.sequence_numbers[competitor]

            # Track last update time for cleanup
            self._last_update_time[competitor] = datetime.utcnow()

            # Increment update counter for full sync scheduling
            self.update_counters[competitor] = self.update_counters.get(competitor, 0) + 1
            
            # Check if we should send full sync
            should_send_full_sync = (
                competitor not in self.previous_rate_hashes or  # First update
                self.update_counters[competitor] % self.full_sync_interval == 0  # Periodic full sync
            )
            
            if should_send_full_sync:
                await self._broadcast_full_sync(competitor, new_rates, sequence)
                return True
            else:
                return await self._broadcast_differential_update(competitor, new_rates, sequence)
                
        except Exception as e:
            logger.error(f"Error in differential broadcast for {competitor}: {e}")
            # Fallback to full sync on error
            await self._broadcast_full_sync(competitor, new_rates, 0)
            return True
            
    async def _broadcast_full_sync(self, competitor: str, rates: List[RateData], sequence: int):
        """Send full rate sync message with optimized hash tracking"""
        
        rate_list = []
        new_hashes = {}
        new_rates_data = {}
        
        for rate in rates:
            rate_dict = self._rate_to_dict(rate)
            rate_list.append(rate_dict)
            
            # Store hash and dict data for future comparisons
            new_hashes[rate.symbol] = self._create_rate_hash(rate)
            new_rates_data[rate.symbol] = rate_dict
            
        # ULTRA-LIGHTWEIGHT: Only store hashes for next comparison
        self.previous_rate_hashes[competitor] = new_hashes
        
        # Use optimized JSON serialization with cached timestamp
        timestamp = self._get_cached_timestamp()
        json_message = self._build_optimized_json('rate_update_full', competitor, rate_list, sequence, timestamp)
        
        await self.websocket_manager.broadcast(json_message)
        logger.info(f"Sent full sync for {competitor}: {len(rate_list)} rates")
        
    async def _broadcast_differential_update(self, competitor: str, new_rates: List[RateData], sequence: int) -> bool:
        """Send differential rate update. Returns True if changes were sent."""
        
        updated_rates, added_rates, removed_symbols = self.compute_changes_optimized(competitor, new_rates)
        
        # Only broadcast if there are actual changes
        total_changes = len(updated_rates) + len(added_rates) + len(removed_symbols)
        if total_changes == 0:
            logger.debug(f"No rate changes for {competitor}, skipping broadcast")
            return False
            
        # Use optimized JSON serialization for differential updates with cached timestamp
        timestamp = self._get_cached_timestamp()
        changes_data = {
            'updated': updated_rates,
            'added': added_rates,
            'removed': removed_symbols
        }
        json_message = self._build_optimized_json('rate_update_diff', competitor, changes_data, sequence, timestamp)
        
        await self.websocket_manager.broadcast(json_message)
        
        # Log the efficiency gain
        original_size = len(new_rates)
        sent_size = total_changes
        reduction_percent = ((original_size - sent_size) / original_size * 100) if original_size > 0 else 0
        
        logger.info(f"Differential broadcast for {competitor}: {sent_size}/{original_size} rates "
                   f"({reduction_percent:.1f}% reduction)")
        
        return True
        
    def _build_optimized_json(self, message_type: str, competitor: str, data, sequence: int, timestamp: str) -> str:
        """Build JSON message string using json.dumps for correctness"""
        message = {
            'type': message_type,
            'competitor': competitor,
            'timestamp': timestamp,
            'sequence': sequence
        }
        
        if message_type == 'rate_update_diff':
            message['changes'] = data
        else:  # rate_update_full
            message['rates'] = data
            
        return json.dumps(message)

    async def force_full_sync(self, competitor: str = None):
        """Force full sync for specific competitor or all competitors"""
        if competitor:
            # Reset hashes to trigger full sync on next update
            if competitor in self.previous_rate_hashes:
                del self.previous_rate_hashes[competitor]
            self.update_counters[competitor] = 0
        else:
            # Reset only hash storage
            self.previous_rate_hashes.clear()
            self.update_counters.clear()
            
        logger.info(f"Forced full sync reset for: {competitor or 'all competitors'}")
            
    def _cleanup_if_needed(self):
        """MEMORY LEAK FIX: Clean up old data periodically to prevent unbounded growth"""
        now = datetime.utcnow()
        if (now - self._last_cleanup).total_seconds() < self._cleanup_interval_minutes * 60:
            return  # Not time for cleanup yet

        self._last_cleanup = now

        try:
            # CONSERVATIVE: Only remove truly stale competitors (inactive >6h)
            stale_competitors = []

            for competitor in list(self.previous_rate_hashes.keys()):
                last_activity = self._last_update_time.get(competitor)
                if last_activity and (now - last_activity).total_seconds() > 6 * 3600:
                    stale_competitors.append(competitor)

            # Remove truly stale competitors
            for competitor in stale_competitors:
                self.previous_rate_hashes.pop(competitor, None)
                self.sequence_numbers.pop(competitor, None)
                self.update_counters.pop(competitor, None)
                self._last_update_time.pop(competitor, None)

            if stale_competitors:
                logger.info(f"Cleaned {len(stale_competitors)} stale competitors (inactive >6h): {stale_competitors}")

            # ULTRA-LIGHTWEIGHT: Only limit symbols if extreme growth (>1000 per competitor)
            for competitor in list(self.previous_rate_hashes.keys()):
                competitor_hashes = self.previous_rate_hashes[competitor]
                if len(competitor_hashes) > 1000:  # Much higher threshold
                    # Keep only recent 500 symbols
                    symbols_to_keep = list(competitor_hashes.keys())[-500:]
                    self.previous_rate_hashes[competitor] = {
                        symbol: competitor_hashes[symbol] for symbol in symbols_to_keep
                    }
                    logger.warning(f"Symbol cleanup for {competitor}: {len(competitor_hashes)} -> 500")

        except Exception as e:
            logger.error(f"Error during cleanup: {e}")
        
    def get_statistics(self) -> Dict[str, Any]:
        """Get broadcasting statistics"""
        return {
            'tracked_competitors': len(self.previous_rate_hashes),
            'sequence_numbers': dict(self.sequence_numbers),
            'update_counters': dict(self.update_counters),
            'total_stored_hashes': sum(len(hashes) for hashes in self.previous_rate_hashes.values())
        }