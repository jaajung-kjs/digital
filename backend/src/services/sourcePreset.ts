/**
 * sourcePresetId <-> properties/attributes JSON 브리지 (상세패널 오버홀 S3).
 *
 * 과거: 랙 설비/모듈의 `properties`(프론트) JSON 이 Asset.attributes(Json) 컬럼에
 * 저장됐고, 그 안의 유일한 의미있는 키가 `sourcePresetId`(랙이 어떤 프리셋에서
 * 생성됐는지) 였다.
 *
 * 현재: Asset.attributes 컬럼은 삭제되고 전용 컬럼 `sourcePresetId`(source_preset_id)
 * 로 이전. 프론트는 여전히 `properties: { sourcePresetId }` 모양으로 주고받으므로,
 * 백엔드 경계에서 이 헬퍼로 추출/주입해 라운드트립을 유지한다.
 */

/** 프론트가 보낸 properties/attributes JSON 에서 sourcePresetId(string|null) 를 추출. */
export function extractSourcePresetId(props: unknown): string | null {
  if (props && typeof props === 'object' && !Array.isArray(props)) {
    const id = (props as Record<string, unknown>).sourcePresetId;
    if (typeof id === 'string' && id.length > 0) return id;
  }
  return null;
}

/** sourcePresetId(컬럼) 를 프론트가 기대하는 properties JSON 으로 복원(없으면 null). */
export function sourcePresetToProperties(
  sourcePresetId: string | null
): { sourcePresetId: string } | null {
  return sourcePresetId ? { sourcePresetId } : null;
}
