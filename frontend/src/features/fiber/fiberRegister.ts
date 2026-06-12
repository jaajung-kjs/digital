import type { FiberPathDetail, FiberCore, FiberCoreRow } from './types';

/**
 * 선번장 한 광경로의 코어 행들을 만든다 — 점유는 ports(케이블 도출)에서, 메타는 FiberCore(희소)에서.
 * 점유는 저장하지 않는다(드리프트 0); 여기서 읽을 때 합쳐 한 행으로 보여줄 뿐이다.
 *
 * @param localOfdId 보고 있는 OFD. path.ofdA.id===localOfdId 면 near=sideA, 아니면 near=sideB.
 */
export function buildFiberCoreRows(
  path: FiberPathDetail,
  localOfdId: string,
  fiberCores: FiberCore[],
): FiberCoreRow[] {
  const localIsA = path.ofdA.id === localOfdId;
  const metaByCore = new Map<number, FiberCore>();
  for (const c of fiberCores) {
    if (c.fiberPathId === path.id) metaByCore.set(c.coreNumber, c);
  }
  return path.ports.map((port) => {
    const near = localIsA ? port.sideA : port.sideB;
    const far = localIsA ? port.sideB : port.sideA;
    const occupied = !!(port.sideA || port.sideB);
    const m = metaByCore.get(port.portNumber);
    const usage: '사용' | '미사용' =
      (m?.usageOverride as '사용' | '미사용' | null | undefined) ?? (occupied ? '사용' : '미사용');
    return {
      fiberPathId: path.id,
      coreNumber: port.portNumber,
      near,
      far,
      occupied,
      coreRecordId: m?.id ?? null,
      purpose: m?.purpose ?? null,
      circuitText: m?.circuitText ?? null,
      spliceType: m?.spliceType ?? null,
      usage,
    };
  });
}
