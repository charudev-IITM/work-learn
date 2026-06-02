import { useState, useEffect, useCallback, useRef } from 'react'
import { newsService } from '@comp-intel/shared/services/news'
import { NewsArticle } from '@comp-intel/shared/types/news'

export interface DashboardNewsData {
  articles: NewsArticle[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useDashboardNews(): DashboardNewsData {
  const [articles, setArticles] = useState<NewsArticle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const fetchNews = useCallback(async () => {
    try {
      setError(null)
      const result = await newsService.getArticles({}, undefined, 3)
      if (mountedRef.current) setArticles(result.articles)
    } catch (err: any) {
      if (mountedRef.current) setError(err.message || 'Failed to load news')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => { fetchNews() }, [fetchNews])

  return { articles, loading, error, refetch: fetchNews }
}
