/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // z-index 의미 스케일(SSOT). 0~19 대역은 캔버스 내부 오버레이(인라인 zIndex 10~14)용으로 예약.
      // 숫자 z-* 유틸은 그대로 두므로 점진 마이그레이션 안전.
      zIndex: {
        sticky: '10',   // 스크롤 콘텐츠 위 sticky 헤더(탭바 등)
        legend: '15',   // 캔버스 위 범례·인디케이터(패널 아래)
        panel: '20',    // 에디터 슬라이드 패널·캔버스 배너
        backdrop: '40', // 드롭다운/메뉴 백드롭·인라인 팝오버
        modal: '50',    // 메뉴·팝오버·모달(최상위 상호작용)
        top: '60',      // 모달 위 라이트박스·토스트·중첩 다이얼로그
        alert: '70',    // 충돌 다이얼로그 — 모든 레이어 위
      },
      keyframes: {
        'slide-in-left': {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'translateX(0)' },
        },
        'slide-in-right': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
      },
      animation: {
        'slide-in-left': 'slide-in-left 0.16s ease-out',
        'slide-in-right': 'slide-in-right 0.16s ease-out',
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
      },
      colors: {
        // 디자인 토큰 (시맨틱) — 채널 -rgb var + <alpha-value> 로 opacity 모디파이어 전역 지원
        surface: 'rgb(var(--surface-rgb) / <alpha-value>)',
        'surface-2': 'rgb(var(--surface-2-rgb) / <alpha-value>)',
        'surface-3': 'rgb(var(--surface-3-rgb) / <alpha-value>)',
        bg: 'rgb(var(--bg-rgb) / <alpha-value>)',
        sidebar: 'rgb(var(--sidebar-rgb) / <alpha-value>)',
        line: {
          DEFAULT: 'rgb(var(--border-rgb) / <alpha-value>)',
          strong: 'rgb(var(--border-2-rgb) / <alpha-value>)',
        },
        content: {
          DEFAULT: 'rgb(var(--text-rgb) / <alpha-value>)',
          muted: 'rgb(var(--text-2-rgb) / <alpha-value>)',
          faint: 'rgb(var(--text-muted-rgb) / <alpha-value>)',
        },
        primary: {
          DEFAULT: 'rgb(var(--primary-rgb) / <alpha-value>)',
          hover: 'rgb(var(--primary-hover-rgb) / <alpha-value>)',
        },
        success: 'rgb(var(--success-rgb) / <alpha-value>)',
        warning: 'rgb(var(--warning-rgb) / <alpha-value>)',
        danger: 'rgb(var(--danger-rgb) / <alpha-value>)',
        info: 'rgb(var(--info-rgb) / <alpha-value>)',
        'success-bg': 'rgb(var(--success-bg-rgb) / <alpha-value>)',
        'warning-bg': 'rgb(var(--warning-bg-rgb) / <alpha-value>)',
        'danger-bg': 'rgb(var(--danger-bg-rgb) / <alpha-value>)',
        'info-bg': 'rgb(var(--info-bg-rgb) / <alpha-value>)',
        eq: {
          1: 'rgb(var(--eq-1-rgb) / <alpha-value>)',
          2: 'rgb(var(--eq-2-rgb) / <alpha-value>)',
          3: 'rgb(var(--eq-3-rgb) / <alpha-value>)',
          4: 'rgb(var(--eq-4-rgb) / <alpha-value>)',
        },
        // 케이블 색상
        cable: {
          ac: '#FF0000',
          dc: '#FF8C00',
          lan: '#0066CC',
          fiber: '#00AA00',
        },
        // 설비 카테고리 색상
        asset: {
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
