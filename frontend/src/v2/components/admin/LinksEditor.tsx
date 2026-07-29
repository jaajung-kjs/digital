/**
 * LinksEditor — 통과 링크 규칙 편집
 * fromGroup / toGroup (draft.ports의 group 목록에서 select) / mapping(byIndex·all)
 *
 * 구조 잠금(locked=true): 모든 입력 disabled
 */
import { Plus, Trash2 } from 'lucide-react';
import type { TypeSpecIssue } from '@twin/core';
import { DetailCard, DetailCardHeader, Select, IconButton } from '../../../components/ui';
import type { V2Catalog } from '../../types';
import type { TypeDraft } from '../../catalogDraft';
import { issueFor } from './adminUtils';

interface LinkRow {
  fromGroup: string;
  toGroup: string;
  mapping: 'byIndex' | 'all';
}

interface LinksEditorProps {
  draft: TypeDraft;
  onChange: (patch: Partial<TypeDraft>) => void;
  catalog: V2Catalog;
  locked: boolean;
  issues: TypeSpecIssue[];
}

const MAPPINGS: { value: 'byIndex' | 'all'; label: string }[] = [
  { value: 'byIndex', label: '인덱스 매핑 (byIndex)' },
  { value: 'all', label: '전체 매핑 (all)' },
];

function defaultLink(): LinkRow {
  return { fromGroup: '', toGroup: '', mapping: 'byIndex' };
}

export function LinksEditor({ draft, onChange, locked, issues }: LinksEditorProps) {
  const links = draft.links;
  // 현재 draft의 포트 그룹 목록 (select 옵션)
  const portGroups = draft.ports.map((p) => p.group).filter(Boolean);

  function update(index: number, patch: Partial<LinkRow>) {
    const next = links.map((l, i) => (i === index ? { ...l, ...patch } : l));
    onChange({ links: next });
  }

  function remove(index: number) {
    onChange({ links: links.filter((_, i) => i !== index) });
  }

  function add() {
    onChange({ links: [...links, defaultLink()] });
  }

  return (
    <DetailCard>
      <DetailCardHeader title="통과 링크 규칙" />

      {portGroups.length === 0 && !locked && (
        <p className="text-xs text-content-faint">
          포트 템플릿을 먼저 등록해야 링크 규칙을 설정할 수 있습니다.
        </p>
      )}

      {links.length === 0 && portGroups.length > 0 && !locked && (
        <p className="text-xs text-content-faint">링크 규칙이 없습니다. + 추가로 등록하세요.</p>
      )}

      {links.map((l, i) => {
        const fromIssue = issueFor(issues, `links[${i}].fromGroup`);
        const toIssue = issueFor(issues, `links[${i}].toGroup`);
        const mappingIssue = issueFor(issues, `links[${i}].mapping`);
        const pairIssue = issueFor(issues, `links[${i}]`);

        return (
          <div key={i} className="rounded border border-line bg-surface-2 p-2 space-y-1.5">
            <div className="flex items-center gap-1">
              <span className="flex-1 text-xs text-content-muted">링크 {i + 1}</span>
              {!locked && (
                <IconButton aria-label={`링크 ${i + 1} 삭제`} onClick={() => remove(i)}>
                  <Trash2 size={13} />
                </IconButton>
              )}
            </div>

            {pairIssue && <span className="text-xs text-danger">{pairIssue}</span>}

            {/* fromGroup */}
            <div className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-xs text-content-muted">출발 그룹</span>
              <div className="flex flex-1 flex-col gap-0.5">
                <Select
                  aria-label={`링크 ${i + 1} 출발 그룹`}
                  value={l.fromGroup}
                  disabled={locked}
                  onChange={(e) => {
                    const val = e.currentTarget.value;
                    update(i, { fromGroup: val });
                  }}
                >
                  <option value="">-- 선택 --</option>
                  {portGroups.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </Select>
                {fromIssue && <span className="text-xs text-danger">{fromIssue}</span>}
              </div>
            </div>

            {/* toGroup */}
            <div className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-xs text-content-muted">도착 그룹</span>
              <div className="flex flex-1 flex-col gap-0.5">
                <Select
                  aria-label={`링크 ${i + 1} 도착 그룹`}
                  value={l.toGroup}
                  disabled={locked}
                  onChange={(e) => {
                    const val = e.currentTarget.value;
                    update(i, { toGroup: val });
                  }}
                >
                  <option value="">-- 선택 --</option>
                  {portGroups.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </Select>
                {toIssue && <span className="text-xs text-danger">{toIssue}</span>}
              </div>
            </div>

            {/* mapping */}
            <div className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-xs text-content-muted">매핑</span>
              <div className="flex flex-1 flex-col gap-0.5">
                <Select
                  aria-label={`링크 ${i + 1} 매핑`}
                  value={l.mapping}
                  disabled={locked}
                  onChange={(e) => {
                    const val = e.currentTarget.value as 'byIndex' | 'all';
                    update(i, { mapping: val });
                  }}
                >
                  {MAPPINGS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </Select>
                {mappingIssue && <span className="text-xs text-danger">{mappingIssue}</span>}
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
