import { buildPowerRows } from './powerRegisterDescriptor';

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

/** 빈(미점유) 차단기 슬롯. */
const emptySlot = (cbNumber: number): FeederCircuit => ({
  cbNumber, occupied: false, cableId: null,
  loadAssetId: null, loadName: null, capacity: '', switchState: '', spec: '', categoryId: null,
});

/**
 * 피더의 분기(CB) — 실제 점유된 회로만(데이터). buildPowerRows(SSOT) 재사용.
 * 표시용 빈 슬롯 패딩은 분리(feederGridSlots) — 데이터/뷰 관심사 분리.
 * (분전반 미리보기는 이 점유 목록만, 피더 DIN 레일은 feederGridSlots 로 고정 그리드 표시.)
 */
export function buildFeederCircuits(
  feeder: { id: string },
  cables: Cable[],
  nameById: Map<string, string>,
): FeederCircuit[] {
  const rows = buildPowerRows(feeder.id, cables, nameById);
  const out: FeederCircuit[] = [];
  for (const r of rows) {
    const n = parseInt(r.cbNumber, 10);
    if (Number.isNaN(n)) continue;
    out.push({
      cbNumber: n, occupied: true, cableId: r.cableId,
      loadAssetId: r.loadAssetId, loadName: r.loadName,
      capacity: r.capacity, switchState: r.switchState, spec: r.spec, categoryId: r.categoryId,
    });
  }
  return out.sort((a, b) => a.cbNumber - b.cbNumber);
}

/** 피더 DIN 레일 고정 그리드 — 한 줄(ROW=6열) 단위로 채운다(랙 슬롯 동형, BreakerRail grid-cols-6). */
const ROW = 6;
const MIN_SLOTS = 24; // 6×4 — 기본 빈 그리드(점유 0개라도 UI 를 꽉 채운다).

/**
 * 점유 회로를 cbNumber 위치에 두고, 나머지는 빈 슬롯(＋추가)으로 채운 고정 그리드.
 * N = max(MIN_SLOTS, 점유최대+1 을 ROW 배수로 올림) — 항상 6×4 이상, 점유가 많으면 줄 단위로 증가,
 * 그리고 마지막 줄에 빈 슬롯이 최소 하나는 남도록(추가 가능).
 */
export function feederGridSlots(occupied: FeederCircuit[], minSlots = MIN_SLOTS): FeederCircuit[] {
  const byNum = new Map<number, FeederCircuit>();
  for (const c of occupied) byNum.set(c.cbNumber, c);
  const maxNum = byNum.size ? Math.max(...byNum.keys()) : 0;
  const N = Math.max(minSlots, Math.ceil((maxNum + 1) / ROW) * ROW);

  const out: FeederCircuit[] = [];
  for (let n = 1; n <= N; n++) out.push(byNum.get(n) ?? emptySlot(n));
  return out;
}
