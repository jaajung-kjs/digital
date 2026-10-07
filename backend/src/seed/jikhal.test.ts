import { randomUUID } from 'node:crypto';
import { JIKHAL_INVENTORY, MASTER_CABLE_TYPES, MASTER_EQUIPMENT_TYPES, MASTER_RACK_TYPES, SEED_PICKS, validateState, type ModelState } from '@twin/core';
import { describe, expect, it } from 'vitest';
import { buildJikhalPayload } from './jikhal.js';
import { OPGW, STATIONS, seatedPlates } from './jikhalGangwon.js';
import { PLATE_CORES } from './jikhalGangwonCores.js';
import { PLATE_LINES } from './jikhalGangwonLines.js';
import { commitPayloadSchema } from '../v2/commit/schema.js';

let n = 0;
const input = () => ({
  substationIds: Object.fromEntries(STATIONS.map((s) => [s.key, `sub-${s.key}`])) as Record<(typeof STATIONS)[number]['key'], string>,
  rackTypeIds: Object.fromEntries(MASTER_RACK_TYPES.map((t) => [t.key, `rt-${t.key}`])),
  equipmentTypeIds: Object.fromEntries(MASTER_EQUIPMENT_TYPES.map((t) => [t.key, `et-${t.key}`])),
  cableTypeIds: Object.fromEntries(MASTER_CABLE_TYPES.map((t) => [t.key, `ct-${t.key}`])),
  newId: () => `id-${++n}`,
});

describe('buildJikhalPayload — 광선로', () => {
  it('OPGW 쌍마다 광선로 하나, 두 끝은 각 국의 OFD 와 판 자리', () => {
    const p = buildJikhalPayload(input());
    expect(p.fiberLines!.creates).toHaveLength(OPGW.length);
    const ofdIds = new Set(p.equipment!.creates!.filter((e) => e.name === 'OFD').map((e) => e.id));
    for (const l of p.fiberLines!.creates!) {
      expect(ofdIds.has(l.a.equipmentId!)).toBe(true);
      expect(ofdIds.has(l.b.equipmentId!)).toBe(true);
      expect(l.cableTypeId).toBe(`ct-${SEED_PICKS.opgwCableType}`);
    }
  });

  it('판 번호는 OFD 안의 자리 차례다(선번장 판 번호가 아니라 세운 판의 차례)', () => {
    const p = buildJikhalPayload(input());
    const seg = OPGW.find((s) => s.a === 'bukchuncheon' && s.aSlot === 2)!;
    const line = p.fiberLines!.creates!.find((l) => l.a.substationId === 'sub-bukchuncheon' && l.b.substationId === `sub-${seg.b}`
      && l.a.panel === seatedPlates('bukchuncheon').findIndex((x) => x.slot === 2) + 1);
    expect(line).toBeTruthy();
  });

  it('코어 수는 판의 성단 심수다', () => {
    const p = buildJikhalPayload(input());
    for (const l of p.fiberLines!.creates!) expect([4, 8, 12, 24, 48]).toContain(l.coreCount);
  });

  it('잰 값이 있는 코어마다 그 끝·날짜로 측정이 하나씩', () => {
    const p = buildJikhalPayload(input());
    const ms = p.coreMeasurements!.creates!;
    expect(ms.length).toBeGreaterThan(100);
    for (const x of ms) {
      expect(['A', 'B']).toContain(x.side);
      expect([x.loss1310, x.dist1310, x.loss1550, x.dist1550].some((v) => v != null)).toBe(true);
    }
  });

  it('국마다 3층과 OFD 랙·OFD 설비가 하나씩', () => {
    const p = buildJikhalPayload(input());
    expect(p.floors!.creates).toHaveLength(STATIONS.length);
    expect(p.racks!.creates!.filter((r) => r.rackTypeId === 'rt-RACK-OFD')).toHaveLength(STATIONS.length);
  });

  it('끝별 측정의 코어 번호는 그 끝 판의 잰 코어와 같다', () => {
    const p = buildJikhalPayload(input());
    const ms = p.coreMeasurements!.creates!;
    const lines = p.fiberLines!.creates!;
    expect(lines).toHaveLength(OPGW.length);
    const measured = (st: (typeof OPGW)[number]['a'], slot: number) =>
      (PLATE_LINES[st]?.[slot]?.cores ?? []).flatMap((c, i) => (c.every((v) => v == null) ? [] : [i + 1]));
    OPGW.forEach((seg, i) => {
      const line = lines[i]!;
      const nos = (side: 'A' | 'B') => ms.filter((m) => m.lineId === line.id && m.side === side).map((m) => m.coreNo).sort((x, y) => x - y);
      expect(nos('A')).toEqual(measured(seg.a, seg.aSlot));
      expect(nos('B')).toEqual(measured(seg.b, seg.bSlot));
    });
  });

  it('측정 코어 번호는 선로 코어 수를 넘지 않는다', () => {
    const p = buildJikhalPayload(input());
    const count = new Map(p.fiberLines!.creates!.map((l) => [l.id, l.coreCount]));
    for (const m of p.coreMeasurements!.creates!) expect(m.coreNo).toBeLessThanOrEqual(count.get(m.lineId)!);
  });

  it('OPGW 두 끝 판의 심수는 같다(자료 불변식)', () => {
    for (const seg of OPGW) {
      const a = seatedPlates(seg.a).find((x) => x.slot === seg.aSlot)!;
      const b = seatedPlates(seg.b).find((x) => x.slot === seg.bSlot)!;
      expect(a.cores).toBe(b.cores);
    }
  });
});

describe('buildJikhalPayload — 국 설비', () => {
  const p = buildJikhalPayload({ ...input(), inventory: JIKHAL_INVENTORY });

  it('인벤토리의 랙·설비가 OFD 와 함께 실린다', () => {
    const invEq = Object.values(JIKHAL_INVENTORY).reduce((n, s) => n + s.racks.reduce((m, r) => m + r.equipment.length, 0), 0);
    expect(p.equipment!.creates).toHaveLength(STATIONS.length + invEq);
  });

  it('회로가 있는 설비는 회로 수와 회로 값을 함께 싣는다', () => {
    const withCircuits = p.equipment!.creates!.filter((e) => (e.circuitCount ?? 0) > 0);
    expect(withCircuits.length).toBeGreaterThan(0);
    const total = withCircuits.reduce((n, e) => n + e.circuitCount!, 0);
    expect(p.circuits!.updates).toHaveLength(total);
  });

  it('직할 인벤토리의 점퍼는 하나도 버려지지 않는다 — 모든 판이 세운 광선로다', () => {
    const invLinks = Object.values(JIKHAL_INVENTORY).reduce((n, s) => n + s.links.length, 0);
    expect(p.links!.creates).toHaveLength(invLinks);
  });

  it('설비 끝의 표기는 포트뿐이다 — 부품 이름은 랙의 주 설비에만, 채운 장비 이름의 「/」 조각이 붙지 않는다', () => {
    for (const s of Object.values(JIKHAL_INVENTORY)) {
      /* 랙 이름과 같은 설비 = 랙의 주 설비(부품을 품는다). 나머지는 슬롯에 채운 장비 — 그 자체가 항목이다. */
      const main = new Set(s.racks.flatMap((r) => r.equipment.filter((e) => e.name === r.name).map((e) => e.name)));
      for (const l of s.links) for (const e of [l.a, l.b]) {
        if (!('equipment' in e) || e.label == null) continue;
        expect(e.label, `${e.equipment}`).toMatch(main.has(e.equipment) ? /^(?:[^ ]+ )?[A-Z0-9-]+:\d+$/ : /^[A-Z0-9-]+:\d+$/);
      }
    }
  });

  it('점퍼의 코어 끝은 그 국의 끝(A|B)으로 풀린다 — 판이 광선로가 아니면 버린다', () => {
    const lineEnds = new Map(p.fiberLines!.creates!.flatMap((l) => [[`${l.id}:A`, l.a.substationId], [`${l.id}:B`, l.b.substationId]]));
    for (const l of p.links!.creates!) for (const e of [l.a, l.b]) {
      if (e.kind === 'core') expect(lineEnds.get(`${e.lineId}:${e.side}`)).toBe(l.substationId);
    }
  });

  it('완성된 페이로드는 core 검증을 통과한다 — 시드가 화면과 같은 규칙을 지킨다', () => {
    const cableMedium = new Map([...MASTER_CABLE_TYPES.map((t) => [`ct-${t.key}`, t.medium] as const)]);
    const state: ModelState = {
      racks: p.racks!.creates!.map((r) => ({ id: r.id, substationId: r.substationId, name: r.name })),
      equipment: p.equipment!.creates!.map((e) => ({ id: e.id, substationId: e.substationId, rackId: e.rackId, name: e.name, circuitCount: e.circuitCount ?? 0 })),
      fiberLines: p.fiberLines!.creates!.map((l) => ({ id: l.id, cableTypeId: l.cableTypeId, coreCount: l.coreCount,
        aSubstationId: l.a.substationId, aEquipmentId: l.a.equipmentId ?? null, bSubstationId: l.b.substationId, bEquipmentId: l.b.equipmentId ?? null })),
      links: p.links!.creates!.map((l) => ({ id: l.id, substationId: l.substationId, cableTypeId: l.cableTypeId ?? null, a: l.a, b: l.b })),
      cableTypes: [...cableMedium].map(([id, medium]) => ({ id, medium })),
    };
    expect(validateState(state)).toEqual([]);
  });
});

describe('buildJikhalPayload — 코어 용도·상태·비고(OFD 선번장)', () => {
  const p = buildJikhalPayload(input());
  const lines = p.fiberLines!.creates!;
  const updates = p.cores!.updates!;
  /* (구)춘천 판 2(No.25~48) = A 끝, 북춘천 판 1 = B 끝. */
  const seg = OPGW.findIndex((s) => s.a === 'guchuncheon' && s.aSlot === 2 && s.b === 'bukchuncheon' && s.bSlot === 1);
  const core = (no: number) => updates.find((u) => u.lineId === lines[seg]!.id && u.no === no)?.patch;

  const blank = { aPurpose: null, aNote: null, bPurpose: null, bNote: null };

  it('코어 3 — 용도는 끝별: (구)춘천 끝(A, No.27)은 EAST, 북춘천 끝(B)은 WEST', () => {
    expect(core(3)).toEqual({ ...blank, status: 'ok', aPurpose: '소형광 · PTP(춘천-북춘천) EAST', bPurpose: '소형광 · PTP(춘천-북춘천) WEST' });
  });

  it('코어 1 — 「단선(융착) …」 은 공유 상태 broken, 원문은 각 끝 비고로', () => {
    expect(core(1)).toEqual({
      ...blank, status: 'broken',
      aNote: '단선(융착) / 북춘천변전소 OFD 내 융착으로 인한 단선 / (구)kepcit 10G',
      bNote: '단선(융착) / 춘천계1,2-춘천HP계 11,12',
    });
  });

  it('코어 21~24 — 북춘천 판 1 비고 「실제 21~24코어는 사용불가」: 상태는 공유 unusable, 비고는 북춘천 끝에만', () => {
    for (const no of [21, 22, 23, 24]) {
      expect(core(no)).toEqual({ ...blank, status: 'unusable', bNote: '실제 21~24코어는 사용불가. 그 아래 FDF의 3~6코어만 사용 가능' });
    }
  });

  it('코어 17 — 끝마다 제 시트 글 그대로(공백 차이도 보존), 비고도 그 끝에만', () => {
    expect(core(17)).toEqual({
      ...blank, status: 'ok',
      aPurpose: '차세대KepCIT · 차세대KepCIT 강원#1링 (화천B/O-본부)',
      bPurpose: '차세대KepCIT · 차세대KepCIT 강원#1링(화천B/O-본부)', bNote: '라벨링 필요',
    });
  });

  it('비고에 다른 국 시트 덧붙임이 없다', () => {
    for (const u of updates) for (const n of [u.patch.aNote, u.patch.bNote]) expect(n ?? '').not.toMatch(/시트:/);
  });

  it('값이 없는 코어는 updates 에 없다, 있는 코어는 선로 코어 수 안이다', () => {
    expect(core(9)).toBeUndefined();
    const count = new Map(lines.map((l) => [l.id, l.coreCount]));
    for (const u of updates) expect(u.no).toBeLessThanOrEqual(count.get(u.lineId)!);
    expect(new Set(updates.map((u) => `${u.lineId}:${u.no}`)).size).toBe(updates.length);
  });

  it('세운 광선로 두 끝의 선번장 코어는 하나도 빠지지 않는다', () => {
    OPGW.forEach((s, i) => {
      const nos = new Set([...(PLATE_CORES[s.a]?.[s.aSlot] ?? []), ...(PLATE_CORES[s.b]?.[s.bSlot] ?? [])].map((c) => c.no));
      expect(updates.filter((u) => u.lineId === lines[i]!.id).map((u) => u.no).sort((x, y) => x - y)).toEqual([...nos].sort((x, y) => x - y));
    });
  });

  it('페이로드는 커밋 스키마를 통과한다(빈 글 없음, 상태 값은 CORE_STATUSES)', () => {
    const uuids = (keys: readonly { key: string }[]) => Object.fromEntries(keys.map((t) => [t.key, randomUUID()]));
    const real = buildJikhalPayload({
      substationIds: uuids(STATIONS) as Record<(typeof STATIONS)[number]['key'], string>,
      rackTypeIds: uuids(MASTER_RACK_TYPES), equipmentTypeIds: uuids(MASTER_EQUIPMENT_TYPES), cableTypeIds: uuids(MASTER_CABLE_TYPES),
      newId: randomUUID,
    });
    const r = commitPayloadSchema.safeParse(real);
    expect(r.error?.issues ?? []).toEqual([]);
  });
});
