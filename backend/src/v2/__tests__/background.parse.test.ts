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
    // 실측 핀 값 — 엔티티 종류 대부분이 사라지는 회귀가 나도 존재성 단언(length > 0)
    // 만으로는 못 잡는다(dwg.ts, 1,012줄, 이 브랜치의 최대 신규 코드 덩어리).
    expect(bg.layers.length).toBe(24);
    expect(bg.paths.length).toBe(2630);
    expect(bg.texts.length).toBe(151);
    expect(bg.filled.length).toBe(35);

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

describe('parseBackground — DXF', () => {
  // .dxf 분기 자체가 어떤 테스트도 안 거쳤었다(0 커버리지). 실제 DXF 픽스처 없이도
  // 최소한 .dxf 가 default(UNSUPPORTED_FORMAT) 분기로 새지 않고 parseDwg 로
  // 디스패치됨은 확인할 수 있다 — 정크 버퍼는 parseDwg 안에서 PARSE_FAILED 로
  // 거절되므로, UNSUPPORTED_FORMAT 이 아니라 PARSE_FAILED 가 나오면 분기를 탔다는
  // 뜻이다. (fileType 인자를 'DWG'/'DXF' 중 무엇으로 넘기든 정크 데이터는 둘 다
  // 파싱 실패하므로, 이 테스트는 인자값 자체의 오타까지는 구분하지 못한다 — 그건
  // 실제 DXF 픽스처가 있어야 잡힌다. 여기서는 분기 커버리지 0을 없애는 것이 목적.)
  it('정크 버퍼를 .dxf 로 넘기면 UNSUPPORTED_FORMAT 이 아니라 PARSE_FAILED 로 거절된다', async () => {
    await expect(parseBackground(Buffer.from('not a dxf'), 'drawing.dxf')).rejects.toMatchObject({
      status: 400,
      code: 'PARSE_FAILED',
    });
  });

  it('.DXF 대문자도 같은 파서로 디스패치된다', async () => {
    await expect(parseBackground(Buffer.from('not a dxf'), 'DRAWING.DXF')).rejects.toMatchObject({
      status: 400,
      code: 'PARSE_FAILED',
    });
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
