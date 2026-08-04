import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseDgn } from '../background/dgn.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dgn = fs.readFileSync(path.join(__dirname, 'fixtures', 'test_dgnv8.dgn'));

describe('parseDgn — WASM 파이프라인', () => {
  it('커밋된 wasm 산출물로 V8 파일을 파싱한다', async () => {
    const bg = await parseDgn(dgn, 'test_dgnv8.dgn');

    expect(bg.source.fileType).toBe('DGN');
    expect(bg.source.fileName).toBe('test_dgnv8.dgn');
    expect(bg.paths.length).toBeGreaterThan(0);
  });

  it('레이어 이름은 level 번호로 합성된다', async () => {
    const bg = await parseDgn(dgn, 'test_dgnv8.dgn');
    expect(bg.layers.map((l) => l.name)).toContain('Level 64');
    for (const l of bg.layers) expect(l.isVisible).toBe(true);
  });

  it('모든 path.layer 는 선언된 레이어 목록에 있다', async () => {
    const bg = await parseDgn(dgn, 'test_dgnv8.dgn');
    const names = new Set(bg.layers.map((l) => l.name));
    for (const p of bg.paths) expect(names.has(p.layer)).toBe(true);
  });

  it('bounds 가 유한값이고 points 는 짝수 길이다', async () => {
    const bg = await parseDgn(dgn, 'test_dgnv8.dgn');
    for (const v of [bg.bounds.minX, bg.bounds.minY, bg.bounds.maxX, bg.bounds.maxY]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    for (const p of bg.paths) expect(p.points.length % 2).toBe(0);
  });

  it('손상된 바이트는 PARSE_FAILED 로 거절한다', async () => {
    await expect(parseDgn(Buffer.from('not a dgn'), 'bad.dgn')).rejects.toMatchObject({
      status: 400,
      code: 'PARSE_FAILED',
    });
  });
});
