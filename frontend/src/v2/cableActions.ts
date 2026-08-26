import { validateConnection } from '@twin/core';
import { cableCountByPortId } from './cableSelectors';
import { useV2WorkingCopy } from './store/workingCopyStore';
import type { V2Asset, V2Cable, V2Port } from './types';

/**
 * **케이블을 잇는 일은 한 번만 적는다** — 어디서 골랐든 같은 결과여야 한다.
 *
 * 끝점을 고르는 문은 셋이다: 도면에서 설비를 눌러 고르기, 포트 탭의 「케이블 연결」, 대국
 * 검색. 예전에는 그중 둘이 각자 검증하고 각자 케이블 객체를 지어 스테이지했다 — 같은 글이
 * 두 벌이라 한쪽만 고쳐지기 딱 좋았고, 실제로 그렇게 됐다: 경로점을 나중에 붙일 때 한 곳에만
 * 붙일 뻔했고, 첫 끝점에 넣는 자산이 문마다 달라 **미리보기가 한쪽 문에서만** 나왔다.
 *
 * 여기서는 「이을 수 있는가」와 「이었다」만 한다. **못 이었을 때 그 까닭을 어디에 적을지는
 * 부르는 쪽이 안다**(피커 안 안내줄 · 대국 상자) — 그것만이 문마다 다른 일이다.
 */

/** 못 이은 까닭 — core 의 판정 코드이거나, 첫 끝점을 잃은 경우(`no-first`). */
export type ConnectFailure = 'no-first' | string;

export function connectCable(args: {
  firstPortId: string | null;
  /** 두 번째 끝점 — 이 도면의 포트일 수도, 대국에서 고른 포트일 수도 있다. */
  toPort: V2Port;
  assets: readonly V2Asset[];
  cables: readonly V2Cable[];
  substationId: string;
  categoryId: string | null;
  /** 고른 케이블 품목의 매체 — 매체가 다른 포트끼리는 잇지 않는다. */
  mediumKey: string | undefined;
  /** 그리며 찍은 꺾은점 — **보이던 그 모양**이 저장된다. */
  pathPoints: readonly { x: number; y: number }[];
}): ConnectFailure | null {
  const { firstPortId } = args;
  if (!firstPortId) return 'no-first';
  const aPort = args.assets.flatMap((a) => a.ports).find((p) => p.id === firstPortId);
  /* 첫 끝점을 화면에서 찾을 수 없다 — 무검증 스테이지는 하지 않는다. */
  if (!aPort) return 'no-first';

  const err = validateConnection(aPort, args.toPort, cableCountByPortId(args.cables as V2Cable[]), args.mediumKey);
  if (err) return err;

  useV2WorkingCopy.getState().stageCableCreate({
    id: crypto.randomUUID(),
    name: null,
    substationId: args.substationId,
    aPortId: firstPortId,
    bPortId: args.toPort.id,
    categoryId: args.categoryId,
    pathPoints: [...args.pathPoints],
    specParams: {},
    updatedAt: '',
  });
  return null;
}
