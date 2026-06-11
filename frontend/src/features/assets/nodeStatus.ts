import type { Asset } from '../../types/asset';

export interface AssetListItem {
  id: string; name: string;
  assetTypeName: string; assetTypeColor: string | null;
  substationId: string; substationName: string;
  floorId: string | null; floorName: string | null; roomText: string | null;
  parentAssetId?: string | null; parentName?: string | null; parentFloorName?: string | null;
  installDate: string | null; manager: string | null; status: string | null;
  warrantyUntil: string | null; replaceDue: string | null;
  lastMaintenanceDate: string | null;
}

export function installLocation(
  a: Pick<AssetListItem, 'substationName' | 'floorName' | 'roomText' | 'parentAssetId' | 'parentName' | 'parentFloorName'>,
): string {
  // 랙 모듈(부모 랙 존재): 자체 층이 없으므로 부모 랙의 층·랙명을 보여준다 → "춘천S/S 2층 R01"
  if (a.parentAssetId) {
    const floor = a.parentFloorName ?? a.floorName;
    return [a.substationName, floor, a.parentName].filter(Boolean).join(' ');
  }
  const room = a.floorName ?? a.roomText;
  return room ? `${a.substationName} ${room}` : a.substationName;
}

const OVERDUE_DAYS = 365;
export type InspectionLevel = 'none' | 'ok' | 'overdue';
export function inspectionState(lastDate: string | null, today: Date): { level: InspectionLevel; label: string } {
  if (!lastDate) return { level: 'none', label: '미점검' };
  const label = new Date(lastDate).toLocaleDateString('ko-KR');
  const days = Math.floor((today.getTime() - new Date(lastDate).getTime()) / 86400000);
  return { level: days > OVERDUE_DAYS ? 'overdue' : 'ok', label };
}

/** 자산 overlay update patch 의 공유 필드만 골라 AssetListItem 키로 매핑(현황 리스트 라이브 머지용·단일 소스). */
export function assetPatchToListItem(patch: Partial<Asset>): Partial<AssetListItem> {
  const out: Partial<AssetListItem> = {};
  if ('name' in patch) out.name = patch.name as string;
  if ('manager' in patch) out.manager = patch.manager ?? null;
  if ('installDate' in patch) out.installDate = patch.installDate ?? null;
  if ('status' in patch) out.status = patch.status ?? null;
  return out;
}

/** 자산 상태 = ON/OFF 이진(기본 ON, 'OFF' 일 때만 OFF). 색은 ON=success/OFF=neutral. 단일 소스. */
export const statusIsOn = (status: string | null | undefined): boolean => status !== 'OFF';
