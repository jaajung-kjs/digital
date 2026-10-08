/**
 * StandardsPanel — 대장의 「기준정보」 탭
 *
 * 설계에 쓰는 **바깥에서 오는 표**를 서버에 한 판씩 올린다. 관리자가 반기에 한 번 올리면
 * 전원이 같은 값을 쓴다 — 각자 파일을 들고 있으면 사람마다 다른 산출 내역가 나온다.
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
  Button, DetailCard, DetailCardHeader, DetailRow, EmptyState, StatusDot, TableCard, TableSearch, Th, cn, formatDate, SELECTABLE, EMPTY, Td, TABLE_ROW, formatNumber,
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
import { DURATION_BANDS, SANAN_BANDS, SIZE_BANDS } from '@twin/core';
import { useStandards, useWageRates } from '../../hooks';
import { useCatalog } from '../../model/hooks';
import type { Standard } from '../../model/types';
import { EditOnly, useCanEdit } from '../../useCanEdit';

/** 파일 · 적용시기 · 올린이 · 상태. 합이 100(`TableCard`). */
/* 상태와 동작은 **다른 열**이다 — 한 칸에 섞으면 같은 열에 배지·맨글자·단추가 뒤섞인다. */
const COL_WIDTHS = [36, 20, 20, 14, 10] as const;

const pct = (v: number) => `${(v * 100).toFixed(3).replace(/\.?0+$/, '')}%`;

/**
 * 노임단가 — 올리기 + 임포트된 직종 표.
 *
 * 「직종 123개」라는 숫자만으로는 무엇이 들어왔는지 확인할 길이 없다. 회차를 나란히 두면
 * 추이도 함께 읽힌다(통신내선공 275,107 → 278,565 → 283,607 → 284,880).
 */
export function WageRatesView({ onError }: { onError: (m: string) => void }) {
  const catalog = useCatalog();
  const standards = useStandards();
  const rates = useWageRates();
  const wage = catalog.data?.wageStandard ?? null;
  const refresh = () => Promise.all([standards.refetch(), catalog.refetch(), rates.refetch()]);

  return (
    <div className="flex flex-col gap-3">
      <StandardCard<WagePreview>
        title="노임단가"
        accept=".hwp"
        badge={wage?.latestDate ?? null}
        hint="건설업 임금실태조사 보고서(.hwp)를 업로드하면 직종과 노임단가가 등록됩니다."
        summary={wage && <>직종 {wage.rows.length}개</>}
        onPreview={previewWageStandard}
        onCommit={uploadWageStandard}
        onDone={refresh}
        onError={onError}
        renderPreview={(p) => (
          <>
            <DetailRow label="직종">
              <span className="text-sm text-content">
                {p.rows.length}개 · 기준일 {p.dates.join(' · ')}
              </span>
            </DetailRow>
            <DetailRow label="반영할 값">
              <span className="text-sm text-content tabular-nums">{p.cellCount}건</span>
            </DetailRow>
            {p.promote.length > 0 && (
              <DetailRow label="정리" align="start">
                <span className="text-sm text-content">
                  이름으로 등록된 직종 {p.promote.length}건이 코드로 변환됩니다 —{' '}
                  {p.promote.map((x) => `${x.from}(${x.count})`).join(', ')}
                </span>
              </DetailRow>
            )}
            {p.orphans.length > 0 && (
              <DetailRow label="주의" align="start">
                <span className="text-sm text-warning">
                  새 표에 없는 직종 {p.orphans.length}건 — {p.orphans.map((x) => `${x.value}(${x.count})`).join(', ')}
                </span>
              </DetailRow>
            )}
          </>
        )}
      />
      <WageRatesCard />
    </div>
  );
}

/** 제비율 — 올리기 + 적용 중인 요율 표. */
export function OverheadRatesView({ onError }: { onError: (m: string) => void }) {
  const catalog = useCatalog();
  const standards = useStandards();
  const overhead = catalog.data?.overheadStandard ?? null;
  const refresh = () => Promise.all([standards.refetch(), catalog.refetch()]);

  return (
    <div className="flex flex-col gap-3">
      <StandardCard<OverheadPreview>
        title="제비율"
        accept=".xlsx"
        badge={overhead?.effective ?? null}
        hint="조달청 「간접공사비 적용기준」(.xlsx)을 업로드하면 간접노무비·경비·일반관리비·이윤이 등록됩니다."
        summary={overhead && <>{overhead.kind}</>}
        onPreview={previewOverheadStandard}
        onCommit={uploadOverheadStandard}
        onDone={refresh}
        onError={onError}
        renderPreview={(p) => (
          <>
            <DetailRow label="공사종류">
              <span className="text-sm text-content">{p.kind}</span>
            </DetailRow>
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
          </>
        )}
      />
      <OverheadRatesCard />
    </div>
  );
}

/** 올린 기록 — 새 판을 올려도 이전 판은 남고, 제비율은 되돌릴 수 있다. */
export function StandardHistoryView({ onError }: { onError: (m: string) => void }) {
  const catalog = useCatalog();
  const standards = useStandards();

  async function activate(id: string) {
    try {
      await activateStandard(id);
      await Promise.all([standards.refetch(), catalog.refetch()]);
    } catch (err: unknown) {
      onError(apiErrorMessage(err, '적용하지 못했습니다'));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <HistoryCard rows={standards.data ?? []} onActivate={activate} />
    </div>
  );
}

/**
 * 기준정보 한 종류 — 고르기 → 미리보기 → 등록.
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
            <EditOnly>
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
                <Upload size={14} />
                파일 선택
              </Button>
            </EditOnly>
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
            title={`${title} — 이 파일로 등록하시겠습니까?`}
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
function HistoryCard({ rows, onActivate }: { rows: Standard[]; onActivate: (id: string) => void }) {
  const KIND_LABEL: Record<string, string> = { wage: '노임단가', overhead: '제비율' };
  const canEdit = useCanEdit();
  return (
    <DetailCard>
      <DetailCardHeader title="등록 이력" badge={String(rows.length)} badgeStatus="neutral" />
      {/* 두 기준정보가 적용되는 단위가 다르다 — 상태 칸이 왜 다른지 여기서 한 번 말한다. */}
      <p className="text-xs text-content-faint">
        제비율은 <b className="font-medium">등록 이력</b> 중 하나를 선택하여 적용합니다. 노임단가는 등록한 값이 회차별로 누적되며, 직종별로
        가장 최근 값이 적용됩니다 — 별도로 선택하지 않습니다.
      </p>
      {rows.length === 0 ? (
        <EmptyState
          title="등록된 기준정보가 없습니다"
          description="노임단가·제비율 탭의 「파일 선택」으로 업로드하세요."
          className="py-6"
        />
      ) : (
        <TableCard widths={COL_WIDTHS}>
          <thead>
            <tr>
              <Th>파일</Th>
              <Th>적용시기</Th>
              <Th>등록자</Th>
              <Th>상태</Th>
              <Th align="right">동작</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={TABLE_ROW}>
                <Td className="truncate text-content">
                  <span className="mr-1.5 text-xs text-content-faint">{KIND_LABEL[row.kind] ?? row.kind}</span>
                  {row.sourceName}
                </Td>
                <Td className="truncate text-content">{row.effective}</Td>
                <Td className="truncate text-content-muted">
                  {row.uploadedBy} · {formatDate(row.createdAt)}
                </Td>
                {/* 한 열은 한 컴포넌트다 — 세 값이 전부 점+글자로 서고 톤만 다르다.
                    노임은 갈아 끼울 판이 없다: 올린 값이 그대로 쌓이고 직종마다 가장 최근
                    값이 쓰인다(「임포트됨」은 반영이 안 된 것처럼 읽혔다). */}
                <Td className="truncate ">
                  {row.kind !== 'overhead' ? (
                    <StatusDot status="info">값 반영됨</StatusDot>
                  ) : row.active ? (
                    <StatusDot status="success">적용 중</StatusDot>
                  ) : (
                    <StatusDot status="neutral">미적용</StatusDot>
                  )}
                </Td>
                {/* 「적용」은 **제비율에만** 있다 — 눌러도 안 바뀌는 버튼을 두지 않는다. */}
                <Td align="right">
                  {row.kind === 'overhead' && !row.active && canEdit && (
                    <button
                      type="button"
                      className={cn('rounded px-2 py-0.5 text-xs text-primary', SELECTABLE)}
                      onClick={() => onActivate(row.id)}
                    >
                      적용
                    </button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      )}
    </DetailCard>
  );
}

/**
 * 임포트된 직종 노임 — **무엇이 들어왔나**를 보는 자리.
 *
 * 카드가 「직종 123개」라고만 말하면 올린 것을 확인할 길이 없다. 회차를 나란히 두면 추이도
 * 함께 읽힌다(통신내선공 275,107 → 278,565 → 283,607 → 284,880).
 *
 * 열은 **실제로 들어온 회차**가 정한다 — 보고서가 몇 회차를 주든 따라간다.
 */
function WageRatesCard() {
  const rates = useWageRates();
  const [query, setQuery] = useState('');
  const data = rates.data;

  const shown = (data?.rows ?? []).filter((r) => {
    const q = query.trim().toLowerCase();
    return q === '' || r.name.toLowerCase().includes(q) || r.code.includes(q);
  });

  if (!data || data.rows.length === 0) return null;

  /* 코드 · 이름 · 회차마다 한 칸. 합이 100(`TableCard`).
     코드와 이름은 **다른 컬럼**이다 — 붙여 놓으면 한 칸에 둘 다 저장되는 것으로 읽힌다
     (보고서 표도 두 칸이다). */
  const widths = [10, 90 - data.dates.length * 15, ...data.dates.map(() => 15)];

  return (
    <DetailCard>
      <DetailCardHeader title="직종 노임" badge={String(data.rows.length)} badgeStatus="neutral" />
      <TableSearch
        aria-label="직종 검색"
        placeholder="직종 이름 · 코드"
        value={query}
        onChange={setQuery}
        shown={shown.length}
        total={data.rows.length}
      />
      {/* 안쪽에 스크롤 상자를 만들지 않는다 — 화면 하나를 통째로 쓰므로 페이지가 스크롤하면
          된다. 머리글은 그 스크롤에 붙어 따라온다(CONVENTIONS §1.7-b). */}
      <TableCard widths={widths}>
          <thead>
            <tr className="sticky top-0 z-sticky">
              <Th>코드</Th>
              <Th>직종</Th>
              {data.dates.map((d) => (
                <Th key={d} align="right">
                  {d}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.code} className={TABLE_ROW}>
                <Td className="tabular-nums text-content-muted">{r.code}</Td>
                <Td className="truncate text-content" title={r.markerNote ?? undefined}>
                  {r.name}
                  {r.marker && <span className="ml-1 text-xs text-warning">{r.marker}</span>}
                </Td>
                {data.dates.map((d) => (
                  <Td align="right" key={d} className="text-content">
                    {/* 그 회차에 조사되지 않았으면 **칸이 아니라 없음**이다. */}
                    {r.wages[d] != null ? formatNumber(r.wages[d]) : EMPTY}
                  </Td>
                ))}
              </tr>
            ))}
          </tbody>
      </TableCard>
    </DetailCard>
  );
}

/**
 * 적용 중인 제비율 — **무엇이 적용되고 있나**를 보는 자리.
 *
 * 노임과 마찬가지로, 올렸다는 사실만으로는 확인이 안 된다. 요율은 구간마다 다르므로
 * 그 구간을 그대로 편다: 규모 × 기간(간접노무비·기타경비), 규모(일반관리비·이윤),
 * 고정요율, 산안비 대상액 구간.
 */
function OverheadRatesCard() {
  const catalog = useCatalog();
  const t = catalog.data?.overheadStandard ?? null;
  if (!t) return null;

  /* 차례는 **어휘**가 정한다 — 저장된 표에서 뽑으면 jsonb 가 섞어 놓은 순서가 나온다. */
  const sizes = SIZE_BANDS;
  const durations = DURATION_BANDS;

  return (
    <DetailCard>
      <DetailCardHeader title="제비율" badge={t.kind} badgeStatus="neutral" />

      {/* 규모 × 기간 — 두 항목이 같은 축을 쓰므로 한 표에 나란히 둔다. */}
      <TableCard widths={[16, ...durations.flatMap(() => [Math.floor(84 / (durations.length * 2))])
        .concat(durations.map(() => Math.floor(84 / (durations.length * 2))))]}>
        <thead>
          <tr>
            <Th>공사규모</Th>
            {durations.map((d) => (
              <Th key={`i-${d}`} align="right" unit={`${d}일`}>
                간접노무비
              </Th>
            ))}
            {durations.map((d) => (
              <Th key={`e-${d}`} align="right" unit={`${d}일`}>
                기타경비
              </Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sizes.map((size) => (
            <tr key={size} className={TABLE_ROW}>
              <Td className="text-content">{size}</Td>
              {durations.map((d) => (
                <Td align="right" key={`i-${d}`} className="text-content">
                  {pct(t.byDuration.간접노무비[size]![d]!)}
                </Td>
              ))}
              {durations.map((d) => (
                <Td align="right" key={`e-${d}`} className="text-content-muted">
                  {pct(t.byDuration.기타경비[size]![d]!)}
                </Td>
              ))}
            </tr>
          ))}
        </tbody>
      </TableCard>

      {/* 기간과 무관한 둘 + 고정요율 + 산안비. 축이 달라 표를 나눈다. */}
      <TableCard widths={[40, 30, 30]}>
        <thead>
          <tr>
            <Th>공사규모</Th>
            <Th align="right">일반관리비</Th>
            <Th align="right" unit="경쟁">이윤</Th>
          </tr>
        </thead>
        <tbody>
          {sizes.map((size) => (
            <tr key={size} className={TABLE_ROW}>
              <Td className="text-content">{size}</Td>
              <Td align="right" className="text-content">{pct(t.bySize.일반관리비[size]!)}</Td>
              <Td align="right" className="text-content">{pct(t.bySize.이윤[size]!)}</Td>
            </tr>
          ))}
        </tbody>
      </TableCard>

      <TableCard widths={[40, 30, 30]}>
        <thead>
          <tr>
            <Th>산안비 대상액</Th>
            <Th align="right">요율</Th>
            <Th align="right">기초액</Th>
          </tr>
        </thead>
        <tbody>
          {SANAN_BANDS.map((band) => ({ band, v: t.sanan[band]! })).map(({ band, v }) => (
            <tr key={band} className={TABLE_ROW}>
              <Td className="text-content">{band}</Td>
              <Td align="right" className="text-content">{pct(v.rate)}</Td>
              <Td align="right" className="text-content-muted">
                {v.base == null ? EMPTY : `${formatNumber(v.base)}원`}
              </Td>
            </tr>
          ))}
        </tbody>
      </TableCard>

      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {Object.entries(t.fixed).map(([k, v]) => (
          <span key={k} className="text-xs text-content-muted">
            {k} <span className="tabular-nums text-content">{pct(v)}</span>
          </span>
        ))}
      </div>
    </DetailCard>
  );
}
