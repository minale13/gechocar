import type { Config } from 'tailwindcss';

// ── Premium «Dark Emerald & Tech Glow Green» theme ───────────────────────────
// Deep slate shell (#0B0F17) with vivid emerald (#10B981) / neon green
// (#00FF87) tech-glow accents, frosted glass-morphism surfaces and glowing
// borders. The token keys `gold` and `cyan` are intentionally PRESERVED from
// the previous theme (they are pure style aliases): text-gold / bg-gold-
// gradient / border-card-border / shadow-cyan-glow … all now resolve to the
// emerald family, re-theming every component with zero logic changes.
const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}', './lib/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // Shell — deep slate / dark gray
        background: '#0B0F17',
        'background-deep': '#0D121C',
        // Frosted emerald-tinted surfaces
        card: '#0F1B17',
        'card-dark': '#0B0F17',
        'card-border': '#1C3D31',
        // Primary accent — vivid emerald / neon green
        // (keys `gold` & `cyan` are legacy aliases kept for compatibility)
        gold: {
          light: '#00FF87',
          DEFAULT: '#10B981',
          dark: '#059669',
        },
        cyan: {
          light: '#7DFFC4',
          DEFAULT: '#00FF87',
          dark: '#00D97F',
        },
        'text-secondary': '#8CA39A',
        'silver-blue': '#9FE8C8',
      },
      backgroundImage: {
        'gold-gradient': 'linear-gradient(135deg, #059669 0%, #10B981 55%, #00FF87 100%)',
        'gold-gradient-hover': 'linear-gradient(135deg, #10B981 0%, #34D399 55%, #4EFFAB 100%)',
        'card-radial': 'radial-gradient(circle at 50% 0%, #0F1B17 0%, #0B0F17 60%, #0D121C 100%)',
        'cyan-gradient': 'linear-gradient(135deg, #00FF87 0%, #059669 100%)',
        'silver-blue-gradient': 'linear-gradient(135deg, #9FE8C8 0%, #E7FFF4 50%, #9FE8C8 100%)',
      },
      boxShadow: {
        gold: '0 0 20px rgba(16, 185, 129, 0.22), 0 4px 20px rgba(0, 0, 0, 0.45)',
        'gold-glow': '0 0 8px rgba(0, 255, 135, 0.45), 0 0 28px rgba(16, 185, 129, 0.18)',
        card: '0 4px 24px rgba(0, 0, 0, 0.45)',
        'cyan-glow': '0 0 15px rgba(16, 185, 129, 0.4), 0 0 40px rgba(0, 255, 135, 0.14)',
        'cyan-glow-strong': '0 0 8px rgba(0, 255, 135, 0.5), 0 0 30px rgba(16, 185, 129, 0.28)',
        'cyan-glow-soft': '0 0 12px rgba(16, 185, 129, 0.2), 0 0 30px rgba(0, 255, 135, 0.07)',
      },
      borderRadius: {
        '2xl': '1.25rem',
      },
    },
  },
  plugins: [],
};

export default config;