import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/contexts/AuthContext';
import { useWatchlistDataContext } from '../../src/contexts/WatchlistDataContext';
import { useWatchlist } from '../../src/contexts/WatchlistContext';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View className="bg-surface-card rounded-2xl p-4 flex-1">
      <Text className="text-gray-500 text-xs mb-1">{label}</Text>
      <Text className={`text-xl font-bold ${color}`}>{value}</Text>
    </View>
  );
}

export default function HomeScreen() {
  const { user } = useAuth();
  const { isConnected, competitors } = useWatchlistDataContext();
  const { watchlists } = useWatchlist();

  const totalScripts = watchlists.reduce((sum, w) => sum + w.scripts.length, 0);

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
        {/* Greeting */}
        <View className="pt-2 pb-6">
          <Text className="text-gray-500 text-sm">{getGreeting()}</Text>
          <Text className="text-white text-2xl font-bold mt-1">
            {user?.name || user?.username}
          </Text>
        </View>

        {/* Connection status */}
        <View className="flex-row items-center mb-6">
          <View className={`w-2.5 h-2.5 rounded-full mr-2 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <Text className="text-gray-400 text-sm">
            {isConnected ? 'Live rates connected' : 'Connecting...'}
          </Text>
        </View>

        {/* Stats */}
        <View className="flex-row gap-3 mb-6">
          <StatCard label="Dealers" value={String(competitors.length)} color="text-gold" />
          <StatCard label="Watchlists" value={String(watchlists.length)} color="text-blue-400" />
          <StatCard label="Scripts" value={String(totalScripts)} color="text-purple-400" />
        </View>

        {/* Quick watchlist summary */}
        <Text className="text-white text-lg font-semibold mb-3">Your Watchlists</Text>
        {watchlists.map(w => (
          <View key={w.id} className="bg-surface-card rounded-2xl p-4 mb-3">
            <View className="flex-row items-center justify-between">
              <Text className="text-white font-medium text-base">{w.name}</Text>
              <View className="bg-surface-elevated px-3 py-1 rounded-full">
                <Text className="text-gray-400 text-xs">{w.scripts.length} scripts</Text>
              </View>
            </View>
          </View>
        ))}

        <View className="h-8" />
      </ScrollView>
    </SafeAreaView>
  );
}
