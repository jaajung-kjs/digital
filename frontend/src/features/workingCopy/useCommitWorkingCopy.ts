import { useCallback } from 'react';
import { PHOTOS } from './recordTypes';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '../../utils/api';
import { commitSubstation, type FloorCommitSection } from './substationCommit';
import { useSubstationWorkingCopy, recordsDescriptor, revokeStagedPhotoUrls, sumOverlaysDirty, type AssetRecord } from './substationStore';
import { mergeEffective } from './effective';
import type { Overlay } from './overlay';
import { useEditorStore } from '../editor/stores/editorStore';
import { overlayToChanges } from '../report/overlayToChanges';
import { WORK_ORDER_KEYS } from '../report/useWorkOrders';
import type { ReportPreviewChanges, ConstructionReport } from '../../types/constructionReport';

// ──────────────────────────────────────────────────────────────────────────
// USP Task 1 — 단일 커밋 훅.
//
// 에디터의 handleSave + saveMutation(mutationFn/onSuccess)이 수행하던 저장
// 흐름을 self-contained 한 commit() 으로 추출한다. 호출부는 더 이상 floorId/
// floorPlan/substationId 를 넘길 필요 없이, substationId 는 통합 working copy
// store 에서, floor 섹션은 editorStore 에서 직접 읽는다.
//
// 흐름: commitSubstation → 사진/로그 flush(tempId→realId) → store.load(재조정)
//       → editorStore.clearPendingData → 사진/로그 query invalidate.
// 409 는 throw 하지 않고 { ok:false, conflicts } 로 표면화한다(다른 에러는 throw).
//
// 주의: localStorage draft 제거는 여기서 하지 않는다(Task 3 에서 draft 자체 제거).
// 헬퍼(buildFloorSection/flushPendingMedia/invalidateMediaQueries/is409/
// extractConflicts)는 useFloorPlanData 의 로직을 그대로 복제(duplicate)한 것이다.
// Task 2 가 handleSave 를 제거할 때 useFloorPlanData 쪽 원본도 함께 사라진다.
// ──────────────────────────────────────────────────────────────────────────

/** 충돌 1건 — WorkingCopyCommitBar/ConflictDialog 가 쓰는 shape 과 동일. */
export type Conflict = { id: string; name?: string };

/**
 * editorStore 의 floor-level 캔버스 설정(grid/배경)을 commit 의 `floor` 섹션으로
 * 빌드한다. canvasWidth/canvasHeight 는 에디터에서 변경 불가(읽기 전용)이고
 * editorStore 에 보관되지 않으므로 settings 에서 생략한다(undefined=변경없음).
 * backgroundDrawing/Opacity 는 3-state: 사용자가 스테이징했을 때만 동봉한다.
 */
function buildFloorSection(ed: ReturnType<typeof useEditorStore.getState>): FloorCommitSection | undefined {
  // floor section 은 floorId + baseVersion 둘 다 필요하다(로드된 단일 floor plan).
  // 에디터가 /floors/:id/plan 을 로드하면 activeFloorId + baseFloorVersion 을 함께
  // 세팅하므로, 둘 중 하나라도 없으면 floor 섹션 없이 커밋한다(워크스페이스 단독 등).
  const floorId = ed.activeFloorId;
  if (!floorId || ed.baseFloorVersion == null) return undefined;
  return {
    id: floorId,
    baseVersion: ed.baseFloorVersion ?? null,
    settings: {
      gridSize: ed.gridSize,
      majorGridSize: ed.majorGridSize,
      ...(ed.stagedBackgroundDrawing !== undefined ? { backgroundDrawing: ed.stagedBackgroundDrawing } : {}),
      ...(ed.stagedBackgroundOpacity !== undefined ? { backgroundOpacity: ed.stagedBackgroundOpacity } : {}),
    },
  };
}

// ── 사진 바이너리 선업로드 ────────────────────────────────────────────────────
// 사진 레코드(recordType='photos')의 압축 File 을 커밋 직전에 업로드(/uploads/photo)해 imageUrl 을
// 받는다. 그 imageUrl 을 통합 커밋의 records.creates 에 실어 equipmentPhoto 행을 트랜잭션 안에서
// 만든다 — 사진까지 단일 원자 쓰기 경로(바이너리만 트랜잭션 밖). 반환: 레코드 tempId → imageUrl.
async function uploadStagedPhotos(
  recordsOverlay: Overlay<AssetRecord, Partial<AssetRecord>>,
): Promise<Map<string, string>> {
  const photos = mergeEffective([], recordsOverlay, recordsDescriptor).filter(
    (r) => r.recordType === PHOTOS && r.file instanceof File,
  );
  const urls = new Map<string, string>();
  await Promise.all(
    photos.map(async (p) => {
      try {
        const fd = new FormData();
        fd.append('file', p.file as File);
        const { data } = await api.post('/uploads/photo', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        urls.set(p.id, data.data.imageUrl as string);
      } catch (e) {
        console.warn('[Save] 사진 업로드 실패(해당 사진은 이번 저장에서 제외):', e);
      }
    }),
  );
  return urls;
}

/** changes 에 실제 변경분이 있는지(설비/케이블 어느 한쪽이라도). */
function hasFloorChanges(changes: ReportPreviewChanges): boolean {
  return (
    changes.before.equipment.length > 0 ||
    changes.after.equipment.length > 0 ||
    changes.before.cables.length > 0 ||
    changes.after.cables.length > 0
  );
}

/**
 * #3 Task 3 — 커밋된 활성 층 설계서를 작업지시서로 아카이브한다.
 *
 * 시퀀싱이 핵심: 커밋 후 store.load 가 오버레이를 비우므로, changes 는 반드시
 * PRE-commit 스냅샷(snapshot 인자)으로 계산해야 한다. 호출부가 커밋 직전에
 * overlayToChanges 로 changes 를 만들어 넘기고, 여기서 커밋 성공 후에
 * report-preview(dry-run)로 설계서를 받아 POST /floors/:id/work-orders 로 저장한다.
 * 변경 없으면 skip. 아카이브 실패는 커밋 성공을 막지 않는다(warn 만).
 */
async function archiveWorkOrder(
  substationId: string,
  floorId: string,
  changes: ReportPreviewChanges,
  queryClient: QueryClient,
): Promise<void> {
  try {
    const { data: previewData } = await api.post(`/substations/${substationId}/report-preview`, {
      floorId,
      changes,
    });
    const report = previewData.data as ConstructionReport;
    const itemCount = report.diff?.length ?? 0;
    await api.post(`/floors/${floorId}/work-orders`, {
      report,
      summary: { itemCount },
    });
    queryClient.invalidateQueries({ queryKey: WORK_ORDER_KEYS.list(floorId) });
  } catch (e) {
    console.warn('[Save] 작업지시서 아카이브 실패(커밋은 성공):', e);
  }
}

/** axios 409 에러 여부. */
function is409(e: unknown): boolean {
  return (e as { response?: { status?: number } })?.response?.status === 409;
}

/** axios 409 에러에서 충돌 목록(details)을 추출. */
function extractConflicts(e: unknown): Conflict[] {
  const resp = (e as { response?: { data?: { details?: Conflict[] } } }).response;
  return resp?.data?.details ?? [];
}

/**
 * 단일 커밋 훅 — 에디터/워크스페이스 모두 같은 저장 경로를 쓰게 한다.
 * 반환된 commit() 은 substationId/floor 를 store 에서 직접 읽어 self-contained.
 */
export function useCommitWorkingCopy() {
  const queryClient = useQueryClient();
  return useCallback(async (): Promise<{ ok: true; idMaps?: Record<string, Record<string, string>> } | { ok: false; conflicts: Conflict[] }> => {
    const wc = useSubstationWorkingCopy.getState();
    const substationId = wc.substationId;
    // 변경이 없으면 noop. 단, substationId 가 없어도 dirty 가 있으면(=조직 트리에서 변전소를
    // 열지 않은 채 한 본부/지사/변전소/층 CRUD) 전역 커밋을 진행해야 한다 — 종전엔 여기서
    // 무조건 early-return 후 아래 revert() 가 staged 조직 변경을 날려 데이터 손실(C2).
    const dirtyCount = sumOverlaysDirty(wc.overlays);
    if (dirtyCount === 0) return { ok: true };
    // substationId 가 없는 경우 = 조직 전용 커밋 경로. 변전소-스코프 후처리(load/아카이브)는
    // 아래에서 `if (substationId)` 가드로 건너뛴다.

    const ed = useEditorStore.getState();
    const floor = buildFloorSection(ed);

    // #3 Task 3 — 작업지시서 아카이브용 PRE-commit 스냅샷.
    // 커밋 후 store.load 가 오버레이를 비우므로, 활성 층 changes 는 반드시 지금
    // (커밋 전) saved+overlay 로 계산해 둔다. 실제 아카이브는 커밋 성공 후 수행.
    const activeFloorId = ed.activeFloorId;
    const preCommitChanges: ReportPreviewChanges | null = activeFloorId
      ? overlayToChanges(
          { assets: wc.saved.assets, cables: wc.saved.cables },
          { assets: wc.overlays.assets, cables: wc.overlays.cables },
          activeFloorId,
        )
      : null;

    try {
      // 사진 바이너리만 커밋 직전 업로드(URL 확보) → 메타데이터는 통합 커밋 트랜잭션에서 원자적으로.
      const photoUrls = await uploadStagedPhotos(wc.overlays.records);
      // 전역 단일 커밋 — substationId 가 없으면 ''(backend commitGlobal 가 허용; 신규 자산/조직
      // create 는 자기 substationId/부모 FK 를 직접 싣는다). org-only 경로에서도 동일 엔드포인트.
      const result = await commitSubstation(
        substationId ?? '', wc.overlays, wc.saved.records, photoUrls, queryClient, floor,
      );
      revokeStagedPhotoUrls(wc.overlays); // 업로드 완료 → 미리보기 blob 해제
      // 전역 커밋 완료 → staged overlay 전부 클리어(전역 load 는 더 이상 overlay 를 비우지 않으므로 명시적으로).
      // revert 는 모든 컬렉션(조직 4컬렉션 포함)의 staged create/update/delete 를 비운다(freshOverlays 가 레지스트리 순회).
      useSubstationWorkingCopy.getState().revert();
      // 변전소-스코프 재조정 — 변전소가 열려 있을 때만(org-only 경로엔 load 할 변전소가 없다).
      if (substationId) await useSubstationWorkingCopy.getState().load(substationId);
      // 조직 트리 재로드 — 커밋으로 생성/수정된 조직 행의 real id/updatedAt 을 saved 로 끌어온다
      // (revert 로 staged org overlay 는 비웠으나 saved org 는 stale·temp id 가 남아 있으므로).
      // loadOrgTree 가 saved.org 를 권위로 교체하고 org overlay baseVersions 를 갱신한다.
      await useSubstationWorkingCopy.getState().loadOrgTree();
      // 커밋 후 보이는 데이터 동기화의 두 층:
      //  1) 워킹카피(effective) — 위 load 가 갱신(mergeSavedById 가 변전소 스코프 권위로 삭제까지 반영).
      //  2) react-query 서버 캐시(현황 ['nodeAssets'], 연결 ['substation-connections'], ['cables'],
      //     ['assets-slim'] 등) — 커밋의 fire-and-forget 무효화만으론 새로고침 없이 반영 안 되는 경우가 있다.
      // → 모든 활성(화면에 떠 있는) 쿼리를 명시적으로 await 재조회해, 커밋이 끝나는 시점에 모든 뷰가
      //   DB 와 동기화되도록 한다("쓰기 후 보이는 데이터 전부 다시 읽기" — 새로고침과 동일 효과).
      await queryClient.refetchQueries({ type: 'active' });
      useEditorStore.getState().clearPendingData();
      // 2회차 저장 409 방지(견고화) — floor 섹션을 커밋하면 백엔드가 floor.updatedAt 을
      // bump 하지만 in-memory baseFloorVersion 은 stale 인 채라 다음 커밋의 floor OCC 가
      // 409 난다. 커밋 응답이 새 floor.updatedAt 을 직접 실어 주므로, 그 값으로
      // baseFloorVersion 을 *동기적*으로 갱신한다(쿼리 무효화 effect 재실행에 의존하던
      // 종전 방식의 race 제거 — 이것이 진짜 수정). floor 섹션이 커밋된 경우에만 채워진다.
      if (result.updated?.floor?.updatedAt != null) {
        useEditorStore.getState().setBaseFloorVersion(result.updated.floor.updatedAt);
      }
      // 무해한 fallback — floorPlan 캐시도 fresh 로 맞춰 다른 구독자(설정 패널 등)를
      // 갱신한다. baseFloorVersion 의 권위는 위 직접-set 이며, 이 무효화는 더 이상
      // 409 방지의 주체가 아니다(await 불필요 — 캐시 갱신은 백그라운드로 충분).
      if (activeFloorId != null) {
        queryClient.invalidateQueries({ queryKey: ['floorPlan', activeFloorId] });
      }
      // 레코드(점검/로그/사진) 무효화는 불필요 — commitSubstation 이 nodeAssets 무효화 + load 가 saved 재조정.
      // 활성 층에 변경이 있었으면 설계서를 작업지시서로 아카이브(실패해도 커밋은 성공).
      // org-only 경로(변전소 미오픈)에선 아카이브 대상 변전소가 없으므로 건너뛴다.
      if (substationId && activeFloorId && preCommitChanges && hasFloorChanges(preCommitChanges)) {
        await archiveWorkOrder(substationId, activeFloorId, preCommitChanges, queryClient);
      }
      // idMaps(temp→real)를 호출부에 돌려준다 — staged 로 만든 변전소/층의 temp id 가
      // URL 에 남아 있으면 커밋 후 real id 로 치환해야 평면도가 404 없이 로드된다.
      return { ok: true, idMaps: result.idMaps };
    } catch (e) {
      if (is409(e)) return { ok: false, conflicts: extractConflicts(e) };
      throw e;
    }
  }, [queryClient]);
}
