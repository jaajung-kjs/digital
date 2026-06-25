import {
  LOG_TYPE_LABELS,
  LOG_TYPE_COLORS,
  SEVERITY_COLORS,
  SEVERITY_LABELS,
  FAILURE_LOG_TYPE_OPTIONS,
} from '../equipment/types/equipment';

// ──────────────────────────────────────────────────────────────────────────
// ASSET_RECORD_TYPES: 자산 하위레코드(점검/고장이력/사진)의 프론트 **표현(presentation) 설정**.
//
// 데이터 구조(어떤 테이블이 자산 기록인지·컬럼·타입·필수)는 백엔드가 DB 스키마에서 자동 도출하고
// (GET /asset-record-schema), 읽기=워킹카피·쓰기=통합 커밋이 제네릭으로 처리한다. 여기엔 DB 가
// 못 주는 *표현*만 둔다 — 한글 라벨/플레이스홀더/UI 종류(form-list|gallery)/행 변형/String 컬럼
// (logType·severity·side)의 드롭다운 옵션·enum 배지 색. 새 종류 추가 = DB 테이블 + 여기 표현 1개.
// ──────────────────────────────────────────────────────────────────────────

/** 한 폼 필드의 선언 — form-list UI(RecordFormList)가 type 별로 렌더한다. */
export interface RecordFieldDef {
  /** 폼/레코드 상의 필드 키. */
  name: string;
  /** FormRow 라벨 + aria-label. */
  label: string;
  /** 렌더 종류. */
  type: 'date' | 'text' | 'select' | 'textarea';
  /** 비어 있으면 제출 불가(canSubmit). */
  required?: boolean;
  /** text/textarea placeholder. */
  placeholder?: string;
  /** select 옵션(value/label). */
  options?: { value: string; label: string }[];
  /** 신규 폼의 기본값(미지정 시 ''). date 는 특수 처리(오늘). */
  defaultValue?: string;
  /** date 기본값을 '오늘'로(toISOString slice). */
  defaultToday?: boolean;
  /** 행 표시용 enum 배지 맵(색상 클래스 / 라벨). logType·severity 용. */
  badge?: { colors: Record<string, string>; labels: Record<string, string>; fallback?: string };
}

/** form-list(점검/고장이력) UI 의 per-type 텍스트/표시 노브. */
export interface FormListConfig {
  /** 이력 헤더(예: '점검 이력'). */
  historyLabel: string;
  /** 빈 상태 문구. */
  emptyText: string;
  /** 신규 제출 버튼 라벨(수정 시엔 '수정 적용'). */
  addLabel: string;
  /**
   * 행 표시 변형 — 'inspection' = 날짜·점검자 인라인 + 내용; 'log' = 유형/심각도 배지 + 제목 + 설명 + 발생일/작성자.
   * 두 현행 컴포넌트의 행 마크업이 구조적으로 달라 정확 재현을 위해 명시 분기한다.
   */
  rowVariant: 'inspection' | 'log';
}

// recordType = 자산 기록 DB 테이블명(백엔드 assetRecordSchema 와 동일, DB-구동). 특정 종류를
// 참조하는 표현 로직(현황 점검일·사진 갤러리)용 가독성 별칭 — 구조 정의가 아니라 DB 테이블명.
export const INSPECTIONS = 'inspection_logs';
export const LOGS = 'maintenance_logs';
export const PHOTOS = 'asset_photos';

export interface RecordTypeDef {
  /** 레코드 종류 식별자 = record.recordType = DB 테이블명. */
  key: string;
  /** 표시/로그 라벨. */
  label: string;
  /** UI 종류 — form-list(점검/고장이력) | gallery(사진). */
  ui: 'form-list' | 'gallery';
  /** form-list 폼 필드(gallery 는 비움). 레코드 영속화는 통합 커밋이 recordType 으로 처리. */
  fields: RecordFieldDef[];
  /** form-list UI 의 per-type 텍스트/행 변형(gallery 는 미지정). */
  formList?: FormListConfig;
}

export const ASSET_RECORD_TYPES: RecordTypeDef[] = [
  {
    key: INSPECTIONS,
    label: 'inspection',
    ui: 'form-list',
    fields: [
      { name: 'inspectionDate', label: '점검일', type: 'date', defaultToday: true },
      { name: 'inspector', label: '점검자', type: 'text', required: true, placeholder: '점검자 이름' },
      { name: 'content', label: '내용', type: 'textarea', placeholder: '점검 내용 (선택)' },
    ],
    formList: {
      historyLabel: '점검 이력',
      emptyText: '아직 기록된 점검이 없습니다.',
      addLabel: '점검 추가',
      rowVariant: 'inspection',
    },
  },
  {
    key: LOGS,
    label: 'log',
    ui: 'form-list',
    fields: [
      {
        name: 'logType',
        label: '유형',
        type: 'select',
        options: FAILURE_LOG_TYPE_OPTIONS,
        defaultValue: 'FAILURE',
        badge: { colors: LOG_TYPE_COLORS, labels: LOG_TYPE_LABELS, fallback: 'bg-line text-content-muted' },
      },
      {
        name: 'severity',
        label: '심각도',
        type: 'select',
        options: Object.keys(SEVERITY_COLORS).map((key) => ({ value: key, label: SEVERITY_LABELS[key] ?? key })),
        defaultValue: 'LOW',
        badge: { colors: SEVERITY_COLORS, labels: SEVERITY_LABELS, fallback: 'bg-surface-2 text-content-muted' },
      },
      { name: 'title', label: '제목', type: 'text', required: true, placeholder: '고장 제목' },
      { name: 'logDate', label: '발생일', type: 'date', defaultToday: true },
      { name: 'description', label: '설명', type: 'textarea', placeholder: '고장 내용 (선택)' },
    ],
    formList: {
      historyLabel: '고장 이력',
      emptyText: '기록된 고장 이력이 없습니다.',
      addLabel: '고장 추가',
      rowVariant: 'log',
    },
  },
  {
    key: PHOTOS,
    label: 'photo',
    ui: 'gallery',
    fields: [
      { name: 'side', label: '면', type: 'select', options: [
        { value: 'front', label: '전면' },
        { value: 'rear', label: '후면' },
      ], defaultValue: 'front' },
      { name: 'description', label: '설명', type: 'text' },
    ],
  },
];

/** 키 → 레지스트리 엔트리 조회(상수 시간). */
export const RECORD_TYPE_BY_KEY: Record<string, RecordTypeDef> = Object.fromEntries(
  ASSET_RECORD_TYPES.map((d) => [d.key, d]),
);

export type RecordTypeKey = string;
