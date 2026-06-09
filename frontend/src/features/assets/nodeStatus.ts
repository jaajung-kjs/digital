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
