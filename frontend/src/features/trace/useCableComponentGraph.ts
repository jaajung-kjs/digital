import { useServerTrace, type UseServerTraceResult } from './useServerTrace';

/**
 * 선택 케이블의 서버 trace component 를 가져온다.
 * 반환 graph 는 작은 TraceGraph — buildInternalPath/projectTrace 에 그대로 투입 가능.
 * cableId 가 null 이면 비활성({ graph: null }).
 */
export function useCableComponentGraph(cableId: string | null): UseServerTraceResult {
  return useServerTrace(cableId);
}
