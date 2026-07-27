import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe('v2 프론트 가드레일 — 타입키/역할 분기 금지', () => {
  it('v2 소스(테스트 제외)에 자산 타입 키 리터럴·role/key 비교가 없다', () => {
    const v2dir = dirname(dirname(fileURLToPath(import.meta.url))); // frontend/src/v2
    const files = walk(v2dir).filter((f) => (f.endsWith('.ts') || f.endsWith('.tsx')) && !f.includes('__tests__'));
    const forbidden =
      /["'`](RACK|OFD|OFD-SLOT|DIST|FEEDER|GROUNDING|HVAC|PITR-2000|PITR-5000)["'`]|\brole\s*[!=]==|\basset\.key\s*===|\btype\.key\s*===/;
    for (const f of files) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(forbidden);
    }
  });
});
