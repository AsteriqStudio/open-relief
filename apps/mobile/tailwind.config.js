module.exports = {
  content: ['./App.tsx', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: { extend: { colors: {
    canvas: '#F6F6F1',
    ink: '#18312F',
    muted: '#58716B',
    pine: '#176B5D',
    'pine-dark': '#103F3A',
    mint: '#DFF2E8',
    cream: '#FFF4DD',
    amber: '#AF651B',
    line: '#E2E9E1',
  } } },
  plugins: [],
};
