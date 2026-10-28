import 'react-native-gesture-handler';
import './global.css';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { RecipientScreen } from './src/RecipientScreen';
import { DonorScreen } from './src/DonorScreen';
import { AuthProvider, useAuth } from './src/AuthContext';
import { AuthScreen } from './src/AuthScreen';
import { StripeProvider } from './src/stripeAdapter';
import { AdminReviewScreen } from './src/AdminReviewScreen';
import { ProfileScreen } from './src/ProfileScreen';
import { OfflineDemoScreen } from './src/OfflineDemoScreen';

const stripePublishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;

function SignedInApp() {
  const auth = useAuth();
  const [tab, setTab] = useState<'main' | 'profile'>('main');
  if (auth.loading) return <ActivityIndicator style={{ flex: 1 }} />;
  if (!auth.user) return <AuthScreen />;
  const mainLabel = auth.user.role === 'recipient' ? 'Need Help' : auth.user.role === 'donor' ? 'Give Help' : 'Admin Review';
  return <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider><BottomSheetModalProvider><SafeAreaView className="flex-1 bg-canvas">
      <StatusBar style="dark" />
      <View className="flex-row items-center justify-between border-b border-line bg-canvas px-5 py-3">
        <View className="flex-row items-center"><View className="h-9 w-9 items-center justify-center rounded-xl bg-pine-dark"><Text className="text-sm font-black text-white">or.</Text></View><View className="ml-3"><Text className="text-xs font-black tracking-widest text-ink">OPEN RELIEF</Text><Text className="text-[10px] font-medium tracking-wide text-muted">DIRECT-TO-CREDITOR AID</Text></View></View>
        <View className="rounded-full border border-line bg-white px-3 py-1.5"><Text className="text-xs font-bold capitalize text-pine">{auth.user.role} · demo</Text></View>
      </View>
      {tab === 'profile' ? <ProfileScreen /> : auth.user.role === 'recipient' ? <RecipientScreen /> : auth.user.role === 'donor' ? <DonorScreen /> : <AdminReviewScreen />}
      <View className="flex-row border-t border-line bg-white px-3 pb-1 pt-2">
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === 'main' }} onPress={() => setTab('main')} className={`flex-1 items-center rounded-2xl p-3 ${tab === 'main' ? 'bg-mint' : 'bg-white'}`}><Text className={`text-sm font-bold ${tab === 'main' ? 'text-pine-dark' : 'text-muted'}`}>{mainLabel}</Text></Pressable>
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === 'profile' }} onPress={() => setTab('profile')} className={`flex-1 items-center rounded-2xl p-3 ${tab === 'profile' ? 'bg-mint' : 'bg-white'}`}><Text className={`text-sm font-bold ${tab === 'profile' ? 'text-pine-dark' : 'text-muted'}`}>Profile</Text></Pressable>
      </View>
    </SafeAreaView></BottomSheetModalProvider></SafeAreaProvider>
  </GestureHandlerRootView>;
}

export default function App() {
  if (process.env.EXPO_PUBLIC_OFFLINE_DEMO === '1') return <GestureHandlerRootView style={{ flex: 1 }}><SafeAreaProvider><BottomSheetModalProvider><SafeAreaView className="flex-1 bg-canvas"><StatusBar style="dark" /><OfflineDemoScreen /></SafeAreaView></BottomSheetModalProvider></SafeAreaProvider></GestureHandlerRootView>;
  const content = <AuthProvider><SignedInApp /></AuthProvider>;
  return stripePublishableKey?.startsWith('pk_test_')
    ? <StripeProvider publishableKey={stripePublishableKey}>{content}</StripeProvider>
    : content;
}
