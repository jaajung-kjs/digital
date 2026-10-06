/**
 * 강원본부 직할 국의 **통신실 설비** — 랙·설비·회로·연결. 데이터 파일이다(가드레일 허용 목록).
 *
 * 연결 끝: 설비는 이름(+표기), 회로는 [설비 이름, 번호], 코어는 [선번장 판 번호, 코어 번호] —
 * 코어 끝의 국은 그 국 자신이다(시드가 판 → 광선로·끝으로 푼다).
 */
export interface InvCircuit { no: number; label: string | null; current: 'AC' | 'DC' | null; capacity: string | null }
export interface InvEquipment { name: string; type: string; circuits?: InvCircuit[] }
export interface InvRack { name: string; rackType: string; equipment: InvEquipment[] }
export type InvEnd =
  | { equipment: string; label?: string }
  | { circuit: readonly [equipment: string, no: number] }
  | { core: readonly [plate: number, core: number] };
export interface InvLink { cable: string; a: InvEnd; b: InvEnd }
export interface StationInventory { racks: InvRack[]; links: InvLink[] }

export const JIKHAL_INVENTORY: Record<string, StationInventory> = {};
