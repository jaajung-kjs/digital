import { buildPowerRows, type CbRow } from './powerRegisterDescriptor';

export interface FeederCircuit {
  cbNumber: number;
  occupied: boolean;
  cableId: string | null;
  loadAssetId: string | null;
  loadName: string | null;
  capacity: string;
  switchState: string;
  spec: string;
  categoryId: string | null;
}

// buildPowerRows 의 두 번째 인자(cables) 원소 형태.
type Cable = Parameters<typeof buildPowerRows>[1][number];

/**
 * 피더의 분기(CB) — 점유는 buildPowerRows(SSOT) 재사용, 그 위에 빈 위치를 1..N 으로 패딩.
 * N = max(점유 최대 번호 + 2, 6). 빈 번호는 occupied=false 빈 차단기.
 */
export function buildFeederCircuits(
  feeder: { id: string },
  cables: Cable[],
  nameById: Map<string, string>,
): FeederCircuit[] {
  const rows = buildPowerRows(feeder.id, cables, nameById);
  const byNum = new Map<number, CbRow>();
  for (const r of rows) {
    const n = parseInt(r.cbNumber, 10);
    if (!Number.isNaN(n)) byNum.set(n, r);
  }
  const maxNum = byNum.size ? Math.max(...byNum.keys()) : 0;
  const N = Math.max(maxNum + 2, 6);

  const out: FeederCircuit[] = [];
  for (let n = 1; n <= N; n++) {
    const r = byNum.get(n);
    out.push(
      r
        ? {
            cbNumber: n, occupied: true, cableId: r.cableId,
            loadAssetId: r.loadAssetId, loadName: r.loadName,
            capacity: r.capacity, switchState: r.switchState, spec: r.spec, categoryId: r.categoryId,
          }
        : {
            cbNumber: n, occupied: false, cableId: null,
            loadAssetId: null, loadName: null, capacity: '', switchState: '', spec: '', categoryId: null,
          },
    );
  }
  return out;
}
