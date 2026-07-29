/**
 * TypeBasicsForm — 기본정보 · 배치 · 공량 편집 섹션
 *
 * Props:
 *   draft    — TypeDraft (V2CatalogAdminPage 가 owns, spread-patch 로만 수정)
 *   original — V2AssetType | null (null = 신규)
 *   catalog  — V2Catalog (분류 목록 등)
 *   onChange — (patch: Partial<TypeDraft>) => void
 *   issues   — TypeSpecIssue[] (draftIssues 결과)
 *   locked   — boolean (assetCount > 0 → 일부 구조 편집 잠금, 기본정보엔 현재 미사용)
 */
import type { TypeSpecIssue } from '@twin/core';
import { DetailCard, DetailCardHeader, DetailRow, Input, Select } from '../../../components/ui';
import type { V2AssetType, V2Catalog } from '../../types';
import type { TypeDraft } from '../../catalogDraft';

interface TypeBasicsFormProps {
  draft: TypeDraft;
  original: V2AssetType | null;
  catalog: V2Catalog;
  onChange: (patch: Partial<TypeDraft>) => void;
  issues: TypeSpecIssue[];
}

/** path에 해당하는 첫 번째 이슈 메시지 (없으면 null) */
function issueFor(issues: TypeSpecIssue[], path: string): string | null {
  return issues.find((i) => i.path === path)?.message ?? null;
}

/** 필드 하단 에러 메시지 — text-xs text-danger */
function FieldError({ message }: { message: string | null }) {
  if (!message) return null;
  return <span className="text-xs text-danger">{message}</span>;
}

export function TypeBasicsForm({ draft, original, catalog, onChange, issues }: TypeBasicsFormProps) {
  const isNew = original === null;

  return (
    <div className="flex flex-col gap-3">
      {/* ── 기본정보 ─────────────────────────────────────────────────── */}
      <DetailCard>
        <DetailCardHeader title="기본정보" />

        {/* 키 (신규만 편집) */}
        <DetailRow label="키">
          <div className="flex flex-col gap-0.5">
            <Input
              aria-label="키"
              value={draft.key}
              disabled={!isNew}
              onChange={(e) => {
                const val = e.currentTarget.value;
                onChange({ key: val });
              }}
              placeholder="예: RACK"
            />
            <FieldError message={issueFor(issues, 'key')} />
          </div>
        </DetailRow>

        {/* 이름 */}
        <DetailRow label="이름">
          <div className="flex flex-col gap-0.5">
            <Input
              aria-label="이름"
              value={draft.name}
              onChange={(e) => {
                const val = e.currentTarget.value;
                onChange({ name: val });
              }}
              placeholder="예: 랙"
            />
            <FieldError message={issueFor(issues, 'name')} />
          </div>
        </DetailRow>

        {/* 분류 */}
        <DetailRow label="분류">
          <div className="flex flex-col gap-0.5">
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
            <FieldError message={issueFor(issues, 'categoryKey')} />
          </div>
        </DetailRow>

        {/* 정렬 */}
        <DetailRow label="정렬">
          <Input
            aria-label="정렬"
            type="number"
            value={draft.sortOrder}
            onChange={(e) => {
              const val = parseInt(e.currentTarget.value, 10);
              onChange({ sortOrder: isNaN(val) ? 0 : val });
            }}
          />
        </DetailRow>

        {/* 활성 */}
        <DetailRow label="활성">
          <label className="flex items-center gap-2 text-sm text-content">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(e) => {
                const val = e.currentTarget.checked;
                onChange({ isActive: val });
              }}
            />
            {draft.isActive ? '활성' : '비활성'}
          </label>
        </DetailRow>
      </DetailCard>

      {/* ── 배치 ─────────────────────────────────────────────────────── */}
      <DetailCard>
        <DetailCardHeader title="배치" />

        <DetailRow label="평면 배치">
          <label className="flex items-center gap-2 text-sm text-content">
            <input
              type="checkbox"
              checked={draft.placeable}
              onChange={(e) => {
                const val = e.currentTarget.checked;
                onChange({ placeable: val });
              }}
            />
            평면도에 배치 가능
          </label>
        </DetailRow>

        {draft.placeable && (
          <>
            <DetailRow label="기본 W">
              <Input
                aria-label="기본 W"
                type="number"
                value={draft.defaultWidth ?? ''}
                onChange={(e) => {
                  const raw = e.currentTarget.value;
                  onChange({ defaultWidth: raw === '' ? null : parseInt(raw, 10) });
                }}
                placeholder="px"
              />
            </DetailRow>

            <DetailRow label="기본 H">
              <Input
                aria-label="기본 H"
                type="number"
                value={draft.defaultHeight ?? ''}
                onChange={(e) => {
                  const raw = e.currentTarget.value;
                  onChange({ defaultHeight: raw === '' ? null : parseInt(raw, 10) });
                }}
                placeholder="px"
              />
            </DetailRow>
          </>
        )}
      </DetailCard>

      {/* ── 공량 ─────────────────────────────────────────────────────── */}
      <DetailCard>
        <DetailCardHeader title="공량" />

        <DetailRow label="노무유형">
          <Input
            aria-label="노무유형"
            value={draft.laborType ?? ''}
            onChange={(e) => {
              const val = e.currentTarget.value;
              onChange({ laborType: val === '' ? null : val });
            }}
            placeholder="예: 통신내선공"
          />
        </DetailRow>

        <DetailRow label="신설(h)">
          <div className="flex flex-col gap-0.5">
            <Input
              aria-label="신설(h)"
              type="number"
              value={draft.installHours}
              onChange={(e) => {
                const val = parseFloat(e.currentTarget.value);
                onChange({ installHours: isNaN(val) ? 0 : val });
              }}
            />
            <FieldError message={issueFor(issues, 'labor.installHours')} />
          </div>
        </DetailRow>

        <DetailRow label="철거(h)">
          <div className="flex flex-col gap-0.5">
            <Input
              aria-label="철거(h)"
              type="number"
              value={draft.removeHours}
              onChange={(e) => {
                const val = parseFloat(e.currentTarget.value);
                onChange({ removeHours: isNaN(val) ? 0 : val });
              }}
            />
            <FieldError message={issueFor(issues, 'labor.removeHours')} />
          </div>
        </DetailRow>

        <DetailRow label="이설(h)">
          <div className="flex flex-col gap-0.5">
            <Input
              aria-label="이설(h)"
              type="number"
              value={draft.relocateHours}
              onChange={(e) => {
                const val = parseFloat(e.currentTarget.value);
                onChange({ relocateHours: isNaN(val) ? 0 : val });
              }}
            />
            <FieldError message={issueFor(issues, 'labor.relocateHours')} />
          </div>
        </DetailRow>
      </DetailCard>
    </div>
  );
}
