import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAuth } from './AuthContext';

const personaRoles = ['recipient', 'donor', 'admin'] as const;

export function ProfileScreen() {
  const auth = useAuth();
  const [error, setError] = useState<string | null>(null);
  return <View className="flex-1 bg-slate-50 p-5"><Text className="text-3xl font-black text-slate-900">Profile</Text><Text className="mt-2 text-slate-600">Signed in as {auth.user?.email ?? 'unknown'}</Text><Text className="mt-1 font-semibold capitalize text-emerald-700">{auth.user?.role}</Text>
    {__DEV__ && <View className="mt-8 rounded-3xl bg-white p-5"><Text className="text-xl font-bold text-slate-900">Sandbox personas</Text><Text className="mt-2 text-sm text-slate-600">Switch between accounts you have already signed in to. Each role is verified by the server.</Text>
      {personaRoles.map((role) => <Pressable key={role} disabled={!auth.savedPersonas.includes(role)} onPress={() => { setError(null); void auth.switchPersona(role).catch((failure: unknown) => setError(failure instanceof Error ? failure.message : 'Could not switch account')); }} className={`mt-3 rounded-xl p-3 ${auth.user?.role === role ? 'bg-emerald-600' : auth.savedPersonas.includes(role) ? 'bg-slate-900' : 'bg-slate-200'}`}><Text className={`text-center font-bold capitalize ${auth.savedPersonas.includes(role) ? 'text-white' : 'text-slate-500'}`}>{role}{auth.user?.role === role ? ' · active' : auth.savedPersonas.includes(role) ? '' : ' · sign in first'}</Text></Pressable>)}
      <Pressable onPress={() => { void auth.addPersona(); }} className="mt-4 rounded-xl border border-emerald-700 p-3"><Text className="text-center font-bold text-emerald-700">Add another account</Text></Pressable>
      {error && <Text className="mt-3 text-red-700">{error}</Text>}
    </View>}
    <Pressable onPress={() => { void auth.signOut(); }} className="mt-8 rounded-xl bg-slate-800 p-4"><Text className="text-center font-bold text-white">Sign out of all accounts</Text></Pressable>
  </View>;
}
