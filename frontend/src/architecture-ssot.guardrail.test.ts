import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

// ──────────────────────────────────────────────────────────────────────────
// 단일 SSOT 구조 가드레일 (저장/미저장 갭 재발 구조적 차단).
//
// 원칙: 자산/케이블/노드 raw 서버 피드는 "단일 hydration/투영 지점"에서만 읽는다.
// 다른 모든 뷰는 effective(saved∪overlay) 또는 그래프만 읽는다. 새 코드가 raw 피드를
// 직접 읽으면(=커밋본만, staged 누락) 이 테스트가 실패한다 — 규율이 아니라 강제.
// ──────────────────────────────────────────────────────────────────────────

const SRC = join(__dirname);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const FILES = walk(SRC);
const rel = (p: string) => relative(SRC, p).replace(/\\/g, '/');

describe('SSOT 가드레일: raw 자산 피드는 단일 지점에서만', () => {
  it('전역 자산/케이블 리스트 피드(/assets,/cables)는 useHydrateGlobal 에서만 읽는다', () => {
    const ALLOW = new Set(['features/workingCopy/useHydrateGlobal.ts']);
    // api.get('/assets') / api.get('/cables') — 단, /assets/:id 상세는 허용(다른 엔드포인트).
    const re = /api\.get\s*(?:<[^>]*>)?\s*\(\s*['"`]\/(assets|cables)['"`]/;
    const offenders = FILES.filter((f) => !ALLOW.has(rel(f)) && re.test(readFileSync(f, 'utf8'))).map(rel);
    expect(offenders, `effective/그래프를 읽으세요. 위반: ${offenders.join(', ')}`).toEqual([]);
  });

  it('노드 자산 피드(/nodes/:id/assets)는 useNodeAssets(현황 투영 hydration)에서만 읽는다', () => {
    const ALLOW = new Set(['hooks/useNodeAssets.ts']);
    const re = /api\.get\s*(?:<[^>]*>)?\s*\(\s*[`'"]\/nodes\/[^`'"]*\/assets/;
    const offenders = FILES.filter((f) => !ALLOW.has(rel(f)) && re.test(readFileSync(f, 'utf8'))).map(rel);
    expect(offenders, `현황 행은 useSubstationStatusRows(projectStatusRows) 로. 위반: ${offenders.join(', ')}`).toEqual([]);
  });

  it('useNodeAssets 훅은 현황 투영 훅에서만 import(다른 뷰는 effective 사용)', () => {
    const ALLOW = new Set([
      'hooks/useNodeAssets.ts',
      'features/assets/useSubstationStatusRows.ts',
      'features/assets/components/NodeStatusView.tsx',
    ]);
    // 값 import 만 차단(type-only import 는 허용 — 런타임 소비 아님).
    const re = /import\s+\{[^}]*\buseNodeAssets\b[^}]*\}\s+from/;
    const typeOnly = /import\s+type\s+\{/;
    const offenders = FILES.filter((f) => {
      if (ALLOW.has(rel(f))) return false;
      const src = readFileSync(f, 'utf8');
      return re.test(src) && !src.split('\n').some((l) => /\buseNodeAssets\b/.test(l) && typeOnly.test(l));
    }).map(rel);
    expect(offenders, `effective 를 노드 스코프로 필터해 쓰세요. 위반: ${offenders.join(', ')}`).toEqual([]);
  });

  it('삭제된 useSlimAssets 훅이 재생성되지 않았다(effective/그래프로 일원화 유지)', () => {
    const offenders = FILES.filter((f) => /export\s+function\s+useSlimAssets\b/.test(readFileSync(f, 'utf8'))).map(rel);
    expect(offenders, `전역 자산은 useEffectiveAssets/useTraceGraph 로. 위반: ${offenders.join(', ')}`).toEqual([]);
  });
});
