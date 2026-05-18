/**
 * 분전반(DISTRIBUTION) 의 분기 회로. RackModule 과 같은 위치 — 부모 설비
 * 안의 하위 항목, 도면 좌표 없음. feederName 으로 전원 계통(예 "DC 48V Main")
 * 을 문자열 그룹핑, branchName 이 실제 분기(L1 …). 케이블은 회로 단위로
 * 연결된다 (Phase 2).
 */
export interface DistributionCircuit {
  id: string;
  distributionEquipmentId: string;
  feederName: string;
  branchName: string;
  description: string | null;
  sortOrder: number;
}

/** 회로 표시 라벨 — trace / 연결 목록에서 일관된 형식. */
export function circuitLabel(c: Pick<DistributionCircuit, 'feederName' | 'branchName'>): string {
  return `${c.feederName}/${c.branchName}`;
}

/**
 * 한 분전반의 회로를 feederName 그룹으로 묶어 반환. filter → sort(feeder,
 * sortOrder) → Map. CircuitPicker / DistributionPanel 공용.
 */
export function groupCircuitsByFeeder(
  circuits: DistributionCircuit[],
  distributionEquipmentId: string,
): Map<string, DistributionCircuit[]> {
  const list = circuits
    .filter((c) => c.distributionEquipmentId === distributionEquipmentId)
    .sort(
      (a, b) =>
        a.feederName.localeCompare(b.feederName) || a.sortOrder - b.sortOrder,
    );
  const m = new Map<string, DistributionCircuit[]>();
  for (const c of list) {
    if (!m.has(c.feederName)) m.set(c.feederName, []);
    m.get(c.feederName)!.push(c);
  }
  return m;
}

/** 도면 bulk save (PUT /plan) 의 distributionCircuits 항목. */
export interface UpdateFloorPlanDistributionCircuitInput {
  id?: string | null;
  tempId?: string;
  distributionEquipmentId: string;
  feederName: string;
  branchName: string;
  description?: string | null;
  sortOrder?: number;
}
