/**
 * StandardsPanel — 대장의 「기준자료」 탭
 *
 * 설계에 쓰는 **바깥에서 오는 표**를 서버에 한 판씩 올린다. 관리자가 반기에 한 번 올리면
 * 전원이 같은 값을 쓴다 — 각자 파일을 들고 있으면 사람마다 다른 설계서가 나온다.
 *
 * 올리기 전에 **미리보기**를 거친다: 무엇이 들어오는지(적용시기·직종 수·요율)와, 노임의
 * 경우 **지금 대장에 무엇이 걸리는지**(코드로 승격될 값, 새 표에 없는 값)를 먼저 보여 준다.
 *
 * 두 카드가 같은 셸(`StandardCard`)을 쓴다 — 고르기·미리보기·등록·오류 처리는 종류가 달라도
 * 같은 일이라, 각자 짜면 한쪽만 고쳐지는 것이 시간 문제다.
 */
import { useRef, useState, type ReactNode } from 'react';
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
import {
  activateStandard,
  previewOverheadStandard,
  previewWageStandard,
  uploadOverheadStandard,
  uploadWageStandard,
  type OverheadPreview,
  type WagePreview,
} from '../../api';
import { apiErrorMessage } from '../../apiError';
import { useStandards, useV2Catalog } from '../../hooks';
import type { V2Standard } from '../../types';

/** 파일 · 적용시기 · 올린이 · 상태. 합이 100(`TableCard`). */
const COL_WIDTHS = [40, 22, 22, 16] as const;

const pct = (v: number) => `${(v * 100).toFixed(3).replace(/\.?0+$/, '')}%`;

export function StandardsPanel() {
  const standards = useStandards();
  const catalog = useV2Catalog();
  const [error, setError] = useState<string | null>(null);

  const refresh = () => Promise.all([standards.refetch(), catalog.refetch()]);
  const wage = catalog.data?.wageStandard ?? null;
  const overhead = catalog.data?.overheadStandard ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ErrorStrip
        message={error}
        onDismiss={() => setError(null)}
        className="shrink-0 border-b border-line bg-danger-bg px-4 py-1"
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="flex max-w-4xl flex-col gap-3">
          <StandardCard<WagePreview>
            title="노임단가"
            accept=".hwp"
            badge={wage?.latestDate ?? null}
            hint="건설업 임금실태조사 보고서(.hwp)를 올리면 직종 어휘와 노임단가가 채워집니다."
            summary={wage && <>직종 {wage.rows.length}개</>}
            onPreview={previewWageStandard}
            onCommit={uploadWageStandard}
            onDone={refresh}
            onError={setError}
            renderPreview={(p) => (
              <>
                <DetailRow label="직종">
                  <span className="text-sm text-content">
                    {p.rows.length}개 · 기준일 {p.dates.join(' · ')}
                  </span>
                </DetailRow>
                {/* 한 파일이 여러 회차를 준다 — 값이 있는 칸만 표에 쌓인다. */}
                <DetailRow label="채울 값">
                  <span className="text-sm text-content tabular-nums">{p.cellCount}칸</span>
                </DetailRow>
                {p.promote.length > 0 && (
                  <DetailRow label="정리" align="start">
                    <span className="text-sm text-content">
                      이름으로 적혀 있던 직종 {p.promote.length}건이 코드로 바뀝니다 —{' '}
                      {p.promote.map((x) => `${x.from}(${x.count})`).join(', ')}
                    </span>
                  </DetailRow>
                )}
                {p.orphans.length > 0 && (
                  <DetailRow label="주의" align="start">
                    <span className="text-sm text-warning">
                      새 표에 없는 직종 {p.orphans.length}건 — {p.orphans.map((x) => `${x.value}(${x.count})`).join(', ')}.
                      그대로 두면 설계서에서 「단가 없음」이 됩니다.
                    </span>
                  </DetailRow>
                )}
              </>
            )}
          />

          <StandardCard<OverheadPreview>
            title="제비율"
            accept=".xlsx"
            badge={overhead?.effective ?? null}
            hint="조달청 「간접공사비 적용기준」(.xlsx)을 올리면 간접노무비·경비·일반관리비·이윤이 채워집니다."
            summary={
              overhead && (
                <>
                  {overhead.kind} · 일반관리비 {pct(overhead.bySize.일반관리비['10억미만']!)}~
                  {pct(overhead.bySize.일반관리비['1000억이상']!)}
                </>
              )
            }
            onPreview={previewOverheadStandard}
            onCommit={uploadOverheadStandard}
            onDone={refresh}
            onError={setError}
            renderPreview={(p) => (
              <>
                <DetailRow label="공사종류">
                  <span className="text-sm text-content">{p.kind}</span>
                </DetailRow>
                {/* 요율이 **구간마다 다르다**는 것이 이 표의 요점이다 — 양 끝을 보여 준다. */}
                <DetailRow label="간접노무비">
                  <span className="text-sm text-content tabular-nums">
                    {pct(p.byDuration.간접노무비['10억미만']!['183']!)} ~{' '}
                    {pct(p.byDuration.간접노무비['1000억이상']!['1096+']!)} (규모·기간별)
                  </span>
                </DetailRow>
                <DetailRow label="일반관리비">
                  <span className="text-sm text-content tabular-nums">
                    {pct(p.bySize.일반관리비['10억미만']!)} ~ {pct(p.bySize.일반관리비['1000억이상']!)} (규모별)
                  </span>
                </DetailRow>
                <DetailRow label="이윤">
                  <span className="text-sm text-content tabular-nums">
                    {pct(p.bySize.이윤['10억미만']!)} ~ {pct(p.bySize.이윤['1000억이상']!)} (경쟁계약)
                  </span>
                </DetailRow>
                <DetailRow label="고정요율" align="start">
                  <span className="text-sm text-content">
                    {Object.entries(p.fixed)
                      .map(([k, v]) => `${k} ${pct(v)}`)
                      .join(' · ')}
                  </span>
                </DetailRow>
              </>
            )}
          />

          <HistoryCard rows={standards.data ?? []} onActivate={activate} />
        </div>
      </div>
    </div>
  );

  async function activate(id: string) {
    setError(null);
    try {
      await activateStandard(id);
      await refresh();
    } catch (err: unknown) {
      setError(apiErrorMessage(err, '적용하지 못했습니다'));
    }
  }
}

/**
 * 기준자료 한 종류 — 고르기 → 미리보기 → 등록.
 *
 * 종류마다 다른 것은 **무엇을 보여 주느냐**뿐이라 그것만 `renderPreview` 로 받는다.
 */
function StandardCard<P extends { sourceName: string; effective: string }>({
  title,
  accept,
  badge,
  hint,
  summary,
  onPreview,
  onCommit,
  onDone,
  onError,
  renderPreview,
}: {
  title: string;
  accept: string;
  /** 지금 적용 중인 판의 적용시기. 없으면 null. */
  badge: string | null;
  hint: string;
  summary: ReactNode;
  onPreview: (file: File) => Promise<P>;
  onCommit: (file: File) => Promise<unknown>;
  onDone: () => Promise<unknown>;
  onError: (message: string) => void;
  renderPreview: (preview: P) => ReactNode;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<{ data: P; file: File } | null>(null);
  const [busy, setBusy] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      setPreview({ data: await onPreview(file), file });
    } catch (err: unknown) {
      onError(apiErrorMessage(err, '파일을 읽지 못했습니다'));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = ''; // 같은 파일을 다시 고를 수 있게
    }
  }

  async function commit() {
    if (!preview) return;
    setBusy(true);
    try {
      await onCommit(preview.file);
      setPreview(null);
      await onDone();
    } catch (err: unknown) {
      onError(apiErrorMessage(err, '등록하지 못했습니다'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DetailCard>
        <DetailCardHeader
          title={title}
          badge={badge ?? '없음'}
          badgeStatus={badge ? 'success' : 'warning'}
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
          accept={accept}
          aria-label={`${title} 파일`}
          className="hidden"
          onChange={(e) => void pick(e.currentTarget.files?.[0])}
        />
        {summary ? (
          <DetailRow label="내용">
            <span className="text-sm text-content">{summary}</span>
          </DetailRow>
        ) : (
          <p className="text-xs text-content-faint">{hint}</p>
        )}
      </DetailCard>

      {/* 미리보기 — **등록 전에** 무엇이 들어오는지 먼저 말한다. */}
      {preview && (
        <DetailCard>
          <DetailCardHeader
            title={`${title} — 이 파일로 등록할까요?`}
            badge={preview.data.effective}
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
            <span className="truncate text-sm text-content">{preview.data.sourceName}</span>
          </DetailRow>
          {renderPreview(preview.data)}
        </DetailCard>
      )}
    </>
  );
}

/** 올린 기록 — 새 판을 올려도 이전 판은 남고, 되돌릴 수 있다. */
function HistoryCard({ rows, onActivate }: { rows: V2Standard[]; onActivate: (id: string) => void }) {
  const KIND_LABEL: Record<string, string> = { wage: '노임단가', overhead: '제비율' };
  return (
    <DetailCard>
      <DetailCardHeader title="올린 기록" badge={String(rows.length)} badgeStatus="neutral" />
      {rows.length === 0 ? (
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
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-line last:border-0">
                <td className="truncate px-3 py-1.5 text-content">
                  <span className="mr-1.5 text-xs text-content-faint">{KIND_LABEL[row.kind] ?? row.kind}</span>
                  {row.sourceName}
                </td>
                <td className="truncate px-3 py-1.5 text-content">{row.effective}</td>
                <td className="truncate px-3 py-1.5 text-content-muted">
                  {row.uploadedBy} · {row.createdAt.slice(0, 10)}
                </td>
                {/* 「적용」은 **제비율에만** 있다 — 노임은 판을 갈아 끼우는 것이 아니라
                    직종마다 가장 최근 값이 쓰인다. 눌러도 안 바뀌는 버튼을 두지 않는다. */}
                <td className="px-3 py-1.5 text-right">
                  {row.kind !== 'overhead' ? (
                    <span className="text-xs text-content-faint">임포트됨</span>
                  ) : row.active ? (
                    <Badge status="success">적용 중</Badge>
                  ) : (
                    <button
                      type="button"
                      className={cn('rounded px-2 py-0.5 text-xs text-primary', SELECTABLE)}
                      onClick={() => onActivate(row.id)}
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
  );
}
