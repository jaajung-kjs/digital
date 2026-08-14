import { useState } from 'react';
import { PromptModal } from '../components/ui';
import { useCatalogMutations } from './hooks';
import { apiErrorMessage } from './apiError';
import type { V2Category } from './types';

/**
 * 분류(구조·통신·전원·공조)를 만들고 고치고 지우는 일 — **한 곳**.
 *
 * 분류는 설비 종류와 자산 종류가 **함께 쓰는 체계**다(`AssetCategory` 하나가 둘을 다
 * 담는다). 그래서 어느 화면에서 만들든 양쪽 목록에 나타나야 하고, 규칙도 하나여야 한다 —
 * 두 화면이 각자 구현하면 오류 문구·성공 처리·정렬 순서가 갈린다.
 */
export function useCategoryAdmin() {
  const mutations = useCatalogMutations();
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  async function rename(cat: V2Category, newName: string) {
    setError(null);
    try {
      await mutations.patchCategory.mutateAsync({ id: cat.id, body: { name: newName } });
    } catch (err: unknown) {
      setError(apiErrorMessage(err, '분류 이름 변경 실패'));
    }
  }

  async function remove(cat: V2Category) {
    setError(null);
    try {
      await mutations.deleteCategory.mutateAsync(cat.id);
    } catch (err: unknown) {
      setError(apiErrorMessage(err, '분류 삭제 실패'));
    }
  }

  /** 분류 추가 모달 — 화면이 이것을 그려야 열린다. */
  function modal(existing: V2Category[]) {
    return (
      <PromptModal
        open={addOpen}
        title="분류 추가"
        hint="자산·설비 종류를 묶는 상위 분류입니다. 이름이 곧 키가 되므로 나중에 바꿀 수 없습니다."
        label="분류 이름"
        placeholder="예: 계측"
        busy={mutations.createCategory.isPending}
        error={error}
        onConfirm={async (name) => {
          setError(null);
          const maxOrder = Math.max(0, ...existing.map((c) => c.sortOrder));
          try {
            await mutations.createCategory.mutateAsync({ name, key: name, sortOrder: maxOrder + 1 });
            // 성공했을 때만 닫는다 — 실패하면 오류를 모달 안에서 보여준다.
            setAddOpen(false);
          } catch (err: unknown) {
            setError(apiErrorMessage(err, '분류 추가 실패'));
          }
        }}
        onClose={() => setAddOpen(false)}
      />
    );
  }

  return {
    error,
    clearError: () => setError(null),
    rename,
    remove,
    openAdd: () => {
      setError(null);
      setAddOpen(true);
    },
    modal,
  };
}
