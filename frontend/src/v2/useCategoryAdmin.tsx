import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, ErrorStrip, IconButton, Input, isCommitKey, Modal, useConfirm } from '../components/ui';
import { InlineEditCell } from './components/InlineEditCell';
import { useCatalogMutations, useV2Catalog } from './hooks';
import { apiErrorMessage } from './apiError';
import type { V2Category } from './types';

/**
 * 분류(구조·통신·전원·공조)를 만들고 고치고 지우는 일 — **한 곳, 한 상자**.
 *
 * 분류는 설비 품목과 장비 품목이 **함께 쓰는 체계**다(`AssetCategory` 하나가 둘을 다
 * 담는다). 그래서 어느 화면에서 만들든 양쪽 목록에 나타나야 하고, 규칙도 하나여야 한다 —
 * 실제로 두 화면이 각자 구현하고 있었다(장비 품목 화면은 이 훅을 쓰지 않고 같은 것을
 * 다시 적었다).
 *
 * **왜 상자로 떼어냈나.** 분류를 고치는 일은 **누르는 즉시 서버로 간다**. 품목은 초안에
 * 담겼다가 저장 단추로 간다. 그 둘이 한 목록 안에 나란히 있으면(분류 줄의 연필·휴지통과
 * 그 아래 품목 줄) 한 화면에서 규칙이 둘로 갈린다 — 사용자는 어느 것이 저장을 기다리는지
 * 외워야 한다. 그래서 왼쪽 목록은 **고르는 곳**만 두고, 즉시 반영되는 일은 이 상자 안으로
 * 모아 그렇다고 적는다.
 */
export function useCategoryAdmin() {
  const mutations = useCatalogMutations();
  const { data: catalog } = useV2Catalog();
  const { confirm, confirmDialog } = useConfirm();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  const categories = catalog?.categories ?? [];

  /** 이 분류에 든 것 — 비어 있어야 지울 수 있다(서버도 그렇게 막는다). */
  function contentsOf(cat: V2Category): number {
    if (!catalog) return 0;
    return (
      catalog.types.filter((t) => t.categoryId === cat.id).length +
      catalog.assemblies.filter((a) => a.categoryId === cat.id).length
    );
  }

  async function rename(cat: V2Category, raw: string) {
    const name = raw.trim();
    if (!name || name === cat.name) return;
    setError(null);
    try {
      await mutations.patchCategory.mutateAsync({ id: cat.id, body: { name } });
    } catch (err: unknown) {
      setError(apiErrorMessage(err, '분류 이름 변경 실패'));
    }
  }

  async function remove(cat: V2Category) {
    /* 되돌릴 수 없다 — 저장을 기다리지 않고 바로 간다. 그래서 여기서 한 번 묻는다. */
    if (!(await confirm({ title: '분류 삭제', target: cat.name, message: '바로 반영되며 되돌릴 수 없습니다.', confirmLabel: '삭제', danger: true }))) return;
    setError(null);
    try {
      await mutations.deleteCategory.mutateAsync(cat.id);
    } catch (err: unknown) {
      setError(apiErrorMessage(err, '분류 삭제 실패'));
    }
  }

  async function add() {
    const name = newName.trim();
    if (!name) return;
    setError(null);
    try {
      const maxOrder = Math.max(0, ...categories.map((c) => c.sortOrder));
      await mutations.createCategory.mutateAsync({ name, key: name, sortOrder: maxOrder + 1 });
      setNewName(''); // 성공했을 때만 비운다 — 실패하면 친 이름이 남아 다시 누를 수 있다
    } catch (err: unknown) {
      setError(apiErrorMessage(err, '분류 추가 실패'));
    }
  }

  const dialog = (
    <>
      <Modal
        open={open}
        onClose={() => { setOpen(false); setError(null); setNewName(''); }}
        title="분류 관리"
        size="md"
      >
        {/* 이 상자의 규칙을 먼저 말한다 — 품목과 달리 저장을 기다리지 않는다. */}
        <p className="mb-3 text-xs text-content-muted">
          설비·장비 품목을 묶는 상위 분류입니다. <b className="text-content">여기서 한 일은 바로 반영됩니다</b>(품목처럼 저장을 누르지 않습니다).
        </p>

        <ErrorStrip message={error} onDismiss={() => setError(null)} className="mb-2" />

        <ul className="divide-y divide-line rounded border border-line">
          {categories.map((cat) => {
            const inUse = contentsOf(cat);
            return (
              <li key={cat.id} className="flex items-center gap-2 px-2 py-1">
                <div className="min-w-0 flex-1">
                  <InlineEditCell value={cat.name} onCommit={(v) => void rename(cat, v)} label={`${cat.name} 이름`} />
                </div>
                <span className="shrink-0 text-xs text-content-faint">{inUse > 0 ? `${inUse}개` : '비어 있음'}</span>
                <IconButton
                  aria-label={`${cat.name} 분류 삭제`}
                  size="sm"
                  disabled={inUse > 0}
                  disabledReason={inUse > 0 ? `이 분류에 ${inUse}개가 들어 있어 지울 수 없습니다` : undefined}
                  onClick={() => void remove(cat)}
                >
                  <Trash2 size={14} />
                </IconButton>
              </li>
            );
          })}
        </ul>

        <div className="mt-3 flex items-end gap-2">
          <div className="flex-1">
            <Input
              value={newName}
              size="sm"
              placeholder="예: 계측"
              aria-label="새 분류 이름"
              onChange={(e) => setNewName(e.currentTarget.value)}
              onKeyDown={(e) => { if (isCommitKey(e)) void add(); }}
            />
          </div>
          <Button size="sm" disabled={!newName.trim() || mutations.createCategory.isPending} onClick={() => void add()}>
            추가
          </Button>
        </div>
        {/* 이름이 곧 키다 — 만들기 전에 알아야 한다(만든 뒤에는 못 바꾸는 것이 있다). */}
        <p className="mt-1 text-xs text-content-faint">이름이 곧 키가 되므로 만든 뒤 키는 바꿀 수 없습니다.</p>
      </Modal>
      {confirmDialog}
    </>
  );

  return {
    /** 목록의 「분류 관리」 단추가 부른다 — 문은 이것 하나다. */
    open: () => { setError(null); setOpen(true); },
    dialog,
  };
}
