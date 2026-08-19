/**
 * AssemblyPanel — 설비 품목 편집
 *
 * 장비를 조립해 **한 설비**를 만든다. 격자 크기를 정하고 그 위 아무 자리에나 장비를 놓는다.
 *
 * 예전에는 「도면에 놓이는 것(랙)」을 먼저 고르고 그 타입이 선언한 자리에 넣어야 했다.
 * 그래서 담기 위한 랙이라는 자산이 필요했고, 자리는 그 타입이 정한 대로만 쓸 수 있었다.
 * 이제 자리는 설비 품목 자신의 것이라 랙이라는 층이 통째로 사라졌다 — 랙은 이 설비 품목의 겉모습이다.
 *
 * 자리는 상세 패널과 **같은 격자**(`AssemblyGrid`)를 쓴다 — 설비 품목에서 짠 모습이 놓고 나면
 * 달라 보이면 짜는 뜻이 없다.
 */
import { useMemo, useRef, useState } from 'react';
import { occupantsOf, validateGridPlacement, ASSEMBLY_GRID } from '@twin/core';
import { LaborSpecForm } from './LaborSpecForm';
import {
  Button, DetailCard, DetailCardHeader, DetailRow, Input, Select,
  useDismissOnOutside,
  EMPTY,
} from '../../../components/ui';
import { AssemblyGrid } from '../AssemblyGrid';
import { PortsPreview } from './PortsPreview';
import type { GridPlacement } from '../../gridDrag';
import { newItemId, type AssemblyDraft, type AssemblyDraftItem, type AssemblyIssue } from '../../assemblyDraft';
import type { V2Catalog } from '../../types';

interface AssemblyPanelProps {
  draft: AssemblyDraft;
  onChange: (next: AssemblyDraft) => void;
  catalog: V2Catalog;
  issues: AssemblyIssue[];
}

const issueOf = (issues: AssemblyIssue[], path: AssemblyIssue['path']) =>
  issues.find((i) => i.path === path)?.message;

export function AssemblyPanel({ draft, onChange, catalog, issues }: AssemblyPanelProps) {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  /* 바깥을 누르면 풀린다 — 앱 공통 규칙(`useDismissOnOutside`). 「안」은 캔버스와 그 상세다:
     고른 장비의 이름을 고치다 선택이 풀리면 안 된다. */
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const asideRef = useRef<HTMLElement | null>(null);
  useDismissOnOutside(selectedItemId != null, [canvasRef, asideRef], () => setSelectedItemId(null));

  const typeById = useMemo(() => new Map(catalog.types.map((t) => [t.id, t])), [catalog.types]);

  /**
   * 끌기가 끝나면 **그 자리에 장비가 선다** — 임시 자리표가 아니라 진짜다.
   *
   * 한때는 자리만 잡아 두고 품목을 고른 뒤에야 만들었다. 그러면 그 사이가 어중간해진다:
   * 다른 장비를 한 번 누르기만 해도 잡아 둔 자리가 사라지고, 오른쪽에는 품목 하나만 묻는
   * 화면이 떠서 이름도 포트도 볼 수 없다. 놓은 순간 판에 서고, 고치는 자리는 늘 같다.
   *
   * 품목을 안 고른 장비는 저장이 거절된다 — 그 말은 판 위 오류 줄이 한다.
   */
  function addPartAt(at: { col: number; row: number; colSpan?: number; rowSpan?: number }) {
    const id = newItemId();
    onChange({
      ...draft,
      items: [...draft.items, {
        id, typeId: '', name: '',
        col: at.col, row: at.row, colSpan: at.colSpan ?? 1, rowSpan: at.rowSpan ?? 1,
      }],
    });
    setSelectedItemId(id);
  }

  function updateItem(itemId: string, patch: Partial<AssemblyDraftItem>) {
    onChange({ ...draft, items: draft.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) });
  }

  function removePart(itemId: string) {
    onChange({ ...draft, items: draft.items.filter((i) => i.id !== itemId) });
    setSelectedItemId(null);
  }

  /**
   * 이 자리에 놓을 수 있는가 — 판정은 core 가 한다(격자 안·겹침).
   *
   * 화면이 규칙을 다시 쓰면 설비 품목에서는 놓이는데 실제 배치에서 튕기는 조립을 만들 수 있다.
   */
  function canPlace(movingId: string, at: GridPlacement): boolean {
    return validateGridPlacement({
      grid: ASSEMBLY_GRID,
      ...at,
      occupants: occupantsOf(draft.items, movingId),
    }) === null;
  }

  const selected = draft.items.find((i) => i.id === selectedItemId) ?? null;

  return (
    /* **평면도의 어법**: 왼쪽은 캔버스, 오른쪽은 상세 패널.
       도면에서 자산을 클릭하면 오른쪽 패널이 **제자리에서** 바뀐다 — 카드가 아래로 붙지도,
       화면이 스크롤되지도 않는다. 구성 편집도 같은 일을 하므로 같은 판을 쓴다.
       예전에는 폼 넷을 왼쪽에 쌓고 격자 아래에 카드를 두 장 더 붙였다. 그래서 이름 한 줄을
       보려고 카드가 한 장 생기고, 그 카드는 클릭 지점에서 멀어 스크롤로 끌어와야 했다. */
    <div className="flex h-full min-h-0 w-full gap-3 p-4">
      {/* 캔버스 — 남는 자리를 다 쓴다. 격자 상자의 키는 못 박혀 있어(`GRID_BOX_H`)
          1×1 이든 10×20 이든 같은 자리를 차지한다. */}
      <div ref={canvasRef} className="flex min-w-0 flex-1 flex-col">
        <DetailCard className="flex min-h-0 flex-1 flex-col">
          {/* 「몇 칸 중 몇 칸」은 적지 않는다 — 격자는 배치용 도화지라 쓴 칸 수가 이 설비 품목에
              대해 말해 주는 것이 없다(상세 패널 구성 탭과 같은 판단). */}
          {/* 구성의 흠(품목 미지정·겹침)은 **여기서 말하지 않는다.** 줄이 떴다 사라지며 판
              높이를 흔들어, 장비를 놓는 동안 칸이 위아래로 움직였다. 막는 일은 저장이 한다
              (편집 바가 흠의 수를 세어 잠근다) — 두 번 말할 필요가 없다. */}
          <DetailCardHeader title="구성" />
          <AssemblyGrid
            grid={ASSEMBLY_GRID}
            fill
            items={draft.items}
            selectedId={selectedItemId}
            /* 같은 것을 다시 누르면 풀린다 — 상세 패널·포트 탭과 같은 규칙. */
            onSelect={(part) => setSelectedItemId(selectedItemId === part.id ? null : part.id)}
            onDeselect={() => setSelectedItemId(null)}
            /* 초안이라 저장 전이다 — 묻지 않는다(취소로 통째로 되돌릴 수 있다). */
            onRemove={(part) => removePart(part.id)}
            /* 품목 이름은 **이름과 다를 때만** 적는다 — 갓 넣은 장비는 이름이 곧 품목 이름이라
               같은 말이 칸 안에 두 번 섰다(「권역망전…」 아래 다시 「권역망전송장치」). */
            trailing={(part) => {
              const typeName = typeById.get(part.typeId)?.name;
              if (!typeName) return <span className="shrink-0 text-xs text-content-faint">{EMPTY}</span>;
              return typeName === part.name ? null : (
                <span className="shrink-0 text-xs text-content-faint">{typeName}</span>
              );
            }}
            onAddAtCell={addPartAt}
            canPlace={canPlace}
            onMove={updateItem}
          />
        </DetailCard>
      </div>

      {/* 상세 — **한 자리에서 문맥만 바뀐다.** 아무것도 안 골랐으면 설비 자신, 장비를
          골랐으면 그 장비. 상세 패널과 같은 폭(384px)이라 두 화면이 같은 판으로 읽힌다. */}
      <aside ref={asideRef} className="flex w-96 shrink-0 flex-col gap-3 overflow-y-auto">
        {selected ? (
          <>
            <DetailCard>
              <DetailCardHeader
                title={selected.name || '새 장비'}
                actions={
                  <Button variant="ghost" size="sm" onClick={() => setSelectedItemId(null)}>
                    설비 정보
                  </Button>
                }
              />
              {/* **품목을 여기서 고른다.** 예전에는 읽기만 하는 배지였고, 고르는 일은 별도
                  상자가 맡았다 — 잘못 고른 장비를 바로잡는 길이 「빼고 다시 넣기」뿐이었다.
                  이름을 아직 안 적었으면 품목 이름을 그대로 쓴다(대개 그게 맞는 이름이다). */}
              <DetailRow label="품목" required>
                <Select
                  aria-label="장비 품목"
                  value={selected.typeId}
                  onChange={(e) => {
                    const next = typeById.get(e.currentTarget.value);
                    if (!next) return;
                    const keepName = selected.name && selected.name !== typeById.get(selected.typeId)?.name;
                    updateItem(selected.id, { typeId: next.id, name: keepName ? selected.name : next.name });
                  }}
                >
                  <option value="">— 품목 선택 —</option>
                  {catalog.types.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </Select>
              </DetailRow>
              <DetailRow label="이름">
                <Input
                  aria-label="장비 이름"
                  value={selected.name}
                  onChange={(e) => updateItem(selected.id, { name: e.currentTarget.value })}
                />
              </DetailRow>
            </DetailCard>

            {/* 넣기 전에 「이걸 넣으면 포트가 뭐가 생기나」를 여기서 본다.
                카드는 남는 자리를 다 쓴다 — 포트가 둘이든 스물다섯이든 같은 크기여야 장비를
                옮겨 다닐 때 화면이 출렁이지 않는다. 넘치면 카드 안에서 스크롤한다. */}
            <PortsPreview
              fill
              ports={typeById.get(selected.typeId)?.portTemplates ?? []}
              title="포트"
              empty="이 장비 품목에는 포트가 선언돼 있지 않습니다."
            />
          </>
        ) : (
          <>
            <DetailCard>
              <DetailCardHeader title="기본정보" />
              {/* 키는 묻지 않는다 — 시드·마이그레이션이 가리키는 참조용 식별자이지 현장에서
                  부르는 이름이 아니다. 새로 만들 때는 서버가 붙인다. */}
              <DetailRow label="이름" required issue={issueOf(issues, 'name')}>
                <Input
                  aria-label="설비 품목 이름"
                  value={draft.name}
                  placeholder="예: 송변전광단말장치"
                  onChange={(e) => onChange({ ...draft, name: e.currentTarget.value })}
                />
              </DetailRow>
              <DetailRow label="분류" issue={issueOf(issues, 'category')}>
                {/* 장비 품목과 **같은 분류 체계**다 — 어느 탭에서 분류를 만들든 양쪽에 나타난다. */}
                <Select
                  aria-label="분류"
                  value={draft.categoryId}
                  onChange={(e) => onChange({ ...draft, categoryId: e.currentTarget.value })}
                >
                  <option value="">— 분류 선택 —</option>
                  {catalog.categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </DetailRow>
              {/* 행·열 수를 묻지 않는다 — 격자는 **모든 설비가 같은 도화지**다
                  (`ASSEMBLY_GRID`). 그 설비가 어떤 물건인지는 크기가 아니라 안에 무엇이
                  놓였는가가 말한다. 접지함체를 1×1 로 지을 이유가 없다: 판은 그대로 두고
                  장비를 크게 그리면 된다. */}
            </DetailCard>

            {/* ── 1식 공량 ───────────────────────────────────────────────
                설비를 **통째로** 놓거나 걷을 때의 품이다. 완성된 1식에서 장비 하나만
                걷어내면 그때는 그 장비 품목의 공량을 쓴다 — 어느 쪽인지는 산출 내역가 변경
                집합에서 안다. */}
            <LaborSpecForm
              carrier="assembly"
              resetKey={draft.key || "new"}
              spec={draft}
              onChange={(patch) => onChange({ ...draft, ...patch })}
            />
          </>
        )}
      </aside>

    </div>
  );
}
