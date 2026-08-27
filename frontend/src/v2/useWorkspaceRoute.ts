import { useCallback, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

/** 설비 관리가 보여 줄 수 있는 판. */
export type ViewMode = '현황' | '평면도' | '선번장' | '계통';

export const VIEW_MODES: readonly ViewMode[] = ['현황', '평면도', '선번장', '계통'];

/** 예전 주소를 받아 준다 — 북마크가 첫 탭으로 떨어지지 않게(이름만 바뀌었다). */
const RENAMED: Record<string, ViewMode> = { '설비 대장': '현황', '설비 현황': '현황' };

const isView = (v: string | null): v is ViewMode => v != null && (VIEW_MODES as readonly string[]).includes(v);

/**
 * 설비 관리가 **어디를 보고 있는지는 주소가 안다**.
 *
 * 예전에는 전부 메모리에만 있었다 — 앱 전체가 주소 하나(`/`)였고, 고른 변전소도 탭도
 * 고른 자산도 컴포넌트 상태였다. 그래서 ① 북마크할 수 없고 ② 남에게 보내 줄 수 없고
 * ③ 새로고침하면 보던 자리를 잃고 ④ 뒤로가기를 누르면 화면 하나 뒤로 가는 게 아니라
 * **앱에서 나가 버렸다**. 「이 회선 좀 봐 달라」고 링크를 보내는 것이 이 도구를 쓰는
 * 가장 흔한 이유인데 그 길이 없었다.
 *
 * 주소가 담는 것은 **지금 보고 있는 자리**뿐이다:
 *
 *     /n/<조직·변전소 id>?view=선번장&asset=<자산>&part=<장비>&port=<포트>
 *
 * 케이블을 잇는 중이라거나 추적 결과 같은 **한 번짜리 명령**은 담지 않는다 — 주소에
 * 넣으면 그 링크를 연 사람이 영문 모를 도구가 켜진 화면을 만난다.
 *
 * 상태를 URL 에 두면 「무엇이 진짜인가」도 하나로 정해진다. 화면과 주소가 각자 기억하면
 * 둘이 어긋나는 것은 시간 문제다.
 */
export function useWorkspaceRoute() {
  const { nodeId = null } = useParams<{ nodeId: string }>();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

  const raw = params.get('view');
  /* 모르는 판 이름이 오면 조용히 첫 판으로 — 주소는 남이 손으로 고칠 수 있다. */
  const view: ViewMode = isView(raw) ? raw : (RENAMED[raw ?? ''] ?? '현황');

  /** 조직을 옮긴다 — 보던 판·자산은 딸려 가지 않는다(그 자산은 저 변전소에 없다). */
  const selectNode = useCallback(
    (id: string | null) => {
      /* 놓으면 뿌리로 — 「선택된 조직/변전소가 없습니다」가 정당한 화면이다. */
      navigate(id == null ? '/' : `/n/${id}`);
    },
    [navigate],
  );

  const setView = useCallback(
    (next: ViewMode) => {
      /* 판을 바꾸는 것은 **같은 자리를 다르게 보는 일**이라 기록을 남기지 않는다 —
         뒤로가기 한 번에 탭 하나씩 되짚게 되면 뒤로가기가 못 쓸 물건이 된다. */
      setParams(
        (prev) => {
          const next2 = new URLSearchParams(prev);
          next2.set('view', next);
          return next2;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  /**
   * 자산을 고른다.
   *
   * `part`·`port` 는 상세 패널이 **어느 장비·어느 포트를 짚은 채로** 열릴지다. 셋을 함께
   * 쓰는 이유는 셋이 한 동작의 결과이기 때문 — 따로 두면 자산만 바뀌고 포트가 남는다.
   */
  const selectAsset = useCallback(
    (assetId: string | null, partId?: string | null, portId?: string | null) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of [
            ['asset', assetId],
            ['part', partId ?? null],
            ['port', portId ?? null],
          ] as const) {
            if (value) next.set(key, value);
            else next.delete(key);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  /**
   * 선번장·계통이 보고 있는 설비 — 드롭다운으로 고른 것.
   *
   * 「고른 자산」과 다른 축이다: 현황에서 고른 것이 이 표에 없을 수도 있고, 반대로 이 표를
   * 넘겨 보는 동안 아무것도 안 고를 수도 있다. 차례는 `useMediumContainer` 가 정한다.
   */
  const setContainer = useCallback(
    (id: string) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('eq', id);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const assetId = params.get('asset');
  const partId = params.get('part');
  const portId = params.get('port');
  const containerId = params.get('eq');

  /* 돌려주는 것을 **같은 객체로 유지한다** — 매 렌더 새 객체면 이걸 의존성에 넣은
     `useCallback` 들이 전부 다시 만들어지고, 그것을 받는 캔버스가 통째로 다시 그려진다. */
  return useMemo(
    () => ({ nodeId, view, assetId, partId, portId, containerId, selectNode, setView, selectAsset, setContainer }),
    [nodeId, view, assetId, partId, portId, containerId, selectNode, setView, selectAsset, setContainer],
  );
}
