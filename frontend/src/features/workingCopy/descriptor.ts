/**
 * 워킹카피 컬렉션의 최소 계약 — 엔진(mergeEffective / snapshotBaseVersions)이 실제로
 * 읽는 두 가지뿐이다. id 로 saved↔overlay 를 맞추고(idOf), OCC baseVersion 스냅샷을
 * 뜬다(versionOf). 종류-무관 기계(temp 판정·패치 적용)는 isTempId 유틸과 shallow-merge 로
 * 충분해 descriptor 가 들고 있을 필요가 없다(이전의 name/isTemp/applyPatch/applyIdMap 폐기).
 */
export interface CollectionDescriptor<T> {
  idOf: (t: T) => string;
  versionOf: (t: T) => string | null; // OCC 토큰(updatedAt). 큐 컬렉션은 () => null.
}
