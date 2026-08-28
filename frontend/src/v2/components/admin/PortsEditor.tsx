/**
 * PortsEditor — **이 장비가 무슨 포트를 갖는가**를 적는 표.
 *
 * 세 번 잘못 갔다.
 *   1) 종류를 고를 때마다 카드가 쌓였다 — 네 그룹 398px(§1.6 위반).
 *   2) 일곱 줄 고정 표로 바꿨더니 한 자리 숫자 일곱 개에 세로 376px 를 썼다.
 *   3) 그래서 칩 한 줄로 눌러 담았다 — **종류 아홉이 늘 서 있고 개수만 적는 판**이 됐다.
 *      화면의 대부분이 「없는 포트」(0개)였고, 1 을 적는 순간 그 옆에 전압·코어 칸이
 *      자라나 「엥, 뭐가 생겼지」가 됐다. 조회하러 온 사람에게 입력 상자 아홉을 들이미는
 *      꼴이기도 했다(§1.7-i 가 선번장에서 걷어낸 바로 그것).
 *
 * 지금은 **선언 표**다 — 이 판이 실제로 갖는 구획만 한 줄씩 선다. DCIM 의 표준 어법이기도
 * 하다(NetBox 의 장비 타입 화면: 컴포넌트가 표로 서고 「Add Components」로 더한다).
 *   - **읽는 줄이 기본**이고 누르면 그때 상자가 선다(`InlineEditCell`).
 *   - **없는 포트는 화면에 없다.** 표는 「이 장비가 어떻게 생겼나」이지 「무엇을 안 골랐나」가 아니다.
 *   - 더하는 일은 **명시적**이고(「＋ 포트 추가」), 새 줄이 서서 그 줄 안에서 종류를 고른다.
 *     칸이 옆에서 튀어나오는 것이 아니라 **새 줄의 칸**이라 놀랄 일이 없다(§1.7-m: 만들기와
 *     고치기가 같은 상자).
 *   - 세부(전압·코어)는 **그 종류가 요구하는 칸**이다 — NetBox 의 리어 포트가 `positions` 를
 *     그 행에 갖는 것과 같다.
 *
 * **틀은 못 박는다**(§1.6·§1.7-b): 머리글과 「＋ 포트 추가」는 늘 그 자리에 있고, 표는 여덟
 * 줄까지 자란 뒤로는 **표 본문만** 흐른다. 전면판은 남는 자리를 그대로 채운다 — 포트가
 * 둘이든 스물다섯이든 카드 바깥은 움직이지 않는다.
 *
 * **미리 잠그지 않는다.** 정말로 막히는 것은 「지우려는 그 포트에 케이블이 물렸을 때」뿐이고,
 * 그건 이 화면이 알 수 없다(케이블은 변전소마다 있다). 누를 수 있게 두고 저장할 때 서버가
 * 무엇이 막았는지 말한다.
 */
import { useMemo, useState } from 'react';
import type { TypeSpecIssue } from '@twin/core';
import { DEFAULT_CORE_COUNT, groupRefOfTemplate, isMultiCorePort, portGroupLabel, portKind, portPresets, uniqueGroupKey } from '@twin/core';
import type { Direction } from '@twin/core';
import {
  Button, DetailCard, DetailCardHeader, EmptyState, ErrorStrip, EMPTY, IconButton, Select,
  TABLE_ROW, TableCard, Th, cn, Td,} from '../../../components/ui';
import { Plus, Trash2 } from 'lucide-react';
import { InlineEditCell } from '../InlineEditCell';
import { useMediumColor, useMediumLabel } from '../../hooks';
import type { TypeDraft } from '../../catalogDraft';
import { PortFaceplate } from '../detail/PortFaceplate';
import { portSections } from './portSections';
import { issueFor } from './adminUtils';

type PortRow = TypeDraft['ports'][number];

/** 구획 · 개수 · 이름 · 세부 · 지우기 — 합 100(§Table 규약). */
const PORT_COLUMNS = [30, 12, 28, 24, 6] as const;

/** 줄을 새로 세울 때의 개수 — 하나로 시작해 필요한 만큼 늘린다(다심은 늘 1구다). */
const DEFAULT_PORT_COUNT = 1;

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

  /**
   * 더하는 중인 줄 — **표 안에 실제로 선다**.
   *
   * 「추가」 상자를 따로 띄우지 않는다(§1.7-m). 빈 줄이 그 자리에 서고 첫 칸에서 종류를
   * 고르면 그 줄이 채워진다 — 무엇을 만드는 중인지가 늘 화면에 있다. 고르지 않고 물리면
   * 줄은 사라진다(덜 채운 것은 없는 것이다).
   */
  const [adding, setAdding] = useState(false);

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
    setAdding(false);
    onChange({ ports: syncTrunkAdapters([...ports, row], row, null) });
  }

  const total = ports.reduce((n, p) => n + p.count, 0);
  const issue = declared
    .map(({ row }) => {
      const i = ports.findIndex((p) => p === row);
      return i >= 0 ? issueFor(issues, `ports[${i}].count`) ?? issueFor(issues, `ports[${i}].positions`) : undefined;
    })
    .find(Boolean);

  const faceplate = sections
    .filter((section) => section.ports.length > 0)
    .map((section) => ({ key: section.key, label: section.labelText, accent: section.accent, ports: section.ports }));

  return (
    /* 카드가 세로를 다 쓰고, 판이 그 안에서 남는 자리를 채운다 — 캔버스는 화면 아래까지
       서야 한다(구성 격자와 같은 규칙). */
    <DetailCard className="flex min-h-0 flex-1 flex-col">
      <DetailCardHeader
        title="포트"
        badge={`${total}개`}
        badgeStatus={total > 0 ? 'success' : 'neutral'}
        /* 더하는 단추는 **늘 이 자리**다 — 표가 길어져도 스크롤 밖에 남는다(§1.7-b). */
        actions={
          <Button size="sm" variant="ghost" onClick={() => setAdding(true)} disabled={adding}>
            <Plus size={14} /> 포트 추가
          </Button>
        }
      />
      <ErrorStrip message={issue ?? null} />

      {(declared.length > 0 || adding) && (
        /* 표는 **여덟 줄까지** 자라고 그 뒤로는 본문만 흐른다 — 머리글은 남는다(§1.6). */
        <div className="min-h-0 max-h-[calc(8*2.25rem+2.25rem)] overflow-y-auto">
          <TableCard widths={PORT_COLUMNS}>
            <thead>
              <tr className="sticky top-0 z-sticky">
                <Th>구획</Th>
                <Th align="right">개수</Th>
                <Th>이름</Th>
                <Th>세부</Th>
                <Th aria-label="지우기"><span className="sr-only">지우기</span></Th>
              </tr>
            </thead>
            <tbody>
              {declared.map(({ row }) => {
                const label = labelOf(row, declared, mediumLabel);
                const voltages = voltageOptionsOf(row);
                return (
                  <tr key={row.group} className={cn(TABLE_ROW, 'group')}>
                    <Td className="text-sm text-content">
                      <span className="block truncate">{label}</span>
                    </Td>
                    <Td align="right" className="px-2">
                      <InlineEditCell
                        label={`${label} 개수`}
                        type="number"
                        value={String(row.count)}
                        onCommit={(raw) => {
                          const next = Math.max(Number(raw) || 0, 0);
                          if (next !== row.count) patch(row, { count: next });
                        }}
                      />
                    </Td>
                    {/* 이름은 **어휘가 정한다** — 「{n}」 자리에 번호가 들어간다. 읽는 값이다. */}
                    <Td className="text-sm text-content-muted">
                      <span className="block truncate">{row.namePattern}</span>
                    </Td>
                    {/* 세부 — **그 종류가 요구하는 칸**이다. 전원이면 전압, 다심이면 코어 수. */}
                    <Td className="px-2">
                      {voltages.length > 0 ? (
                        <InlineEditCell
                          label={`${label} 전압`}
                          value={row.voltage ?? ''}
                          options={voltages}
                          onCommit={(raw) => patch(row, { voltage: raw.trim() || null })}
                        />
                      ) : isMultiCorePort(row.positions) ? (
                        <InlineEditCell
                          label={`${label} 심선 수`}
                          type="number"
                          unit=" 코어"
                          value={String(row.positions ?? DEFAULT_CORE_COUNT)}
                          onCommit={(raw) => {
                            const next = Math.max(Number(raw) || 2, 2);
                            if (next !== row.positions) patch(row, { positions: next });
                          }}
                        />
                      ) : (
                        <span className="block px-1 text-sm text-content-faint">{EMPTY}</span>
                      )}
                    </Td>
                    {/* 지우는 손은 **그 줄에 닿았을 때만** 드러난다(§1.7). */}
                    <Td align="right" className="px-1">
                      <IconButton
                        aria-label={`${label} 지우기`}
                        title="지우기"
                        size="sm"
                        className="opacity-0 transition-opacity hover:text-danger group-hover:opacity-100 focus-visible:opacity-100"
                        onClick={() => patch(row, { count: 0 })}
                      >
                        <Trash2 size={14} />
                      </IconButton>
                    </Td>
                  </tr>
                );
              })}

              {adding && (
                <tr className={TABLE_ROW}>
                  <Td className="px-2" colSpan={5}>
                    {/* 고르는 자리가 곧 그 줄이다 — 무엇을 만드는 중인지가 표 안에 있다. */}
                    <Select
                      aria-label="포트 종류"
                      size="sm"
                      autoFocus
                      defaultValue=""
                      onChange={(e) => addPreset(Number(e.currentTarget.value))}
                      onBlur={() => setAdding(false)}
                      onKeyDown={(e) => { if (e.key === 'Escape') setAdding(false); }}
                    >
                      <option value="" disabled>포트 종류를 고르세요</option>
                      {portPresets().map((preset, i) => (
                        <option key={preset.groupKey} value={i}>{preset.name}</option>
                      ))}
                    </Select>
                  </Td>
                </tr>
              )}
            </tbody>
          </TableCard>
        </div>
      )}

      {/* 결과 — 이 장비 품목을 놓으면 생길 판.
          판은 **남는 자리를 다 쓴다**: 포트가 둘이든 스물다섯이든 캔버스는 같은 크기여야
          종류를 옮겨 다닐 때 화면이 출렁이지 않는다. 넘치면 판 안에서 스크롤한다. */}
      {faceplate.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <EmptyState title="포트가 없습니다" description="「＋ 포트 추가」로 이 장비가 갖는 포트를 적으면 판이 여기 나타납니다." />
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
  /* 갈래까지 실린다 — 안 실으면 「전원 입력(교류)」·「전원 입력(직류)」 두 줄이 같은 이름이
     되어 이름 대신 그룹 키가 튀어나온다. */
  const refs = all.map(({ row: r }) => groupRefOfTemplate(r));
  const mine = refs.find((r) => r.group === row.group)!;
  return portGroupLabel(mine, refs, mediumLabel);
}

interface PreviewRow {
  row: PortRow;
  preset: ReturnType<typeof portPresets>[number] | null;
}
