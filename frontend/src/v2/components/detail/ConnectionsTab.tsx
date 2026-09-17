/**
 * ConnectionsTab — 상세 패널의 '포트' 탭.
 *
 * **장비 한 대에 카드 한 장**, 그 안에서 위에서 아래로: 포트 판 → 고른 포트 → 그 포트의
 * 추적 경로. 설비에는 제 포트가 없고 안에 든 장비가 갖는다.
 *
 * 무엇을 누르든 **답은 누른 자리 바로 아래**에 나온다. 예전에는 고른 포트의 상세도, 추적
 * 결과도, 장비별 연결 목록도 다른 자리에 있었다 — 장비가 열둘이면 판 열두 장을 지나야
 * 그것들이 나오므로, 누르고도 아무 일이 없는 것처럼 보였다.
 *
 * 장비마다 딸려 있던 **연결 목록은 걷었다**. 스물다섯 줄이 판 밑에 늘어서도 읽는 사람이
 * 알고 싶은 것은 「내가 누른 이 포트가 어디로 가나」였고, 그건 고른 포트 카드가 말한다.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Accordion, DetailCardHeader, Button, DetailCard, EmptyState, Input,
  useConfirm, useDismissOnOutside,
  type BadgeStatus,
} from '../../../components/ui';
import { useEffectiveAssets, useEffectiveCables } from '../../store/useWorkingCopy';
import { buildPortIndex } from '../../peerResolve';
import { traceLabeller } from '../../traceLabels';
import { withDescendants } from '../../assetTree';
import { deleteCableWithConfirm } from '../../deleteActions';
import { canPickPort } from '../../cableSelectors';
import { portFieldsFor, portHasRoom, portValuesAt } from '@twin/core';
import { buildTraceInputs, traceHighlight } from '../../traceSelectors';
import { useV2Catalog, useMediumColor, useMediumLabel } from '../../hooks';
import type { TraceResult } from '../../traceSelectors';
import { TopologyModal } from '../topology/TopologyModal';
import type { V2Asset, V2Cable, V2Port } from '../../types';
import { PortFaceplate, type PortState } from './PortFaceplate';
import { SelectedPortCard } from './SelectedPortCard';
import type { CablePickRequest } from '../../cablePick';
import { comparePortGroups, groupRefOf, portGroupLabel } from '@twin/core';

/**
 * 장비별 판을 늘어놓는 자리 — 머리줄을 다느냐만 다르다.
 *
 * 다는 쪽은 `Accordion`(한 번에 하나만 펼친다), 안 다는 쪽은 판을 그대로 앉힌다. 이 갈림을
 * 여기 한 번만 적어, 부르는 쪽은 「머리줄을 달까」만 말하면 되게 한다.
 */
function PortOwnerSections({
  headings, openKey, onOpenChange, sections,
}: {
  headings: boolean;
  openKey: string | null;
  onOpenChange: (key: string | null) => void;
  sections: { key: string; title: string; badge: string; badgeStatus: BadgeStatus; body: React.ReactNode }[];
}) {
  if (!headings) {
    return <>{sections.map((s) => <div key={s.key} className="space-y-3">{s.body}</div>)}</>;
  }
  return <Accordion openKey={openKey} onOpenChange={onOpenChange} sections={sections} />;
}

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
  /** 대국·추적 경로에서 다른 자산으로 이동한다 — 설비 관리의 단일 이동 지점. */
  /** 자산(또는 그 안의 장비)을 고른다 — 포트까지 함께 가리킬 수 있다. */
  onSelectAsset: (id: string, portId?: string | null) => void;
  onTrace: (result: TraceResult) => void;
  onClearTrace: () => void;
  traceResult?: TraceResult | null;
  /**
   * 빈 포트에서 케이블을 잇기 시작한다 — 평면도의 케이블 도구를 이 포트로 무장시킨다.
   *
   * 여기서 시작할 수 있어야 하는 이유: 이 탭이 「어느 포트가 비었나」를 보여 주는 유일한
   * 판이다. 그걸 보고도 이으려면 평면도로 건너가 도구를 켜고 이 자산을 다시 찾아 이 포트를
   * 다시 골라야 했다 — 같은 선택을 세 번 하는 셈이다.
   */
  onConnectPort?: (portId: string) => void;
  /**
   * 「포트를 골라 달라」 — 평면도의 케이블 도구가 보낸 요청.
   *
   * 이 모드에서는 포트를 눌러도 상세가 열리지 않고 **끝점으로 골라진다**. 판은 그대로다 —
   * 조회하던 판과 고르는 판이 같아야 「빈 자리가 어디였지」를 다시 배우지 않는다.
   */
  cablePick?: CablePickRequest | null;
  /**
   * 장비 이름 머리줄을 달까 — 기본은 단다.
   *
   * 설비의 포트 탭에서는 장비가 열둘이라 **머리줄이 곧 목록**이다(접힌 채로도 `n/m 연결` 이
   * 보인다). 그런데 장비 상자 안에서는 이 판이 이미 그 장비의 것이라, 머리줄이 상자 제목과
   * 같은 이름을 두 번 말한다 — 그때는 접을 것도 없으므로 판만 앉힌다.
   */
  ownerHeadings?: boolean;
}

export function ConnectionsTab({
  assetId, focusPortId, onSelectAsset, onTrace, onClearTrace, traceResult, onConnectPort, cablePick,
  ownerHeadings = true,
}: ConnectionsTabProps) {
  /**
   * 고른 포트 — **주소가 쥔다**(`?port=`). 여기서 따로 들고 있지 않는다.
   *
   * 예전에는 이 판만 아는 지역 상태였다. 그래서 표에서 줄을 누르면 판이 따라왔지만(주소를
   * 거쳐서), 판에서 포트를 누르면 표는 아무것도 몰랐다 — 같은 것을 가리키는 두 화면이 서로
   * 다른 것을 고른 채 나란히 서 있었다. 선택이 사는 자리는 하나여야 한다.
   */
  const selectedPortId = focusPortId ?? null;
  /** 포트를 고른다 — 주인 자산과 함께 알린다(주소는 설비·장비·포트를 함께 쥔다). */
  const selectPort = (portId: string | null, ownerId: string = assetId) => onSelectAsset(ownerId, portId);
  const setSelectedPortId = (portId: string | null) => selectPort(portId);
  /* 어느 포트에서 추적을 걸었나 — 결과를 **그 포트 밑**에 펴기 위해.
     `TraceResult` 는 출발 포트를 담지 않는다(평면도 강조가 쓰는 형상이라 그럴 이유도 없다). */
  const [tracedPortId, setTracedPortId] = useState<string | null>(null);
  /* 토폴로지는 **추적을 한 뒤에만** 열 수 있다 — 그릴 시드가 있어야 한다. */
  const [topologyOpen, setTopologyOpen] = useState(false);
  /* 펼친 장비 — 아래 `openPartId` 가 이 값을 「첫 장비」·「접힘」으로 풀어 읽는다. */
  const [openPart, setOpenPart] = useState<string | null | undefined>(undefined);
  const rootRef = useRef<HTMLDivElement | null>(null);
  /* 추적 결과 상자 — 뜨면 눈에 들어오게 끌어온다(아래 `useEffect`). */
  const traceRef = useRef<HTMLDivElement | null>(null);
  const { confirm, confirmDialog } = useConfirm();
  /* 고르는 중인가 — 요청이 **이 자산**을 가리킬 때만. 다른 자산을 보고 있는 동안에는
     판이 평소대로 조회로 남아야 한다(엉뚱한 포트를 끝점으로 집지 않게). */
  const picking = cablePick && cablePick.assetId === assetId ? cablePick : null;
  const [pickQuery, setPickQuery] = useState('');
  useEffect(() => setPickQuery(''), [picking?.assetId]);
  /* 자산을 옮기면 추적과 펼친 장비는 처음으로 — 고른 포트는 주소가 이미 함께 옮긴다. */
  useEffect(() => {
    setTracedPortId(null);
    setOpenPart(undefined);
  }, [assetId]);
  const effectiveAssets = useEffectiveAssets();
  const effectiveCables = useEffectiveCables();

  const catalog = useV2Catalog();
  const mediumColor = useMediumColor();
  const mediumLabel = useMediumLabel();
  const categories = catalog.data?.categories ?? [];
  const types = catalog.data?.types ?? [];

  const asset = useMemo(() => effectiveAssets.find((a) => a.id === assetId), [effectiveAssets, assetId]);

  /**
   * 이 판에 뜨는 **모든** 포트 — 이 자산과 자손의 것.
   *
   * 설비는 제 포트가 없다(포트는 안에 든 장비의 것이다). 그런데 고른 포트·내부 통과·이름을
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
    /* 고르는 중에는 **이을 수 있는 것만** 남긴다 — 같은 매체, 첫 끝점 제외, 검색어.
       평소에는 그 장비의 판을 있는 그대로 보여 준다(빈 자리를 세는 판이므로). */
    const visible = (p: V2Port, ownerName: string) => {
      if (!picking) return true;
      if (picking.medium != null && p.medium !== picking.medium) return false;
      if (p.id === picking.firstEndpoint?.portId) return false;
      const q = pickQuery.trim().toLowerCase();
      return q === '' || p.name.toLowerCase().includes(q) || ownerName.toLowerCase().includes(q);
    };
    return withDescendants(effectiveAssets, asset.id)
      .filter((a) => a.ports.length > 0)
      .map((a) => {
        const byGroup = new Map<string, V2Port[]>();
        for (const p of a.ports) {
          if (!visible(p, a.name)) continue;
          const list = byGroup.get(p.group) ?? [];
          list.push(p);
          byGroup.set(p.group, list);
        }
        for (const [, list] of byGroup) list.sort((x, y) => x.index - y.index);

        const refs = [...byGroup.entries()].filter(([, ports]) => ports.length > 0).map(([, ports]) => groupRefOf(ports[0]!));
        // 차례는 어휘가 정한다(`comparePortGroups`) — 미리보기와 같은 함수를 써야 안 갈린다.
        const groups = refs
          .slice()
          .sort(comparePortGroups)
          .map((ref) => ({ ...ref, label: portGroupLabel(ref, refs, mediumLabel), ports: byGroup.get(ref.group)! }));

        return { owner: a, groups };
      })
      .filter((o) => o.groups.length > 0);
  }, [asset, effectiveAssets, mediumLabel, picking, pickQuery]);

  /* 포트 점유 상태 — 케이블이 물렸는가, 아닌가. 그 사이는 없다.
     회선의 반대쪽이 비었다는 사실은 아래 `내부 통과` 가 말한다. */
  const portState = (port: V2Port): PortState => (cablesByPortId.has(port.id) ? 'full' : 'empty');

  const selectedPort = useMemo(
    () => allPorts.find((p) => p.id === selectedPortId) ?? null,
    [allPorts, selectedPortId],
  );
  /** 추적을 건 자리의 설비 — 그 이름은 마디마다 되풀이하지 않는다(`traceLabeller`). */
  const tracedAssembly = tracedPortId ? portIndex.get(tracedPortId)?.assemblyName ?? null : null;

  /** 마디를 부르는 규칙은 화면 밖에 있다(`traceLabels.ts`) — 거기라야 시험할 수 있다. */
  const traceLabel = useMemo(
    () => traceLabeller({ portIndex, cablesByPortId, tracedAssembly, localSubstationId: asset?.substationId ?? null }),
    [portIndex, cablesByPortId, tracedAssembly, asset],
  );

  function handleTrace(portId: string) {
    const inputs = buildTraceInputs({ types, categories, assets: effectiveAssets, cables: effectiveCables });
    onTrace(traceHighlight(inputs, portId));
    setTracedPortId(portId);
  }

  /** 가닥 하나를 지운다 — 묻는 말도 지우는 일도 도면과 **같은 문**이다. */
  async function handleDeleteCable(peer: { cableId: string; label: string }) {
    await deleteCableWithConfirm({ cableId: peer.cableId, target: `${peer.label} 으로 가는 케이블`, confirm });
  }

  function clearTrace() {
    setTracedPortId(null);
    onClearTrace();
  }

  /**
   * 장비를 펼친다 — 같은 것을 다시 누르면 접힌다(앱 공통 규칙).
   *
   * 펼친 장비가 바뀌면 **고른 포트를 놓는다.** 접힌 카드 안에 선택이 남아 있으면
   * 「지금 무엇을 골랐나」가 화면에서 사라지고, 추적 결과도 안 보이는 자리에 매달린다.
   */
  function handleOpenPart(next: string | null) {
    setOpenPart(next);
    if (selectedPort && selectedPort.assetId !== next) {
      setSelectedPortId(null);
      setTracedPortId(null);
      onClearTrace();
    }
  }

  /* 아래 세 훅은 **이른 반환보다 위**에 있어야 한다.
     한때 `if (!asset) return null` 뒤에 있었다 — 워킹 카피가 늦게 도착해 포트가 0개였다가
     채워지면 렌더마다 훅 수가 달라져 React 가 통째로 터진다("Rendered more hooks than
     during the previous render"). 훅은 조건 위에 세운다. */
  const pickDisabledPortIds = useMemo(() => {
    if (!picking) return undefined;
    const blocked = new Set<string>();
    for (const { groups } of portOwners) {
      for (const { ports } of groups) {
        for (const p of ports) {
          const ok = canPickPort(p, {
            cableCount: cablesByPortId.get(p.id)?.length ?? 0,
            medium: picking.medium,
            excludePortId: picking.firstEndpoint?.portId,
          });
          if (!ok) blocked.add(p.id);
        }
      }
    }
    return blocked;
  }, [picking, portOwners, cablesByPortId]);

  useDismissOnOutside(!picking && selectedPortId != null, [rootRef], () => setSelectedPortId(null));

  /**
   * 펼친 장비 — **한 번에 하나**(`Accordion`).
   *
   * `undefined` = 아직 아무도 고르지 않았다(첫 장비가 펼쳐진다), `null` = 사람이 접었다.
   * 둘을 구분하지 않으면 「접었다」가 다음 렌더에서 「첫 장비 펼치기」로 되돌아온다.
   */
  const openPartId = useMemo(() => {
    if (openPart === null) return null;
    if (openPart != null && portOwners.some((o) => o.owner.id === openPart)) return openPart;
    /* 처음이거나, 펼쳐 둔 장비가 목록에서 사라졌다(고르는 중에는 매체로 걸러진다). */
    return portOwners[0]?.owner.id ?? null;
  }, [openPart, portOwners]);

  /* 밖에서 포트를 지목해 오면(선번장의 한 줄, 장비 카드의 「포트 보기」) **그 포트가 든 장비를
     펼친다**. 안 그러면 고른 포트가 접힌 카드 안에 숨어, 표에서 줄을 눌렀는데 패널에는
     아무 일도 안 일어난 것처럼 보인다. */
  useEffect(() => {
    if (selectedPort && selectedPort.assetId !== openPartId) setOpenPart(selectedPort.assetId);
  }, [selectedPort, openPartId]);

  /**
   * 추적 결과가 뜨면 **보이는 자리로 끌어온다.**
   *
   * 결과는 누른 포트 바로 아래에 서지만, 그 아래가 화면 밖일 수 있다 — 장비 상자는 키가
   * 85vh 로 묶여 있고 포트 탭도 판이 길면 마찬가지다. 누르고도 아무 일이 없는 것처럼 보이는
   * 일이 이 화면에서 되풀이됐으므로, 답이 났으면 답을 보여 준다.
   */
  useEffect(() => {
    if (tracedPortId && traceResult) traceRef.current?.scrollIntoView({ block: 'nearest' });
  }, [tracedPortId, traceResult]);

  if (!asset) return null;

  // 자기 포트가 없어도 안에 든 장비가 가질 수 있다 — 랙·함체가 그렇다.
  if (portOwners.length === 0) {
    /* 고르는 중이라면 「포트가 없다」가 아니라 **이을 수 있는 포트가 없다**는 뜻이다 —
       매체가 다르거나 검색에 안 걸린 것뿐인데 종류 대장으로 보내면 헛걸음을 시킨다. */
    if (picking) {
      return (
        <div className="space-y-3">
          <EmptyState
            title={pickQuery.trim() ? '검색 결과가 없습니다' : '이을 수 있는 포트가 없습니다'}
            description={pickQuery.trim() ? undefined : '이 설비에 같은 매체의 포트가 없습니다.'}
            className="py-6"
          />
          {/* 「다른 층·변전소에서 찾기」는 **없다.** 다른 층은 하단 층 탭으로, 다른 국은
              조직 트리로 평소처럼 옮겨 가서 도면에서 고른다 — 고르는 방법이 하나다. */}
          <div className="flex justify-center gap-2">
            <Button variant="secondary" size="sm" onClick={picking.onCancel}>
              취소
            </Button>
          </div>
        </div>
      );
    }
    return (
      <EmptyState
        title="이 설비에는 포트가 없습니다"
        description="상단의 「장비 품목」 에서 이 품목에 포트를 더하세요."
        className="py-6"
      />
    );
  }

  const freeCount = portOwners
    .flatMap((o) => o.groups.flatMap((g) => g.ports))
    .filter((p) => portHasRoom(p.medium, cablesByPortId.get(p.id)?.length ?? 0)).length;

  return (
    /* 바깥을 누르면 고른 포트가 풀린다 — 앱 공통 규칙. 이 탭 전체가 「안」이다: 판도,
       고른 포트의 카드도, 추적 경로도 모두 그 선택을 다루는 자리다.
       **고르는 중(케이블 연결)에는 붙이지 않는다** — 그때 선택은 이 탭의 것이 아니라
       평면도의 손짓이고, 도면을 누르는 것이 곧 그 다음 단계다. */
    <div ref={rootRef} className="space-y-3">
      {/* 고르는 중임을 판 위에 적는다 — 하단 안내만으로는 「이 판에서 고르라」는 뜻이
          전해지지 않는다. 검색은 여기 있어야 한다: 광슬롯 넷을 담은 OFD 는 포트가 100개다. */}
      {picking && (
        <DetailCard>
          <DetailCardHeader
            title={picking.firstEndpoint ? `${picking.firstEndpoint.label} 에 이을 포트` : '시작할 포트'}
            badge={`빈 포트 ${freeCount}`}
            badgeStatus={freeCount > 0 ? 'success' : 'neutral'}
            actions={
              <Button variant="secondary" size="sm" onClick={picking.onCancel}>
                취소
              </Button>
            }
          />
          {picking.error && (
            <p className="rounded bg-danger-bg px-2 py-1 text-xs text-danger">{picking.error}</p>
          )}
          <Input
            size="sm"
            autoFocus
            aria-label="포트 검색"
            placeholder="장비 · 포트 이름 검색"
            value={pickQuery}
            onChange={(e) => setPickQuery(e.currentTarget.value)}
          />
        </DetailCard>
      )}
      {/* 장비 한 대에 카드 한 장 — 판·고른 포트·연결 내역이 **한 곳에** 모인다.
          예전에는 판만 여기 있고 「연결」과 「고른 포트 상세」는 맨 아래 따로 있었다. 장비가
          열둘이면 판 열두 장을 지나야 그것들이 나오므로, 포트를 눌러 놓고도 무엇이 어떻게
          바뀌었는지 보이지 않았다.

          그런데 **장수는 장비 수만큼 늘어난다** — 판암 송광치는 열둘이라 2,945px(화면 5.5장)이
          됐고, 상세를 판 밑으로 옮겨 놔도 그 판까지 가는 길이 여전히 스크롤뿐이었다. 그래서
          한 번에 하나만 펼친다(`Accordion`) — 접힌 머리줄이 곧 장비 목록이고, 이름 옆의
          `n/m 연결` 이 펴 보지 않고도 어느 판을 열지 알려 준다. */}
      <PortOwnerSections
        headings={ownerHeadings}
        openKey={openPartId}
        onOpenChange={handleOpenPart}
        sections={portOwners.map(({ owner, groups }) => {
          const ownerPorts = groups.flatMap((g) => g.ports);
          const connected = ownerPorts.filter((pt) => cablesByPortId.has(pt.id)).length;
          // 고른 포트가 이 장비 것일 때만 상세를 편다.
          // 고르는 중에는 상세를 열지 않는다 — 지금 하는 일은 「고르기」 하나뿐이다.
          const sel = !picking && selectedPort && selectedPort.assetId === owner.id ? selectedPort : null;
          return {
            key: owner.id,
            title: owner.name,
            badge: `${connected}/${ownerPorts.length} 연결`,
            badgeStatus: (connected > 0 ? 'success' : 'neutral') as BadgeStatus,
            body: (
              <>
                {/* 장비 하나에 전면판 한 장 — 구획은 그 판 위에서 나뉜다. */}
                <PortFaceplate
                  labelPrefix={owner.name}
                  sections={groups.map(({ group, label, medium, ports }) => ({
                    key: group, label, accent: mediumColor(medium), ports,
                  }))}
                  stateOf={portState}
                  /* 고르는 중에는 **꽉 찬 포트를 못 누르게** 한다. 눌러 보고 나서 「이미 물려
                     있습니다」로 되돌리면, 어느 자리가 남았는지를 눌러 가며 알아내야 한다.
                     판이 이미 상태를 색으로 말하고 있으니 누를 수 없다는 것도 판이 말한다.
                     규칙은 `portHasRoom` 한 곳 — 접지 부스바는 여러 가닥이 물린다. */
                  disabledPortIds={pickDisabledPortIds}
                  cableCountOf={(port) => cablesByPortId.get(port.id)?.length ?? 0}
                  isOpen={isPortOpen}
                  selectedPortId={selectedPortId}
                  /* 고르는 중에는 **끝점으로 잡힌다** — 상세를 여는 대신. 판은 같고 뜻만 다르다. */
                  onSelect={(id) => {
                    if (picking) {
                      const port = allPorts.find((p) => p.id === id);
                      if (port) picking.onSelect(port);
                      return;
                    }
                    /* 다시 누르면 놓는다 — 주인 장비까지 함께 알린다(주소가 설비·장비·포트를 쥔다). */
                    const port = allPorts.find((p) => p.id === id);
                    selectPort(selectedPortId === id ? null : id, port?.assetId ?? assetId);
                  }}
                />

                {/* 고른 포트 하나 — 카드가 제 계산을 들고 있다(`SelectedPortCard`). */}
                {sel && (
                  <SelectedPortCard
                    port={sel}
                    owner={owner}
                    localSubstationId={asset.substationId}
                    cablesByPortId={cablesByPortId}
                    portIndex={portIndex}
                    label={traceLabel}
                    onSelectAsset={onSelectAsset}
                    {...(onConnectPort ? { onConnectPort } : {})}
                    onTrace={handleTrace}
                    onDeleteCable={(peer) => void handleDeleteCable(peer)}
                    traceResult={tracedPortId === sel.id ? traceResult ?? null : null}
                    onTopology={() => setTopologyOpen(true)}
                    onClearTrace={clearTrace}
                    traceRef={traceRef}
                  />
                )}
              </>
            ),
          };
        })}
      />

      {/* 빈 포트를 눌러 잇는 길이 생겼으므로 「평면도에서만 만든다」는 안내는 거짓이 됐다.
          대신 어디서 시작하는지를 알린다 — 판을 봐도 무엇을 눌러야 하는지는 안 보인다. */}
      {onConnectPort && !picking && (
        <p className="px-1 text-xs text-content-faint">
          빈 포트를 누르면 <strong className="font-medium">케이블 연결</strong> 로 이을 수 있습니다.
        </p>
      )}
      {confirmDialog}
      <TopologyModal
        open={topologyOpen}
        seedPortId={tracedPortId}
        seedLabel={tracedPortId ? traceLabel(tracedPortId).primary : undefined}
        onClose={() => setTopologyOpen(false)}
      />
    </div>
  );
}
