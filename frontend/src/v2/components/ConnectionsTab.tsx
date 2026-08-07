/**
 * ConnectionsTab — 상세 패널 4번째 탭 '연결'
 *
 * 자산의 포트 목록(그룹별): 각 포트에 연결 상태(상대 자산·포트 이름 — effective cables + 전체
 * assets 해소)를 표시한다. 연결된 포트에는 [추적] 버튼이 있고, 클릭하면 traceHighlight 결과를
 * 상위 콜백(onTrace)으로 올린다. 추적 중이면 경로 텍스트 목록과 [지우기] 버튼을 표시한다.
 */

import { useEffect, useMemo, useState } from 'react';
import { DetailCardHeader, Button, DetailCard, DetailRow, EmptyState, cn, SELECTABLE } from '../../components/ui';
import { mergeEffective } from '../store/overlay';
import { buildPortIndex, endpointRef, resolvePeer } from '../peerResolve';
import { withDescendants } from '../cableSelectors';
import { useV2WorkingCopy } from '../store/workingCopyStore';
import { internalLinkMap, portDirectionLabel } from '@twin/core';
import { buildTraceInputs, traceHighlight } from '../traceSelectors';
import { useV2Catalog, useMediumLabel } from '../hooks';
import type { TraceResult } from '../traceSelectors';
import type { V2Asset, V2Cable, V2Port } from '../types';
import { PortMatrix, PortLegend, PORT_STATE_LABEL, type PortState } from './PortMatrix';

interface ConnectionsTabProps {
  assetId: string;
  /** 대국·추적 경로에서 다른 자산으로 이동한다 — 워크스페이스의 단일 이동 지점. */
  onSelectAsset: (id: string) => void;
  onTrace: (result: TraceResult) => void;
  onClearTrace: () => void;
  traceResult?: TraceResult | null;
}

export function ConnectionsTab({ assetId, onSelectAsset, onTrace, onClearTrace, traceResult }: ConnectionsTabProps) {
  // 타일에는 번호만 있으므로, 고른 포트 하나의 상세를 아래에 펼친다.
  const [selectedPortId, setSelectedPortId] = useState<string | null>(null);
  // 자산을 옮기면 이전 자산의 포트가 골라진 채 남지 않게 한다.
  useEffect(() => setSelectedPortId(null), [assetId]);
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

  /* portId → 그 포트에 물린 **모든** 케이블.
     예전에는 포트당 하나만 담는 Map 이라 `set` 이 앞의 것을 덮어썼다. 접지 부스바처럼
     한 단자에 여러 가닥이 모이면 마지막 한 가닥만 보이고 나머지는 화면에서 사라졌다. */
  const cablesByPortId = useMemo(() => {
    const map = new Map<string, { cableId: string; peerPortId: string; cable: V2Cable }[]>();
    const add = (portId: string, entry: { cableId: string; peerPortId: string; cable: V2Cable }) => {
      const list = map.get(portId);
      if (list) list.push(entry);
      else map.set(portId, [entry]);
    };
    for (const cable of effectiveCables) {
      add(cable.aPortId, { cableId: cable.id, peerPortId: cable.bPortId, cable });
      add(cable.bPortId, { cableId: cable.id, peerPortId: cable.aPortId, cable });
    }
    return map;
  }, [effectiveCables]);

  // portId → { port, asset } 인덱스 — buildPortIndex 공유 헬퍼 (B-V1 시정)
  // hopText·peer 해소 모두 여기서 조회 — 수제 portById/assetByPortId 맵 제거(M-1 시정)
  const portIndex = useMemo(() => buildPortIndex(effectiveAssets), [effectiveAssets]);

  /* 이 자산과 **자손**의 포트를 함께 본다.
     랙·함체 자체에는 포트가 없고 안에 든 장비가 갖는다. 예전에는 자기 포트만 봐서
     랙에는 포트 탭조차 뜨지 않았고, 무엇이 어디에 물려 있는지 보려면 장비마다 하나씩
     들어가야 했다. 케이블 피커는 이미 같은 방식으로 자손 포트를 모아 보여주고 있었다. */
  const portOwners = useMemo(() => {
    if (!asset) return [] as { owner: V2Asset; groups: Map<string, V2Port[]> }[];
    return withDescendants(effectiveAssets, asset.id)
      .filter((a) => a.ports.length > 0)
      .map((a) => {
        const groups = new Map<string, V2Port[]>();
        for (const p of a.ports) {
          const list = groups.get(p.group) ?? [];
          list.push(p);
          groups.set(p.group, list);
        }
        for (const [, list] of groups) list.sort((x, y) => x.index - y.index);
        return { owner: a, groups };
      });
  }, [asset, effectiveAssets]);

  /* 포트 점유 상태 — 내부 짝이 있으면 그 짝과 함께 하나의 회선으로 본다.
     짝이 둘 다 물려야 '양측', 하나만이면 '편도'. 짝이 없는 포트는 2단계뿐이다.
     "광" 같은 도메인 단어가 들어가지 않는다 — 내부 통과 규칙이 있으면 무엇이든 이렇게 센다. */
  const portState = (port: V2Port): PortState => {
    const mine = cablesByPortId.has(port.id);
    const partners = internalOf.get(port.id) ?? [];
    if (partners.length === 0) return mine ? 'full' : 'empty';
    const partnerConnected = partners.some((id) => cablesByPortId.has(id));
    if (mine && partnerConnected) return 'full';
    if (mine || partnerConnected) return 'half';
    return 'empty';
  };
  const hasInternalLinks = internalOf.size > 0;

  const selectedPort = useMemo(
    () => (asset?.ports ?? []).find((p) => p.id === selectedPortId) ?? null,
    [asset, selectedPortId],
  );
  /* 고른 포트에 물린 대국 — 부스바는 여럿이다. 하나만 보여 주면 나머지가 없는 것처럼 읽힌다. */
  const selectedPeers = useMemo(() => {
    if (!selectedPort || !asset) return [];
    return (cablesByPortId.get(selectedPort.id) ?? []).flatMap((conn) => {
      const peer = resolvePeer(selectedPort, conn.cable, portIndex, asset.substationId);
      if (!peer) return [];
      const sub = peer.remote && peer.substationName ? ` (${peer.substationName})` : '';
      return [{
        cableId: conn.cableId,
        label: `${peer.assetName} · ${peer.portName}${sub}`,
        entry: portIndex.get(conn.peerPortId),
      }];
    });
  }, [selectedPort, cablesByPortId, portIndex, asset]);

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
    // 추적 경로의 한 홉은 케이블 하나를 따라간 것이므로 첫 가닥으로 이름을 짓는다.
    const cableEntry = cablesByPortId.get(hop.toPortId)?.[0];
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

  // 자기 포트가 없어도 안에 든 장비가 가질 수 있다 — 랙·함체가 그렇다.
  if (portOwners.length === 0) {
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

      {/* 포트 매트릭스 (그룹별) — 판을 보고 빈 자리를 찾는다 */}
      {portOwners.map(({ owner, groups }) => {
        const ownerPorts = [...groups.values()].flat();
        const connected = ownerPorts.filter((pt) => cablesByPortId.has(pt.id)).length;
        const isSelf = owner.id === assetId;
        return (
          <DetailCard key={owner.id}>
            {/* 자기 포트인지 안에 든 장비의 포트인지 이름으로 구분한다.
                장비 이름을 누르면 그 장비로 들어간다. */}
            <DetailCardHeader
              title={
                isSelf ? (
                  '포트'
                ) : (
                  <button
                    type="button"
                    className={cn('rounded px-1 text-left text-primary', SELECTABLE)}
                    title={`${owner.name} 으로 이동`}
                    onClick={() => onSelectAsset(owner.id)}
                  >
                    {owner.name}
                  </button>
                )
              }
              badge={`${connected}/${ownerPorts.length} 연결`}
              badgeStatus={connected > 0 ? 'success' : 'neutral'}
            />
            {[...groups.entries()].map(([group, ports]) => (
              <div key={group} className="space-y-1">
                {groups.size > 1 && <p className="text-xs text-content-muted">{group} 그룹</p>}
                <PortMatrix
                  labelPrefix={isSelf ? undefined : owner.name}
                  ports={ports}
                  stateOf={portState}
                  selectedPortId={selectedPortId}
                  onSelect={(id) => setSelectedPortId((prev) => (prev === id ? null : id))}
                />
              </div>
            ))}
            <PortLegend states={hasInternalLinks ? ['empty', 'half', 'full'] : ['empty', 'full']} />
          </DetailCard>
        );
      })}

      {/* 고른 포트 하나의 상세 — 타일에는 번호와 상태만 있으므로 대국은 여기서 본다. */}
      {selectedPort && (
        <DetailCard>
          <DetailCardHeader
            title={selectedPort.name}
            badge={PORT_STATE_LABEL[portState(selectedPort)]}
            badgeStatus={portState(selectedPort) === 'full' ? 'success' : portState(selectedPort) === 'half' ? 'warning' : 'neutral'}
            actions={
              selectedPeers.length > 0 ? (
                <Button variant="secondary" size="sm" onClick={() => handleTrace(selectedPort.id)}>
                  추적
                </Button>
              ) : undefined
            }
          />
          <DetailRow label={selectedPeers.length > 1 ? `대국 ${selectedPeers.length}` : '대국'}>
            {selectedPeers.length > 0 ? (
              <div className="flex min-w-0 flex-col items-start">
                {selectedPeers.map((peer) => (
                  <button
                    key={peer.cableId}
                    type="button"
                    className={cn('min-w-0 max-w-full truncate rounded px-1 text-left text-sm text-primary', SELECTABLE)}
                    title={`${peer.label} 으로 이동`}
                    disabled={!peer.entry}
                    onClick={() => peer.entry && onSelectAsset(peer.entry.asset.id)}
                  >
                    {peer.label}
                  </button>
                ))}
              </div>
            ) : (
              <span className="text-sm text-content-faint">미연결</span>
            )}
          </DetailRow>
          {internalOf.get(selectedPort.id)?.length ? (
            <DetailRow label="내부 통과">
              <span className="text-sm text-content-muted">
                {internalOf.get(selectedPort.id)!.map((id) => portNameById.get(id) ?? '?').join(', ')}
              </span>
            </DetailRow>
          ) : null}
          <DetailRow label="매체">
            <span className="text-sm text-content-muted">
              {mediumLabel(selectedPort.medium)} · {portDirectionLabel(selectedPort.direction)}
            </span>
          </DetailRow>
        </DetailCard>
      )}

      {/* 연결은 평면도에서 만든다 — 여기서 할 수 없다는 사실 자체를 알려준다. */}
      <p className="px-1 text-xs text-content-faint">
        연결은 평면도 뷰의 <strong className="font-medium">케이블</strong> 도구로 만듭니다.
      </p>
    </div>
  );
}
