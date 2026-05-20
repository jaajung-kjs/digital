/**
 * 사용자 시나리오 정확히 재현 — useNetworkTopologyStore.loadAndOpen 의 데이터 흐름:
 *   1. GET /api/fiber-paths + /api/cables (saved)
 *   2. editorStore overlay (테스트 환경에선 비어 있음 — saved 그대로)
 *   3. cableTracer 호출 (시드 = 남춘천 송변전광단말장치의 자국 cable)
 *
 * 검증 항목:
 *   - traceResult.nodes 개수 = 22 (11 OFD + 11 모듈)
 *   - traceResult.rings = 2 level-0 + 1 level-1 (대링)
 *   - 모든 노드의 substationName 채워짐 (UUID 표시 없음)
 *   - groupBySubstation 결과 = 11 그룹 (변전소 박스 11개)
 */

import { traceCable } from '../src/utils/cableTracer';
import type { FiberPathDetail } from '../src/features/fiber/types';
import type { LocalCable } from '../src/features/editor/stores/editorStore';

const API = 'http://localhost:3000/api';

interface CableDetailDTO {
  id: string;
  source: { equipmentId: string | null; moduleId: string | null; circuitId?: string | null };
  target: { equipmentId: string | null; moduleId: string | null; circuitId?: string | null };
  cableType: string;
  fiberPathId?: string | null;
  fiberPortNumber?: number | null;
  categoryCode?: string | null;
  categoryName?: string | null;
  displayColor?: string | null;
  label?: string | null;
}

function cableDtoToLocal(c: CableDetailDTO): LocalCable {
  return {
    id: c.id,
    sourceEquipmentId: c.source.equipmentId ?? c.source.moduleId ?? c.source.circuitId ?? '',
    targetEquipmentId: c.target.equipmentId ?? c.target.moduleId ?? c.target.circuitId ?? '',
    sourceModuleId: c.source.moduleId ?? null,
    targetModuleId: c.target.moduleId ?? null,
    sourceCircuitId: c.source.circuitId ?? null,
    targetCircuitId: c.target.circuitId ?? null,
    cableType: c.cableType,
    categoryCode: c.categoryCode ?? null,
    categoryName: c.categoryName ?? null,
    displayColor: c.displayColor ?? null,
    label: c.label ?? null,
    fiberPathId: c.fiberPathId ?? null,
    fiberPortNumber: c.fiberPortNumber ?? null,
  };
}

async function main() {
  const fpRes = await fetch(`${API}/fiber-paths`).then((r) => r.json());
  const cableRes = await fetch(`${API}/cables`).then((r) => r.json());
  const fiberPaths: FiberPathDetail[] = fpRes.data;
  const cables = (cableRes.data as CableDetailDTO[]).map(cableDtoToLocal);

  console.log(`Backend: ${fiberPaths.length} fiber-paths, ${cables.length} cables`);

  // 시드: FIBER cable 중 남춘천 측 cable 하나
  // (어느 cable 이든 결과 동일 — Ring 전체 reach 가능해야)
  const seed = cables.find((c) => c.cableType === 'FIBER');
  if (!seed) {
    console.log('FIBER cable 없음');
    return;
  }
  console.log(`시드 cable: ${seed.id} (FP=${seed.fiberPathId}, port=${seed.fiberPortNumber})`);

  // 사용자 실제 flow 와 동일: equipment/rackModules = 현재 floor 만
  // 단 dev 환경에선 *어떤 floor* 가 active 인지 모르므로 *빈 배열* 로 시도.
  // cableTracer 의 externalInfo lookup (fiberPaths 기반) 이 다 채워야 정상.
  const result = traceCable({
    cableId: seed.id,
    cables,
    equipment: [],
    rackModules: [],
    fiberPaths,
  });

  console.log(`\n=== 결과 ===`);
  console.log(`nodes: ${result.nodes.length}`);
  console.log(`edges: ${result.edges.length}  (fp=${result.edges.filter((e) => e.type === 'fiberPath').length}, cable=${result.edges.filter((e) => e.type === 'cable').length})`);
  console.log(`rings: ${result.rings.length}  (level0=${result.rings.filter((r) => r.level === 0).length}, level1=${result.rings.filter((r) => r.level === 1).length})`);

  console.log(`\n=== 노드 이름 검증 (UUID 잔존?) ===`);
  const uuidLike = result.nodes.filter((n) => /^[0-9a-f]{8}-/i.test(n.equipmentName) || /^[0-9a-f-]{36}$/.test(n.equipmentName));
  console.log(`UUID-shaped name 노드: ${uuidLike.length}`);
  if (uuidLike.length > 0) {
    console.log('  ↳', uuidLike.map((n) => n.equipmentName.slice(0, 12)).join(', '));
  }
  const noSubstation = result.nodes.filter((n) => !n.substationName);
  console.log(`substationName 빈 노드: ${noSubstation.length}`);
  if (noSubstation.length > 0) {
    console.log('  ↳', noSubstation.map((n) => `${n.equipmentName.slice(0, 20)}(${n.equipmentId.slice(0, 10)})`).join(', '));
  }

  console.log(`\n=== 변전소별 그룹 (NetworkTopologyModal 의 groupBySubstation 시뮬) ===`);
  const groups = new Map<string, { name: string; nodes: typeof result.nodes }>();
  for (const n of result.nodes) {
    const key = n.substationName || n.substationId || n.equipmentId;
    if (!groups.has(key)) groups.set(key, { name: n.substationName || n.equipmentName, nodes: [] });
    groups.get(key)!.nodes.push(n);
  }
  console.log(`그룹 수: ${groups.size}`);
  for (const [key, g] of groups) {
    console.log(`  "${g.name}" (${g.nodes.length} 노드)  key="${key.slice(0, 16)}"`);
  }

  console.log(`\n=== Rings ===`);
  for (const r of result.rings) {
    console.log(`  ${r.id} level=${r.level} (${r.nodeIds.length} nodes, ${r.edgeIds.length} edges) — ${r.label}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
