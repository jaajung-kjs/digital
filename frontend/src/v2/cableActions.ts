import { validateConnection } from '@twin/core';
import { useV2WorkingCopy } from './store/workingCopyStore';
import type { V2Cable, V2Port } from './types';
import { newId } from './newId';

/**
 * **케이블을 잇는 일은 한 번만 적는다** — 어디서 골랐든 같은 결과여야 한다.
 *
 * 끝점을 고르는 문은 넷이다: 도면·포트 탭·선번장·계통. 예전에는 그중 둘이 각자 검증하고 각자
 * 케이블 객체를 지어 스테이지했다 — 같은 글이 두 벌이라 한쪽만 고쳐지기 딱 좋았고, 실제로
 * 그렇게 됐다: 경로점을 나중에 붙일 때 한 곳에만 붙일 뻔했고, 첫 끝점에 넣는 자산이 문마다
 * 달라 **미리보기가 한쪽 문에서만** 나왔다.
 *
 * 여기서는 「이을 수 있는가」와 「이었다」만 한다. 못 이은 까닭을 어디에 적을지는 부르는 쪽이
 * 안다(지금은 종류 상자 안이다).
 */

/**
 * 케이블을 물릴 **한 끝점** — 포트 그 자체와, 그 포트에 이미 물린 가닥 수.
 *
 * **id 가 아니라 값을 들고 다닌다.** 예전에는 첫 끝점을 `firstPortId` 로만 받아 지금 로드된
 * 워킹카피에서 되짚었는데, 다른 국으로 다녀와 잇는 길에서는 그 포트가 **거기 없다**(담아 둔
 * 국의 것이다). 그래서 국을 넘는 연결은 마지막 걸음에서 「출발 포트를 확인할 수 없습니다」로
 * 끝났다 — 고를 때는 분명히 있던 포트인데. 고른 순간의 사실을 그대로 들고 오면 되짚을 일이
 * 없고, `no-first` 라는 실패 갈래 자체가 사라진다.
 *
 * 가닥 수도 함께 온다: 상대 국의 케이블은 이 카피에 없어 여기서 셀 수 없으므로, 안 세면
 * 「자리가 비었다」로 읽혀 이미 찬 포트에 한 가닥이 더 물린다.
 */
export interface CableEnd {
  port: V2Port;
  cableCount: number;
}

/**
 * 이을 수 있는가 — **판정만** 한다(쌓지 않는다).
 *
 * 잇기 직전에 화면을 옮겨야 하는 길이 있어서 판정을 따로 물을 자리가 필요하다: 다른 국에
 * 다녀와 이으면 **먼저 시작한 국으로 돌아가** 되살린 뒤에 쌓아야 하는데, 못 이을 값을 들고
 * 돌아가 버리면 상자만 열린 채 화면이 딴 데로 가 있다. 먼저 묻고, 통과하면 옮긴 뒤 쌓는다.
 *
 * 두 끝점은 값이라 묻고 나서 쌓기까지 **변하지 않는다** — 그래서 두 번 묻는 것이 아니라
 * 한 번 묻고 그 답대로 행동하는 것이다.
 */
export function canConnectEnds(from: CableEnd, to: CableEnd, mediumKey?: string): string | null {
  const counts = new Map([[from.port.id, from.cableCount], [to.port.id, to.cableCount]]);
  return validateConnection(from.port, to.port, counts, mediumKey);
}

export function connectCable(args: {
  from: CableEnd;
  to: CableEnd;
  substationId: string;
  categoryId: string | null;
  /** 고른 케이블 품목의 매체 — 매체가 다른 포트끼리는 잇지 않는다. */
  mediumKey: string | undefined;
  /** 나중에 도면에서 붙이는 꺾은점 — 이을 때는 비어 있다. */
  pathPoints: readonly { x: number; y: number }[];
}): string | null {
  const err = canConnectEnds(args.from, args.to, args.mediumKey);
  if (err) return err;

  useV2WorkingCopy.getState().stageCableCreate({
    id: newId(),
    name: null,
    substationId: args.substationId,
    aPortId: args.from.port.id,
    bPortId: args.to.port.id,
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
