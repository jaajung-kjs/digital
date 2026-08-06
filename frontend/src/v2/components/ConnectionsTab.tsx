/**
 * ConnectionsTab — 상세 패널 4번째 탭 '연결'
 *
 * 자산의 포트 목록(그룹별): 각 포트에 연결 상태(상대 자산·포트 이름 — effective cables + 전체
 * assets 해소)를 표시한다. 연결된 포트에는 [추적] 버튼이 있고, 클릭하면 traceHighlight 결과를
 * 상위 콜백(onTrace)으로 올린다. 추적 중이면 경로 텍스트 목록과 [지우기] 버튼을 표시한다.
 */

import { useMemo } from 'react';
import { DetailCardHeader, Button, DetailCard, EmptyState, cn, SELECTABLE } from '../../components/ui';
import { mergeEffective } from '../store/overlay';
import { buildPortIndex, endpointRef, resolvePeer } from '../peerResolve';
import { useV2WorkingCopy } from '../store/workingCopyStore';
import { internalLinkMap, portDirectionLabel } from '@twin/core';
import { buildTraceInputs, traceHighlight } from '../traceSelectors';
import { useV2Catalog, useMediumLabel } from '../hooks';
import type { TraceResult } from '../traceSelectors';
import type { V2Cable, V2Port } from '../types';

interface ConnectionsTabProps {
  assetId: string;
  /** 대국·추적 경로에서 다른 자산으로 이동한다 — 워크스페이스의 단일 이동 지점. */
  onSelectAsset: (id: string) => void;
  onTrace: (result: TraceResult) => void;
  onClearTrace: () => void;
  traceResult?: TraceResult | null;
}

export function ConnectionsTab({ assetId, onSelectAsset, onTrace, onClearTrace, traceResult }: ConnectionsTabProps) {
  const saved = useV2WorkingCopy((s) => s.saved);
  const overlays = useV2WorkingCopy((s) => s.overlays);

  const effectiveAssets = useMemo(() => mergeEffective(saved.assets, overlays.assets), [saved, overlays]);
  const effectiveCables = useMemo(() => mergeEffective(saved.cables, overlays.cables), [saved, overlays]);

  const catalog = useV2Catalog();
  const mediumLabel = useMediumLabel();
  const categories = catalog.data?.categories ?? [];
  const types = catalog.data?.types ?? [];

  const asset = useMemo(() => effectiveAssets.find((a) => a.id === assetId), [effectiveAssets, assetId]);

  /* 자산 내부 통과 — 타입이 선언한 링크 규칙이 실제로 어느 포트끼리를 잇는지.
     추적이 이 장비를 왜 통과하는지가 여기서 드러난다(계산은 core 와 공유). */
  const internalOf = useMemo(() => {
    const type = types.find((t) => t.id === asset?.typeId);
    if (!asset || !type || type.linkRules.length === 0) return new Map<string, string[]>();
    return internalLinkMap(
      type.linkRules.map((r) => ({ fromGroup: r.fromGroup, toGroup: r.toGroup, mapping: r.mapping })),
      asset.ports.map((p) => ({ ...p, assetId: asset.id })),
    );
  }, [asset, types]);
  const portNameById = useMemo(
    () => new Map((asset?.ports ?? []).map((p) => [p.id, p.name])),
    [asset],
  );

  // portId → cable + peer port 매핑
  const cableByPortId = useMemo(() => {
    const map = new Map<string, { cableId: string; peerPortId: string; cable: V2Cable }>();
    for (const cable of effectiveCables) {
      map.set(cable.aPortId, { cableId: cable.id, peerPortId: cable.bPortId, cable });
      map.set(cable.bPortId, { cableId: cable.id, peerPortId: cable.aPortId, cable });
    }
    return map;
  }, [effectiveCables]);

  // portId → { port, asset } 인덱스 — buildPortIndex 공유 헬퍼 (B-V1 시정)
  // hopText·peer 해소 모두 여기서 조회 — 수제 portById/assetByPortId 맵 제거(M-1 시정)
  const portIndex = useMemo(() => buildPortIndex(effectiveAssets), [effectiveAssets]);

  // 포트를 그룹별로 묶기 (early return 위 — 훅 순서 보장; asset 미해소 시 빈 Map)
  const assetPorts = asset?.ports;
  const portsByGroup = useMemo(() => {
    const map = new Map<string, V2Port[]>();
    for (const p of assetPorts ?? []) {
      const list = map.get(p.group) ?? [];
      list.push(p);
      map.set(p.group, list);
    }
    // 각 그룹 내 index 순 정렬
    for (const [, list] of map) {
      list.sort((a, b) => a.index - b.index);
    }
    return map;
  }, [assetPorts]);

  // hop → 표시용 텍스트 (portIndex 단일 조회 — portById/assetByPortId 수제 맵 제거)
  function hopText(hop: import('../traceSelectors').TraceResult['hops'][number]): string {
    if (hop.kind === 'internal') {
      return '↔ 내부';
    }
    // cable hop: portIndex에서 toPort의 asset명 + port명 조회
    const entry = portIndex.get(hop.toPortId);
    if (entry) {
      return `${entry.asset.name} · ${entry.port.name}`;
    }
    // 로컬 미해소 포트 — 해당 케이블 saved refs로 표기 (끝점 자신의 ref — endpointRef 한 곳 규칙)
    const cableEntry = cableByPortId.get(hop.toPortId);
    if (cableEntry) {
      const ref = endpointRef(cableEntry.cable, hop.toPortId);
      if (ref) {
        const sub = ref.substationName ? ` (${ref.substationName})` : '';
        return `${ref.assetName} · ${ref.portName}${sub}`;
      }
    }
    return `포트 —`;
  }

  function handleTrace(portId: string) {
    const inputs = buildTraceInputs({ types, categories, assets: effectiveAssets, cables: effectiveCables });
    const result = traceHighlight(inputs, portId);
    onTrace(result);
  }

  if (!asset) return null;

  if (asset.ports.length === 0) {
    return (
      <EmptyState
        title="이 자산에는 포트가 없습니다"
        description="포트는 자산 타입의 명세에서 정의합니다 — 자산 카탈로그에서 이 타입에 포트를 추가하세요."
        className="py-6"
      />
    );
  }

  return (
    <div className="space-y-3">
      {/* 추적 결과 패널 */}
      {traceResult && traceResult.hops.length > 0 && (
        <DetailCard>
          <DetailCardHeader
            title="추적 경로"
            actions={
              <Button variant="secondary" size="sm" onClick={onClearTrace}>
                지우기
              </Button>
            }
          />
          <ol className="space-y-0.5">
            {traceResult.hops.map((hop, i) => {
              // 경로에 나온 자산은 눌러서 그리로 갈 수 있어야 한다 — 예전에는 글자일 뿐이라
              // 경로를 읽고도 그 장비를 찾으려면 표에서 다시 검색해야 했다.
              const target = hop.kind === 'internal' ? undefined : portIndex.get(hop.toPortId)?.asset;
              return (
                <li key={i} className="text-sm text-content">
                  <span className="mr-1 text-xs text-content-faint">{i + 1}.</span>
                  {target ? (
                    <button
                      type="button"
                      className={cn('rounded px-1 text-left text-primary', SELECTABLE)}
                      title={`${target.name} 으로 이동`}
                      onClick={() => onSelectAsset(target.id)}
                    >
                      {hopText(hop)}
                    </button>
                  ) : (
                    <span className="text-content-muted">{hopText(hop)}</span>
                  )}
                </li>
              );
            })}
          </ol>
        </DetailCard>
      )}
      {traceResult && traceResult.hops.length === 0 && (
        <DetailCard>
          <DetailCardHeader
            title={<span className="font-normal text-content-faint">연결된 경로가 없습니다.</span>}
            actions={
              <Button variant="secondary" size="sm" onClick={onClearTrace}>
                지우기
              </Button>
            }
          />
        </DetailCard>
      )}

      {/* 포트 목록 (그룹별) */}
      {[...portsByGroup.entries()].map(([group, ports]) => {
        const connectedCount = ports.filter((pt) => cableByPortId.has(pt.id)).length;
        return (
          <DetailCard key={group}>
            {/* 그룹 머리줄에 사용률을 함께 적는다 — 포트가 12개쯤 되면 한 줄 한 줄 세는 대신
                "몇 개가 물려 있나" 를 먼저 알고 싶다. */}
            <DetailCardHeader
              title={`${group} 그룹`}
              badge={`${connectedCount}/${ports.length} 연결`}
              badgeStatus={connectedCount > 0 ? 'success' : 'neutral'}
            />
            <ul className="space-y-0.5">
              {ports.map((port) => {
                const conn = cableByPortId.get(port.id);

                // 3단 peer 해소 — resolvePeer 공유 헬퍼 (B-V1 시정: 인라인 재구현 → 단일화)
                let peerLabel: string | null = null;
                if (conn) {
                  const peer = resolvePeer(port, conn.cable, portIndex, asset.substationId);
                  if (peer) {
                    const sub = peer.remote && peer.substationName ? ` (${peer.substationName})` : '';
                    peerLabel = `${peer.assetName} · ${peer.portName}${sub}`;
                  }
                }
                const peerPortEntry = conn ? portIndex.get(conn.peerPortId) : undefined;

                return (
                  <li key={port.id} className="flex items-center gap-2 rounded px-1 py-1 text-sm">
                    {/* 연결 여부를 점 하나로 — 행마다 배지를 달면 정작 포트 이름보다 무겁다. */}
                    <span
                      aria-hidden
                      className={cn(
                        'size-1.5 shrink-0 rounded-full',
                        conn ? 'bg-success' : 'bg-content-faint/40',
                      )}
                    />
                    <span className="w-16 shrink-0 truncate text-content">{port.name}</span>
                    {peerLabel ? (
                      <button
                        type="button"
                        className={cn('min-w-0 flex-1 truncate rounded px-1 text-left text-primary', SELECTABLE)}
                        title={`${peerLabel} 으로 이동`}
                        disabled={!peerPortEntry}
                        onClick={() => peerPortEntry && onSelectAsset(peerPortEntry.asset.id)}
                      >
                        {peerLabel}
                      </button>
                    ) : (
                      <span className="min-w-0 flex-1 text-content-faint">미연결</span>
                    )}
                    {/* 내부로 이어지는 포트 — 이게 있으면 추적이 이 장비를 통과한다. */}
                    {internalOf.get(port.id)?.length ? (
                      <span
                        className="shrink-0 text-xs text-content-faint"
                        title="이 장비 안에서 이어진 포트"
                      >
                        ↔ {internalOf.get(port.id)!.map((id) => portNameById.get(id) ?? '?').join(', ')}
                      </span>
                    ) : null}
                    <span className="shrink-0 text-xs text-content-faint">
                      {mediumLabel(port.medium)} · {portDirectionLabel(port.direction)}
                    </span>
                    {peerPortEntry && (
                      <Button variant="ghost" size="sm" onClick={() => handleTrace(port.id)}>
                        추적
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </DetailCard>
        );
      })}

      {/* 연결은 평면도에서 만든다 — 여기서 할 수 없다는 사실 자체를 알려준다. */}
      <p className="px-1 text-xs text-content-faint">
        연결은 평면도 뷰의 <strong className="font-medium">케이블</strong> 도구로 만듭니다.
      </p>
    </div>
  );
}
