/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{js,ts,jsx,tsx,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        blite: {
          'bg-primary': 'var(--blite-bg-primary)',
          'bg-secondary': 'var(--blite-bg-secondary)',
          'bg-tertiary': 'var(--blite-bg-tertiary)',
          'bg-chat': 'var(--blite-bg-chat)',
          'bg-input': 'var(--blite-bg-input)',
          'bg-hover': 'var(--blite-bg-hover)',
          'bg-active': 'var(--blite-bg-active)',
          'sidebar': 'var(--blite-sidebar)',
          'glass-bg': 'var(--blite-glass-bg)',
          'glass-border': 'var(--blite-glass-border)',
          'gradient-start': 'var(--blite-gradient-start)',
          'gradient-end': 'var(--blite-gradient-end)',
          'text-primary': 'var(--blite-text-primary)',
          'text-secondary': 'var(--blite-text-secondary)',
          'text-muted': 'var(--blite-text-muted)',
          'border': 'var(--blite-border)',
          'online': '#22c55e',
          'idle': '#eab308',
          'dnd': '#ef4444',
          'offline': '#64748b',
          'danger': 'var(--blite-danger)',
          'success': 'var(--blite-success)',
          'warning': 'var(--blite-warning)',
          'info': 'var(--blite-info)',
        },
        'neon-cyan': 'var(--blite-neon-cyan)',
        'neon-magenta': 'var(--blite-neon-magenta)',
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      fontSize: {
        'xxs': '0.65rem',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'gradient-shift': 'gradient-shift 8s ease infinite',
        'slide-in-right': 'slide-in-right 0.25s ease-out',
        'neon-pulse': 'neon-pulse 2s ease-in-out infinite',
      },
      keyframes: {
        'gradient-shift': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
      },
      backdropBlur: {
        'xl': '20px',
        '2xl': '40px',
      },
    },
  },
  plugins: [],
}
