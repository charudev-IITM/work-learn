import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../src/contexts/AuthContext';
import { useWatchlistDataContext } from '../../src/contexts/WatchlistDataContext';
import { useWatchlist } from '../../src/contexts/WatchlistContext';
import { getUserInitials } from '@comp-intel/shared/lib/getUserInitials';

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between py-4 border-b border-gray-800">
      <Text className="text-gray-500 text-sm">{label}</Text>
      <Text className="text-white text-sm font-medium">{value}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const { isConnected, competitors } = useWatchlistDataContext();
  const { watchlists } = useWatchlist();
  const initials = getUserInitials({ name: user?.name, username: user?.username || '?' });

  const handleLogout = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    await logout();
  };

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
        {/* Avatar + Name */}
        <View className="items-center pt-8 pb-6">
          <View className="w-20 h-20 rounded-full bg-gold items-center justify-center">
            <Text className="text-black text-2xl font-bold">{initials}</Text>
          </View>
          <Text className="text-white text-xl font-semibold mt-4">
            {user?.name || user?.username}
          </Text>
          {user?.business && (
            <Text className="text-gray-400 text-sm mt-1">{user.business}</Text>
          )}
        </View>

        {/* Account info */}
        <View className="bg-surface-card rounded-2xl px-4 mb-6">
          {user?.phone && <InfoRow label="Phone" value={user.phone} />}
          {user?.business && <InfoRow label="Business" value={user.business} />}
          <InfoRow label="Watchlists" value={String(watchlists.length)} />
          <InfoRow label="Dealers Tracked" value={String(competitors.length)} />
          <InfoRow
            label="Connection"
            value={isConnected ? 'Live' : 'Offline'}
          />
        </View>

        {/* Sign out */}
        <Pressable
          onPress={handleLogout}
          className="bg-surface-card rounded-2xl py-4 items-center active:opacity-70"
        >
          <Text className="text-red-500 text-base font-semibold">Sign Out</Text>
        </Pressable>

        <View className="h-8" />
      </ScrollView>
    </SafeAreaView>
  );
}
