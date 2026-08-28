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
  Button, DetailCard, DetailCardHeader, EmptyState, ErrorStrip, IconButton, MenuPopup, MessageStrip,
  PromptModal, cn, isCommitKey, type MenuAnchor,
} from '../../../components/ui';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { useMediumColor, useMediumLabel } from '../../hooks';
import { portRow, type PortRow, type TypeDraft } from '../../catalogDraft';
import { PortFaceplate } from '../detail/PortFaceplate';
import { portSections } from './portSections';
import { issueFor } from './adminUtils';

/** 줄을 새로 세울 때의 개수 — 하나로 시작해 필요한 만큼 늘린다(다심은 늘 1구다). */
const DEFAULT_PORT_COUNT = 1;

/**
 * 구획 이름표에 붙는 **값 하나** — 눌러서 고치는 **작은 컨트롤**이다.
 *
 * 처음에는 그냥 실크스크린 글자로 뒀다(`×2`·`DC 48V`). 그런데 **눌러 보기 전에는 누를 수
 * 있는지 알 수가 없었다** — 어포던스 없는 클릭 타깃은 없는 것과 같다(§1.7-h 가 정렬 화살표에
 * 대해 말하는 것과 같은 이유).
 *
 * 그래서 쉬는 상태에도 **테두리를 두른 칩**으로 선다. 고를 값이 정해진 것에는 `▾` 가 붙어
 * 「목록이 열린다」를 말한다(어느 화면에서나 통하는 표시다). 판 위의 글자라 본문 상자(38px)를
 * 세울 수 없어 칩은 작지만, **컨트롤로 보이는 것**과 **폼이 되지 않는 것**을 둘 다 지킨다.
 */
/** 목록 끝의 「직접 입력」 — 저장되는 값이 아니라 칸을 자유 입력으로 바꾸는 표다. */
const FREE_INPUT = '\u0000free';

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
  /** 목록에 없는 값을 적는 중인가 — 「직접 입력…」을 고른 뒤. */
  const [prompting, setPrompting] = useState(false);
  /** 판의 실크스크린 색 — 글자도 테두리도 이 색에서 나온다(판마다 따로 정하지 않는다). */
  const silk = 'var(--faceplate-silk)';

  if (!editing) {
    return (
      <button
        type="button"
        aria-label={`${label} 고치기`}
        title={`${label} 고치기`}
        onClick={() => setEditing(true)}
        className={cn(
          'inline-flex items-center gap-0.5 rounded border px-1.5 text-xs leading-5',
          'cursor-pointer transition-colors hover:bg-black/10 focus-visible:outline-none focus-ring-input',
        )}
        style={{
          color: silk,
          /* 쉬는 상태의 테두리는 흐리게 — 판을 어지럽히지 않으면서 「누를 수 있다」만 말한다. */
          borderColor: `color-mix(in srgb, ${silk} 40%, transparent)`,
          backgroundColor: 'color-mix(in srgb, var(--faceplate-silk) 6%, transparent)',
        }}
      >
        {text}
        {/* 목록이 열리는 값에는 `▾` — 어느 화면에서나 통하는 표시다. */}
        {options && <ChevronDown size={10} aria-hidden />}
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

  /* **목록을 닫아 걸지 않는다.** 현장에는 목록 밖의 값이 실제로 있다(제어전원 DC 125V).
     지금 적힌 값이 목록에 없으면 **그 값도 목록에 실어** 보여 준다 — 적힌 사실을 화면이
     지우면 안 되고, 목록에 없다는 이유로 열자마자 다른 값으로 바뀌어서도 안 된다. */
  const items = options && value && !options.includes(value) ? [value, ...options] : (options ?? []);

  return options ? (
    <>
      <select
        {...common}
        defaultValue={value}
        onChange={(e) => {
          if (e.currentTarget.value === FREE_INPUT) { setPrompting(true); return; }
          done(e.currentTarget.value);
        }}
        onBlur={() => { if (!prompting) setEditing(false); }}
      >
        {items.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
        <option value={FREE_INPUT}>직접 입력…</option>
      </select>
      <PromptModal
        open={prompting}
        title={label}
        label={label}
        initialValue={value}
        confirmLabel="적용"
        onConfirm={(next) => { setPrompting(false); done(next); }}
        onClose={() => { setPrompting(false); setEditing(false); }}
      />
    </>
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

/**
 * 이 선언으로 **인입이 어디로 갈리는지 정해지는가** — 정해지지 않으면 말해 준다.
 *
 * 다심 인입(OPGW)의 코어 i 는 같은 매체의 **단심 구획** i 번으로 나온다(`derivedLinks` 의
 * `byPosition`). 그 규칙은 **앞면 후보가 정확히 하나일 때만** 유도된다. 그래서:
 *   - 앞면이 둘 이상이면 어느 쪽인지 알 수 없어 **규칙이 아예 생기지 않는다** — 선번장에서
 *     대국이 끊기고 추적이 인입에서 멈춘다.
 *   - 앞면이 없으면 24심을 받아 놓고 나갈 자리가 없다.
 *   - 인입이 둘이고 앞면이 하나면 **두 인입이 같은 앞면을 나눠 쓴다**(코어 1 이 두 인입 모두에
 *     이어진다) — 어느 가닥이 어디로 갔는지 화면이 말해 줄 수 없다.
 *
 * **막지는 않는다**(§「미리 잠그지 않는다」). 24심 인입에 12구만 뽑아 둔 판처럼 어긋난 조합도
 * 실물에 있고, 그건 여기서 알 수 없다. 다만 **말은 해 준다** — 저장한 뒤 선번장에서
 * 「왜 아무것도 안 뜨지」로 알게 되는 것이 가장 나쁘다.
 */
function trunkWarning(rows: readonly PortRow[]): string | null {
  const trunks = rows.filter((p) => isMultiCorePort(p.positions));
  if (trunks.length === 0) return null;
  const medium = trunks[0]!.medium;
  const fronts = rows.filter((p) => p.medium === medium && !isMultiCorePort(p.positions));

  if (fronts.length === 0) return '다심 인입을 받을 앞면 구획이 없습니다 — 코어가 나갈 자리가 없습니다.';
  if (fronts.length > 1) {
    return `앞면 구획이 ${fronts.length}개라 코어가 어느 쪽으로 갈리는지 정할 수 없습니다 — 하나만 두세요.`;
  }
  if (trunks.length > 1) {
    return `다심 인입이 ${trunks.length}개인데 앞면이 하나라, 두 인입이 같은 앞면을 나눠 쓰게 됩니다.`;
  }
  const cores = trunks[0]!.positions ?? 0;
  if (cores > fronts[0]!.count) {
    return `코어 ${cores}심 중 ${cores - fronts[0]!.count}심은 나갈 앞면이 없습니다(앞면 ${fronts[0]!.count}구).`;
  }
  return null;
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
    /* 값은 이름표의 칩이 고치므로 이름에는 **필요할 때만** 싣는다 — 늘 실으면
       「전원 출력(DC 48V) [DC 48V]」가 되고, 아예 안 실으면 220V·110V 출력이 같은 이름으로
       서서 뜻 없는 그룹 키가 튀어나온다. */
    () => portSections(declared.map((d) => d.row), mediumLabel, mediumColor, 'whenAmbiguous'),
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
    /* 줄은 **한 자리에서** 짓는다(`portRow`) — 손으로 지으면 서버가 돌려주는 줄과 글자가
       달라져, 저장하고도 「고칠 것이 남았다」로 읽힌다(`isDirty` 는 JSON 으로 견준다). */
    const row = portRow({
      group: uniqueGroupKey(preset.groupKey, ports.map((p) => p.group)),
      count: preset.positions > 1 ? 1 : DEFAULT_PORT_COUNT,
      direction: preset.direction,
      medium: preset.medium,
      namePattern: preset.namePattern,
      positions: preset.positions,
      variant: preset.variant,
      /* 전압은 프리셋이 그 갈래의 예사값을 들고 온다 — 놓는 순간 이미 「DC 48V」다. */
      voltage: preset.voltage,
    });
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
          text={`${row.count}개`}
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

  const trunkNote = trunkWarning(ports);
  /**
   * **뜻이 같은 구획이 둘 있는가** — 대개 실수다.
   *
   * 종류·방향·갈래·값이 모두 같으면 두 구획은 구분할 길이 순번뿐이고(이름이 그렇게 선다),
   * 놓고 나서도 어느 쪽이 어느 쪽인지 말할 수 없다. 그럴 때 옳은 모양은 **하나에 개수 2**다.
   * 380V 를 220V 로 고치다가 이 상태가 되는 일이 실제로 있어서(값이 겹치는 순간), 막지 않고
   * 말해 준다 — 이중 인입을 일부러 둘로 두는 판도 있기 때문이다.
   */
  const twinNote = (() => {
    const seen = new Map<string, number>();
    for (const { row } of declared) {
      const k = `${row.medium}|${row.direction}|${row.variant ?? ''}|${row.voltage ?? ''}|${row.positions ?? 1}`;
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    const dup = [...seen.values()].some((n) => n > 1);
    return dup ? '뜻이 같은 구획이 둘입니다 — 하나로 두고 개수를 늘리는 편이 낫습니다(순번으로만 갈립니다).' : null;
  })();

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
      {/* 막지 않고 **말해 준다** — 저장한 뒤 선번장에서 「왜 아무것도 안 뜨지」로 알게 되는
          것이 가장 나쁘다. */}
      {(trunkNote ?? twinNote) && (
        <MessageStrip tone="warning" className="shrink-0">
          {trunkNote ?? twinNote}
        </MessageStrip>
      )}

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
      portRow({
        group: uniqueGroupKey(preset.groupKey, after.map((p) => p.group)),
        count: cores,
        direction: preset.direction,
        medium: preset.medium,
        namePattern: preset.namePattern,
        positions: 1,
      }),
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
