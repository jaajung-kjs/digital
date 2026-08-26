/**
 * TypeListPanel — 「장비 품목」 탭의 목록.
 *
 * 판은 세 탭이 공유하는 `CatalogList` 가 그린다 — 여기서는 **이 대장에만 있는 것**만 얹는다:
 * 분류를 새로 만들고, 이름을 바꾸고, 비어 있으면 지우는 일. 설비·케이블 탭은 분류를 손대지
 * 않으므로 그 자리에 아무것도 없다.
 *
 * 예전에는 이 파일이 목록 전체(머리줄·묶음·행·선택 표시)를 따로 그렸다. 그래서 설비 품목
 * 목록과 미묘하게 달랐고(폭 64 vs 56, 분류 묶음 유무), 검색은 어느 쪽에도 없었다.
 */
import { useMemo } from 'react';
import { TreePanel, type TreeKind, type TreeNode } from '../../../components/ui';
import { NEW_ID } from '../../catalogDraft';
import { useReorder } from '../../hooks';
import type { V2Catalog, V2Category } from '../../types';

interface TypeListPanelProps {
  catalog: V2Catalog;
  selectedTypeId: string | null;
  /**
   * 아직 저장되지 않은 「만드는 중인 것」 — 목록에도 한 줄로 선다.
   *
   * 이름을 치는 대로 그 줄이 바뀐다: 사용자는 **어느 분류에 무엇이 생기는 중인지**를
   * 캔버스가 아니라 목록에서 본다.
   */
  newDraft?: { categoryId: string; name: string } | null;
  onSelectType: (id: string | null) => void;
  /** 새 장비 품목 — 분류 줄의 `+` 로 만들면 그 분류로 시작한다. */
  onNewType: (categoryId?: string) => void;
  /**
   * 분류를 다루는 손 — `useCategoryAdmin` 이 준다(두 대장이 **같은 것**을 받는다).
   *
   * 여기서 다시 적지 않는 이유: 분류는 두 화면이 함께 쓰는 체계라, 한쪽에서만 고쳐지면
   * 그 순간 두 화면의 규칙이 갈린다.
   */
  category: {
    add: (name: string) => void;
    rename: (cat: V2Category, name: string) => void;
    remove: (cat: V2Category) => void;
    removeBlocked: (cat: V2Category) => string | undefined;
  };
}

/**
 * 층마다 무엇이 서는가 — 문구는 전부 여기서 나온다(「새 분류」·「새 장비 품목」).
 *
 * **뼈대는 트리에서, 내용은 편집기에서.** 분류는 이름만 있으면 서므로 그 자리에서 만들고,
 * 품목은 포트·공량을 채워야 하므로 오른쪽 초안을 연다(`create: 'editor'`).
 */
const KINDS = [
  { label: '분류', create: 'inline', rename: true, remove: true },
  { label: '장비 품목', create: 'editor' },
] as const satisfies ReadonlyArray<TreeKind>;

export function TypeListPanel({
  catalog,
  selectedTypeId,
  newDraft,
  onSelectType,
  onNewType,
  category,
}: TypeListPanelProps) {
  const reorder = useReorder();
  /**
   * 분류 → 종류 2단을 **한 줄짜리 목록**으로 편다 — 트리는 층을 `depth` 로만 안다.
   *
   * 분류 줄은 고를 것이 없다(`selectable: false`) — 눌러서 접고 펼 뿐이다. 손이 닿으면
   * 그 분류를 다루는 것이 드러난다: 그 안에 만들기 · 이름 변경 · 삭제.
   */
  /** 트리가 돌려준 줄 → 그 분류. 트리는 id 만 알고, 무엇인지는 여기가 안다. */
  const byId = (id: string) => catalog.categories.find((c) => c.id === id)!;

  const nodes = useMemo<TreeNode[]>(() => {
    const out: TreeNode[] = [];
    for (const cat of catalog.categories) {
      const items = catalog.types.filter((t) => t.categoryId === cat.id);
      out.push({
        id: cat.id,
        label: cat.name,
        text: cat.name,
        depth: 0,
        selectable: false,
        removeBlocked: category.removeBlocked(cat),
      });
      for (const t of items) out.push({ id: t.id, label: t.name, text: t.name, depth: 1 });
      /* 만드는 중인 줄은 **그 분류 안**에 선다. 이름을 아직 안 지었으면 무엇을 만드는
         중인지 흐린 글씨로 말한다 — 빈 줄은 고장 난 것처럼 보인다. */
      if (newDraft && newDraft.categoryId === cat.id) {
        const typed = newDraft.name.trim();
        out.push({
          id: NEW_ID,
          label: typed || <span className="text-content-faint">새 장비 품목</span>,
          text: typed,
          depth: 1,
        });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog.categories, catalog.types, newDraft, category]);

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-sidebar">
      <TreePanel
        title="장비 품목"
        nodes={nodes}
        selectedId={selectedTypeId}
        onSelect={(n) => onSelectType(n?.id ?? null)}
        kinds={KINDS}
        onCreate={({ level, parentId, name }) => (level === 0 ? category.add(name!) : onNewType(parentId!))}
        onRename={(node, name) => category.rename(byId(node.id), name)}
        onRemove={(node) => category.remove(byId(node.id))}
        /* 순서는 조직 트리와 **같은 문**으로 저장된다 — 층에 따라 무엇의 순서인지만 다르다. */
        onReorder={({ node, order }) =>
          reorder.mutateAsync({ kind: node.depth === 0 ? 'categories' : 'types', ids: order }).then(() => undefined)
        }
        emptyText="장비 품목이 없습니다"
        escapes
      />
    </aside>
  );
}
