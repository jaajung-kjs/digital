import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, dirname, join, resolve, sep } from 'node:path';
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
  function checkDir(v2dir: string, ext: string) {
    // canvas/* 제외: x/y/width/height 를 TypeScript Pick 타입 인수로 쓰는 기하 코드
    // (예: hitTest.ts 의 Pick<V2Asset, 'x'|'y'|'width'|'height'>) — 재정의가 아님.
    const files = walk(v2dir).filter(
      (f) => f.endsWith(ext) && !f.includes('__tests__') && !f.includes(`${sep}canvas${sep}`),
    );

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
  }

  it('backend/src/v2 소스(테스트 제외)에 배치 필드명 9개 전체를 나열한 로컬 배열/집합 리터럴이 없다', () => {
    // PLACEMENT_FIELDS 가 @twin/core 에서 import 되는 곳(commit.service.ts)은
    // 필드명 리터럴 열거가 없어야 한다. 9개 중 임의 4개 이상을 나열한 패턴을 탐지.
    const v2dir = dirname(dirname(fileURLToPath(import.meta.url))); // backend/src/v2
    checkDir(v2dir, '.ts');
  });

  it('frontend/src/v2 소스(테스트 제외)에 배치 필드명 로컬 배열/집합 리터럴이 없다 (R-3 범위 확장)', () => {
    // reportSelectors.ts 가 @twin/core PLACEMENT_FIELDS 를 import 한 이후,
    // frontend/src/v2 전체에서도 리터럴 재정의가 없어야 한다.
    const backendSrc = dirname(dirname(fileURLToPath(import.meta.url))); // backend/src/v2
    // backend/src/v2 → ../../.. → project root → frontend/src/v2
    const fev2dir = resolve(backendSrc, '..', '..', '..', 'frontend', 'src', 'v2');
    checkDir(fev2dir, '.ts');
    checkDir(fev2dir, '.tsx');
  });
});

describe('v2 가드레일 §6-4 — aRef/bRef 끝점 접근 peerResolve.ts 한 곳 규칙 (B-V1 회귀 핀)', () => {
  /**
   * V2Cable.aRef / .bRef 프로퍼티에 대한 실제 값 접근(읽기)은
   * peerResolve.ts 와 types.ts(타입 선언)에만 허용된다.
   * 다른 파일에서 .aRef 또는 .bRef 를 참조하면 인라인 peer 해소 또는 ref 추출
   * 재구현으로 간주한다(§6-4 단일 구현 위반).
   *
   * 허용 목록:
   *   - peerResolve.ts : 끝점 해소 단일 구현 (endpointRef · resolvePeer · cableEndpointName)
   *   - types.ts       : V2Cable 인터페이스 선언 (aRef?: V2CableRef 필드 선언)
   */
  it('frontend/src/v2 비-테스트 소스에서 aRef/bRef 프로퍼티 접근이 peerResolve.ts 외에 없다', () => {
    const backendSrc = dirname(dirname(fileURLToPath(import.meta.url))); // backend/src/v2
    const fev2dir = resolve(backendSrc, '..', '..', '..', 'frontend', 'src', 'v2');

    const ALLOWLIST = new Set(['peerResolve.ts', 'types.ts']);
    // aRef 또는 bRef 프로퍼티 접근 패턴: `.aRef` `?.aRef` `'aRef'` `"aRef"` (선언·접근)
    // 주석 내 단어('aRef/bRef 접근 금지' 등)는 /\baRef\b/ 에 걸리므로 프로퍼티 접근 형태만 검사.
    const pattern = /[.?!['"`]\s*[ab]Ref\b/;

    const files = walk(fev2dir).filter(
      (f) => (f.endsWith('.ts') || f.endsWith('.tsx')) && !f.includes('__tests__'),
    );

    for (const f of files) {
      if (ALLOWLIST.has(basename(f))) continue;
      expect(
        readFileSync(f, 'utf8'),
        `${f}: aRef/bRef 직접 접근 감지 — peerResolve.ts 의 endpointRef·resolvePeer·cableEndpointName 을 사용하세요 (§6-4 한 곳 규칙)`,
      ).not.toMatch(pattern);
    }
  });
});

describe('v2 가드레일 §6-4 — overlay effective-merge overlay.ts 한 곳 규칙 (B-V2 회귀 핀)', () => {
  /**
   * overlay.ts 의 mergeEffective 함수가 effective 상태 병합의 유일한 구현이어야 한다.
   * 다른 파일에서 .creates + .updates + .deletes 세 키를 모두 직접 순회하면
   * mergeEffective 의 인라인 재구현으로 간주한다(§6-4 단일 구현 위반).
   *
   * 허용 목록(경계 소유자 — 병합이 아니라 직렬화 또는 이터레이션 목적):
   *   - overlay.ts            : mergeEffective 및 stage* 단일 구현 원본
   *   - workingCopyStore.ts   : 오버레이 상태를 정의하는 스토어 (경계 소유자)
   *   - buildCommitPayload.ts : 커밋 페이로드 직렬화 (creates/updates/deletes 전송 경계)
   *   - reportSelectors.ts    : 리포트 항목 생성 경계 — 각 버킷을 별도 이터레이션(병합 아님)
   *                             (합계 공량 계산은 mergeEffective 경유, 버킷 이터레이션은 별도 용도)
   */
  it('frontend/src/v2 비-테스트 소스에서 overlay trio(.creates+.updates+.deletes) 동시 참조가 허용 경계 파일 외에 없다', () => {
    const backendSrc = dirname(dirname(fileURLToPath(import.meta.url))); // backend/src/v2
    const fev2dir = resolve(backendSrc, '..', '..', '..', 'frontend', 'src', 'v2');

    // 경계 소유자 — 위 JSDoc 주석 참조
    const ALLOWLIST = new Set([
      'overlay.ts',
      'workingCopyStore.ts',
      'buildCommitPayload.ts',
      'reportSelectors.ts',
    ]);

    const files = walk(fev2dir).filter(
      (f) => (f.endsWith('.ts') || f.endsWith('.tsx')) && !f.includes('__tests__'),
    );

    for (const f of files) {
      if (ALLOWLIST.has(basename(f))) continue;
      const src = readFileSync(f, 'utf8');
      const hasCreates = /\.creates\b/.test(src);
      const hasUpdates = /\.updates\b/.test(src);
      const hasDeletes = /\.deletes\b/.test(src);
      const isTrio = hasCreates && hasUpdates && hasDeletes;
      expect(
        isTrio,
        `${f}: overlay .creates/.updates/.deletes 3키 동시 참조 감지 — 수제 effective-merge 재구현 의심. overlay.ts 의 mergeEffective 를 사용하세요 (§6-4 한 곳 규칙)`,
      ).toBe(false);
    }
  });
});
