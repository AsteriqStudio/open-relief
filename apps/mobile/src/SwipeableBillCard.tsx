import { useWindowDimensions, Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import type { FeedBill } from './api';

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;
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
  const urgency = bill.daysUntilDisconnection !== null
    ? `Shut-off in ${bill.daysUntilDisconnection} days`
    : bill.isShutoffNotice ? 'Final notice' : 'Past due notice';
  return <View className="flex-1 justify-center">
    <Animated.View style={relieveStyle} className="absolute inset-2 items-end justify-center rounded-3xl bg-emerald-500 px-7"><Text className="text-3xl font-black tracking-widest text-white">RELIEVE →</Text></Animated.View>
    <Animated.View style={passStyle} className="absolute inset-2 justify-center rounded-3xl bg-gray-500 px-7"><Text className="text-3xl font-bold tracking-widest text-white">← PASS</Text></Animated.View>
    <GestureDetector gesture={gesture}><Animated.View style={cardStyle} className="rounded-3xl border border-slate-100 bg-white p-6 shadow-xl">
      <View className="flex-row items-center gap-3"><View className="h-14 w-14 items-center justify-center rounded-2xl bg-slate-900"><Text className="text-xl font-bold text-white">{initials}</Text></View><View className="flex-1"><Text className="text-xs font-semibold uppercase tracking-widest text-slate-500">Direct creditor relief</Text><Text className="text-xl font-bold text-slate-900">{bill.billerName ?? 'Demo creditor'}</Text></View></View>
      <View className="mt-5 self-start rounded-full bg-emerald-50 px-3 py-2"><Text className="text-xs font-semibold text-emerald-800">◈ Verified demo creditor account</Text></View>
      <View className="mt-3 self-start rounded-full bg-amber-100 px-3 py-2"><Text className="text-sm font-semibold text-amber-900">{urgency}</Text></View>
      <Text className="mt-6 text-base leading-6 text-slate-700" numberOfLines={2}>{bill.story?.trim() || `A household in ZIP ${bill.zipCode ?? 'your area'} needs help with an overdue ${bill.category} bill.`}</Text>
      <Text className="mt-5 text-sm text-slate-500">{bill.category.toUpperCase()} · ZIP {bill.zipCode ?? 'private'} · Account ••••{bill.accountLast4 ?? 'private'}</Text>
      <View className="mt-7 flex-row items-end justify-between"><View><Text className="text-xs font-semibold uppercase tracking-wider text-slate-500">Remaining balance</Text><Text className="mt-1 text-3xl font-black text-slate-900">{dollars(remaining)}</Text></View><Text className="text-sm font-semibold text-emerald-700">{progress}% funded</Text></View>
      <View className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100"><View className="h-3 rounded-full bg-emerald-500" style={{ width: `${progress}%` }} /></View>
      <Text className="mt-2 text-xs text-slate-500">{dollars(remaining)} remaining of {dollars(total)}</Text>
      <View className="mt-7 flex-row gap-3"><Pressable accessibilityRole="button" onPress={() => { mediumHaptic(); onPass(); }} className="flex-1 rounded-2xl bg-slate-100 p-4"><Text className="text-center font-semibold text-slate-700">Pass</Text></Pressable><Pressable accessibilityRole="button" onPress={() => { mediumHaptic(); onGive(); }} className="flex-1 rounded-2xl bg-emerald-600 p-4"><Text className="text-center font-bold text-white">Relieve</Text></Pressable></View>
    </Animated.View></GestureDetector>
    <Text className="mt-5 text-center text-xs font-medium text-slate-500">Swipe right to relieve · Swipe left to pass</Text>
  </View>;
}
