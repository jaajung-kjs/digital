import { useMemo, useState } from 'react';
import type { V2Asset, V2Assembly } from './types';

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
  /** 그 설비의 격자 — 자리 번호와 빈 자리 계산이 여기서 나온다. */
  grid: { cols: number; rows: number } | null;
}

/**
 * 선번장·계통이 "어느 설비를 보고 있나" 를 정하는 한 곳.
 *
 * 예전에는 표의 단위가 **(자산, 컨테이너)** 였다. 자리를 자산 종류이 선언했고 타입이
 * 컨테이너를 여러 개 가질 수 있었기 때문인데, 이제 자리는 설비 종류의 격자 하나뿐이라 그 축이
 * 사라졌다 — 단위는 설비 하나다.
 */
export function useMediumContainer(
  equipments: V2Asset[],
  assembliesById: Map<string, V2Assembly>,
): MediumContainerPick {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const options = useMemo<ContainerOption[]>(
    () => equipments.map((e) => ({ key: e.id, label: e.name })),
    [equipments],
  );

  /* 고른 것이 사라졌으면(다른 변전소로 옮겼거나 지워졌거나) 첫 번째로 물러선다 —
     빈 화면을 보여 주는 것보다 낫다. */
  const activeKey = options.some((o) => o.key === selectedKey) ? selectedKey! : (options[0]?.key ?? '');
  const active = equipments.find((e) => e.id === activeKey) ?? null;
  const assembly = active?.assemblyId ? assembliesById.get(active.assemblyId) : undefined;

  return {
    options,
    activeKey,
    setActiveKey: setSelectedKey,
    active,
    grid: assembly ? { cols: assembly.gridCols, rows: assembly.gridRows } : null,
  };
}
