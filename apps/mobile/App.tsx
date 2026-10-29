import 'react-native-gesture-handler';
import './global.css';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { RecipientScreen } from './src/RecipientScreen';
import { DonorScreen } from './src/DonorScreen';
import { AuthProvider, prepareSandboxSession, useAuth } from './src/AuthContext';
import { AuthScreen } from './src/AuthScreen';
import { StripeProvider } from './src/stripeAdapter';
import { AdminReviewScreen } from './src/AdminReviewScreen';
import { ProfileScreen } from './src/ProfileScreen';
import { OfflineDemoApp } from './src/OfflineDemoApp';
import { getApiBase } from './src/api';
import { SandboxConnectScreen } from './src/SandboxConnectScreen';
import { BrandHeader, COLORS, ScreenBackdrop } from './src/design';

const stripePublishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;

function SignedInApp({ onBackToDemo }: { onBackToDemo?: () => void }) {
  const auth = useAuth();
  const [tab, setTab] = useState<'main' | 'profile'>('main');
  if (auth.loading) return <View className="flex-1 items-center justify-center bg-canvas"><ActivityIndicator color={COLORS.emerald} /></View>;
  if (!auth.user) return <AuthScreen {...(onBackToDemo ? { onBackToDemo } : {})} />;
  const mainLabel = auth.user.role === 'recipient' ? 'Need Help' : auth.user.role === 'donor' ? 'Give Help' : 'Admin Review';
  return <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider><BottomSheetModalProvider><ScreenBackdrop><SafeAreaView className="flex-1">
      <StatusBar style="light" backgroundColor={COLORS.backdrop} />
      <View className="border-b border-line px-5 py-3"><BrandHeader mode="sandbox" subtitle={`${auth.user.role} account · direct creditor aid`} /></View>
      {tab === 'profile' ? <ProfileScreen {...(onBackToDemo ? { onBackToDemo } : {})} /> : auth.user.role === 'recipient' ? <RecipientScreen /> : auth.user.role === 'donor' ? <DonorScreen /> : <AdminReviewScreen />}
      <View className="flex-row border-t border-line bg-surface px-3 pb-1 pt-2">
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === 'main' }} onPress={() => setTab('main')} className={`flex-1 items-center rounded-full p-3 ${tab === 'main' ? 'bg-pine' : 'bg-surface'}`}><Text className={`text-sm font-bold ${tab === 'main' ? 'text-canvas' : 'text-muted'}`}>{mainLabel}</Text></Pressable>
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === 'profile' }} onPress={() => setTab('profile')} className={`flex-1 items-center rounded-full p-3 ${tab === 'profile' ? 'bg-pine' : 'bg-surface'}`}><Text className={`text-sm font-bold ${tab === 'profile' ? 'text-canvas' : 'text-muted'}`}>Profile</Text></Pressable>
      </View>
    </SafeAreaView></ScreenBackdrop></BottomSheetModalProvider></SafeAreaProvider>
  </GestureHandlerRootView>;
}

export default function App() {
  const [mode, setMode] = useState<'offline' | 'connect' | 'connected' | 'starting'>(process.env.EXPO_PUBLIC_OFFLINE_DEMO === '1' ? 'offline' : 'starting');
  useEffect(() => {
    if (mode !== 'starting') return;
    let active = true;
    void prepareSandboxSession(getApiBase()).then(() => { if (active) setMode('connected'); }).catch(() => { if (active) setMode('connect'); });
    return () => { active = false; };
  }, [mode]);
  function returnToDemo() { setMode('offline'); }
  if (mode === 'starting') return <View className="flex-1 items-center justify-center bg-canvas"><ActivityIndicator color={COLORS.emerald} /></View>;
  if (mode !== 'connected') return <GestureHandlerRootView style={{ flex: 1 }}><SafeAreaProvider><BottomSheetModalProvider><ScreenBackdrop><SafeAreaView className="flex-1"><StatusBar style="light" backgroundColor={COLORS.backdrop} />
    {mode === 'offline' ? <OfflineDemoApp onConnectSandbox={() => setMode('connect')} /> : <SandboxConnectScreen onBack={() => setMode('offline')} onConnected={async (apiUrl) => { await prepareSandboxSession(apiUrl); setMode('connected'); }} />}
  </SafeAreaView></ScreenBackdrop></BottomSheetModalProvider></SafeAreaProvider></GestureHandlerRootView>;
  const content = <AuthProvider><SignedInApp onBackToDemo={returnToDemo} /></AuthProvider>;
  return stripePublishableKey?.startsWith('pk_test_')
    ? <StripeProvider publishableKey={stripePublishableKey}>{content}</StripeProvider>
    : content;
}
