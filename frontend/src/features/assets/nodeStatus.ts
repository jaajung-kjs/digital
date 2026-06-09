export interface AssetListItem {
  id: string; name: string;
  assetTypeName: string; assetTypeColor: string | null;
  substationId: string; substationName: string;
  floorId: string | null; floorName: string | null; roomText: string | null;
  installDate: string | null; manager: string | null; status: string | null;
  warrantyUntil: string | null; replaceDue: string | null;
  lastMaintenanceDate: string | null;
}

export function installLocation(a: Pick<AssetListItem, 'substationName' | 'floorName' | 'roomText'>): string {
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
