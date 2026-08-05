/**
 * TypeListPanel — 좌측 사이드바 내용(폭·테두리·배경은 부모 aside 가 소유한다)
 * - 분류(카테고리)별 그룹 타입 리스트
 * - 타입명 + assetCount 배지 + 비활성 흐림
 * - 분류 행 우측: 연필(이름 변경), +(타입 추가), 휴지통(빈 분류만)
 * - 헤더 우측 + 버튼으로 분류 추가(조직 트리와 같은 형태)
 */
import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge, IconButton, Input, useConfirm, PanelHeader, cn, SELECTABLE, SELECTED } from '../../../components/ui';
import type { V2Catalog, V2Category } from '../../types';

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
  const { confirm, confirmDialog } = useConfirm();
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  function startRename(cat: V2Category) {
    setEditingCategoryId(cat.id);
    setEditingName(cat.name);
  }

  function commitRename(cat: V2Category) {
    const trimmed = editingName.trim();
    if (trimmed && trimmed !== cat.name) {
      onRenameCategory(cat, trimmed);
    }
    setEditingCategoryId(null);
  }

  function cancelRename() {
    setEditingCategoryId(null);
  }

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        variant="sidebar"
        title="자산 타입"
        actions={
          <IconButton aria-label="분류 추가" onClick={onAddCategory}>
            <Plus size={14} />
          </IconButton>
        }
      />
      {/* 분류별 섹션 */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {catalog.categories
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((cat) => {
            const types = catalog.types
              .filter((t) => t.categoryId === cat.id)
              .sort((a, b) => a.sortOrder - b.sortOrder);
            const canDelete = types.length === 0;

            return (
              <div key={cat.id}>
                {/* 분류 헤더 */}
                <div className="flex items-center gap-1 px-3 py-1.5 border-b border-line bg-surface-2">
                  {editingCategoryId === cat.id ? (
                    <Input
                      aria-label="분류 이름"
                      size="sm"
                      className="flex-1 border-primary"
                      value={editingName}
                      autoFocus
                      onChange={(e) => setEditingName(e.currentTarget.value)}
                      onBlur={() => commitRename(cat)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.currentTarget.blur();
                        }
                        if (e.key === 'Escape') cancelRename();
                      }}
                    />
                  ) : (
                    <span className="flex-1 min-w-0 truncate text-xs font-semibold text-content-muted">{cat.name}</span>
                  )}
                  <div className="ml-auto flex shrink-0 items-center gap-0.5">
                    <IconButton aria-label={`${cat.name} 이름 변경`} className="p-0.5" onClick={() => startRename(cat)}>
                      <Pencil size={12} />
                    </IconButton>
                    <IconButton
                      aria-label={`${cat.name}에 타입 추가`}
                      className="p-0.5"
                      onClick={() => onNewType(cat.id)}
                    >
                      <Plus size={12} />
                    </IconButton>
                    <IconButton
                      aria-label={`${cat.name} 분류 삭제`}
                      className="p-0.5"
                      disabled={!canDelete}
                      onClick={async () => {
                        if (!canDelete) return;
                        const ok = await confirm({
                          title: '분류 삭제',
                          message: `"${cat.name}" 분류를 삭제합니다.`,
                          confirmLabel: '삭제',
                          danger: true,
                        });
                        if (ok) onDeleteCategory(cat);
                      }}
                    >
                      <Trash2 size={12} />
                    </IconButton>
                  </div>
                </div>

                {/* 타입 목록 */}
                {types.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={cn(
                      'flex w-full items-center gap-2 px-4 py-2 text-left text-sm',
                      SELECTABLE,
                      !t.isActive && 'opacity-50',
                      selectedTypeId === t.id ? SELECTED : 'text-content',
                    )}
                    onClick={() => onSelectType(t.id)}
                  >
                    <span className="flex-1 min-w-0 truncate">{t.name}</span>
                    {t.assetCount > 0 && (
                      <Badge status="neutral" className="shrink-0">
                        {t.assetCount}
                      </Badge>
                    )}
                  </button>
                ))}

                {types.length === 0 && <div className="px-4 py-2 text-xs text-content-faint">타입 없음</div>}
              </div>
            );
          })}
      </div>

      {confirmDialog}
    </div>
  );
}
