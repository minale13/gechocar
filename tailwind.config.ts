import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}', './lib/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        background: '#0A1929',
        'background-deep': '#0D1F33',
        card: '#112240',
        'card-dark': '#0A1929',
        'card-border': '#1E3A5F',
        gold: {
          light: '#F5D061',
          DEFAULT: '#D4AF37',
          dark: '#E5B842',
        },
        cyan: {
          light: '#7DF9FF',
          DEFAULT: '#00FFFF',
          dark: '#00B8D4',
        },
        'text-secondary': '#94A3B8',
        'silver-blue': '#B8C6D9',
      },
      backgroundImage: {
        'gold-gradient': 'linear-gradient(135deg, #D4AF37 0%, #F5D061 100%)',
        'gold-gradient-hover': 'linear-gradient(135deg, #E5B842 0%, #F7D97A 100%)',
        'card-radial': 'radial-gradient(circle at 50% 0%, #112240 0%, #0A1929 60%, #0D1F33 100%)',
        'cyan-gradient': 'linear-gradient(135deg, #00FFFF 0%, #00B8D4 100%)',
        'silver-blue-gradient': 'linear-gradient(135deg, #B8C6D9 0%, #E8EEF5 50%, #B8C6D9 100%)',
      },
      boxShadow: {
        gold: '0 0 20px rgba(212, 175, 55, 0.25), 0 4px 20px rgba(0, 0, 0, 0.4)',
        'gold-glow': '0 0 8px rgba(245, 208, 97, 0.5), 0 0 28px rgba(212, 175, 55, 0.15)',
        card: '0 4px 24px rgba(0, 0, 0, 0.35)',
        'cyan-glow': '0 0 15px rgba(0, 255, 255, 0.5), 0 0 40px rgba(0, 255, 255, 0.15)',
        'cyan-glow-strong': '0 0 8px rgba(0, 255, 255, 0.6), 0 0 30px rgba(0, 255, 255, 0.3)',
        'cyan-glow-soft': '0 0 12px rgba(0, 255, 255, 0.25), 0 0 30px rgba(0, 255, 255, 0.1)',
      },
      borderRadius: {
        '2xl': '1.25rem',
      },
    },
  },
  plugins: [],
};

export default config;