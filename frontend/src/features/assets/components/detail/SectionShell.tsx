import type { ReactNode } from 'react';

/**
 * 상세패널 보조 섹션(점검·고장이력·사진·연결) 공유 셸.
 * 네 섹션이 한 제품처럼 보이도록 헤더·여백·버튼·빈 상태·리스트 아이템을
 * 단일 토큰/패턴으로 통일. 탭 바(DetailTabs) 본문 안에서 동일 톤으로 렌더.
 *
 * 디자인 결정(#6): 접이식 섹션을 버리고 상단 탭 바(정보·점검·고장이력·사진·연결)로
 * 재구성. 보조 섹션은 중립(neutral) 톤만 사용 — 파란 add-form(bg-info-bg)·필드 밑줄
 * (줄찍찍) 제거, 라인 남발 없이 여백으로 구분, 통일된 비즈니스 톤.
 */

/** 섹션 헤더 — 제목 + (선택) 우측 액션. 네 섹션 동일 정렬/여백. */
export function SectionHeader({
  title,
  action,
}: {
  title?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between min-h-[1.75rem] mb-2">
      {title ? (
        <span className="text-xs font-semibold text-content-muted">{title}</span>
      ) : (
        <span />
      )}
      {action != null && <div className="flex items-center gap-1">{action}</div>}
    </div>
  );
}

/** 보조 액션 버튼(헤더 우측) — "+ 추가 / 취소" 등. */
export function SectionAction({
  onClick,
  children,
  tone = 'primary',
}: {
  onClick: () => void;
  children: ReactNode;
  tone?: 'primary' | 'muted';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs font-medium rounded px-2 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
        tone === 'primary'
          ? 'text-primary hover:bg-surface-2'
          : 'text-content-muted hover:bg-surface-2'
      }`}
    >
      {children}
    </button>
  );
}

/** 빈 상태 — 네 섹션 동일 톤. */
export function SectionEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs text-content-faint text-center py-4">{children}</p>
  );
}

/** 리스트 아이템 카드 — 점검/고장이력 공유. 라이트 카드(중립 표면). */
export function SectionItem({ children }: { children: ReactNode }) {
  return (
    <div className="group rounded-lg border border-line bg-surface p-3">
      {children}
    </div>
  );
}

/** 추가/편집 폼 래퍼 — 중립 톤(파란 강조·primary 보더 없음). 튀지 않고 차분하게. */
export function SectionForm({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3 rounded-lg border border-line bg-surface-2/60 p-3 space-y-2">
      {children}
    </div>
  );
}

/** 폼 입력 공통 클래스 — input/select/textarea 동일 톤. */
export const fieldClass =
  'w-full text-sm border border-line rounded px-2.5 py-2 bg-surface focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30';

/** 기본(primary) 폼 제출 버튼. */
export function PrimaryButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="text-xs font-medium px-3 py-1.5 rounded bg-primary text-white hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      {children}
    </button>
  );
}

/** 인라인 아이콘 액션(수정/삭제) — danger 토큰 옵션. */
export function IconAction({
  onClick,
  title,
  danger,
  children,
}: {
  onClick: () => void;
  title: string;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-0.5 text-content-faint transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded ${
        danger ? 'hover:text-danger' : 'hover:text-primary'
      }`}
    >
      {children}
    </button>
  );
}
