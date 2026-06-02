#!/usr/bin/env python3
"""
Quick test script to validate scraper functionality
"""
import asyncio
import sys
import os

# Add the backend path to sys.path so we can import our modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from scrapers import SCRAPERS
import logging

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

async def test_scraper(scraper_name, scraper_class):
    """Test a single scraper"""
    print(f"\n{'='*60}")
    print(f"Testing {scraper_name.upper()}")
    print(f"{'='*60}")
    
    try:
        # Create scraper instance
        scraper = scraper_class()
        
        # Start the scraper
        await scraper.start()
        
        print(f"✅ Scraper initialized: {scraper.config.base_url}")
        print(f"   Scraper type: {scraper.config.scraper_type.value}")
        
        # Test rate scraping
        print("📊 Scraping rates...")
        rates = await scraper.scrape_rates()
        
        if rates:
            print(f"✅ Successfully scraped {len(rates)} rates")
            
            # Show first few rates as sample
            for i, rate in enumerate(rates[:3]):
                print(f"   {i+1}. {rate.script_name}")
                print(f"      Buy: {rate.buy_rate}, Sell: {rate.sell_rate}")
                print(f"      High: {rate.high_rate}, Low: {rate.low_rate}")
                
            if len(rates) > 3:
                print(f"   ... and {len(rates) - 3} more scripts")
        else:
            print("❌ No rates scraped")
            
        # Test available scripts
        print("📋 Getting available scripts...")
        scripts = await scraper.get_available_scripts()
        print(f"✅ Found {len(scripts)} available scripts")
        
        # Stop the scraper
        await scraper.stop()
        
        return True, len(rates), len(scripts)
        
    except Exception as e:
        print(f"❌ Error testing {scraper_name}: {e}")
        logger.exception(f"Detailed error for {scraper_name}")
        try:
            await scraper.stop()
        except:
            pass
        return False, 0, 0

async def main():
    """Test all scrapers"""
    print("🚀 Starting scraper validation tests")
    print(f"Testing {len(SCRAPERS)} scrapers...")
    
    results = {}
    total_rates = 0
    total_scripts = 0
    successful_scrapers = 0
    
    for scraper_name, scraper_class in SCRAPERS.items():
        success, rates_count, scripts_count = await test_scraper(scraper_name, scraper_class)
        
        results[scraper_name] = {
            'success': success,
            'rates': rates_count,
            'scripts': scripts_count
        }
        
        if success:
            successful_scrapers += 1
            total_rates += rates_count
            total_scripts += scripts_count
            
        # Small delay between tests
        await asyncio.sleep(1)
    
    # Print summary
    print(f"\n{'='*60}")
    print("SCRAPER TEST SUMMARY")
    print(f"{'='*60}")
    
    for scraper_name, result in results.items():
        status = "✅ PASS" if result['success'] else "❌ FAIL"
        print(f"{scraper_name:15} {status:8} {result['rates']:3d} rates, {result['scripts']:3d} scripts")
    
    print(f"\n🎯 Overall Results:")
    print(f"   Successful scrapers: {successful_scrapers}/{len(SCRAPERS)}")
    print(f"   Total rates scraped: {total_rates}")
    print(f"   Total scripts found: {total_scripts}")
    
    if successful_scrapers == len(SCRAPERS):
        print(f"\n🎉 ALL SCRAPERS WORKING! Ready for production!")
    else:
        print(f"\n⚠️  {len(SCRAPERS) - successful_scrapers} scrapers need attention")
        
    print(f"\n💡 Next steps:")
    print(f"   1. Run: ./scripts/start-dev.sh")
    print(f"   2. Open: http://localhost:3000")
    print(f"   3. Check dashboard for live data")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\n⏹️  Test interrupted by user")
    except Exception as e:
        print(f"\n\n💥 Test failed with error: {e}")
        sys.exit(1)