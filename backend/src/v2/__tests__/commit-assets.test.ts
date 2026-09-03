import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nextDb } from '../db.js';
import { authHeader, ensureTestTypes, makeApp, sweepTestFixtures } from './helpers.js';

const app = makeApp();
const uniq = `t2a-cm-${Date.now()}`;
const admin = { Authorization: authHeader('admin') };
let subId: string, floorId: string;
let pitrTypeId: string, slotTypeId: string, groundingTypeId: string;
/** 설비는 설비 품목으로 놓는다 — 타입이 아니라 설비 품목이 그 분류다. */
let optSetId: string, ofdAssemblyId: string;

const commit = (payload: unknown) =>
  request(app).put(`/api/v2/substations/${subId}/commit`).set(admin).send(payload as object);

beforeAll(async () => {
  await sweepTestFixtures();
  await ensureTestTypes();
  const hq = await nextDb.headquarters.create({ data: { name: `${uniq}-hq` } });
  const br = await nextDb.branch.create({ data: { name: `${uniq}-br`, headquartersId: hq.id } });
  const sub = await nextDb.substation.create({ data: { name: `${uniq}-ss`, branchId: br.id } });
  const floor = await nextDb.floor.create({ data: { name: `${uniq}-1층`, substationId: sub.id } });
  subId = sub.id;
  floorId = floor.id;
  const key = (k: string) => nextDb.assetType.findUniqueOrThrow({ where: { key: k } });
  pitrTypeId = (await key('PITR-5000')).id;
  slotTypeId = (await key('OFD-SLOT')).id;
  groundingTypeId = (await key('GROUNDING')).id;
  const asmKey = (k: string) => nextDb.assembly.findUniqueOrThrow({ where: { key: k } });
  optSetId = (await asmKey('OPT-SET')).id;
  ofdAssemblyId = (await asmKey('OFD')).id;
});

afterAll(async () => {
  await sweepTestFixtures();
  await nextDb.$disconnect();
});

describe('PUT /commit — assets', () => {
  it('설비+장비 2개를 한 커밋으로 생성(부모가 같은 커밋의 create), 포트 자동 인스턴스화', async () => {
    const rackId = randomUUID();
    const m1 = randomUUID(), m2 = randomUUID();
    await commit({
      assets: {
        creates: [
          // 자식을 먼저 배열에 넣어 위상정렬을 강제 검증
          { id: m1, name: `${uniq}-m1`, typeId: pitrTypeId, parentAssetId: rackId, col: 0, row: 0, colSpan: 1, rowSpan: 2 },
          { id: rackId, name: `${uniq}-rack`, assemblyId: optSetId, floorId, x: 0, y: 0, width: 60, height: 80 },
          { id: m2, name: `${uniq}-m2`, typeId: pitrTypeId, parentAssetId: rackId, col: 0, row: 2, colSpan: 1, rowSpan: 1 },
        ],
      },
    }).expect(200);
    /* 장비의 포트는 **그 품목의 명세대로** 만들어진다 — 개수를 여기 박아 두면 품목을
       고칠 때마다 이 시험이 깨진다. PITR 이 광·관리·전원·접지를 갖는다는 사실만 본다. */
    const m1Ports = await nextDb.port.findMany({ where: { assetId: m1 } });
    expect(m1Ports.length).toBeGreaterThan(0);
    expect(new Set(m1Ports.map((p) => p.medium))).toEqual(new Set(['fiber', 'network', 'power', 'ground']));
    // 설비 자신에게는 포트가 없다 — 포트를 갖는 것은 안에 든 장비다.
    expect(await nextDb.port.count({ where: { assetId: rackId } })).toBe(0);
  });

  it('자리 겹침 → 422 PLACEMENT_OVERLAP', async () => {
    const res = await commit({
      assets: {
        creates: [{ id: randomUUID(), name: `${uniq}-ov`, typeId: pitrTypeId, parentAssetId: await rackIdByName(), col: 0, row: 1, colSpan: 1, rowSpan: 1 }],
      },
    }).expect(422);
    expect(res.body.error).toBe('PLACEMENT_OVERLAP');
  });

  /**
   * 자리를 **서로 맞바꾸는** 재배열 — 최종 배치가 멀쩡하면 통과해야 한다.
   *
   * 예전에는 한 건씩 적용하며 그때그때의 DB 상태로 검사해서, 첫 건이 아직 옛 자리에 있는
   * 나머지와 겹쳐 늘 `PLACEMENT_OVERLAP` 이 났다. 화면은 오버레이를 다 얹은 최종 상태로
   * 판정하므로 놓이기는 하는데 저장만 안 되는 상태였다(슬롯 넷을 세로→가로로 돌리기).
   */
  it('두 장비의 자리를 맞바꾸는 커밋이 통과한다 (중간 상태가 아니라 최종 배치를 본다)', async () => {
    const rackId = randomUUID();
    const a = randomUUID(), b = randomUUID();
    await commit({
      assets: {
        creates: [
          { id: rackId, name: `${uniq}-swap-rack`, assemblyId: optSetId, floorId, x: 200, y: 0, width: 60, height: 80 },
          { id: a, name: `${uniq}-swap-a`, typeId: pitrTypeId, parentAssetId: rackId, col: 0, row: 0, colSpan: 1, rowSpan: 1 },
          { id: b, name: `${uniq}-swap-b`, typeId: pitrTypeId, parentAssetId: rackId, col: 0, row: 1, colSpan: 1, rowSpan: 1 },
        ],
      },
    }).expect(200);

    const versions = await nextDb.asset.findMany({ where: { id: { in: [a, b] } }, select: { id: true, updatedAt: true } });
    const at = (id: string) => versions.find((v) => v.id === id)!.updatedAt.toISOString();
    await commit({
      baseVersions: { [a]: at(a), [b]: at(b) },
      assets: { updates: [
        { id: a, patch: { row: 1 } },
        { id: b, patch: { row: 0 } },
      ] },
    }).expect(200);

    const after = await nextDb.asset.findMany({ where: { id: { in: [a, b] } }, select: { id: true, row: true } });
    expect(after.find((x) => x.id === a)!.row).toBe(1);
    expect(after.find((x) => x.id === b)!.row).toBe(0);
  });

  /* 담을 수 있는 것은 설비 품목으로 놓은 설비뿐이다 — 장비 안에 장비를 넣을 수는 없다.
     무엇을 담을지는 설비 품목을 짜는 사람이 정하지, 자리가 정하지 않는다(수용 규칙은 걷었다). */
  it('장비를 부모로 삼으면 422 INVALID_PARENT', async () => {
    const part = await nextDb.asset.findFirstOrThrow({ where: { substationId: subId, name: `${uniq}-m1` } });
    const res = await commit({
      assets: {
        creates: [{ id: randomUUID(), name: `${uniq}-na`, typeId: groundingTypeId, parentAssetId: part.id, col: 0, row: 0, colSpan: 1, rowSpan: 1 }],
      },
    }).expect(422);
    expect(res.body.error).toBe('INVALID_PARENT');
  });

  it('격자 밖 자리 → 422 PLACEMENT_OUT_OF_RANGE', async () => {
    const res = await commit({
      assets: {
        creates: [{ id: randomUUID(), name: `${uniq}-oor`, typeId: pitrTypeId, parentAssetId: await rackIdByName(), col: 0, row: 99, colSpan: 1, rowSpan: 1 }],
      },
    }).expect(422);
    expect(res.body.error).toBe('PLACEMENT_OUT_OF_RANGE');
  });

  /* 12심 판과 24심 판이 한 설비에 섞인다 — 성단은 개수가, 인입은 코어 수가 달라진다. */
  it('오버라이드: 12심 경로슬롯 → 성단 12 + 인입 1(코어 12)', async () => {
    const ofdId = randomUUID(), slotId = randomUUID();
    await commit({
      assets: {
        creates: [
          { id: ofdId, name: `${uniq}-ofd`, assemblyId: ofdAssemblyId, floorId, x: 100, y: 0, width: 40, height: 40 },
          { id: slotId, name: `${uniq}-slot12`, typeId: slotTypeId, parentAssetId: ofdId, col: 0, row: 0, portCounts: { FIBER: 12 }, portPositions: { 'FIBER-TRUNK': 12 } },
        ],
      },
    }).expect(200);
    const ports = await nextDb.port.findMany({ where: { assetId: slotId } });
    expect(ports.filter((p) => p.group === 'FIBER')).toHaveLength(12);
    const trunk = ports.find((p) => p.group === 'FIBER-TRUNK')!;
    // 인입은 언제나 포트 **하나** — 심선 수만큼 펴지 않는다.
    expect(trunk.positions).toBe(12);

    /* 전체 개수는 **그 품목의 선언에서** 센다 — 숫자를 박아 두면 카탈로그는 사용자가 고치는
       데이터라(그 품목에 전원 포트를 더할 수 있다) 시험이 남의 편집에 깨진다. */
    const templates = await nextDb.assetPortTemplate.findMany({ where: { typeId: slotTypeId } });
    const others = templates
      .filter((t) => t.group !== 'FIBER' && t.group !== 'FIBER-TRUNK')
      .reduce((n, t) => n + t.count, 0);
    expect(ports.length).toBe(12 + 1 + others);
  });

  it('OCC: 낡은 baseVersion 으로 update → 409 + conflicts', async () => {
    const rackId = await rackIdByName();
    const res = await commit({
      assets: { updates: [{ id: rackId, patch: { name: `${uniq}-rack2` } }] },
      baseVersions: { [rackId]: new Date('2000-01-01').toISOString() },
    }).expect(409);
    expect(res.body.details[0]).toMatchObject({ id: rackId, reason: 'modified' });
  });

  it('올바른 baseVersion 으로 update → 200, updatedAt 갱신', async () => {
    const rackId = await rackIdByName();
    const before = await nextDb.asset.findUniqueOrThrow({ where: { id: rackId } });
    await commit({
      assets: { updates: [{ id: rackId, patch: { name: `${uniq}-rack-renamed` } }] },
      baseVersions: { [rackId]: before.updatedAt.toISOString() },
    }).expect(200);
    const after = await nextDb.asset.findUniqueOrThrow({ where: { id: rackId } });
    expect(after.name).toBe(`${uniq}-rack-renamed`);
  });

  it('자식 있는 자산만 삭제 → 409 HAS_CHILDREN; 자식+부모 동시 삭제 → 200', async () => {
    const rackId = await rackIdByName(`${uniq}-rack-renamed`);
    const children = await nextDb.asset.findMany({ where: { parentAssetId: rackId }, select: { id: true, updatedAt: true } });
    const rack = await nextDb.asset.findUniqueOrThrow({ where: { id: rackId } });
    const bv = Object.fromEntries([[rackId, rack.updatedAt.toISOString()], ...children.map((c) => [c.id, c.updatedAt.toISOString()])]);
    const r1 = await commit({ assets: { deletes: [rackId] }, baseVersions: bv }).expect(409);
    expect(r1.body.error).toBe('HAS_CHILDREN');
    await commit({ assets: { deletes: [rackId, ...children.map((c) => c.id)] }, baseVersions: bv }).expect(200);
    expect(await nextDb.asset.count({ where: { id: rackId } })).toBe(0);
  });

  it('VIEWER 커밋 → 403', async () => {
    await request(app)
      .put(`/api/v2/substations/${subId}/commit`)
      .set('Authorization', authHeader('viewer'))
      .send({ assets: {} })
      .expect(403);
  });

  it('동일 UUID create 재제출 → 409 CONFLICT (details[0].reason === "exists")', async () => {
    const assetId = randomUUID();
    const payload = {
      assets: {
        creates: [{ id: assetId, name: `${uniq}-grounding-dup`, typeId: groundingTypeId }],
      },
    };
    // 첫 번째 커밋은 성공
    await commit(payload).expect(200);
    // 동일 UUID 재제출 → 409
    const res = await commit(payload).expect(409);
    expect(res.body.error).toBe('CONFLICT');
    expect(res.body.details[0]).toMatchObject({ id: assetId, reason: 'exists' });
  });
});

async function rackIdByName(name = `${uniq}-rack`): Promise<string> {
  const rack = await nextDb.asset.findFirstOrThrow({ where: { substationId: subId, name } });
  return rack.id;
}

describe('자산 상태 어휘', () => {
  // 상태 어휘는 core 의 ASSET_STATUSES 가 유일한 출처인데 커밋 스키마가 z.string() 이라
  // 사전에 없는 값이 그대로 저장됐다. 화면은 라벨 조회에 실패하면 값을 그대로 쓰므로
  // '점검필요' 같은 문자열이 상태처럼 보였다 — 저장 시점에 막는다.
  it('사전에 없는 상태는 거절한다', async () => {
    const res = await commit({
      baseVersions: {},
      assets: {
        creates: [
          { id: randomUUID(), name: `${uniq}-bad-status`, assemblyId: optSetId, status: '점검필요', floorId, x: 0, y: 0, width: 10, height: 10, fieldValues: {} },
        ],
      },
    }).expect(400);
    expect(res.body.error).toBe('BAD_REQUEST');
  });

  it('사전에 있는 상태는 통과한다', async () => {
    await commit({
      baseVersions: {},
      assets: {
        creates: [
          { id: randomUUID(), name: `${uniq}-ok-status`, assemblyId: optSetId, status: 'standby', floorId, x: 0, y: 0, width: 10, height: 10, fieldValues: {} },
        ],
      },
    }).expect(200);
  });
});

/**
 * 화면이 정한 포트 id 를 서버가 그대로 쓴다.
 *
 * 워킹카피는 「저장하면 이렇게 된다」이므로 화면도 놓는 순간 포트를 만든다(저장 전에도 포트
 * 탭·선번장·계통이 보여야 하고, 케이블도 이을 수 있어야 한다). 그때 이어 둔 케이블이 저장
 * 뒤에도 같은 포트를 가리키려면 id 가 바뀌면 안 된다.
 *
 * **구조는 명세가 정한다** — 화면이 없는 포트를 지어내도 서버 명세가 이긴다.
 */
describe('PUT /commit — 화면이 정한 포트 id', () => {
  it('준 id 로 포트가 만들어지고, 같은 커밋의 케이블이 그것을 가리킬 수 있다', async () => {
    const ofdId = randomUUID(), slotA = randomUUID(), slotB = randomUUID();
    const idsA = { 'FIBER-TRUNK:1': randomUUID(), 'FIBER:1': randomUUID() };
    const idsB = { 'FIBER-TRUNK:1': randomUUID(), 'FIBER:1': randomUUID() };
    const cableId = randomUUID();
    // 매체가 맞아야 이어진다 — 광 포트끼리는 광 그룹의 종류로만 잇는다.
    const cat = await nextDb.cableCategory.findFirstOrThrow({ where: { group: { key: 'fiber' } } });

    await commit({
      assets: {
        creates: [
          { id: ofdId, name: `${uniq}-ofd-pid`, assemblyId: ofdAssemblyId, floorId, x: 300, y: 0, width: 40, height: 40 },
          { id: slotA, name: `${uniq}-sA`, typeId: slotTypeId, parentAssetId: ofdId, col: 0, row: 0, portIds: idsA },
          { id: slotB, name: `${uniq}-sB`, typeId: slotTypeId, parentAssetId: ofdId, col: 1, row: 0, portIds: idsB },
        ],
      },
      // 저장 전에 이어 둔 케이블 — 포트가 그 id 로 만들어지지 않으면 여기서 터진다.
      cables: { creates: [{ id: cableId, aPortId: idsA['FIBER:1'], bPortId: idsB['FIBER:1'], categoryId: cat.id }] },
    }).expect(200);

    const trunk = await nextDb.port.findUnique({ where: { id: idsA['FIBER-TRUNK:1'] } });
    expect(trunk).toMatchObject({ assetId: slotA, group: 'FIBER-TRUNK', index: 1, positions: 24 });
    const cable = await nextDb.cable.findUniqueOrThrow({ where: { id: cableId } });
    expect([cable.aPortId, cable.bPortId]).toEqual([idsA['FIBER:1'], idsB['FIBER:1']]);
  });

  /* 구조는 명세가 정한다 — 없는 포트의 id 를 줘도 그 포트가 생기지는 않는다. */
  it('명세에 없는 포트 id 는 무시된다', async () => {
    const ofdId = randomUUID(), slotId = randomUUID();
    const ghost = randomUUID();
    await commit({
      assets: {
        creates: [
          { id: ofdId, name: `${uniq}-ofd-ghost`, assemblyId: ofdAssemblyId, floorId, x: 400, y: 0, width: 40, height: 40 },
          { id: slotId, name: `${uniq}-ghost`, typeId: slotTypeId, parentAssetId: ofdId, col: 0, row: 0, portIds: { 'NOPE:9': ghost } },
        ],
      },
    }).expect(200);
    expect(await nextDb.port.findUnique({ where: { id: ghost } })).toBeNull();
    // 명세대로 25개는 그대로 생긴다(인입 1 + 성단 24).
    expect(await nextDb.port.count({ where: { assetId: slotId } })).toBe(25);
  });
});

/**
 * 층도 이 채널로 온다 — **저장 하나로 층과 그 위의 설비가 함께 움직인다.**
 *
 * 층만 즉시 쓰기이던 동안 한 화면에 규칙이 둘이었고, 그 경계마다 예외가 생겼다: 그 층의
 * 설비를 지워도 저장 전에는 층을 못 지웠고(서버는 아직 있다고 본다), 되돌리기도 안 들었다.
 */
describe('PUT /commit — 층', () => {
  it('새 층과 그 위의 설비가 한 저장에 들어간다 — 층이 먼저다', async () => {
    const newFloor = randomUUID(), assetId = randomUUID();
    await commit({
      floors: { creates: [{ id: newFloor, name: `${uniq}-신설층`, sortOrder: 9 }] },
      assets: { creates: [{ id: assetId, name: `${uniq}-on-new`, assemblyId: ofdAssemblyId, floorId: newFloor, x: 0, y: 0, width: 40, height: 40 }] },
    }).expect(200);

    const row = await nextDb.asset.findUniqueOrThrow({ where: { id: assetId } });
    expect(row.floorId).toBe(newFloor);
  });

  it('그 층의 설비를 걷어내는 것과 층을 지우는 것이 한 저장에 들어간다', async () => {
    const floor2 = randomUUID(), assetId = randomUUID();
    await commit({
      floors: { creates: [{ id: floor2, name: `${uniq}-지울층`, sortOrder: 8 }] },
      assets: { creates: [{ id: assetId, name: `${uniq}-doomed`, assemblyId: ofdAssemblyId, floorId: floor2, x: 0, y: 0, width: 40, height: 40 }] },
    }).expect(200);

    const [f, a] = await Promise.all([
      nextDb.floor.findUniqueOrThrow({ where: { id: floor2 } }),
      nextDb.asset.findUniqueOrThrow({ where: { id: assetId } }),
    ]);
    /* 설비 삭제가 먼저 적용되고 그 다음 층이 지워진다 — 순서를 화면이 걱정하지 않는다. */
    await commit({
      assets: { deletes: [assetId] },
      floors: { deletes: [floor2] },
      baseVersions: { [floor2]: f.updatedAt.toISOString(), [assetId]: a.updatedAt.toISOString() },
    }).expect(200);

    expect(await nextDb.floor.findUnique({ where: { id: floor2 } })).toBeNull();
  });

  it('아직 설비가 남은 층은 지울 수 없다 — 무엇이 막았는지 말한다', async () => {
    const floor3 = randomUUID(), assetId = randomUUID();
    await commit({
      floors: { creates: [{ id: floor3, name: `${uniq}-찬층`, sortOrder: 7 }] },
      assets: { creates: [{ id: assetId, name: `${uniq}-stay`, assemblyId: ofdAssemblyId, floorId: floor3, x: 0, y: 0, width: 40, height: 40 }] },
    }).expect(200);
    const f = await nextDb.floor.findUniqueOrThrow({ where: { id: floor3 } });

    const res = await commit({
      floors: { deletes: [floor3] },
      baseVersions: { [floor3]: f.updatedAt.toISOString() },
    }).expect(409);
    expect(res.body.error).toBe('HAS_CHILDREN');
    expect(res.body.message).toMatch(/자산 1개/);
  });

  it('배경 도면은 층의 값일 뿐이다 — 저장으로 붙고 저장으로 떨어진다', async () => {
    const drawing = {
      source: { fileName: 'plan.dwg', importedAt: '2026-08-04T00:00:00.000Z', fileType: 'DWG' },
      bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
      layers: [], paths: [], texts: [], filled: [],
    };
    const before = await nextDb.floor.findUniqueOrThrow({ where: { id: floorId } });
    await commit({
      floors: { updates: [{ id: floorId, patch: { backgroundDrawing: drawing } }] },
      baseVersions: { [floorId]: before.updatedAt.toISOString() },
    }).expect(200);
    const withBg = await nextDb.floor.findUniqueOrThrow({ where: { id: floorId } });
    expect((withBg.backgroundDrawing as { source: { fileName: string } }).source.fileName).toBe('plan.dwg');

    await commit({
      floors: { updates: [{ id: floorId, patch: { backgroundDrawing: null } }] },
      baseVersions: { [floorId]: withBg.updatedAt.toISOString() },
    }).expect(200);
    /* 지운 자리는 새 층과 **같은 표현**이어야 한다(SQL NULL) — JSON null 리터럴이면 이 단언이 깨진다. */
    const [raw] = await nextDb.$queryRaw<{ is_sql_null: boolean }[]>`
      SELECT "backgroundDrawing" IS NULL AS is_sql_null FROM "Floor" WHERE id = ${floorId}
    `;
    expect(raw!.is_sql_null).toBe(true);
  });

  it('같은 이름의 층은 만들 수 없다 — 변전소 안에서 이름은 하나다', async () => {
    const res = await commit({
      floors: { creates: [{ id: randomUUID(), name: `${uniq}-1층`, sortOrder: 5 }] },
    }).expect(409);
    expect(res.body.error).toBe('DUPLICATE_NAME');
  });

  it('남이 고친 층은 덮어쓰지 않는다 — 자산·케이블과 같은 저울', async () => {
    const res = await commit({
      floors: { updates: [{ id: floorId, patch: { name: `${uniq}-바뀐이름` } }] },
      baseVersions: { [floorId]: '2020-01-01T00:00:00.000Z' },
    }).expect(409);
    expect(res.body.error).toBe('CONFLICT');
  });
});
