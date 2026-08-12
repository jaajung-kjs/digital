/**
 * PortsEditor — 포트 템플릿 편집. **줄 수가 고정된 표**다.
 *
 * 포트 종류는 고정 어휘다(`PORT_KINDS` → `portPresets()` 일곱 줄). 그러니 편집기도 고정일
 * 수 있다: 종류마다 한 줄, 개수만 적는다. 0 이면 그 종류가 없는 것이다.
 *
 * 예전에는 종류를 고를 때마다 카드가 하나씩 쌓였다 — 네 그룹이면 398px, 일곱이면 600px 로
 * 자라서 자산마다 편집 화면의 키가 달랐고, 아래 있는 것(판 미리보기·저장 바)이 화면 밖으로
 * 밀렸다. CONVENTIONS §1.6 이 금지하는 「개수에 비례해 커지는 UI」가 바로 이것이다.
 * 이제 무엇을 고르든 표의 키는 그대로다.
 *
 * **묻는 것은 개수뿐**이다. 그룹 키·방향·매체·이름 패턴은 종류가 이미 정한 값이라 물어 봐야
 * 답이 하나뿐인 칸이었다. 심선 수만 다심 줄에 남는다 — 같은 광이라도 성단이 24심인지
 * 12심인지는 물건마다 다르므로 종류가 대신 정해 줄 수 없다.
 *
 * 구조 잠금(locked=true): 모든 입력 disabled
 */
import { useMemo } from 'react';
import type { TypeSpecIssue } from '@twin/core';
import { DEFAULT_CORE_COUNT, isMultiCorePort, portPresets, uniqueGroupKey } from '@twin/core';
import type { Direction } from '@twin/core';
import { DetailCard, DetailCardHeader, DetailNote, DetailRow, Input, cn } from '../../../components/ui';
import type { TypeDraft } from '../../catalogDraft';
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

export function PortsEditor({ draft, onChange, locked, issues }: PortsEditorProps) {
  const ports = draft.ports;

  /* 표의 줄 — 프리셋 일곱이 먼저, 그다음 **어느 프리셋과도 안 맞는 것**.
     후자는 지금 데이터에 하나도 없지만(자산 종류 23개 전부 중복 0건), 있다고 해서 조용히
     지워 버리면 안 된다. 뒤에 붙여 그대로 보여 주고 개수만 고칠 수 있게 둔다. */
  const rows = useMemo(() => {
    const presets = portPresets();
    const byKind = new Map(ports.map((p) => [kindOf(p), p]));
    const known = presets.map((preset) => ({
      key: kindOf(preset),
      label: preset.name,
      preset,
      port: byKind.get(kindOf(preset)) ?? null,
    }));
    const knownKeys = new Set(known.map((r) => r.key));
    const extra = ports
      .filter((p) => !knownKeys.has(kindOf(p)))
      .map((p) => ({
        key: `x:${p.group}`,
        label: p.namePattern.replace(/\s*\{n\}\s*/, '').trim() || p.group,
        preset: null,
        port: p,
      }));
    return [...known, ...extra];
  }, [ports]);

  /** 개수를 바꾼다 — 0 이면 그 종류를 뺀다. 있던 줄이면 나머지 값(그룹 키·이름)은 그대로 둔다. */
  function setCount(row: (typeof rows)[number], raw: string) {
    const count = Math.max(Number(raw) || 0, 0);
    if (row.port) {
      const port = row.port;
      onChange({
        ports: count === 0
          ? ports.filter((p) => p !== port)
          : ports.map((p) => (p === port ? { ...p, count } : p)),
      });
      return;
    }
    if (count === 0 || !row.preset) return;
    const added: PortRow = {
      group: uniqueGroupKey(row.preset.groupKey, ports.map((p) => p.group)),
      count,
      direction: row.preset.direction,
      medium: row.preset.medium,
      namePattern: row.preset.namePattern,
      positions: row.preset.positions,
    };
    onChange({ ports: [...ports, added] });
  }

  function setPositions(row: (typeof rows)[number], raw: string) {
    const port = row.port;
    if (!port) return;
    const positions = Math.max(Number(raw) || 2, 2);
    onChange({ ports: ports.map((p) => (p === port ? { ...p, positions } : p)) });
  }

  const total = ports.reduce((n, p) => n + p.count, 0);

  return (
    <DetailCard>
      <DetailCardHeader title="포트" badge={`${total}개`} badgeStatus={total > 0 ? 'success' : 'neutral'} />

      <div className="space-y-1">
        {rows.map((row) => {
          const i = row.port ? ports.indexOf(row.port) : -1;
          const countIssue = i >= 0 ? issueFor(issues, `ports[${i}].count`) : undefined;
          const positionsIssue = i >= 0 ? issueFor(issues, `ports[${i}].positions`) : undefined;
          const on = (row.port?.count ?? 0) > 0;
          const multi = isMultiCorePort(row.port?.positions ?? row.preset?.positions);

          return (
            <DetailRow
              key={row.key}
              /* 없는 종류는 흐리게 — 표는 늘 일곱 줄이므로, 무엇이 켜져 있는지가 색으로
                 먼저 읽혀야 줄을 세어 가며 찾지 않는다. */
              label={<span className={cn(!on && 'text-content-faint')}>{row.label}</span>}
              issue={countIssue ?? positionsIssue}
            >
              {/* 두 자리 숫자 칸이라 폭을 내용에 맞춘다 — `DetailRow` 의 기본(22rem)은
                  이름 같은 글 입력에 맞춘 치수다. */}
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  aria-label={`${row.label} 개수`}
                  className="w-24"
                  min={0}
                  value={String(row.port?.count ?? 0)}
                  disabled={locked}
                  onChange={(e) => setCount(row, e.currentTarget.value)}
                />
                {/* 심선 수는 다심 줄에만, 그것도 켜져 있을 때만 — 꺼진 줄에 칸이 서면
                    표가 들쭉날쭉해진다. */}
                {multi && on && (
                  <>
                    <span className="shrink-0 text-xs text-content-muted">심선</span>
                    <Input
                      type="number"
                      aria-label={`${row.label} 심선 수`}
                      className="w-24"
                      min={2}
                      value={String(row.port?.positions ?? DEFAULT_CORE_COUNT)}
                      disabled={locked}
                      onChange={(e) => setPositions(row, e.currentTarget.value)}
                    />
                  </>
                )}
              </div>
            </DetailRow>
          );
        })}
      </div>

      <DetailNote>개수를 0 으로 두면 그 종류의 포트가 없습니다.</DetailNote>
    </DetailCard>
  );
}
