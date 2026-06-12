/**
 * 워크스페이스 딥링크 URL 의 단일 빌더(SSOT).
 *
 * 평면도는 한 곳(WorkspacePage)에서만 열린다. 트리·브레드크럼·OFD·자산 내비가 모두
 * 같은 정규 URL 형태(`/substations/:sub/workspace?view=plan&floor=:floor`)로 수렴하도록
 * URL 조립을 여기 한 군데에 모은다. 층은 항상 변전소에 속하므로 substationId 가 필수다.
 */
export function workspaceFloorUrl(
  substationId: string,
  floorId: string,
  opts?: { assetId?: string },
): string {
  const asset = opts?.assetId ? `&assetId=${opts.assetId}` : '';
  return `/substations/${substationId}/workspace?view=plan&floor=${floorId}${asset}`;
}
