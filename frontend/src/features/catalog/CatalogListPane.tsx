import { useState, useRef } from 'react';
import { Badge, Button } from '../../components/ui';
import { SectionEmpty } from '../assets/components/detail/SectionShell';

export interface CatalogListGroup { id: string; name: string; accent?: string | null }
export interface CatalogListItem { id: string; parentId: string | null; name: string; system?: boolean }

export function CatalogListPane({
  groups, items, selectedId, onSelect, onAddGroup, onAddItem, addGroupLabel, addItemLabel, onReorder,
}: {
  groups: CatalogListGroup[]; items: CatalogListItem[]; selectedId: string | null;
  onSelect: (kind: 'group' | 'item', id: string) => void;
  onAddGroup: () => void; onAddItem: (groupId: string) => void;
  addGroupLabel: string; addItemLabel: string;
  onReorder: (kind: 'group' | 'item', parentId: string | null, orderedIds: string[]) => void;
}) {
  const [q, setQ] = useState('');
  const drag = useRef<{ kind: 'group' | 'item'; parentId: string | null; id: string } | null>(null);
  const ql = q.trim().toLowerCase();
  const match = (n: string) => !ql || n.toLowerCase().includes(ql);

  const rowCls = (id: string) =>
    `w-full text-left text-sm px-2 py-1 rounded transition-colors ${
      selectedId === id ? 'bg-info-bg text-primary' : 'text-content hover:bg-surface-2'
    }`;

  // sibling 내 드래그 재배치: over 위에 놓으면 그 앞으로.
  const reorder = (kind: 'group' | 'item', parentId: string | null, overId: string) => {
    const d = drag.current;
    if (!d || d.kind !== kind || d.parentId !== parentId || d.id === overId) return;
    const sibs = kind === 'group' ? groups.map((g) => g.id) : items.filter((i) => i.parentId === parentId).map((i) => i.id);
    const from = sibs.indexOf(d.id); const to = sibs.indexOf(overId);
    if (from < 0 || to < 0) return;
    const next = [...sibs]; next.splice(from, 1); next.splice(to, 0, d.id);
    onReorder(kind, parentId, next);
  };

  const anyMatch = groups.some((g) => match(g.name)) || items.some((i) => match(i.name));

  return (
    <div className="w-80 shrink-0 border-r border-line flex flex-col min-h-0">
      <div className="p-2 space-y-2 border-b border-line">
        <input
          aria-label="검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="검색…"
          className="w-full text-sm px-2 py-1 rounded bg-surface border border-line focus:border-primary focus:outline-none"
        />
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={onAddGroup}>{addGroupLabel}</Button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-3">
        {!anyMatch && <SectionEmpty>결과가 없습니다.</SectionEmpty>}
        {groups.map((g) => {
          const leaves = items.filter((i) => i.parentId === g.id && match(i.name));
          if (ql && leaves.length === 0 && !match(g.name)) return null;
          return (
            <div key={g.id}>
              <div
                draggable
                onDragStart={() => (drag.current = { kind: 'group', parentId: null, id: g.id })}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => reorder('group', null, g.id)}
                className="flex items-center gap-2"
              >
                <button type="button" className={`flex-1 min-w-0 truncate font-semibold ${rowCls(g.id)}`} onClick={() => onSelect('group', g.id)}>
                  {g.accent && <span className="inline-block w-3 h-3 rounded border border-line align-middle mr-1" style={{ backgroundColor: g.accent }} />}
                  {g.name}
                </button>
              </div>
              <div className="mt-1 ml-2 space-y-0.5">
                {leaves.map((it) => (
                  <div
                    key={it.id}
                    draggable
                    onDragStart={() => (drag.current = { kind: 'item', parentId: g.id, id: it.id })}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => reorder('item', g.id, it.id)}
                    className="flex items-center gap-1"
                  >
                    <button type="button" className={`flex-1 min-w-0 truncate ${rowCls(it.id)}`} onClick={() => onSelect('item', it.id)}>
                      {it.name}
                    </button>
                    {it.system && <Badge>시스템</Badge>}
                  </div>
                ))}
                <Button variant="secondary" size="sm" onClick={() => onAddItem(g.id)}>{addItemLabel}</Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
