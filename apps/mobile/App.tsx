import 'react-native-gesture-handler';
import './global.css';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { RecipientScreen } from './src/RecipientScreen';
import { DonorScreen } from './src/DonorScreen';

export default function App() {
  const [tab, setTab] = useState<'need' | 'give'>('give');
  return <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider><BottomSheetModalProvider><SafeAreaView className="flex-1 bg-slate-50">
      <StatusBar style="dark" />
      {tab === 'need' ? <RecipientScreen /> : <DonorScreen />}
      <View className="flex-row border-t border-slate-200 bg-white">
        <Pressable onPress={() => setTab('need')} className="flex-1 p-4"><Text className={`text-center font-semibold ${tab === 'need' ? 'text-teal-700' : 'text-slate-500'}`}>Need Help</Text></Pressable>
        <Pressable onPress={() => setTab('give')} className="flex-1 p-4"><Text className={`text-center font-semibold ${tab === 'give' ? 'text-teal-700' : 'text-slate-500'}`}>Give Help</Text></Pressable>
      </View>
    </SafeAreaView></BottomSheetModalProvider></SafeAreaProvider>
  </GestureHandlerRootView>;
}
