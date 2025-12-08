/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
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
