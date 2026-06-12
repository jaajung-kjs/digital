import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ASSET_SCALAR_FIELDS } from '../src/schemas/substationCommit.schema.js';

/**
 * 자산 스칼라 필드는 백엔드 SSOT(`ASSET_SCALAR_FIELDS`, Zod·create·update 를 구동)와
 * 프론트 `ASSET_COMMON_FIELDS`(커밋 payload 빌더의 pickCommon) 두 곳에 손으로 나열돼 있다.
 * front/back 이 별도 패키지라 모듈을 직접 공유할 수 없어 생기는 이중화다.
 *
 * 한쪽에만 스칼라 컬럼을 추가하면(예: 백엔드만) 프론트가 그 필드를 커밋에 안 실어
 * **silent drop**(저장해도 값이 사라지는) 버그가 난다 — 과거 실제로 났던 버그 클래스.
 * 이 테스트가 두 목록의 동기화를 강제해 그 드리프트를 CI 에서 잡는다.
 * (컬럼 추가 시 양쪽을 함께 고치라는 신호.)
 */
describe('asset scalar fields: backend ↔ frontend in sync', () => {
  it('frontend ASSET_COMMON_FIELDS === backend ASSET_SCALAR_FIELDS keys', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const fePath = join(here, '../../frontend/src/features/workingCopy/substationCommit.ts');
    const src = readFileSync(fePath, 'utf8');

    const m = src.match(/ASSET_COMMON_FIELDS\s*=\s*\[([\s\S]*?)\]/);
    expect(m, 'ASSET_COMMON_FIELDS 배열을 프론트 substationCommit.ts 에서 못 찾음').toBeTruthy();

    const feFields = [...m![1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort();
    const beKeys = ASSET_SCALAR_FIELDS.map((f) => f.key).sort();

    expect(feFields).toEqual(beKeys);
  });
});
