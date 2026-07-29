/**
 * PortsEditor — 포트 템플릿 편집
 * group / count / direction(IN·OUT·BI) / medium(cableGroups key) / namePattern / lineSide(선로측)
 *
 * 구조 잠금(locked=true): 모든 입력 disabled
 */
import { Plus, Trash2 } from 'lucide-react';
import type { TypeSpecIssue } from '@twin/core';
import type { Direction } from '@twin/core';
import { DetailCard, DetailCardHeader, Input, Select, IconButton } from '../../../components/ui';
import type { V2Catalog } from '../../types';
import type { TypeDraft } from '../../catalogDraft';
import { issueFor } from './adminUtils';

interface PortRow {
  group: string;
  count: number;
  direction: Direction;
  medium: string;
  namePattern: string;
  lineSide?: boolean;
}

interface PortsEditorProps {
  draft: TypeDraft;
  onChange: (patch: Partial<TypeDraft>) => void;
  catalog: V2Catalog;
  locked: boolean;
  issues: TypeSpecIssue[];
}

const DIRECTIONS: { value: Direction; label: string }[] = [
  { value: 'IN', label: 'IN' },
  { value: 'OUT', label: 'OUT' },
  { value: 'BI', label: 'BI (양방향)' },
];

function defaultPort(catalog: V2Catalog): PortRow {
  return {
    group: '',
    count: 1,
    direction: 'BI',
    medium: catalog.cableGroups[0]?.key ?? '',
    namePattern: '',
  };
}

export function PortsEditor({ draft, onChange, catalog, locked, issues }: PortsEditorProps) {
  const ports = draft.ports;

  function update(index: number, patch: Partial<PortRow>) {
    const next = ports.map((p, i) => (i === index ? { ...p, ...patch } : p));
    onChange({ ports: next });
  }

  function remove(index: number) {
    onChange({ ports: ports.filter((_, i) => i !== index) });
  }

  function add() {
    onChange({ ports: [...ports, defaultPort(catalog)] });
  }

  return (
    <DetailCard>
      <DetailCardHeader title="포트 템플릿" />

      {ports.length === 0 && !locked && (
        <p className="text-xs text-content-faint">포트 템플릿이 없습니다. + 추가로 등록하세요.</p>
      )}

      {ports.map((p, i) => {
        const groupIssue = issueFor(issues, `ports[${i}].group`);
        const countIssue = issueFor(issues, `ports[${i}].count`);
        const dirIssue = issueFor(issues, `ports[${i}].direction`);
        const mediumIssue = issueFor(issues, `ports[${i}].medium`);
        const patternIssue = issueFor(issues, `ports[${i}].namePattern`);
        const lineSideIssue = issueFor(issues, `ports[${i}].lineSide`);

        return (
          <div key={i} className="rounded border border-line bg-surface-2 p-2 space-y-1.5">
            <div className="flex items-center gap-1">
              <span className="flex-1 text-xs text-content-muted">포트 {i + 1}</span>
              {!locked && (
                <IconButton aria-label={`포트 ${i + 1} 삭제`} onClick={() => remove(i)}>
                  <Trash2 size={13} />
                </IconButton>
              )}
            </div>

            {/* group */}
            <div className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-xs text-content-muted">그룹</span>
              <div className="flex flex-1 flex-col gap-0.5">
                <Input
                  aria-label={`포트 ${i + 1} 그룹`}
                  value={p.group}
                  disabled={locked}
                  placeholder="예: A"
                  onChange={(e) => {
                    const val = e.currentTarget.value;
                    update(i, { group: val });
                  }}
                />
                {groupIssue && <span className="text-xs text-danger">{groupIssue}</span>}
              </div>
            </div>

            {/* count */}
            <div className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-xs text-content-muted">수량</span>
              <div className="flex flex-1 flex-col gap-0.5">
                <Input
                  aria-label={`포트 ${i + 1} 수량`}
                  type="number"
                  value={p.count}
                  disabled={locked}
                  min={1}
                  onChange={(e) => {
                    const val = Number(e.currentTarget.value);
                    update(i, { count: isNaN(val) ? 1 : val });
                  }}
                />
                {countIssue && <span className="text-xs text-danger">{countIssue}</span>}
              </div>
            </div>

            {/* direction */}
            <div className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-xs text-content-muted">방향</span>
              <div className="flex flex-1 flex-col gap-0.5">
                <Select
                  aria-label={`포트 ${i + 1} 방향`}
                  value={p.direction}
                  disabled={locked}
                  onChange={(e) => {
                    const val = e.currentTarget.value as Direction;
                    update(i, { direction: val });
                  }}
                >
                  {DIRECTIONS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </Select>
                {dirIssue && <span className="text-xs text-danger">{dirIssue}</span>}
              </div>
            </div>

            {/* medium */}
            <div className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-xs text-content-muted">매체</span>
              <div className="flex flex-1 flex-col gap-0.5">
                <Select
                  aria-label={`포트 ${i + 1} 매체`}
                  value={p.medium}
                  disabled={locked}
                  onChange={(e) => {
                    const val = e.currentTarget.value;
                    update(i, { medium: val });
                  }}
                >
                  {catalog.cableGroups.map((g) => (
                    <option key={g.key} value={g.key}>
                      {g.name} ({g.key})
                    </option>
                  ))}
                </Select>
                {mediumIssue && <span className="text-xs text-danger">{mediumIssue}</span>}
              </div>
            </div>

            {/* namePattern */}
            <div className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-xs text-content-muted">이름 패턴</span>
              <div className="flex flex-1 flex-col gap-0.5">
                <Input
                  aria-label={`포트 ${i + 1} 이름 패턴`}
                  value={p.namePattern}
                  disabled={locked}
                  placeholder="예: 코어 {n}"
                  onChange={(e) => {
                    const val = e.currentTarget.value;
                    update(i, { namePattern: val });
                  }}
                />
                {patternIssue && <span className="text-xs text-danger">{patternIssue}</span>}
                {p.count > 1 && !p.namePattern.includes('{n}') && !patternIssue && (
                  <span className="text-xs text-content-faint">수량이 2 이상이면 &#123;n&#125; 이 필요합니다</span>
                )}
              </div>
            </div>

            {/* lineSide (선로측) */}
            <div className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-xs text-content-muted">선로측</span>
              <div className="flex flex-1 flex-col gap-0.5">
                <label className="flex items-center gap-2 text-xs text-content">
                  <input
                    type="checkbox"
                    aria-label={`포트 ${i + 1} 선로측`}
                    checked={p.lineSide ?? false}
                    disabled={locked}
                    onChange={(e) => {
                      update(i, { lineSide: e.currentTarget.checked });
                    }}
                  />
                  선로측 (meta 기록 대상)
                </label>
                {lineSideIssue && <span className="text-xs text-danger">{lineSideIssue}</span>}
              </div>
            </div>
          </div>
        );
      })}

      <button
        type="button"
        disabled={locked}
        onClick={add}
        className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
      >
        <Plus size={13} />
        추가
      </button>
    </DetailCard>
  );
}
