import { randomUUID } from 'node:crypto';
import { JIKHAL_INVENTORY, MASTER_CABLE_TYPES, MASTER_EQUIPMENT_TYPES, MASTER_RACK_TYPES, SEED_PICKS, validateState, type ModelState } from '@twin/core';
import { describe, expect, it } from 'vitest';
import { buildJikhalPayload, coreRoleOf, EXCEL_RELAY_PATCHES, plateStartNo } from './jikhal.js';
import { OPGW, STATIONS, seatedPlates } from './jikhalGangwon.js';
import { PLATE_CORES, PLATE_START_NO } from './jikhalGangwonCores.js';
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

  it('끝의 시작 번호(startNo)는 선번장이 그 판을 적은 첫 No. — 48심 둘째 판 25, 12심 둘째 판 13', () => {
    const p = buildJikhalPayload(input());
    for (const [i, seg] of OPGW.entries()) {
      const l = p.fiberLines!.creates![i]!;
      expect(l.a.startNo).toBe(PLATE_START_NO[seg.a]![seg.aSlot]);
      expect(l.b.startNo).toBe(PLATE_START_NO[seg.b]![seg.bSlot]);
    }
    const ends = OPGW.flatMap((seg) => [[seg.a, seg.aSlot], [seg.b, seg.bSlot]] as const)
      .filter(([k, slot]) => plateStartNo(k, slot) !== 1).map(([k, slot]) => `${k}${slot}=${plateStartNo(k, slot)}`).sort();
    expect(ends).toEqual(['guchuncheon2=25', 'inje4=25', 'namchuncheon2=25', 'yeolbyeonghap3=13']);
    expect(plateStartNo('hwacheon', 2)).toBe(1);
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

  it('직할 인벤토리의 점퍼와 엑셀 중계 패치는 하나도 버려지지 않는다 — 모든 판이 세운 광선로다', () => {
    const invLinks = Object.values(JIKHAL_INVENTORY).reduce((n, s) => n + s.links.length, 0);
    expect(p.links!.creates).toHaveLength(invLinks + EXCEL_RELAY_PATCHES.length);
  });

  /* G7 은 「화천(OFD:37)」이라 적지만 화천 OFD 선번장은 철원 쪽 판을 1–24 로 적는다 — 선번장을 따른다(어댑터 13). */
  it('화천 중계 패치 — 「회선현황」 G7 「…화천HP(OFD:1)-화천(OFD:37)-철원」: 화천HP 쪽 코어 1 ↔ 철원 쪽 코어 13(어댑터 13)', () => {
    const line = (a: string, aSlot: number, b: string, bSlot: number) =>
      p.fiberLines!.creates![OPGW.findIndex((s) => s.a === a && s.aSlot === aSlot && s.b === b && s.bSlot === bSlot)]!;
    const toHp = line('hwacheon', 1, 'hwacheonhp', 2); // 화천 = A 끝
    const toCheorwon = line('cheorwon', 1, 'hwacheon', 2); // 화천 = B 끝
    const relay = p.links!.creates!.filter((l) => l.substationId === 'sub-hwacheon' && l.a.kind === 'core' && l.b.kind === 'core'
      && l.a.lineId === toHp.id && l.a.no === 1);
    expect(relay).toHaveLength(1);
    expect(relay[0]!.a).toEqual({ kind: 'core', lineId: toHp.id, no: 1, side: 'A' });
    expect(relay[0]!.b).toEqual({ kind: 'core', lineId: toCheorwon.id, no: 13, side: 'B' });
    expect(relay[0]!.cableTypeId).toBe(`ct-${SEED_PICKS.fiberJumperCableType}`);
  });

  it('엑셀 중계 패치의 코어 끝은 국 설비 목록이 이미 쓰지 않는 끝이다(코어 끝마다 연결 하나)', () => {
    for (const r of EXCEL_RELAY_PATCHES) {
      const used = JIKHAL_INVENTORY[r.station]!.links.flatMap((l) => [l.a, l.b]).filter((e) => 'core' in e).map((e) => ('core' in e ? e.core.join(':') : ''));
      expect(used).not.toContain(r.a.join(':'));
      expect(used).not.toContain(r.b.join(':'));
    }
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

  const blank = { role: null, aPurpose: null, aNote: null, bPurpose: null, bNote: null };

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

describe('buildJikhalPayload — 코어 주/예비(회선수용내역의 명시 표기만)', () => {
  const p = buildJikhalPayload(input());
  const lines = p.fiberLines!.creates!;
  const updates = p.cores!.updates!;
  const role = (a: string, aSlot: number, b: string, bSlot: number, no: number) => {
    const i = OPGW.findIndex((s) => s.a === a && s.aSlot === aSlot && s.b === b && s.bSlot === bSlot);
    return updates.find((u) => u.lineId === lines[i]!.id && u.no === no)?.patch.role;
  };

  it('북춘천-춘천HP 통합PTP — 1·2 주(「WEST Rx㈜」/「EAST Tx(주)」), 7·8 예비(「EAST Tx(예)」/「Tx(예)」)', () => {
    expect([1, 2].map((n) => role('bukchuncheon', 2, 'chuncheonhp', 3, n))).toEqual(['main', 'main']);
    expect([7, 8].map((n) => role('bukchuncheon', 2, 'chuncheonhp', 3, n))).toEqual(['backup', 'backup']);
  });

  it('북춘천 RTU 예비회선 사슬 — 「RTU 예비회선용 광스위치 북춘천-철원(…중계)」 코어는 구간마다 예비', () => {
    expect(role('bukchuncheon', 2, 'chuncheonhp', 3, 9)).toBe('backup');
    expect(role('hwacheonhp', 1, 'chuncheonhp', 2, 20)).toBe('backup');
    expect(role('hwacheon', 1, 'hwacheonhp', 2, 1)).toBe('backup');
    expect(role('cheorwon', 1, 'hwacheon', 2, 13)).toBe('backup');
  });

  it('한 끝만 적었으면 그 값 — 춘천HP 끝 「I-MUX 북춘천S/S-춘천H/P 주_Tx」(북춘천 끝 「I-MUX(B) Tx」 는 장치 이름)', () => {
    expect(role('bukchuncheon', 2, 'chuncheonhp', 3, 5)).toBe('main');
    expect(role('bukchuncheon', 2, 'chuncheonhp', 3, 17)).toBe('backup'); // 「I-MUX … 예비_Tx」
  });

  it('「주회선용 L2 패치」 는 주, 「(SCC예비회선)」 은 예비', () => {
    expect(role('guchuncheon', 11, 'sinchuncheon', 2, 5)).toBe('main');
    expect(role('guchuncheon', 11, 'sinchuncheon', 2, 18)).toBe('backup');
  });

  it('표기 없는 코어는 null — PTP(춘천-북춘천) EAST/WEST', () => {
    expect(role('guchuncheon', 2, 'bukchuncheon', 1, 3)).toBeNull();
  });

  it('두 끝이 어긋나면 null(추측하지 않는다), 한 끝만이면 그 값', () => {
    expect(coreRoleOf('main', 'backup')).toEqual({ role: null, conflict: true });
    expect(coreRoleOf(null, 'backup')).toEqual({ role: 'backup', conflict: false });
    expect(coreRoleOf('main', 'main')).toEqual({ role: 'main', conflict: false });
  });

  it('직할 세운 광선로의 주/예비 수 — 주 7, 예비 18, 어긋남 0', () => {
    let conflicts = 0;
    OPGW.forEach((s) => {
      const as = new Map((PLATE_CORES[s.a]?.[s.aSlot] ?? []).map((c) => [c.no, c.role]));
      const bs = new Map((PLATE_CORES[s.b]?.[s.bSlot] ?? []).map((c) => [c.no, c.role]));
      for (const no of new Set([...as.keys(), ...bs.keys()])) if (coreRoleOf(as.get(no) ?? null, bs.get(no) ?? null).conflict) conflicts++;
    });
    expect(updates.filter((u) => u.patch.role === 'main')).toHaveLength(7);
    expect(updates.filter((u) => u.patch.role === 'backup')).toHaveLength(18);
    expect(conflicts).toBe(0);
  });
});
