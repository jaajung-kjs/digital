import { useConfirm } from '../components/ui';
import { useCatalogMutations, useV2Catalog } from './hooks';
import { apiErrorMessage } from './apiError';
import { useV2Notice } from './store/noticeStore';
import type { V2Category } from './types';

/**
 * 분류(구조·통신·전원·공조)를 만들고 고치고 지우는 일 — **한 곳**.
 *
 * 분류는 설비 품목과 장비 품목이 **함께 쓰는 체계**다(`AssetCategory` 하나가 둘을 다
 * 담는다). 그래서 어느 화면에서 만들든 양쪽 목록에 나타나야 하고, 규칙도 하나여야 한다 —
 * 실제로 두 화면이 각자 구현하고 있었고, 그래서 한쪽만 확인을 묻고 오류 문구도 갈렸다.
 *
 * **트리가 다루는 것은 뼈대다.** 분류는 조직(본부·지사·변전소)과 같은 뼈대라, 같은 어법으로
 * 다룬다: 줄의 `⋯` 안에서 이름을 고치고 지우고, 그 아래에 하나 더 만든다. 잠깐 상자
 * (「분류 관리」)에 모아 둔 적이 있는데, 그러면 **조직 트리와 대장 트리가 서로 다른 어법**이
 * 되고 그 상자의 문이 머리줄의 정체불명 `+` 였다 — 아무도 그것을 찾지 못했다.
 *
 * 뼈대는 저장을 기다리지 않고 바로 서버로 간다(품목은 초안이다). 그래서 되돌릴 수 없는
 * 삭제는 그 자리에서 한 번 묻는다.
 */
export function useCategoryAdmin() {
  const mutations = useCatalogMutations();
  const { data: catalog } = useV2Catalog();
  const { confirm, confirmDialog } = useConfirm();

  /* 오류는 앱 공통 알림으로 — 화면마다 배너를 다시 놓지 않는다. */
  const fail = (err: unknown, fallback: string) =>
    useV2Notice.getState().showError(apiErrorMessage(err, fallback));

  /** 이 분류에 든 것 — 비어 있어야 지울 수 있다(서버도 그렇게 막는다). */
  function contentsOf(cat: V2Category): number {
    if (!catalog) return 0;
    return (
      catalog.types.filter((t) => t.categoryId === cat.id).length +
      catalog.assemblies.filter((a) => a.categoryId === cat.id).length
    );
  }

  async function add(name: string) {
    try {
      const maxOrder = Math.max(0, ...(catalog?.categories ?? []).map((c) => c.sortOrder));
      // 이름이 곧 키다 — 만든 뒤 키는 바꿀 수 없다(이름만 바뀐다).
      await mutations.createCategory.mutateAsync({ name, key: name, sortOrder: maxOrder + 1 });
    } catch (err: unknown) {
      fail(err, '분류 추가 실패');
    }
  }

  async function rename(cat: V2Category, name: string) {
    try {
      await mutations.patchCategory.mutateAsync({ id: cat.id, body: { name } });
    } catch (err: unknown) {
      fail(err, '분류 이름 변경 실패');
    }
  }

  async function remove(cat: V2Category) {
    const ok = await confirm({
      title: '분류 삭제',
      target: cat.name,
      message: '바로 반영되며 되돌릴 수 없습니다.',
      confirmLabel: '삭제',
      danger: true,
    });
    if (!ok) return;
    try {
      await mutations.deleteCategory.mutateAsync(cat.id);
    } catch (err: unknown) {
      fail(err, '분류 삭제 실패');
    }
  }

  return {
    add: (name: string) => void add(name),
    rename: (cat: V2Category, name: string) => void rename(cat, name),
    remove: (cat: V2Category) => void remove(cat),
    /** 지금 지울 수 있나 — 든 것이 있으면 서버가 거부한다. 아예 막고 왜인지 그 자리에서 말한다. */
    removeBlocked: (cat: V2Category) => {
      const inUse = contentsOf(cat);
      return inUse > 0 ? `이 분류에 ${inUse}개가 들어 있어 지울 수 없습니다` : undefined;
    },
    dialog: confirmDialog,
  };
}
