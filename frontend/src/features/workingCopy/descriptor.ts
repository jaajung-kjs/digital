export interface CollectionDescriptor<T, Patch = Partial<T>> {
  name: string;
  idOf: (t: T) => string;
  versionOf?: (t: T) => string | null;            // OCC 토큰(updatedAt). 큐 컬렉션은 없음
  isTemp: (id: string) => boolean;
  applyIdMap?: (t: T, idMap: Record<string, string>) => T;  // tempId 참조 해석
  applyPatch?: (t: T, patch: Patch) => T;                   // 패치 적용(미지정 시 shallow merge)
}
