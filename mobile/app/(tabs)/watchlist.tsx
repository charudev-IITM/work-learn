import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useWatchlist } from '../../src/contexts/WatchlistContext';
import { useWatchlistDataContext } from '../../src/contexts/WatchlistDataContext';
import { getRate } from '@comp-intel/shared/stores/rateStore';
import { formatCurrency } from '@comp-intel/shared/lib/formatters';
import { useWatchlistRates } from '../../src/hooks/useWatchlistRates';
import type { WatchlistScript } from '@comp-intel/shared/types/watchlist';

function RateCard({ script }: { script: WatchlistScript }) {
  const rate = getRate(script.dealerName, script.scriptName);
  const buyRate = rate?.buy_rate;
  const sellRate = rate?.sell_rate;

  return (
    <View className="bg-surface-card rounded-2xl p-4 mb-3">
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-1">
          <Text className="text-white font-semibold text-base" numberOfLines={1}>
            {script.scriptDisplayName || script.scriptName}
          </Text>
          <Text className="text-gray-500 text-xs mt-0.5">
            {script.dealerName}
          </Text>
        </View>
        <View className="bg-surface-elevated px-2.5 py-1 rounded-full">
          <Text className="text-gray-400 text-xs">{script.productType}</Text>
        </View>
      </View>

      <View className="flex-row mt-2">
        <View className="flex-1">
          <Text className="text-gray-500 text-xs mb-1">BUY</Text>
          <Text className="text-green-400 text-lg font-bold">
            {buyRate ? formatCurrency(buyRate) : '—'}
          </Text>
        </View>
        <View className="flex-1 items-end">
          <Text className="text-gray-500 text-xs mb-1">SELL</Text>
          <Text className="text-red-400 text-lg font-bold">
            {sellRate ? formatCurrency(sellRate) : '—'}
          </Text>
        </View>
      </View>
    </View>
  );
}

function WatchlistTabs() {
  const { watchlists, currentWatchlistId, setCurrentWatchlist } = useWatchlist();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="mb-4"
      contentContainerStyle={{ paddingHorizontal: 16 }}
    >
      {watchlists.map(w => {
        const isActive = w.id === currentWatchlistId;
        return (
          <Pressable
            key={w.id}
            onPress={() => setCurrentWatchlist(w.id)}
            className={`mr-3 px-4 py-2 rounded-full ${isActive ? 'bg-gold' : 'bg-surface-card'}`}
          >
            <Text className={`text-sm font-medium ${isActive ? 'text-black' : 'text-gray-400'}`}>
              {w.name} ({w.scripts.length})
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export default function WatchlistScreen() {
  const { currentWatchlist, isLoading } = useWatchlist();
  const { isConnected } = useWatchlistDataContext();
  const scripts = currentWatchlist?.scripts || [];

  // Subscribe to rate updates for scripts in this watchlist
  useWatchlistRates(scripts);

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-surface items-center justify-center">
        <ActivityIndicator color="#D4AF37" size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface">
      {/* Header */}
      <View className="px-4 pt-2 pb-3 flex-row items-center justify-between">
        <Text className="text-white text-2xl font-bold">Watchlist</Text>
        <View className="flex-row items-center">
          <View className={`w-2 h-2 rounded-full mr-1.5 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <Text className="text-gray-500 text-xs">{isConnected ? 'Live' : 'Offline'}</Text>
        </View>
      </View>

      {/* Watchlist tabs */}
      <WatchlistTabs />

      {/* Rate cards */}
      <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
        {scripts.length === 0 ? (
          <View className="items-center justify-center py-20">
            <Text className="text-gray-500 text-base">No scripts in this watchlist</Text>
            <Text className="text-gray-600 text-sm mt-2">Add scripts from the search</Text>
          </View>
        ) : (
          scripts.map(script => <RateCard key={script.id} script={script} />)
        )}
        <View className="h-4" />
      </ScrollView>
    </SafeAreaView>
  );
}
