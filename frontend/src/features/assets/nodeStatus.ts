import type { Asset } from '../../types/asset';
import { formatDate } from '../../utils/date';

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
  const label = formatDate(lastDate);
  const days = Math.floor((today.getTime() - new Date(lastDate).getTime()) / 86400000);
  return { level: days > OVERDUE_DAYS ? 'overdue' : 'ok', label };
}

/** 자산 overlay update patch 의 공유 필드만 골라 AssetListItem 키로 매핑(projectStatusRows 내부). */
function assetPatchToListItem(patch: Partial<Asset>): Partial<AssetListItem> {
  const out: Partial<AssetListItem> = {};
  if ('name' in patch) out.name = patch.name as string;
  if ('manager' in patch) out.manager = patch.manager ?? null;
  if ('installDate' in patch) out.installDate = patch.installDate ?? null;
  if ('status' in patch) out.status = patch.status ?? null;
  return out;
}

/** 자산 상태 = ON/OFF 이진(기본 ON, 'OFF' 일 때만 OFF). 색은 ON=success/OFF=neutral. 단일 소스. */
export const statusIsOn = (status: string | null | undefined): boolean => status !== 'OFF';

/** 현황 행에 적용할 assets overlay 의 최소 형태(creates/updates/deletes). */
export interface StatusAssetsOverlay {
  updates: Record<string, Partial<Asset>>;
  deletes: string[];
  creates: Record<string, Asset>;
}

/** staged+saved 점검에서 자산별 최신 점검일 파생에 쓰는 최소 형태. */
export interface StatusInspection {
  assetId: string;
  inspectionDate: string;
}

/** 새로 스테이징된 자산을 현황 리스트 행으로 변환(projectStatusRows 내부 — rich 필드는 refetch 전까지 빈값). */
function assetCreateToListItem(asset: Asset, substationId: string): AssetListItem {
  return {
    id: asset.id,
    name: asset.name,
    assetTypeName: asset.assetType?.name ?? '신규',
    assetTypeColor: asset.assetType?.displayColor ?? null,
    substationId,
    substationName: '',
    floorId: asset.floorId ?? null,
    floorName: null,
    roomText: null,
    installDate: asset.installDate ?? null,
    manager: asset.manager ?? null,
    status: asset.status ?? null,
    warrantyUntil: null,
    replaceDue: null,
    lastMaintenanceDate: null,
  };
}

/**
 * 현황 행 단일 투영 — 서버 행(useNodeAssets)에 워킹카피 overlay(updates/deletes/creates)와
 * effective 점검(saved+staged)을 일관되게 덮어쓴다. **변전소 현황과 본부/사업소 현황이 같은
 * 함수를 쓰므로** '설치일은 반영되는데 점검일은 안 됨' 같은 경로별 불일치가 구조적으로 불가능하다.
 *
 * - lastMaintenanceDate 는 effective 점검에서 파생(자산 스칼라가 아니라 하위레코드 파생)하므로
 *   asset overlay 가 아니라 inspections 에서 가져온다 — 두 경로 모두 동일하게.
 * - update/delete/점검은 **전역**(id 매치)으로 적용한다 — 워킹카피가 전역이므로 어느 변전소
 *   자산이든 편집이 라이브로 보인다(포커스 변전소만 보이던 문제 해소).
 * - 신규(create) 자산만 이 뷰 범위로 한정: scopeId(변전소 현황)면 그 변전소, scopeId=null
 *   (본부/사업소)이면 serverRows 에 존재하는 변전소들(=노드 범위)의 신규 자산을 추가한다.
 */
export function projectStatusRows(
  serverRows: AssetListItem[],
  overlay: StatusAssetsOverlay,
  inspections: StatusInspection[],
  scopeId: string | null,
): AssetListItem[] {
  // 자산별 최신 점검일(effective = saved+staged).
  const latest = new Map<string, string>();
  for (const ins of inspections) {
    const cur = latest.get(ins.assetId);
    if (!cur || ins.inspectionDate > cur) latest.set(ins.assetId, ins.inspectionDate);
  }
  const withInspection = (id: string, saved: string | null): string | null => {
    const p = latest.get(id);
    if (!p) return saved;
    return !saved || p > saved.slice(0, 10) ? p : saved;
  };

  // update/delete/점검은 전역으로 id 매치 적용(변전소 무관).
  const deleted = new Set(overlay.deletes);
  const rows = serverRows
    .filter((r) => !deleted.has(r.id))
    .map((r) => {
      const p = overlay.updates[r.id];
      const merged = p ? { ...r, ...assetPatchToListItem(p) } : r;
      return { ...merged, lastMaintenanceDate: withInspection(r.id, merged.lastMaintenanceDate) };
    });
  // 신규 자산은 이 뷰 범위의 것만 추가(저장 전후 동일 표시 — "저장해야 반영" 불일치 제거).
  const scopeSet = scopeId ? new Set([scopeId]) : new Set(serverRows.map((r) => r.substationId));
  const creates = (Object.values(overlay.creates) as Asset[])
    .filter((a) => a.substationId != null && scopeSet.has(a.substationId))
    .map((a) => assetCreateToListItem(a, a.substationId));
  return [...rows, ...creates];
}
