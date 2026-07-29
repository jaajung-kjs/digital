/**
 * ContainersEditor — 컨테이너 명세 편집
 * key / name / slotCount(null=자유형) / allowSpan / accepts(분류+타입 멀티선택)
 *
 * 구조 잠금(locked=true): 모든 입력 disabled + 상단 안내 배지
 */
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import type { TypeSpecIssue } from '@twin/core';
import { DetailCard, DetailCardHeader, Input, IconButton } from '../../../components/ui';
import type { V2Catalog } from '../../types';
import type { TypeDraft } from '../../catalogDraft';
import { issueFor } from './adminUtils';

interface ContainerRow {
  key: string;
  name: string;
  slotCount: number | null;
  allowSpan: boolean;
  accepts: { categoryKeys?: string[]; typeKeys?: string[] };
}

interface ContainersEditorProps {
  draft: TypeDraft;
  onChange: (patch: Partial<TypeDraft>) => void;
  catalog: V2Catalog;
  locked: boolean;
  issues: TypeSpecIssue[];
}

function defaultContainer(): ContainerRow {
  return { key: '', name: '', slotCount: null, allowSpan: false, accepts: {} };
}

/** accepts 체크박스 팝오버 */
function AcceptsPopover({
  accepts,
  catalog,
  disabled,
  onChange,
}: {
  accepts: { categoryKeys?: string[]; typeKeys?: string[] };
  catalog: V2Catalog;
  disabled: boolean;
  onChange: (a: { categoryKeys?: string[]; typeKeys?: string[] }) => void;
}) {
  const [open, setOpen] = useState(false);
  const catKeys = accepts.categoryKeys ?? [];
  const typeKeys = accepts.typeKeys ?? [];
  const isEmpty = catKeys.length === 0 && typeKeys.length === 0;

  function toggleCat(key: string) {
    const next = catKeys.includes(key) ? catKeys.filter((k) => k !== key) : [...catKeys, key];
    onChange({ ...accepts, categoryKeys: next.length === 0 ? undefined : next });
  }

  function toggleType(key: string) {
    const next = typeKeys.includes(key) ? typeKeys.filter((k) => k !== key) : [...typeKeys, key];
    onChange({ ...accepts, typeKeys: next.length === 0 ? undefined : next });
  }

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded border border-line bg-surface px-2 py-1 text-xs text-content hover:bg-surface-2 disabled:opacity-50"
      >
        {isEmpty ? (
          <span className="text-content-muted">모두 수용</span>
        ) : (
          <span>
            분류 {catKeys.length}개, 타입 {typeKeys.length}개
          </span>
        )}
        {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-modal mt-1 min-w-[200px] rounded-lg border border-line bg-surface p-3 shadow-lg space-y-2">
          <p className="text-xs text-content-muted">
            빈 선택(모두 체크 해제) = 모두 수용
          </p>

          {catalog.categories.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-content">분류</p>
              <div className="space-y-0.5">
                {catalog.categories.map((c) => (
                  <label key={c.key} className="flex items-center gap-1.5 text-xs text-content cursor-pointer">
                    <input
                      type="checkbox"
                      checked={catKeys.includes(c.key)}
                      disabled={disabled}
                      onChange={() => toggleCat(c.key)}
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          {catalog.types.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-content">타입</p>
              <div className="max-h-40 overflow-y-auto space-y-0.5">
                {catalog.types.map((t) => (
                  <label key={t.key} className="flex items-center gap-1.5 text-xs text-content cursor-pointer">
                    <input
                      type="checkbox"
                      checked={typeKeys.includes(t.key)}
                      disabled={disabled}
                      onChange={() => toggleType(t.key)}
                    />
                    {t.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-1 w-full rounded border border-line px-2 py-1 text-xs text-content-muted hover:bg-surface-2"
          >
            닫기
          </button>
        </div>
      )}
    </div>
  );
}

export function ContainersEditor({ draft, onChange, catalog, locked, issues }: ContainersEditorProps) {
  const containers = draft.containers;

  function update(index: number, patch: Partial<ContainerRow>) {
    const next = containers.map((c, i) => (i === index ? { ...c, ...patch } : c));
    onChange({ containers: next });
  }

  function remove(index: number) {
    onChange({ containers: containers.filter((_, i) => i !== index) });
  }

  function add() {
    onChange({ containers: [...containers, defaultContainer()] });
  }

  return (
    <DetailCard>
      <DetailCardHeader title="컨테이너" />

      {/* 구조 잠금 안내는 페이지 레벨 배너(V2CatalogAdminPage 저장바)가 담당 — 여기서 중복 표시하지 않는다 */}
      {containers.length === 0 && !locked && (
        <p className="text-xs text-content-faint">컨테이너가 없습니다. + 추가로 등록하세요.</p>
      )}

      {containers.map((c, i) => {
        const keyIssue = issueFor(issues, `containers[${i}].key`);
        const nameIssue = issueFor(issues, `containers[${i}].name`);
        const slotIssue = issueFor(issues, `containers[${i}].slotCount`);
        const spanIssue = issueFor(issues, `containers[${i}].allowSpan`);
        const isFree = c.slotCount === null;

        return (
          <div key={i} className="rounded border border-line bg-surface-2 p-2 space-y-1.5">
            <div className="flex items-center gap-1">
              <span className="flex-1 text-xs text-content-muted">컨테이너 {i + 1}</span>
              {!locked && (
                <IconButton aria-label={`컨테이너 ${i + 1} 삭제`} onClick={() => remove(i)}>
                  <Trash2 size={13} />
                </IconButton>
              )}
            </div>

            {/* key */}
            <div className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-xs text-content-muted">키</span>
              <div className="flex flex-1 flex-col gap-0.5">
                <Input
                  aria-label={`컨테이너 ${i + 1} 키`}
                  value={c.key}
                  disabled={locked}
                  placeholder="예: main"
                  onChange={(e) => {
                    const val = e.currentTarget.value;
                    update(i, { key: val });
                  }}
                />
                {keyIssue && <span className="text-xs text-danger">{keyIssue}</span>}
              </div>
            </div>

            {/* name */}
            <div className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-xs text-content-muted">이름</span>
              <div className="flex flex-1 flex-col gap-0.5">
                <Input
                  aria-label={`컨테이너 ${i + 1} 이름`}
                  value={c.name}
                  disabled={locked}
                  placeholder="예: 슬롯"
                  onChange={(e) => {
                    const val = e.currentTarget.value;
                    update(i, { name: val });
                  }}
                />
                {nameIssue && <span className="text-xs text-danger">{nameIssue}</span>}
              </div>
            </div>

            {/* slotCount */}
            <div className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-xs text-content-muted">슬롯 수</span>
              <div className="flex flex-1 flex-col gap-0.5">
                <Input
                  aria-label={`컨테이너 ${i + 1} 슬롯 수`}
                  type="number"
                  disabled={locked}
                  value={c.slotCount === null ? '' : c.slotCount}
                  placeholder="비워두면 자유형"
                  onChange={(e) => {
                    const raw = e.currentTarget.value;
                    const val = raw === '' ? null : Number(raw);
                    update(i, { slotCount: val === null ? null : isNaN(val) ? null : val });
                  }}
                />
                {slotIssue && <span className="text-xs text-danger">{slotIssue}</span>}
                {isFree && <span className="text-xs text-content-faint">자유형 (슬롯 수 제한 없음)</span>}
              </div>
            </div>

            {/* allowSpan */}
            <div className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-xs text-content-muted">스팬</span>
              <div className="flex flex-1 flex-col gap-0.5">
                <label className="flex items-center gap-2 text-sm text-content">
                  <input
                    type="checkbox"
                    checked={c.allowSpan}
                    disabled={locked || isFree}
                    onChange={(e) => {
                      const val = e.currentTarget.checked;
                      update(i, { allowSpan: val });
                    }}
                  />
                  슬롯 점유 허용
                </label>
                {spanIssue && <span className="text-xs text-danger">{spanIssue}</span>}
                {isFree && <span className="text-xs text-content-faint">자유형에서는 span 불가</span>}
              </div>
            </div>

            {/* accepts */}
            <div className="flex items-start gap-2">
              <span className="w-14 shrink-0 pt-1 text-xs text-content-muted">수용 대상</span>
              <AcceptsPopover
                accepts={c.accepts}
                catalog={catalog}
                disabled={locked}
                onChange={(next) => update(i, { accepts: next })}
              />
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
