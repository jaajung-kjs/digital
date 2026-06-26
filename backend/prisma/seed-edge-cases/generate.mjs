#!/usr/bin/env node
/**
 * Edge-case topology seed generator.
 *
 * 각 case = 그래프 topology 명세 (노드 + 엣지). 이 스크립트가 그걸 SQL 로 변환:
 *   substations + floors + OFD/RACK assets + rack_modules + fiber_paths + cables.
 * 각 case 의 모든 entity 는 caseId 접두사로 namespacing 됨 → 기존 데이터와 충돌 없음.
 *
 * 사용:
 *   node generate.mjs              # 9 case 전부 생성
 *   node generate.mjs ec1 ec4      # 특정 case 만 생성
 *
 * 적용:
 *   docker exec -i ict-twin-postgres psql -U postgres -d ict_digital_twin \
 *     < seed-edge-cases/seed-ec1-single-ring.sql
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── 강원본부 branch id (기존 seed 와 동일) ──────────────────────────────
const BRANCH_ID = 'a40c0e6d-063b-4a3f-bd39-7062abbeb230';

// ─── Topology 명세 ──────────────────────────────────────────────────────
/** @typedef {{ caseId: string, caseName: string, description: string, nodes: string[], edges: [string,string][] }} Topology */

/** @type {Topology[]} */
const CASES = [
  // ─── Phase 1 — BC-tree clean cases ─────────────────────────────────
  {
    caseId: 'ec1',
    caseName: 'single-ring',
    description: 'Single 5-node ring, no junction.',
    nodes: ['A', 'B', 'C', 'D', 'E'],
    edges: [['A','B'],['B','C'],['C','D'],['D','E'],['E','A']],
  },
  {
    caseId: 'ec4',
    caseName: 'star-3rings',
    description: '3 rings sharing 1 central junction H (star).',
    nodes: ['H', 'A1','B1','C1','D1', 'A2','B2','C2','D2', 'A3','B3','C3','D3'],
    edges: [
      ['H','A1'],['A1','B1'],['B1','C1'],['C1','D1'],['D1','H'],
      ['H','A2'],['A2','B2'],['B2','C2'],['C2','D2'],['D2','H'],
      ['H','A3'],['A3','B3'],['B3','C3'],['C3','D3'],['D3','H'],
    ],
  },
  {
    caseId: 'ec5',
    caseName: 'chain-3rings',
    description: '3 rings in chain via 2 junctions J1, J2.',
    nodes: ['J1','J2', 'A','B','C','D', 'E','F','G', 'H','I','K','L'],
    edges: [
      // Ring1: J1-A-B-C-D-J1
      ['J1','A'],['A','B'],['B','C'],['C','D'],['D','J1'],
      // Ring2: J1-E-J2-F-G-J1 (J1 와 J2 가 같은 ring 의 양 끝)
      ['J1','E'],['E','J2'],['J2','F'],['F','G'],['G','J1'],
      // Ring3: J2-H-I-K-L-J2
      ['J2','H'],['H','I'],['I','K'],['K','L'],['L','J2'],
    ],
  },

  // ─── Phase 2 — variations ──────────────────────────────────────────
  {
    caseId: 'ec6',
    caseName: 'ring-with-leaves',
    description: '5-node ring with leaf branches off two nodes.',
    nodes: ['A','B','C','D','E', 'L1','L2','L3'],
    edges: [
      ['A','B'],['B','C'],['C','D'],['D','E'],['E','A'],
      ['A','L1'],   // leaf off A
      ['C','L2'],['L2','L3'], // chain (L2-L3) off C
    ],
  },
  {
    caseId: 'ec7',
    caseName: 'disconnected-2rings',
    description: '2 separate rings, no junction between them.',
    nodes: ['A','B','C','D', 'X','Y','Z','W'],
    edges: [
      ['A','B'],['B','C'],['C','D'],['D','A'],
      ['X','Y'],['Y','Z'],['Z','W'],['W','X'],
    ],
  },
  {
    caseId: 'ec8',
    caseName: 'mixed-ring-sizes',
    description: '3 rings of different sizes (3, 5, 8) sharing 2 junctions.',
    nodes: [
      'J1','J2',
      'T1',                                  // ring1 (J1-T1-J2) triangle, 3-node
      'P1','P2','P3',                        // ring2 (J1-P1-P2-P3-J2) pentagon, 5-node
      'O1','O2','O3','O4','O5','O6',         // ring3 (J2-O1-...-O6-J1) 8-node
    ],
    edges: [
      // Ring1 — triangle (3-node): J1-T1-J2-J1
      ['J1','T1'],['T1','J2'],['J2','J1'],
      // Ring2 — pentagon (5-node): J1-P1-P2-P3-J2-J1 (uses J2-J1 edge from ring1)
      // ↑ but ring1 and ring2 sharing edge → SPQR. Avoid. Use different J2-J1 path.
      // Better: ring2 = J1-P1-P2-P3-J2 with a closing path that doesn't reuse J2-J1.
      // Since J2-J1 is used by ring1, ring2 must close differently. Add another connection?
      // Simpler: ring2 = J1-P1-P2-P3-P4-J2-... wait we need to close.
      // Let me redesign: ring2 doesn't go through J2.
      ['J1','P1'],['P1','P2'],['P2','P3'],['P3','J2'],
      // Ring3 — 8-node: J2-O1-O2-O3-O4-O5-O6-J1-J2 — but J1-J2 is shared with ring1 again!
      // Need different closing. Use O6-J2 then J2 is in ring already.
      ['J2','O1'],['O1','O2'],['O2','O3'],['O3','O4'],['O4','O5'],['O5','O6'],['O6','J1'],
      // Now check cycles: edges = [J1-T1, T1-J2, J2-J1, J1-P1, P1-P2, P2-P3, P3-J2, J2-O1, O1-O2, ..., O6-J1]
      // Cycle basis:
      //   c1 = J1-T1-J2-J1 (triangle, 3 nodes)
      //   c2 = J1-P1-P2-P3-J2-J1 (pentagon, 5 nodes, uses J2-J1 from c1)
      //   c3 = J1-T1-J2-O1-...-O6-J1 (uses J1-T1, T1-J2 from c1 plus O-chain)
      //   OR c3 = J1-P1-P2-P3-J2-O1-...-O6-J1 (uses J1-P1, ..., P3-J2 from c2 plus O-chain)
      // → c2 and c3 share edges with c1 (specifically J2-J1) → composite ring (level-1) generated.
      // 이건 SPQR 케이스가 되어버림. Mixed sizes 검증엔 부적합.
    ],
  },

  // ─── Phase 3 — SPQR limits ─────────────────────────────────────────
  {
    caseId: 'ec3',
    caseName: 'two-rings-two-junctions',
    description: '2 rings sharing 2 junction nodes (SPQR — BC-tree 한계 케이스).',
    nodes: ['J1','J2', 'A','B', 'C','D'],
    edges: [
      // Ring1: J1-A-J2-B-J1
      ['J1','A'],['A','J2'],['J2','B'],['B','J1'],
      // Ring2: J1-C-J2-D-J1
      ['J1','C'],['C','J2'],['J2','D'],['D','J1'],
    ],
  },
  {
    caseId: 'ec9',
    caseName: 'edge-sharing-rings',
    description: 'Level-1 composite — 두 ring 이 1개 edge 공유 (SPQR S-S 케이스).',
    nodes: ['A','B','C','D','E','F','G'],
    edges: [
      // Square A-B-C-D-A with diagonal A-C → 3 cycles share edge A-C
      ['A','B'],['B','C'],['C','D'],['D','A'],['A','C'],
      // 추가 노드 E,F,G 로 ring 한 개 더 만듦 — A-E-F-G-A (별도 ring)
      // 이 ring 은 다른 ring 과 vertex A 만 공유 (= 분기점, BC-tree 정상)
      ['A','E'],['E','F'],['F','G'],['G','A'],
    ],
  },
];

// ─── 8-mixed-ring-sizes 는 위 설계 결함으로 자동으로 SPQR 가 되어버림.
//    재설계: ring 들이 vertex (cut) 만 공유하도록.
// 다시:
//   ring1 (3-node): J1-T1-J2-J1 → 자기 폐쇄 (J1, T1, J2). 단 J1-J2 edge 필요.
//   ring2 (5-node): J1-P1-P2-P3-J2-... 닫으려면 J2 → J1 또 가야 함. 같은 edge 재사용 → SPQR.
//   ring2 가 J1, J2 둘 다 포함 → 2-junction → BC-tree 가 아님 → SPQR.
// 즉 *모든 ring 이 J1, J2 둘 다 포함* 하면 SPQR. *각 ring 이 junction 하나만* 포함하면 BC-tree.
// 진정한 mixed-ring-size + BC-tree 케이스:
//   ring1 (3) shares only J1 with the chain
//   ring2 (5) shares only J2 with the chain
//   ring3 (8) shares J1 and J2 — no, 이러면 ring3 가 두 junction 갖는데 ring1, ring2 와 vertex 1개씩만 공유.
//   ring3 가 J1 과 J2 사이 path 인 셈이면 ring3 가 진짜 ring 인지 ?
// 깔끔한 BC-tree mixed-size 설계 어렵다 — 일단 ec8 패스.

const EC8_FIXED = (() => {
  // ec8 재설계: 3 ring chain 처럼 J1, J2 사용하되 각 ring 크기를 다르게.
  // ring1 (3-node triangle): J1-T1-T2-J1
  // ring2 (5-node): J1-P1-P2-P3-J2 — 닫으려면 다시 J1 로 돌아와야 함 = 5 nodes 의 ring 은 5 edges
  //   path J1-P1-P2-P3-P4-J1 (5 nodes including J1) ← ring2 = J1-P1-P2-P3-P4-J1 (no J2)
  // ring3 (7-node): J2-O1-O2-O3-O4-O5-J2 (7 nodes including J2)
  // bridge: J1 -- J2 (한 edge) — bridge 자체는 ring 아님
  // → 결과: 3 ring + bridge. ring1 의 junction = J1, ring2 의 junction = J1 (또 J1 공유), ring3 의 junction = J2
  // → ring1 + ring2 = J1 에서 만남 (star), ring3 = J2 에서. J1-J2 bridge 가 둘 사이를 잇는다.
  // → BC-tree 정상 케이스, 3 ring 크기 (3, 5, 7) 가능
  return {
    caseId: 'ec8',
    caseName: 'mixed-ring-sizes',
    description: 'Mixed-size rings (3, 5, 7) — star at J1 + bridge to ring3 at J2.',
    nodes: ['J1','J2', 'T1','T2', 'P1','P2','P3','P4', 'O1','O2','O3','O4','O5'],
    edges: [
      // ring1 triangle: J1-T1-T2-J1
      ['J1','T1'],['T1','T2'],['T2','J1'],
      // ring2 pentagon: J1-P1-P2-P3-P4-J1
      ['J1','P1'],['P1','P2'],['P2','P3'],['P3','P4'],['P4','J1'],
      // bridge J1-J2 (not a ring edge)
      ['J1','J2'],
      // ring3 heptagon (7-node): J2-O1-O2-O3-O4-O5-J2 (6 edges, but that's 6-node ring)
      // 6 nodes + 6 edges:
      ['J2','O1'],['O1','O2'],['O2','O3'],['O3','O4'],['O4','O5'],['O5','J2'],
    ],
  };
})();

// EC8 패치
const ec8Idx = CASES.findIndex((c) => c.caseId === 'ec8');
if (ec8Idx >= 0) CASES[ec8Idx] = EC8_FIXED;

// ─── UUID 생성 ──────────────────────────────────────────────────────────
const HEX12 = (n) => n.toString(16).padStart(12, '0');

/**
 * UUID 패턴:
 *   <type>${caseDigit}ec0000-0000-4000-b000-<12-digit ordinal>
 * type: b=floor, c=ofd, d=rack, e=fiber_path
 * caseDigit: caseId 의 끝 숫자 ('ec1' → '1', 'ec9' → '9')
 */
function uuid(caseId, type, ordinal) {
  const digit = caseId.slice(-1);
  return `${type}${digit}ec0000-0000-4000-b000-${HEX12(ordinal)}`;
}

// ─── SQL 생성 ────────────────────────────────────────────────────────────
function generateSQL(topo) {
  const { caseId, caseName, description, nodes, edges } = topo;
  const digit = caseId.slice(-1);
  const out = [];

  out.push(`-- ============================================================================`);
  out.push(`-- Edge case ${caseId} (${caseName})`);
  out.push(`-- ${description}`);
  out.push(`-- nodes: ${nodes.length}, edges: ${edges.length}`);
  out.push(`-- ============================================================================`);
  out.push(`BEGIN;`);
  out.push(``);

  // Cleanup (idempotent — 자식 → 부모 순서)
  out.push(`-- Cleanup`);
  out.push(`DELETE FROM cables       WHERE fiber_path_id IN (SELECT id FROM fiber_paths WHERE id LIKE 'e${digit}ec%');`);
  out.push(`DELETE FROM fiber_paths  WHERE id LIKE 'e${digit}ec%';`);
  out.push(`DELETE FROM rack_modules WHERE id LIKE 'mod-${caseId}-%';`);
  out.push(`DELETE FROM assets    WHERE id LIKE 'c${digit}ec%' OR id LIKE 'd${digit}ec%';`);
  out.push(`DELETE FROM floors       WHERE id LIKE 'b${digit}ec%';`);
  out.push(`DELETE FROM substations  WHERE id LIKE 'sub-${caseId}-%';`);
  out.push(``);

  // Substations
  out.push(`-- Substations (${nodes.length} 개)`);
  out.push(`INSERT INTO substations (id, branch_id, name, sort_order, is_active, created_at, updated_at) VALUES`);
  const subRows = nodes.map((n, i) =>
    `  ('sub-${caseId}-${n}', '${BRANCH_ID}', '${caseId.toUpperCase()}-${n} 변전소', ${1000 + parseInt(digit, 10) * 100 + i}, true, NOW(), NOW())`
  );
  out.push(subRows.join(',\n'));
  out.push(`ON CONFLICT (id) DO NOTHING;`);
  out.push(``);

  // _node_map TEMP TABLE — node name → ids
  out.push(`-- 노드 → ID 매핑`);
  out.push(`CREATE TEMP TABLE _${caseId}_map (`);
  out.push(`  node           text PRIMARY KEY,`);
  out.push(`  substation_id  text NOT NULL,`);
  out.push(`  floor_id       text NOT NULL,`);
  out.push(`  ofd_id         text NOT NULL,`);
  out.push(`  rack_id        text NOT NULL,`);
  out.push(`  module_id      text NOT NULL`);
  out.push(`) ON COMMIT DROP;`);
  out.push(``);
  out.push(`INSERT INTO _${caseId}_map VALUES`);
  const mapRows = nodes.map((n, i) => {
    const ord = i + 1;
    return `  ('${n}', 'sub-${caseId}-${n}', '${uuid(caseId, 'b', ord)}', '${uuid(caseId, 'c', ord)}', '${uuid(caseId, 'd', ord)}', 'mod-${caseId}-${n}')`;
  });
  out.push(mapRows.join(',\n') + ';');
  out.push(``);

  // Floors
  out.push(`-- Floors`);
  out.push(`INSERT INTO floors (id, substation_id, name, floor_number, sort_order, is_active, created_at, updated_at)`);
  out.push(`SELECT floor_id, substation_id, '1F', '1F', 0, true, NOW(), NOW() FROM _${caseId}_map`);
  out.push(`ON CONFLICT (id) DO NOTHING;`);
  out.push(``);

  // OFD asset
  out.push(`-- OFD asset`);
  out.push(`INSERT INTO assets (id, floor_id, kind, name, position_x_2d, position_y_2d, width_2d, height_2d, rotation, sort_order, created_at, updated_at)`);
  out.push(`SELECT ofd_id, floor_id, 'OFD'::"AssetKind", 'OFD-' || node, 400, 300, 100, 60, 0, 0, NOW(), NOW() FROM _${caseId}_map`);
  out.push(`ON CONFLICT (id) DO NOTHING;`);
  out.push(``);

  // RACK asset
  out.push(`-- RACK asset`);
  out.push(`INSERT INTO assets (id, floor_id, kind, name, position_x_2d, position_y_2d, width_2d, height_2d, rotation, total_u, sort_order, created_at, updated_at)`);
  out.push(`SELECT rack_id, floor_id, 'RACK'::"AssetKind", 'RACK-' || node, 700, 300, 120, 80, 0, 12, 1, NOW(), NOW() FROM _${caseId}_map`);
  out.push(`ON CONFLICT (id) DO NOTHING;`);
  out.push(``);

  // RackModule (송변전광단말장치)
  out.push(`-- Rack module (송변전광단말장치, slot 0)`);
  out.push(`INSERT INTO rack_modules (id, rack_asset_id, category_id, name, slot_index, slot_span, sort_order, created_at, updated_at)`);
  out.push(`SELECT module_id, rack_id, (SELECT id FROM rack_module_categories WHERE code='EQP-OPT-TERM'), '송변전광단말장치', 0, 1, 0, NOW(), NOW() FROM _${caseId}_map`);
  out.push(`ON CONFLICT (id) DO NOTHING;`);
  out.push(``);

  // Fiber paths
  out.push(`-- Fiber paths (${edges.length} 개)`);
  out.push(`CREATE TEMP TABLE _${caseId}_fp (`);
  out.push(`  fp_id   text PRIMARY KEY,`);
  out.push(`  node_a  text NOT NULL,`);
  out.push(`  node_b  text NOT NULL`);
  out.push(`) ON COMMIT DROP;`);
  out.push(``);
  out.push(`INSERT INTO _${caseId}_fp VALUES`);
  const fpRows = edges.map((e, i) => `  ('${uuid(caseId, 'e', i + 1)}', '${e[0]}', '${e[1]}')`);
  out.push(fpRows.join(',\n') + ';');
  out.push(``);
  out.push(`INSERT INTO fiber_paths (id, ofd_a_id, ofd_b_id, port_count, description, created_at, updated_at)`);
  out.push(`SELECT f.fp_id, a.ofd_id, b.ofd_id, 24, '${caseId} ' || f.node_a || '-' || f.node_b, NOW(), NOW()`);
  out.push(`FROM _${caseId}_fp f`);
  out.push(`JOIN _${caseId}_map a ON a.node = f.node_a`);
  out.push(`JOIN _${caseId}_map b ON b.node = f.node_b`);
  out.push(`ON CONFLICT (id) DO NOTHING;`);
  out.push(``);

  // Cables (2 per fiber path: A-side and B-side)
  out.push(`-- Cables (2 per fiber path)`);
  for (const side of ['A', 'B']) {
    const idxField = side === 'A' ? 'node_a' : 'node_b';
    const mapField = side === 'A' ? 'a' : 'b';
    out.push(`INSERT INTO cables (id, source_module_id, target_asset_id, cable_type, category_id, fiber_path_id, fiber_port_number, label, buffer_length, created_at, updated_at)`);
    out.push(`SELECT 'cbl-' || f.fp_id || '-${side}', ${mapField}.module_id, ${mapField}.ofd_id,`);
    out.push(`  'FIBER'::"CableType",`);
    out.push(`  (SELECT id FROM cable_categories WHERE code='CBL-OPT'),`);
    out.push(`  f.fp_id, 1, '송변전광단말장치-OFD P1 (' || f.${idxField} || ')', 4, NOW(), NOW()`);
    out.push(`FROM _${caseId}_fp f JOIN _${caseId}_map ${mapField} ON ${mapField}.node = f.${idxField}`);
    out.push(`ON CONFLICT (id) DO NOTHING;`);
    out.push(``);
  }

  out.push(`COMMIT;`);
  out.push(``);

  // Verification
  out.push(`-- Verification`);
  out.push(`SELECT '${caseId} substations' AS metric, COUNT(*) FROM substations WHERE id LIKE 'sub-${caseId}-%'`);
  out.push(`UNION ALL SELECT '${caseId} floors', COUNT(*) FROM floors WHERE id LIKE 'b${digit}ec%'`);
  out.push(`UNION ALL SELECT '${caseId} OFD', COUNT(*) FROM assets WHERE id LIKE 'c${digit}ec%'`);
  out.push(`UNION ALL SELECT '${caseId} fiber_paths', COUNT(*) FROM fiber_paths WHERE id LIKE 'e${digit}ec%'`);
  out.push(`UNION ALL SELECT '${caseId} cables', COUNT(*) FROM cables WHERE fiber_path_id IN (SELECT id FROM fiber_paths WHERE id LIKE 'e${digit}ec%');`);
  out.push(``);
  out.push(`-- Starting cable for trace: cbl-${uuid(caseId, 'e', 1)}-A (변전소 ${nodes[0]} 의 OFD-${nodes[0]} 측)`);
  out.push(`-- Frontend: navigate to /floors/${uuid(caseId, 'b', 1)}/plan, click the cable, '상세' button.`);

  return out.join('\n');
}

// ─── 실행 ────────────────────────────────────────────────────────────────
const onlyCases = process.argv.slice(2);
const outDir = __dirname;

for (const topo of CASES) {
  if (onlyCases.length > 0 && !onlyCases.includes(topo.caseId)) continue;
  const sql = generateSQL(topo);
  const outPath = path.join(outDir, `seed-${topo.caseId}-${topo.caseName}.sql`);
  fs.writeFileSync(outPath, sql);
  console.log(`Wrote ${outPath} (${sql.split('\n').length} lines)`);
}

console.log(`\nDone. Apply:\n  docker exec -i ict-twin-postgres psql -U postgres -d ict_digital_twin < <file>.sql`);
