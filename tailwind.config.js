/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./hooks/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Theme colors mapped from CSS variables in globals.css
        background: "var(--background)",
        "background-deep": "var(--background-deep)",
        card: "var(--card)",
        "card-dark": "var(--card-dark)",
        "card-border": "var(--card-border)",
        gold: "var(--gold)",
        "gold-light": "var(--gold-light)",
        "gold-dark": "var(--gold-dark)",
        cyan: "var(--cyan)",
        "cyan-light": "var(--cyan-light)",
        "cyan-dark": "var(--cyan-dark)",
        foreground: "var(--foreground)",
        "text-secondary": "var(--text-secondary)",
        "silver-blue": "var(--silver-blue)",
      },
      backgroundImage: {
        "gold-gradient":
          "linear-gradient(135deg, var(--gold-dark) 0%, var(--gold) 50%, var(--gold-light) 100%)",
        "cyan-gradient":
          "linear-gradient(135deg, var(--cyan-dark) 0%, var(--cyan) 50%, var(--cyan-light) 100%)",
        "silver-blue-gradient":
          "linear-gradient(135deg, var(--silver-blue) 0%, var(--cyan-light) 50%, var(--cyan) 100%)",
      },
      boxShadow: {
        card: "0 4px 6px -1px rgba(30, 58, 95, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2)",
        "gold-glow": "0 0 20px rgba(212, 175, 55, 0.5), 0 0 40px rgba(212, 175, 55, 0.3)",
        "gold-glow-strong": "0 0 30px rgba(212, 175, 55, 0.7), 0 0 60px rgba(212, 175, 55, 0.4)",
        "cyan-glow": "0 0 20px rgba(0, 255, 255, 0.4), 0 0 40px rgba(0, 255, 255, 0.2)",
        "cyan-glow-strong": "0 0 30px rgba(0, 255, 255, 0.7), 0 0 60px rgba(0, 255, 255, 0.4)",
        "cyan-glow-soft": "0 0 15px rgba(0, 255, 255, 0.3)",
      },
    },
  },
  plugins: [],
};
