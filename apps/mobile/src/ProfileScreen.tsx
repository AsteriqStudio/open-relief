import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useAuth } from './AuthContext';

const personaRoles = ['recipient', 'donor', 'admin'] as const;

export function ProfileScreen() {
  const auth = useAuth();
  const [error, setError] = useState<string | null>(null);
  return <ScrollView className="flex-1 bg-canvas" contentContainerStyle={{ padding: 20, paddingBottom: 36 }}><Text className="text-[11px] font-black tracking-widest text-pine">YOUR SPACE</Text><Text className="mt-2 text-3xl font-black text-ink">Profile & settings</Text>
    <View className="mt-6 rounded-3xl bg-pine-dark p-6"><Text className="text-[11px] font-bold tracking-widest text-mint">SIGNED IN AS</Text><Text className="mt-3 text-base font-bold text-white" numberOfLines={2}>{auth.user?.email ?? 'unknown'}</Text><View className="mt-5 self-start rounded-full bg-white/15 px-3 py-2"><Text className="text-xs font-bold capitalize text-white">{auth.user?.role} · demo account</Text></View></View>
    {__DEV__ && <View className="mt-5 rounded-3xl border border-line bg-white p-5"><Text className="text-lg font-black text-ink">Sandbox personas</Text><Text className="mt-2 text-sm leading-5 text-muted">Switch between accounts you have signed in to. The server verifies each role.</Text>
      {personaRoles.map((role) => <Pressable key={role} disabled={!auth.savedPersonas.includes(role)} onPress={() => { setError(null); void auth.switchPersona(role).catch((failure: unknown) => setError(failure instanceof Error ? failure.message : 'Could not switch account')); }} className={`mt-3 min-h-12 items-center justify-center rounded-xl ${auth.user?.role === role ? 'bg-pine' : auth.savedPersonas.includes(role) ? 'bg-pine-dark' : 'bg-canvas'}`}><Text className={`font-bold capitalize ${auth.savedPersonas.includes(role) ? 'text-white' : 'text-muted'}`}>{role}{auth.user?.role === role ? ' · active' : auth.savedPersonas.includes(role) ? '' : ' · sign in first'}</Text></Pressable>)}
      <Pressable onPress={() => { void auth.addPersona(); }} className="mt-4 min-h-12 items-center justify-center rounded-xl border border-pine"><Text className="font-bold text-pine">Add another account</Text></Pressable>
      {error && <Text className="mt-3 text-sm text-red-700">{error}</Text>}
    </View>}
    <Pressable onPress={() => { void auth.signOut(); }} className="mt-6 min-h-14 items-center justify-center rounded-xl border border-line bg-white"><Text className="font-bold text-ink">Sign out of all accounts</Text></Pressable>
  </ScrollView>;
}
