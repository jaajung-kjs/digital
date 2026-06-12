import { useEffect } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../utils/api';
import type { FloorDetail } from '../types/substation';
import { ensureOfdDirectory } from '../features/fiber/hooks/useOfdDirectory';

// ──────────────────────────────────────────────────────────────────────────
// 레거시 `/floors/:floorId/plan` → 단일 평면도 뷰(워크스페이스)로의 리다이렉트 셸.
//
// 평면도는 한 곳(WorkspacePage, 탭/커밋 바 포함)에서만 연다. 예전엔 이 경로가 탭 없는
// 별도 에디터를 직접 렌더해 "같은 평면도를 여는 두 번째 코드 경로"였다. 이제는 floorId 로
// 그 층의 substationId 를 풀어(모든 층은 변전소에 속함) 정규 워크스페이스 URL 로 보낸다.
// OFD 대국 도면 이동·조직트리의 부모없는 층·북마크/디버그 링크가 모두 같은 뷰로 수렴한다.
// ──────────────────────────────────────────────────────────────────────────

export function FloorPlanEditorPage() {
  const { floorId } = useParams<{ floorId: string }>();

  // OFD directory prefetch — 첫 OFD 패널 진입 시 변전소명이 '?' 로 깜빡이지 않게.
  useEffect(() => {
    void ensureOfdDirectory();
  }, []);

  // floorId → substationId. useFloorPlanData 와 동일한 ['floor', id] 키라 캐시 공유.
  const { data: floor, isLoading, isError } = useQuery({
    queryKey: ['floor', floorId],
    queryFn: async () => (await api.get<{ data: FloorDetail }>(`/floors/${floorId}`)).data.data,
    enabled: !!floorId,
  });

  if (!floorId || isError) {
    return (
      <div className="flex justify-center items-center h-full">
        <p className="text-content-muted">Floor ID가 필요합니다.</p>
      </div>
    );
  }
  if (isLoading || !floor) {
    return (
      <div className="flex justify-center items-center h-full">
        <p className="text-content-muted">평면도로 이동 중…</p>
      </div>
    );
  }

  return (
    <Navigate
      to={`/substations/${floor.substationId}/workspace?view=plan&floor=${floorId}`}
      replace
    />
  );
}
