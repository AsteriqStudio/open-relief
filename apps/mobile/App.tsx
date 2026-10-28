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
import { AdminReviewScreen } from './src/AdminReviewScreen';
import { ProfileScreen } from './src/ProfileScreen';

const stripePublishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;

function SignedInApp() {
  const auth = useAuth();
  const [tab, setTab] = useState<'main' | 'profile'>('main');
  if (auth.loading) return <ActivityIndicator style={{ flex: 1 }} />;
  if (!auth.user) return <AuthScreen />;
  const mainLabel = auth.user.role === 'recipient' ? 'Need Help' : auth.user.role === 'donor' ? 'Give Help' : 'Admin Review';
  return <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider><BottomSheetModalProvider><SafeAreaView className="flex-1 bg-slate-50">
      <StatusBar style="dark" />
      <View className="flex-row items-center justify-between px-5 py-2"><Text className="text-slate-600">{auth.user.email}</Text><Text className="font-semibold capitalize text-teal-700">{auth.user.role}</Text></View>
      {tab === 'profile' ? <ProfileScreen /> : auth.user.role === 'recipient' ? <RecipientScreen /> : auth.user.role === 'donor' ? <DonorScreen /> : <AdminReviewScreen />}
      <View className="flex-row border-t border-slate-200 bg-white">
        <Pressable onPress={() => setTab('main')} className="flex-1 p-4"><Text className={`text-center font-semibold ${tab === 'main' ? 'text-teal-700' : 'text-slate-500'}`}>{mainLabel}</Text></Pressable>
        <Pressable onPress={() => setTab('profile')} className="flex-1 p-4"><Text className={`text-center font-semibold ${tab === 'profile' ? 'text-teal-700' : 'text-slate-500'}`}>Profile</Text></Pressable>
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
