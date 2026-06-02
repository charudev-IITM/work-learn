from sqlalchemy import Column, String, Float, DateTime, Index, Text, Boolean, ForeignKey, Integer, JSON, CheckConstraint
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
from datetime import datetime

Base = declarative_base()

class RateRecord(Base):
    __tablename__ = "rate_records"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    competitor = Column(String(100), nullable=False, index=True)
    script_name = Column(String(200), nullable=False)
    symbol = Column(String(100), nullable=False, index=True)
    buy_rate = Column(Float)
    sell_rate = Column(Float)
    high_rate = Column(Float)
    low_rate = Column(Float)
    volume = Column(Float)
    timestamp = Column(DateTime, nullable=False, index=True, default=datetime.utcnow)
    
    # Composite indexes for fast lookups
    __table_args__ = (
        Index('idx_competitor_symbol', 'competitor', 'symbol'),
        Index('idx_competitor_timestamp', 'competitor', 'timestamp'),
        Index('idx_symbol_timestamp', 'symbol', 'timestamp'),
        Index('idx_competitor_symbol_timestamp', 'competitor', 'symbol', 'timestamp'),
    )

class Competitor(Base):
    __tablename__ = "competitors"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False, unique=True, index=True)
    base_url = Column(String(500))
    scraper_type = Column(String(50))
    is_active = Column(String(10), default='true')
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Script(Base):
    __tablename__ = "scripts"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    symbol = Column(String(100), nullable=False, unique=True, index=True)
    script_name = Column(String(200), nullable=False)
    description = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Index for fast script lookups
    __table_args__ = (
        Index('idx_script_name', 'script_name'),
    )

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))

    # Legacy username/password - nullable to support phone-only users
    username = Column(String(50), unique=True, nullable=True, index=True)
    password_hash = Column(String(255), nullable=True)

    # Phone-based auth
    phone = Column(String(20), unique=True, nullable=True, index=True)
    name = Column(String(100), nullable=True)
    business = Column(String(200), nullable=True)
    onboarding_complete = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    email = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True)
    is_admin = Column(Boolean, default=False)
    last_login = Column(DateTime, nullable=True)
    ban_reason = Column(Text, nullable=True)
    banned_at = Column(DateTime, nullable=True)

    # Free trial
    trial_started_at = Column(DateTime, nullable=True)
    trial_ends_at = Column(DateTime, nullable=True)

    # Relationships
    watchlists = relationship("UserWatchlist", back_populates="user", cascade="all, delete-orphan")
    settings = relationship("UserSettings", back_populates="user", uselist=False, cascade="all, delete-orphan")
    subscription = relationship("Subscription", back_populates="user", uselist=False, cascade="all, delete-orphan")
    alerts = relationship("PriceAlert", back_populates="user", cascade="all, delete-orphan")
    formulas = relationship("UserFormula", back_populates="user", cascade="all, delete-orphan")

class UserWatchlist(Base):
    __tablename__ = "user_watchlists"
    
    id = Column(String, primary_key=True)  # Using string IDs to match frontend
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    order_index = Column(Integer, nullable=False, default=0)  # For maintaining watchlist order
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="watchlists")
    scripts = relationship("UserWatchlistScript", back_populates="watchlist", cascade="all, delete-orphan", order_by="UserWatchlistScript.order_index")
    
    # Indexes for performance
    __table_args__ = (
        Index('idx_user_watchlist_order', 'user_id', 'order_index'),
        Index('idx_user_watchlist_updated', 'user_id', 'updated_at'),
    )

class UserWatchlistScript(Base):
    __tablename__ = "user_watchlist_scripts"
    
    id = Column(String, primary_key=True)  # Using string IDs to match frontend
    watchlist_id = Column(String, ForeignKey("user_watchlists.id", ondelete="CASCADE"), nullable=False, index=True)
    dealer_name = Column(String(100), nullable=False)
    script_name = Column(String(200), nullable=False)  # The symbol/key used for matching
    script_display_name = Column(String(200), nullable=True)  # Human-readable display name
    product_type = Column(String(100), nullable=False)
    multiplier = Column(Float, nullable=True, default=1.0)
    order_index = Column(Integer, nullable=False, default=0)  # For drag-and-drop ordering
    added_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    
    # Store original rates from search to avoid dependency on live data
    original_buy_rate = Column(Float, nullable=True)
    original_sell_rate = Column(Float, nullable=True)
    original_rates_timestamp = Column(DateTime, nullable=True)
    
    # Relationships
    watchlist = relationship("UserWatchlist", back_populates="scripts")
    
    # Indexes for performance
    __table_args__ = (
        Index('idx_watchlist_script_order', 'watchlist_id', 'order_index'),
        Index('idx_script_dealer_symbol', 'dealer_name', 'script_name'),
    )

class DealerRequest(Base):
    __tablename__ = "dealer_requests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    dealer_name = Column(String(200), nullable=False)
    dealer_url = Column(String(500), nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

class UserSettings(Base):
    __tablename__ = "user_settings"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    
    # Current watchlist selection
    current_watchlist_id = Column(String, nullable=True)
    
    # View and sort preferences
    view_mode = Column(String(20), nullable=False, default='sell')  # 'buy', 'sell', 'differences'
    sort_mode = Column(String(20), nullable=False, default='rate-desc')  # 'rate-asc', 'rate-desc', 'dealer', 'added', etc.
    
    # Differences mode settings
    reference_script_id = Column(String, nullable=True)  # For differences mode
    difference_type = Column(String(10), nullable=False, default='buy')  # 'buy' or 'sell'

    # Layout preferences
    layout_mode = Column(String(20), nullable=False, default='compact')  # 'compact' or 'card'
    city_filter = Column(String(100), nullable=True)  # null = all cities
    
    # Timestamps
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="settings")


class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)

    # Razorpay identifiers
    razorpay_subscription_id = Column(String(100), nullable=True, unique=True, index=True)
    razorpay_plan_id = Column(String(100), nullable=True)
    razorpay_customer_id = Column(String(100), nullable=True)

    # Plan metadata
    plan_type = Column(String(20), nullable=False)  # 'monthly' | 'annual'

    # Subscription lifecycle
    # Statuses: created | authenticated | active | pending | halted | cancelled | expired | paused
    status = Column(String(30), nullable=False, default="created")

    # Billing period
    current_period_start = Column(DateTime, nullable=True)
    current_period_end = Column(DateTime, nullable=True)

    # Payment tracking
    charge_at = Column(DateTime, nullable=True)
    paid_count = Column(Integer, nullable=False, default=0)

    # Webhook metadata
    last_webhook_event = Column(String(50), nullable=True)
    last_webhook_at = Column(DateTime, nullable=True)

    # Timestamps
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationship
    user = relationship("User", back_populates="subscription")


class SubscriptionEvent(Base):
    __tablename__ = "subscription_events"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    subscription_id = Column(String, ForeignKey("subscriptions.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    razorpay_event_id = Column(String(100), nullable=True, unique=True)  # idempotency key
    event_type = Column(String(50), nullable=False)
    event_payload = Column(JSON, nullable=True)
    processed_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        Index('idx_sub_events_user', 'user_id', 'processed_at'),
    )


class PriceAlert(Base):
    __tablename__ = "price_alerts"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Target identification
    dealer_name = Column(String(100), nullable=False)
    script_name = Column(String(200), nullable=False)

    # Alert configuration
    condition = Column(String(10), nullable=False)  # "above" | "below"
    rate_type = Column(String(10), nullable=False)  # "buy" | "sell"
    threshold = Column(Float, nullable=False)

    # Lifecycle
    is_active = Column(Boolean, nullable=False, default=True)
    trigger_mode = Column(String(20), nullable=False, default="one_shot")  # "one_shot" | "persistent"
    cooldown_minutes = Column(Integer, nullable=False, default=30)

    # Trigger tracking
    last_triggered_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationship
    user = relationship("User", back_populates="alerts")

    __table_args__ = (
        Index("idx_alerts_dealer_script", "dealer_name", "script_name"),
        Index("idx_alerts_user_active", "user_id", "is_active"),
        CheckConstraint("condition IN ('above', 'below')", name="ck_alert_condition"),
        CheckConstraint("rate_type IN ('buy', 'sell')", name="ck_alert_rate_type"),
        CheckConstraint("trigger_mode IN ('one_shot', 'persistent')", name="ck_alert_trigger_mode"),
        CheckConstraint("threshold > 0", name="ck_alert_threshold_positive"),
        CheckConstraint("cooldown_minutes >= 5 AND cooldown_minutes <= 10080", name="ck_alert_cooldown_range"),
    )


class UserFormula(Base):
    __tablename__ = "user_formulas"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    ast = Column(JSON, nullable=False)  # Serialized formula AST tree

    order_index = Column(Integer, nullable=False, default=0)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="formulas")

    __table_args__ = (
        Index("idx_formulas_user_order", "user_id", "order_index"),
        CheckConstraint("length(name) >= 1", name="ck_formula_name_nonempty"),
    )


class DealerMetadata(Base):
    __tablename__ = "dealer_metadata"

    dealer_id = Column(String(100), primary_key=True)
    name = Column(String(200), nullable=True)
    website = Column(String(500), nullable=True)
    logo_url = Column(Text, nullable=True)
    city = Column(String(100), nullable=True)
    state = Column(String(100), nullable=True)
    address = Column(Text, nullable=True)
    emails = Column(JSON, nullable=False, default=list)
    phones = Column(JSON, nullable=False, default=list)
    whatsapp = Column(String(20), nullable=True)
    social_links = Column(JSON, nullable=False, default=dict)
    scraped_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("idx_dealer_metadata_city", "city"),
        Index("idx_dealer_metadata_state", "state"),
    )


class AgentQueryLog(Base):
    __tablename__ = "agent_query_logs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    session_id = Column(String(36), nullable=False, index=True)
    message = Column(Text, nullable=False)
    response_summary = Column(Text, nullable=True)
    tools_called = Column(JSON, nullable=True)
    credits_used = Column(Float, nullable=False, default=0.0)
    latency_ms = Column(Integer, nullable=True)
    error = Column(Text, nullable=True)
    input_tokens = Column(Integer, nullable=True)
    output_tokens = Column(Integer, nullable=True)
    total_tokens = Column(Integer, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        Index("idx_agent_logs_user", "user_id", "created_at"),
        Index("idx_agent_logs_session", "session_id"),
    )


class OnboardingEvent(Base):
    __tablename__ = "onboarding_events"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    step = Column(String(50), nullable=False)
    event_type = Column(String(20), nullable=False)
    event_data = Column("metadata", JSON, nullable=True)  # 'metadata' is reserved by SQLAlchemy
    occurred_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        Index("idx_onboarding_user_step", "user_id", "step"),
        Index("idx_onboarding_occurred", "occurred_at"),
    )


class NewsArticle(Base):
    __tablename__ = "news_articles"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(Text, nullable=False)
    summary = Column(Text)
    source = Column(String(50), nullable=False)
    source_url = Column(Text, nullable=False, unique=True)
    author = Column(String(200))
    published_at = Column(DateTime, nullable=False)
    scraped_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    image_url = Column(Text)

    tag_commodity = Column(String(50))
    tag_topic = Column(String(50))
    tag_geography = Column(String(50))
    tag_sentiment = Column(String(10))

    __table_args__ = (
        Index("idx_news_published_at", "published_at"),
        Index("idx_news_commodity", "tag_commodity", "published_at"),
        Index("idx_news_topic", "tag_topic", "published_at"),
        Index("idx_news_geography", "tag_geography", "published_at"),
        Index("idx_news_source", "source", "published_at"),
        Index("idx_news_sentiment", "tag_sentiment", "published_at"),
    )


class PlatformSettings(Base):
    __tablename__ = "platform_settings"

    key = Column(Text, primary_key=True)
    value = Column(Text, nullable=False)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)