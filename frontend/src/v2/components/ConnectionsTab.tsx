/**
 * ConnectionsTab — 상세 패널 4번째 탭 '연결'
 *
 * 자산의 포트 목록(그룹별): 각 포트에 연결 상태(상대 자산·포트 이름 — effective cables + 전체
 * assets 해소)를 표시한다. 연결된 포트에는 [추적] 버튼이 있고, 클릭하면 traceHighlight 결과를
 * 상위 콜백(onTrace)으로 올린다. 추적 중이면 경로 텍스트 목록과 [지우기] 버튼을 표시한다.
 */

import { useMemo } from 'react';
import { Button, DetailCard } from '../../components/ui';
import { mergeEffective } from '../store/overlay';
import { buildPortIndex, endpointRef, resolvePeer } from '../peerResolve';
import { useV2WorkingCopy } from '../store/workingCopyStore';
import { buildTraceInputs, traceHighlight } from '../traceSelectors';
import { useV2Catalog } from '../hooks';
import type { TraceResult } from '../traceSelectors';
import type { V2Cable, V2Port } from '../types';

interface ConnectionsTabProps {
  assetId: string;
  onTrace: (result: TraceResult) => void;
  onClearTrace: () => void;
  traceResult?: TraceResult | null;
}

export function ConnectionsTab({ assetId, onTrace, onClearTrace, traceResult }: ConnectionsTabProps) {
  const saved = useV2WorkingCopy((s) => s.saved);
  const overlays = useV2WorkingCopy((s) => s.overlays);

  const effectiveAssets = useMemo(() => mergeEffective(saved.assets, overlays.assets), [saved, overlays]);
  const effectiveCables = useMemo(() => mergeEffective(saved.cables, overlays.cables), [saved, overlays]);

  const catalog = useV2Catalog();
  const categories = catalog.data?.categories ?? [];
  const types = catalog.data?.types ?? [];

  const asset = useMemo(() => effectiveAssets.find((a) => a.id === assetId), [effectiveAssets, assetId]);

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
      <p className="text-xs text-content-faint px-1">이 자산에는 포트가 없습니다.</p>
    );
  }

  return (
    <div className="space-y-3">
      {/* 추적 결과 패널 */}
      {traceResult && traceResult.hops.length > 0 && (
        <DetailCard>
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold text-content-muted">추적 경로</p>
            <Button variant="ghost" size="sm" onClick={onClearTrace}>지우기</Button>
          </div>
          <ol className="space-y-0.5">
            {traceResult.hops.map((hop, i) => (
              <li key={i} className="text-xs text-content">
                <span className="text-content-faint mr-1">{i + 1}.</span>
                {hopText(hop)}
              </li>
            ))}
          </ol>
        </DetailCard>
      )}
      {traceResult && traceResult.hops.length === 0 && (
        <DetailCard>
          <div className="flex items-center justify-between">
            <p className="text-xs text-content-faint">연결된 경로가 없습니다.</p>
            <Button variant="ghost" size="sm" onClick={onClearTrace}>지우기</Button>
          </div>
        </DetailCard>
      )}

      {/* 포트 목록 (그룹별) */}
      {[...portsByGroup.entries()].map(([group, ports]) => (
        <DetailCard key={group}>
          <p className="text-xs font-semibold text-content-muted mb-1">{group} 그룹</p>
          <div className="space-y-1">
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
                <div key={port.id} className="flex items-center gap-2 text-xs">
                  <span className="w-16 shrink-0 text-content">{port.name}</span>
                  {conn && peerLabel ? (
                    <>
                      <span className="flex-1 truncate text-content-muted">
                        {peerLabel}
                      </span>
                      {peerPortEntry && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleTrace(port.id)}
                        >
                          추적
                        </Button>
                      )}
                    </>
                  ) : (
                    <span className="flex-1 text-content-faint">—</span>
                  )}
                </div>
              );
            })}
          </div>
        </DetailCard>
      ))}
    </div>
  );
}
