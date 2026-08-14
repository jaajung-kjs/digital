/**
 * TypeListPanel — 「자산 종류」 탭의 목록.
 *
 * 판은 세 탭이 공유하는 `CatalogList` 가 그린다 — 여기서는 **이 대장에만 있는 것**만 얹는다:
 * 분류를 새로 만들고, 이름을 바꾸고, 비어 있으면 지우는 일. 설비·케이블 탭은 분류를 손대지
 * 않으므로 그 자리에 아무것도 없다.
 *
 * 예전에는 이 파일이 목록 전체(머리줄·묶음·행·선택 표시)를 따로 그렸다. 그래서 설비 종류
 * 목록과 미묘하게 달랐고(폭 64 vs 56, 분류 묶음 유무), 검색은 어느 쪽에도 없었다.
 */
import { useMemo } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { IconButton, useInlineRename } from '../../../components/ui';
import type { V2Catalog, V2Category } from '../../types';
import { CatalogList } from './CatalogList';

interface TypeListPanelProps {
  catalog: V2Catalog;
  selectedTypeId: string | null;
  onSelectType: (id: string) => void;
  /** 새 자산 종류 — 분류는 편집 화면에서 고른다. */
  onNewType: () => void;
  onRenameCategory: (category: V2Category, newName: string) => void;
  onDeleteCategory: (category: V2Category) => void;
  onAddCategory: () => void;
}

export function TypeListPanel({
  catalog,
  selectedTypeId,
  onSelectType,
  onNewType,
  onRenameCategory,
  onDeleteCategory,
  onAddCategory,
}: TypeListPanelProps) {
  /* 제자리 이름 바꾸기 — 세 탭이 같은 규칙을 쓴다(`useInlineRename`). */
  const rename = useInlineRename((id, name) => {
    const cat = catalog.categories.find((c) => c.id === id);
    if (cat) onRenameCategory(cat, name);
  });

  const groups = useMemo(
    () =>
      catalog.categories.map((cat) => {
        const items = catalog.types
          .filter((t) => t.categoryId === cat.id)
          .map((t) => ({
            id: t.id,
            name: t.name,
            /* 0 도 그대로 찍는다 — 빈칸은 「모른다」로 읽히지 「없다」로 읽히지 않는다.
               같은 자리에서 설비 종류 목록은 `분전반 0` 을 찍고 있었다. */
            hint: String(t.assetCount),
            hintTitle: `쓰이는 자산 ${t.assetCount}개`,
          }));
        return {
          key: cat.id,
          label:
            rename.isEditing(cat.id) ? (
              rename.field(cat.id, cat.name, `${cat.name} 이름 편집`)
            ) : (
              cat.name
            ),
          labelText: cat.name,
          items,
          actions: (
            <>
              <IconButton
                aria-label={`${cat.name} 이름 변경`}
                size="sm"
                onClick={() => rename.start(cat.id, cat.name)}
              >
                <Pencil size={12} />
              </IconButton>
              {/* 빈 분류만 지울 수 있다 — 종류가 남아 있으면 서버가 거부하므로 아예 막는다. */}
              <IconButton
                aria-label={`${cat.name} 분류 삭제`}
                size="sm"
                disabled={items.length > 0}
                onClick={() => onDeleteCategory(cat)}
              >
                <Trash2 size={12} />
              </IconButton>
            </>
          ),
        };
      }),
    [catalog.categories, catalog.types, rename],
  );

  return (
    <CatalogList
      title="자산 종류"
      groups={groups}
      selectedId={selectedTypeId}
      onSelect={onSelectType}
      onAdd={onNewType}
      addLabel="자산 종류 추가"
      onAddGroup={onAddCategory}
      emptyText="자산 종류가 없습니다"
    />
  );
}
