import { portFieldsFor, portValuesAt, type SeededMediumKey } from '@twin/core';
import { buildPortIndex, cableAt, indexCablesByPort, resolvePeer, type PeerInfo } from './peerResolve';
import type { V2Assembly, V2Asset, V2Cable } from './types';

export type { PeerInfo } from './peerResolve';

export const POWER_MEDIUM: SeededMediumKey = 'power';

// ──────────────────────────────────────────────
// 계통 나무 — 전원이 어디서 와서 어디로 가나
// ──────────────────────────────────────────────

/**
 * 회로 하나 = **출력 포트 하나**.
 *
 * 실무 대장(분전반 수용내역)의 한 줄이 이것이다: 번호 · 용량 · 용도 · 전원케이블 · 개폐.
 * 예전 표는 「피더 자산 하나 = 한 줄」이라 13구 분배반이 한 줄로 뭉갰다 — 회로마다 따로
 * 끊기는데(개폐는 포트의 값이다) 화면에는 그 열셋이 없었다.
 */
export interface PowerCircuit {
  portId: string;
  /** 이 회로가 교류인가 직류인가 — 전압 목록이 이걸 따라 좁아진다. */
  variant?: string | null;
  /** 회로 번호 — 포트 번호가 곧 회로 번호다(L1·L2…). */
  index: number;
  name: string;
  /**
   * 이 회로(포트)에 적힌 값들 — 용량 · 개폐. **선언된 기본값까지 얹은 것**이다.
   *
   * 무엇이 들었는지는 종류 선언이 정한다(`portFieldsFor`). 화면이 키를 알지 않는다.
   */
  portValues: Record<string, unknown>;
  cableId: string | null;
  /** 이 회로가 먹이는 것 — 용도. 도면 밖이면 케이블에 적힌 대국까지가 전부다. */
  load: PeerInfo | null;
  /** 케이블에 적힌 값(전압 등) — 무엇을 적는지는 종류 선언이 정한다. */
  values: Record<string, unknown>;
  /** 먹이는 것이 **또 다른 반**이면 그 자산 id — 나무의 가지가 여기서 갈린다. */
  feedsAssetId: string | null;
}

/**
 * 반(盤) 하나 — **전원을 나눠 주는 것**(출력 회로가 여럿인 자산).
 *
 * 소내전원반 · 분전반의 계통마다 선 피더 · 충전기 분전반이 다 이것이다. 이름으로 고르지
 * 않는다 — 나누면 반이고, 하나를 하나로 보내면 거쳐 가는 자리다(`isBoard`).
 */
export interface PowerNode {
  assetId: string;
  name: string;
  /** 이 반을 품은 설비 — 화면은 「분전반 · DC 48V」처럼 부른다. */
  containerId: string | null;
  containerName: string | null;
  /**
   * 어디서 받는가 — 입력 포트마다 하나씩.
   *
   * 둘 이상일 수 있다(이중화: 충전기 #1·#2 가 같은 DC 버스를 먹인다). 나무에서는 **처음
   * 닿은 갈래에만** 펴고, 나머지는 이 목록이 말한다 — 같은 반을 두 군데에 그리면 회로가
   * 두 번 세어진다.
   */
  sources: {
    portId: string;
    /** 이 입력이 교류인가 직류인가. */
    variant?: string | null;
    cableId: string | null;
    from: PeerInfo | null;
    fromAssetId: string | null;
    /** 입력 차단기의 값들 — 배전반 주차단기, UPS·정류기의 입력 MCCB. 출력과 다른 둘이다. */
    portValues: Record<string, unknown>;
    /** 그 인입 케이블에 적힌 값(길이·전압) — 회로 줄과 같은 칸을 쓴다. */
    values: Record<string, unknown>;
    /**
     * 반에 닿기까지 **거쳐 온 것들** — 정류기·인버터·강압기처럼 나누지 않고 지나가는 기기들.
     *
     * 이것이 없으면 직류 모선의 머리줄이 「IR-48 50A #1 에서 온다」에서 끊긴다 — 그 정류기가
     * 무엇을 먹고 사는지가 화면 어디에도 없다. 현장 조서는 그래서 두 줄을 함께 적는다:
     * 「#1 충전기 : SCR 48V 100A」 그리고 「그 충전기의 AC 입력 : 통합분전반 Load 1번」.
     */
    via: { assetId: string; name: string }[];
  }[];
  circuits: PowerCircuit[];
  children: PowerNode[];
}

/**
 * 그 포트에 적힌 값들 — 선언된 칸만.
 *
 * 안 적힌 것은 **안 적힌 채로** 둔다(`null`). 적힌 값이 없을 때 뜻이 있는 것은 개폐뿐이고
 * (안 적었으면 투입), 그건 선언이 말한다(`ValueDef.defaultValue`).
 *
 * @param bus 그 반의 모선(입력)에 적힌 값들 — **회로에 없는 것만** 여기서 물려받는다.
 *   어느 칸이 물려받는지는 선언이 정한다(`ValueDef.inherited`) — 전압·상선식은 한 모선이
 *   나르는 성질이라 대개 회로마다 같고, 용량은 회로마다 고유하다.
 */
function declaredPortValues(
  port: V2Asset['ports'][number],
  bus: Record<string, unknown> = {},
): Record<string, unknown> {
  const values = portValuesAt(port, 1);
  return Object.fromEntries(
    portFieldsFor(port.medium, port.positions, port.variant).map((f) => {
      const own = values[f.key] ?? null;
      if (own !== null || f.readOnly) return [f.key, own];
      if (f.inherited && bus[f.key] != null) return [f.key, bus[f.key]];
      return [f.key, f.defaultValue ?? null];
    }),
  );
}

/**
 * 이 변전소의 **전원 계통**을 나무로.
 *
 * 뿌리는 **입력이 이 도면 밖에서 오는 반**이다(소내분전반: 입력 포트에 케이블이 없거나,
 * 그 케이블의 상대가 이 도면의 반이 아니다). 가지는 출력 케이블을 따라간다.
 *
 * 「상용이냐 UPS 계열이냐 DC 냐」를 따로 적지 않는다 — **경로가 곧 갈래다**. 이름이나 종류로
 * 「이건 UPS 다」를 알아맞히려 들면 그 순간 사람이 붙인 글자에 계통이 매달린다.
 *
 * 어디에도 닿지 못한 반(배선이 고리를 이룬 자료 등)도 **버리지 않고** 뿌리로 세운다 —
 * 화면에서 조용히 사라지는 것이 가장 나쁘다.
 */
export function powerTree(
  assets: V2Asset[],
  cables: V2Cable[],
  /**
   * 설비 품목들 — **어느 배선이 함체 속살인지**는 여기에 못 박혀 있다(`AssemblyLink`).
   *
   * 안 주면 「속살 없음」으로 본다 — 모든 배선이 회로다.
   */
  assemblies: readonly V2Assembly[] = [],
): PowerNode[] {
  const byId = new Map(assets.map((a) => [a.id, a]));

  /**
   * 설비 품목이 **못 박아 둔 배선** — 항목 짝으로.
   *
   * 이것이 「함체 속살」과 「현장에서 이은 회로」를 가르는 선이다. 제조사가 정한 배선은 품목에
   * 선언돼 있고(충전기 9개 · UPS 3개), 현장에서 잇는 것은 선언이 없다(분전반·소내전원반 0개).
   * 그래서 **같은 함체 안이라는 것만으로는 부족하다** — 한 함체에 반이 여럿이고 서로 먹이는
   * 판이 실재한다(SCADA 분전반의 입력 절체부 → 계통 MAIN → 분기).
   */
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const declaredLinks = new Set(assemblies.flatMap((asm) => asm.links.map((l) => pairKey(l.aItemId, l.bItemId))));
  /**
   * 선언 배선에 **걸려 있는 구성 항목들** — 그 함체의 속살이다.
   *
   * 충전기의 분배부·정류기·강압기·감시제어부가 그것이다. 품목이 그 배선을 못 박아 두었다는
   * 것은 **제조사가 정한 한 덩어리**라는 뜻이고, 계통도는 그런 것을 한 상자로 그린다
   * (강원본부 전원계통도의 「충전기#1」·「UPS#1」이 각각 상자 하나다).
   *
   * 회로를 세어 가려낼 수는 없다. 충전기의 분배부는 교류 출력을 셋 선언하는데 정류기가 둘뿐이라
   * 하나가 늘 비어 있다 — 그 빈자리는 「아직 안 쓴 분전 회로」가 아니라 **세 번째 정류기 자리**다.
   * 세는 눈으로는 소내 피더의 안 이은 분기와 구별되지 않는다. 선언이 그것을 안다.
   */
  const boxedItems = new Set(assemblies.flatMap((asm) => asm.links.flatMap((l) => [l.aItemId, l.bItemId])));
  const { cablesByAPortId, cablesByBPortId } = indexCablesByPort(cables);
  const portIndex = buildPortIndex(assets);
  const cableOf = (portId: string) => cableAt(portId, cablesByAPortId, cablesByBPortId);
  const peerAssetIdOf = (portId: string, cable: V2Cable) => {
    const otherId = cable.aPortId === portId ? cable.bPortId : cable.aPortId;
    return portIndex.get(otherId)?.asset.id ?? null;
  };

  /**
   * 이 포트의 케이블이 **제 함체 안에서 끝나는가** — 그러면 분전이 아니라 속살이다.
   *
   * 충전기의 분배부는 출력이 여섯인데 **다섯이 제 함체 안**으로 간다(정류기 둘·강압기·
   * 감시제어부·축전지). 밖으로 나가는 것은 직류 출력 하나뿐이다. 그런데 「출력이 둘 이상이면
   * 반」으로 세면 그 함체 속 배선이 계통 표에 회로로 늘어선다 — 계통도는 충전기를 **한 상자**로
   * 그리지 그 안을 그리지 않는다(강원본부 전원계통도가 그렇다).
   *
   * 케이블이 아직 없으면 **밖으로 나갈 자리**로 본다 — 소내 피더의 안 이은 분기 열아홉이
   * 그것이다. 안 이었다고 함체 속 배선인 것이 아니다.
   *
   * 가르는 것은 **설비 품목의 선언**이다(`declaredLinks`) — 같은 함체라는 것만으로는 부족하다.
   */
  const endsInside = (owner: V2Asset, portId: string): boolean => {
    const cable = cableOf(portId);
    if (!cable) return false;
    const peerId = peerAssetIdOf(portId, cable);
    const peer = peerId != null ? byId.get(peerId) : undefined;
    if (peer == null || owner.parentAssetId == null || peer.parentAssetId !== owner.parentAssetId) return false;
    return owner.assemblyItemId != null && peer.assemblyItemId != null
      && declaredLinks.has(pairKey(owner.assemblyItemId, peer.assemblyItemId));
  };

  /** 그 자산에서 **함체 밖으로 나갈 수 있는** 회로들 — 속살 배선은 회로가 아니다. */
  const circuitPortsOf = (a: V2Asset) =>
    a.ports.filter((p) => p.medium === POWER_MEDIUM && p.direction === 'OUT' && !endsInside(a, p.id));

  /**
   * 이 자산이 반인가 — **나누는가.**
   *
   * 한때 「전원 출력 포트가 하나라도 있으면 반」이었다. 그러면 정류기·인버터·강압기·절체
   * 스위치처럼 **하나를 받아 하나로 보내는 것**까지 전부 묶음이 되어, 한 국에 반이 열둘씩
   * 섰다(실제 조서는 넷·다섯이다). 分電이라는 말 그대로다 — 하나를 하나로 보내는 것은
   * 나누는 것이 아니라 **거쳐 가는 것**이다.
   *
   * 세는 것은 **함체 밖으로 나가는 회로**다. 그리고 **함체 속 구성품은 애초에 세지 않는다**
   * (`boxedItems`) — 품목이 배선을 못 박아 둔 것은 제조사가 정한 한 덩어리이고, 계통도는
   * 그런 것을 한 상자로 그린다.
   *
   * 거쳐 가는 것들은 사라지지 않는다. 반의 머리줄에 **「무엇을 거쳐 왔는가」**로 남는다
   * (`sources[].via`) — 현장 조서가 「#1 충전기 : SCR 48V 100A용 충전기 / AC입력 : 통합분전반
   * 220V 3φ Load 1번」이라 적는 그 자리다.
   */
  const boards = assets.filter(
    (a) => !(a.assemblyItemId != null && boxedItems.has(a.assemblyItemId)) && circuitPortsOf(a).length > 1,
  );
  const boardIds = new Set(boards.map((b) => b.id));

  /**
   * 케이블을 따라 **반에 닿을 때까지 지나간다** — 나누지 않는 기기는 지나가는 자리다.
   *
   * 상용 피더의 분기 하나가 UPS 정류기를 먹이고, 그 UPS 가 정류기→DC링크→인버터→절체
   * 스위치를 거쳐 UPS 피더로 나온다. 케이블 한 칸만 보면 그 사이가 전부 끊겨, 상용 피더와
   * UPS 피더가 **서로 남남인 두 그루**로 선다. 실제로는 한 계통이다.
   *
   * 멈추는 자리가 둘이다. **반**(거기서 나뉜다)과, **갈 곳이 하나로 정해지지 않는 자리**다 —
   * UPS 절체 스위치는 입력이 둘(인버터·바이패스)이라 「어디서 오나」에 한 줄로 답할 수 없다.
   * 그때는 그 자리에서 멈춘다. 모르는 것을 지어내는 것보다 낫다.
   */
  const walkThrough = (
    startPortId: string,
    /** 올라가는가(입력 쪽) 내려가는가(출력 쪽) — 함체에서 찾을 출구의 방향이 이걸 따른다. */
    dir: 'up' | 'down',
  ): { assetId: string | null; via: { assetId: string; name: string }[] } => {
    const via: { assetId: string; name: string }[] = [];
    const seen = new Set<string>();
    let portId = startPortId;
    for (;;) {
      const cable = cableOf(portId);
      if (!cable) return { assetId: null, via };
      const nextId = peerAssetIdOf(portId, cable);
      if (nextId == null || boardIds.has(nextId)) return { assetId: nextId, via };
      const through = byId.get(nextId);
      if (!through) return { assetId: null, via };
      /**
       * **지나가는 것은 장비가 아니라 함체다.**
       *
       * 충전기 안은 분배부 → 정류기 → 분배부 → 강압기…로 갈래가 얽혀 있어, 장비 단위로 지나가려
       * 하면 첫 걸음에서 「갈 곳이 여럿」이라 멈춘다. 그러면 상용 반과 직류 반이 **남남인 두
       * 그루**로 선다 — 사이에 충전기가 있을 뿐 한 계통인데. 계통도가 충전기·UPS 를 한 상자로
       * 그리는 까닭이 이것이다.
       */
      const box = through.parentAssetId ?? through.id;
      if (seen.has(box)) return { assetId: null, via }; // 고리 — 더 가지 않는다
      seen.add(box);
      const group = through.parentAssetId != null
        ? assets.filter((a) => a.parentAssetId === through.parentAssetId)
        : [through];
      via.push({ assetId: box, name: (through.parentAssetId != null ? byId.get(box)?.name : through.name) ?? through.name });
      /* 그 함체에서 **밖으로 나가는 길** — 속살 배선은 지나가는 길이 아니고, 안 이은 자리는
         길이 아니다(케이블이 있어야 어디로 가는지 안다). */
      const want = dir === 'up' ? 'IN' : 'OUT';
      const exits = group.flatMap((a) =>
        a.ports.filter((p) => p.medium === POWER_MEDIUM && p.direction === want && cableOf(p.id) != null && !endsInside(a, p.id)),
      );
      /* 갈 곳이 하나로 정해지지 않으면 **거기서 멈춘다** — UPS 는 상용에서 정류기로도 받고
         바이패스로도 받아, 「어디서 오나」에 한 줄로 답할 수 없다. 지어내지 않는다. */
      if (exits.length !== 1) return { assetId: null, via };
      portId = exits[0]!.id;
    }
  };

  const nodeOf = (board: V2Asset): PowerNode => {
    const parent = board.parentAssetId ? (byId.get(board.parentAssetId) ?? null) : null;
    const powerPorts = board.ports.filter((p) => p.medium === POWER_MEDIUM);
    const sources = powerPorts
      .filter((p) => p.direction === 'IN')
      .map((p) => {
        const cable = cableOf(p.id);
        /* **반까지 거슬러 올라간다** — 정류기·인버터를 지나온 길은 `via` 가 말한다. */
        const up = walkThrough(p.id, 'up');
        return {
          portId: p.id,
          variant: p.variant,
          cableId: cable?.id ?? null,
          from: cable ? resolvePeer(p, cable, portIndex, board.substationId) : null,
          fromAssetId: up.assetId,
          portValues: declaredPortValues(p),
          values: cable?.specParams ?? {},
          via: up.via,
        };
      });
    /**
     * 이 반의 **모선** — 갈래가 같은 입력이다.
     *
     * 갈래로 고르는 까닭: 충전기 분전반은 교류 입력과 직류 입력을 함께 갖는다. 첫 입력만
     * 보면 직류 회로가 교류 모선의 전압을 물려받는다(「DC 회로가 AC 220V」).
     */
    const busOf = (variant: string | null | undefined) =>
      sources.find((sc) => (sc.variant ?? null) === (variant ?? null))?.portValues ?? {};

    const circuits = circuitPortsOf(board)
      .sort((a, b) => a.index - b.index)
      .map((p) => {
        const cable = cableOf(p.id);
        /* 이 회로가 **또 다른 반**을 먹이는가 — 변환기를 지나서라도. 케이블 한 칸만 보면
           상용 피더와 UPS 피더가 남남인 두 그루로 선다(사이에 UPS 가 있다). */
        const loadAssetId = walkThrough(p.id, 'down').assetId;
        return {
          portId: p.id,
          index: p.index,
          name: p.name,
          variant: p.variant,
          portValues: declaredPortValues(p, busOf(p.variant)),
          cableId: cable?.id ?? null,
          load: cable ? resolvePeer(p, cable, portIndex, board.substationId) : null,
          values: cable?.specParams ?? {},
          feedsAssetId: loadAssetId,
        };
      });
    return {
      assetId: board.id,
      name: board.name,
      containerId: parent?.id ?? null,
      containerName: parent?.name ?? null,
      sources,
      circuits,
      children: [],
    };
  };

  const nodes = new Map(boards.map((b) => [b.id, nodeOf(b)]));
  /**
   * 다른 반이 **먹이는** 반들 — 아니면 뿌리다(밖에서 온다).
   *
   * 판정을 **회로 쪽에서** 한다. 나무의 가지가 회로이므로(부모의 어느 회로가 나를 먹이나)
   * 입력 쪽으로 따로 물으면 둘이 어긋난다: 절체 스위치처럼 입력이 둘인 기기를 거치면
   * 내려갈 때는 이어지는데 올라갈 때는 멈춘다 — 그러면 그 반이 **가지로 한 번, 뿌리로 한 번**
   * 두 곳에 선다(회로가 두 번 세어진다).
   */
  const fedIds = new Set(
    boards.flatMap((b) => nodes.get(b.id)!.circuits.map((c) => c.feedsAssetId).filter((id): id is string => id != null)),
  );

  const placed = new Set<string>();
  const expand = (node: PowerNode): PowerNode => {
    placed.add(node.assetId);
    /* **한 반이 같은 반을 두 회로로 먹일 수 있다** — 상용 반의 분기 하나는 UPS 정류기로,
       또 하나는 바이패스로 가는데 둘 다 UPS 반에 닿는다. 걸러 낸 다음 펴면 그 두 회로가
       각각 한 그루씩 펴서 같은 반이 두 번 선다(회로가 두 번 세어진다) — 펴면서 걸러야 한다. */
    node.children = node.circuits
      .map((c) => c.feedsAssetId)
      .filter((id): id is string => id != null)
      .flatMap((id) => (placed.has(id) ? [] : [expand(nodes.get(id)!)]));
    return node;
  };

  const byName = (a: PowerNode, b: PowerNode) => a.name.localeCompare(b.name, 'ko');
  /* **계통을 이루는 뿌리가 먼저**다 — 아직 결선하지 않은 반이 많은 국에서는(개발 중인 자료가
     늘 그렇다) 이름순으로 세우면 실제 계통이 스무 줄 아래로 밀려 안 보인다. */
  const feedsSomething = (n: PowerNode) => n.circuits.some((c) => c.feedsAssetId != null);
  const roots = boards
    .map((b) => nodes.get(b.id)!)
    .filter((n) => !fedIds.has(n.assetId))
    .sort((a, b) => Number(feedsSomething(b)) - Number(feedsSomething(a)) || byName(a, b))
    .map(expand);

  /* 고리를 이룬 배선처럼 어느 뿌리에서도 못 닿는 반 — 뒤에 세운다(사라지게 두지 않는다).
     **한 그루씩 펴면서 걸러야 한다**: 먼저 다 걸러 놓으면 A 를 펴면서 딸려 온 B 가 뿌리로
     한 번 더 선다(고리에서 실제로 그랬다). */
  const orphans: PowerNode[] = [];
  for (const b of [...boards].sort((x, y) => x.name.localeCompare(y.name, 'ko'))) {
    if (!placed.has(b.id)) orphans.push(expand(nodes.get(b.id)!));
  }

  return [...roots, ...orphans];
}
