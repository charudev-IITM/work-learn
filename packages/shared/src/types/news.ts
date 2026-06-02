export interface NewsArticle {
  id: string;
  title: string;
  summary: string | null;
  source: 'reuters' | 'moneycontrol';
  sourceUrl: string;
  author: string | null;
  publishedAt: string;
  scrapedAt: string;
  imageUrl: string | null;
  tagCommodity: string | null;
  tagTopic: string | null;
  tagGeography: string | null;
  tagSentiment: 'Bullish' | 'Bearish' | 'Neutral' | null;
}

export interface NewsFilters {
  commodity: string | null;
  topic: string | null;
  geography: string | null;
  sentiment: string | null;
  source: string | null;
}

export interface NewsListResponse {
  articles: NewsArticle[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface NewsTagOptions {
  commodities: string[];
  topics: string[];
  geographies: string[];
  sentiments: string[];
  sources: string[];
}
