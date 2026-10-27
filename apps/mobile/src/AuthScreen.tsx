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

  return <Modal visible animationType="slide"><ScrollView className="flex-1 bg-slate-50 p-6" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
    <Text className="text-3xl font-bold text-slate-900">open-relief</Text>
    <Text className="mt-2 text-slate-600">{mode === 'signin' ? 'Sign in to continue' : 'Create your account'}</Text>
    {mode === 'signup' && <View className="mt-6 flex-row gap-2">
      <Pressable onPress={() => setRole('recipient')} className={`flex-1 rounded-xl p-3 ${role === 'recipient' ? 'bg-teal-700' : 'bg-slate-200'}`}><Text className={`text-center ${role === 'recipient' ? 'text-white' : 'text-slate-900'}`}>Need Relief</Text></Pressable>
      <Pressable onPress={() => setRole('donor')} className={`flex-1 rounded-xl p-3 ${role === 'donor' ? 'bg-teal-700' : 'bg-slate-200'}`}><Text className={`text-center ${role === 'donor' ? 'text-white' : 'text-slate-900'}`}>Give Relief</Text></Pressable>
    </View>}
    <TextInput className="mt-5 rounded-xl border border-slate-300 bg-white p-4" placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
    <TextInput className="mt-3 rounded-xl border border-slate-300 bg-white p-4" placeholder="Password (at least 12 characters)" secureTextEntry value={password} onChangeText={setPassword} />
    {mode === 'signup' && <TextInput className="mt-3 rounded-xl border border-slate-300 bg-white p-4" placeholder="Phone" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />}
    {mode === 'signup' && role === 'recipient' && <><TextInput className="mt-3 rounded-xl border border-slate-300 bg-white p-4" placeholder="Legal name on your bill" autoCapitalize="words" value={legalName} onChangeText={setLegalName} /><Text className="mt-4 text-sm text-slate-600">Assistance program (optional, self reported)</Text><View className="mt-2 flex-row flex-wrap gap-2">{(['NONE', 'SNAP', 'MEDICAID', 'LIHEAP'] as const).map((program) => <Pressable key={program} onPress={() => setAssistanceProgram(program)} className={`rounded-full px-3 py-2 ${assistanceProgram === program ? 'bg-teal-700' : 'bg-slate-200'}`}><Text className={assistanceProgram === program ? 'text-white' : 'text-slate-700'}>{program === 'NONE' ? 'None' : program}</Text></Pressable>)}</View></>}
    {error && <Text className="mt-3 text-red-700">{error}</Text>}
    <Pressable disabled={busy} onPress={() => void submit()} className="mt-5 rounded-xl bg-teal-700 p-4"><Text className="text-center font-semibold text-white">{mode === 'signin' ? 'Sign In' : 'Sign Up'}</Text></Pressable>
    {busy && <ActivityIndicator className="mt-3" />}
    <Pressable onPress={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); }} className="mt-5"><Text className="text-center text-teal-700">{mode === 'signin' ? 'Create an account' : 'Already have an account? Sign in'}</Text></Pressable>
  </ScrollView></Modal>;
}
