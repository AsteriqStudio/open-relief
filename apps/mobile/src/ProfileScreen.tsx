import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { formatCurrency } from '@open-relief/shared';
import { getDonorImpact } from './api';
import type { DonorImpact } from './api';
import { useAuth } from './AuthContext';
import { LegalModal } from './LegalModal';
import type { LegalDocument } from './LegalModal';
import { COLORS, PrimaryButton } from './design';

const personaRoles = ['recipient', 'donor', 'admin'] as const;

export function ProfileScreen({ onBackToDemo }: { onBackToDemo?: () => void }) {
  const auth = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [impact, setImpact] = useState<DonorImpact | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [legalDocument, setLegalDocument] = useState<LegalDocument | null>(null);

  useEffect(() => {
    if (auth.user?.role !== 'donor' || !auth.token) { setImpact(null); return; }
    let active = true;
    setImpactLoading(true);
    void getDonorImpact(auth.token).then((value) => { if (active) { setImpact(value); setError(null); } })
      .catch((failure: unknown) => { if (active) setError(failure instanceof Error ? failure.message : 'Could not load impact'); })
      .finally(() => { if (active) setImpactLoading(false); });
    return () => { active = false; };
  }, [auth.token, auth.user?.role]);

  return <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 42 }}>
    <Text className="text-[11px] font-bold tracking-[2px] text-pine">YOUR ACCOUNT</Text>
    <Text className="mt-3 text-4xl font-black tracking-tight text-ink">Profile & impact.</Text>
    <Text className="mt-2 text-sm leading-6 text-muted">Your account, your activity, and the terms behind the demo.</Text>
    <View className="mt-7 rounded-[28px] border border-[#24563F] bg-[#0D2A1D] p-6">
      <Text className="text-[11px] font-bold tracking-widest text-mint">SIGNED IN AS</Text>
      <Text className="mt-3 text-lg font-black text-ink" numberOfLines={2}>{auth.user?.email ?? 'Unknown account'}</Text>
      <View className="mt-5 self-start rounded-full border border-[#386A50] bg-[#163B29] px-3 py-2"><Text className="text-xs font-bold capitalize text-mint">{auth.user?.role} · sandbox account</Text></View>
    </View>
    {auth.user?.role === 'donor' && <View className="mt-5 rounded-[28px] border border-line bg-surface p-5">
      <View className="flex-row items-center justify-between"><Text className="text-lg font-black text-ink">Your demo impact</Text>{impactLoading && <ActivityIndicator color={COLORS.emerald} />}</View>
      <Text className="mt-1 text-xs leading-5 text-muted">From your completed sandbox transactions.</Text>
      <View className="mt-5 flex-row rounded-2xl border border-[#162920] bg-inset py-5">
        {([
          { label: 'Creditor aid', value: impact ? formatCurrency(impact.creditorAidCents, 'USD') : '—' },
          { label: 'Bills settled', value: impact ? String(impact.settledBills) : '—' },
          { label: 'Sponsor matches', value: impact ? String(impact.sponsorMatches) : '—' },
        ] as const).map((stat, index) => <View key={stat.label} className={`min-w-0 flex-1 px-2 ${index > 0 ? 'border-l border-line' : ''}`}>
          <Text className="text-center text-base font-black text-mint" numberOfLines={1} adjustsFontSizeToFit>{stat.value}</Text>
          <Text className="mt-2 text-center text-[10px] leading-4 text-muted">{stat.label}</Text>
        </View>)}
      </View>
    </View>}
    {__DEV__ && <View className="mt-5 rounded-[28px] border border-line bg-surface p-5">
      <Text className="text-lg font-black text-ink">Sandbox personas</Text>
      <Text className="mt-2 text-sm leading-5 text-muted">Switch between accounts you have signed in to. The server checks each role.</Text>
      {personaRoles.map((role) => <Pressable key={role} accessibilityRole="button" disabled={!auth.savedPersonas.includes(role)} onPress={() => { setError(null); void auth.switchPersona(role).catch((failure: unknown) => setError(failure instanceof Error ? failure.message : 'Could not switch account')); }} className={`mt-3 min-h-12 items-center justify-center rounded-xl border ${auth.user?.role === role ? 'border-pine bg-pine' : auth.savedPersonas.includes(role) ? 'border-line bg-inset' : 'border-line bg-surface'}`}>
        <Text className={`font-bold capitalize ${auth.user?.role === role ? 'text-canvas' : auth.savedPersonas.includes(role) ? 'text-ink' : 'text-muted'}`}>{role}{auth.user?.role === role ? ' · active' : auth.savedPersonas.includes(role) ? '' : ' · sign in first'}</Text>
      </Pressable>)}
      <View className="mt-4"><PrimaryButton label="Add another account" onPress={() => { void auth.addPersona(); }} outline /></View>
    </View>}
    <View className="mt-5 rounded-[28px] border border-line bg-surface p-5">
      <Text className="text-lg font-black text-ink">Trust & disclosures</Text>
      <Text className="mt-2 text-sm leading-5 text-muted">How sandbox gifts, creditor accounts, refunds, and personal information are handled.</Text>
      <View className="mt-5"><PrimaryButton label="Payment & legal details  →" onPress={() => setLegalDocument('payment')} outline /></View>
      <View className="mt-5 flex-row gap-6"><Pressable accessibilityRole="button" onPress={() => setLegalDocument('terms')}><Text className="text-sm font-bold text-mint">Terms of service</Text></Pressable><Pressable accessibilityRole="button" onPress={() => setLegalDocument('privacy')}><Text className="text-sm font-bold text-mint">Privacy notice</Text></Pressable></View>
    </View>
    {error && <View className="mt-4 rounded-xl border border-[#5C1D1D] bg-[#2B0E0E] p-3"><Text className="text-sm text-coral">{error}</Text></View>}
    <View className="mt-6"><PrimaryButton label="Sign out of all accounts" onPress={() => { void auth.signOut(); }} outline /></View>
    {onBackToDemo && <Pressable accessibilityRole="button" onPress={onBackToDemo} className="mt-4 min-h-12 items-center justify-center"><Text className="text-sm font-bold text-mint">← Return to offline demo</Text></Pressable>}
    <LegalModal document={legalDocument} onClose={() => setLegalDocument(null)} />
  </ScrollView>;
}
