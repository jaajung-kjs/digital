import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SEED_ASSET_TYPES, PLACEMENT_FIELDS } from '@twin/core';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe('v2 가드레일 — 타입명/역할 분기 금지', () => {
  it('v2 소스(테스트 제외)에 자산 타입 키 리터럴·role 비교가 없다', () => {
    const v2dir = dirname(dirname(fileURLToPath(import.meta.url))); // backend/src/v2
    const files = walk(v2dir).filter((f) => f.endsWith('.ts') && !f.includes('__tests__'));

    // 시드 타입 키 목록을 SEED_ASSET_TYPES 에서 동적 파생 — 하드코딩 금지.
    const seedKeys = SEED_ASSET_TYPES.map((t) => t.key);
    const keyPattern = seedKeys.map((k) => `["'\`]${k.replace(/-/g, '\\-')}["'\`]`).join('|');
    const forbidden = new RegExp(`(${keyPattern})|\\brole\\s*[!=]==|\\.key\\s*===`);

    for (const f of files) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(forbidden);
    }
  });
});

describe('v2 가드레일 — PLACEMENT_FIELDS 리터럴 재정의 금지', () => {
  it('backend/src/v2 소스(테스트 제외)에 배치 필드명 9개 전체를 나열한 로컬 배열/집합 리터럴이 없다', () => {
    // PLACEMENT_FIELDS 가 @twin/core 에서 import 되는 곳(commit.service.ts)은
    // 필드명 리터럴 열거가 없어야 한다. 9개 중 임의 3개 이상을 쉼표 구분으로 나열한 패턴을 탐지.
    // R-3 에서 frontend/src/v2 로 범위가 확장된다(reportSelectors.ts 이관 후).
    const v2dir = dirname(dirname(fileURLToPath(import.meta.url))); // backend/src/v2
    const files = walk(v2dir).filter((f) => f.endsWith('.ts') && !f.includes('__tests__'));

    // 9개 필드 중 4개 이상이 하나의 파일에서 리터럴 문자열로 등장하면 재정의 의심.
    // (import 선언의 { PLACEMENT_FIELDS } 나 런타임 사용 시 변수명은 통과 — 리터럴 따옴표 포함 형태만 검사)
    const fieldLiterals = PLACEMENT_FIELDS.map((f) => `["'\`]${f}["'\`]`);
    const threshold = 4; // 4개 이상 문자열 리터럴 = 재정의 의심

    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      const hits = fieldLiterals.filter((pattern) => new RegExp(pattern).test(src));
      expect(
        hits.length,
        `${file}: PLACEMENT_FIELDS 리터럴 ${hits.length}개 발견(재정의 의심) — @twin/core PLACEMENT_FIELDS 를 import하세요`,
      ).toBeLessThan(threshold);
    }
  });
});
