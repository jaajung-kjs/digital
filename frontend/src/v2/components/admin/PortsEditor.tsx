/**
 * PortsEditor — 포트 템플릿 편집
 *
 * **미리 정의된 포트를 고르고 개수만 적는다.** 예전에는 포트 하나를 넣을 때마다 그룹 키·
 * 수량·방향·매체·이름 패턴·선로측 여섯 칸을 빈칸에서 채워야 했고, 그중 그룹 키와 이름
 * 패턴은 사용자가 **지어내야** 하는 값이었다. "24구 네트워크 스위치" 하나 정의하는 데도
 * 내부 규칙을 알아야 했다.
 *
 * 이제 `+ 네트워크` 를 누르면 그 종류의 포트가 규칙에 맞게 만들어지고, **손댈 곳은 개수뿐**이다.
 * 그룹 키·방향·매체·이름 패턴은 아예 묻지 않는다 — 고른 종류가 이미 다 정한 값이라, 물어
 * 봐야 답이 하나뿐인 칸이었다(접어 뒀어도 「무엇을 적어야 하나」를 고민하게 만든다).
 * 심선 수만 남는다: 같은 광이라도 성단이 24심인지 12심인지는 물건마다 다르다.
 *
 * 판 미리보기가 옆에 선다 — 개수를 고치면 그 자리에서 판이 바뀐다. 「24구 스위치」가
 * 실제로 어떻게 보이는지 저장하고 자산을 놓아 봐야 알던 것을 여기서 끝낸다.
 *
 * 구조 잠금(locked=true): 모든 입력 disabled
 */
import { Plus } from 'lucide-react';
import type { TypeSpecIssue } from '@twin/core';
import { DEFAULT_CORE_COUNT, isMultiCorePort, portKind, portPresets, uniqueGroupKey } from '@twin/core';
import type { Direction, PortPreset } from '@twin/core';
import { Button, DetailCard, DetailCardHeader, DetailRow, Input, ItemCard } from '../../../components/ui';
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

export function PortsEditor({ draft, onChange, locked, issues }: PortsEditorProps) {
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
        const countIssue = issueFor(issues, `ports[${i}].count`);
        const positionsIssue = issueFor(issues, `ports[${i}].positions`);

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

            {/* 심선 수 — **다심이 있는 종류에만**(광). 같은 광이라도 성단이 24심인지
                12심인지는 물건마다 다르므로, 이건 고른 종류가 대신 정해 줄 수 없다.
                그 밖의 값(그룹 키·방향·매체·이름)은 종류가 정하므로 묻지 않는다. */}
            {portKind(p.medium)?.multiCore && isMultiCorePort(p.positions) && (
              <DetailRow label="심선 수" issue={positionsIssue}>
                <Input
                  type="number"
                  aria-label={`포트 ${i + 1} 심선 수`}
                  value={String(p.positions ?? DEFAULT_CORE_COUNT)}
                  disabled={locked}
                  min={2}
                  onChange={(e) => update(i, { positions: Number(e.currentTarget.value) })}
                />
                <span className="text-xs text-content-faint">케이블 한 가닥 안의 코어 수</span>
              </DetailRow>
            )}
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
