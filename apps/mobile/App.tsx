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
import { StripeProvider } from '@stripe/stripe-react-native';

const stripePublishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;

function SignedInApp() {
  const auth = useAuth();
  const [tab, setTab] = useState<'need' | 'give'>('give');
  if (auth.loading) return <ActivityIndicator style={{ flex: 1 }} />;
  if (!auth.user) return <AuthScreen />;
  const activeTab = auth.user.role === 'recipient' ? 'need' : auth.user.role === 'donor' ? 'give' : tab;
  return <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider><BottomSheetModalProvider><SafeAreaView className="flex-1 bg-slate-50">
      <StatusBar style="dark" />
      <View className="flex-row items-center justify-between px-5 py-2"><Text className="text-slate-600">{auth.user.email}</Text><Pressable onPress={() => void auth.signOut()}><Text className="font-semibold text-teal-700">Sign out</Text></Pressable></View>
      {activeTab === 'need' ? <RecipientScreen /> : <DonorScreen />}
      <View className="flex-row border-t border-slate-200 bg-white">
        <Pressable disabled={auth.user.role === 'donor'} onPress={() => setTab('need')} className="flex-1 p-4"><Text className={`text-center font-semibold ${activeTab === 'need' ? 'text-teal-700' : 'text-slate-500'}`}>Need Help</Text></Pressable>
        <Pressable disabled={auth.user.role === 'recipient'} onPress={() => setTab('give')} className="flex-1 p-4"><Text className={`text-center font-semibold ${activeTab === 'give' ? 'text-teal-700' : 'text-slate-500'}`}>Give Help</Text></Pressable>
      </View>
    </SafeAreaView></BottomSheetModalProvider></SafeAreaProvider>
  </GestureHandlerRootView>;
}

export default function App() {
  const content = <AuthProvider><SignedInApp /></AuthProvider>;
  return stripePublishableKey?.startsWith('pk_test_')
    ? <StripeProvider publishableKey={stripePublishableKey}>{content}</StripeProvider>
    : content;
}
