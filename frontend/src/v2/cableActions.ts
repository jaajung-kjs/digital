import { validateConnection } from '@twin/core';
import { cableCountByPortId } from './cableSelectors';
import { useV2WorkingCopy } from './store/workingCopyStore';
import type { V2Asset, V2Cable, V2Port } from './types';
import { newId } from './newId';

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
    id: newId(),
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

/**
 * 설비 품목이 들고 온 **내부 배선**을 스테이지한다.
 *
 * 랙 한 대짜리 설비의 안쪽 배선은 어느 국에 놓든 같아서, 설비 품목이 그 목록을 들고 다닌다
 * (`AssemblyLink`). 놓을 때 자산과 함께 케이블도 서야 하는데, **케이블을 스테이지하는 일은
 * 이 파일 밖에서 하지 않는다** — 같은 일에 문이 둘이면 한쪽만 고쳐진다.
 *
 * **여기서 다시 판정하지 않는다.** 그 짝은 설비 품목을 저장할 때 이미 `validateConnection`
 * 을 통과했고(`validateAssembly`), 지금 만든 포트는 그때 본 **같은 선언에서** 펴진 것이라
 * 구성상 유효하다. 게다가 이 자산들은 아직 워킹카피에 없어서(같은 걸음에 함께 스테이지된다)
 * 여기서 포트를 되짚을 방법도 없다 — 없는 것을 보는 척하는 검사는 두지 않는다.
 */
export function stageAssemblyCables(cables: readonly V2Cable[]): void {
  for (const cable of cables) useV2WorkingCopy.getState().stageCableCreate(cable);
}
