/**
 * sourcePresetId -> properties JSON 투영 (상세패널 오버홀 S3).
 *
 * 랙이 어떤 프리셋에서 생성됐는지는 전용 컬럼 `sourcePresetId`(source_preset_id) 에
 * 저장한다. 프론트는 `properties: { sourcePresetId }` 모양으로 읽으므로 읽기 경계에서
 * 이 헬퍼로 복원한다. (구 Asset.attributes free-form JSON 은 영구 제거됨 — 부활 금지.)
 */

/** sourcePresetId(컬럼) 를 프론트가 기대하는 properties JSON 으로 복원(없으면 null). */
export function sourcePresetToProperties(
  sourcePresetId: string | null
): { sourcePresetId: string } | null {
  return sourcePresetId ? { sourcePresetId } : null;
}
