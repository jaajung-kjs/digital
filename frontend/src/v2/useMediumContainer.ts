import { useMemo } from 'react';
import type { V2Asset } from './types';

export interface ContainerOption {
  key: string;
  label: string;
}

export interface MediumContainerPick {
  options: ContainerOption[];
  activeKey: string;
  setActiveKey: (key: string) => void;
  /** 고른 설비. */
  active: V2Asset | null;
}

/**
 * 선번장·계통이 "어느 설비를 보고 있나" 를 정하는 한 곳.
 *
 * 예전에는 표의 단위가 **(자산, 컨테이너)** 였다. 자리를 자산 종류가 선언했고 타입이
 * 컨테이너를 여러 개 가질 수 있었기 때문인데, 이제 자리는 설비 종류의 격자 하나뿐이라 그 축이
 * 사라졌다 — 단위는 설비 하나다.
 *
 * **「지금 보는 설비」는 하나다.** 예전에는 이 훅이 뷰마다 제 `useState` 를 들고 있어서,
 * 현황에서 판암 송광치를 골라도 선번장 드롭다운은 판암 OFD 를 가리켰다 — 한 화면이 두 설비를
 * 동시에 「지금 것」이라고 말한 셈이다. 이제 **주소가 유일한 출처**이고, 차례는 이렇다:
 *
 *   1. 고른 자산이 어느 설비 안에 있으면 **그 설비** (현황·평면도에서 고른 것이 따라온다)
 *   2. 아니면 주소에 적힌 설비 (드롭다운으로 고른 것)
 *   3. 그것도 없으면 첫 번째 — 빈 화면을 보여 주는 것보다 낫다
 */
export function useMediumContainer(
  equipments: V2Asset[],
  from: {
    /** 상위를 거슬러 올라갈 때 쓴다 — 고른 것이 부품이면 그것을 품은 설비를 찾아야 한다. */
    assets: V2Asset[];
    /** 워크스페이스가 고른 자산(주소의 `asset`). */
    selectedAssetId: string | null;
    /** 드롭다운으로 고른 설비(주소의 `eq`). */
    containerId: string | null;
    onPickContainer: (id: string) => void;
  },
): MediumContainerPick {
  const options = useMemo<ContainerOption[]>(
    () => equipments.map((e) => ({ key: e.id, label: e.name })),
    [equipments],
  );

  const fromSelection = useMemo(() => {
    if (from.selectedAssetId == null) return null;
    const keys = new Set(options.map((o) => o.key));
    const byId = new Map(from.assets.map((a) => [a.id, a]));
    /* 부품에서 시작해 이 표가 아는 설비가 나올 때까지 올라간다. 이 표에 없는 것(다른 매체의
       설비 등)을 고른 상태면 아무것도 못 찾고 끝난다 — 그때는 아래 차례로 넘어간다. */
    let cur = byId.get(from.selectedAssetId) ?? null;
    while (cur) {
      if (keys.has(cur.id)) return cur.id;
      cur = cur.parentAssetId ? (byId.get(cur.parentAssetId) ?? null) : null;
    }
    return null;
  }, [from.assets, from.selectedAssetId, options]);

  const picked = fromSelection ?? from.containerId;
  const activeKey = options.some((o) => o.key === picked) ? picked! : (options[0]?.key ?? '');
  return {
    options,
    activeKey,
    setActiveKey: from.onPickContainer,
    active: equipments.find((e) => e.id === activeKey) ?? null,
  };
}
