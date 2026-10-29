import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export const COLORS = {
  backdrop: '#060D0A',
  surface: '#0A1813',
  inset: '#060E0B',
  border: '#1D3328',
  mint: '#86EFAC',
  emerald: '#10B981',
  white: '#F7FAF8',
  muted: '#9CA3AF',
  amber: '#FBBF24',
  coral: '#F87171',
} as const;

export function ScreenBackdrop({ children }: { children: ReactNode }) {
  return <View style={{ flex: 1, backgroundColor: COLORS.backdrop }}>
    <LinearGradient colors={['#060D0A', '#08120D', '#0A1612']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
    {children}
  </View>;
}

export function BrandHeader({ mode, subtitle }: { mode: 'offline' | 'sandbox'; subtitle?: string }) {
  return <View className="flex-row items-center justify-between gap-3">
    <View className="min-w-0 flex-1 flex-row items-center">
      <View className="h-11 w-11 items-center justify-center rounded-2xl border border-[#3D855A] bg-[#123E2A]"><Text className="text-lg font-black tracking-tight text-mint">or.</Text></View>
      <View className="ml-3 min-w-0 flex-1"><Text className="text-base font-black tracking-tight text-ink">OpenRelief<Text className="text-mint">.</Text></Text>{subtitle && <Text className="text-[10px] font-medium text-muted" numberOfLines={1}>{subtitle}</Text>}</View>
    </View>
    <View className="flex-row items-center rounded-full border border-[#24563F] bg-[#0D2A1D] px-3 py-2"><View className="mr-2 h-1.5 w-1.5 rounded-full bg-mint" /><Text className="text-[9px] font-black tracking-wide text-mint">{mode === 'offline' ? 'OFFLINE DEMO' : 'SANDBOX'}</Text></View>
  </View>;
}

export function ReceiptRow({ label, value, emphasis = false, badge = false }: { label: string; value: string; emphasis?: boolean; badge?: boolean }) {
  return <View className="flex-row items-center py-2">
    <Text className={`min-w-0 flex-shrink text-xs ${emphasis ? 'font-bold text-ink' : 'font-medium text-muted'}`} numberOfLines={2}>{label}</Text>
    <View className="mx-2 h-px flex-1 border-b border-dotted border-[#365044]" />
    <View className={badge ? 'rounded-full bg-pine px-2.5 py-1' : ''}><Text className={`text-right text-xs font-bold ${badge ? 'text-canvas' : emphasis ? 'text-mint' : 'text-ink'}`}>{value}</Text></View>
  </View>;
}

export function PrimaryButton({ label, onPress, disabled = false, outline = false }: { label: string; onPress(): void; disabled?: boolean; outline?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.86 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] })} className={`min-h-14 items-center justify-center rounded-full border px-5 py-3 ${disabled ? 'border-line bg-[#30463A]' : outline ? 'border-pine bg-surface' : 'border-mint bg-mint'}`}>
    <Text className={`text-center text-sm font-black ${disabled ? 'text-muted' : outline ? 'text-mint' : 'text-canvas'}`}>{label}</Text>
  </Pressable>;
}
