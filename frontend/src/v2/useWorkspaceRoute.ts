import { useCallback, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

/** 작업 공간이 보여 줄 수 있는 판 — 선번장·계통은 ③·④ 에서 돌아온다. */
export type ViewMode = '현황' | '평면도';

export const VIEW_MODES: readonly ViewMode[] = ['현황', '평면도'];

/** 예전 주소를 받아 준다 — 북마크가 첫 탭으로 떨어지지 않게(이름만 바뀌었다). */
const RENAMED: Record<string, ViewMode> = { '설비 대장': '현황', '설비 현황': '현황' };

const isView = (v: string | null): v is ViewMode => v != null && (VIEW_MODES as readonly string[]).includes(v);

/**
 * **보고 있는 자리는 주소가 안다**:
 *
 *     /n/<조직·국 id>?view=평면도&eq=<설비>&rack=<랙>
 *
 * 북마크·공유·새로고침 복원·뒤로가기가 모두 이 한 곳에서 선다. 케이블을 잇는 중이라거나
 * 추적 결과 같은 한 번짜리 명령은 담지 않는다 — 링크를 연 사람이 영문 모를 도구가 켜진
 * 화면을 만난다.
 */
export function useWorkspaceRoute() {
  const { nodeId = null } = useParams<{ nodeId: string }>();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

  const raw = params.get('view');
  /* 모르는 판 이름은 조용히 첫 판으로 — 주소는 남이 손으로 고칠 수 있다. */
  const view: ViewMode = isView(raw) ? raw : (RENAMED[raw ?? ''] ?? '현황');

  /** 조직을 옮긴다 — 보던 판·선택은 딸려 가지 않는다(그 설비는 저 국에 없다). */
  const selectNode = useCallback(
    (id: string | null) => navigate(id == null ? '/' : `/n/${id}`),
    [navigate],
  );

  /* 판을 바꾸는 것은 같은 자리를 다르게 보는 일이라 기록을 남기지 않는다. */
  const setView = useCallback(
    (next: ViewMode) => {
      setParams((prev) => {
        const p = new URLSearchParams(prev);
        p.set('view', next);
        return p;
      }, { replace: true });
    },
    [setParams],
  );

  const setParam = useCallback(
    (key: 'eq' | 'rack', value: string | null) => {
      setParams((prev) => {
        const p = new URLSearchParams(prev);
        if (value) p.set(key, value);
        else p.delete(key);
        return p;
      }, { replace: true });
    },
    [setParams],
  );
  const selectEquipment = useCallback((id: string | null) => setParam('eq', id), [setParam]);
  const selectRack = useCallback((id: string | null) => setParam('rack', id), [setParam]);

  const eqId = params.get('eq');
  const rackId = params.get('rack');

  /* 같은 객체로 유지한다 — 의존성에 넣은 콜백·캔버스가 매 렌더 다시 만들어지지 않게. */
  return useMemo(
    () => ({ nodeId, view, eqId, rackId, selectNode, setView, selectEquipment, selectRack }),
    [nodeId, view, eqId, rackId, selectNode, setView, selectEquipment, selectRack],
  );
}
