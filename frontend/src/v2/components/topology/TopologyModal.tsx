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
import { buildTopologyGraph, buildTraceGraph, computeLayout, detectRings, traceFrom } from '@twin/core';
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

    /* 「내 코어가 간 길」은 **추적 엔진이 그대로** 낸다 — 이번엔 자료에 대국이 다 있으므로
       코어가 국을 넘어 끝까지 간다. 토폴로지 전용 추적 규칙을 새로 만들지 않는다.

       품목 명세(`types`)는 넘기지 않아도 된다: 자산 안의 통과는 **포트 인스턴스**에서
       유도되므로(`internalLinkMap`), `buildTraceGraph` 는 `types` 를 실제로 읽지 않는다.
       그래서 이 상자는 카탈로그를 부르지 않는다 — 안 쓰는 것을 기다리면 그림만 늦어진다. */
    const graph = buildTraceGraph({
      types: {},
      assets: data.assets.map((a) => ({
        id: a.id, typeKey: a.typeId ?? '', name: a.name, parentAssetId: a.parentAssetId,
      })),
      ports: data.ports.map((p) => ({
        id: p.id, assetId: p.assetId, group: p.group, index: p.index,
        name: p.name, direction: p.direction, medium: p.medium, positions: p.positions,
      })),
      cables: data.cables.map((c) => ({ id: c.id, aPortId: c.aPortId, bPortId: c.bPortId, categoryKey: null })),
    });
    const hops = traceFrom(graph, seedPortId);

    const { nodes, edges, litEdgeIds } = buildTopologyGraph(data, seedPortId, hops);
    const rings = detectRings(edges);
    const positions = computeLayout(nodes, edges, rings);
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
