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
  Button, DetailCard, DetailCardHeader, DetailRow, EmptyState, StatusDot, TableCard, TableSearch, Th, cn, formatDate, SELECTABLE,
  EMPTY, Select, Td, TABLE_ROW, TableGroupHead, formatNumber, SourceDate, formatPercent, percentDigits, formatSourceDate, formatWon,
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
import { TONE } from '../../tones';
import { useCatalog } from '../../model/hooks';
import type { Standard } from '../../model/types';
import { EditOnly, useCanEdit } from '../../useCanEdit';

/** 파일 · 적용시기 · 올린이 · 상태. 합이 100(`TableCard`). */
/* 상태와 동작은 **다른 열**이다 — 한 칸에 섞으면 같은 열에 배지·맨글자·단추가 뒤섞인다. */
const COL_WIDTHS = [36, 20, 20, 14, 10] as const;
/** 「적용」할 판이 하나도 없으면 동작 열을 세우지 않는다(모두 빈 열 숨김, §1.7-e2). */
const COL_WIDTHS_NO_ACTION = [40, 22, 22, 16] as const;

const pct = formatPercent;
/** 공사기간 구간 머리 — 「183일」, 끝 구간 「1096+」 는 「1096일 이상」(「+일」은 오타처럼 읽힌다). */
const durationLabel = (d: string) => (d.endsWith('+') ? `${d.slice(0, -1)}일 이상` : `${d}일`);

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
        hint="건설업 임금실태조사 보고서(.hwp)를 업로드하면 직종과 노임단가가 등록됩니다"
        summary={wage && <>직종 {wage.rows.length}개</>}
        onPreview={previewWageStandard}
        onCommit={uploadWageStandard}
        onDone={refresh}
        onError={onError}
        renderPreview={(p) => (
          <>
            <DetailRow label="직종">
              <span className="text-sm text-content">
                {p.rows.length}개 · 기준일 {p.dates.map(formatSourceDate).join(' · ')}
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
        hint="조달청 「간접공사비 적용기준」(.xlsx)을 업로드하면 간접노무비·경비·일반관리비·이윤이 등록됩니다"
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
          /* 판 버전은 범주(neutral, §2.1) — 없으면 「미등록」 경고. 원문 시기 표기는 title. */
          badge={badge ? <SourceDate value={badge} /> : '미등록'}
          badgeStatus={badge ? TONE.category : TONE.warning}
          actions={
            <EditOnly>
              <Button variant="secondary" size="sm" disabled={busy} title={`${title} 파일(${accept}) 업로드`} onClick={() => fileRef.current?.click()}>
                <Upload size={14} />
                기준정보 업로드
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
            badge={<SourceDate value={preview.data.effective} />}
            badgeStatus={TONE.category}
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
  const actionable = canEdit && rows.some((r) => r.kind === 'overhead' && !r.active);
  return (
    <DetailCard>
      <DetailCardHeader title="등록 이력" count={rows.length} />
      {/* 두 기준정보가 적용되는 단위가 다르다 — 상태 칸이 왜 다른지 여기서 한 번 말한다. */}
      <p className="text-xs text-content-faint">
        제비율은 <b className="font-medium">등록 이력</b> 중 하나를 선택하여 적용합니다. 노임단가는 직종별 가장 최근 값이 자동 적용됩니다.
      </p>
      {rows.length === 0 ? (
        <EmptyState
          title="등록된 기준정보가 없습니다"
          description="노임단가·제비율 탭에서 「기준정보 업로드」를 누르세요"
          className="py-6"
        />
      ) : (
        <TableCard widths={actionable ? COL_WIDTHS : COL_WIDTHS_NO_ACTION}>
          <thead>
            <tr>
              <Th>파일</Th>
              <Th>적용시기</Th>
              <Th>등록자</Th>
              <Th>상태</Th>
              {actionable && <Th align="right"><span className="sr-only">동작</span></Th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={TABLE_ROW}>
                <Td className="truncate text-content">
                  <span className="mr-1.5 text-xs text-content-faint">{KIND_LABEL[row.kind] ?? row.kind}</span>
                  {row.sourceName}
                </Td>
                <Td className="truncate text-content"><SourceDate value={row.effective} /></Td>
                <Td className="truncate text-content-muted">
                  {row.uploadedBy} · {formatDate(row.createdAt)}
                </Td>
                {/* 한 열은 한 컴포넌트다 — 세 값이 전부 점+글자로 서고 톤만 다르다.
                    노임은 갈아 끼울 판이 없다: 올린 값이 그대로 쌓이고 직종마다 가장 최근
                    값이 쓰인다(「임포트됨」은 반영이 안 된 것처럼 읽혔다). */}
                <Td className="truncate ">
                  {row.kind !== 'overhead' ? (
                    <StatusDot status={TONE.category}>값 반영됨</StatusDot>
                  ) : row.active ? (
                    <StatusDot status={TONE.contrastOk}>적용 중</StatusDot>
                  ) : (
                    <StatusDot status={TONE.category}>미적용</StatusDot>
                  )}
                </Td>
                {/* 「적용」은 **제비율에만** 있다 — 눌러도 안 바뀌는 버튼을 두지 않는다. */}
                {actionable && <Td align="right">
                  {row.kind === 'overhead' && !row.active && canEdit && (
                    <button
                      type="button"
                      className={cn('rounded px-2 py-0.5 text-xs text-primary', SELECTABLE)}
                      onClick={() => onActivate(row.id)}
                    >
                      적용
                    </button>
                  )}
                </Td>}
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
  const [olderPick, setOlderPick] = useState<string | null>(null);
  const data = rates.data;

  const shown = (data?.rows ?? []).filter((r) => {
    const q = query.trim().toLowerCase();
    return q === '' || r.name.toLowerCase().includes(q) || r.code.includes(q);
  });

  if (!data || data.rows.length === 0) return null;

  /* 회차는 늘 쌓인다 — 열을 그만큼 늘리지 않는다(§1.6). 넷을 넘으면 최근 셋 + 「이전 회차」 하나(고른 것).
     회차는 최근부터 온다(보고서 차례). */
  const many = data.dates.length > 4;
  const older = many ? data.dates.slice(3) : [];
  const picked = older.includes(olderPick ?? '') ? olderPick! : older[0] ?? null;
  const dates = many ? [...data.dates.slice(0, 3), picked!] : data.dates;

  /* 코드 · 이름 · 회차마다 한 칸. 합이 100(`TableCard`).
     코드와 이름은 **다른 컬럼**이다 — 붙여 놓으면 한 칸에 둘 다 저장되는 것으로 읽힌다
     (보고서 표도 두 칸이다). */
  const widths = [10, 90 - dates.length * 15, ...dates.map(() => 15)];

  return (
    <DetailCard>
      <DetailCardHeader
        title="직종 노임" count={data.rows.length}
        actions={(
          /* 카드 안 표의 검색도 카드 머리 오른쪽(§1.7-f). */
          <>
            {many && (
              <div className="w-44">
                <Select size="sm" aria-label="이전 회차" value={picked ?? ''} onChange={(e) => setOlderPick(e.currentTarget.value)}>
                  {older.map((d) => <option key={d} value={d} title={d}>이전 회차 {formatSourceDate(d)}</option>)}
                </Select>
              </div>
            )}
            <TableSearch
              aria-label="직종 검색"
              placeholder="직종·코드 검색"
              className="w-56"
              value={query}
              onChange={setQuery}
              shown={shown.length}
              total={data.rows.length}
            />
          </>
        )}
      />
      {/* 안쪽에 스크롤 상자를 만들지 않는다 — 화면 하나를 통째로 쓰므로 페이지가 스크롤하면
          된다. 머리글은 그 스크롤에 붙어 따라온다(CONVENTIONS §1.7-b). */}
      <TableCard widths={widths}>
          <thead>
            <tr className="sticky top-0 z-sticky">
              <Th>코드</Th>
              <Th>직종</Th>
              {dates.map((d) => (
                <Th key={d} align="right">
                  <SourceDate value={d} />
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
                {dates.map((d) => (
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
  const sizeDigits = percentDigits(sizes.flatMap((size) => [t.bySize.일반관리비[size], t.bySize.이윤[size]]));
  const sananDigits = percentDigits(SANAN_BANDS.map((band) => t.sanan[band]?.rate));

  return (
    <DetailCard>
      <DetailCardHeader title="제비율" badge={t.kind} badgeStatus="neutral" />

      {/* 규모 × 기간 — 항목마다 표 하나(머리는 한 줄: 공사규모 · 기간들). 항목 이름은 묶음 머리줄이 말한다. */}
      {/* 율은 표마다 자릿수를 하나로 고정한다(「19.0%」 옆 「19.1%」) — 꼬리 0 을 버리면 오른쪽 맞춤의 소수점이 어긋난다. */}
      {(['간접노무비', '기타경비'] as const).map((item) => {
        const digits = percentDigits(sizes.flatMap((size) => durations.map((d) => t.byDuration[item][size]?.[d])));
        return (
          <TableCard key={item} widths={[16, ...durations.map(() => 84 / durations.length)]}>
            <thead>
              <TableGroupHead title={item} metas={['공사기간별']} />
              <tr>
                <Th>공사규모</Th>
                {durations.map((d) => <Th key={d} align="right">{durationLabel(d)}</Th>)}
              </tr>
            </thead>
            <tbody>
              {sizes.map((size) => (
                <tr key={size} className={TABLE_ROW}>
                  <Td className="text-content">{size}</Td>
                  {durations.map((d) => (
                    <Td align="right" key={d} className="text-content">{formatPercent(t.byDuration[item][size]![d]!, digits)}</Td>
                  ))}
                </tr>
              ))}
            </tbody>
          </TableCard>
        );
      })}

      {/* 기간과 무관한 둘 + 고정요율 + 산안비. 축이 달라 표를 나눈다. */}
      <TableCard widths={[40, 30, 30]}>
        <thead>
          {/* 위 두 표와 같은 꼴 — 묶음 머리줄이 무엇의 표인지 말한다. */}
          <TableGroupHead title="일반관리비 · 이윤" metas={['공사규모별']} />
          <tr>
            <Th>공사규모</Th>
            <Th align="right">일반관리비</Th>
            <Th align="right">이윤(경쟁)</Th>
          </tr>
        </thead>
        <tbody>
          {sizes.map((size) => (
            <tr key={size} className={TABLE_ROW}>
              <Td className="text-content">{size}</Td>
              <Td align="right" className="text-content">{formatPercent(t.bySize.일반관리비[size]!, sizeDigits)}</Td>
              <Td align="right" className="text-content">{formatPercent(t.bySize.이윤[size]!, sizeDigits)}</Td>
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
              <Td align="right" className="text-content">{formatPercent(v.rate, sananDigits)}</Td>
              <Td align="right" className="text-content-muted">
                {v.base == null ? EMPTY : `${formatWon(v.base)}원`}
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
