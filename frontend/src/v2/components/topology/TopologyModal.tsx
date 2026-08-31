/**
 * TopologyModal — **추적이 못 보는 국 밖**을 한 장으로.
 *
 * 추적은 한 국 안에서만 답한다(워킹카피가 한 국만 들기 때문이다). 그런데 내부망은 국들이
 * 링으로 얽혀 있고, 그 얽힘이 지금 어디에도 안 보인다. 이 상자가 그 여집합이다 —
 * **추적이 답한 것은 마디 안에, 그 다음은 줄로.**
 *
 * 판단은 하나도 여기 없다. 자료는 서버(`/reach`)가, 마디·줄·링·좌표는 core 가 낸다.
 */
import { useMemo } from 'react';
import { Modal } from '../../../components/ui';
import { buildTopologyGraph, computeLayout } from '@twin/core';
import { useReach } from '../../hooks';
import { TopologyCanvas } from './TopologyCanvas';

interface TopologyModalProps {
  open: boolean;
  /** 추적을 시작한 포트 — 이 그림의 시드다. */
  seedPortId: string | null;
  /** 머리에 적을 자리 이름(「광링A S/S · 광단말 A#2」). */
  seedLabel?: string;
  onClose: () => void;
}

export function TopologyModal({ open, seedPortId, seedLabel, onClose }: TopologyModalProps) {
  const reach = useReach(seedPortId, open);

  const view = useMemo(() => {
    if (!reach.data || !seedPortId) return null;
    const data = reach.data;

    /* 장비·줄·「내 코어가 간 줄」을 core 가 한 번에 낸다 — 추적은 이제 core 안에서 일어난다
       (장비마다 단심 광 포트에서 traceFrom 을 뜨는 일까지 `buildTopologyGraph` 의 몫이다). */
    const { nodes, edges, litEdgeIds } = buildTopologyGraph(data, seedPortId);
    const positions = computeLayout(nodes, edges);
    return { nodes, edges, litEdgeIds, positions };
  }, [reach.data, seedPortId]);

  return (
    <Modal open={open} onClose={onClose} size="xl" title={`토폴로지${seedLabel ? ` — ${seedLabel}` : ''}`}>
      {reach.isLoading && <p className="p-4 text-sm text-content-muted">이어진 곳을 찾는 중…</p>}
      {reach.error != null && <p className="p-4 text-sm text-danger">이어진 곳을 가져오지 못했습니다.</p>}
      {view && (
        <>
          {reach.data?.truncated && (
            <p className="mb-2 text-xs text-content-muted">
              이어진 곳이 너무 많아 일부만 그렸습니다.
            </p>
          )}
          {/* 판정은 여기서 다시 안 한다 — `nodes` 에 `isSeed` 인 마디가 하나도 없으면(정규화
              실패) core 가 이미 그렇게 나타낸 것이다. 강조도 「여기」도 없는 그림이 뜨면
              「무관한 남의 토폴로지가 떴다」로 읽히므로(사용자가 실제로 그렇게 읽었다) 이유를
              한 줄로 밝힌다. */}
          {!view.nodes.some((n) => n.isSeed) && (
            <p className="mb-2 text-xs text-content-muted">
              이 포트는 아직 어느 장비에도 닿지 않습니다 — 아래는 같은 광 계통의 장비들입니다.
            </p>
          )}
          <TopologyCanvas
            nodes={view.nodes}
            edges={view.edges}
            litEdgeIds={view.litEdgeIds}
            positions={view.positions}
          />
        </>
      )}
    </Modal>
  );
}
