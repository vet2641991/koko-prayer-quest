import { Baloo2_500Medium, Baloo2_700Bold, Baloo2_800ExtraBold } from '@expo-google-fonts/baloo-2';
import { NotoNaskhArabic_400Regular, NotoNaskhArabic_700Bold } from '@expo-google-fonts/noto-naskh-arabic';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initAudio } from '../audio/sound';
import { ProgressProvider } from '../state/progress';
import { C } from '../theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [loaded, error] = useFonts({ Baloo2_500Medium, Baloo2_700Bold, Baloo2_800ExtraBold, NotoNaskhArabic_400Regular, NotoNaskhArabic_700Bold });
  useEffect(() => { void initAudio(); }, []);
  useEffect(() => { if (loaded || error) SplashScreen.hideAsync().catch(() => {}); }, [loaded, error]);
  if (!loaded && !error) return null;
  return <SafeAreaProvider>
    <ProgressProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.blue }, animation: 'slide_from_right' }} />
    </ProgressProvider>
  </SafeAreaProvider>;
}
