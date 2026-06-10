import { useMutation, useQueryClient } from '@tanstack/react-query';
import { assetApi } from '../../../services/assetApi';
import type { UpdateAssetInput } from '../../../types/asset';

/**
 * 자산 직접 저장(PUT /assets/:id) — 워킹카피가 없는 곳(본부·사업소 현황)에서 사용.
 * 변전소 워크스페이스는 워킹카피 스테이징(stageAssetUpdate)을 쓰므로 이 훅을 쓰지 않는다.
 *
 * onSuccess 에 ['asset', id] 와 nodeAssets 목록 쿼리를 무효화해 인스펙터·목록이 갱신되게 한다.
 */
export function useUpdateAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<UpdateAssetInput> }) =>
      assetApi.update(id, patch),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['asset', id] });
      // nodeAssets 키는 ['nodeAssets', nodeType, nodeId] (useNodeAssets). 노드 무관 전체 무효화.
      qc.invalidateQueries({ queryKey: ['nodeAssets'] });
    },
  });
}
