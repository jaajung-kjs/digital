import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseBackground } from '../background/parse.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => fs.readFileSync(path.join(__dirname, 'fixtures', name));

describe('parseBackground — DWG', () => {
  it('실제 평면도 DWG 를 파싱해 레이어·경로·bounds 를 만든다', async () => {
    const bg = await parseBackground(fixture('plan-sample.dwg'), 'plan-sample.dwg');

    expect(bg.source.fileType).toBe('DWG');
    expect(bg.source.fileName).toBe('plan-sample.dwg');
    expect(bg.layers.length).toBeGreaterThan(0);
    expect(bg.paths.length).toBeGreaterThan(0);

    // bounds 는 유한값이고 폭·높이가 양수여야 한다.
    for (const v of [bg.bounds.minX, bg.bounds.minY, bg.bounds.maxX, bg.bounds.maxY]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(bg.bounds.maxX).toBeGreaterThan(bg.bounds.minX);
    expect(bg.bounds.maxY).toBeGreaterThan(bg.bounds.minY);

    // 모든 path 의 points 는 (x,y) 쌍이므로 길이가 짝수이고 최소 2점이다.
    for (const p of bg.paths) {
      expect(p.points.length % 2).toBe(0);
      expect(p.points.length).toBeGreaterThanOrEqual(4);
    }

    // 모든 path.layer 는 선언된 레이어 목록에 있어야 한다(고아 레이어 참조 금지).
    const names = new Set(bg.layers.map((l) => l.name));
    for (const p of bg.paths) expect(names.has(p.layer)).toBe(true);
  });

  it('층 도면은 실척이므로 cm 규모다 — 폭이 100cm 이상 100만cm 이하', async () => {
    const bg = await parseBackground(fixture('plan-sample.dwg'), 'plan-sample.dwg');
    const width = bg.bounds.maxX - bg.bounds.minX;
    expect(width).toBeGreaterThan(100);
    expect(width).toBeLessThan(1_000_000);
  });
});

describe('parseBackground — DGN', () => {
  it('.dgn 을 DGN 파서로 보낸다', async () => {
    const bg = await parseBackground(fixture('test_dgnv8.dgn'), 'test_dgnv8.dgn');
    expect(bg.source.fileType).toBe('DGN');
    expect(bg.paths.length).toBeGreaterThan(0);
  });

  it('.DGN 대문자도 받는다', async () => {
    const bg = await parseBackground(fixture('test_dgnv8.dgn'), 'TEST.DGN');
    expect(bg.source.fileType).toBe('DGN');
  });
});

describe('parseBackground — 디스패치', () => {
  it('미지원 확장자는 UNSUPPORTED_FORMAT 과 함께 DXF 변환을 안내한다', async () => {
    await expect(parseBackground(Buffer.from('x'), 'drawing.pdf')).rejects.toMatchObject({
      status: 400,
      code: 'UNSUPPORTED_FORMAT',
    });
    await expect(parseBackground(Buffer.from('x'), 'drawing.pdf')).rejects.toThrow(/DXF/);
  });

  it('확장자 판정은 대소문자를 무시한다', async () => {
    const bg = await parseBackground(fixture('plan-sample.dwg'), 'PLAN-SAMPLE.DWG');
    expect(bg.source.fileType).toBe('DWG');
  });
});
