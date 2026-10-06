import { describe, expect, it } from 'vitest';
import { SEED_ASSEMBLIES, SEED_ASSET_TYPES } from './catalog.js';
import { STATION_KITS } from './stationKits.js';

/**
 * 국 설비 선언이 **카탈로그에 있는 것만** 가리키는가.
 *
 * 틀리면 시드가 조용히 건너뛴다(배포를 막지 않으려고) — 그래서 여기서 먼저 잡는다.
 */
describe('국 설비 선언', () => {
  const asmByKey = new Map(SEED_ASSEMBLIES.map((a) => [a.key, a]));
  const typeByKey = new Map(SEED_ASSET_TYPES.map((t) => [t.key, t]));

  for (const [station, kit] of Object.entries(STATION_KITS)) {
    it(`${station} — 설비·슬롯·포트가 카탈로그에 있다`, () => {
      const problems: string[] = [];
      const names = new Set<string>();
      /** 설비 이름 → 부품 이름 → 장비 품목 키 */
      const parts = new Map<string, Map<string, string>>();
      for (const eq of kit.equipment) {
        if (names.has(eq.name)) problems.push(`이름 중복: ${eq.name}`);
        names.add(eq.name);
        const asm = asmByKey.get(eq.assembly);
        if (!asm) {
          problems.push(`${eq.name}: 설비 품목 ${eq.assembly} 없음`);
          continue;
        }
        const byName = new Map<string, string>();
        const fills = new Map((eq.fill ?? []).map(([slot, typeKey, name]) => [slot, { typeKey, name }]));
        for (const [slot, { typeKey, name }] of fills) {
          if (!asm.items.some((i) => i.name === slot)) problems.push(`${eq.name}: 슬롯 ${slot} 없음`);
          if (!typeByKey.has(typeKey)) problems.push(`${eq.name}/${name}: 장비 품목 ${typeKey} 없음`);
          byName.set(name, typeKey);
        }
        for (const item of asm.items) if (item.typeKey && !fills.has(item.name)) byName.set(item.name, item.typeKey);
        parts.set(eq.name, byName);
      }

      const hasPort = (at: string) => {
        /* 부품 이름에 `/` 가 들어간다(`H/P`·`CSU/DSU`) — 처음은 설비, 끝은 포트, 가운데가 부품이다. */
        const segs = at.split('/');
        const equip = segs[0];
        const part = segs.slice(1, -1).join('/');
        const [group, index] = segs.at(-1)!.split(':');
        const typeKey = parts.get(equip!)?.get(part!);
        const tpl = typeKey && typeByKey.get(typeKey)?.ports.find((p) => p.group === group);
        return !!tpl && Number(index) >= 1 && Number(index) <= tpl.count;
      };
      for (const [a, b] of kit.feeds) {
        if (!hasPort(a)) problems.push(`연결 출발 없음: ${a}`);
        if (!hasPort(b)) problems.push(`연결 도착 없음: ${b}`);
      }
      for (const panel of kit.panels) {
        for (const [item, branches] of Object.entries(panel.buses)) {
          const typeKey = parts.get(panel.equip)?.get(item);
          const out = typeKey && typeByKey.get(typeKey)?.ports.find((p) => p.direction === 'OUT' && p.medium === 'power');
          if (!out) problems.push(`분전반 항목 없음: ${panel.equip}/${item}`);
          else if (branches.length > out.count) problems.push(`${panel.equip}/${item}: 분기 ${branches.length} > ${out.count}`);
          for (const [, , to] of branches) if (to && !hasPort(to)) problems.push(`분기 도착 없음: ${to}`);
        }
      }
      /* 광 — 코어 하나·포트 하나에 점퍼는 한 가닥이다. */
      const cores = new Set<string>();
      const ports = new Set<string>();
      const useCore = (plate: number, core: number) => {
        const k = `${plate}:${core}`;
        if (cores.has(k)) problems.push(`코어 중복: 판 ${plate} 코어 ${core}`);
        cores.add(k);
      };
      for (const [plate, core, to] of kit.fiber?.jumpers ?? []) {
        useCore(plate, core);
        if (!hasPort(to)) problems.push(`점퍼 도착 없음: ${to}`);
        if (ports.has(to)) problems.push(`포트 중복: ${to}`);
        ports.add(to);
      }
      for (const [pa, ca, pb, cb] of kit.fiber?.patches ?? []) {
        useCore(pa, ca);
        useCore(pb, cb);
      }
      expect(problems).toEqual([]);
    });
  }
});
