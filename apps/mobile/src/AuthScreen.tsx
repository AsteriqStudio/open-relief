import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useAuth } from './AuthContext';

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
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Authentication failed');
    } finally { setBusy(false); }
  }

  return <Modal visible animationType="slide"><ScrollView className="flex-1 bg-canvas" contentContainerStyle={{ paddingBottom: 40 }}>
    <View className="relative overflow-hidden rounded-b-3xl bg-pine-dark px-6 pb-8 pt-12">
      <View className="absolute -right-16 -top-20 h-64 w-64 rounded-full border border-white/10" />
      <View className="h-12 w-12 items-center justify-center rounded-2xl bg-mint"><Text className="text-lg font-black text-pine-dark">or.</Text></View>
      <Text className="mt-6 text-[11px] font-black tracking-[3px] text-mint">OPEN RELIEF  /  SANDBOX</Text>
      <Text className="mt-3 text-4xl font-black leading-[46px] text-white">A bill paid.{"\n"}A little room to breathe.</Text>
      <Text className="mt-4 text-sm leading-6 text-white/80">A direct way to help with overdue bills. Payments go to demo creditors, never to recipients.</Text>
    </View>
    <View className="-mt-5 mx-5 rounded-3xl border border-line bg-white p-6 shadow-lg">
      <Text className="text-[11px] font-bold tracking-widest text-pine">{mode === 'signin' ? 'WELCOME BACK' : 'GET STARTED'}</Text>
      <Text className="mt-2 text-2xl font-black text-ink">{mode === 'signin' ? 'Sign in to continue' : 'Create your account'}</Text>
      {mode === 'signin' && <Text className="mt-2 text-xs leading-5 text-muted">Admin accounts are created locally and sign in here.</Text>}
      {mode === 'signup' && <View className="mt-5 flex-row gap-2"><Pressable onPress={() => setRole('recipient')} className={`min-h-12 flex-1 items-center justify-center rounded-xl ${role === 'recipient' ? 'bg-pine-dark' : 'bg-canvas'}`}><Text className={`font-bold ${role === 'recipient' ? 'text-white' : 'text-ink'}`}>Need Relief</Text></Pressable><Pressable onPress={() => setRole('donor')} className={`min-h-12 flex-1 items-center justify-center rounded-xl ${role === 'donor' ? 'bg-pine-dark' : 'bg-canvas'}`}><Text className={`font-bold ${role === 'donor' ? 'text-white' : 'text-ink'}`}>Give Relief</Text></Pressable></View>}
      <Text className="mt-6 text-xs font-bold text-muted">Email address</Text>
      <TextInput className="mt-2 rounded-xl border border-line bg-canvas p-4 text-base text-ink" placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <Text className="mt-4 text-xs font-bold text-muted">Password</Text>
      <TextInput className="mt-2 rounded-xl border border-line bg-canvas p-4 text-base text-ink" placeholder="Password (at least 12 characters)" secureTextEntry value={password} onChangeText={setPassword} />
      {mode === 'signup' && <><Text className="mt-4 text-xs font-bold text-muted">Phone</Text><TextInput className="mt-2 rounded-xl border border-line bg-canvas p-4 text-base text-ink" placeholder="Phone" keyboardType="phone-pad" value={phone} onChangeText={setPhone} /></>}
      {mode === 'signup' && role === 'recipient' && <><Text className="mt-4 text-xs font-bold text-muted">Legal name on the bill</Text><TextInput className="mt-2 rounded-xl border border-line bg-canvas p-4 text-base text-ink" placeholder="Legal name on your bill" autoCapitalize="words" value={legalName} onChangeText={setLegalName} /><Text className="mt-4 text-sm text-muted">Assistance program (optional, self reported)</Text><View className="mt-2 flex-row flex-wrap gap-2">{(['NONE', 'SNAP', 'MEDICAID', 'LIHEAP'] as const).map((program) => <Pressable key={program} onPress={() => setAssistanceProgram(program)} className={`rounded-full px-3 py-2 ${assistanceProgram === program ? 'bg-pine' : 'bg-canvas'}`}><Text className={assistanceProgram === program ? 'text-white' : 'text-ink'}>{program === 'NONE' ? 'None' : program}</Text></Pressable>)}</View></>}
      {error && <Text className="mt-4 text-sm text-red-700">{error}</Text>}
      <Pressable disabled={busy} onPress={() => void submit()} className="mt-6 min-h-14 items-center justify-center rounded-xl bg-pine"><Text className="text-base font-black text-white">{mode === 'signin' ? 'Sign In' : 'Sign Up'}</Text></Pressable>
      {busy && <ActivityIndicator className="mt-3" color="#176B5D" />}
      <Pressable onPress={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); }} className="mt-5 p-2"><Text className="text-center font-bold text-pine">{mode === 'signin' ? 'Create an account' : 'Already have an account? Sign in'}</Text></Pressable>
    </View>
    <Text className="mx-8 mt-6 text-center text-xs leading-5 text-muted">Built for dignity, transparency, and direct creditor relief.</Text>
  </ScrollView></Modal>;
}
