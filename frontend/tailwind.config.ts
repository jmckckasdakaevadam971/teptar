import type { Config } from 'tailwindcss';

/**
 * Дизайн-система Vorhda «Башни на закате» в токенах Tailwind.
 *
 * preflight включён: весь проект переведён на utility-классы. В globals.css
 * остаются только базовые стили (html/body, шрифты, .container, орнамент,
 * сцена HeroScene).
 */
const config: Config = {
  darkMode: ['class'],
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
        'border-strong': 'rgb(var(--border-strong) / <alpha-value>)',
        input: 'rgb(var(--input) / <alpha-value>)',
        ring: 'rgb(var(--ring) / <alpha-value>)',

        // Статусные токены (меняются вместе с темой)
        success: {
          DEFAULT: 'rgb(var(--success) / <alpha-value>)',
          bg: 'rgb(var(--success-bg) / <alpha-value>)',
          border: 'rgb(var(--success-border) / <alpha-value>)',
        },
        danger: {
          DEFAULT: 'rgb(var(--danger) / <alpha-value>)',
          fg: 'rgb(var(--danger-fg) / <alpha-value>)',
          bg: 'rgb(var(--danger-bg) / <alpha-value>)',
          border: 'rgb(var(--danger-border) / <alpha-value>)',
          strong: 'rgb(var(--danger-strong) / <alpha-value>)',
          'strong-fg': 'rgb(var(--danger-strong-fg) / <alpha-value>)',
          btn: 'rgb(var(--danger-btn) / <alpha-value>)',
          'btn-hover': 'rgb(var(--danger-btn-hover) / <alpha-value>)',
          'btn-fg': 'rgb(var(--danger-btn-fg) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'rgb(var(--warning) / <alpha-value>)',
          bg: 'rgb(var(--warning-bg) / <alpha-value>)',
          border: 'rgb(var(--warning-border) / <alpha-value>)',
        },
        male: {
          DEFAULT: 'rgb(var(--male) / <alpha-value>)',
          bg: 'rgb(var(--male-bg) / <alpha-value>)',
        },
        female: {
          DEFAULT: 'rgb(var(--female) / <alpha-value>)',
          bg: 'rgb(var(--female-bg) / <alpha-value>)',
        },
        blush: {
          DEFAULT: 'rgb(var(--blush) / <alpha-value>)',
          card: 'rgb(var(--blush-card) / <alpha-value>)',
          strong: 'rgb(var(--blush-strong) / <alpha-value>)',
          'strong-fg': 'rgb(var(--blush-strong-fg) / <alpha-value>)',
        },

        // Старые токены — алиасы на переменные темы (используются в ModerationPanel и др.)
        stone: 'rgb(var(--background) / <alpha-value>)',
        gold: {
          DEFAULT: 'rgb(var(--primary) / <alpha-value>)',
          light: 'rgb(var(--accent) / <alpha-value>)',
          soft: 'rgb(var(--gold-soft) / <alpha-value>)',
        },
        cream: 'rgb(var(--foreground) / <alpha-value>)',
        sand: 'rgb(var(--muted-foreground) / <alpha-value>)',
        line: {
          DEFAULT: 'rgb(var(--border) / <alpha-value>)',
          strong: 'rgb(var(--border-strong) / <alpha-value>)',
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
        gold: '0 6px 18px rgb(var(--primary) / 0.22)',
        'gold-lg': '0 10px 26px rgb(var(--primary) / 0.32)',
        soft: '0 10px 30px rgba(0, 0, 0, 0.3)',
        'soft-lg': '0 18px 44px rgba(0, 0, 0, 0.5)',
      },
      ringColor: {
        gold: 'rgb(var(--primary) / 0.45)',
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
