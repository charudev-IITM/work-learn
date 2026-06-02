#!/usr/bin/env python3
"""
Database initialization script
Creates tables and initial data for the bullion competitive intelligence system
"""

import asyncio
import logging
from app.database.connection import db_manager, redis_manager
from app.database.models import Base, Competitor, User

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def init_database():
    """Initialize the database with tables and initial data"""
    try:
        logger.info("Initializing database...")
        
        # Create all tables
        db_manager.create_tables()
        logger.info("Database tables created successfully")
        
        # Initialize Redis connection
        await redis_manager.connect()
        logger.info("Redis connection established")
        
        # Add initial competitors if they don't exist
        with db_manager.get_session() as session:
            competitors = [
                {"name": "kjbullion", "base_url": "https://kjbullion.com", "scraper_type": "api"},
                {"name": "csvbullion", "base_url": "https://csvbullion.com", "scraper_type": "websocket"},
                {"name": "arihantspot", "base_url": "https://arihantspot.com", "scraper_type": "api"},
                {"name": "dpgold", "base_url": "https://dpgold.co.in", "scraper_type": "api"},
                {"name": "smsbullion", "base_url": "https://smsbullion.com", "scraper_type": "api"},
                {"name": "shivsahai", "base_url": "https://shivsahai.com", "scraper_type": "api"},
                {"name": "rakshabullion", "base_url": "https://rakshabullion.com", "scraper_type": "api"},
                {"name": "suswanibullion", "base_url": "https://suswanibullion.com", "scraper_type": "api"},
                {"name": "slnbullion", "base_url": "https://slnbullion.com", "scraper_type": "api"},
                {"name": "ashtasiddhi", "base_url": "https://ashtasiddhi.com", "scraper_type": "api"},
                {"name": "goldcommodity", "base_url": "https://goldcommodity.com", "scraper_type": "api"}
            ]
            
            for comp_data in competitors:
                existing = session.query(Competitor).filter_by(name=comp_data["name"]).first()
                if not existing:
                    competitor = Competitor(**comp_data)
                    session.add(competitor)
            
            session.commit()
            logger.info(f"Added {len(competitors)} competitors to database")
        
        # Disconnect Redis
        await redis_manager.disconnect()
        
        logger.info("Database initialization completed successfully!")
        
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        raise

if __name__ == "__main__":
    asyncio.run(init_database())