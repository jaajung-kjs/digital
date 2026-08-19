/**
 * PortsEditor — **위에 입력 한 줄, 아래에 판**. 카드 한 장이다.
 *
 * 앞서 두 번 잘못 갔다.
 *   1) 종류를 고를 때마다 카드가 쌓였다 — 네 그룹 398px, 일곱이면 600px(§1.6 위반).
 *   2) 그래서 일곱 줄 고정 표로 바꿨더니, **한 자리 숫자 일곱 개를 받으려고 세로 376px**
 *      를 쓰고 그 옆에 판을 또 그렸다. 고정은 됐지만 여전히 헐렁했다.
 *
 * 세 번째 자리가 지금이다: **입력은 위에 한 줄로 모으고, 아래는 판**.
 *   - 판 위에 칸을 흩어 놓으니(두 번째 시도) 고칠 곳을 눈으로 찾아 다녀야 했다. 값을 넣는
 *     일은 한 곳에 모여 있어야 손이 한 번에 간다.
 *   - 그러고 나면 판은 **결과만** 보여 주면 되므로 넓게 쓸 수 있다. 0개짜리 종류는 판에서
 *     빠지고 위 줄에만 남는다 — 판은 「이 장비가 어떻게 생겼나」이지 「무엇을 안 골랐나」가
 *     아니다.
 *
 * 위 줄은 종류가 일곱으로 고정이라 키가 늘 같고, 판은 상한을 둬 **포트가 늘어도 카드가
 * 자라지 않는다**.
 *
 * **묻는 것은 개수와 심선 수뿐**이다. 그룹 키·방향·매체·이름 패턴은 종류가 이미 정한 값이라
 * 물어 봐야 답이 하나뿐인 칸이었다.
 *
 * **미리 잠그지 않는다.** 예전에는 자산이 하나라도 있으면 모든 칸을 disabled 로 두고 그
 * 사실을 띠로 늘 띄워 놨다. 그런데 정말로 막히는 것은 「지우려는 그 포트에 케이블이 물렸을
 * 때」뿐이고, 그건 이 화면이 알 수 없다(케이블은 변전소마다 있다). 알 수도 없는 것을 미리
 * 막으면 할 수 있는 일까지 함께 막힌다 — 잘못 만든 포트를 지우는 일이 그랬다.
 *
 * 그래서 **누를 수 있게 두고, 저장할 때 서버가 정한다**. 막히면 그때 무엇이 막았는지(어느
 * 자산의 어느 포트) 위에 뜬다 — 늘 떠 있는 안내는 읽히지 않고, 정작 막힌 순간에는 이유를
 * 말해 주지 못한다.
 */
import { useMemo } from 'react';
import type { TypeSpecIssue } from '@twin/core';
import { DEFAULT_CORE_COUNT, coreCount, isMultiCorePort, portGroupLabel, portPresets, uniqueGroupKey } from '@twin/core';
import type { Direction } from '@twin/core';
import { DetailCard, DetailCardHeader, EmptyState, ErrorStrip, cn, InsetBox } from '../../../components/ui';
import { useMediumColor, useMediumLabel } from '../../hooks';
import type { TypeDraft } from '../../catalogDraft';
import { PortFaceplate } from '../detail/PortFaceplate';
import { portSections } from './portSections';
import { issueFor } from './adminUtils';

type PortRow = TypeDraft['ports'][number];

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
const kindOf = (p: { medium: string; direction: Direction; positions?: number | null }) =>
  `${p.medium}|${p.direction}|${isMultiCorePort(p.positions) ? 'multi' : 'single'}`;

/** 개수 칸 — 종류 이름 옆에 붙는 작은 숫자 칸. 폼 상자(38px)를 쓰면 줄이 통째로 두꺼워진다. */
function CountField({
  label, value, min, onChange,
}: {
  label: string;
  value: number;
  min: number;
  onChange: (raw: string) => void;
}) {
  return (
    <input
      type="number"
      aria-label={label}
      value={String(value)}
      min={min}
      onChange={(e) => onChange(e.currentTarget.value)}
      /* 일곱 종류가 한 줄에 들어가야 하므로 폭·높이를 최소로 — `Input`(38px)을 쓰면 이 줄만
         세 줄이 된다. 테두리와 흰 배경으로 「고칠 수 있는 값」임은 남긴다. */
      className={cn(
        'w-9 rounded bg-surface/70 px-1 text-center text-xs tabular-nums text-content',
        'border border-line focus:outline-none focus:ring-1 focus:ring-primary',
        'disabled:cursor-not-allowed disabled:opacity-60',
        '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none',
      )}
    />
  );
}

export function PortsEditor({ draft, onChange, issues }: PortsEditorProps) {
  const ports = draft.ports;
  const mediumLabel = useMediumLabel();
  const mediumColor = useMediumColor();

  /* 선언 목록 — 이미 있는 것 + **없는 종류도 0개짜리로**.
     위 줄은 일곱 종류가 늘 서 있어야 한다. 켤 때마다 칸이 생겼다 없어지면 다른 칸의 자리가
     밀려, 방금 고친 곳을 눈으로 다시 찾아야 한다. */
  const declared = useMemo<PreviewRow[]>(() => {
    const byKind = new Map(ports.map((p) => [kindOf(p), p]));
    const taken = ports.map((p) => p.group);
    const fromPresets = portPresets().map((preset) => {
      const existing = byKind.get(kindOf(preset));
      if (existing) return { row: existing, preset };
      return {
        row: {
          group: uniqueGroupKey(preset.groupKey, taken),
          count: 0,
          direction: preset.direction,
          medium: preset.medium,
          namePattern: preset.namePattern,
          positions: preset.positions,
        } satisfies PortRow,
        preset,
      };
    });
    const known = new Set(fromPresets.map((r) => kindOf(r.row)));
    // 어느 프리셋과도 안 맞는 선언(손으로 만든 것)은 조용히 지우지 않고 뒤에 남긴다.
    const extra = ports.filter((p) => !known.has(kindOf(p))).map((row) => ({ row, preset: null }));
    return [...fromPresets, ...extra];
  }, [ports]);

  const sections = useMemo(
    () => portSections(declared.map((d) => d.row), mediumLabel, mediumColor),
    [declared, mediumLabel, mediumColor],
  );

  function patch(row: PortRow, next: Partial<PortRow>) {
    const existing = ports.find((p) => kindOf(p) === kindOf(row) && p.group === row.group);
    let after: PortRow[];
    if (!existing) {
      // 0개였던 종류를 켠다 — 선언이 그때 생긴다.
      if ((next.count ?? 0) <= 0) return;
      after = [...ports, { ...row, ...next }];
    } else if (next.count === 0) {
      after = ports.filter((p) => p !== existing);
    } else {
      after = ports.map((p) => (p === existing ? { ...p, ...next } : p));
    }
    onChange({ ports: syncTrunkAdapters(after, { ...row, ...next }, existing ?? null) });
  }

  const total = ports.reduce((n, p) => n + p.count, 0);
  const issue = declared
    .map(({ row }) => {
      const i = ports.findIndex((p) => p === row);
      return i >= 0 ? issueFor(issues, `ports[${i}].count`) ?? issueFor(issues, `ports[${i}].positions`) : undefined;
    })
    .find(Boolean);

  /** 판에는 **실제로 있는 것만** — 0개짜리는 위 줄이 이미 말한다. */
  const faceplate = sections
    .filter((section) => section.ports.length > 0)
    .map((section) => ({ key: section.key, label: section.labelText, accent: section.accent, ports: section.ports }));

  return (
    /* 카드가 세로를 다 쓰고, 판이 그 안에서 남는 자리를 채운다 — 캔버스는 화면 아래까지
       서야 한다(구성 격자와 같은 규칙). 포트가 많으면 판 안에서 스크롤한다. */
    <DetailCard className="flex min-h-0 flex-1 flex-col">
      <DetailCardHeader title="포트" badge={`${total}개`} badgeStatus={total > 0 ? 'success' : 'neutral'} />
      <ErrorStrip message={issue ?? null} />

      {/* 값을 넣는 자리 — **한 줄에 모은다**. 종류가 일곱으로 고정이라 이 줄의 키도 늘 같다.
          개수 0 이면 그 종류가 없는 것이라, 켜고 끄는 길을 따로 두지 않는다. */}
      <InsetBox className="flex flex-wrap gap-x-3 gap-y-1.5 px-2 py-1.5">
        {declared.map(({ row }) => {
          const label = labelOf(row, declared, mediumLabel);
          const on = row.count > 0;
          return (
            <span key={row.group} className="flex items-center gap-1">
              <span className={cn('text-xs', on ? 'text-content' : 'text-content-faint')}>{label}</span>
              <CountField
                label={`${label} 개수`}
                value={row.count}
                min={0}
                onChange={(raw) => patch(row, { count: Math.max(Number(raw) || 0, 0) })}
              />
              {/* 심선 수는 다심 종류에만, 그것도 켜져 있을 때만.
                  **두 수에 단위를 적는다.** 예전에는 `1 × 24` 뿐이라 곱셈인지 「1구에 24코어」
                  인지 읽는 사람이 알 단서가 없었다 — 수가 둘 나란히 서면 각각이 무엇을
                  세는지 말해야 한다. */}
              {isMultiCorePort(row.positions) && on && (
                <>
                  <span className="text-xs text-content-faint">구 ×</span>
                  <CountField
                    label={`${label} 심선 수`}
                    value={row.positions ?? DEFAULT_CORE_COUNT}
                    min={2}
                    onChange={(raw) => patch(row, { positions: Math.max(Number(raw) || 2, 2) })}
                  />
                  <span className="text-xs text-content-faint">코어</span>
                </>
              )}
            </span>
          );
        })}
      </InsetBox>

      {/* 결과 — 이 자산 종류를 놓으면 생길 판.
          판은 **남는 자리를 다 쓴다**: 포트가 둘이든 스물다섯이든 캔버스는 같은 크기여야
          종류를 옮겨 다닐 때 화면이 출렁이지 않는다. 넘치면 판 안에서 스크롤한다. */}
      {faceplate.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <EmptyState title="포트가 없습니다" description="위에서 종류별 개수를 적으면 판이 여기 나타납니다." />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
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

/** 이 선언을 뭐라고 부를 것인가 — 판의 구획 이름과 같은 규칙(`portGroupLabel`). */
function labelOf(
  row: PortRow,
  all: readonly PreviewRow[],
  mediumLabel: (key: string) => string,
): string {
  const refs = all.map(({ row: r }) => ({
    group: r.group,
    medium: r.medium,
    direction: r.direction,
    sampleName: r.namePattern.replace('{n}', '1'),
    positions: coreCount(r.positions),
  }));
  const mine = refs.find((r) => r.group === row.group)!;
  return portGroupLabel(mine, refs, mediumLabel);
}

interface PreviewRow {
  row: PortRow;
  preset: ReturnType<typeof portPresets>[number] | null;
}
