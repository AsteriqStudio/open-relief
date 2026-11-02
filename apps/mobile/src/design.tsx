import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export const COLORS = {
  backdrop: '#0C1220',
  surface: '#151F31',
  inset: '#101827',
  border: '#293850',
  mint: '#B8CCFF',
  emerald: '#4F7FE7',
  white: '#F8FAFC',
  muted: '#AAB7CA',
  amber: '#F2C36B',
  coral: '#FB8B9A',
} as const;

export function ScreenBackdrop({ children }: { children: ReactNode }) {
  return <View style={{ flex: 1, backgroundColor: COLORS.backdrop }}>
    <LinearGradient colors={['#0C1220', '#10192A', '#172238']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
    {children}
  </View>;
}

export function BrandHeader({ mode, subtitle }: { mode: 'offline' | 'sandbox'; subtitle?: string }) {
  return <View className="flex-row items-center justify-between gap-3">
    <View className="min-w-0 flex-1 flex-row items-center">
      <View className="h-11 w-11 items-center justify-center rounded-2xl border border-[#5E84C7] bg-[#1A315B]"><Text className="text-lg font-black tracking-tight text-mint">or.</Text></View>
      <View className="ml-3 min-w-0 flex-1"><Text className="text-base font-black tracking-tight text-ink">OpenRelief<Text className="text-mint">.</Text></Text>{subtitle && <Text className="text-[10px] font-medium text-muted" numberOfLines={1}>{subtitle}</Text>}</View>
    </View>
    <View className="flex-row items-center rounded-full border border-[#365E9E] bg-[#13284B] px-3 py-2"><View className="mr-2 h-1.5 w-1.5 rounded-full bg-mint" /><Text className="text-[9px] font-black tracking-wide text-mint">{mode === 'offline' ? 'OFFLINE DEMO' : 'SANDBOX'}</Text></View>
  </View>;
}

export function ReceiptRow({ label, value, emphasis = false, badge = false }: { label: string; value: string; emphasis?: boolean; badge?: boolean }) {
  return <View className="flex-row items-center py-2">
    <Text className={`min-w-0 flex-shrink text-xs ${emphasis ? 'font-bold text-ink' : 'font-medium text-muted'}`} numberOfLines={2}>{label}</Text>
    <View className="mx-2 h-px flex-1 border-b border-dotted border-[#465978]" />
    <View className={badge ? 'rounded-full bg-pine px-2.5 py-1' : ''}><Text className={`text-right text-xs font-bold ${badge ? 'text-canvas' : emphasis ? 'text-mint' : 'text-ink'}`}>{value}</Text></View>
  </View>;
}

export function PrimaryButton({ label, onPress, disabled = false, outline = false }: { label: string; onPress(): void; disabled?: boolean; outline?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.86 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] })} className={`min-h-14 items-center justify-center rounded-full border px-5 py-3 ${disabled ? 'border-line bg-[#344158]' : outline ? 'border-pine bg-surface' : 'border-mint bg-mint'}`}>
    <Text className={`text-center text-sm font-black ${disabled ? 'text-muted' : outline ? 'text-mint' : 'text-canvas'}`}>{label}</Text>
  </Pressable>;
}
