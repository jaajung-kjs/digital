import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * **화면 글자에 금지어가 다시 들어오지 못하게 한다.** (CONVENTIONS §0)
 *
 * 금지어: 회로 · 안의 설비 · 종류 · 자산 · 「판」(홀로 쓴 명사) · 열 머리 「키」.
 * 쓰는 말은 랙·설비·실장 설비·차단기·슬롯·품목·분야. 코드 식별자는 영문이라 걸리지 않는다.
 *
 * 보는 곳: `frontend/src/**` 의 `.ts`·`.tsx`(시험 제외)에서 주석을 걷은 뒤, 문자열·템플릿 리터럴과
 * JSX 글자 안의 한글. 느슨하게 만들지 말고 글자를 고친다 — 정말 예외가 있으면 ALLOW 에 파일+구절과 까닭을 적는다.
 */
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** 파일(src 기준 경로) → 허용 구절. 지금은 없다. 더하려면 까닭을 한 줄로 적는다. */
const ALLOW: ReadonlyArray<{ file: string; phrase: string; why: string }> = [];

const FORBIDDEN: ReadonlyArray<[string, RegExp]> = [
  ['회로', /회로/],
  ['안의 설비', /안의 설비/],
  ['종류', /종류/],
  ['자산', /자산/],
  // 판 — 홀로 쓴 명사만(「판매」「분전판」「판단」「평판」 같은 낱말 속 글자는 제외). 앞이 한글이 아니고 뒤가 한글이 아니거나 조사.
  ['판', /(?<![가-힣])판(?![가-힣])|(?<![가-힣])판(?=[을를이가은는의에도과와으로])/],
  ['키(열 머리)', /(['"`>])키\1?(?=['"`<])/],
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

function stripComments(src: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, ' ');
  return src
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    // 줄 주석 — URL(`://`)·문자열 속 `//` 는 건드리지 않게 앞이 `:` 가 아닌 `//` 만.
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, pre: string) => pre + ' '.repeat(m.length - pre.length));
}

function hits(): string[] {
  const out: string[] = [];
  for (const f of walk(SRC)) {
    if (!/\.tsx?$/.test(f) || /\.test\.tsx?$/.test(f) || f.includes('__tests__')) continue;
    const rel = relative(SRC, f);
    stripComments(readFileSync(f, 'utf8')).split('\n').forEach((line, i) => {
      if (!/[가-힣]/.test(line)) return;
      for (const [name, re] of FORBIDDEN) {
        if (!re.test(line)) continue;
        if (ALLOW.some((a) => a.file === rel && line.includes(a.phrase))) continue;
        out.push(`${rel}:${i + 1} [${name}] ${line.trim().slice(0, 100)}`);
      }
    });
  }
  return out;
}

describe('화면 글자 금지어', () => {
  it('회로·안의 설비·종류·자산·판·열 머리 키 가 화면 글자에 없다', () => {
    expect(hits()).toEqual([]);
  });

  it('검사가 눈이 멀지 않았다 — 금지어를 실제로 잡는다', () => {
    const probe = ['회로', '안의 설비', '종류', '자산', '빈 판', '판을 골라', '판'];
    for (const w of probe) {
      expect(FORBIDDEN.some(([, re]) => re.test(`'${w}'`) || re.test(w))).toBe(true);
    }
    expect(FORBIDDEN.some(([, re]) => re.test(`'키'`))).toBe(true);
    for (const ok of ['판매', '분전판', '판단', "'키보드'"]) {
      expect(FORBIDDEN.some(([, re]) => re.test(ok))).toBe(false);
    }
  });
});
