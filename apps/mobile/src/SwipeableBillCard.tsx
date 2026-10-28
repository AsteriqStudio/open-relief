import { useWindowDimensions, Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import type { FeedBill } from './api';
import { formatCurrency } from '@open-relief/shared';

const spring = { damping: 18, stiffness: 180, mass: 0.85 };

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
  const initials = (bill.billerName ?? 'OR').split(/\s+/).slice(0, 2).map((word) => word[0]?.toUpperCase() ?? '').join('');
  const urgency = bill.urgencyLabel ?? (bill.daysUntilDisconnection !== null
    ? bill.daysUntilDisconnection === 0 ? 'Shut-off today' : `Shut-off in ${bill.daysUntilDisconnection} days`
    : bill.isShutoffNotice ? 'Final notice' : 'Past due notice');
  const money = (cents: number) => formatCurrency(cents, bill.currency ?? 'USD');
  const category = bill.category.toUpperCase();
  return <View className="mt-2">
    <Animated.View style={[relieveStyle, { position: 'absolute', top: 4, right: 4, bottom: 4, left: 4 }]} className="items-end justify-center rounded-3xl bg-pine px-7"><Text className="text-2xl font-black tracking-widest text-white">RELIEVE →</Text></Animated.View>
    <Animated.View style={[passStyle, { position: 'absolute', top: 4, right: 4, bottom: 4, left: 4 }]} className="justify-center rounded-3xl bg-muted px-7"><Text className="text-2xl font-black tracking-widest text-white">← PASS</Text></Animated.View>
    <GestureDetector gesture={gesture}><Animated.View style={cardStyle} className="overflow-hidden rounded-3xl border border-line bg-white shadow-lg">
      <View className="relative overflow-hidden bg-pine-dark px-5 pb-3 pt-3">
        <View className="absolute -right-12 -top-20 h-52 w-52 rounded-full border border-white/10" />
        <View className="absolute -right-1 -top-7 h-32 w-32 rounded-full border border-white/10" />
        <View className="flex-row items-center justify-between"><Text className="text-[11px] font-bold tracking-[2px] text-mint">{bill.railLabel ? 'FICTIONAL PITCH CARD' : 'VERIFIED DEMO BILL'}</Text><Text className="text-xs font-semibold text-white/70">{category}</Text></View>
        <View className="mt-3 flex-row items-center"><View className="h-12 w-12 items-center justify-center rounded-xl bg-white/15"><Text className="text-base font-black text-white">{initials}</Text></View><View className="ml-3 flex-1"><Text className="text-xs font-medium text-white/70">Paying directly to</Text><Text className="mt-1 text-base font-black text-white" numberOfLines={1}>{bill.billerName ?? 'Demo creditor'}</Text></View></View>
        <View className="mt-3 flex-row items-center justify-between border-t border-white/20 pt-3"><Text className="text-xs font-semibold text-mint">{bill.railLabel ? 'Illustrative creditor · no verification' : '✓ Verified demo creditor'}</Text><Text className="text-xs text-white/70">Acct ••••{bill.accountLast4 ?? 'private'}</Text></View>
      </View>
      <View className="px-5 pb-3 pt-3">
        <View className="flex-row items-center justify-between"><View className="mr-2 flex-shrink rounded-full bg-cream px-3 py-2"><Text className="text-xs font-bold text-amber" numberOfLines={2}>●  {urgency}</Text></View><Text className="flex-shrink text-right text-xs font-medium text-muted" numberOfLines={2}>{bill.locationLabel ?? `ZIP ${bill.zipCode ?? 'private'}`}</Text></View>
        {bill.sponsor && bill.sponsor.remainingMatchBudgetCents > 0 && remaining > 1 && <View className="mt-3 self-start rounded-full bg-mint px-3 py-2"><Text className="text-xs font-bold text-pine-dark">⚡ Up to {Number((1 + bill.sponsor.matchRatio).toFixed(2))}x impact · {bill.sponsor.name}</Text></View>}
        <Text className="mt-3 text-sm leading-6 text-ink" numberOfLines={3}>{bill.story?.trim() || `A household in ZIP ${bill.zipCode ?? 'your area'} needs help with an overdue ${bill.category} bill.`}</Text>
        <View className="mt-3 h-px bg-line" />
        <View className="mt-3 flex-row items-end justify-between"><View><Text className="text-[11px] font-bold tracking-widest text-muted">STILL NEEDED</Text><Text className="mt-1 text-3xl font-black text-ink">{money(remaining)}</Text></View><Text className="pb-1 text-sm font-bold text-pine">{progress}% funded</Text></View>
        <View className="mt-3 h-2 overflow-hidden rounded-full bg-line"><View className="h-2 rounded-full bg-pine" style={{ width: `${progress}%` }} /></View>
        <Text className="mt-2 text-xs text-muted">{money(total - remaining)} of {money(total)} covered</Text>
        {bill.railLabel && <Text className="mt-2 text-xs font-medium text-muted">{bill.railLabel}</Text>}
        <View className="mt-3 flex-row gap-3"><Pressable accessibilityRole="button" onPress={() => { mediumHaptic(); onPass(); }} className="min-h-14 flex-1 items-center justify-center rounded-2xl border border-line bg-canvas px-3"><Text className="text-sm font-bold text-ink">Pass</Text></Pressable><Pressable accessibilityRole="button" onPress={() => { mediumHaptic(); onGive(); }} className="min-h-14 flex-[1.5] items-center justify-center rounded-2xl bg-pine px-3"><Text className="text-sm font-black text-white">Relieve this bill  →</Text></Pressable></View>
      </View>
    </Animated.View></GestureDetector>
    <Text className="mt-5 text-center text-xs font-medium text-muted">Swipe right to help · left to see the next bill</Text>
  </View>;
}
