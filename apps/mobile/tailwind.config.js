module.exports = {
  content: ['./App.tsx', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: { extend: { colors: {
    canvas: '#060D0A',
    surface: '#0A1813',
    inset: '#060E0B',
    ink: '#F7FAF8',
    muted: '#9CA3AF',
    pine: '#10B981',
    'pine-dark': '#0A1813',
    mint: '#86EFAC',
    cream: '#2A1D08',
    amber: '#FBBF24',
    coral: '#F87171',
    line: '#1D3328',
  } } },
  plugins: [],
};
