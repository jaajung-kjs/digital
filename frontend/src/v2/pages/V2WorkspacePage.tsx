import { useState } from 'react';
import { OrgTreePanel } from '../components/OrgTreePanel';
import type { FlatOrgNode } from '../orgTreeSelectors';
import { useV2WorkingCopy } from '../store/workingCopyStore';

export default function V2WorkspacePage() {
  const [selected, setSelected] = useState<FlatOrgNode | null>(null);

  const handleSelect = (n: FlatOrgNode) => {
    setSelected(n);
    if (n.kind === 'substation') void useV2WorkingCopy.getState().load(n.id);
  };

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-64 shrink-0 border-r border-line bg-sidebar">
        <OrgTreePanel selectedId={selected?.id ?? null} onSelect={handleSelect} />
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        {selected == null && (
          <div className="p-4 text-sm text-content-muted">좌측에서 조직/변전소를 선택하세요</div>
        )}
        {selected != null && (
          <div className="p-4 text-sm text-content" data-testid="v2-selected">
            {selected.name}
          </div>
        )}
      </main>
    </div>
  );
}
