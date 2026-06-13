import type { TraceAsset, TraceCable } from './cableTrace';

interface FiberPathRow { id: string; ofdAId: string; ofdBId: string; portCount?: number }
interface FiberCableRow {
  id: string; cableType?: string | null;
  sourceAssetId?: string | null; targetAssetId?: string | null;
  fiberPathId?: string | null; fiberPortNumber?: number | null;
}
interface FiberCoreRow { id: string; fiberPathId: string; coreNumber: number }

export interface UnifiedGraph { assets: TraceAsset[]; cables: TraceCable[] }

const slotId = (fpId: string, side: 'A' | 'B') => `ofdslot:${fpId}:${side}`;

/**
 * 기존 광 데이터(FiberPath/케이블)를 통일 그래프(conduit 슬롯 + OPGW + 번호 OUT 케이블)로
 * *읽기 변환*. cableTrace 가 이 그래프로 광경로를 낸다(마이그레이션 전 검증, 되돌리기 가능).
 * 라이브 데이터는 안 바꾼다 — 메모리 변환기.
 */
export function fiberToUnifiedGraph(
  fiberPaths: FiberPathRow[],
  fiberCables: FiberCableRow[],
  _fiberCores: FiberCoreRow[],
): UnifiedGraph {
  const assetById = new Map<string, TraceAsset>();
  const cables: TraceCable[] = [];
  const addAsset = (id: string, kind: TraceAsset['connectionKind']) => {
    if (!assetById.has(id)) assetById.set(id, { id, connectionKind: kind });
  };

  const byPath = new Map<string, FiberPathRow>();
  for (const fp of fiberPaths) {
    byPath.set(fp.id, fp);
    const a = slotId(fp.id, 'A'), b = slotId(fp.id, 'B');
    addAsset(a, 'conduit');
    addAsset(b, 'conduit');
    cables.push({ id: `opgw:${fp.id}`, cableType: 'FIBER', sourceAssetId: a, targetAssetId: b, sourceRole: 'IN', targetRole: 'IN' });
  }

  for (const c of fiberCables) {
    if (!c.fiberPathId) continue;
    const fp = byPath.get(c.fiberPathId);
    if (!fp) continue;
    let slot: string | null = null;
    let equip: string | null = null;
    if (c.sourceAssetId === fp.ofdAId) { slot = slotId(fp.id, 'A'); equip = c.targetAssetId ?? null; }
    else if (c.targetAssetId === fp.ofdAId) { slot = slotId(fp.id, 'A'); equip = c.sourceAssetId ?? null; }
    else if (c.sourceAssetId === fp.ofdBId) { slot = slotId(fp.id, 'B'); equip = c.targetAssetId ?? null; }
    else if (c.targetAssetId === fp.ofdBId) { slot = slotId(fp.id, 'B'); equip = c.sourceAssetId ?? null; }
    if (!slot || !equip) continue;
    addAsset(equip, null);
    cables.push({
      id: `out:${c.id}`, cableType: 'FIBER',
      sourceAssetId: slot, targetAssetId: equip,
      sourceRole: 'OUT', targetRole: null,
      number: c.fiberPortNumber ?? null,
    });
  }

  return { assets: [...assetById.values()], cables };
}
