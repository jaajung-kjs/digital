import { useCableCategories } from '../cables/hooks/useCableCategories';
import { useEffectiveCables } from '../workingCopy/hooks';
import { resolveCableSeed, type CableSeedInput } from './cableSeed';
import { useServerTrace, type UseServerTraceResult } from './useServerTrace';

/**
 * 선택 케이블의 (seed, group) 을 해소해 서버 trace component 를 가져온다.
 * 반환 graph 는 작은 TraceGraph — buildInternalPath/projectTrace 에 그대로 투입 가능.
 * cableId 가 null 이거나 seed/group 미해소면 비활성({ graph: null }).
 */
export function useCableComponentGraph(cableId: string | null): UseServerTraceResult {
  const { data: categories = [] } = useCableCategories();
  const cables = useEffectiveCables() as unknown as CableSeedInput[];
  const seed = cableId ? resolveCableSeed(cableId, cables, categories) : null;
  // useServerTrace 는 seed/group 이 null 이면 enabled=false → { graph: null }.
  return useServerTrace(seed?.seedAssetId ?? null, seed?.groupId ?? null);
}
