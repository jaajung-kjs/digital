import { useMemo } from 'react';
import { mergeEffective } from './overlay';
import { useV2WorkingCopy } from './workingCopyStore';
import type { V2Asset, V2AssetPhoto, V2Cable, V2Floor, V2InspectionLog, V2MaintenanceLog } from '../types';

/**
 * **화면이 보는 것** — 저장된 것 위에 아직 저장 안 한 것을 얹은 결과.
 *
 * 이 합치기를 화면마다 손으로 적고 있었다(`mergeEffective(saved.x, overlays.x)` 가 아홉 파일에
 * 스무 번). 같은 규칙을 스무 번 적으면 한 곳이 어긋나도 아무도 모른다 — 케이블이 저장 전
 * 설비에 안 물리던 버그도 그 틈에서 났다: 도면만 제 나름의 조건을 하나 더 걸고 있었다.
 *
 * 의존성도 손으로 적혀 있었다(`[saved, overlays]`). 그러면 사진 한 장을 스테이지해도 자산
 * 목록이 통째로 다시 합쳐진다 — 도면은 그때마다 다시 그린다. 여기서는 **제 갈래만** 본다.
 */
export function useEffectiveAssets(): V2Asset[] {
  const saved = useV2WorkingCopy((s) => s.saved.assets);
  const overlay = useV2WorkingCopy((s) => s.overlays.assets);
  return useMemo(() => mergeEffective(saved, overlay), [saved, overlay]);
}

export function useEffectiveCables(): V2Cable[] {
  const saved = useV2WorkingCopy((s) => s.saved.cables);
  const overlay = useV2WorkingCopy((s) => s.overlays.cables);
  return useMemo(() => mergeEffective(saved, overlay), [saved, overlay]);
}

/** 층 — 늘 순서대로 준다(탭 줄이 그 순서로 선다). */
export function useEffectiveFloors(): V2Floor[] {
  const saved = useV2WorkingCopy((s) => s.saved.floors);
  const overlay = useV2WorkingCopy((s) => s.overlays.floors);
  return useMemo(
    () => mergeEffective(saved, overlay).sort((a, b) => a.sortOrder - b.sortOrder),
    [saved, overlay],
  );
}

/* 기록 셋은 거의 늘 「이 설비의 것」으로 쓰인다 — 거르는 일까지 여기서 한다. */
export function useEffectiveMaintenance(assetId: string | null): V2MaintenanceLog[] {
  const saved = useV2WorkingCopy((s) => s.saved.maintenanceLogs);
  const overlay = useV2WorkingCopy((s) => s.overlays.maintenance);
  return useMemo(
    () => (assetId ? mergeEffective(saved, overlay).filter((r) => r.assetId === assetId) : []),
    [saved, overlay, assetId],
  );
}

export function useEffectiveInspections(assetId: string | null): V2InspectionLog[] {
  const saved = useV2WorkingCopy((s) => s.saved.inspectionLogs);
  const overlay = useV2WorkingCopy((s) => s.overlays.inspections);
  return useMemo(
    () => (assetId ? mergeEffective(saved, overlay).filter((r) => r.assetId === assetId) : []),
    [saved, overlay, assetId],
  );
}

/**
 * 점검 기록 **전부** — 현황표의 「마지막 점검일」이 변전소 것을 통째로 센다.
 *
 * 「이 설비의 것」과 이름을 나눈다: 한 함수에 「비우면 전부」 같은 규칙을 얹으면, 고른 설비가
 * 없을 때(`null`) 전부가 쏟아지는지 빈 손인지를 부르는 쪽마다 다시 생각해야 한다.
 */
export function useAllInspections(): V2InspectionLog[] {
  const saved = useV2WorkingCopy((s) => s.saved.inspectionLogs);
  const overlay = useV2WorkingCopy((s) => s.overlays.inspections);
  return useMemo(() => mergeEffective(saved, overlay), [saved, overlay]);
}

export function useEffectivePhotos(assetId: string | null): V2AssetPhoto[] {
  const saved = useV2WorkingCopy((s) => s.saved.photos);
  const overlay = useV2WorkingCopy((s) => s.overlays.photos);
  return useMemo(
    () => (assetId ? mergeEffective(saved, overlay).filter((r) => r.assetId === assetId) : []),
    [saved, overlay, assetId],
  );
}
