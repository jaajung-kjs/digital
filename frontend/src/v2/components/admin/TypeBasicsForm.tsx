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
import { LaborSpecForm } from './LaborSpecForm';
import { DetailCard, DetailCardHeader, DetailRow, Input, Select } from '../../../components/ui';
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
        <DetailRow label="이름" required issue={issueFor(issues, 'name')}>
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
        <DetailRow label="분류" required issue={issueFor(issues, 'categoryKey')}>
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

        {/*
          **계통에 서는 반인가** — 세지 않고 묻는다.
          한때 「전원 출력이 둘 이상이면 반」으로 셌고, 그 눈이 랙 안의 −48V 분배반(분기 일곱)을
          변전소 계통 표에 끌어들였다. 나누는 판인지는 물건의 성질이라 여기서 정한다.
        */}
        <DetailRow label="계통">
          <label className="flex items-center gap-2 text-sm text-content">
            <input
              type="checkbox"
              className="size-4"
              checked={draft.managesPowerCircuits ?? false}
              onChange={(e) => onChange({ managesPowerCircuits: e.currentTarget.checked })}
            />
            분전반 — 계통에 회로를 편다
          </label>
        </DetailRow>

      </DetailCard>

      {/* 공량·단가는 **세 화면이 같은 폼**을 쓴다 — 칸은 어휘가 정한다(`laborSpec`). */}
      <LaborSpecForm
        carrier="asset"
        resetKey={draft.key || "new"}
        spec={draft}
        onChange={(patch) => onChange(patch)}
        issueFor={(path) => issueFor(issues, path)}
      />
    </div>
  );
}
