/**
 * PortsEditor — **판이 곧 편집기**다. 미리보기와 입력 칸이 한 장에 있다.
 *
 * 앞서 두 번 잘못 갔다.
 *   1) 종류를 고를 때마다 카드가 쌓였다 — 네 그룹 398px, 일곱이면 600px(§1.6 위반).
 *   2) 그래서 일곱 줄 고정 표로 바꿨더니, **한 자리 숫자 일곱 개를 받으려고 세로 376px**
 *      를 쓰고 그 옆에 판을 또 그렸다. 고정은 됐지만 여전히 헐렁했다.
 *
 * 개수는 그 구획이 무엇인지 말하는 값이므로 **구획 라벨 옆이 제 자리**다. 판 위에서 바로
 * 고치면 고친 결과가 같은 자리에서 바뀐다 — 미리보기를 따로 둘 이유가 없어진다.
 *
 * 판의 키는 **포트가 늘어도 그대로**다(`max-h` + 안쪽 스크롤). 24구 스위치를 만들어도
 * 화면이 밀리지 않는다.
 *
 * **묻는 것은 개수와 심선 수뿐**이다. 그룹 키·방향·매체·이름 패턴은 종류가 이미 정한 값이라
 * 물어 봐야 답이 하나뿐인 칸이었다.
 *
 * 구조 잠금(locked=true): 모든 입력 disabled
 */
import { useMemo } from 'react';
import type { TypeSpecIssue } from '@twin/core';
import { DEFAULT_CORE_COUNT, isMultiCorePort, portPresets, uniqueGroupKey } from '@twin/core';
import type { Direction } from '@twin/core';
import { DetailCard, DetailCardHeader, DetailNote, cn } from '../../../components/ui';
import { useMediumColor, useMediumLabel } from '../../hooks';
import type { TypeDraft } from '../../catalogDraft';
import { PortFaceplate } from '../detail/PortFaceplate';
import { portSections } from './portSections';
import { issueFor } from './adminUtils';

type PortRow = TypeDraft['ports'][number];

interface PortsEditorProps {
  draft: TypeDraft;
  onChange: (patch: Partial<TypeDraft>) => void;
  locked: boolean;
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

/** 판 위에 앉는 개수 칸 — 실크스크린 글자 옆이라 테두리 없이 작게. */
function CountField({
  label, value, min, disabled, onChange,
}: {
  label: string;
  value: number;
  min: number;
  disabled: boolean;
  onChange: (raw: string) => void;
}) {
  return (
    <input
      type="number"
      aria-label={label}
      value={String(value)}
      min={min}
      disabled={disabled}
      onChange={(e) => onChange(e.currentTarget.value)}
      /* 판 위의 칸이라 상자를 그리지 않는다 — `Input` 을 쓰면 38px 짜리 폼 칸이 실크스크린
         라벨 옆에 서서 판이 폼으로 보인다. 대신 밑줄과 배경으로 「고칠 수 있는 값」을 알린다. */
      className={cn(
        'w-9 rounded bg-surface/70 px-1 text-center text-xs tabular-nums text-content',
        'border border-line focus:outline-none focus:ring-1 focus:ring-primary',
        'disabled:cursor-not-allowed disabled:opacity-60',
        '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none',
      )}
    />
  );
}

export function PortsEditor({ draft, onChange, locked, issues }: PortsEditorProps) {
  const ports = draft.ports;
  const mediumLabel = useMediumLabel();
  const mediumColor = useMediumColor();

  /* 선언 목록 — 이미 있는 것 + **없는 종류도 0개짜리로**.
     없는 종류가 판에서 사라지면 켤 때마다 구획이 생겼다 없어져 판이 출렁인다. 0개짜리로
     자리를 지켜 두면 판의 모양이 늘 같고, 그 자리에서 숫자만 올리면 된다. */
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
    if (!existing) {
      // 0개였던 종류를 켠다 — 선언이 그때 생긴다.
      if ((next.count ?? 0) <= 0) return;
      onChange({ ports: [...ports, { ...row, ...next }] });
      return;
    }
    if (next.count === 0) {
      onChange({ ports: ports.filter((p) => p !== existing) });
      return;
    }
    onChange({ ports: ports.map((p) => (p === existing ? { ...p, ...next } : p)) });
  }

  /** 판에 얹을 구획 — 라벨 자리에 개수 칸이 함께 선다. */
  const faceplate = sections.map((section) => {
    const found = declared.find((d) => d.row.group === section.key);
    const row = found?.row;
    const i = row ? ports.findIndex((p) => p === ports.find((q) => q.group === row.group)) : -1;
    const multi = isMultiCorePort(row?.positions);
    return {
      key: section.key,
      accent: section.accent,
      ports: section.ports,
      label: (
        <span className="flex items-center gap-1">
          <span className={cn(section.ports.length === 0 && 'opacity-60')}>{section.labelText}</span>
          {row && (
            <CountField
              label={`${section.labelText} 개수`}
              value={row.count}
              min={0}
              disabled={locked}
              onChange={(raw) => patch(row, { count: Math.max(Number(raw) || 0, 0) })}
            />
          )}
          {/* 심선 수는 다심 구획에만, 그것도 켜져 있을 때만 — 꺼진 구획에 칸이 둘 서면
              판이 들쭉날쭉해진다. */}
          {row && multi && row.count > 0 && (
            <>
              <span className="opacity-70">×</span>
              <CountField
                label={`${section.labelText} 심선 수`}
                value={row.positions ?? DEFAULT_CORE_COUNT}
                min={2}
                disabled={locked}
                onChange={(raw) => patch(row, { positions: Math.max(Number(raw) || 2, 2) })}
              />
            </>
          )}
        </span>
      ),
      issue: i >= 0 ? issueFor(issues, `ports[${i}].count`) ?? issueFor(issues, `ports[${i}].positions`) : undefined,
    };
  });

  const total = ports.reduce((n, p) => n + p.count, 0);
  const issue = faceplate.map((f) => f.issue).find(Boolean);

  return (
    <DetailCard>
      <DetailCardHeader title="포트" badge={`${total}개`} badgeStatus={total > 0 ? 'success' : 'neutral'} />
      {issue && <p className="text-xs text-danger">{issue}</p>}

      {/* 판의 키는 포트 수와 무관하게 고정 — 24구 스위치를 만들어도 아래가 밀리지 않는다. */}
      <div className="max-h-72 overflow-y-auto">
        <PortFaceplate
          sections={faceplate}
          stateOf={() => 'empty'}
          cableCountOf={() => 0}
          selectedPortId={null}
          onSelect={() => {}}
        />
      </div>

      <DetailNote>구획 이름 옆 숫자가 포트 개수입니다. 0 으로 두면 그 종류가 없습니다.</DetailNote>
    </DetailCard>
  );
}

interface PreviewRow {
  row: PortRow;
  preset: ReturnType<typeof portPresets>[number] | null;
}
