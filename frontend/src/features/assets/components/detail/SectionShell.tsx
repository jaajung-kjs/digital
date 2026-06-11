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

/** 빈 상태 — 동일 톤(연결 섹션 등에서 사용). */
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


/** 폼 입력 공통 클래스 — input/select/textarea 동일 톤. */
export const fieldClass =
  'w-full text-sm border border-line rounded px-2.5 py-2 bg-surface focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30';

/**
 * 폼 한 줄 — 라벨(좌, 고정폭) + 필드(우). 정보 탭과 동일한 라벨-필드 구성으로
 * 점검/고장이력 작성 폼을 '항상 노출' 시키되 한 제품처럼 보이게 한다.
 */
export function FormRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-start gap-2">
      <span className="w-14 shrink-0 pt-2 text-xs text-content-muted">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </label>
  );
}

/** 보조(고스트) 버튼 — 취소 등. primary 버튼과 한 쌍으로. */
export function GhostButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs font-medium px-3 py-1.5 rounded text-content-muted hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      {children}
    </button>
  );
}

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
