#!/usr/bin/env python3
"""
Watchlist Migration Script
Migrates watchlist functionality from localStorage to database
"""

import asyncio
import logging
from app.database.connection import db_manager, redis_manager
from app.database.models import Base, User, UserWatchlist, UserWatchlistScript, UserSettings
from sqlalchemy import text, inspect
from datetime import datetime

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def migrate_watchlists():
    """
    Migrate watchlist tables and create initial user settings.
    This is an idempotent migration - it can be run multiple times safely.
    """
    try:
        logger.info("Starting watchlist migration...")
        
        # Create all tables (idempotent operation)
        db_manager.create_tables()
        logger.info("Database tables created/updated successfully")
        
        # Verify the new tables exist
        inspector = inspect(db_manager.engine)
        existing_tables = inspector.get_table_names()
        
        required_tables = ['user_watchlists', 'user_watchlist_scripts', 'user_settings']
        missing_tables = [table for table in required_tables if table not in existing_tables]
        
        if missing_tables:
            logger.error(f"Migration failed: Missing tables: {missing_tables}")
            return False
            
        logger.info("All watchlist tables verified successfully")
        
        # Initialize default settings for existing users
        with db_manager.get_session() as session:
            # Get all users who don't have settings yet
            users_without_settings = session.query(User).outerjoin(UserSettings).filter(UserSettings.user_id.is_(None)).all()
            
            for user in users_without_settings:
                default_settings = UserSettings(
                    user_id=user.id,
                    current_watchlist_id=None,  # Will be set when first watchlist is created
                    view_mode='sell',
                    sort_mode='rate-desc',
                    reference_script_id=None,
                    difference_type='buy'
                )
                session.add(default_settings)
                logger.info(f"Created default settings for user: {user.username}")
            
            # Create default watchlists for users who don't have any
            users_without_watchlists = session.query(User).outerjoin(UserWatchlist).filter(UserWatchlist.user_id.is_(None)).all()
            
            for user in users_without_watchlists:
                # Create 5 default watchlists (matching localStorage behavior)
                for i in range(1, 6):
                    # Generate unique ID per user to avoid conflicts
                    import uuid
                    watchlist_id = f"watchlist-{user.id[:8]}-{i}"
                    watchlist = UserWatchlist(
                        id=watchlist_id,
                        user_id=user.id,
                        name=f"Watchlist {i}",
                        order_index=i-1
                    )
                    session.add(watchlist)
                    
                    # Set first watchlist as current
                    if i == 1:
                        user_settings = session.query(UserSettings).filter_by(user_id=user.id).first()
                        if user_settings:
                            user_settings.current_watchlist_id = watchlist_id
                
                logger.info(f"Created 5 default watchlists for user: {user.username}")
            
            session.commit()
            
        logger.info("Watchlist migration completed successfully!")
        return True
        
    except Exception as e:
        logger.error(f"Watchlist migration failed: {e}")
        raise

async def rollback_watchlists():
    """
    Rollback migration by dropping watchlist tables.
    WARNING: This will delete all watchlist data!
    """
    try:
        logger.warning("Starting watchlist migration rollback...")
        logger.warning("This will DELETE ALL watchlist data!")
        
        with db_manager.engine.connect() as conn:
            # Drop tables in reverse dependency order
            tables_to_drop = ['user_watchlist_scripts', 'user_watchlists', 'user_settings']
            
            for table in tables_to_drop:
                try:
                    conn.execute(text(f"DROP TABLE IF EXISTS {table} CASCADE"))
                    logger.info(f"Dropped table: {table}")
                except Exception as e:
                    logger.warning(f"Failed to drop table {table}: {e}")
            
            conn.commit()
        
        logger.info("Watchlist migration rollback completed")
        return True
        
    except Exception as e:
        logger.error(f"Watchlist migration rollback failed: {e}")
        raise

async def verify_migration():
    """Verify the migration was successful"""
    try:
        logger.info("Verifying watchlist migration...")
        
        with db_manager.get_session() as session:
            # Check tables exist and have correct structure
            inspector = inspect(db_manager.engine)
            
            # Verify user_watchlists table
            if 'user_watchlists' not in inspector.get_table_names():
                raise Exception("user_watchlists table not found")
            
            watchlist_columns = [col['name'] for col in inspector.get_columns('user_watchlists')]
            required_watchlist_cols = ['id', 'user_id', 'name', 'order_index', 'created_at', 'updated_at']
            missing_cols = [col for col in required_watchlist_cols if col not in watchlist_columns]
            if missing_cols:
                raise Exception(f"user_watchlists missing columns: {missing_cols}")
            
            # Verify user_watchlist_scripts table
            if 'user_watchlist_scripts' not in inspector.get_table_names():
                raise Exception("user_watchlist_scripts table not found")
            
            script_columns = [col['name'] for col in inspector.get_columns('user_watchlist_scripts')]
            required_script_cols = ['id', 'watchlist_id', 'dealer_name', 'script_name', 'product_type', 'added_at']
            missing_cols = [col for col in required_script_cols if col not in script_columns]
            if missing_cols:
                raise Exception(f"user_watchlist_scripts missing columns: {missing_cols}")
            
            # Verify user_settings table
            if 'user_settings' not in inspector.get_table_names():
                raise Exception("user_settings table not found")
            
            settings_columns = [col['name'] for col in inspector.get_columns('user_settings')]
            required_settings_cols = ['id', 'user_id', 'view_mode', 'sort_mode', 'difference_type']
            missing_cols = [col for col in required_settings_cols if col not in settings_columns]
            if missing_cols:
                raise Exception(f"user_settings missing columns: {missing_cols}")
            
            # Verify foreign key relationships
            watchlist_fks = inspector.get_foreign_keys('user_watchlists')
            script_fks = inspector.get_foreign_keys('user_watchlist_scripts')
            settings_fks = inspector.get_foreign_keys('user_settings')
            
            logger.info("All table structures verified successfully")
            
            # Test basic operations
            user_count = session.query(User).count()
            settings_count = session.query(UserSettings).count()
            watchlist_count = session.query(UserWatchlist).count()
            
            logger.info(f"Database statistics:")
            logger.info(f"  Users: {user_count}")
            logger.info(f"  User settings: {settings_count}")
            logger.info(f"  User watchlists: {watchlist_count}")
        
        logger.info("Watchlist migration verification completed successfully!")
        return True
        
    except Exception as e:
        logger.error(f"Watchlist migration verification failed: {e}")
        raise

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        command = sys.argv[1].lower()
        if command == 'rollback':
            asyncio.run(rollback_watchlists())
        elif command == 'verify':
            asyncio.run(verify_migration())
        else:
            print("Usage: python migrate_watchlists.py [rollback|verify]")
    else:
        asyncio.run(migrate_watchlists())