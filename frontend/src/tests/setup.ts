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

/* 캔버스도 없는 쪽이라 환경에서 채운다 — **`vi.fn` 이 아니라 보통 함수로.**
   이 프로젝트는 `mockReset: true` 라(vitest.config) 시험이 시작될 때마다 모든 mock 의
   구현이 지워진다. 여기를 `vi.fn(() => …)` 으로 두면 첫 시험이 끝난 뒤부터
   `getContext()` 가 `undefined` 를 돌려주어, 캔버스를 그리는 화면이 조용히 깨진다.
   불린 횟수를 세고 싶은 시험은 제 손으로 덮어쓰면 된다. */
const noop = () => {};
HTMLCanvasElement.prototype.getContext = (() => ({
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 0,
  lineCap: 'butt',
  lineJoin: 'miter',
  globalAlpha: 1,
  clearRect: noop,
  fillRect: noop,
  strokeRect: noop,
  beginPath: noop,
  moveTo: noop,
  lineTo: noop,
  arc: noop,
  stroke: noop,
  fill: noop,
  save: noop,
  restore: noop,
  translate: noop,
  rotate: noop,
  scale: noop,
  setLineDash: noop,
  setTransform: noop,
  resetTransform: noop,
  transform: noop,
  closePath: noop,
  rect: noop,
  clip: noop,
  quadraticCurveTo: noop,
  bezierCurveTo: noop,
  ellipse: noop,
  drawImage: noop,
  createLinearGradient: () => ({ addColorStop: noop }),
  fillText: noop,
  measureText: () => ({ width: 0 }),
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
