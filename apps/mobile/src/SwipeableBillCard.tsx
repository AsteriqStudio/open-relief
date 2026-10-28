import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { formatCurrency } from '@open-relief/shared';
import type { FeedBill } from './api';

const spring = { damping: 18, stiffness: 180, mass: 0.85 };
const icons: Record<FeedBill['category'], string> = { electric: '⚡', water: '◈', gas: '◆', medical: '✚', telecom: '◎' };
function lightHaptic() { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }
function mediumHaptic() { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }

export function SwipeableBillCard({ bill, onGive, onPass }: { bill: FeedBill; onGive(): void; onPass(): void }) {
  const { width } = useWindowDimensions();
  const threshold = width * 0.4;
  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);
  const crossed = useSharedValue(false);
  const gesture = Gesture.Pan().activeOffsetX([-8, 8]).onUpdate((event) => {
    offsetX.value = event.translationX;
    offsetY.value = event.translationY * 0.12;
    const aboveThreshold = Math.abs(event.translationX) >= threshold;
    if (aboveThreshold && !crossed.value) runOnJS(lightHaptic)();
    crossed.value = aboveThreshold;
  }).onEnd((event) => {
    runOnJS(mediumHaptic)();
    if (Math.abs(event.translationX) >= threshold) {
      const right = event.translationX > 0;
      offsetX.value = withSpring(right ? width * 1.25 : -width * 1.25, { ...spring, damping: 24 }, (finished) => {
        if (finished) runOnJS(right ? onGive : onPass)();
      });
    } else {
      offsetX.value = withSpring(0, spring);
      offsetY.value = withSpring(0, spring);
    }
  });
  const cardStyle = useAnimatedStyle(() => ({ transform: [
    { translateX: offsetX.value },
    { translateY: offsetY.value },
    { rotate: `${interpolate(offsetX.value, [-width, 0, width], [-8, 0, 8], 'clamp')}deg` },
  ] }));
  const relieveStyle = useAnimatedStyle(() => ({ opacity: interpolate(offsetX.value, [0, threshold], [0, 1], 'clamp') }));
  const passStyle = useAnimatedStyle(() => ({ opacity: interpolate(offsetX.value, [-threshold, 0], [1, 0], 'clamp') }));
  const total = bill.statementBalanceCents ?? 0;
  const remaining = bill.remainingBalanceCents ?? 0;
  const progress = total > 0 ? Math.min(100, Math.max(0, Math.round((total - remaining) * 100 / total))) : 0;
  const money = (cents: number) => formatCurrency(cents, bill.currency ?? 'USD');
  const urgency = bill.urgencyLabel ?? (bill.daysUntilDisconnection !== null
    ? bill.daysUntilDisconnection === 0 ? 'Shut-off today' : `Shut-off in ${bill.daysUntilDisconnection} days`
    : bill.isShutoffNotice ? 'Final notice' : 'Past due notice');
  const immediate = bill.daysUntilDisconnection === 0;
  const initials = (bill.billerName ?? 'OR').split(/\s+/).slice(0, 2).map((word) => word[0]?.toUpperCase() ?? '').join('');
  const sponsorActive = !!bill.sponsor && bill.sponsor.remainingMatchBudgetCents > 0 && remaining > 1;

  return <View className="mt-4">
    <Animated.View style={[relieveStyle, { position: 'absolute', top: 3, right: 3, bottom: 3, left: 3 }]} className="items-end justify-center rounded-[28px] border border-pine bg-[#103524] px-7"><Text className="text-xl font-black tracking-widest text-mint">RELIEVE →</Text></Animated.View>
    <Animated.View style={[passStyle, { position: 'absolute', top: 3, right: 3, bottom: 3, left: 3 }]} className="justify-center rounded-[28px] border border-[#47534B] bg-[#29332D] px-7"><Text className="text-xl font-black tracking-widest text-ink">← PASS</Text></Animated.View>
    <GestureDetector gesture={gesture}><Animated.View style={cardStyle} className="overflow-hidden rounded-[28px] border border-line bg-surface">
      <View className="px-5 pb-5 pt-5">
        <View className="flex-row items-start justify-between"><View className="h-12 w-12 items-center justify-center rounded-2xl border border-[#24563F] bg-[#123124]"><Text className="text-lg font-bold text-mint">{icons[bill.category]}</Text></View><View className="rounded-full border border-line bg-inset px-3 py-1.5"><Text className="text-[10px] font-bold uppercase tracking-wide text-muted">{bill.category}</Text></View></View>
        <Text className="mt-5 text-xs font-medium text-muted">PAYING DIRECTLY TO</Text>
        <Text className="mt-1 text-2xl font-black tracking-tight text-ink" numberOfLines={2}>{bill.billerName ?? 'Demo creditor'}</Text>
        <View className="mt-3 flex-row flex-wrap items-center gap-2"><View className="rounded-full border border-[#24563F] bg-[#0D2A1D] px-3 py-1.5"><Text className="text-[10px] font-bold text-mint">{bill.railLabel ? '◈  FICTIONAL PITCH CARD' : '✓  REVIEWED DEMO CREDITOR'}</Text></View><Text className="text-xs text-muted">Acct ••••{bill.accountLast4 ?? 'private'}</Text></View>
      </View>
      <View className="h-px bg-line" />
      <View className="px-5 pb-5 pt-4">
        <View className="flex-row items-center justify-between gap-2"><View className={`min-w-0 flex-shrink rounded-full border px-3 py-2 ${immediate ? 'border-[#5C1D1D] bg-[#2B0E0E]' : 'border-[#543B14] bg-cream'}`}><Text className={`text-xs font-bold ${immediate ? 'text-coral' : 'text-amber'}`} numberOfLines={2}>●  {urgency}</Text></View><Text className="flex-shrink text-right text-xs text-muted" numberOfLines={2}>{bill.locationLabel ?? `ZIP ${bill.zipCode ?? 'private'}`}</Text></View>
        {sponsorActive && <View className="mt-4 rounded-2xl border border-[#24563F] bg-[#0D2A1D] p-3"><Text className="text-xs font-bold text-mint">⚡  Up to {Number((1 + bill.sponsor!.matchRatio).toFixed(2))}x impact</Text><Text className="mt-1 text-xs text-muted">{bill.sponsor!.name}</Text></View>}
        <Text className="mt-4 text-sm leading-6 text-[#C4D2C9]" numberOfLines={3}>{bill.story?.trim() || `A household in ZIP ${bill.zipCode ?? 'your area'} needs help with an overdue ${bill.category} bill.`}</Text>
        <View className="mt-5 h-px bg-line" />
        <View className="mt-5 flex-row items-end justify-between"><View><Text className="text-[11px] font-bold tracking-widest text-muted">STILL NEEDED</Text><Text className="mt-1 text-4xl font-black tracking-tight text-ink">{money(remaining)}</Text></View><Text className="pb-1 text-sm font-bold text-mint">{progress}% covered</Text></View>
        <View className="mt-4 h-2 overflow-hidden rounded-full bg-[#162920]"><View className="h-2 rounded-full bg-pine" style={{ width: `${progress}%` }} /></View>
        <Text className="mt-2 text-xs text-muted">{money(total - remaining)} of {money(total)} covered</Text>
        {bill.railLabel && <Text className="mt-2 text-[11px] leading-4 text-muted">{bill.railLabel}</Text>}
        <View className="mt-5 flex-row gap-3"><Pressable accessibilityRole="button" onPress={() => { mediumHaptic(); onPass(); }} className="min-h-14 flex-1 items-center justify-center rounded-full border border-line bg-inset"><Text className="text-sm font-bold text-ink">Pass</Text></Pressable><Pressable accessibilityRole="button" onPress={() => { mediumHaptic(); onGive(); }} className="min-h-14 flex-[1.6] items-center justify-center rounded-full bg-mint"><Text className="text-sm font-black text-canvas">Relieve this bill  →</Text></Pressable></View>
      </View>
    </Animated.View></GestureDetector>
    <Text className="mt-4 text-center text-xs font-medium text-muted">Swipe right to help · left for the next bill</Text>
  </View>;
}
