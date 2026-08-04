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
   * 이 파이프라인의 핵심 좌표 변환 세 개를 실측값으로 못 박는다.
   * 픽스처는 master_unit=`m`, uor_per_master=10000 이고, 방출 도형의 master 범위는
   * x ∈ [-2, 6] · y ∈ [-1, 7] 이다(B-스플라인 제어폴리곤이 x 최소, LINE_STRING 이 최대).
   *   ① master→cm ×100   → 폭 8 m = 800 cm, 높이 8 m = 800 cm
   *   ② Y축 뒤집기        → CAD y-up 이 canvas y-down 으로
   *   ③ 원점 정규화       → minX/minY 가 정확히 0 (DWG `normalize()` 와 같은 관례)
   * 셋 중 하나라도 빠지면 여기서 깨진다. 특히 ③ 이 빠지면 minY 가 -700 이 된다.
   */
  it('좌표는 master→cm(×100) 환산·Y축 뒤집기·원점 정규화를 거친다', async () => {
    const bg = await parseDgn(dgn, 'test_dgnv8.dgn');
    expect(bg.bounds).toEqual({ minX: 0, minY: 0, maxX: 800, maxY: 800 });
  });

  it('모든 좌표가 정규화된 bounds 안에 들어온다', async () => {
    const bg = await parseDgn(dgn, 'test_dgnv8.dgn');
    // 문자 앵커도 bounds 에 참여하고 같은 (dx,dy) 로 평행이동되므로 함께 확인한다.
    const coords: Array<[number, number]> = [
      ...bg.paths.flatMap((p) => {
        const xy: Array<[number, number]> = [];
        for (let i = 0; i < p.points.length; i += 2) xy.push([p.points[i], p.points[i + 1]]);
        return xy;
      }),
      ...bg.texts.map((t): [number, number] => [t.x, t.y]),
    ];
    expect(coords.length).toBeGreaterThan(0);
    for (const [x, y] of coords) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(bg.bounds.maxX);
      expect(y).toBeLessThanOrEqual(bg.bounds.maxY);
    }
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

describe('parseDgn — 엔티티 매핑', () => {
  it('문자를 방출하고 비ASCII 를 보존한다', async () => {
    const bg = await parseDgn(dgn, 'test_dgnv8.dgn');
    expect(bg.texts.length).toBe(4);
    expect(bg.texts.map((t) => t.text)).toContain('myTéxt');
    for (const t of bg.texts) {
      expect(Number.isFinite(t.x)).toBe(true);
      expect(Number.isFinite(t.y)).toBe(true);
      expect(t.size).toBeGreaterThan(0);
    }
  });

  it('Line 만 있을 때보다 경로가 늘어난다 — LineString·Shape·Arc·Ellipse·복합체가 포함된다', async () => {
    const bg = await parseDgn(dgn, 'test_dgnv8.dgn');
    // Line 4개만 처리하던 Task 5 대비 확연히 많아야 한다.
    expect(bg.paths.length).toBeGreaterThan(15);
  });

  it('Shape 은 closed 로 표시된다', async () => {
    const bg = await parseDgn(dgn, 'test_dgnv8.dgn');
    expect(bg.paths.some((p) => p.closed === true)).toBe(true);
  });

  it('원호/타원은 테셀레이션되어 다점 경로가 된다', async () => {
    const bg = await parseDgn(dgn, 'test_dgnv8.dgn');
    // 부분 원호 12분할 → 13점(26 좌표), 전체 타원 24분할 → 25점(50 좌표).
    expect(bg.paths.some((p) => p.points.length >= 26)).toBe(true);
  });

  it('색상은 팔레트로 변환되고 BYLEVEL(256)은 #404040 로 대체된다', async () => {
    const bg = await parseDgn(dgn, 'test_dgnv8.dgn');
    const colored = [...bg.paths, ...bg.texts].filter((x) => x.color != null);
    expect(colored.length).toBeGreaterThan(0);
    for (const x of colored) expect(x.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    // color_index 256(BYLEVEL) 인 TEXT 는 override 를 달지 않고 레벨 색을 상속한다.
    expect(bg.texts.filter((t) => t.color == null).length).toBe(1);
    expect(bg.layers.every((l) => l.color === '#404040')).toBe(true);
  });

  it('레벨 1·64 가 모두 레이어로 나온다', async () => {
    const bg = await parseDgn(dgn, 'test_dgnv8.dgn');
    const names = bg.layers.map((l) => l.name);
    expect(names).toContain('Level 1');
    expect(names).toContain('Level 64');
  });

  /**
   * 컨트롤러 판단 2 — `model.elements` 전수 순회를 유지하고 컨테이너 헤더
   * (Cell·ComplexChain·ComplexShape·TextNode·BSplineCurve)만 건너뛴다.
   * 자식은 전수 순회에서 한 번만 처리되므로 **이중 방출이 없어야 한다.**
   *
   * 픽스처의 방출 대상(ezdgn 로 직접 덤프해 센 값):
   *   LINE 17개 중 축퇴 2개 제외 = 15 × 2점 = 30
   *   LINE_STRING  2 × 3점  =  6
   *   SHAPE        6 × 4점  = 24   (그중 4개는 CELL 의 자식)
   *   CURVE        2 × 8점  = 16
   *   BSPLINE_POLE 2 × 21점 = 42
   *   ELLIPSE      3 × 25점 = 75   (24분할 + 닫는 점)
   *   ARC          5 × 13점 = 65   (12분할 + 닫는 점)
   *   합계 35 경로 / 258 점
   * 헤더가 자식을 한 번 더 방출하면 이 숫자들이 전부 커진다.
   */
  it('복합체 헤더는 도형을 방출하지 않는다 — 자식이 두 번 나오지 않는다', async () => {
    const bg = await parseDgn(dgn, 'test_dgnv8.dgn');
    expect(bg.paths.length).toBe(35);
    const totalPoints = bg.paths.reduce((n, p) => n + p.points.length / 2, 0);
    expect(totalPoints).toBe(258);
    // closed 는 SHAPE 6 + ELLIPSE 3 = 9.
    //   ELLIPSE 는 항상 한 바퀴를 훑으므로 닫힘(DWG 의 CIRCLE·전체 ELLIPSE 와 같은 관례).
    //   ARC 5개는 sweep 이 전부 ±π 라 하나도 닫히지 않는다(전체 원이면 닫힌다).
    // CELL 자식 SHAPE 4개가 겹쳐 방출되면 13이 되므로 이중 방출도 함께 잡는다.
    expect(bg.paths.filter((p) => p.closed === true).length).toBe(9);
    // 테셀레이션 분할 수도 함께 고정한다(전체 25점, 부분 13점).
    expect(bg.paths.filter((p) => p.points.length === 50).length).toBe(3);
    expect(bg.paths.filter((p) => p.points.length === 26).length).toBe(5);
  });

  /**
   * 컨트롤러 판단(축퇴 도형) — 임계값이 아니라 정의다.
   * 서로 다른 점이 2개 미만이면 선이 아니므로 방출하지 않는다.
   * 픽스처의 LINE 2개가 (0,1)-(0,1) 로 축퇴돼 있다.
   */
  it('서로 다른 점이 2개 미만인 경로는 방출하지 않는다', async () => {
    const bg = await parseDgn(dgn, 'test_dgnv8.dgn');
    for (const p of bg.paths) {
      const seen = new Set<string>();
      for (let i = 0; i < p.points.length; i += 2) seen.add(`${p.points[i]},${p.points[i + 1]}`);
      expect(seen.size).toBeGreaterThanOrEqual(2);
    }
  });

  /**
   * 컨트롤러 판단 3 — 선굵기.
   * (a) `BgPath.lineweight` 는 BYLAYER override 다. 레벨 기본값과 같으면 방출하지 않는다.
   * (b) 하한 0.025 cm 는 DWG(`dwg.ts` `lineweightToCm`)와 같은 값이다.
   * 픽스처의 weight 는 0(33개)과 5(1개)뿐이고 둘 다 하한에 걸려 레벨 기본값과 같아지므로
   * **어떤 path 도 lineweight 를 달지 않아야 한다.**
   * 하한이 빠지면 weight 0 이 0.0 이 되어 33개 path 에 override 가 붙고 여기서 깨진다.
   * 무조건 방출로 되돌아가도 깨진다.
   */
  it('선굵기는 레벨 기본값과 다를 때만 방출한다 (하한 0.025 cm)', async () => {
    const bg = await parseDgn(dgn, 'test_dgnv8.dgn');
    expect(bg.layers.every((l) => l.lineweight === 0.025)).toBe(true);
    expect(bg.paths.filter((p) => p.lineweight != null).length).toBe(0);
  });
});
