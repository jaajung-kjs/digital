import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

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
const UNITS = new Set(['m', 'km', 'dB', '원', '원/m', '원/일', '인', '인/m', '인·일', '%', 'V', 'A', 'mm', 'cm']);

describe('배치 가드레일', () => {
  it('표 래퍼에 min-w-[…] 바닥 폭이 없다(가로 스크롤 금지)', () => {
    expect(scan(/min-w-\[/)).toEqual([]);
  });

  it('네이티브 date·datetime-local·time 입력이 없다(DateInput 의 숨은 달력 고르개만 예외)', () => {
    expect(scan(/type=["'](date|datetime-local|time)["']/, (rel) => rel === 'components/ui/DateInput.tsx')).toEqual([]);
  });

  it('Th unit 에는 단위만 들어간다', () => {
    const bad = files.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/<Th\b[^>]*\bunit="([^"]+)"/g)]
      .filter((m) => !UNITS.has(m[1]!)).map((m) => `${relative(SRC, f)} unit="${m[1]}"`));
    expect(bad).toEqual([]);
  });

  it('공용 Th 는 단위를 아랫줄로 내리지 않는다(한 줄 머리)', () => {
    const table = readFileSync(join(SRC, 'components/ui/Table.tsx'), 'utf8');
    expect(table).not.toMatch(/unit && <span className="block/);
  });
});
