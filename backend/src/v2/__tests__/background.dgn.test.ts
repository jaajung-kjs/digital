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

  /**
   * 이 태스크의 핵심 변환 두 개를 실측값으로 못 박는다.
   * 픽스처는 4 m × 5 m 도면이다(uor_per_master=10000, master_unit=`m`).
   *   maxX  400 → master 4 m 가 400 cm 로 환산됐다 (master→cm ×100)
   *   minY -500 → master 5 m 가 500 cm 이고 **부호가 음수**다 (CAD Y-up → canvas Y-down)
   * bounds 하나가 환산 배율과 축 뒤집기를 동시에 고정한다. 어느 한쪽이 빠지면
   * (예: master_to_cm 이 1.0 을 반환하거나 Y 의 `-` 가 누락되면) 여기서 깨진다.
   *
   * Task 6 에서 엔티티 종류(문자·도형·곡선·복합체)가 늘면 paths 가 늘고 bounds 가
   * 넓어진다 — 그 변화는 정당하다. 이 핀의 목적은 그때 구현자가 값을 **의식적으로**
   * 갱신하게 만드는 것이다. 자동으로 통과하면 안 된다.
   */
  it('좌표는 master→cm(×100) 환산과 Y축 뒤집기를 거친다', async () => {
    const bg = await parseDgn(dgn, 'test_dgnv8.dgn');
    expect(bg.bounds).toEqual({ minX: 0, minY: -500, maxX: 400, maxY: 0 });
    expect(bg.paths.length).toBe(17);
  });

  it('points 는 [x,y] 쌍이라 항상 짝수 길이다', async () => {
    const bg = await parseDgn(dgn, 'test_dgnv8.dgn');
    for (const p of bg.paths) expect(p.points.length % 2).toBe(0);
  });

  it('손상된 바이트는 PARSE_FAILED 로 거절한다', async () => {
    await expect(parseDgn(Buffer.from('not a dgn'), 'bad.dgn')).rejects.toMatchObject({
      status: 400,
      code: 'PARSE_FAILED',
    });
  });
});
