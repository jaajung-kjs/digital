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

/**
 * 가드레일 스캔 범위 (Stage 7 이후 전역)
 *
 * backend/src/**  및 frontend/src/** 전체를 검사한다.
 * — Stage 7 완료로 두 트리 모두 100% v2: 더 이상 v2 전용 서브-스코프 불필요.
 *
 * 공통 제외:
 *   - __tests__/ 또는 *.test.ts(x) — 테스트 코드 자체
 *   - generated/                   — Prisma 자동 생성(타입 선언 포함 UserRole 등)
 *   - dist/                        — 빌드 산출물
 */
function srcFiles(dir: string, exts: string[]): string[] {
  return walk(dir).filter((f) => {
    if (!exts.some((e) => f.endsWith(e))) return false;
    const parts = f.split(sep);
    if (parts.some((p) => p === '__tests__')) return false;
    if (parts.some((p) => p === 'generated')) return false;
    if (parts.some((p) => p === 'dist')) return false;
    if (f.includes('.test.')) return false;
    return true;
  });
}

// ── 루트 기준 경로 계산 ─────────────────────────────────────────────────────
// 이 파일: backend/src/v2/__tests__/guardrail.test.ts
// __tests__ → v2 → src → backend → (project root)
const thisDir = dirname(fileURLToPath(import.meta.url)); // backend/src/v2/__tests__
const backendSrc = resolve(thisDir, '..', '..'); //         backend/src
const projectRoot = resolve(backendSrc, '..', '..'); //     project root
const frontendSrc = resolve(projectRoot, 'frontend', 'src'); // frontend/src

describe('v2 가드레일 — 타입명/역할 분기 금지', () => {
  /**
   * 인증 계층 권한 게이트 예외 정책 (auth-layer exception):
   *
   * backend/src/v2/auth.middleware.ts 와 frontend/src/v2/authStore.ts 의
   * ADMIN_ROLES.includes(...) / isAdminRole(...) 패턴은 도메인 role 분기가 아니라
   * 인증 게이트 구현이므로 본 규칙의 적용 대상이 아니다.
   * 그러나 두 파일은 역할 비교를 헬퍼(ADMIN_ROLES.includes / isAdminRole)로
   * 캡슐화하고 있어 \brole\s*[!=]== 패턴에 걸리지 않으므로 별도 allowlist 불필요.
   * 이 주석은 의도를 문서화하는 목적이며, 검사를 약화하지 않는다.
   *
   * .key\s*=== 스코프 주의:
   * 프론트엔드는 e.key === 'Enter' / fd.key === 'switchState' 처럼 키보드 이벤트나
   * FieldDef 조회에 .key 를 정당하게 사용한다 — 자산 타입 분기와 무관.
   * 따라서 .key\s*=== 검사는 도메인 서버 코드(backend/src)에만 적용한다.
   */
  it('backend/src 소스(테스트·generated 제외)에 자산 타입 키 리터럴·role 비교·.key 직접 비교가 없다', () => {
    // 시드 타입 키 목록을 SEED_ASSET_TYPES 에서 동적 파생 — 하드코딩 금지.
    const seedKeys = SEED_ASSET_TYPES.map((t) => t.key);
    const keyPattern = seedKeys.map((k) => `["'\`]${k.replace(/-/g, '\\-')}["'\`]`).join('|');
    const forbidden = new RegExp(`(${keyPattern})|\\brole\\s*[!=]==|\\.key\\s*===`);

    for (const f of srcFiles(backendSrc, ['.ts'])) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(forbidden);
    }
  });

  it('frontend/src 소스(테스트·generated 제외)에 자산 타입 키 리터럴·role 비교가 없다', () => {
    // 프론트엔드는 .key 를 키보드 이벤트·FieldDef 조회에 사용하므로 .key\s*=== 는 제외.
    // 자산 타입 키 리터럴과 domain role 직접 비교만 금지.
    const seedKeys = SEED_ASSET_TYPES.map((t) => t.key);
    const keyPattern = seedKeys.map((k) => `["'\`]${k.replace(/-/g, '\\-')}["'\`]`).join('|');
    const forbidden = new RegExp(`(${keyPattern})|\\brole\\s*[!=]==`);

    for (const f of srcFiles(frontendSrc, ['.ts', '.tsx'])) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(forbidden);
    }
  });
});

describe('v2 가드레일 — PLACEMENT_FIELDS 리터럴 재정의 금지', () => {
  function checkDir(dir: string, ext: string) {
    // canvas/* 제외: x/y/width/height 를 TypeScript Pick 타입 인수로 쓰는 기하 코드
    // (예: hitTest.ts 의 Pick<V2Asset, 'x'|'y'|'width'|'height'>) — 재정의가 아님.
    const files = srcFiles(dir, [ext]).filter((f) => !f.includes(`${sep}canvas${sep}`));

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

  it('backend/src 소스(테스트·generated 제외)에 배치 필드명 9개 전체를 나열한 로컬 배열/집합 리터럴이 없다', () => {
    checkDir(backendSrc, '.ts');
  });

  it('frontend/src 소스(테스트·generated 제외)에 배치 필드명 로컬 배열/집합 리터럴이 없다', () => {
    checkDir(frontendSrc, '.ts');
    checkDir(frontendSrc, '.tsx');
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
  it('frontend/src 비-테스트 소스에서 aRef/bRef 프로퍼티 접근이 peerResolve.ts 외에 없다', () => {
    const ALLOWLIST = new Set(['peerResolve.ts', 'types.ts']);
    // aRef 또는 bRef 프로퍼티 접근 패턴: `.aRef` `?.aRef` `'aRef'` `"aRef"` (선언·접근)
    // 주석 내 단어('aRef/bRef 접근 금지' 등)는 /\baRef\b/ 에 걸리므로 프로퍼티 접근 형태만 검사.
    const pattern = /[.?!['"`]\s*[ab]Ref\b/;

    const files = srcFiles(frontendSrc, ['.ts', '.tsx']);

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
  it('frontend/src 비-테스트 소스에서 overlay trio(.creates+.updates+.deletes) 동시 참조가 허용 경계 파일 외에 없다', () => {
    // 경계 소유자 — 위 JSDoc 주석 참조
    const ALLOWLIST = new Set([
      'overlay.ts',
      'workingCopyStore.ts',
      'buildCommitPayload.ts',
      'reportSelectors.ts',
    ]);

    const files = srcFiles(frontendSrc, ['.ts', '.tsx']);

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

// ── Stage 7 신규 검사: 구 코드 재도입 차단 ────────────────────────────────────

describe('v2 가드레일 Stage 7 — 레거시 enum 토큰 재도입 금지', () => {
  /**
   * Stage 7에서 구 role enum (UserRole, AssetRole) 이 완전히 제거됐다.
   * generated/ 디렉토리(Prisma 자동 생성 타입)는 제외한다 — 구 클라이언트 유물일 수 있으나
   * 구 @prisma/client 자체가 제거됐으므로 생성 파일도 존재하지 않는다.
   * 이 검사는 구 enum 이 소스 코드에 재도입되는 것을 방지한다.
   */
  it('backend/src + frontend/src 소스에 UserRole / AssetRole enum 토큰이 없다', () => {
    // \b 경계로 UserRoleHelper 같은 파생 식별자를 구분한다.
    const pattern = /\bUserRole\b|\bAssetRole\b/;

    const beFiles = srcFiles(backendSrc, ['.ts']);
    const feFiles = srcFiles(frontendSrc, ['.ts', '.tsx']);

    for (const f of [...beFiles, ...feFiles]) {
      expect(
        readFileSync(f, 'utf8'),
        `${f}: 레거시 enum 토큰 UserRole/AssetRole 감지 — v2 role 은 소문자 문자열 'admin'|'viewer' 를 사용하세요 (Stage 7 enum 제거 회귀 핀)`,
      ).not.toMatch(pattern);
    }
  });

  /**
   * 구 Prisma 클라이언트 경로 재도입 금지.
   * v2 는 backend/src/generated/next-client 경로만 허용한다.
   * from '@prisma/client' 직접 import 는 구 클라이언트 의존으로 간주한다.
   */
  it("backend/src 소스에 from '@prisma/client' 직접 import 가 없다 (next-client 경로만 허용)", () => {
    const pattern = /from\s+['"]@prisma\/client['"]/;
    const beFiles = srcFiles(backendSrc, ['.ts']);

    for (const f of beFiles) {
      expect(
        readFileSync(f, 'utf8'),
        `${f}: 구 @prisma/client 직접 import 감지 — backend/src/generated/next-client 를 사용하세요 (Stage 7 DB 단일화 회귀 핀)`,
      ).not.toMatch(pattern);
    }
  });
});

describe('v2 가드레일 Stage 7 — 레거시 모델 필드 토큰 재도입 금지', () => {
  /**
   * 구 모델 잔재 필드:
   *   - sourceRole  : 구 자산 역할 enum 컬럼 (AssetRole 기반) — 완전 제거됨
   *   - rackModule  : 구 자산 타입별 분기 모델 컬럼 — 완전 제거됨
   *
   * 단어 경계(\b)를 사용해 rackModuleId, sourceRoleLabel 같은 파생 식별자를 구분한다.
   * RackModule(대문자 시작) 타입 선언도 포함 — 구 모델 재선언 방지.
   *
   * 현재 트리 검증: grep 으로 0 매치 확인 완료(2026-07-29, Stage 7 Task 5).
   * 향후 이 필드가 필요하면 v2 스키마에 신규 이름으로 추가하고 이 테스트를 업데이트할 것.
   */
  it('backend/src + frontend/src 소스에 구 모델 필드 sourceRole / rackModule 토큰이 없다', () => {
    const pattern = /\bsourceRole\b|\brackModule\b|\bRackModule\b/;

    const beFiles = srcFiles(backendSrc, ['.ts']);
    const feFiles = srcFiles(frontendSrc, ['.ts', '.tsx']);

    for (const f of [...beFiles, ...feFiles]) {
      expect(
        readFileSync(f, 'utf8'),
        `${f}: 구 모델 필드 sourceRole/rackModule 감지 — v2 스키마에 없는 레거시 컬럼입니다 (Stage 7 모델 제거 회귀 핀)`,
      ).not.toMatch(pattern);
    }
  });
});

describe('v2 가드레일 §Minor-5 — 프론트엔드 자산타입 키 리터럴 대문자 비교 금지', () => {
  /**
   * frontend/src 비-테스트 소스에서 .key === 'UPPERCASE' 형태의 비교가 없어야 한다.
   * 패턴: \.key\s*===\s*['"][A-Z][A-Z0-9-]*['"]
   * 백엔드 가드레일과 달리 프론트엔드는 키보드 이벤트(e.key === 'Enter') 등에서
   * .key 를 정당하게 사용하므로 .key\s*=== 전체 금지는 과잉이다.
   * 대신 대문자 전용 패턴으로 자산 타입 키 직접 비교(예: type.key === 'RACK')만 차단한다.
   *
   * 현재 트리: 0매치 확인 완료(2026-07-29, Stage 7 Task 5 fix round).
   */
  it('frontend/src 비-테스트 소스에 .key === 대문자리터럴 자산타입 비교가 없다', () => {
    // 대문자만으로 구성된(또는 대문자+숫자+하이픈) 키 리터럴 직접 비교 패턴
    const pattern = /\.key\s*===\s*['"][A-Z][A-Z0-9-]*['"]/;

    for (const f of srcFiles(frontendSrc, ['.ts', '.tsx'])) {
      expect(
        readFileSync(f, 'utf8'),
        `${f}: .key === '대문자키' 직접 비교 감지 — 자산 타입 분기는 카탈로그 메타(isPlaceable 등)를 사용하세요 (§Minor-5)`,
      ).not.toMatch(pattern);
    }
  });
});
