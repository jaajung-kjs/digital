import { useMemo } from 'react';
import { useEffectiveAssets, useEffectiveCables } from '../../workingCopy/hooks';
import { buildEndpointNameResolver, buildSelfSideChecker } from '../endpointName';

export interface AssetConnection {
  id: string;
  source: { assetId: string | null; name: string };
  target: { assetId: string | null; name: string };
  cableType: string;
  label: string | null;
  totalLength?: number | null;
}

/**
 * 연결(케이블) 목록을 **워킹카피(effective)에서** 읽어 구성한다 — 연결 목록의 단일 빌더.
 *
 * - assetId 를 주면 그 자산의 연결(자식 랙모듈/분전 분기 포함, buildSelfSideChecker), null 이면
 *   전체(변전소 연결 뷰). 끝점 이름은 buildEndpointNameResolver 단일 소스(모듈/분기/설비, staged 반영).
 * - effective 로 읽으므로 staged 케이블 추가/수정/삭제·이름 변경이 저장 전에도 즉시 반영된다.
 */
export function useEffectiveAssetConnections(assetId: string | null): AssetConnection[] {
  const cables = useEffectiveCables();
  const assets = useEffectiveAssets();
  return useMemo(() => {
    const resolve = buildEndpointNameResolver(assets);
    const epName = (id: string | null) => (id ? resolve(id) || '(미상)' : '');
    const all = cables
      .map((c) => c as Record<string, unknown>)
      .map((c) => {
        const src = (c.sourceAssetId as string | null) ?? null;
        const tgt = (c.targetAssetId as string | null) ?? null;
        return {
          id: c.id as string,
          source: { assetId: src, name: epName(src) },
          target: { assetId: tgt, name: epName(tgt) },
          cableType: (c.cableType as string) ?? '',
          label: (c.label as string | null | undefined) ?? null,
          totalLength: (c.totalLength as number | null | undefined) ?? null,
        };
      });
    if (!assetId) return all; // 전체(변전소 연결 뷰)
    const isSelf = buildSelfSideChecker(assets, assetId);
    return all.filter((r) => isSelf(r.source.assetId) || isSelf(r.target.assetId));
  }, [cables, assets, assetId]);
}
