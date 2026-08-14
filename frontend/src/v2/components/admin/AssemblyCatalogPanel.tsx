/**
 * AssemblyCatalogPanel — 설비 종류 목록 + 편집
 *
 * 설비 종류는 **한 번 만들어 계속 쓰는 것**이다. 그래서 목록에서 고르고 고치고 지운다 —
 * 배치할 때 그때그때 조립하는 일회성 도구가 아니다.
 *
 * 고쳐도 **이미 놓인 설비의 구성은 그대로다**(스냅샷) — 분류만 이 종류를 계속 가리킨다.
 * 그래서 자산 종류와 달리 "쓰이는 중이면 구조 잠금" 이 없다.
 */
import { useEffect, useMemo, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { EmptyState, IconButton, useConfirm, useInlineRename, IssueReveal } from '../../../components/ui';
import { CatalogList } from './CatalogList';
import { CatalogEditorBar } from './CatalogEditorBar';
import { useCatalogMutations } from '../../hooks';
import {
  assemblyIssues, assemblyToDraft, draftToAssemblyBody, emptyAssemblyDraft,
  type AssemblyDraft,
} from '../../assemblyDraft';
import { AssemblyPanel } from './AssemblyPanel';
import type { V2Catalog, V2Category } from '../../types';
import { useReportUnsaved } from '../../unsavedGuard';
import { useV2Notice } from '../../store/noticeStore';

interface AssemblyCatalogPanelProps {
  catalog: V2Catalog;
  /* 분류는 **자산 종류와 같은 체계**(AssetCategory)다 — 관리 로직은 한 곳(페이지)에 두고
     두 탭이 같은 것을 부른다. 어느 탭에서 만들든 양쪽 목록에 나타난다. */
  onRenameCategory: (category: V2Category, newName: string) => void;
  onDeleteCategory: (category: V2Category) => void;
  onAddCategory: () => void;
}

export function AssemblyCatalogPanel({
  catalog, onRenameCategory, onDeleteCategory, onAddCategory,
}: AssemblyCatalogPanelProps) {
  const { confirm, confirmDialog } = useConfirm();
  const m = useCatalogMutations();

  /* 첫 항목을 열어 둔다 — 케이블 탭이 이미 그렇게 하고 있었다. 기본 탭이 설비 종류라,
     대장을 열면 빈 화면이 먼저 나오고 탭을 옮기면 갑자기 내용이 차 있어 어긋나 보였다. */
  const [selectedId, setSelectedId] = useState<string | null>(catalog.assemblies[0]?.id ?? null);
  const [draft, setDraft] = useState<AssemblyDraft | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  /* 제자리 이름 바꾸기 — 세 탭이 같은 규칙을 쓴다(`useInlineRename`). */
  const rename = useInlineRename((id, name) => {
    const cat = catalog.categories.find((c) => c.id === id);
    if (cat) onRenameCategory(cat, name);
  });

  const original = useMemo(
    () => catalog.assemblies.find((a) => a.id === selectedId) ?? null,
    [catalog.assemblies, selectedId],
  );

  // 고른 설비 종류가 바뀌면 초안을 새로 뜬다 — 남은 편집이 다른 설비 종류에 새어들지 않게.
  useEffect(() => {
    setSaveError(null);
    if (selectedId === null) return;
    setDraft(original ? assemblyToDraft(original) : null);
  }, [selectedId, original]);

  const issues = draft ? assemblyIssues(draft, catalog.types) : [];
  const dirty = draft != null && JSON.stringify(draft) !== JSON.stringify(original ? assemblyToDraft(original) : emptyAssemblyDraft());
  /* 탭을 옮기면 이 패널이 통째로 사라진다 — 떠나보내는 쪽(페이지)이 물을 수 있게 알린다. */
  useReportUnsaved(dirty);

  /** 다른 설비 종류로 옮기기 전에 묻는다 — 자산 종류 탭과 같은 규칙. */
  async function leaveIfConfirmed(): Promise<boolean> {
    if (!dirty) return true;
    return confirm({
      title: '저장하지 않은 변경',
      target: null,
      message: '편집 내용이 사라집니다. 이동할까요?',
      confirmLabel: '이동',
      danger: true,
    });
  }
  const isSaving = m.createAssembly.isPending || m.updateAssembly.isPending;
  /** 저장이 막혔을 때 폼 전체의 검증 문구를 켠다 — 평소에는 손댄 칸만 말한다. */
  const [revealIssues, setRevealIssues] = useState(false);
  useEffect(() => setRevealIssues(false), [selectedId]);

  async function handleSave() {
    if (!draft) return;
    if (issues.length > 0) {
      /* 몇 건인지만 말하고 어느 칸인지 안 짚으면 폼을 처음부터 훑어야 한다. */
      setRevealIssues(true);
      setSaveError(`입력 오류가 있습니다 (${issues.length}건) — 붉게 표시된 칸을 확인하세요`);
      return;
    }
    setSaveError(null);
    try {
      const body = draftToAssemblyBody(draft);
      if (selectedId === null) {
        const created = await m.createAssembly.mutateAsync(body);
        setSelectedId(created.id);
        useV2Notice.getState().showSuccess(`'${draft.name}' 설비 종류를 만들었습니다`);
      } else {
        await m.updateAssembly.mutateAsync({ id: selectedId, body });
        useV2Notice.getState().showSuccess(`'${draft.name}' 을 저장했습니다`);
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '저장하지 못했습니다');
    }
  }

  async function handleDelete() {
    if (selectedId === null) return;
    const ok = await confirm({
      title: '설비 종류 삭제',
      target: draft?.name ?? '',
      // 이미 놓인 설비는 스냅샷이라 그대로 남는다 — 그 사실을 미리 말해 준다.
      message: '이미 배치된 설비는 그대로 남습니다. 앞으로 이 설비 종류으로 새로 놓을 수만 없게 됩니다.',
      confirmLabel: '삭제',
      danger: true,
    });
    if (!ok) return;
    await m.deleteAssembly.mutateAsync(selectedId);
    setSelectedId(null);
    setDraft(null);
  }

  /* 목록은 **분류로 묶는다** — 자산 종류 탭과 같은 어법이다. 예전에는 설비 종류만 평면
     목록이라, 같은 2단 구조인데 탭마다 다른 모양으로 보였다. */
  const listGroups = useMemo(
    () =>
      catalog.categories.map((cat) => {
        /* 빈 분류만 지울 수 있다 — 자산 종류 탭과 같은 규칙이다(같은 분류를 지운다). */
        const inUse =
          catalog.assemblies.some((a) => a.categoryId === cat.id) ||
          catalog.types.some((t) => t.categoryId === cat.id);
        return {
        key: cat.id,
        label:
          rename.isEditing(cat.id) ? (
            rename.field(cat.id, cat.name, `${cat.name} 이름 편집`)
          ) : (
            cat.name
          ),
        labelText: cat.name,
        items: catalog.assemblies
          .filter((a) => a.categoryId === cat.id)
          .map((a) => ({ id: a.id, name: a.name, hint: String(a.items.length), hintTitle: `구성 부품 ${a.items.length}개` })),
        actions: (
          <>
            <IconButton
              aria-label={`${cat.name} 이름 변경`}
              size="sm"
              onClick={() => rename.start(cat.id, cat.name)}
            >
              <Pencil size={12} />
            </IconButton>
            {/* 빈 분류만 지울 수 있다 — 자산 종류 탭과 같은 규칙이다(같은 분류를 지운다). */}
            <IconButton
              aria-label={`${cat.name} 분류 삭제`}
              size="sm"
              disabled={inUse}
              disabledReason={inUse ? '이 분류에 들어 있는 것이 있어 지울 수 없습니다' : undefined}
              onClick={() => onDeleteCategory(cat)}
            >
              <Trash2 size={12} />
            </IconButton>
          </>
        ),
        };
      }),
    [catalog.assemblies, catalog.categories, catalog.types, rename, onDeleteCategory],
  );

  return (
    <div className="flex min-h-0 flex-1">
      <CatalogList
        title="설비 종류"
        groups={listGroups}
        selectedId={selectedId}
        onSelect={(id) => void (async () => { if (await leaveIfConfirmed()) setSelectedId(id); })()}
        onAdd={() => void (async () => {
          if (!(await leaveIfConfirmed())) return;
          setSelectedId(null);
          setDraft(emptyAssemblyDraft());
        })()}
        addLabel="설비 종류 추가"
        onAddGroup={onAddCategory}
        emptyText="설비 종류가 없습니다"
      />

      <div className="flex min-h-0 flex-1 flex-col">
        {draft == null ? (
          <EmptyState
            title="선택된 설비 종류가 없습니다"
            description="좌측 목록에서 고르거나, + 버튼으로 새로 만드세요. 설비 종류는 도면에 놓이고 현황에 집계되는 단위입니다."
          />
        ) : (
          <>
            <CatalogEditorBar
              title={selectedId == null ? '새 설비 종류' : (original?.name ?? '')}
              dirty={dirty}
              saving={isSaving}
              issueCount={issues.length}
              showIssues={revealIssues}
              error={saveError}
              onDismissError={() => setSaveError(null)}
              onDelete={selectedId != null ? () => void handleDelete() : undefined}
              deleteLabel="종류 삭제"
              onCancel={() => setDraft(original ? assemblyToDraft(original) : emptyAssemblyDraft())}
              onSave={() => void handleSave()}
            />

            {/* 스크롤은 **패널 안쪽**이 쥔다 — 바깥에서 감싸면 캔버스가 남는 자리를 못 쓰고,
                오른쪽 상세만 길어져도 캔버스까지 함께 밀려 올라간다(평면도와 같은 규칙). */}
            <div className="min-h-0 flex-1 overflow-hidden">
              <IssueReveal.Provider value={revealIssues}>
                <AssemblyPanel draft={draft} onChange={setDraft} catalog={catalog} issues={issues} />
              </IssueReveal.Provider>
            </div>
          </>
        )}
      </div>
      {confirmDialog}
    </div>
  );
}
