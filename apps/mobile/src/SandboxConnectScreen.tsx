import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { getApiBase, verifySandboxConnection } from './api';
import { getRememberedSandboxUrl } from './AuthContext';
import { BrandHeader, COLORS, PrimaryButton, ScreenBackdrop } from './design';

export function SandboxConnectScreen({ onConnected, onBack }: { onConnected(apiUrl: string): Promise<void>; onBack(): void }) {
  const [url, setUrl] = useState(process.env.EXPO_PUBLIC_OFFLINE_DEMO === '1' && Platform.OS !== 'web' ? '' : getApiBase());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void getRememberedSandboxUrl().then((saved) => { if (active && saved) setUrl(saved); });
    return () => { active = false; };
  }, []);

  async function connect() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { apiUrl, capabilities } = await verifySandboxConnection(url);
      if (capabilities.payments === 'stripe_test' && !process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith('pk_test_')) {
        throw new Error('This APK has no Stripe test publishable key. Use a mock-payment sandbox or a test-enabled build.');
      }
      await onConnected(apiUrl);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not connect to the sandbox.');
    } finally { setBusy(false); }
  }

  return <ScreenBackdrop><ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 44 }} keyboardShouldPersistTaps="handled">
    <BrandHeader mode="sandbox" subtitle="Connect to your own test server" />
    <Pressable accessibilityRole="button" onPress={onBack} className="mt-6 self-start rounded-full border border-line bg-surface px-4 py-3"><Text className="text-xs font-bold text-mint">← Back to offline demo</Text></Pressable>
    <Text className="mt-9 text-[11px] font-bold tracking-[2px] text-pine">CONNECTED SANDBOX</Text>
    <Text className="mt-3 text-4xl font-black leading-[44px] tracking-tight text-ink">Take the full{`\n`}workflow for a spin.</Text>
    <Text className="mt-4 text-sm leading-6 text-muted">Sign in, submit a test bill, review it, and simulate direct creditor aid using your own running OpenRelief API. This is a test environment, not a public relief service.</Text>
    <View className="mt-8 rounded-[28px] border border-[#24563F] bg-surface p-5">
      <Text className="text-[11px] font-bold tracking-widest text-mint">01  SANDBOX API ADDRESS</Text>
      <Text className="mt-3 text-xs leading-5 text-muted">Use HTTPS for a remote test server. On an Android emulator, use http://10.0.2.2:3000 for an API on your computer. A physical phone needs a reachable HTTPS address.</Text>
      <TextInput accessibilityLabel="Sandbox API URL" value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://sandbox.example.com" placeholderTextColor="#66766E" selectionColor={COLORS.emerald} className="mt-5 min-h-14 rounded-2xl border border-line bg-inset px-4 text-sm text-ink" />
      {error && <View className="mt-4 rounded-xl border border-[#5C1D1D] bg-[#2B0E0E] p-3"><Text className="text-xs leading-5 text-coral">{error}</Text></View>}
      <View className="mt-5"><PrimaryButton label={busy ? 'Verifying test server…' : 'Verify & connect  →'} disabled={busy || !url.trim()} onPress={() => void connect()} /></View>
      {busy && <ActivityIndicator className="mt-4" color={COLORS.emerald} />}
    </View>
    <View className="mt-5 rounded-[24px] border border-line bg-inset p-5"><Text className="text-[11px] font-bold tracking-widest text-pine">02  WHAT OPENS NEXT</Text><Text className="mt-3 text-sm leading-6 text-muted">Donor and recipient accounts, document upload, a review queue, sandbox impact, and mock checkout. Test Stripe checkout requires a separate build with a test publishable key.</Text></View>
    <Text className="mt-6 text-center text-[11px] leading-5 text-muted">No live charges or payouts are available in this build.</Text>
  </ScrollView></ScreenBackdrop>;
}
