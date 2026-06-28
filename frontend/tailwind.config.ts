import type { Config } from 'tailwindcss';

/**
 * Дизайн-система Vorhda «Башни на закате» в токенах Tailwind.
 *
 * preflight включён: весь проект переведён на utility-классы. В globals.css
 * остаются только базовые стили (html/body, шрифты, .container, орнамент,
 * сцена HeroScene).
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  corePlugins: {
    container: false, // используем свой .container из globals.css
  },
  theme: {
    extend: {
      colors: {
        // Семантические токены дизайна v0 «Башни на закате».
        // Значения — RGB-каналы в :root, чтобы работала прозрачность (bg-card/60).
        background: 'rgb(var(--background) / <alpha-value>)',
        foreground: 'rgb(var(--foreground) / <alpha-value>)',
        card: {
          DEFAULT: 'rgb(var(--card) / <alpha-value>)',
          foreground: 'rgb(var(--card-foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'rgb(var(--popover) / <alpha-value>)',
          foreground: 'rgb(var(--popover-foreground) / <alpha-value>)',
        },
        primary: {
          DEFAULT: 'rgb(var(--primary) / <alpha-value>)',
          foreground: 'rgb(var(--primary-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'rgb(var(--secondary) / <alpha-value>)',
          foreground: 'rgb(var(--secondary-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'rgb(var(--muted) / <alpha-value>)',
          foreground: 'rgb(var(--muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          foreground: 'rgb(var(--accent-foreground) / <alpha-value>)',
        },
        border: 'rgb(var(--border) / <alpha-value>)',
        input: 'rgb(var(--input) / <alpha-value>)',
        ring: 'rgb(var(--ring) / <alpha-value>)',

        // Старые токены — для ещё не переписанных страниц.
        stone: {
          DEFAULT: '#0c0a07',
          900: '#0c0a07',
          800: '#15110d',
          700: '#1f1812',
          600: '#2a2118',
        },
        gold: {
          DEFAULT: '#c9a227',
          light: '#eccd63',
          bright: '#f7e6a8',
          soft: '#6f5a16',
        },
        cream: '#f3ecdd',
        sand: '#b0a489',
        line: {
          DEFAULT: '#322a1e',
          strong: '#463b2a',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        serif: ['var(--font-display)', 'Georgia', 'Times New Roman', 'serif'],
        display: ['var(--font-display)', 'Georgia', 'Times New Roman', 'serif'],
      },
      borderRadius: {
        sm: 'calc(var(--radius) - 4px)',
        md: 'calc(var(--radius) - 2px)',
        DEFAULT: 'var(--radius)',
        lg: 'var(--radius)',
        xl: 'calc(var(--radius) + 4px)',
        '2xl': 'calc(var(--radius) + 8px)',
        '3xl': '1.5rem',
      },
      boxShadow: {
        gold: '0 6px 18px rgba(201, 162, 39, 0.22)',
        'gold-lg': '0 10px 26px rgba(201, 162, 39, 0.32)',
        soft: '0 10px 30px rgba(0, 0, 0, 0.3)',
        'soft-lg': '0 18px 44px rgba(0, 0, 0, 0.5)',
      },
      ringColor: {
        gold: 'rgba(201, 162, 39, 0.45)',
      },
      maxWidth: {
        container: '1080px',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(24px)' },
          to: { opacity: '1', transform: 'none' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.7s cubic-bezier(0.22, 0.61, 0.36, 1) both',
      },
    },
  },
  plugins: [],
};

export default config;
