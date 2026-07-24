import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe('코어 순수성 가드레일', () => {
  it('runtime dependency 0', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(pkg.dependencies ?? {}).toEqual({});
  });

  it('src 에서 node 내장/외부 모듈 import 금지 (테스트 파일 제외)', () => {
    const srcDir = new URL('.', import.meta.url).pathname;
    const files = walk(srcDir).filter((f) => f.endsWith('.ts') && !f.includes('.test.'));
    for (const f of files) {
      const code = readFileSync(f, 'utf8');
      expect(code, f).not.toMatch(/from ['"](node:|@prisma|express|axios)/);
    }
  });
});
