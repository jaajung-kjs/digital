/**
 * LinksEditor — 통과 링크 규칙 편집
 * fromGroup / toGroup (draft.ports의 group 목록에서 select) / mapping(byIndex·all·byPosition)
 *
 * 구조 잠금(locked=true): 모든 입력 disabled
 */
import { Plus } from 'lucide-react';
import { derivedLinks, portGroupLabel, type LinkMapping, type TypeSpecIssue } from '@twin/core';
import { Button, DetailCard, DetailCardHeader, DetailRow, Select, ItemCard } from '../../../components/ui';
import type { V2Catalog } from '../../types';
import type { TypeDraft } from '../../catalogDraft';
import { issueFor } from './adminUtils';

interface LinkRow {
  fromGroup: string;
  toGroup: string;
  mapping: LinkMapping;
}

interface LinksEditorProps {
  draft: TypeDraft;
  onChange: (patch: Partial<TypeDraft>) => void;
  catalog: V2Catalog;
  locked: boolean;
  issues: TypeSpecIssue[];
}

const MAPPINGS: { value: LinkMapping; label: string }[] = [
  { value: 'byIndex', label: '번호끼리 (byIndex)' },
  { value: 'all', label: '모두 서로 (all)' },
  // 다심 포트 한 개가 상대 그룹의 포트 여럿에 코어 번호로 대응한다 — 경로슬롯의 인입↔심선.
  { value: 'byPosition', label: '코어 번호끼리 (byPosition)' },
];

function defaultLink(): LinkRow {
  return { fromGroup: '', toGroup: '', mapping: 'byIndex' };
}

const MAPPING_LABEL = (m: LinkMapping) => MAPPINGS.find((x) => x.value === m)?.label ?? m;

export function LinksEditor({ draft, onChange, locked, issues }: LinksEditorProps) {
  const links = draft.links;
  // 현재 draft의 포트 그룹 목록 (select 옵션)
  const portGroups = draft.ports.map((p) => p.group).filter(Boolean);

  /* 포트 선언에서 저절로 정해지는 통과 — 전원 입력↔출력, 다심 인입↔앞면.
     보여 주지 않으면 추적이 이 장비를 왜 지나가는지 알 방법이 없다(예전에는 이것들을
     시드에 손으로 적어 두었고, 그래서 축전지 하나가 빠져 있어도 아무도 몰랐다). */
  const auto = derivedLinks(draft.ports);
  const groupLabel = (key: string) => {
    const p = draft.ports.find((x) => x.group === key);
    return p ? portGroupLabel(p, draft.ports) : key;
  };

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
        <p className="text-xs text-content-faint">포트 템플릿을 먼저 등록해야 링크 규칙을 설정할 수 있습니다.</p>
      )}

      {auto.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-content-muted">포트 선언에서 자동으로 정해지는 통과</p>
          {auto.map((l) => (
            <div key={`${l.fromGroup}-${l.toGroup}`} className="flex items-center gap-2 text-xs text-content-faint">
              <span className="text-content">{groupLabel(l.fromGroup)}</span>
              <span aria-hidden>→</span>
              <span className="text-content">{groupLabel(l.toGroup)}</span>
              <span>· {MAPPING_LABEL(l.mapping)}</span>
            </div>
          ))}
        </div>
      )}

      {links.length === 0 && portGroups.length > 0 && !locked && (
        <p className="text-xs text-content-faint">
          {auto.length > 0
            ? '그 밖의 통과(한 함체 안 모듈 사이의 버스 같은)는 + 추가로 등록하세요.'
            : '링크 규칙이 없습니다. + 추가로 등록하세요.'}
        </p>
      )}

      {links.map((l, i) => {
        const fromIssue = issueFor(issues, `links[${i}].fromGroup`);
        const toIssue = issueFor(issues, `links[${i}].toGroup`);
        const mappingIssue = issueFor(issues, `links[${i}].mapping`);
        const pairIssue = issueFor(issues, `links[${i}]`);

        return (
          <ItemCard key={i} title={`링크 ${i + 1}`} onDelete={locked ? undefined : () => remove(i)}>

            {pairIssue && <span className="text-xs text-danger">{pairIssue}</span>}

            {/* fromGroup */}
            <DetailRow label="출발 그룹" issue={fromIssue}>
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
            </DetailRow>

            {/* toGroup */}
            <DetailRow label="도착 그룹" issue={toIssue}>
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
            </DetailRow>

            {/* mapping */}
            <DetailRow label="매핑" issue={mappingIssue}>
              <Select
                aria-label={`링크 ${i + 1} 매핑`}
                value={l.mapping}
                disabled={locked}
                onChange={(e) => {
                  const val = e.currentTarget.value as LinkMapping;
                  update(i, { mapping: val });
                }}
              >
                {MAPPINGS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </DetailRow>
          </ItemCard>
        );
      })}

      <Button variant="secondary" size="sm" disabled={locked} leftIcon={<Plus size={13} />} onClick={add}>
        추가
      </Button>
    </DetailCard>
  );
}
