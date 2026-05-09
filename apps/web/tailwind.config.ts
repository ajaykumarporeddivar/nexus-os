import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    '../../packages/ui/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ink:    'var(--ink)',
        ink2:   'var(--ink2)',
        ink3:   'var(--ink3)',
        paper:  'var(--paper)',
        paper2: 'var(--paper2)',
        paper3: 'var(--paper3)',
        border: 'var(--border)',
        border2:'var(--border2)',
        acid:   'var(--acid)',
        acid2:  'var(--acid2)',
        cyan:   'var(--cyan)',
        amber:  'var(--amber)',
        rose:   'var(--rose)',
        violet: 'var(--violet)',
        green:  'var(--green)',
        green2: 'var(--green2)',
      },
      fontFamily: {
        display: ['var(--ff-d)', 'sans-serif'],
        serif:   ['var(--ff-s)', 'serif'],
        mono:    ['var(--ff-m)', 'monospace'],
      },
      keyframes: {
        fadein: {
          '0%':   { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slidein: {
          '0%':   { opacity: '0', transform: 'translateX(-8px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.5' },
        },
      },
      animation: {
        fadein:  'fadein 0.3s ease forwards',
        slidein: 'slidein 0.25s ease forwards',
        blink:   'blink 1s step-end infinite',
      },
    },
  },
  plugins: [],
}

export default config
