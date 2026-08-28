/**
 * PortsEditor — **판이 화면 전부**다. 값은 그 구획의 이름표에 붙어 있다.
 *
 * 다섯 번 만에 여기 왔다.
 *   1) 종류를 고를 때마다 카드가 쌓였다 — 네 그룹 398px(§1.6 위반).
 *   2) 일곱 줄 고정 표 — 한 자리 숫자 일곱 개에 세로 376px.
 *   3) 칩 한 줄 — 종류 아홉이 늘 서 있고(대부분 0개), 1 을 적으면 옆에 칸이 자라났다.
 *   4) 선언 표 — 판이 이미 말하는 것(구획 이름·개수)을 표가 다시 말했다.
 *   5) 도구모음 한 줄 — **만들기와 고치기를 한 띠에 붙여** 서로 다른 두 대상이
 *      한 문장처럼 읽혔다(왼쪽엔 「전원 입력(AC)」, 오른쪽엔 「전원 입력(DC) 2개」).
 *      게다가 고칠 값이 정작 그 대상(판의 구획)에서 멀었다.
 *
 * 그래서 **고르는 일 자체를 없앴다.**
 *   - **만들기는 단추 하나**다(「＋ 포트 추가」 → 그때 종류 메뉴). 장전된 목록을 세워 두지
 *     않는다 — 만들 생각이 없는 것이 화면에 늘 떠 있을 이유가 없다.
 *   - **고치는 값은 그 구획의 이름표에** 붙는다(`▌전원 입력(DC) ×2 · DC 48V`). 누르면 그
 *     자리에서 고쳐지고, 손을 얹으면 그 구획의 지우개가 뜬다. 「무엇을 고치는 중인가」를
 *     따로 표시할 필요가 없다 — 값이 그 대상 위에 있다.
 *   - 값을 고치면 **판이 그 자리에서 바뀐다**. 미리보기가 아니라 편집 대상 자체다.
 *
 * **미리 잠그지 않는다.** 정말로 막히는 것은 「지우려는 그 포트에 케이블이 물렸을 때」뿐이고,
 * 그건 이 화면이 알 수 없다(케이블은 변전소마다 있다). 누를 수 있게 두고 저장할 때 서버가
 * 무엇이 막았는지 말한다.
 */
import { useMemo, useState } from 'react';
import type { TypeSpecIssue } from '@twin/core';
import { DEFAULT_CORE_COUNT, isMultiCorePort, portKind, portPresets, uniqueGroupKey } from '@twin/core';
import type { Direction } from '@twin/core';
import {
  Button, DetailCard, DetailCardHeader, EmptyState, ErrorStrip, IconButton, MenuPopup, cn,
  isCommitKey, type MenuAnchor,
} from '../../../components/ui';
import { Plus, Trash2 } from 'lucide-react';
import { useMediumColor, useMediumLabel } from '../../hooks';
import type { TypeDraft } from '../../catalogDraft';
import { PortFaceplate } from '../detail/PortFaceplate';
import { portSections } from './portSections';
import { issueFor } from './adminUtils';

type PortRow = TypeDraft['ports'][number];

/** 줄을 새로 세울 때의 개수 — 하나로 시작해 필요한 만큼 늘린다(다심은 늘 1구다). */
const DEFAULT_PORT_COUNT = 1;

/**
 * 구획 이름표에 붙는 **값 하나** — 읽을 때는 실크스크린 글자, 누르면 그 자리에서 상자.
 *
 * 판 위의 글자라 본문 상자(38px)를 세울 수 없다. 그렇다고 늘 상자로 두면 판이 폼이 된다
 * (§1.7-i). 읽는 줄이 기본이고 누를 때만 상자가 서는 어법은 표와 같지만, 여기서는 **칸이
 * 아니라 글자 폭**이라 `InlineEditCell`(칸 하나를 채우는 물건)을 쓸 수 없다.
 */
function SilkValue({
  label, text, value, options, min, autoEdit = false, onCommit,
}: {
  label: string;
  /** 읽을 때 보이는 말 — `×2`·`DC 48V` 처럼 단위까지 붙은 글자. */
  text: string;
  value: string;
  /** 고를 값이 정해져 있으면 목록으로 — 없으면 수를 친다. */
  options?: readonly string[];
  min?: number;
  /**
   * 만들어지자마자 **고치는 상태로** 시작한다 — 갓 더한 구획의 개수가 그렇다.
   *
   * 포트 구획을 더하는 사람은 거의 언제나 개수를 함께 정한다(24구 판·12심 슬롯). 하나로
   * 만들어 놓고 「이제 개수를 찾아 고치세요」라고 두면 만드는 일이 늘 두 걸음이 된다.
   */
  autoEdit?: boolean;
  onCommit: (raw: string) => void;
}) {
  const [editing, setEditing] = useState(autoEdit);
  const silk = { color: 'var(--faceplate-silk)' } as const;

  if (!editing) {
    return (
      <button
        type="button"
        aria-label={`${label} 고치기`}
        onClick={() => setEditing(true)}
        className="rounded px-1 text-xs transition-colors hover:bg-black/10"
        style={silk}
      >
        {text}
      </button>
    );
  }

  const done = (raw: string) => { onCommit(raw); setEditing(false); };
  const common = {
    autoFocus: true,
    'aria-label': label,
    className: 'rounded border border-line bg-surface px-1 text-xs text-content focus:outline-none focus-ring-input',
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      /* Esc 는 물린다 — 고치지 않고 원래 값으로 돌아간다(앱 공통 규칙). */
      if (e.key === 'Escape') { e.stopPropagation(); setEditing(false); }
    },
  };

  return options ? (
    <select
      {...common}
      defaultValue={value}
      onChange={(e) => done(e.currentTarget.value)}
      onBlur={() => setEditing(false)}
    >
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  ) : (
    <input
      {...common}
      type="number"
      min={min}
      defaultValue={value}
      size={4}
      /* 갓 더한 구획이면 값이 **골라진 채로** 선다 — 치는 대로 덮인다. */
      onFocus={(e) => e.currentTarget.select()}
      className={cn(common.className, 'w-12 text-right tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none')}
      onBlur={(e) => done(e.currentTarget.value)}
      onKeyDown={(e) => {
        common.onKeyDown(e);
        if (isCommitKey(e)) e.currentTarget.blur();
      }}
    />
  );
}

interface PortsEditorProps {
  draft: TypeDraft;
  onChange: (patch: Partial<TypeDraft>) => void;
  issues: TypeSpecIssue[];
}

/**
 * 어떤 종류의 줄인가 — **매체 · 방향 · 다심 여부**로 가른다.
 *
 * 이 셋이 곧 프리셋의 정체다(`portPresets`). 그룹 키로 가르면 안 된다 — 키는 타입 안에서
 * 유일하기만 하면 되는 식별자라 `FIBER`·`FIBER-2` 처럼 달라질 수 있다.
 */
/* 같은 종류인가 — 매체·방향·심선 수에 **갈래**까지 본다. 갈래가 다르면 다른 줄이다
   (전원 입력이 교류·직류 둘로 서야 충전기처럼 받아서 바꾸는 장비를 적을 수 있다). */
const kindOf = (p: { medium: string; direction: Direction; positions?: number | null; variant?: string | null }) =>
  `${p.medium}|${p.direction}|${isMultiCorePort(p.positions) ? 'multi' : 'single'}|${p.variant ?? ''}`;

/**
 * 이 선언이 고를 수 있는 전압 — **갈래가 정한다**(`PortVariant.voltages`).
 *
 * 갈래가 없는 종류(네트워크·광·접지)는 전압이라는 말 자체가 없으므로 빈 목록이고,
 * 그때는 칸도 서지 않는다.
 */
function voltageOptionsOf(row: PortRow): readonly string[] {
  const kind = portKind(row.medium);
  return kind?.variants?.find((v) => v.key === row.variant)?.voltages ?? [];
}

/**
 * 이 줄이 말할 **세부** — 그 종류가 요구하는 값 하나. 없으면 null.
 *
 * 전원은 전압(갈래가 고를 값을 정한다), 다심은 코어 수. 나머지 종류(네트워크·접지·제어)는
 * 세부라는 것이 아예 없다 — 그런 줄에 대시를 세우면 「아직 안 적었다」로 읽힌다.
 */
function detailOf(row: PortRow): 'voltage' | 'positions' | null {
  if (voltageOptionsOf(row).length > 0) return 'voltage';
  return isMultiCorePort(row.positions) ? 'positions' : null;
}

export function PortsEditor({ draft, onChange, issues }: PortsEditorProps) {
  const ports = draft.ports;
  const mediumLabel = useMediumLabel();
  const mediumColor = useMediumColor();

  /**
   * 표에 서는 줄 — **이 판이 실제로 갖는 구획만**.
   *
   * 예전에는 프리셋 아홉을 0개짜리로 늘 세웠다. 그러면 표의 대부분이 「없는 포트」다.
   * 없는 것은 표에 없고, 더하는 길은 아래 「＋ 포트 추가」 하나다.
   */
  const declared = useMemo<PreviewRow[]>(() => {
    const byKind = new Map(portPresets().map((preset) => [kindOf(preset), preset]));
    return ports.map((row) => ({ row, preset: byKind.get(kindOf(row)) ?? null }));
  }, [ports]);

  const sections = useMemo(
    () => portSections(declared.map((d) => d.row), mediumLabel, mediumColor),
    [declared, mediumLabel, mediumColor],
  );

  /* 종류는 **누른 그 순간에** 고른다 — 목록을 세워 두면 만들 생각 없는 것이 늘 떠 있다. */
  const [menuAt, setMenuAt] = useState<MenuAnchor | null>(null);
  /** 방금 더한 구획 — 그 개수 칸이 열린 채로 선다(더하기와 개수 정하기가 한 걸음이 된다). */
  const [justAdded, setJustAdded] = useState<string | null>(null);

  function patch(row: PortRow, next: Partial<PortRow>) {
    const existing = ports.find((p) => p.group === row.group);
    let after: PortRow[];
    if (!existing) {
      if ((next.count ?? 0) <= 0) return;
      after = [...ports, { ...row, ...next }];
    } else if (next.count === 0) {
      after = ports.filter((p) => p !== existing);
    } else {
      after = ports.map((p) => (p === existing ? { ...p, ...next } : p));
    }
    onChange({ ports: syncTrunkAdapters(after, { ...row, ...next }, existing ?? null) });
  }

  /** 고른 종류로 줄을 하나 만든다 — 그룹 키는 어휘가 주고, 겹치면 번호가 붙는다. */
  function addPreset(index: number) {
    const preset = portPresets()[index];
    if (!preset) return;
    const row: PortRow = {
      group: uniqueGroupKey(preset.groupKey, ports.map((p) => p.group)),
      count: preset.positions > 1 ? 1 : DEFAULT_PORT_COUNT,
      direction: preset.direction,
      medium: preset.medium,
      namePattern: preset.namePattern,
      positions: preset.positions,
      ...(preset.variant ? { variant: preset.variant } : {}),
      /* 전압은 프리셋이 그 갈래의 예사값을 들고 온다 — 놓는 순간 이미 「DC 48V」다. */
      ...(preset.voltage ? { voltage: preset.voltage } : {}),
    };
    setJustAdded(row.group);
    onChange({ ports: syncTrunkAdapters([...ports, row], row, null) });
  }

  const total = ports.reduce((n, p) => n + p.count, 0);
  const issue = declared
    .map(({ row }) => {
      const i = ports.findIndex((p) => p === row);
      return i >= 0 ? issueFor(issues, `ports[${i}].count`) ?? issueFor(issues, `ports[${i}].positions`) : undefined;
    })
    .find(Boolean);

  /**
   * 구획 이름표 — **이름 + 그 구획의 값 + 지우개**. 값이 그 대상 위에 있다.
   *
   * 예전에는 위쪽 도구모음이 「고른 구획」의 값을 들었다. 그러면 판에서 이름표를 누르고 눈은
   * 위로 올라가야 했고(직접 조작의 반대), 「만들 종류」와 「고친 구획」이 한 띠에 나란히 서서
   * 서로 다른 두 대상이 한 문장처럼 읽혔다.
   */
  const sectionLabel = (row: PortRow, labelText: string) => {
    const detail = detailOf(row);
    return (
      <span className="group/silk inline-flex items-center gap-1">
        <span>{labelText}</span>
        <SilkValue
          label={`${labelText} 개수`}
          text={`×${row.count}`}
          value={String(row.count)}
          min={1}
          autoEdit={row.group === justAdded}
          onCommit={(raw) => {
            setJustAdded(null);
            const next = Math.max(Number(raw) || 1, 1);
            if (next !== row.count) patch(row, { count: next });
          }}
        />
        {detail === 'voltage' && (
          <SilkValue
            label={`${labelText} 전압`}
            text={row.voltage ?? '전압'}
            value={row.voltage ?? ''}
            options={
              row.voltage && !voltageOptionsOf(row).includes(row.voltage)
                ? [row.voltage, ...voltageOptionsOf(row)]
                : voltageOptionsOf(row)
            }
            onCommit={(raw) => patch(row, { voltage: raw.trim() || null })}
          />
        )}
        {detail === 'positions' && (
          <SilkValue
            label={`${labelText} 심선 수`}
            text={`${row.positions ?? DEFAULT_CORE_COUNT}코어`}
            value={String(row.positions ?? DEFAULT_CORE_COUNT)}
            min={2}
            onCommit={(raw) => {
              const next = Math.max(Number(raw) || 2, 2);
              if (next !== row.positions) patch(row, { positions: next });
            }}
          />
        )}
        {/* 지우개는 **그 구획에 손을 얹었을 때만** 드러난다(§1.7). */}
        <IconButton
          aria-label={`${labelText} 지우기`}
          title="지우기"
          size="sm"
          className="opacity-0 transition-opacity hover:text-danger group-hover/silk:opacity-100 focus-visible:opacity-100"
          onClick={() => patch(row, { count: 0 })}
        >
          <Trash2 size={12} />
        </IconButton>
      </span>
    );
  };

  const faceplate = sections
    .filter((section) => section.ports.length > 0)
    .map((section) => {
      const row = declared.find(({ row: r }) => r.group === section.key)?.row;
      return {
        key: section.key,
        label: row ? sectionLabel(row, section.labelText) : section.labelText,
        accent: section.accent,
        ports: section.ports,
      };
    });

  return (
    /* 카드가 세로를 다 쓰고, 판이 그 안에서 남는 자리를 채운다 — 캔버스는 화면 아래까지
       서야 한다(구성 격자와 같은 규칙). */
    <DetailCard className="flex min-h-0 flex-1 flex-col">
      <DetailCardHeader
        title="포트"
        badge={`${total}개`}
        badgeStatus={total > 0 ? 'success' : 'neutral'}
        /* 만드는 길은 **단추 하나**다 — 누른 그 자리에서 종류를 고른다. */
        actions={
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              const box = e.currentTarget.getBoundingClientRect();
              setMenuAt({ x: box.left, y: box.bottom + 4, flipY: box.top - 4 });
            }}
          >
            <Plus size={14} /> 포트 추가
          </Button>
        }
      />
      <ErrorStrip message={issue ?? null} />

      {menuAt && (
        <MenuPopup
          at={menuAt}
          onClose={() => setMenuAt(null)}
          items={portPresets().map((preset, i) => ({
            label: preset.name,
            onSelect: () => { addPreset(i); setMenuAt(null); },
          }))}
        />
      )}

      {/* 결과 — 이 장비 품목을 놓으면 생길 판.
          판은 **남는 자리를 다 쓴다**: 포트가 둘이든 스물다섯이든 캔버스는 같은 크기여야
          종류를 옮겨 다닐 때 화면이 출렁이지 않는다. 넘치면 판 안에서 스크롤한다. */}
      {faceplate.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <EmptyState title="포트가 없습니다" description="「＋ 포트 추가」를 누르면 이 자리에 판이 그려집니다." />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* 포트 하나를 고르는 일은 여기서 뜻이 없다 — 이 화면이 정하는 것은 **구획**이고,
              그 값은 이름표에 붙어 있다(포트 하나의 값은 자산 화면의 일이다). */}
          <PortFaceplate
            fill
            sections={faceplate}
            stateOf={() => 'empty'}
            cableCountOf={() => 0}
            selectedPortId={null}
            onSelect={() => {}}
          />
        </div>
      )}
    </DetailCard>
  );
}

/**
 * 성단(다심) 코어 수를 고치면 **앞면 어댑터 개수도 따라온다**.
 *
 * 실물에서 24심 OPGW 한 가닥은 앞면 24구로 갈라져 나온다 — 코어 하나가 어댑터 하나다
 * (`internalLinkMap` 의 `byPosition`: 인입 코어 i ↔ 같은 자산의 단심 i 번). 12심 슬롯은
 * 성단 12 + 인입 코어 12 로 **함께** 움직인다.
 *
 * 그런데 **강제하지는 않는다.** 어긋난 조합도 실제로 있다 — 24심 인입 옆의 48구 판이 그렇고,
 * 코어를 다 쓰지 않고 남겨 두는 경우도 있다(`internalLinks.ts:106` 주석이 그 경우를 명시한다).
 * 그래서 **맞춰져 있던 것만** 따라오게 한다: 어댑터가 0개이거나 이전 코어 수와 같을 때.
 * 일부러 어긋내 둔 값은 건드리지 않는다.
 */
function syncTrunkAdapters(after: PortRow[], changed: PortRow, before: PortRow | null): PortRow[] {
  if (!isMultiCorePort(changed.positions)) return after;
  const cores = changed.positions ?? 0;
  if (cores < 2) return after;

  // 같은 매체의 **단심** 선언 — 앞면 어댑터. 둘 이상이면 어느 쪽인지 알 수 없으므로 둔다.
  const adapters = after.filter((p) => p.medium === changed.medium && !isMultiCorePort(p.positions));
  if (adapters.length > 1) return after;

  if (adapters.length === 0) {
    /* 앞면이 아직 없다 — 성단을 켠 것이므로 **그 자리에서 만든다**. 24심 인입만 있고
       나갈 어댑터가 없는 판은 없다. 이름·그룹 키는 프리셋이 정한다. */
    const preset = portPresets().find((x) => x.medium === changed.medium && x.positions === 1);
    if (!preset) return after;
    return [
      ...after,
      {
        group: uniqueGroupKey(preset.groupKey, after.map((p) => p.group)),
        count: cores,
        direction: preset.direction,
        medium: preset.medium,
        namePattern: preset.namePattern,
        positions: 1,
      },
    ];
  }

  const adapter = adapters[0]!;
  const wasSynced = before == null || adapter.count === 0 || adapter.count === (before.positions ?? 0);
  if (!wasSynced || adapter.count === cores) return after;
  return after.map((p) => (p === adapter ? { ...p, count: cores } : p));
}

interface PreviewRow {
  row: PortRow;
  preset: ReturnType<typeof portPresets>[number] | null;
}
