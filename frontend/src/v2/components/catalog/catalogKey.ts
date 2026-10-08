/**
 * 품목 키 자동 생성 — 키는 화면에서 숨기고 새 품목을 만들 때 여기서 찍는다.
 * 모양: `EQ-lz3k9-7f2a` (접두 · 시각 base36 · 무작위 4자).
 */
import type { CatalogKind } from '../../model/types';

const KIND_PREFIX: Record<CatalogKind, string> = {
  'equipment-types': 'EQ',
  'rack-types': 'RACK',
  'cable-types': 'CABLE',
  categories: 'CAT',
};

export function newCatalogKey(kind: CatalogKind): string {
  const rand = Math.floor(Math.random() * 36 ** 4).toString(36).padStart(4, '0');
  return `${KIND_PREFIX[kind]}-${Date.now().toString(36)}-${rand}`;
}
