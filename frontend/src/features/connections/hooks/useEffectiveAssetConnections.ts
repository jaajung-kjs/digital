import { useMemo } from 'react';
import { useEffectiveAssets, useEffectiveCables } from '../../workingCopy/hooks';

export interface AssetConnection {
  id: string;
  source: { assetId: string | null; name: string };
  target: { assetId: string | null; name: string };
  cableType: string;
  label: string | null;
  totalLength?: number | null;
}

/**
 * 현 자산에 연결된 케이블을 **워킹카피(effective)에서** 읽어 연결 목록으로 구성한다.
 *
 * C1(Read 계약): 상세패널 연결 탭은 서버(useAssetConnections)가 아니라 effective 로 읽어야
 * staged 케이블 변경(추가/수정/삭제)이 저장 전에도 즉시 반영된다. 상대 endpoint 이름은
 * effective assets 에서 해석한다(이름도 staged 변경 반영).
 */
export function useEffectiveAssetConnections(assetId: string): AssetConnection[] {
  const cables = useEffectiveCables();
  const assets = useEffectiveAssets();
  return useMemo(() => {
    const nameById = new Map(assets.map((a) => [a.id, a.name]));
    // effective cable 은 느슨한 행(WorkingCopyRow, index=unknown) → 필드 캐스트.
    return cables
      .map((c) => c as Record<string, unknown>)
      .filter((c) => c.sourceAssetId === assetId || c.targetAssetId === assetId)
      .map((c) => {
        const src = (c.sourceAssetId as string | null) ?? null;
        const tgt = (c.targetAssetId as string | null) ?? null;
        return {
          id: c.id as string,
          source: { assetId: src, name: (src && nameById.get(src)) || '(미상)' },
          target: { assetId: tgt, name: (tgt && nameById.get(tgt)) || '(미상)' },
          cableType: (c.cableType as string) ?? '',
          label: (c.label as string | null | undefined) ?? null,
          totalLength: (c.totalLength as number | null | undefined) ?? null,
        };
      });
  }, [cables, assets, assetId]);
}
