/**
 * ConnectionsTab — 상세 패널의 '포트' 탭.
 *
 * **부품 한 대에 카드 한 장**, 그 안에서 위에서 아래로: 포트 판 → 고른 포트 → 그 포트의
 * 추적 경로. 설비에는 제 포트가 없고 안에 든 부품이 갖는다.
 *
 * 무엇을 누르든 **답은 누른 자리 바로 아래**에 나온다. 예전에는 고른 포트의 상세도, 추적
 * 결과도, 부품별 연결 목록도 다른 자리에 있었다 — 부품이 열둘이면 판 열두 장을 지나야
 * 그것들이 나오므로, 누르고도 아무 일이 없는 것처럼 보였다.
 *
 * 부품마다 딸려 있던 **연결 목록은 걷었다**. 스물다섯 줄이 판 밑에 늘어서도 읽는 사람이
 * 알고 싶은 것은 「내가 누른 이 포트가 어디로 가나」였고, 그건 고른 포트 카드가 말한다.
 */

import { useEffect, useMemo, useState } from 'react';
import { DetailCardHeader, Button, DetailCard, DetailRow, EmptyState, Select, Toggle, cn, SELECTABLE } from '../../../components/ui';
import { mergeEffective } from '../../store/overlay';
import { buildPortIndex, endpointLabel, endpointRef, resolvePeer } from '../../peerResolve';
import { withDescendants } from '../../cableSelectors';
import { useV2WorkingCopy } from '../../store/workingCopyStore';
import { portFieldsFor, portValuesAt, setPortValueAt, type ValueDef } from '@twin/core';
import { buildTraceInputs, traceHighlight } from '../../traceSelectors';
import { useV2Catalog, useMediumColor, useMediumLabel } from '../../hooks';
import type { TraceResult } from '../../traceSelectors';
import type { V2Asset, V2Cable, V2Port } from '../../types';
import { PortFaceplate, type PortState } from './PortFaceplate';
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
  /** 밖에서 골라 준 포트 — 선번장의 한 줄이 포트 하나를 가리킬 때 넘어온다. */
  focusPortId?: string | null;
  /** 대국·추적 경로에서 다른 자산으로 이동한다 — 워크스페이스의 단일 이동 지점. */
  onSelectAsset: (id: string) => void;
  onTrace: (result: TraceResult) => void;
  onClearTrace: () => void;
  traceResult?: TraceResult | null;
}

export function ConnectionsTab({ assetId, focusPortId, onSelectAsset, onTrace, onClearTrace, traceResult }: ConnectionsTabProps) {
  // 타일에는 번호만 있으므로, 고른 포트 하나의 상세를 아래에 펼친다.
  const [selectedPortId, setSelectedPortId] = useState<string | null>(focusPortId ?? null);
  /* 어느 포트에서 추적을 걸었나 — 결과를 **그 포트 밑**에 펴기 위해.
     `TraceResult` 는 출발 포트를 담지 않는다(평면도 강조가 쓰는 형상이라 그럴 이유도 없다). */
  const [tracedPortId, setTracedPortId] = useState<string | null>(null);
  // 자산을 옮기면 이전 자산의 포트가 골라진 채 남지 않게 한다.
  useEffect(() => {
    setSelectedPortId(null);
    setTracedPortId(null);
  }, [assetId]);
  // 밖에서 다른 포트를 가리키면 따라간다 — 표의 줄과 판의 선택이 어긋나면 안 된다.
  useEffect(() => {
    if (focusPortId) setSelectedPortId(focusPortId);
  }, [focusPortId]);
  const saved = useV2WorkingCopy((s) => s.saved);
  const overlays = useV2WorkingCopy((s) => s.overlays);

  const effectiveAssets = useMemo(() => mergeEffective(saved.assets, overlays.assets), [saved, overlays]);
  const effectiveCables = useMemo(() => mergeEffective(saved.cables, overlays.cables), [saved, overlays]);

  const catalog = useV2Catalog();
  const mediumColor = useMediumColor();
  const mediumLabel = useMediumLabel();
  const categories = catalog.data?.categories ?? [];
  const types = catalog.data?.types ?? [];

  const asset = useMemo(() => effectiveAssets.find((a) => a.id === assetId), [effectiveAssets, assetId]);

  /**
   * 이 판에 뜨는 **모든** 포트 — 이 자산과 자손의 것.
   *
   * 설비는 제 포트가 없다(포트는 안에 든 부품의 것이다). 그런데 고른 포트·내부 통과·이름을
   * `asset.ports` 에서만 찾고 있어서, 설비 패널에서 포트를 골라도 **상세 카드가 아예 뜨지
   * 않았다** — 추적·개폐·매체가 통째로 사라진 채 아래 연결 목록의 한 줄만 물들었다.
   */
  const allPorts = useMemo(
    () => (asset ? withDescendants(effectiveAssets, asset.id).flatMap((a) => a.ports) : []),
    [asset, effectiveAssets],
  );

  /**
   * 이 포트에 여닫을 값이 있는가 — 차단기의 개폐 같은 것.
   *
   * 화면이 `closed` 라는 키를 알지 않는다. 종류 선언에서 `boolean` 인 포트 값을 찾고,
   * 적힌 값이 없을 때의 뜻도 선언(`defaultValue`)이 정한다.
   */
  function switchField(port: V2Port) {
    return portFieldsFor(port.medium).find((f) => f.type === 'boolean') ?? null;
  }

  /** 이 회로가 끊겨 있는가 — 판은 이것만 보여 준다(여닫는 일은 포트 상세가 맡는다). */
  function isPortOpen(port: V2Port): boolean {
    const field = switchField(port);
    return field ? portValuesAt(port, 1)[field.key] !== true : false;
  }

  function setPortSwitch(owner: V2Asset, port: V2Port, field: ValueDef, next: boolean) {
    const ports = owner.ports.map((p) =>
      p.id === port.id ? { ...p, fieldValues: setPortValueAt(p, 1, field.key, next) } : p,
    );
    useV2WorkingCopy.getState().stageAssetUpdate(owner.id, { ports });
  }

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
          .map((ref) => ({ ...ref, label: portGroupLabel(ref, refs, mediumLabel), ports: byGroup.get(ref.group)! }));

        return { owner: a, groups };
      });
  }, [asset, effectiveAssets]);

  /* 포트 점유 상태 — 케이블이 물렸는가, 아닌가. 그 사이는 없다.
     회선의 반대쪽이 비었다는 사실은 아래 `내부 통과` 가 말한다. */
  const portState = (port: V2Port): PortState => (cablesByPortId.has(port.id) ? 'full' : 'empty');

  const selectedPort = useMemo(
    () => allPorts.find((p) => p.id === selectedPortId) ?? null,
    [allPorts, selectedPortId],
  );

  /* 고른 포트에 여닫을 값이 있으면 그 상태 — 편집은 여기서, 판은 보여 주기만.
     포트를 가진 자산을 함께 들고 있어야 스테이지 대상이 정해진다(랙을 고르면 자식의
     포트가 판에 뜨므로 `asset` 이 곧 주인이 아니다). */
  const selectedSwitch = useMemo(() => {
    if (!selectedPort) return null;
    const field = switchField(selectedPort);
    if (!field) return null;
    const owner = portOwners.find((o) => o.owner.id === selectedPort.assetId)?.owner;
    if (!owner) return null;
    return { field, owner, closed: portValuesAt(selectedPort, 1)[field.key] === true };
  }, [selectedPort, portOwners]);
  /* 고른 포트에 물린 대국 — 부스바는 여럿이다. 하나만 보여 주면 나머지가 없는 것처럼 읽힌다. */
  const selectedPeers = useMemo(() => {
    if (!selectedPort || !asset) return [];
    return (cablesByPortId.get(selectedPort.id) ?? []).flatMap((conn) => {
      const peer = resolvePeer(selectedPort, conn.cable, portIndex, asset.substationId);
      if (!peer) return [];
      const sub = peer.remote && peer.substationName ? ` (${peer.substationName})` : '';
      const lengthM = (conn.cable.specParams as Record<string, unknown> | null)?.lengthM;
      return [{
        cableId: conn.cableId,
        label: `${endpointLabel(peer)}${sub}`,
        categoryId: conn.cable.categoryId,
        lengthM: typeof lengthM === 'number' ? `${lengthM}m` : null,
        entry: portIndex.get(conn.peerPortId),
      }];
    });
  }, [selectedPort, cablesByPortId, portIndex, asset]);

  /**
   * 이 포트에 물릴 수 있는 케이블 종류 — **그 포트의 매체 것만**.
   *
   * 매체 키는 곧 케이블 그룹의 키다(포트 종류 하나당 그룹 하나). 광 어댑터에 전력케이블을
   * 고를 수 있게 두면 저장할 때 서버가 튕기고, 그때는 왜 튕겼는지 화면에 남지 않는다.
   */
  const cableChoices = useMemo(
    () => catalog.data?.cableGroups.find((g) => g.key === selectedPort?.medium)?.categories ?? [],
    [catalog.data, selectedPort],
  );

  // hop → 표시용 텍스트 (portIndex 단일 조회 — portById/assetByPortId 수제 맵 제거)
  function hopText(hop: import('../../traceSelectors').TraceResult['hops'][number]): string {
    if (hop.kind === 'internal') {
      return '↔ 내부';
    }
    // cable hop: portIndex에서 toPort의 asset명 + port명 조회
    const entry = portIndex.get(hop.toPortId);
    if (entry) {
      return endpointLabel({
        assemblyName: entry.assemblyName,
        assetName: entry.asset.name,
        portName: entry.port.name,
        portIndex: entry.port.index,
      });
    }
    // 로컬 미해소 포트 — 해당 케이블 saved refs로 표기 (끝점 자신의 ref — endpointRef 한 곳 규칙)
    // 추적 경로의 한 홉은 케이블 하나를 따라간 것이므로 첫 가닥으로 이름을 짓는다.
    const cableEntry = cablesByPortId.get(hop.toPortId)?.[0];
    if (cableEntry) {
      const ref = endpointRef(cableEntry.cable, hop.toPortId);
      if (ref) {
        // 변전소는 **다른 국일 때만** 적는다 — 지금 보고 있는 국 이름을 덧붙이면 군더더기다.
        const remote = asset != null && ref.substationId !== asset.substationId;
        const sub = remote && ref.substationName ? ` (${ref.substationName})` : '';
        return `${endpointLabel({ ...ref, assemblyName: ref.assemblyName ?? null })}${sub}`;
      }
    }
    return `포트 —`;
  }

  function handleTrace(portId: string) {
    const inputs = buildTraceInputs({ types, categories, assets: effectiveAssets, cables: effectiveCables });
    onTrace(traceHighlight(inputs, portId));
    setTracedPortId(portId);
  }

  function clearTrace() {
    setTracedPortId(null);
    onClearTrace();
  }

  if (!asset) return null;

  // 자기 포트가 없어도 안에 든 장비가 가질 수 있다 — 랙·함체가 그렇다.
  if (portOwners.length === 0) {
    return (
      <EmptyState
        title="이 자산에는 포트가 없습니다"
        description="포트는 자산 종류가 선언합니다 — 설비관리대장의 「자산 종류」 에서 포트를 추가하세요."
        className="py-6"
      />
    );
  }

  return (
    <div className="space-y-3">
      {/* 부품 한 대에 카드 한 장 — 판·고른 포트·연결 내역이 **한 곳에** 모인다.
          예전에는 판만 여기 있고 「연결」과 「고른 포트 상세」는 맨 아래 따로 있었다. 부품이
          열둘이면 판 열두 장을 지나야 그것들이 나오므로, 포트를 눌러 놓고도 무엇이 어떻게
          바뀌었는지 보이지 않았다. */}
      {portOwners.map(({ owner, groups }) => {
        const ownerPorts = groups.flatMap((g) => g.ports);
        const connected = ownerPorts.filter((pt) => cablesByPortId.has(pt.id)).length;
        // 고른 포트가 이 부품 것일 때만 상세를 편다.
        const sel = selectedPort && selectedPort.assetId === owner.id ? selectedPort : null;
        return (
          <DetailCard key={owner.id}>
            <DetailCardHeader
              title={owner.name}
              badge={`${connected}/${ownerPorts.length} 연결`}
              badgeStatus={connected > 0 ? 'success' : 'neutral'}
            />
            {/* 장비 하나에 전면판 한 장 — 구획은 그 판 위에서 나뉜다. */}
            <PortFaceplate
              labelPrefix={owner.name}
              sections={groups.map(({ group, label, medium, ports }) => ({
                key: group, label, accent: mediumColor(medium), ports,
              }))}
              stateOf={portState}
              cableCountOf={(port) => cablesByPortId.get(port.id)?.length ?? 0}
              isOpen={isPortOpen}
              selectedPortId={selectedPortId}
              onSelect={(id) => setSelectedPortId((prev) => (prev === id ? null : id))}
            />

            {/* 고른 포트 하나 — **어디랑 · 뭘로 · 추적** 셋만.
                포트를 누르는 사람이 알고 싶은 것은 그 셋이다. 예전에는 매체·방향·상태 배지·
                내부 통과까지 얹혀 있었는데, 매체와 방향은 판의 구획이 이미 말하고 상태는
                대국이 적혀 있으면 자명하며 내부 통과는 추적이 끝까지 보여 준다. */}
            {sel && (
              <div className="space-y-1.5 rounded border border-line bg-surface-2 p-2">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-content">
                    {endpointLabel({ assemblyName: null, assetName: owner.name, portName: sel.name, portIndex: sel.index })}
                  </span>
                  <Button variant="secondary" size="sm" onClick={() => handleTrace(sel.id)}>
                    추적
                  </Button>
                </div>
                {selectedPeers.length === 0 ? (
                  <span className="text-sm text-content-faint">연결 없음</span>
                ) : (
                  /* 부스바는 여럿이 물린다 — 하나만 적으면 나머지가 없는 것처럼 읽힌다.
                     **어디로 가나**와 **뭘로 가나**는 줄을 나눈다. 한 줄에 나란히 두면
                     384px 패널에서 둘이 폭을 다투다 대국 이름부터 잘렸다. */
                  selectedPeers.map((peer) => (
                    <div key={peer.cableId} className="space-y-1">
                      <button
                        type="button"
                        className={cn('block w-full truncate rounded px-1 text-left text-sm text-primary', SELECTABLE)}
                        title={peer.entry ? `${peer.label} 으로 이동` : peer.label}
                        disabled={!peer.entry}
                        onClick={() => peer.entry && onSelectAsset(peer.entry.asset.id)}
                      >
                        {peer.label}
                      </button>
                      <div className="flex items-center gap-2">
                        {/* 케이블 종류는 **여기서 고친다** — 예전에는 그리기 전에 고른 종류가
                            끝이라, 잘못 고르면 지우고 다시 그리는 수밖에 없었다(경로점까지
                            함께 사라진다). 고를 수 있는 것은 이 포트의 매체 것뿐이다. */}
                        <Select
                          aria-label="케이블 종류"
                          size="sm"
                          value={peer.categoryId ?? ''}
                          onChange={(e) =>
                            useV2WorkingCopy
                              .getState()
                              .stageCableUpdate(peer.cableId, { categoryId: e.currentTarget.value || null })
                          }
                        >
                          <option value="">종류 없음</option>
                          {cableChoices.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </Select>
                        {peer.lengthM && (
                          <span className="shrink-0 text-xs tabular-nums text-content-muted">{peer.lengthM}</span>
                        )}
                      </div>
                    </div>
                  ))
                )}
                {/* 여닫는 일은 여기서 — 판은 상태만 보여 준다. 이 값을 쓰는 문은 여기뿐이라
                    (계통 표는 **출력** 포트만 다룬다) 빼면 입력측 차단기를 적을 곳이 없어진다. */}
                {selectedSwitch && (
                  <DetailRow label={selectedSwitch.field.label}>
                    <Toggle
                      checked={selectedSwitch.closed}
                      onChange={(next) => setPortSwitch(selectedSwitch.owner, sel, selectedSwitch.field, next)}
                      label={selectedSwitch.closed ? '투입' : '개방'}
                      aria-label={`${sel.name} ${selectedSwitch.field.label}`}
                    />
                  </DetailRow>
                )}

                {/* 추적 결과 — **누른 자리 바로 아래**에 편다.
                    맨 위 카드에 띄우면 부품이 열둘일 때 결과가 화면 밖으로 나가, 누르고도
                    아무 일이 없는 것처럼 보였다. 경로는 이 포트에서 출발한 것이므로
                    이 포트 밑이 그 경로의 자리다. */}
                {tracedPortId === sel.id && traceResult && (
                  <div className="border-t border-line pt-1.5">
                    <div className="mb-0.5 flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-content-muted">
                        {traceResult.hops.length > 0 ? '추적 경로' : '연결된 경로가 없습니다'}
                      </span>
                      <Button variant="secondary" size="sm" onClick={clearTrace}>
                        지우기
                      </Button>
                    </div>
                    <ol className="space-y-0.5">
                      {traceResult.hops.map((hop, i) => {
                        // 경로에 나온 자산은 눌러서 그리로 갈 수 있어야 한다 — 예전에는 글자일
                        // 뿐이라 그 장비를 찾으려면 표에서 다시 검색해야 했다.
                        const target = hop.kind === 'internal' ? undefined : portIndex.get(hop.toPortId)?.asset;
                        return (
                          <li key={i} className="flex items-baseline gap-1 text-sm text-content">
                            <span className="shrink-0 text-xs tabular-nums text-content-faint">{i + 1}.</span>
                            {target ? (
                              <button
                                type="button"
                                className={cn('min-w-0 flex-1 truncate rounded px-1 text-left text-primary', SELECTABLE)}
                                title={`${target.name} 으로 이동`}
                                onClick={() => onSelectAsset(target.id)}
                              >
                                {hopText(hop)}
                              </button>
                            ) : (
                              <span className="min-w-0 flex-1 truncate px-1 text-content-muted">{hopText(hop)}</span>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                )}
              </div>
            )}

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
