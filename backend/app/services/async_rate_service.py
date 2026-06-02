"""
Simplified In-Process Async Rate Service

Replaces process isolation with async task-based architecture for better
performance, reduced complexity, and elimination of Redis pub/sub overhead.
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Dict, Optional, Set, List
from collections import defaultdict

import sys
sys.path.append('/app')
from scrapers import get_scraper, get_all_scrapers, SCRAPERS
from scrapers.base.scraper import RateData

logger = logging.getLogger(__name__)


class AsyncRateService:
    """
    Simplified rate service using in-process async tasks instead of subprocesses
    
    Benefits:
    - No subprocess communication overhead
    - Direct in-memory communication with cached rate service
    - Simpler error handling and recovery
    - Better resource utilization
    - No Redis pub/sub flood
    """
    
    def __init__(self):
        self.scrapers: Dict[str, object] = {}
        self.scraper_tasks: Dict[str, asyncio.Task] = {}
        self.is_running = False
        self.rate_callback = None
        
        # Health monitoring
        self.last_activity: Dict[str, datetime] = {}
        self.restart_counts: Dict[str, List[datetime]] = defaultdict(list)  # MEMORY LEAK FIX: Store list of timestamps
        self.max_restarts_per_hour = 5
        
        # MEMORY LEAK FIXES: Add cleanup tracking
        self._last_cleanup = datetime.utcnow()
        self._cleanup_interval_minutes = 60  # Clean up every hour
        
        # Available scrapers — derived from the unified registry
        self.available_scrapers = list(SCRAPERS.keys())
        
    async def start(self, rate_callback=None):
        """Start the rate service with optional rate callback"""
        try:
            logger.info("Starting AsyncRateService with in-process architecture")
            self.rate_callback = rate_callback
            self.is_running = True
            
            # Initialize all scrapers
            for scraper_name in self.available_scrapers:
                try:
                    scraper = get_scraper(scraper_name)
                    await scraper.start()
                    self.scrapers[scraper_name] = scraper
                    logger.info(f"Initialized scraper: {scraper_name}")
                except Exception as e:
                    logger.error(f"Failed to initialize scraper {scraper_name}: {e}")
                    
            # Start all scraper tasks
            start_results = await self.start_all_scrapers()
            successful_starts = sum(1 for success in start_results.values() if success)
            logger.info(f"Started {successful_starts}/{len(start_results)} scrapers successfully")
            
            # Start health monitoring
            asyncio.create_task(self._health_monitor_loop())
            
            logger.info("AsyncRateService started successfully")
            
        except Exception as e:
            logger.error(f"Failed to start AsyncRateService: {e}")
            raise
    
    async def stop(self):
        """Stop the rate service and all scrapers"""
        logger.info("Stopping AsyncRateService")
        self.is_running = False
        
        # Cancel all scraper tasks
        tasks_to_cancel = []
        for scraper_name, task in self.scraper_tasks.items():
            if not task.done():
                task.cancel()
                tasks_to_cancel.append(task)
        
        if tasks_to_cancel:
            await asyncio.gather(*tasks_to_cancel, return_exceptions=True)
        
        # Stop all scrapers
        for scraper in self.scrapers.values():
            try:
                await scraper.stop()
            except Exception as e:
                logger.warning(f"Error stopping scraper: {e}")
        
        logger.info("AsyncRateService stopped")
    
    async def start_scraper(self, scraper_name: str) -> bool:
        """Start a specific scraper as an async task"""
        if scraper_name not in self.scrapers:
            logger.error(f"Unknown scraper: {scraper_name}")
            return False
        
        if scraper_name in self.scraper_tasks and not self.scraper_tasks[scraper_name].done():
            logger.warning(f"Scraper {scraper_name} is already running")
            return True
        
        try:
            scraper = self.scrapers[scraper_name]
            
            # Create async task for the scraper
            task = asyncio.create_task(
                self._run_scraper_continuously(scraper_name, scraper),
                name=f"scraper_{scraper_name}"
            )
            self.scraper_tasks[scraper_name] = task
            
            logger.info(f"Started async task for scraper: {scraper_name}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to start scraper {scraper_name}: {e}")
            return False
    
    async def stop_scraper(self, scraper_name: str) -> bool:
        """Stop a specific scraper task"""
        if scraper_name not in self.scraper_tasks:
            logger.warning(f"Scraper task {scraper_name} not found")
            return True
        
        try:
            task = self.scraper_tasks[scraper_name]
            if not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
            
            del self.scraper_tasks[scraper_name]
            logger.info(f"Stopped scraper task: {scraper_name}")
            return True
            
        except Exception as e:
            logger.error(f"Error stopping scraper {scraper_name}: {e}")
            return False
    
    async def restart_scraper(self, scraper_name: str) -> bool:
        """Restart a specific scraper"""
        logger.info(f"Restarting scraper: {scraper_name}")
        
        # MEMORY LEAK FIX: Check restart limits with proper cleanup
        now = datetime.utcnow()
        
        # Clean up old restart records for this scraper
        if scraper_name in self.restart_counts:
            self.restart_counts[scraper_name] = [t for t in self.restart_counts[scraper_name] 
                                               if now - t < timedelta(hours=1)]
        
        recent_restarts = self.restart_counts.get(scraper_name, [])
        
        if len(recent_restarts) >= self.max_restarts_per_hour:
            logger.error(f"Scraper {scraper_name} exceeded restart limit")
            return False
        
        # Record restart attempt
        if scraper_name not in self.restart_counts:
            self.restart_counts[scraper_name] = []
        self.restart_counts[scraper_name].append(now)
        
        # Stop the task
        await self.stop_scraper(scraper_name)
        await asyncio.sleep(2)  # Brief pause

        # Reset scraper state for clean restart
        scraper = self.scrapers.get(scraper_name)
        if scraper:
            # Reset connection state if scraper supports it (e.g., csvbullion)
            if hasattr(scraper, 'reset_connection_state'):
                scraper.reset_connection_state()
            else:
                # Generic reset for all scrapers
                scraper._stop_event.clear()
                scraper.is_running = True

        return await self.start_scraper(scraper_name)
    
    async def start_all_scrapers(self) -> Dict[str, bool]:
        """Start all scrapers"""
        results = {}
        for scraper_name in self.available_scrapers:
            results[scraper_name] = await self.start_scraper(scraper_name)
        return results
    
    async def stop_all_scrapers(self) -> Dict[str, bool]:
        """Stop all scrapers"""
        results = {}
        for scraper_name in list(self.scraper_tasks.keys()):
            results[scraper_name] = await self.stop_scraper(scraper_name)
        return results
    
    async def get_scraper_status(self, scraper_name: str) -> Optional[Dict]:
        """Get status of a specific scraper"""
        if scraper_name not in self.scrapers:
            return None
        
        task = self.scraper_tasks.get(scraper_name)
        is_running = task and not task.done() if task else False
        last_activity = self.last_activity.get(scraper_name)
        
        return {
            "name": scraper_name,
            "status": "running" if is_running else "stopped",
            "is_running": is_running,
            "is_healthy": await self._is_scraper_healthy(scraper_name),
            "task_id": id(task) if task else None,
            "restart_count": len(self.restart_counts.get(scraper_name, [])),
            "last_activity": last_activity.isoformat() if last_activity else None
        }
    
    async def get_all_scrapers_status(self) -> Dict[str, Dict]:
        """Get status of all scrapers"""
        result = {}
        for scraper_name in self.available_scrapers:
            result[scraper_name] = await self.get_scraper_status(scraper_name)
        return result
    
    async def _run_scraper_continuously(self, scraper_name: str, scraper):
        """Run individual scraper with appropriate method based on scraper type"""
        logger.info(f"Starting continuous task for scraper: {scraper_name}")
        
        # WebSocket scrapers need special handling
        if hasattr(scraper.config, 'scraper_type') and scraper.config.scraper_type.value == 'websocket':
            logger.info(f"Using event-driven mode for WebSocket scraper: {scraper_name}")
            return await self._run_websocket_scraper(scraper_name, scraper)
        else:
            return await self._run_polling_scraper(scraper_name, scraper)
    
    async def _run_websocket_scraper(self, scraper_name: str, scraper):
        """Run WebSocket scraper using run_continuous method"""
        try:
            # Create callback wrapper that updates activity
            async def activity_callback(competitor_name, rates):
                self.last_activity[scraper_name] = datetime.utcnow()
                if self.rate_callback:
                    await self.rate_callback(competitor_name, rates)
                    logger.debug(f"Processed {len(rates)} rates from {scraper_name}")
            
            # Use scraper's own run_continuous method for WebSocket handling
            await scraper.run_continuous(callback=activity_callback)
            
        except asyncio.CancelledError:
            logger.info(f"WebSocket scraper task {scraper_name} cancelled")
        except Exception as e:
            logger.error(f"Error in WebSocket scraper {scraper_name}: {e}")
        finally:
            logger.info(f"WebSocket task for scraper {scraper_name} ended")
    
    async def _run_polling_scraper(self, scraper_name: str, scraper):
        """Run polling scraper using scrape_rates method"""
        while self.is_running:
            try:
                # Scrape rates
                rates = await scraper.scrape_rates()

                # Handle results — update activity only after successful scrape
                if rates and self.rate_callback:
                    await self.rate_callback(scraper_name, rates)
                    self.last_activity[scraper_name] = datetime.utcnow()
                    logger.debug(f"Processed {len(rates)} rates from {scraper_name}")

                # Respect scraper's poll interval
                await asyncio.sleep(scraper.config.poll_interval)

            except asyncio.CancelledError:
                logger.info(f"Polling scraper task {scraper_name} cancelled")
                break

            except Exception as e:
                logger.error(f"Error in polling scraper {scraper_name}: {e}")
                self.last_activity[scraper_name] = datetime.utcnow()
                # Brief pause on error before retrying
                await asyncio.sleep(10)
        
        logger.info(f"Polling task for scraper {scraper_name} ended")
    
    async def _is_scraper_healthy(self, scraper_name: str) -> bool:
        """Check if scraper is healthy based on recent activity"""
        # Special handling for csvbullion - check Redis data instead of callback activity
        if scraper_name == "csvbullion":
            return not await self._is_csvbullion_data_stale()
        
        if scraper_name not in self.last_activity:
            return False
        
        # Different timeouts for different scraper types
        websocket_scrapers = {"rsbl"}  # Remove csvbullion from here since it's handled above
        timeout_seconds = 120 if scraper_name in websocket_scrapers else 60
        
        last_activity = self.last_activity[scraper_name]
        return datetime.utcnow() - last_activity < timedelta(seconds=timeout_seconds)
    
    async def _is_csvbullion_data_stale(self) -> bool:
        """Check if csvbullion Redis data is stale"""
        try:
            # Import here to avoid circular import
            import sys
            sys.path.append('/app')
            from app.database.connection import redis_manager
            
            if not redis_manager.async_redis_client:
                return False  # Can't check if Redis unavailable
                
            # Check csvbullion last update timestamp
            last_update = await redis_manager.get_json("csvbullion:last_update")
            if not last_update:
                logger.debug("No csvbullion last_update found in Redis")
                return True  # No data means stale
                
            last_update_time = datetime.fromisoformat(last_update['timestamp'])
            time_since_update = datetime.utcnow() - last_update_time
            
            # Consider stale if no update in last 5 minutes
            is_stale = time_since_update > timedelta(minutes=5)
            
            if is_stale:
                logger.warning(f"csvbullion Redis data is stale: {time_since_update} since last update")
            
            return is_stale
            
        except Exception as e:
            logger.error(f"Error checking csvbullion Redis data staleness: {e}")
            return False  # Don't restart on error
    
    def _cleanup_memory(self):
        """Periodic cleanup of old restart records to prevent memory leaks"""
        now = datetime.utcnow()

        # Only cleanup periodically
        if now - self._last_cleanup < timedelta(minutes=self._cleanup_interval_minutes):
            return

        self._last_cleanup = now
        logger.debug("Running periodic memory cleanup")

        # Clean up old restart timestamps for all scrapers
        for scraper_name in list(self.restart_counts.keys()):
            old_count = len(self.restart_counts[scraper_name])
            self.restart_counts[scraper_name] = [
                t for t in self.restart_counts[scraper_name]
                if now - t < timedelta(hours=1)
            ]
            new_count = len(self.restart_counts[scraper_name])

            # Remove empty entries
            if new_count == 0:
                del self.restart_counts[scraper_name]
            elif old_count != new_count:
                logger.debug(f"Cleaned up {old_count - new_count} old restart records for {scraper_name}")

    async def _health_monitor_loop(self):
        """Background task to monitor scraper health and auto-restart"""
        logger.info("Starting health monitor loop for async scrapers")
        
        while self.is_running:
            try:
                for scraper_name in self.available_scrapers:
                    task = self.scraper_tasks.get(scraper_name)
                    
                    # Check if task died
                    if task and task.done() and not task.cancelled():
                        logger.warning(f"Scraper task {scraper_name} died, restarting")
                        await self.restart_scraper(scraper_name)
                    
                    # Check if task is unhealthy
                    elif task and not await self._is_scraper_healthy(scraper_name):
                        logger.warning(f"Scraper {scraper_name} is unhealthy, restarting")
                        await self.restart_scraper(scraper_name)
                
                # MEMORY LEAK FIX: Periodic cleanup
                self._cleanup_memory()
                
                await asyncio.sleep(30)  # Check every 30 seconds
                
            except Exception as e:
                logger.error(f"Error in health monitor loop: {e}")
                # MEMORY LEAK FIX: Periodic cleanup even on error
                self._cleanup_memory()
                
                await asyncio.sleep(30)


# Global instance
async_rate_service = AsyncRateService()