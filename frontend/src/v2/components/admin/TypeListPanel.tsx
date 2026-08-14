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
import { IconButton, TreePanel, useInlineRename, type TreeNode } from '../../../components/ui';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import type { V2Catalog, V2Category } from '../../types';

interface TypeListPanelProps {
  catalog: V2Catalog;
  selectedTypeId: string | null;
  onSelectType: (id: string) => void;
  /** 새 자산 종류 — 분류 줄의 `+` 로 만들면 그 분류로 시작한다. */
  onNewType: (categoryId?: string) => void;
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

  /**
   * 분류 → 종류 2단을 **한 줄짜리 목록**으로 편다 — 트리는 층을 `depth` 로만 안다.
   *
   * 분류 줄은 고를 것이 없다(`selectable: false`) — 눌러서 접고 펼 뿐이다. 손이 닿으면
   * 그 분류를 다루는 것이 드러난다: 그 안에 만들기 · 이름 변경 · 삭제.
   */
  const nodes = useMemo<TreeNode[]>(() => {
    const out: TreeNode[] = [];
    for (const cat of catalog.categories) {
      const items = catalog.types.filter((t) => t.categoryId === cat.id);
      out.push({
        id: cat.id,
        label: rename.isEditing(cat.id) ? rename.field(cat.id, cat.name, `${cat.name} 이름 편집`) : cat.name,
        text: cat.name,
        depth: 0,
        selectable: false,
        actions: (
          <>
            <IconButton
              aria-label={`${cat.name} 에 자산 종류 추가`}
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onNewType(cat.id);
              }}
            >
              <Plus size={12} />
            </IconButton>
            <IconButton
              aria-label={`${cat.name} 이름 변경`}
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                rename.start(cat.id, cat.name);
              }}
            >
              <Pencil size={12} />
            </IconButton>
            {/* 빈 분류만 지울 수 있다 — 종류가 남아 있으면 서버가 거부하므로 아예 막고,
                왜 못 지우는지 그 자리에서 말한다. */}
            <IconButton
              aria-label={`${cat.name} 분류 삭제`}
              size="sm"
              disabled={items.length > 0}
              disabledReason={
                items.length > 0 ? `이 분류에 ${items.length}개가 들어 있어 지울 수 없습니다` : undefined
              }
              onClick={(e) => {
                e.stopPropagation();
                onDeleteCategory(cat);
              }}
            >
              <Trash2 size={12} />
            </IconButton>
          </>
        ),
      });
      for (const t of items) out.push({ id: t.id, label: t.name, text: t.name, depth: 1 });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog.categories, catalog.types, rename]);

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-sidebar">
      <TreePanel
        title="자산 종류"
        nodes={nodes}
        selectedId={selectedTypeId}
        onSelect={(n) => onSelectType(n.id)}
        onAdd={onAddCategory}
        addLabel="분류 추가"
        searchable
        emptyText="자산 종류가 없습니다"
      />
    </aside>
  );
}
