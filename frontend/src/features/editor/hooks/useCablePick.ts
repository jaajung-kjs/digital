import { useInteractionStore, useCableDrawing } from '../stores/interactionStore';
import { commitCable } from '../cableConnection';
import type { EndpointRef } from '../cableEndpoint';

export interface CablePick {
  active: boolean;
  side: 'source' | 'target' | null;
  onPick: (ref: EndpointRef) => void;
}

/** 케이블 연결 중 우측 패널 뷰가 연결점 피커로 동작하기 위한 신호. */
export function useCablePick(): CablePick {
  const data = useCableDrawing();
  const phase = data?.phase ?? null;
  const side = phase === 'pickingSourceEndpoint' ? 'source'
    : phase === 'pickingTargetEndpoint' ? 'target' : null;
  const onPick = (ref: EndpointRef) => {
    const s = useInteractionStore.getState();
    if (side === 'source') s.cableSetSource(ref);
    else if (side === 'target') { s.cableSetTarget(ref); commitCable(); }
  };
  return { active: side !== null, side, onPick };
}
