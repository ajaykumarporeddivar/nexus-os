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
        /* Semantic surface tokens */
        ink:    'var(--ink)',
        ink2:   'var(--ink2)',
        ink3:   'var(--ink3)',
        paper:  'var(--paper)',
        paper2: 'var(--paper2)',
        paper3: 'var(--paper3)',
        border: 'var(--border)',
        border2:'var(--border2)',
        /* Brand */
        acid:    'var(--acid)',
        acid2:   'var(--acid2)',
        /* Status */
        cyan:    'var(--cyan)',
        amber:   'var(--amber)',
        rose:    'var(--rose)',
        violet:  'var(--violet)',
        green:   'var(--green)',
        green2:  'var(--green2)',
      },
      fontFamily: {
        display: ['var(--ff-d)', 'sans-serif'],
        serif:   ['var(--ff-s)', 'serif'],
        mono:    ['var(--ff-m)', 'monospace'],
      },
      fontSize: {
        /* Map fluid scale to Tailwind utilities */
        'fluid-xs':   'var(--text-xs)',
        'fluid-sm':   'var(--text-sm)',
        'fluid-base': 'var(--text-base)',
        'fluid-md':   'var(--text-md)',
        'fluid-lg':   'var(--text-lg)',
        'fluid-xl':   'var(--text-xl)',
        'fluid-2xl':  'var(--text-2xl)',
        'fluid-3xl':  'var(--text-3xl)',
        'fluid-4xl':  'var(--text-4xl)',
      },
      borderRadius: {
        sm:   'var(--radius-sm)',
        md:   'var(--radius-md)',
        lg:   'var(--radius-lg)',
        xl:   'var(--radius-xl)',
        full: 'var(--radius-full)',
      },
      /* Easing via CSS vars — use in arbitrary values: duration-[var(--dur-fast)] */
      transitionTimingFunction: {
        'ease-out':    'var(--ease-out)',
        'ease-in':     'var(--ease-in)',
        'ease-in-out': 'var(--ease-in-out)',
        'ease-spring': 'var(--ease-spring)',
        'ease-bounce': 'var(--ease-bounce)',
      },
      transitionDuration: {
        instant: 'var(--dur-instant)',
        fast:    'var(--dur-fast)',
        normal:  'var(--dur-normal)',
        slow:    'var(--dur-slow)',
        xslow:   'var(--dur-xslow)',
      },
      keyframes: {
        fadein: {
          from: { opacity: '0', transform: 'translateY(-6px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        slidein: {
          from: { opacity: '0', transform: 'translateX(-6px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        'blink-cursor': {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1',   transform: 'scale(1)' },
          '50%':      { opacity: '0.4', transform: 'scale(0.85)' },
        },
        spin: {
          to: { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        fadein:       'fadein var(--dur-normal) var(--ease-out) both',
        slidein:      'slidein var(--dur-normal) var(--ease-out) both',
        'blink-cursor': 'blink-cursor 1s step-end infinite',
        'pulse-dot':  'pulse-dot 2s var(--ease-in-out) infinite',
        spin:         'spin 0.8s linear infinite',
      },
    },
  },
  plugins: [],
}

export default config
