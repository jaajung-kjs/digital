import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Th } from '../../components/ui';
import { MEASURE_GROUPS } from '../components/lines/measureDraft';

/**
 * **배치 규칙이 되돌아오지 못하게 한다.** (CONVENTIONS §1.7-e2 · §1.7-g · §3.10)
 *
 * - 표의 바닥 폭을 `min-w-[…]` 로 정하지 않는다 — 판이 좁으면 열 순위로 병합·숨긴다(가로 스크롤 금지).
 * - 날짜·시각은 `DateInput`·`TimeInput` 으로만 받는다 — 네이티브 `date`·`datetime-local`·`time` 은 로케일 표기로 선다.
 * - 머리 단위(`Th unit`)에는 단위만 — 「경쟁」·「183일」 같은 수식어는 단위가 아니다.
 */
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = walk(SRC).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.includes('__tests__'));
const scan = (re: RegExp, allow: (rel: string) => boolean = () => false) => files.flatMap((f) => {
  const rel = relative(SRC, f);
  if (allow(rel)) return [];
  /* 주석 줄(`*`·`//`·`{/*`)은 건너뛴다 — 규칙을 설명하는 글이 걸리지 않게. */
  return readFileSync(f, 'utf8').split('\n').flatMap((line, i) => (re.test(line) && !/^\s*(\*|\/\/|\/\*|\{\/\*)/.test(line) ? [`${rel}:${i + 1} ${line.trim().slice(0, 100)}`] : []));
});

/** 단위로 쓰는 말 — 이 밖의 것이 `unit` 에 들어오면 수식어다. */
const UNITS = new Set(['m', 'km', 'dB', '원', '원/m', '원/일', '인', '인/m', '%', 'V', 'A', 'mm', 'cm']);

/**
 * `unit={식}` 으로 단위를 넘기는 자리 — 식이라 소스에서 값을 읽을 수 없으니, 그 값이 오는 곳을 여기서 따로 단언한다.
 * 새 자리가 생기면 여기에 더하고 그 값들을 `UNITS` 로 검사한다.
 */
const UNIT_EXPR_ALLOW: Record<string, string> = {
  'v2/components/catalog/CatalogTable.tsx': '열 선언(V2CatalogPage 의 unit 리터럴 — 아래 리터럴 검사가 본다)',
  'v2/components/lines/MeasureHeadRows.tsx': 'MEASURE_GROUPS(아래에서 검사)',
  'v2/components/equipment/breakerColumns.tsx': 'HEAD 표(unit 리터럴 — 아래 리터럴 검사가 본다)',
};

describe('배치 가드레일', () => {
  it('표 래퍼에 min-w-[…] 바닥 폭이 없다(가로 스크롤 금지)', () => {
    expect(scan(/min-w-\[/)).toEqual([]);
  });

  it('네이티브 date·datetime-local·time 입력이 없다(DateInput 의 숨은 달력 고르개만 예외)', () => {
    expect(scan(/type=["'](date|datetime-local|time)["']/, (rel) => rel === 'components/ui/DateInput.tsx')).toEqual([]);
  });

  it('Th unit 에는 단위만 들어간다 — 글자(unit="…"·unit={\'…\'})든 열 선언의 unit: \'…\' 이든', () => {
    const bad = files.flatMap((f) => {
      const src = readFileSync(f, 'utf8');
      const lits = [
        ...src.matchAll(/<Th\b[^>]*\bunit=(?:"([^"]+)"|\{['"`]([^'"`]+)['"`]\})/g),
        ...src.matchAll(/\bunit:\s*['"`]([^'"`]+)['"`]/g),
      ].map((m) => m[1] ?? m[2]!);
      /* 열 키가 「unit」인 폭 표(`PRINT_WIDTH.unit: '40px'`)는 단위가 아니다. */
      return lits.filter((u) => !UNITS.has(u) && !/^\d+px$/.test(u)).map((u) => `${relative(SRC, f)} unit="${u}"`);
    });
    expect(bad).toEqual([]);
  });

  it('Th unit={식} 은 값이 검사되는 자리에서만', () => {
    const exprs = files.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/<Th\b[^>]*\bunit=\{(?!['"`])[^}]+\}/g)].map(() => relative(SRC, f)));
    expect([...new Set(exprs)].filter((rel) => !(rel in UNIT_EXPR_ALLOW))).toEqual([]);
    for (const g of MEASURE_GROUPS) expect(UNITS.has(g.unit), g.unit).toBe(true);
  });

  it('공용 Th 는 단위를 같은 줄 괄호로 그린다 — 아랫줄 블록이 없다(그린 결과로 본다)', () => {
    const { container } = render(<table><thead><tr><Th unit="m">길이</Th><Th>이름</Th></tr></thead></table>);
    const [withUnit, plain] = [...container.querySelectorAll('th')];
    expect(withUnit!.textContent).toBe('길이(m)');
    /* 단위가 든 머리도 단위 없는 머리와 같은 뼈대 — 말줄임 줄 하나(`span.block`) 안에 이름과 단위가 함께 든다. */
    const blocks = (th: Element) => [...th.querySelectorAll('div, p, span.block, br')];
    expect(blocks(withUnit!)).toHaveLength(1);
    expect(blocks(plain!)).toHaveLength(1);
    expect(blocks(withUnit!)[0]!.textContent).toBe('길이(m)');
  });
});
