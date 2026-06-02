/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        gold: {
          DEFAULT: '#D4AF37',
          light: '#E8D48B',
          dark: '#B8960C',
        },
        surface: {
          DEFAULT: '#111111',
          card: '#1a1a1a',
          elevated: '#222222',
        },
      },
    },
  },
  plugins: [],
};
