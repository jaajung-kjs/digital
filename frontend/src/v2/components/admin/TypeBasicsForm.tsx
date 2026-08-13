/**
 * TypeBasicsForm — 기본정보 · 배치 · 공량 편집 섹션
 *
 * Props:
 *   draft    — TypeDraft (V2CatalogAdminPage 가 owns, spread-patch 로만 수정)
 *   catalog  — V2Catalog (분류 목록 등)
 *   onChange — (patch: Partial<TypeDraft>) => void
 *   issues   — TypeSpecIssue[] (draftIssues 결과)
 */
import type { TypeSpecIssue } from '@twin/core';
import { LaborTypeSelect } from './LaborTypeSelect';
import { DetailCard, DetailCardHeader, DetailGrid, DetailRow, Input, Select } from '../../../components/ui';
import type { V2Catalog } from '../../types';
import type { TypeDraft } from '../../catalogDraft';
import { issueFor } from './adminUtils';

interface TypeBasicsFormProps {
  draft: TypeDraft;
  catalog: V2Catalog;
  onChange: (patch: Partial<TypeDraft>) => void;
  issues: TypeSpecIssue[];
}

export function TypeBasicsForm({ draft, catalog, onChange, issues }: TypeBasicsFormProps) {

  return (
    <div className="flex flex-col gap-3">
      {/* ── 기본정보 ─────────────────────────────────────────────────── */}
      <DetailCard>
        <DetailCardHeader title="기본정보" />

        {/* 키는 묻지 않는다 — 시드·마이그레이션이 종류를 가리키는 참조용 식별자이지 현장에서
            부르는 이름이 아니다. 필수 입력으로 두면 새 종류를 만들 때마다 아무도 읽지 않을
            영문 키를 지어내야 했다. 새로 만들 때는 서버가 붙인다. */}

        {/* 이름 */}
        <DetailRow label="이름" issue={issueFor(issues, 'name')}>
            <Input
              aria-label="이름"
              value={draft.name}
              onChange={(e) => {
                const val = e.currentTarget.value;
                onChange({ name: val });
              }}
              placeholder="예: 광단말"
            />
        </DetailRow>

        {/* 분류 */}
        <DetailRow label="분류" issue={issueFor(issues, 'categoryKey')}>
            <Select
              aria-label="분류"
              value={draft.categoryId}
              onChange={(e) => {
                const val = e.currentTarget.value;
                onChange({ categoryId: val });
              }}
            >
              {catalog.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
        </DetailRow>

      </DetailCard>

      {/* ── 공량 ─────────────────────────────────────────────────────── */}
      <DetailCard>
        <DetailCardHeader title="공량" />

        <DetailRow label="노무유형">
          <LaborTypeSelect value={draft.laborCode ?? null} onChange={(code) => onChange({ laborCode: code })} />
        </DetailRow>

        {/* 시간 셋은 나란히 읽는 값이다 — 한 줄에 하나씩 쌓으면 카드만 길어진다. */}
        <DetailGrid>
        <DetailRow label="신설(h)" issue={issueFor(issues, 'labor.installHours')}>
            <Input
              aria-label="신설(h)"
              type="number"
              value={draft.installHours}
              onChange={(e) => {
                const val = parseFloat(e.currentTarget.value);
                onChange({ installHours: isNaN(val) ? 0 : val });
              }}
            />
        </DetailRow>

        <DetailRow label="철거(h)" issue={issueFor(issues, 'labor.removeHours')}>
            <Input
              aria-label="철거(h)"
              type="number"
              value={draft.removeHours}
              onChange={(e) => {
                const val = parseFloat(e.currentTarget.value);
                onChange({ removeHours: isNaN(val) ? 0 : val });
              }}
            />
        </DetailRow>

        <DetailRow label="이설(h)" issue={issueFor(issues, 'labor.relocateHours')}>
            <Input
              aria-label="이설(h)"
              type="number"
              value={draft.relocateHours}
              onChange={(e) => {
                const val = parseFloat(e.currentTarget.value);
                onChange({ relocateHours: isNaN(val) ? 0 : val });
              }}
            />
        </DetailRow>
        </DetailGrid>
      </DetailCard>
    </div>
  );
}
