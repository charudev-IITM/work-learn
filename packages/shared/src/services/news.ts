import { getApiClient } from './apiClient';
import { NewsArticle, NewsFilters, NewsListResponse, NewsTagOptions } from '../types/news';

function convertArticle(raw: any): NewsArticle {
  return {
    id: raw.id,
    title: raw.title,
    summary: raw.summary,
    source: raw.source,
    sourceUrl: raw.source_url,
    author: raw.author,
    publishedAt: raw.published_at,
    scrapedAt: raw.scraped_at,
    imageUrl: raw.image_url,
    tagCommodity: raw.tag_commodity,
    tagTopic: raw.tag_topic,
    tagGeography: raw.tag_geography,
    tagSentiment: raw.tag_sentiment,
  };
}

export const newsService = {
  async getArticles(
    filters: Partial<NewsFilters>,
    cursor?: string,
    limit = 20,
  ): Promise<NewsListResponse> {
    const api = getApiClient();
    const params: Record<string, any> = { limit };
    if (filters.commodity) params.commodity = filters.commodity;
    if (filters.topic) params.topic = filters.topic;
    if (filters.geography) params.geography = filters.geography;
    if (filters.sentiment) params.sentiment = filters.sentiment;
    if (filters.source) params.source = filters.source;
    if (cursor) params.cursor = cursor;

    const resp = await api.get('/api/news', { params });
    return {
      articles: resp.data.articles.map(convertArticle),
      nextCursor: resp.data.next_cursor,
      hasMore: resp.data.has_more,
    };
  },

  async searchArticles(
    query: string,
    filters?: Partial<NewsFilters>,
    limit = 20,
    offset = 0,
  ): Promise<{ hits: NewsArticle[]; totalHits: number }> {
    const api = getApiClient();
    const params: Record<string, any> = { q: query, limit, offset };
    if (filters?.commodity) params.commodity = filters.commodity;
    if (filters?.source) params.source = filters.source;
    const resp = await api.get('/api/news/search', { params });
    return {
      hits: resp.data.hits.map(convertArticle),
      totalHits: resp.data.total_hits,
    };
  },

  async getTagOptions(): Promise<NewsTagOptions> {
    const api = getApiClient();
    const resp = await api.get('/api/news/tags');
    return resp.data;
  },
};
