/**
 * StandardsPanel — 대장의 「기준자료」 탭
 *
 * 설계에 쓰는 **바깥에서 오는 표**를 서버에 한 판씩 올린다. 관리자가 반기에 한 번 올리면
 * 전원이 같은 값을 쓴다 — 각자 파일을 들고 있으면 사람마다 다른 설계서가 나온다.
 *
 * 올리기 전에 **미리보기**를 거친다: 무엇이 들어오는지(적용시기·직종 수)와 **지금 대장에
 * 무엇이 걸리는지**(코드로 승격될 값, 새 표에 없는 값)를 먼저 보여 준다. 등록은 그다음이다.
 */
import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import {
  Badge,
  Button,
  DetailCard,
  DetailCardHeader,
  DetailRow,
  EmptyState,
  ErrorStrip,
  TableCard,
  Th,
  cn,
  SELECTABLE,
} from '../../../components/ui';
import { previewWageStandard, uploadWageStandard, type WagePreview } from '../../api';
import { apiErrorMessage } from '../../apiError';
import { useStandards, useV2Catalog } from '../../hooks';

/** 이름 · 적용시기 · 올린이 · 상태. 합이 100(`TableCard`). */
const COL_WIDTHS = [40, 22, 22, 16] as const;

export function StandardsPanel() {
  const standards = useStandards();
  const catalog = useV2Catalog();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [preview, setPreview] = useState<(WagePreview & { file: File }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wageRows = standards.data?.filter((s) => s.kind === 'wage') ?? [];
  const active = catalog.data?.wageStandard ?? null;

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      setPreview({ ...(await previewWageStandard(file)), file });
    } catch (err: unknown) {
      setError(apiErrorMessage(err, '파일을 읽지 못했습니다'));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = ''; // 같은 파일을 다시 고를 수 있게
    }
  }

  async function commit() {
    if (!preview) return;
    setError(null);
    setBusy(true);
    try {
      await uploadWageStandard(preview.file);
      setPreview(null);
      await Promise.all([standards.refetch(), catalog.refetch()]);
    } catch (err: unknown) {
      setError(apiErrorMessage(err, '등록하지 못했습니다'));
    } finally {
      setBusy(false);
    }
  }

  async function activate(id: string) {
    setError(null);
    try {
      const { activateStandard } = await import('../../api');
      await activateStandard(id);
      await Promise.all([standards.refetch(), catalog.refetch()]);
    } catch (err: unknown) {
      setError(apiErrorMessage(err, '적용하지 못했습니다'));
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ErrorStrip
        message={error}
        onDismiss={() => setError(null)}
        className="shrink-0 border-b border-line bg-danger-bg px-4 py-1"
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="flex max-w-4xl flex-col gap-3">
          <DetailCard>
            <DetailCardHeader
              title="노임단가"
              badge={active ? active.effective : '없음'}
              badgeStatus={active ? 'success' : 'warning'}
              actions={
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
                  <Upload size={14} />
                  파일 선택
                </Button>
              }
            />
            <input
              ref={fileRef}
              type="file"
              accept=".hwp"
              aria-label="임금실태조사 파일"
              className="hidden"
              onChange={(e) => void pick(e.currentTarget.files?.[0])}
            />
            {active ? (
              <DetailRow label="직종">
                <span className="text-sm text-content">
                  {active.rows.length}개 · 기준일 {active.dates[0]}
                </span>
              </DetailRow>
            ) : (
              <p className="text-xs text-content-faint">
                건설업 임금실태조사 보고서(.hwp)를 올리면 직종 어휘와 노임단가가 채워집니다.
              </p>
            )}
          </DetailCard>

          {/* 미리보기 — **등록 전에** 무엇이 들어오고 무엇이 걸리는지 먼저 말한다. */}
          {preview && (
            <DetailCard>
              <DetailCardHeader
                title="이 파일로 등록할까요?"
                badge={preview.effective}
                badgeStatus="info"
                actions={
                  <>
                    <Button variant="secondary" size="sm" disabled={busy} onClick={() => setPreview(null)}>
                      취소
                    </Button>
                    <Button size="sm" disabled={busy} onClick={() => void commit()}>
                      {busy ? '등록 중…' : '등록하고 적용'}
                    </Button>
                  </>
                }
              />
              <DetailRow label="파일">
                <span className="truncate text-sm text-content">{preview.sourceName}</span>
              </DetailRow>
              <DetailRow label="직종">
                <span className="text-sm text-content">
                  {preview.rows.length}개 · 기준일 {preview.dates[0]}
                </span>
              </DetailRow>

              {preview.promote.length > 0 && (
                <DetailRow label="정리" align="start">
                  <span className="text-sm text-content">
                    이름으로 적혀 있던 직종 {preview.promote.length}건이 코드로 바뀝니다 —{' '}
                    {preview.promote.map((p) => `${p.from}(${p.count})`).join(', ')}
                  </span>
                </DetailRow>
              )}
              {preview.orphans.length > 0 && (
                <DetailRow label="주의" align="start">
                  <span className="text-sm text-warning">
                    새 표에 없는 직종 {preview.orphans.length}건 —{' '}
                    {preview.orphans.map((o) => `${o.value}(${o.count})`).join(', ')}. 그대로 두면 설계서에서 「단가
                    없음」이 됩니다.
                  </span>
                </DetailRow>
              )}
            </DetailCard>
          )}

          <DetailCard>
            <DetailCardHeader title="올린 기록" badge={String(wageRows.length)} badgeStatus="neutral" />
            {wageRows.length === 0 ? (
              <EmptyState
                title="올린 기준자료가 없습니다"
                description="새 판을 올려도 이전 판은 남습니다 — 지난 설계서를 그때 값으로 다시 볼 수 있어야 하니까요."
                className="py-6"
              />
            ) : (
              <TableCard widths={COL_WIDTHS}>
                <thead>
                  <tr>
                    <Th>파일</Th>
                    <Th>적용시기</Th>
                    <Th>올린이</Th>
                    <Th className="text-right">상태</Th>
                  </tr>
                </thead>
                <tbody>
                  {wageRows.map((row) => (
                    <tr key={row.id} className="border-b border-line last:border-0">
                      <td className="truncate px-3 py-1.5 text-content">{row.sourceName}</td>
                      <td className="px-3 py-1.5 text-content">{row.effective}</td>
                      <td className="truncate px-3 py-1.5 text-content-muted">
                        {row.uploadedBy} · {row.createdAt.slice(0, 10)}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        {row.active ? (
                          <Badge status="success">적용 중</Badge>
                        ) : (
                          <button
                            type="button"
                            className={cn('rounded px-2 py-0.5 text-xs text-primary', SELECTABLE)}
                            onClick={() => void activate(row.id)}
                          >
                            적용
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableCard>
            )}
          </DetailCard>
        </div>
      </div>
    </div>
  );
}
