import { useCallback, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { Side } from '@twin/core';

/** 작업 공간이 보여 줄 수 있는 판. */
export type ViewMode = '현황' | '선번장' | '전원 계통' | '평면도';

export const VIEW_MODES: readonly ViewMode[] = ['현황', '선번장', '전원 계통', '평면도'];

/** 전원 계통 안의 보기 — 차단기 대장(`ledger`) · 계통도(`tree`). */
export type PowerView = 'ledger' | 'tree';

/** 선번장 블록 하나 — 광선로와 그 국 쪽 끝. */
export interface BlockFocus { lineId: string; side: Side }

/** 예전 주소를 받아 준다 — 북마크가 첫 탭으로 떨어지지 않게(이름만 바뀌었다). */
const RENAMED: Record<string, ViewMode> = { '설비 대장': '현황', '설비 현황': '현황' };

const isView = (v: string | null): v is ViewMode => v != null && (VIEW_MODES as readonly string[]).includes(v);

/**
 * **보고 있는 자리는 주소가 안다**:
 *
 *     /n/<조직·국 id>?view=평면도&eq=<설비>&rack=<랙>
 *     /n/<국 id>?view=선번장&line=<광선로>&side=<A|B>
 *     /n/<국 id>?view=전원 계통&power=<ledger|tree>&supply=<공급 설비>
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
        /* 전원 계통의 보기(power)·블록 초점(supply)은 그 판의 것 — 다른 판으로 가면 주소에 남기지 않는다
           (돌아오면 대장에서, 초점 없이 연다. 남겨 두면 다른 판 주소에 쓰이지 않는 값이 붙어 다닌다). */
        if (next !== '전원 계통') { p.delete('power'); p.delete('supply'); }
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
        /* 설비와 랙은 하나만 고른다 — 새로 고르면 다른 쪽은 놓는다(한 번의 주소 쓰기). */
        if (value) p.delete(key === 'eq' ? 'rack' : 'eq');
        /* 차단기 대장의 블록 초점은 그 블록을 고른 순간의 것 — 다른 것을 고르면 놓는다(옛 블록 테두리가 남지 않게). */
        p.delete('supply');
        return p;
      }, { replace: true });
    },
    [setParams],
  );
  const selectEquipment = useCallback((id: string | null) => setParam('eq', id), [setParam]);
  const selectRack = useCallback((id: string | null) => setParam('rack', id), [setParam]);

  /** 선번장 블록 초점 — 블록은 설비 선택과 따로 산다(블록을 보며 그 끝의 설비를 상세로 연다). */
  const focusBlock = useCallback(
    (next: BlockFocus | null) => {
      setParams((prev) => {
        const p = new URLSearchParams(prev);
        if (next) { p.set('line', next.lineId); p.set('side', next.side); } else { p.delete('line'); p.delete('side'); }
        return p;
      }, { replace: true });
    },
    [setParams],
  );

  /**
   * 선번장의 그 블록으로 — 판과 초점을 **한 번의 주소 쓰기**로 바꾼다(둘로 나누면 앞의 쓰기가 뒤에 덮인다).
   * 고른 설비·랙은 놓는다 — 선번장은 12열 표가 우선이라(상세가 서면 1280·1440 모두 측정 열이 판 밖으로 밀린다)
   * 블록을 읽으러 간 사람에게 표 전체를 준다. 초점 블록은 테두리로 남는다.
   *
   * **기록을 남긴다**(판 바꾸기와 다르다) — 다른 자리로 건너가는 일이라, 뒤로 가기가 떠나 온 설비 상세로 돌아와야 한다.
   */
  const openBlock = useCallback(
    (next: BlockFocus) => {
      setParams((prev) => {
        const p = new URLSearchParams(prev);
        p.set('view', '선번장');
        p.set('line', next.lineId);
        p.set('side', next.side);
        p.delete('eq');
        p.delete('rack');
        return p;
      });
    },
    [setParams],
  );

  /**
   * 그 설비의 상세로 — 현황 판에서 그 설비를 고른다(상세 레일이 선다). 선번장 블록 머리의 단자 이름이 부른다.
   * 블록 초점은 놓고, `openBlock` 처럼 **기록을 남긴다** — 뒤로 가면 보던 블록으로 돌아온다.
   */
  const openEquipment = useCallback(
    (id: string) => {
      setParams((prev) => {
        const p = new URLSearchParams(prev);
        p.set('view', '현황');
        p.set('eq', id);
        p.delete('rack');
        p.delete('line');
        p.delete('side');
        return p;
      });
    },
    [setParams],
  );

  /** 전원 계통의 보기 전환 — 판 바꾸기와 같이 기록을 남기지 않는다. 기본(대장)은 주소에 적지 않는다. */
  const setPowerView = useCallback(
    (next: PowerView) => {
      setParams((prev) => {
        const p = new URLSearchParams(prev);
        if (next === 'ledger') p.delete('power'); else p.set('power', next);
        return p;
      }, { replace: true });
    },
    [setParams],
  );

  /**
   * 차단기 대장의 블록 하나를 고른다 — 그 공급 설비를 상세로 열고(`eq`) 블록 초점(`supply`)을 **한 번의 주소 쓰기**로.
   * null 이면 블록 초점만 놓는다.
   */
  const selectSupply = useCallback(
    (id: string | null) => {
      setParams((prev) => {
        const p = new URLSearchParams(prev);
        if (id) { p.set('supply', id); p.set('eq', id); p.delete('rack'); } else p.delete('supply');
        return p;
      }, { replace: true });
    },
    [setParams],
  );

  /**
   * 전원 계통 차단기 대장의 그 설비 블록으로 — 상세 패널(차단기 카드·연결 탭 「입력 전원」)이 부른다.
   * 판·보기(대장)·블록 초점·설비 선택을 **한 번의 주소 쓰기**로 바꾸고, `openBlock` 처럼 **기록을 남긴다** —
   * 뒤로 가면 떠나 온 화면으로 돌아온다. 상세는 그대로 선다(`eq` 유지 — `selectSupply` 와 같은 꼴).
   */
  const openSupply = useCallback(
    (id: string) => {
      setParams((prev) => {
        const p = new URLSearchParams(prev);
        p.set('view', '전원 계통');
        p.delete('power');
        p.set('supply', id);
        p.set('eq', id);
        p.delete('rack');
        p.delete('line');
        p.delete('side');
        return p;
      });
    },
    [setParams],
  );

  const eqId = params.get('eq');
  const rackId = params.get('rack');
  const lineParam = params.get('line');
  const sideParam = params.get('side');
  const block: BlockFocus | null = useMemo(
    () => (lineParam && (sideParam === 'A' || sideParam === 'B') ? { lineId: lineParam, side: sideParam } : null),
    [lineParam, sideParam],
  );

  const power: PowerView = params.get('power') === 'tree' ? 'tree' : 'ledger';
  const supply = params.get('supply');

  /* 같은 객체로 유지한다 — 의존성에 넣은 콜백·캔버스가 매 렌더 다시 만들어지지 않게. */
  return useMemo(
    () => ({
      nodeId, view, eqId, rackId, block, power, supply,
      selectNode, setView, selectEquipment, selectRack, focusBlock, openBlock, openEquipment, setPowerView, selectSupply, openSupply,
    }),
    [nodeId, view, eqId, rackId, block, power, supply, selectNode, setView, selectEquipment, selectRack, focusBlock, openBlock, openEquipment, setPowerView, selectSupply, openSupply],
  );
}
