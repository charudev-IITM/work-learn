-- News Articles feature migration
-- Run once against existing database

CREATE TABLE IF NOT EXISTS news_articles (
    id              VARCHAR PRIMARY KEY,
    title           TEXT NOT NULL,
    summary         TEXT,
    source          VARCHAR(50) NOT NULL,
    source_url      TEXT NOT NULL UNIQUE,
    author          VARCHAR(200),
    published_at    TIMESTAMP NOT NULL,
    scraped_at      TIMESTAMP NOT NULL DEFAULT NOW(),

    tag_commodity   VARCHAR(50),
    tag_topic       VARCHAR(50),
    tag_geography   VARCHAR(50),
    tag_sentiment   VARCHAR(10)
);

-- Feed listing: order by recency
CREATE INDEX IF NOT EXISTS idx_news_published_at
    ON news_articles (published_at DESC);

-- Filter by tag + recency
CREATE INDEX IF NOT EXISTS idx_news_commodity
    ON news_articles (tag_commodity, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_news_topic
    ON news_articles (tag_topic, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_news_geography
    ON news_articles (tag_geography, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_news_source
    ON news_articles (source, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_news_sentiment
    ON news_articles (tag_sentiment, published_at DESC);
