import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Slot } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';
import '../global.css';

// Initialize shared API client (must be before any shared service import)
import '../src/services/auth';

import { useColorScheme } from '@/components/useColorScheme';
import { AuthProvider } from '../src/contexts/AuthContext';
import { WatchlistDataProvider } from '../src/contexts/WatchlistDataContext';
import { WatchlistProvider } from '../src/contexts/WatchlistContext';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) return null;

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <WatchlistDataProvider>
          <WatchlistProvider>
            <Slot />
          </WatchlistProvider>
        </WatchlistDataProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
