/**
 * TypeListPanel — 좌측 280px 패널
 * - 분류(카테고리)별 그룹 타입 리스트
 * - 타입명 + assetCount 배지 + 비활성 흐림
 * - 분류 행 우측: 연필(이름 변경), +(타입 추가), 휴지통(빈 분류만)
 * - 하단 분류 추가 버튼
 */
import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, IconButton } from '../../../components/ui';
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
    <div className="flex h-full flex-col border-r border-line bg-surface" style={{ width: 280 }}>
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
                    <input
                      className="flex-1 min-w-0 rounded border border-primary bg-surface px-1 py-0.5 text-xs text-content focus:outline-none"
                      value={editingName}
                      autoFocus
                      onChange={(e) => setEditingName(e.currentTarget.value)}
                      onBlur={() => commitRename(cat)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.currentTarget.blur(); }
                        if (e.key === 'Escape') cancelRename();
                      }}
                    />
                  ) : (
                    <span className="flex-1 min-w-0 truncate text-xs font-semibold text-content-muted">
                      {cat.name}
                    </span>
                  )}
                  <div className="ml-auto flex shrink-0 items-center gap-0.5">
                    <IconButton
                      aria-label={`${cat.name} 이름 변경`}
                      className="p-0.5"
                      onClick={() => startRename(cat)}
                    >
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
                      onClick={() => {
                        if (!canDelete) return;
                        if (window.confirm(`"${cat.name}" 분류를 삭제할까요?`)) {
                          onDeleteCategory(cat);
                        }
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
                    className={[
                      'flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors',
                      !t.isActive && 'opacity-50',
                      selectedTypeId === t.id
                        ? 'bg-info-bg text-primary font-medium'
                        : 'text-content hover:bg-surface-2',
                    ]
                      .filter(Boolean)
                      .join(' ')}
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

                {types.length === 0 && (
                  <div className="px-4 py-2 text-xs text-content-faint">타입 없음</div>
                )}
              </div>
            );
          })}
      </div>

      {/* 분류 추가 */}
      <div className="shrink-0 border-t border-line p-2">
        <Button variant="ghost" size="sm" className="w-full justify-start" leftIcon={<Plus size={14} />} onClick={onAddCategory}>
          분류 추가
        </Button>
      </div>
    </div>
  );
}
