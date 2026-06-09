/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        'slide-in-left': {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'translateX(0)' },
        },
      },
      animation: {
        'slide-in-left': 'slide-in-left 0.25s ease-out',
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
      },
      colors: {
        // 디자인 토큰 (시맨틱)
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        bg: 'var(--bg)',
        sidebar: 'var(--sidebar)',
        line: {
          DEFAULT: 'var(--border)',
          strong: 'var(--border-2)',
        },
        content: {
          DEFAULT: 'var(--text)',
          muted: 'var(--text-2)',
          faint: 'var(--text-muted)',
        },
        primary: {
          DEFAULT: 'var(--primary)',
          hover: 'var(--primary-hover)',
        },
        success: 'var(--success)',
        warning: 'var(--warning)',
        danger: 'var(--danger)',
        info: 'var(--info)',
        'success-bg': 'var(--success-bg)',
        'warning-bg': 'var(--warning-bg)',
        'danger-bg': 'var(--danger-bg)',
        'info-bg': 'var(--info-bg)',
        eq: {
          1: 'var(--eq-1)',
          2: 'var(--eq-2)',
          3: 'var(--eq-3)',
          4: 'var(--eq-4)',
        },
        // 케이블 색상
        cable: {
          ac: '#FF0000',
          dc: '#FF8C00',
          lan: '#0066CC',
          fiber: '#00AA00',
        },
        // 설비 카테고리 색상
        equipment: {
          server: '#4A90D9',
          network: '#50C878',
          storage: '#9B59B6',
          power: '#E67E22',
          security: '#E74C3C',
          other: '#95A5A6',
        },
      },
    },
  },
  plugins: [],
};
