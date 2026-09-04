/**
 * traceLabels — 추적 마디를 **뭐라고 부를 것인가.**
 *
 * 예전에는 이 규칙이 `ConnectionsTab` 안의 지역 함수였다. 900줄짜리 컴포넌트 안이라
 * 시험을 붙일 수가 없었는데, 정작 규칙은 넷이나 되고 셋은 아픈 경험에서 나온 것들이다
 * (아래 주석). 화면에서 떼어 내면 그대로 시험할 수 있다.
 */
import { endpointRef, type PortIndex } from './peerResolve';
import type { V2Cable } from './types';

/** 마디 하나를 부르는 두 줄 — 굵은 줄은 장비, 흐린 줄은 그 안 어디인가. */
export interface TraceNodeLabel {
  primary: string;
  secondary: string | null;
}

/** 이름을 짓는 데 필요한 자리들. 화면이 이미 들고 있는 것뿐이다. */
export interface TraceLabelSource {
  portIndex: PortIndex;
  /** portId → 그 포트에 물린 케이블들. 이 카피에 없는 끝점은 케이블의 저장된 ref 가 안다. */
  cablesByPortId: ReadonlyMap<string, readonly { cable: V2Cable }[]>;
  /** 추적을 건 자리의 설비 — 그 이름은 마디마다 되풀이하지 않는다. */
  tracedAssembly: string | null;
  /** 보고 있는 국 — 다른 국일 때만 국 이름을 덧붙인다. */
  localSubstationId: string | null;
}

/**
 * 추적 마디의 이름 — **굵은 줄은 장비, 흐린 줄은 그 안 어디인가.**
 *
 * 추적을 거는 까닭은 「장비가 어떤 차례로 이어지나」다. 그래서 굵은 줄에는 장비 이름만
 * 둔다 — 거기에 포트까지 이어 붙이면(「OFD - 광링D S/S - 광링A S/S - 1#1」) 좁은 판에서
 * 말줄임에 잘려 정작 알고 싶은 장비가 사라진다. 국을 넘는 경로슬롯은 이름 자체가 두 국을
 * 담고 있어 더 그렇다.
 *
 * 포트는 **아래 흐린 줄**로 내린다. 그 줄은 이미 그려지고 있었고(같은 설비 안에서 도는
 * 추적이면 비어 있었다), 아래 줄이라 **판이 넓어지지 않는다** — 눌러서 여는 쪽지보다
 * 낫다: 볼 사람에게는 이미 보이고, 안 볼 사람의 눈에는 안 걸린다.
 *
 * 포트를 번호가 아니라 **이름**으로 적는다. 번호는 묶음 안에서만 매겨져서 한 장비의
 * `#1` 이 넷일 수 있다(IRCU 의 경보 접점 · 접지 · LAN · 전원 입력). 이름은 그 넷을 가른다.
 *
 * 자리(국 · 설비)는 **다를 때만** 덧붙인다 — 랙 한 대 안에서 도는 추적은 마디가 넷이면
 * 같은 설비 이름이 넷 서서, 아무것도 말해 주지 않으면서 합류를 화면 밖으로 민다.
 */
export function traceLabeller(src: TraceLabelSource): (portId: string) => TraceNodeLabel {
  const join = (parts: (string | null | undefined)[]): string | null =>
    parts.filter(Boolean).join(' · ') || null;

  return (portId: string): TraceNodeLabel => {
    const entry = src.portIndex.get(portId);
    if (entry) {
      const sameAssembly = entry.assemblyName != null && entry.assemblyName === src.tracedAssembly;
      return {
        primary: entry.asset.name,
        secondary: join([entry.port.name, sameAssembly ? null : entry.assemblyName]),
      };
    }
    /* 이 카피에 없는 끝점 — 국을 넘는 케이블의 건너편이다. 케이블에 저장된 ref 가 아는
       전부이고, 그 안에는 국 이름도 있다. */
    const cable = src.cablesByPortId.get(portId)?.[0]?.cable;
    const ref = cable ? endpointRef(cable, portId) : null;
    if (ref) {
      /* 국은 **다른 국일 때만** 적는다 — 보고 있는 국 이름을 덧붙이면 군더더기다. */
      const remote = src.localSubstationId != null && ref.substationId !== src.localSubstationId;
      return {
        primary: ref.assetName,
        secondary: join([ref.portName, remote ? ref.substationName : null, ref.assemblyName]),
      };
    }
    /* 케이블도 없고 이 카피에도 없다 — 지워진 끝점이다. 이름을 지어내지 않는다. */
    return { primary: '포트 —', secondary: null };
  };
}
