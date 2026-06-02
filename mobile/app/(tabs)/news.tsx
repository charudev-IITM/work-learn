import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { newsService } from '@comp-intel/shared/services/news';
import { getRelativeTime } from '@comp-intel/shared/lib/formatters';
import type { NewsArticle } from '@comp-intel/shared/types/news';

function NewsCard({ article }: { article: NewsArticle }) {
  return (
    <Pressable
      onPress={() => article.sourceUrl && Linking.openURL(article.sourceUrl)}
      className="bg-surface-card rounded-2xl p-4 mb-3 active:opacity-80"
    >
      <Text className="text-white font-semibold text-base leading-5" numberOfLines={2}>
        {article.title}
      </Text>
      {article.summary && (
        <Text className="text-gray-400 text-sm mt-2 leading-5" numberOfLines={3}>
          {article.summary}
        </Text>
      )}
      <View className="flex-row items-center mt-3">
        {article.source && (
          <Text className="text-gold text-xs font-medium">{article.source}</Text>
        )}
        {article.publishedAt && (
          <Text className="text-gray-600 text-xs ml-2">
            {getRelativeTime(article.publishedAt)}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

export default function NewsScreen() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNews = useCallback(async () => {
    try {
      setLoading(true);
      const result = await newsService.getArticles({}, undefined, 30);
      setArticles(result.articles);
    } catch (err) {
      console.error('Failed to fetch news:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchNews(); }, [fetchNews]);

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <View className="px-4 pt-2 pb-3">
        <Text className="text-white text-2xl font-bold">News</Text>
        <Text className="text-gray-500 text-sm mt-1">Gold market updates</Text>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#D4AF37" size="large" />
        </View>
      ) : (
        <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
          {articles.map(article => (
            <NewsCard key={article.id} article={article} />
          ))}
          <View className="h-4" />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
