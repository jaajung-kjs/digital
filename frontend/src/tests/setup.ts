import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Cleanup after each test
afterEach(() => {
  cleanup();
});

/* 담아 둔 사진의 미리보기는 `URL.createObjectURL` 로 만든다 — jsdom 에는 그 함수가 없어서
   사진 카드를 그리는 시험이 통째로 넘어졌다(사진을 고르는 순간 터진다). 이름만 돌려준다. */
/* `vi.fn` 으로 두지 않는다 — 이 설정은 시험마다 mock 을 초기화해서(`mockReset`) 두 번째
   시험부터 `undefined` 를 돌려준다. 그러면 「미리보기가 있다」가 거짓이 된다. */
let objectUrlSeq = 0;
URL.createObjectURL = () => `blob:test-${++objectUrlSeq}`;
URL.revokeObjectURL = () => {};

/* jsdom 에는 `scrollIntoView` 가 없다 — 브라우저에는 모두 있으므로 제품 코드가 그것을
   방어할 이유가 없다. 없는 쪽은 환경이니 환경에서 채운다. 무엇이 불렸는지 보고 싶은
   시험은 이 자리를 제 손으로 덮어쓴다(`scrollSelectedIntoView.test.tsx`). */
Element.prototype.scrollIntoView = () => {};

// Mock HTMLCanvasElement
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 0,
  lineCap: 'butt',
  lineJoin: 'miter',
  globalAlpha: 1,
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  strokeRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  arc: vi.fn(),
  stroke: vi.fn(),
  fill: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  translate: vi.fn(),
  rotate: vi.fn(),
  scale: vi.fn(),
  setLineDash: vi.fn(),
  fillText: vi.fn(),
  measureText: vi.fn(() => ({ width: 0 })),
})) as any;

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() {
    return [];
  }
  unobserve() {}
} as any;

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
} as any;

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
