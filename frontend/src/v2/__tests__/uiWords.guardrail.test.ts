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
 * 보는 곳: `frontend/src/**`·`packages/core/src/**`(시드 제외)·`backend/src/v2/**` 의 `.ts`·`.tsx`(시험 제외)에서 주석을 걷은 뒤, 문자열·템플릿 리터럴과
 * JSX 글자 안의 한글. 느슨하게 만들지 말고 글자를 고친다 — 정말 예외가 있으면 ALLOW 에 파일+구절과 까닭을 적는다.
 */
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO = join(SRC, '..', '..');

/**
 * 화면에 닿는 글자는 frontend 밖에서도 온다 — 검증 문구(core)와 서버가 돌려주는 오류 문구(backend)가
 * 그대로 화면 띠·칸 아래에 뜬다. 같은 검사를 그 뿌리에도 건다. 시드(공식 품목 이름)는 제외한다.
 */
const ROOTS: ReadonlyArray<{ dir: string; skip?: RegExp }> = [
  { dir: SRC },
  { dir: join(REPO, 'packages', 'core', 'src'), skip: /[\\/]seed[\\/]/ },
  { dir: join(REPO, 'backend', 'src', 'v2') },
];

/** 파일(src 기준 경로) → 허용 구절. 더하려면 까닭을 한 줄로 적는다. */
const ALLOW: ReadonlyArray<{ file: string; phrase: string; why: string }> = [
  { file: 'v2/components/admin/StandardsPanel.tsx', phrase: 'label="공사종류"', why: '조달청 표 열 이름 그대로' },
];

const FORBIDDEN: ReadonlyArray<[string, RegExp]> = [
  ['회로', /회로/],
  ['안의 설비', /안의 설비/],
  ['종류', /종류/],
  ['자산', /자산/],
  // 판 — 홀로 쓴 명사만(「판매」「분전판」「판단」「평판」 같은 낱말 속 글자는 제외). 앞이 한글이 아니고 뒤가 한글이 아니거나 조사.
  ['판', /(?<![가-힣])판(?![가-힣])|(?<![가-힣])판(?=(?:을|를|이|가|은|는|의|에|도|과|와|으로|입니다|마다|만|별))/],
  ['키(열 머리)', /(['"`>])키\1?(?=['"`<])|^\s*키\s*$|label:\s*['"`]키['"`]/],
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/**
 * 주석을 공백으로 바꾼다(줄 수·자리는 그대로). 문자열 안의 `/*`·`//` 는 주석을 열지 못한다 —
 * 작은 토크나이저로 '…' "…" `…`(`${}` 중첩 포함)를 따라간다. 따옴표는 줄이 끝나면 닫힌 것으로 본다
 * (JSX 글자 속 아포스트로피가 뒤를 삼키지 않게). JSX 글자 속 `//` 는 같은 줄 뒤에 `</`·`/>` 가 있으면 글자로 본다.
 */
export function stripComments(src: string): string {
  let out = '';
  let i = 0;
  const tpl: number[] = []; // 템플릿 리터럴 안 `${` 의 중괄호 깊이 스택
  let braces = 0;
  let q: string | null = null; // ' " ` 안
  while (i < src.length) {
    const c = src[i]!;
    const n = src[i + 1];
    if (q) {
      if (c === '\\') { out += c + (n ?? ''); i += 2; continue; }
      if (c === '\n' && q !== '`') { q = null; out += c; i++; continue; }
      if (q === '`' && c === '$' && n === '{') { tpl.push(braces); braces = 0; q = null; out += '${'; i += 2; continue; }
      if (c === q) q = null;
      out += c; i++; continue;
    }
    if (c === "'" || c === '"' || c === '`') { q = c; out += c; i++; continue; }
    if (tpl.length > 0) {
      if (c === '{') braces++;
      else if (c === '}') {
        if (braces === 0) { braces = tpl.pop()!; q = '`'; out += c; i++; continue; }
        braces--;
      }
    }
    if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? src.length : end + 2;
      out += src.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop; continue;
    }
    if (c === '/' && n === '/') {
      const nl = src.indexOf('\n', i);
      const stop = nl < 0 ? src.length : nl;
      const lineStart = src.lastIndexOf('\n', i - 1) + 1;
      const rest = src.slice(i, stop);
      const atStart = src.slice(lineStart, i).trim() === '';
      if (atStart || !/<\/|\/>/.test(rest)) { out += ' '.repeat(stop - i); i = stop; continue; }
    }
    out += c; i++;
  }
  return out;
}

function hits(): string[] {
  const out: string[] = [];
  for (const f of ROOTS.flatMap((r) => walk(r.dir).filter((p) => !r.skip?.test(p)))) {
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

  it('주석 걷기 — 문자열 속 /* 는 주석이 아니고, 진짜 주석은 걷힌다', () => {
    const flagged = (src: string) => FORBIDDEN.some(([, re]) => stripComments(src).split('\n').some((l) => re.test(l)));
    expect(flagged('<input accept="image/*" />\n<b>회로</b>')).toBe(true);
    expect(flagged('<span>a // 회로</span>')).toBe(true);
    expect(flagged('/* 회로 */\nconst a = 1;')).toBe(false);
    expect(flagged('const a = 1; // 회로')).toBe(false);
    expect(flagged('const a = `x ${b} /* ${"회로"}`;')).toBe(true);
    expect(stripComments('a\n/* x\ny */\nb').split('\n')).toHaveLength(4);
  });

  it('키 열 머리 — 줄 단독 JSX 글자·label 도 잡는다', () => {
    expect(flaggedWord('<th>\n  키\n</th>', '키(열 머리)')).toBe(true);
    expect(flaggedWord("{ label: '키' }", '키(열 머리)')).toBe(true);
    expect(flaggedWord("'키보드'", '키(열 머리)')).toBe(false);
  });

  it('판 조사 — 입니다·마다·으로 는 잡고 분전반·판매·판단은 놓아 둔다', () => {
    for (const w of ['판입니다', '판마다', '판으로']) expect(flaggedWord(w, '판')).toBe(true);
    for (const w of ['판매', '판단', '분전반']) expect(flaggedWord(w, '판')).toBe(false);
  });
});

function flaggedWord(text: string, name: string): boolean {
  return text.split('\n').some((l) => FORBIDDEN.some(([n, re]) => n === name && re.test(l)));
}
