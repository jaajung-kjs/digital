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
import { useV2Catalog, useMediumLabel, useMediumColor } from '../hooks';
import type { TraceResult } from '../traceSelectors';
import type { V2Asset, V2Cable, V2Port } from '../types';
import { PortFaceplate, PORT_STATE_LABEL, type PortState } from './PortFaceplate';
import { PORT_KINDS, portGroupLabel } from '@twin/core';

/** 한 장비의 포트를 그룹 단위로 묶은 것 — 이름·정렬은 종류 선언에서 나온다. */
interface PortGroupView {
  group: string;
  label: string;
  medium: string;
  direction: V2Port['direction'];
  ports: V2Port[];
}
interface PortOwner {
  owner: V2Asset;
  groups: PortGroupView[];
}

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
  const mediumColor = useMediumColor();
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
  const portOwners = useMemo<PortOwner[]>(() => {
    if (!asset) return [];
    return withDescendants(effectiveAssets, asset.id)
      .filter((a) => a.ports.length > 0)
      .map((a) => {
        const byGroup = new Map<string, V2Port[]>();
        for (const p of a.ports) {
          const list = byGroup.get(p.group) ?? [];
          list.push(p);
          byGroup.set(p.group, list);
        }
        for (const [, list] of byGroup) list.sort((x, y) => x.index - y.index);

        /* 알파벳순이면 `COM · GND · P · PWR-IN` 처럼 뜻 없는 순서가 된다.
           종류 선언 순서(전원 → 네트워크 → 광 → 제어 → 접지)로 읽는다. */
        const refs = [...byGroup.entries()].map(([group, ports]) => ({
          group, medium: ports[0]!.medium, direction: ports[0]!.direction, sampleName: ports[0]!.name,
        }));
        const kindOrder = (medium: string) => {
          const i = PORT_KINDS.findIndex((k) => k.key === medium);
          return i < 0 ? PORT_KINDS.length : i; // 어휘에 없는 것은 뒤로
        };
        const groups = refs
          .slice()
          .sort((x, y) => kindOrder(x.medium) - kindOrder(y.medium) || x.group.localeCompare(y.group))
          .map((ref) => ({ ...ref, label: portGroupLabel(ref, refs), ports: byGroup.get(ref.group)! }));

        return { owner: a, groups };
      });
  }, [asset, effectiveAssets]);

  /* 연결 내역 — 물려 있는 것만 한 표로.
     판(mimic panel)은 빈 자리까지 포함한 **전체 현황**을, 표는 **무엇이 어디로 가는지**를
     보여 준다. 장비 관리 UI(Meraki·UniFi)가 쓰는 두 벌 구성이다. 예전에는 판만 있어서
     대국을 알려면 포트를 하나씩 눌러 봐야 했다. */
  const connectionRows = useMemo(() => {
    if (!asset) return [];
    const categories = catalog.data?.cableGroups.flatMap((g) => g.categories) ?? [];
    return portOwners.flatMap(({ owner, groups }) =>
      groups.flatMap(({ ports }) =>
        ports.flatMap((port) =>
          (cablesByPortId.get(port.id) ?? []).map((conn) => {
            const peer = resolvePeer(port, conn.cable, portIndex, asset.substationId);
            const cat = categories.find((c) => c.id === conn.cable.categoryId);
            const lengthM = (conn.cable.specParams as Record<string, unknown> | null)?.lengthM;
            const sub = peer?.remote && peer.substationName ? ` (${peer.substationName})` : '';
            return {
              key: `${port.id}-${conn.cableId}`,
              portId: port.id,
              portLabel: owner.id === asset.id ? port.name : `${owner.name} · ${port.name}`,
              peerLabel: peer ? `${peer.assetName} · ${peer.portName}${sub}` : null,
              peerAssetId: portIndex.get(conn.peerPortId)?.asset.id ?? null,
              cableLabel: [cat?.name, typeof lengthM === 'number' ? `${lengthM}m` : null]
                .filter(Boolean)
                .join(' · '),
            };
          }),
        ),
      ),
    );
  }, [asset, portOwners, cablesByPortId, portIndex, catalog.data]);

  /* 포트 점유 상태 — 내부 짝이 있으면 그 짝과 함께 하나의 회선으로 본다.
     짝이 둘 다 물려야 '양측', 하나만이면 '편도'. 짝이 없는 포트는 2단계뿐이다.
     "광" 같은 도메인 단어가 들어가지 않는다 — 내부 통과 규칙이 있으면 무엇이든 이렇게 센다.

     **편도는 짝이 양방향으로 하나뿐일 때만 따진다.** 전원분배처럼 입력 1개가 출력 13개와
     이어지는 모선(mapping `all`)에서는 "반대쪽 끝" 이라는 것이 없다 — 그런데도 편도로 세면
     입력 한 가닥만 물려도 쓰지 않는 출력 12개가 전부 점선으로 떠서, 실제로 케이블이 있는
     한 개와 구분되지 않는다(실제로 그렇게 보였다). */
  const portState = (port: V2Port): PortState => {
    const mine = cablesByPortId.has(port.id);
    const partners = internalOf.get(port.id) ?? [];
    const exclusivePair =
      partners.length === 1 && (internalOf.get(partners[0]!) ?? []).length === 1;
    if (!exclusivePair) return mine ? 'full' : 'empty';
    const partnerConnected = cablesByPortId.has(partners[0]!);
    if (mine && partnerConnected) return 'full';
    if (mine || partnerConnected) return 'half';
    return 'empty';
  };

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
        const ownerPorts = groups.flatMap((g) => g.ports);
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
            {/* 장비 하나에 전면판 한 장 — 구획은 그 판 위에서 나뉜다. */}
            <PortFaceplate
              labelPrefix={isSelf ? undefined : owner.name}
              sections={groups.map(({ group, label, medium, ports }) => ({
                key: group, label, accent: mediumColor(medium), ports,
              }))}
              stateOf={portState}
              cableCountOf={(port) => cablesByPortId.get(port.id)?.length ?? 0}
              selectedPortId={selectedPortId}
              onSelect={(id) => setSelectedPortId((prev) => (prev === id ? null : id))}
            />
          </DetailCard>
        );
      })}

      {/* 연결 내역 — 판이 "어디가 비었나" 라면 여기는 "무엇이 어디로 가나" 다. */}
      {connectionRows.length > 0 && (
        <DetailCard>
          <DetailCardHeader title="연결" badge={`${connectionRows.length}`} badgeStatus="neutral" />
          <ul className="divide-y divide-line">
            {connectionRows.map((row) => (
              <li
                key={row.key}
                /* 케이블 정보는 툴팁으로 — 384px 패널에서 대국 이름과 자리를 다투면
                   정작 어디로 가는지가 잘린다(`접지단자함 G1 · 접지 부…`). */
                title={row.cableLabel || undefined}
                className={cn(
                  'group flex items-center gap-2 rounded py-1.5',
                  row.portId === selectedPortId && 'bg-info-bg',
                )}
              >
                <button
                  type="button"
                  className={cn('shrink-0 rounded px-1 text-xs tabular-nums text-content-muted', SELECTABLE)}
                  title={`${row.portLabel} 을 판에서 고르기`}
                  onClick={() => setSelectedPortId((prev) => (prev === row.portId ? null : row.portId))}
                >
                  {row.portLabel}
                </button>
                <span className="shrink-0 text-xs text-content-faint" aria-hidden>→</span>
                <button
                  type="button"
                  className={cn('min-w-0 flex-1 truncate rounded px-1 text-left text-sm text-primary', SELECTABLE)}
                  title={row.peerLabel ? `${row.peerLabel} 으로 이동` : undefined}
                  disabled={!row.peerAssetId}
                  onClick={() => row.peerAssetId && onSelectAsset(row.peerAssetId)}
                >
                  {row.peerLabel ?? '—'}
                </button>
              </li>
            ))}
          </ul>
        </DetailCard>
      )}

      {/* 고른 포트 하나의 상세 — 대국은 위 표가 말하므로 여기는 나머지만 적는다. */}
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
