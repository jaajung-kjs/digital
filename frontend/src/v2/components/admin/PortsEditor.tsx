/**
 * PortsEditor — 포트 템플릿 편집
 *
 * **미리 정의된 포트를 고르고 개수만 적는다.** 예전에는 포트 하나를 넣을 때마다 그룹 키·
 * 수량·방향·매체·이름 패턴·선로측 여섯 칸을 빈칸에서 채워야 했고, 그중 그룹 키와 이름
 * 패턴은 사용자가 **지어내야** 하는 값이었다. "24구 네트워크 스위치" 하나 정의하는 데도
 * 내부 규칙을 알아야 했다.
 *
 * 이제 `+ 네트워크` 를 누르면 그 종류의 포트가 규칙에 맞게 만들어지고, 손댈 곳은 개수뿐이다.
 * 나머지 여섯 칸은 `세부 설정` 안에 접어 두어 필요할 때만 연다.
 *
 * 구조 잠금(locked=true): 모든 입력 disabled
 */
import { Plus } from 'lucide-react';
import type { TypeSpecIssue } from '@twin/core';
import { DEFAULT_CORE_COUNT, PORT_DIRECTIONS, portKind, portPresets, uniqueGroupKey } from '@twin/core';
import type { Direction, PortPreset } from '@twin/core';
import { Button, DetailCard, DetailCardHeader, DetailRow, Input, Select, ItemCard } from '../../../components/ui';
import type { V2Catalog } from '../../types';
import type { TypeDraft } from '../../catalogDraft';
import { issueFor } from './adminUtils';

interface PortRow {
  group: string;
  count: number;
  direction: Direction;
  medium: string;
  namePattern: string;
  positions?: number;
}

interface PortsEditorProps {
  draft: TypeDraft;
  onChange: (patch: Partial<TypeDraft>) => void;
  catalog: V2Catalog;
  locked: boolean;
  issues: TypeSpecIssue[];
}

/** 프리셋 하나 → 포트 한 줄. 그룹 키만 이미 쓰인 것을 피해 고른다. */
function rowFromPreset(preset: PortPreset, taken: readonly string[]): PortRow {
  return {
    group: uniqueGroupKey(preset.groupKey, taken),
    count: 1,
    direction: preset.direction,
    medium: preset.medium,
    namePattern: preset.namePattern,
    positions: preset.positions,
  };
}

/** 이 줄이 무엇인지 한눈에 — 접어 둔 세부 설정을 열지 않고도 읽히게. */
function rowTitle(p: PortRow, presets: readonly PortPreset[]): string {
  const preset = presets.find((x) => x.medium === p.medium && x.direction === p.direction);
  return preset ? preset.name : `${p.medium} ${p.direction}`;
}

export function PortsEditor({ draft, onChange, catalog, locked, issues }: PortsEditorProps) {
  const ports = draft.ports;
  const presets = portPresets();

  function update(index: number, patch: Partial<PortRow>) {
    const next = ports.map((p, i) => (i === index ? { ...p, ...patch } : p));
    onChange({ ports: next });
  }

  function remove(index: number) {
    onChange({ ports: ports.filter((_, i) => i !== index) });
  }

  function addPreset(preset: PortPreset) {
    onChange({ ports: [...ports, rowFromPreset(preset, ports.map((p) => p.group))] });
  }

  return (
    <DetailCard>
      <DetailCardHeader title="포트" />

      {ports.length === 0 && !locked && (
        <p className="text-xs text-content-faint">아래에서 포트 종류를 골라 추가하세요.</p>
      )}

      {ports.map((p, i) => {
        const groupIssue = issueFor(issues, `ports[${i}].group`);
        const countIssue = issueFor(issues, `ports[${i}].count`);
        const dirIssue = issueFor(issues, `ports[${i}].direction`);
        const mediumIssue = issueFor(issues, `ports[${i}].medium`);
        const patternIssue = issueFor(issues, `ports[${i}].namePattern`);
        const positionsIssue = issueFor(issues, `ports[${i}].positions`);
        // 접어 둔 안쪽에 문제가 있으면 열어 둔다 — 안 그러면 저장이 막힌 이유가 안 보인다.
        const hasHiddenIssue = Boolean(groupIssue || dirIssue || mediumIssue || patternIssue || positionsIssue);

        return (
          <ItemCard key={i} title={rowTitle(p, presets)} onDelete={locked ? undefined : () => remove(i)}>
            <DetailRow label="개수" issue={countIssue}>
              <Input
                aria-label={`${rowTitle(p, presets)} 개수`}
                type="number"
                value={p.count}
                disabled={locked}
                min={1}
                onChange={(e) => {
                  const val = Number(e.currentTarget.value);
                  update(i, { count: isNaN(val) ? 1 : val });
                }}
              />
            </DetailRow>

            {/* 세부 설정 — 평소에는 접혀 있다. 손실율 같은 파라미터도 앞으로 여기 들어온다. */}
            <details open={hasHiddenIssue} className="mt-1">
              <summary className="cursor-pointer text-xs text-content-muted hover:text-content">세부 설정</summary>
              <div className="mt-1">
                <DetailRow label="그룹" issue={groupIssue}>
                  <Input
                    aria-label={`포트 ${i + 1} 그룹`}
                    value={p.group}
                    disabled={locked}
                    placeholder="예: A"
                    onChange={(e) => update(i, { group: e.currentTarget.value })}
                  />
                </DetailRow>

                <DetailRow label="방향" issue={dirIssue}>
                  <Select
                    aria-label={`포트 ${i + 1} 방향`}
                    value={p.direction}
                    disabled={locked}
                    onChange={(e) => update(i, { direction: e.currentTarget.value as Direction })}
                  >
                    {PORT_DIRECTIONS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </Select>
                </DetailRow>

                <DetailRow label="매체" issue={mediumIssue}>
                  <Select
                    aria-label={`포트 ${i + 1} 매체`}
                    value={p.medium}
                    disabled={locked}
                    onChange={(e) => update(i, { medium: e.currentTarget.value })}
                  >
                    {catalog.cableGroups.map((g) => (
                      <option key={g.key} value={g.key}>
                        {g.name}
                      </option>
                    ))}
                  </Select>
                </DetailRow>

                <DetailRow label="이름 패턴" issue={patternIssue}>
                  <Input
                    aria-label={`포트 ${i + 1} 이름 패턴`}
                    value={p.namePattern}
                    disabled={locked}
                    placeholder="예: 코어 {n}"
                    onChange={(e) => update(i, { namePattern: e.currentTarget.value })}
                  />
                  {p.count > 1 && !p.namePattern.includes('{n}') && !patternIssue && (
                    <span className="text-xs text-content-faint">개수가 2 이상이면 &#123;n&#125; 이 필요합니다</span>
                  )}
                </DetailRow>

                {/* 심선 수는 **다심 종류에만** 뜻이 있다 — 보통 포트에 칸을 두면 어휘가 흐려진다.
                    OPGW 한 가닥이 코어 몇 가닥을 나르는가가 여기서 정해진다. */}
                {portKind(p.medium)?.multiCore && (
                  <DetailRow label="심선 수" issue={positionsIssue}>
                    <Input
                      type="number"
                      aria-label={`포트 ${i + 1} 심선 수`}
                      value={String(p.positions ?? DEFAULT_CORE_COUNT)}
                      disabled={locked}
                      onChange={(e) => update(i, { positions: Number(e.currentTarget.value) })}
                    />
                    <span className="text-xs text-content-faint">케이블 한 가닥 안의 코어 수</span>
                  </DetailRow>
                )}
              </div>
            </details>
          </ItemCard>
        );
      })}

      {/* 종류마다 버튼 하나 — §1.6(개수에 비례해 커지는 UI 금지)의 예외다. 케이블 그룹은
          사용자가 늘리는 데이터가 아니라 **고정 어휘**라(백엔드에 create/delete 가 없다)
          버튼 수가 늘지 않는다. */}
      {!locked && (
        <div className="flex flex-wrap gap-1.5">
          {presets.map((preset) => (
            <Button
              key={preset.groupKey}
              variant="secondary"
              size="sm"
              leftIcon={<Plus size={13} />}
              onClick={() => addPreset(preset)}
            >
              {preset.name}
            </Button>
          ))}
        </div>
      )}
    </DetailCard>
  );
}
