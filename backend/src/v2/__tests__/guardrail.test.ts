import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SEED_ASSET_TYPES, PLACEMENT_FIELDS } from '@twin/core';

/**
 * ── 정적 가드레일의 알려진 한계 (은폐 금지, §6-5) ──────────────────────────
 *
 * 아래는 이 파일의 정규식 기반 검사가 **잡지 못하는** 형태다. 완전 방탄화는
 * Global Constraints 비목표로 명시돼 있으므로, 대신 여기 문서화해 다음 리뷰가
 * 무엇이 남아있는지 알 수 있게 한다.
 *
 *   1. 별칭 후 비교(alias-then-compare):
 *        const r = user.role; r === 'admin'
 *      role/키 값을 지역 변수에 옮겨 담으면 `\brole\s*[!=]==` 패턴이 변수명
 *      `r`에는 걸리지 않는다.
 *   2. switch 분기: `switch (role) { case 'admin': ... }`
 *   3. 배열 포함 검사: `['admin'].includes(user.role)`
 *   4. 메서드 체인 접두: `type.key.startsWith('RACK')`
 *   5. case 리터럴: `case 'RACK':`
 *   6. 동적/런타임 import: `await import('@prisma/client')`,
 *      `require('@prisma/client')` — 이 파일의 금지는 정적 `from '...'` 형태만
 *      잡는다.
 *   7. 중첩 구조분해: `const { cable: { aRef } } = row` / `const { overlays:
 *      { creates, updates, deletes } } = s` — 구조분해 검출은 1단계 패턴만
 *      본다(2026-07-30 2차 감사 최종리뷰 M3).
 *
 * 이 중 (1)(2)(3)은 role 비교, (4)(5)는 타입 키 분기, (6)은 @prisma/client
 * 재도입 금지에 대응한다. 발견 시 코드 리뷰에서 사람이 잡아야 한다 — 이
 * 목록이 늘어나면(특히 실제 사용례가 생기면) 새 정규식을 추가하는 것보다
 * AST 기반 검사로 전환할 시점을 검토할 것.
 */

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
/**
 * 스캔 대상 수집. **0개면 던진다** — 이 파일의 가드레일 대부분은 수집된 파일을
 * 순회하며 위반을 찾는 형태라, 수집이 비면 위반도 0이 되어 전부 조용히 통과한다.
 * (walk/필터가 깨지거나 디렉터리가 옮겨진 경우가 그렇다.) 가드가 꺼진 것을
 * "통과"로 보고하는 것이 가드 자체보다 위험하므로 여기서 끊는다.
 */
function srcFiles(dir: string, exts: string[]): string[] {
  const found = walk(dir).filter((f) => {
    if (!exts.some((e) => f.endsWith(e))) return false;
    const parts = f.split(sep);
    if (parts.some((p) => p === '__tests__')) return false;
    if (parts.some((p) => p === 'generated')) return false;
    if (parts.some((p) => p === 'dist')) return false;
    if (f.includes('.test.')) return false;
    return true;
  });
  if (found.length === 0) {
    throw new Error(`[guardrail] 스캔 대상 0개: ${dir} (${exts.join(',')}) — 가드레일이 무력화된 상태다`);
  }
  return found;
}

// ── 루트 기준 경로 계산 ─────────────────────────────────────────────────────
// 이 파일: backend/src/v2/__tests__/guardrail.test.ts
// __tests__ → v2 → src → backend → (project root)
const thisDir = dirname(fileURLToPath(import.meta.url)); // backend/src/v2/__tests__
const backendSrc = resolve(thisDir, '..', '..'); //         backend/src
const projectRoot = resolve(backendSrc, '..', '..'); //     project root
const frontendSrc = resolve(projectRoot, 'frontend', 'src'); // frontend/src
const coreSrc = resolve(projectRoot, 'packages', 'core', 'src'); // packages/core/src

/**
 * 절대경로 → 프로젝트 루트 기준 상대경로(POSIX 구분자 고정).
 * 허용목록은 반드시 이 형태(정확한 경로)로 비교한다 — basename 비교는 트리
 * 어디든 같은 이름의 파일을 만들면 자동 면제되는 우회로였다(가드레일 갭 분석 2c).
 */
function relToRoot(f: string): string {
  return relative(projectRoot, f).split(sep).join('/');
}

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
   * FieldDef 조회에 .key 를 정당하게 사용한다 — 장비 품목 분기와 무관.
   * 따라서 .key\s*=== 검사는 도메인 서버 코드(backend/src)에만 적용한다.
   */
  it('backend/src 소스(테스트·generated 제외)에 장비 품목 키 리터럴·role 비교·.key 직접 비교가 없다', () => {
    // 시드 타입 키 목록을 SEED_ASSET_TYPES 에서 동적 파생 — 하드코딩 금지.
    const seedKeys = SEED_ASSET_TYPES.map((t) => t.key);
    const keyPattern = seedKeys.map((k) => `["'\`]${k.replace(/-/g, '\\-')}["'\`]`).join('|');
    const forbidden = new RegExp(`(${keyPattern})|\\brole\\s*[!=]==|\\.key\\s*===`);

    for (const f of srcFiles(backendSrc, ['.ts'])) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(forbidden);
    }
  });

  it('frontend/src 소스(테스트·generated 제외)에 장비 품목 키 리터럴·role 비교가 없다', () => {
    // 프론트엔드는 .key 를 키보드 이벤트·FieldDef 조회에 사용하므로 .key\s*=== 는 제외.
    // 장비 품목 키 리터럴과 domain role 직접 비교만 금지.
    // asset.key/type.key/typeKey 비교(==/!=)는 구 frontend/src/v2/__tests__/guardrail.test.ts
    // (B-S2, 중복 스캐너)에만 있던 핀 — 단일 홈으로 통합하며 이관.
    const seedKeys = SEED_ASSET_TYPES.map((t) => t.key);
    const keyPattern = seedKeys.map((k) => `["'\`]${k.replace(/-/g, '\\-')}["'\`]`).join('|');
    const forbidden = new RegExp(
      `(${keyPattern})|\\brole\\s*[!=]==|\\basset\\.key\\s*[!=]==|\\btype\\.key\\s*[!=]==|\\btypeKey\\s*[!=]==`,
    );

    for (const f of srcFiles(frontendSrc, ['.ts', '.tsx'])) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(forbidden);
    }
  });

  /**
   * 스코프 확장(가드레일 갭 분석 7번): packages/core/src 는 지금까지 role/타입키
   * 리터럴 금지 검사 대상이 아니었다 — core 에 role 문자열 분기가 추가돼도 어떤
   * 가드레일도 못 잡는 사각지대였다.
   *
   * 예외(정확한 경로 1개, basename 아님): packages/core/src/seed/catalog.ts 는
   * SEED_ASSET_TYPES 자체의 선언 원본이다 — 이 파일의 키 리터럴은 **데이터**이지
   * 휴리스틱 분기가 아니다(파일 전체가 "키가 무엇인가"의 SSOT). 데이터 ≠ 휴리스틱:
   * 분기 코드가 문자열을 추측하는 것과, 데이터 파일이 자신의 데이터를 선언하는
   * 것은 다르다. 이 파일에서 role 비교가 발견되면(현재 0건) 그건 데이터가 아니라
   * 진짜 분기이므로 여전히 걸린다 — 예외는 시드 키 리터럴 패턴에만 적용된다.
   */
  it('packages/core/src 소스(테스트 제외)에 장비 품목 키 리터럴·role 비교가 없다(시드 데이터 파일 제외)', () => {
    const CORE_SEED_DATA_ALLOWLIST = new Set(['packages/core/src/seed/catalog.ts']);

    const seedKeys = SEED_ASSET_TYPES.map((t) => t.key);
    const keyPattern = seedKeys.map((k) => `["'\`]${k.replace(/-/g, '\\-')}["'\`]`).join('|');
    const literalForbidden = new RegExp(`${keyPattern}`);
    const roleForbidden = /\brole\s*[!=]==/;

    for (const f of srcFiles(coreSrc, ['.ts'])) {
      const src = readFileSync(f, 'utf8');
      const rel = relToRoot(f);
      expect(src, `${rel}: role 비교 감지`).not.toMatch(roleForbidden);
      if (CORE_SEED_DATA_ALLOWLIST.has(rel)) continue; // 데이터 파일 — 위 JSDoc 참조
      expect(src, `${rel}: 장비 품목 키 리터럴 감지`).not.toMatch(literalForbidden);
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
   * 허용 목록(정확한 경로 — basename 아님. 가드레일 갭 분석 2c: 어디든 같은
   * 이름의 파일을 만들면 자동 면제되는 우회로였다):
   *   - frontend/src/v2/peerResolve.ts : 끝점 해소 단일 구현 (endpointRef · resolvePeer · cableEndpointName)
   *   - frontend/src/v2/types.ts       : V2Cable 인터페이스 선언 (aRef?: V2CableRef 필드 선언)
   *
   * 구조분해 검출(가드레일 갭 분석 1번): `const { aRef, bRef } = cable;` 는
   * 기존 dot/quote 접두 패턴(`[.?!['"\`]`)에 안 걸린다 — `{`/`,` 가 접두 문자
   * 클래스에 없기 때문. 아래 destructurePattern 이 이를 보강한다.
   * 여전히 못 잡는 형태: `const { aRef: a } = cable;` 처럼 별칭을 준 뒤 이후
   * 코드에서 원 이름 대신 별칭 `a` 만 쓰는 경우는 이 파일 상단 "알려진 한계" 참고
   * (별칭-후-비교 계열과 동일한 근본 한계 — 정적 텍스트 스캔은 데이터플로우를 못 쫓는다).
   */
  it('frontend/src 비-테스트 소스에서 aRef/bRef 프로퍼티 접근이 peerResolve.ts 외에 없다', () => {
    const ALLOWLIST = new Set(['frontend/src/v2/peerResolve.ts', 'frontend/src/v2/types.ts']);
    // aRef 또는 bRef 프로퍼티 접근 패턴: `.aRef` `?.aRef` `'aRef'` `"aRef"` (선언·접근)
    // 주석 내 단어('aRef/bRef 접근 금지' 등)는 /\baRef\b/ 에 걸리므로 프로퍼티 접근 형태만 검사.
    const dotOrQuotePattern = /[.?!['"`]\s*[ab]Ref\b/;
    // 구조분해 할당: `{ ... aRef ... } = <expr>` (순서·동반 변수 무관, aRef 또는 bRef 단독도 포착)
    const destructurePattern = /\{[^}]*\b[ab]Ref\b[^}]*\}\s*=/;
    const pattern = new RegExp(`${dotOrQuotePattern.source}|${destructurePattern.source}`);

    const files = srcFiles(frontendSrc, ['.ts', '.tsx']);

    for (const f of files) {
      if (ALLOWLIST.has(relToRoot(f))) continue;
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
   * 허용 목록(정확한 경로 — basename 아님. 경계 소유자, 병합이 아니라 직렬화
   * 또는 이터레이션 목적):
   *   - frontend/src/v2/store/overlay.ts            : mergeEffective 및 stage* 단일 구현 원본
   *   - frontend/src/v2/store/workingCopyStore.ts   : 오버레이 상태를 정의하는 스토어 (경계 소유자)
   *   - frontend/src/v2/store/buildCommitPayload.ts : 커밋 페이로드 직렬화 (creates/updates/deletes 전송 경계)
   *   - frontend/src/v2/reportSelectors.ts          : 리포트 항목 생성 경계 — 각 버킷을 별도 이터레이션(병합 아님)
   *                                                    (합계 공량 계산은 mergeEffective 경유, 버킷 이터레이션은 별도 용도)
   *
   * 구조분해 검출(가드레일 갭 분석 2a번): `const { creates, updates, deletes } = o;`
   * 는 기존 dot 전제 정규식(`\.creates\b` 등) 3개 모두를 피해간다. 아래
   * hasDestructuredTrio 가 구조분해 블록(`{...} = ...`) 안에 세 식별자가
   * **순서 무관**으로 동시에 등장하는지 검사해 보강한다.
   * 여전히 못 잡는 형태(갭 분석 2b): 파일을 쪼개 creates/updates 를 한 파일,
   * deletes 를 다른 파일에 두면 파일 단위 trio 판정을 피해간다 — 이 검사는
   * 파일 단위이므로 구조적 회피는 코드 리뷰가 잡아야 한다(이 파일 상단
   * "알려진 한계" 참고).
   */
  function hasDestructuredTrio(src: string): boolean {
    // `{ ... } =` 형태(구조분해 할당)의 블록만 후보로 삼는다 — 객체 리터럴은
    // `= { ... }` 순서라 `}\s*=` 에 걸리지 않으므로 오탐이 아니다.
    const blocks = src.match(/\{[^}]*\}\s*=/g) ?? [];
    return blocks.some((b) => /\bcreates\b/.test(b) && /\bupdates\b/.test(b) && /\bdeletes\b/.test(b));
  }

  it('frontend/src 비-테스트 소스에서 overlay trio(.creates+.updates+.deletes) 동시 참조가 허용 경계 파일 외에 없다', () => {
    // 경계 소유자 — 위 JSDoc 주석 참조
    const ALLOWLIST = new Set([
      'frontend/src/v2/store/overlay.ts',
      'frontend/src/v2/store/workingCopyStore.ts',
      'frontend/src/v2/store/buildCommitPayload.ts',
      'frontend/src/v2/reportSelectors.ts',
    ]);

    const files = srcFiles(frontendSrc, ['.ts', '.tsx']);

    for (const f of files) {
      if (ALLOWLIST.has(relToRoot(f))) continue;
      const src = readFileSync(f, 'utf8');
      const hasCreates = /\.creates\b/.test(src);
      const hasUpdates = /\.updates\b/.test(src);
      const hasDeletes = /\.deletes\b/.test(src);
      const isDotTrio = hasCreates && hasUpdates && hasDeletes;
      const isTrio = isDotTrio || hasDestructuredTrio(src);
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
   *   - rackModule  : 구 장비 품목별 분기 모델 컬럼 — 완전 제거됨
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

describe('v2 가드레일 — CONVENTIONS.md 참조 컴포넌트 파일 실존 검증', () => {
  /**
   * frontend/src/components/ui/CONVENTIONS.md 는 CLAUDE.md 가 "UI 작업 전 필독"으로
   * 지정한 문서다 — 문서가 실재하지 않는 파일을 가리키면 그 부정확성은 스타일
   * 문제가 아니라 기능 결함이다(audit3-consistency 축4: Stage 7 구코드 삭제 후
   * 문서가 갱신되지 않아 컴포넌트 9개 참조가 유령 참조로 남았던 사례).
   *
   * 이 테스트는 문서 안의 백틱 `src/....ts(x)` 형태 파일 경로 참조가 전부 실제
   * 파일로 존재하는지를 정적으로 검증해, 다음에 파일이 삭제/이동될 때 문서가
   * 조용히 낡는 것을 막는다.
   *
   * 한계(§6-5, 완전 방탄화 비목표): 백틱으로 감싼 명시적 `src/...` 경로만
   * 검출한다. **`src/` 접두사가 없는 참조는 산문이든 백틱이든 모두 미검출**이다
   * — "Button 컴포넌트" 같은 산문뿐 아니라 `` `InfoTab.tsx` `` 처럼 백틱으로
   * 감싼 맨 파일명도 대상이 아니다. 이 문서는 실제 파일을 가리킬 때 경로를
   * 명시하는 관례이므로 현재 커버리지로 충분하다고 보되, 맨 파일명 참조가
   * 늘어나면 추출 정규식을 파일명 형태까지 확장할 것. 퍼지 파싱(마크다운 AST)
   * 은 비용 대비 이득이 낮아 도입하지 않는다.
   */
  it('CONVENTIONS.md 가 참조하는 src/... 파일 경로가 전부 실재한다', () => {
    const conventionsPath = resolve(frontendSrc, 'components', 'ui', 'CONVENTIONS.md');
    const doc = readFileSync(conventionsPath, 'utf8');
    const pathPattern = /`(src\/[^`]+\.tsx?)`/g;
    const referenced = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = pathPattern.exec(doc)) !== null) {
      referenced.add(m[1]);
    }
    // 추출 자체가 깨지지 않았는지(정규식이 0건만 뽑으면 이 테스트는 항상 무의미하게 통과한다)
    expect(referenced.size).toBeGreaterThan(0);

    for (const rel of referenced) {
      const abs = resolve(projectRoot, 'frontend', rel);
      expect(existsSync(abs), `CONVENTIONS.md 참조 파일이 존재하지 않습니다: ${rel}`).toBe(true);
    }
  });
});

describe('v2 가드레일 §Minor-5 — 프론트엔드 자산타입 키 리터럴 대문자 비교 금지', () => {
  /**
   * frontend/src 비-테스트 소스에서 .key === 'UPPERCASE' 형태의 비교가 없어야 한다.
   * 패턴: \.key\s*===\s*['"][A-Z][A-Z0-9-]*['"]
   * 백엔드 가드레일과 달리 프론트엔드는 키보드 이벤트(e.key === 'Enter') 등에서
   * .key 를 정당하게 사용하므로 .key\s*=== 전체 금지는 과잉이다.
   * 대신 대문자 전용 패턴으로 장비 품목 키 직접 비교(예: type.key === 'RACK')만 차단한다.
   *
   * 현재 트리: 0매치 확인 완료(2026-07-29, Stage 7 Task 5 fix round).
   */
  it('frontend/src 비-테스트 소스에 .key === 대문자리터럴 자산타입 비교가 없다', () => {
    // 대문자만으로 구성된(또는 대문자+숫자+하이픈) 키 리터럴 직접 비교 패턴
    const pattern = /\.key\s*===\s*['"][A-Z][A-Z0-9-]*['"]/;

    for (const f of srcFiles(frontendSrc, ['.ts', '.tsx'])) {
      expect(
        readFileSync(f, 'utf8'),
        `${f}: .key === '대문자키' 직접 비교 감지 — 장비 품목 분기는 카탈로그 메타(isPlaceable 등)를 사용하세요 (§Minor-5)`,
      ).not.toMatch(pattern);
    }
  });
});

describe('v2 가드레일 — DGN wasm 산출물·Rust 소스 드리프트 감지', () => {
  /**
   * `backend/src/v2/background/wasm/` 의 산출물은 저장소에 커밋되어 있고
   * (crates/dgn-background/README.md 참조), npm test 는 이 커밋된 wasm 만
   * 실행한다 — Rust 소스를 고치고 재빌드를 잊어도 npm test 는 낡은 wasm 을
   * 계속 통과시켜 소스가 산출물을 더 이상 설명하지 못하는 조용한 발산을 못 잡는다.
   *
   * 이 테스트는 실제 빌드 동일성을 검증할 수 없다(Rust 툴체인 없이는 불가능)
   * — 대신 소스·lockfile 의 SHA-256 을 여기 기대값과 비교해, 값이 바뀌면
   * "재빌드를 잊었을 수 있다"는 신호를 강제로 사람에게 던진다.
   * `cargo test`는 여기 넣지 않는다 — Rust 툴체인이 없는 머신에서 npm test 가 깨진다.
   */
  it('crates/dgn-background 의 lib.rs·Cargo.lock 해시가 마지막 wasm 재빌드 시점과 같다', () => {
    const EXPECTED_HASHES: Record<string, string> = {
      'crates/dgn-background/src/lib.rs':
        'fd4aa072fb72599251166048ae4e1f5e6ecd19fa7277ce7b036daa6839c0b819',
      'crates/dgn-background/Cargo.lock':
        'b83591596d3e719bc4e0f14b06c3b1d4f7089fc8175aea00fd56364eb8fbcbfd',
    };

    for (const [rel, expected] of Object.entries(EXPECTED_HASHES)) {
      const abs = resolve(projectRoot, rel);
      const actual = createHash('sha256').update(readFileSync(abs)).digest('hex');
      expect(
        actual,
        `${rel} 이 마지막 wasm 재빌드 이후 바뀌었습니다 — 커밋된 wasm 산출물` +
          `(backend/src/v2/background/wasm/)이 이 소스를 더 이상 설명하지 못할 수 있습니다.` +
          ` crates/dgn-background/README.md 의 재빌드 절차를 실행해 wasm 을 갱신·커밋한 뒤,` +
          ` 이 테스트의 EXPECTED_HASHES 값을 새 해시로 갱신하세요.`,
      ).toBe(expected);
    }
  });
});

describe('v2 가드레일 — BackgroundDrawing 타입 재정의 금지', () => {
  /**
   * 화면마다 되풀이되던 규칙들은 **공용 것 하나가 소유한다**.
   *
   * 이 계열의 결함이 유난히 잦았다: 같은 규칙이 여러 화면에 복제돼 있다가 한 곳만 고쳐진다.
   * 실제로 좌우 여백·스크롤 래퍼·선택 해제·첫 항목 열기·검색·키보드 경로·저장 안 한 초안
   * 보호·제자리 이름 바꾸기가 차례로 그랬고, 마지막 것은 **편집 내용이 조용히 사라지는**
   * 데까지 갔다. 뽑아 둔 것을 다시 손으로 쓰기 시작하면 여기서 걸린다.
   */
  it('제자리 이름 바꾸기를 손으로 다시 쓰지 않는다 — useInlineRename 을 쓴다', () => {
    /* 표식: `editingId`/`editingCategoryId` 같은 상태와 `Escape` 처리를 한 파일에서 함께
       들고 있으면 훅이 하는 일을 다시 쓰고 있는 것이다. 훅 자신과 인라인 셀은 제외한다. */
    const ALLOW = new Set([
      'frontend/src/components/ui/useInlineRename.tsx',
      'frontend/src/components/ui/InlineEditCell.tsx',
      'frontend/src/v2/components/InlineEditCell.tsx',
    ]);
    for (const f of srcFiles(frontendSrc, ['.ts', '.tsx'])) {
      if (ALLOW.has(relToRoot(f))) continue;
      const src = readFileSync(f, 'utf8');
      const hasEditingState = /const \[editing(Id|CategoryId|Name)\b/.test(src);
      const handlesEscape = /['"`]Escape['"`]/.test(src);
      expect(hasEditingState && handlesEscape, `${f}: 제자리 이름 바꾸기를 다시 쓰고 있다 — useInlineRename 을 쓰세요`).toBe(false);
    }
  });

  /**
   * **포트 구획 참조는 손으로 짓지 않는다** — `groupRefOf`·`groupRefOfTemplate` 이 짓는다.
   *
   * 네 화면이 같은 객체를 손으로 채우고 있었는데 그중 셋이 `variant` 를 빠뜨렸다. 그래서
   * 교류 판과 직류 판이 같은 이름이 되어, 이름 대신 그룹 키(`POWER-IN-AC`)가 화면에 튀어나왔다.
   * 칸이 늘 때마다 네 곳을 같이 고쳐야 하는 모양 자체를 막는다.
   */
  it('구획 참조는 groupRefOf 로 짓는다 — 손으로 채우지 않는다', () => {
    for (const f of srcFiles(frontendSrc, ['.ts', '.tsx'])) {
      const src = readFileSync(f, 'utf8');
      expect(
        /sampleName:/.test(src),
        `${f}: 구획 참조를 손으로 채우고 있다 — groupRefOf(포트) · groupRefOfTemplate(선언) 를 쓰세요`,
      ).toBe(false);
    }
  });

  /**
   * **보안 컨텍스트 전용 API 를 화면이 직접 부르지 않는다.**
   *
   * `crypto.randomUUID` 는 https·localhost 에서만 있다. 개발이 늘 localhost 라 아무도 몰랐고,
   * 운영 이미지를 평문 주소(`http://twin.local:8080`)로 열어 보고서야 드러났다 — 층 추가·설비
   * 배치·케이블 연결이 전부 `crypto.randomUUID is not a function` 으로 죽어 있었다. 사내망은
   * 평문 주소로 연다. 폴백을 가진 `newId()` 한 곳으로만 부른다.
   */
  it('화면이 crypto.randomUUID 를 직접 부르지 않는다 — newId 를 쓴다', () => {
    const ALLOW = new Set(['frontend/src/v2/newId.ts']);
    for (const f of srcFiles(frontendSrc, ['.ts', '.tsx'])) {
      if (ALLOW.has(relToRoot(f))) continue;
      const src = readFileSync(f, 'utf8');
      expect(
        /crypto\.randomUUID\s*\(/.test(src),
        `${f}: 평문 주소(사내망)에서는 없는 함수다 — newId() 를 쓰세요`,
      ).toBe(false);
    }
  });

  /**
   * **고른 포트는 화면이 따로 들고 있지 않는다** — 주소가 쥔다(`?port=`).
   *
   * 상세 판이 제 지역 상태로 고른 포트를 들고 있었다. 그래서 표에서 줄을 누르면 판이 따라왔지만
   * (주소를 거쳐서) 판에서 포트를 누르면 표는 아무것도 몰랐다 — 같은 것을 가리키는 두 화면이
   * 서로 다른 것을 고른 채 나란히 섰다. 선택이 사는 자리가 둘이면 반드시 어긋난다.
   */
  it('고른 포트를 화면이 따로 들고 있지 않는다 — 주소가 쥔다', () => {
    for (const f of srcFiles(frontendSrc, ['.ts', '.tsx'])) {
      const src = readFileSync(f, 'utf8');
      const hit = src.match(/const \[selected(Port|Core)\w*\s*,/);
      expect(hit?.[0], `${f}: 고른 포트를 지역 상태로 들고 있다 — 주소(useWorkspaceRoute)가 쥐게 하세요`).toBeUndefined();
    }
  });

  /**
   * **표의 행 높이는 한 곳에서 정한다**(`TABLE_ROW`).
   *
   * 같은 판(`TableCard`)을 쓰면서 높이는 화면마다 손으로 적고 있었다 — 선번장 `h-9`,
   * 계통 `h-11`, 현황은 아예 안 적어 내용에 따라 들쭉날쭉했다. 같은 표가 화면을 옮기면 줄
   * 사이가 달라 보이고, 이 표들은 눈으로 줄을 세는 물건이라(24심·10회로) 셈이 흐트러진다.
   */
  it('표 행 높이를 화면마다 다시 적지 않는다 — TABLE_ROW 를 쓴다', () => {
    const ALLOW = new Set(['frontend/src/components/ui/Table.tsx']);
    for (const f of srcFiles(frontendSrc, ['.ts', '.tsx'])) {
      if (ALLOW.has(relToRoot(f))) continue;
      const src = readFileSync(f, 'utf8');
      const hit = src.match(/h-\d+(?:\.\d+)? border-b border-line/);
      expect(hit?.[0], `${f}: 행 높이를 손으로 적었다 — TABLE_ROW 를 쓰세요`).toBeUndefined();
    }
  });

  /**
   * 「바깥을 누르면 고른 것이 풀린다」는 앱 공통 규칙(`useDismissOnOutside`)이다.
   *
   * 화면마다 제 손으로 「빈 곳」을 정의하면 반드시 한 곳이 빠진다 — 격자는 빈 칸과 Esc 만
   * 알아서 상단 머리줄을 눌러도 선택이 남아 있었다. 고르는 화면이 늘어날 때 이 훅을 쓰게
   * 한다: 선택 상태를 들고 있으면서 문서 수준 리스너를 손으로 다는 파일이 없어야 한다.
   */
  it('바깥 클릭 해제를 손으로 다시 쓰지 않는다 — useDismissOnOutside 를 쓴다', () => {
    const ALLOW = new Set(['frontend/src/components/ui/useDismissOnOutside.ts']);
    for (const f of srcFiles(frontendSrc, ['.ts', '.tsx'])) {
      if (ALLOW.has(relToRoot(f))) continue;
      const src = readFileSync(f, 'utf8');
      expect(
        /document\.addEventListener\(\s*['"`](pointerdown|mousedown|click)['"`]/.test(src),
        `${f}: 바깥 클릭을 직접 듣고 있다 — useDismissOnOutside 를 쓰세요`,
      ).toBe(false);
    }
  });

  it('BackgroundDrawing 타입은 @twin/core 에만 정의된다 (복제 금지)', () => {
    // 백엔드/프론트에 같은 타입을 다시 선언하면 두 정의가 조용히 갈라진다.
    // 허용된 정의처: packages/core/src/canvas/backgroundTypes.ts 단 하나.
    const offenders: string[] = [];
    const files = [
      ...srcFiles(backendSrc, ['.ts']),
      ...srcFiles(frontendSrc, ['.ts', '.tsx']),
      ...srcFiles(coreSrc, ['.ts']),
    ];
    for (const file of files) {
      if (relToRoot(file) === 'packages/core/src/canvas/backgroundTypes.ts') continue;
      const src = readFileSync(file, 'utf8');
      if (/(?:interface|type)\s+BackgroundDrawing\b/.test(src)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
