/**
 * DEV-only topology debug helper.
 *
 * Vite dev 모드에서 `window.__topoDebug` 노출 → chrome devtools 콘솔에서
 * 한 줄로 토폴로지 모달 띄울 수 있게.
 *
 *   await __topoDebug.openCase('ec1')   // 자동으로 floor 로 navigate + 모달 오픈
 *   __topoDebug.list()                  // 사용 가능한 케이스 목록
 *   __topoDebug.close()
 *
 * 실서비스 빌드에는 포함되지 않음 (`import.meta.env.DEV` 가드).
 */

import { useNetworkTopologyStore } from '../features/network/store';
import { usePathHighlightStore } from '../features/pathTrace/stores/pathHighlightStore';

// ─── Seed edge-case 등록표 ───────────────────────────────────────────────
// backend/prisma/seed-edge-cases/generate.mjs 의 UUID 패턴과 1:1 동기화.
//   floor: b<digit>ec0000-0000-4000-b000-000000000001
//   cable: cbl-e<digit>ec0000-0000-4000-b000-000000000001-A
interface CaseDef {
  name: string;
  description: string;
  floor: string;
  cable: string;
}

const C = (digit: string, name: string, description: string): CaseDef => ({
  name,
  description,
  floor: `b${digit}ec0000-0000-4000-b000-000000000001`,
  cable: `cbl-e${digit}ec0000-0000-4000-b000-000000000001-A`,
});

const CASES: Record<string, CaseDef> = {
  ec1: C('1', 'single-ring', '단일 5-node ring, junction 없음'),
  ec3: C('3', 'two-rings-two-junctions', '2 ring 이 2 junction 공유 (SPQR)'),
  ec4: C('4', 'star-3rings', '3 ring star — 중앙 junction H'),
  ec5: C('5', 'chain-3rings', '3 ring chain — J1, J2 junction'),
  ec6: C('6', 'ring-with-leaves', '5-node ring + leaf branch'),
  ec7: C('7', 'disconnected-2rings', '연결 안 된 2 ring'),
  ec8: C('8', 'mixed-ring-sizes', '크기 다른 3 ring (3, 5, 6)'),
  ec9: C('9', 'edge-sharing-rings', 'edge 공유 ring — level-1 composite (SPQR)'),
};

// ─── helper ──────────────────────────────────────────────────────────────
function onFloorPlan(): boolean {
  return /\/floors\/[^/]+\/plan(?:\?|$)/.test(location.pathname + location.search);
}

async function openCaseImpl(caseId: string, { resize = true }: { resize?: boolean } = {}) {
  const c = CASES[caseId];
  if (!c) throw new Error(`Unknown case '${caseId}'. Try: ${Object.keys(CASES).join(', ')}`);

  // FloorPlanEditor 가 mount 된 상태가 아니면 NetworkTopologyModal 도 없음 → navigate 필요.
  if (!onFloorPlan()) {
    location.href = `/floors/${c.floor}/plan?openCase=${caseId}`;
    return; // page reload — 새 페이지가 ?openCase 보고 자동 실행함.
  }

  await usePathHighlightStore.getState().startTrace(c.cable);
  await useNetworkTopologyStore.getState().loadAndOpen(c.cable);

  if (resize) {
    // Layout / animation 끝날 시간 + 모달 크기 키워서 시각화 잘 보이게.
    await new Promise((r) => setTimeout(r, 1500));
    const inner = document.querySelector<HTMLElement>('[role="dialog"] .bg-white.rounded-lg');
    if (inner) {
      inner.style.width = '95vw';
      inner.style.height = '95vh';
      inner.style.maxWidth = 'none';
    }
    window.dispatchEvent(new Event('resize'));
  }
}

export const topoDebug = {
  cases: CASES,
  list(): string {
    return Object.entries(CASES)
      .map(([id, c]) => `  ${id.padEnd(4)} ${c.name.padEnd(28)} ${c.description}`)
      .join('\n');
  },
  openCase: openCaseImpl,
  close: () => useNetworkTopologyStore.getState().close(),
  state: () => useNetworkTopologyStore.getState(),
  stores: {
    network: useNetworkTopologyStore,
    pathHighlight: usePathHighlightStore,
  },
};

// ─── DEV 등록 + URL 자동 트리거 ──────────────────────────────────────────
if (import.meta.env.DEV) {
  (window as unknown as { __topoDebug: typeof topoDebug }).__topoDebug = topoDebug;
  // eslint-disable-next-line no-console
  console.log('[topoDebug] available. try `__topoDebug.openCase("ec1")` or `__topoDebug.list()`');

  // ?openCase=ecN URL 파라미터가 있으면 페이지 mount 후 자동 실행.
  const sp = new URLSearchParams(location.search);
  const auto = sp.get('openCase');
  if (auto && CASES[auto]) {
    // FloorPlanEditor mount + zustand 구독 후에 호출하도록 약간 지연.
    setTimeout(() => {
      void openCaseImpl(auto).catch((e) => console.error('[topoDebug] auto-open failed', e));
    }, 800);
  }
}
