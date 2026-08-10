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
import { useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { IconButton, Input } from '../../../components/ui';
import type { V2Catalog, V2Category } from '../../types';
import { CatalogList } from './CatalogList';

interface TypeListPanelProps {
  catalog: V2Catalog;
  selectedTypeId: string | null;
  onSelectType: (id: string) => void;
  onNewType: (categoryId: string) => void;
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
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  function commitRename(cat: V2Category) {
    const trimmed = editingName.trim();
    if (trimmed && trimmed !== cat.name) onRenameCategory(cat, trimmed);
    setEditingCategoryId(null);
  }

  const groups = useMemo(
    () =>
      catalog.categories.map((cat) => {
        const items = catalog.types
          .filter((t) => t.categoryId === cat.id)
          .map((t) => ({ id: t.id, name: t.name, hint: t.assetCount > 0 ? String(t.assetCount) : undefined }));
        return {
          key: cat.id,
          label:
            editingCategoryId === cat.id ? (
              /* 이름을 고치는 중에는 묶음 머리줄 자리에 상자가 선다 — 모달을 띄우면
                 어느 분류를 고치는 중인지 화면에서 사라진다. */
              <Input
                aria-label="분류 이름 편집"
                size="sm"
                value={editingName}
                autoFocus
                onChange={(e) => setEditingName(e.currentTarget.value)}
                onBlur={() => commitRename(cat)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename(cat);
                  if (e.key === 'Escape') setEditingCategoryId(null);
                }}
              />
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
                onClick={() => {
                  setEditingCategoryId(cat.id);
                  setEditingName(cat.name);
                }}
              >
                <Pencil size={12} />
              </IconButton>
              <IconButton aria-label={`${cat.name}에 종류 추가`} size="sm" onClick={() => onNewType(cat.id)}>
                <Plus size={12} />
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
    [catalog.categories, catalog.types, editingCategoryId, editingName],
  );

  return (
    <CatalogList
      title="자산 종류"
      groups={groups}
      selectedId={selectedTypeId}
      onSelect={onSelectType}
      headerActions={
        <IconButton aria-label="분류 추가" onClick={onAddCategory}>
          <Plus size={14} />
        </IconButton>
      }
      emptyText="자산 종류가 없습니다"
    />
  );
}
