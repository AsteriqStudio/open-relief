import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from './AuthContext';
import { BrandHeader, COLORS, PrimaryButton, ScreenBackdrop } from './design';

function FormField({ label, value, onChangeText, ...input }: TextInputProps & { label: string; value: string; onChangeText(value: string): void }) {
  const [focused, setFocused] = useState(false);
  return <View className="mt-5"><Text className="mb-2 text-xs font-semibold text-muted">{label}</Text>
    <TextInput {...input} value={value} onChangeText={onChangeText} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} placeholderTextColor="#66766E" selectionColor={COLORS.emerald} className={`min-h-14 rounded-2xl border bg-inset px-4 text-base text-ink ${focused ? 'border-pine' : 'border-line'}`} />
  </View>;
}

export function AuthScreen() {
  const auth = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [role, setRole] = useState<'recipient' | 'donor'>('donor');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [legalName, setLegalName] = useState('');
  const [assistanceProgram, setAssistanceProgram] = useState<'SNAP' | 'MEDICAID' | 'LIHEAP' | 'NONE'>('NONE');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signin') await auth.signIn({ email, password });
      else await auth.signUp({ email, password, phone, role, ...(role === 'recipient' ? { legalName, assistanceProgram } : {}) });
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Authentication failed'); }
    finally { setBusy(false); }
  }

  return <Modal visible animationType="slide" presentationStyle="fullScreen"><SafeAreaProvider><ScreenBackdrop><SafeAreaView className="flex-1">
    <StatusBar style="light" backgroundColor={COLORS.backdrop} />
    <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 44 }} keyboardShouldPersistTaps="handled">
      <BrandHeader mode="sandbox" />
      <View className="mt-12"><Text className="text-[11px] font-bold tracking-[2px] text-pine">PURPOSE BUILT FOR RELIEF</Text>
        <Text className="mt-4 text-4xl font-black leading-[45px] tracking-tight text-ink">Direct-to-creditor{"\n"}bill relief.</Text>
        <Text className="mt-4 text-sm leading-6 text-muted">Reviewed utility and essential bills. Sandbox payments are directed to demo creditor accounts, never to recipients.</Text>
      </View>
      <View className="mt-9 rounded-[28px] border border-line bg-surface p-5">
        <Text className="text-[11px] font-bold tracking-widest text-pine">{mode === 'signin' ? 'WELCOME BACK' : 'CREATE ACCOUNT'}</Text>
        <Text className="mt-2 text-2xl font-bold tracking-tight text-ink">{mode === 'signin' ? 'Sign in securely' : 'Choose your path'}</Text>
        {mode === 'signup' && <View className="mt-6 flex-row rounded-2xl border border-line bg-inset p-1">{(['recipient', 'donor'] as const).map((option) => <Pressable key={option} accessibilityRole="tab" accessibilityState={{ selected: role === option }} onPress={() => setRole(option)} className={`min-h-12 flex-1 items-center justify-center rounded-xl ${role === option ? 'bg-pine' : 'bg-inset'}`}><Text className={`text-sm font-bold ${role === option ? 'text-canvas' : 'text-muted'}`}>{option === 'recipient' ? 'Need Relief' : 'Give Relief'}</Text></Pressable>)}</View>}
        <FormField label="Email address" placeholder="you@example.com" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <FormField label="Password" placeholder="At least 12 characters" value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />
        {mode === 'signup' && <FormField label="Phone number" placeholder="Your phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" />}
        {mode === 'signup' && role === 'recipient' && <>
          <FormField label="Legal name on the bill" placeholder="As printed on the document" value={legalName} onChangeText={setLegalName} autoCapitalize="words" />
          <Text className="mt-6 text-xs font-semibold text-muted">Assistance program · optional</Text>
          <View className="mt-3 flex-row flex-wrap gap-2">{(['NONE', 'SNAP', 'MEDICAID', 'LIHEAP'] as const).map((program) => <Pressable key={program} accessibilityRole="button" onPress={() => setAssistanceProgram(program)} className={`rounded-full border px-3 py-2 ${assistanceProgram === program ? 'border-pine bg-[#103524]' : 'border-line bg-inset'}`}><Text className={`text-xs font-semibold ${assistanceProgram === program ? 'text-mint' : 'text-muted'}`}>{program === 'NONE' ? 'None' : program}</Text></Pressable>)}</View>
        </>}
        {error && <View className="mt-5 rounded-xl border border-[#5C1D1D] bg-[#2B0E0E] p-3"><Text className="text-sm text-coral">{error}</Text></View>}
        <View className="mt-7"><PrimaryButton label={busy ? 'Please wait…' : mode === 'signin' ? 'Sign in  →' : 'Create account  →'} disabled={busy} onPress={() => void submit()} /></View>
        {busy && <ActivityIndicator className="mt-4" color={COLORS.emerald} />}
        <Pressable accessibilityRole="button" onPress={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); }} className="mt-5 min-h-11 justify-center"><Text className="text-center text-sm font-bold text-mint">{mode === 'signin' ? 'New here? Create an account' : 'Already have an account? Sign in'}</Text></Pressable>
      </View>
      <Text className="mt-7 text-center text-[11px] leading-5 text-muted">Sandbox environment · no live financial transactions</Text>
    </ScrollView>
  </SafeAreaView></ScreenBackdrop></SafeAreaProvider></Modal>;
}
