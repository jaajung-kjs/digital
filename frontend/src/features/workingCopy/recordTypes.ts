import { api } from '../../utils/api';
import {
  LOG_TYPE_LABELS,
  LOG_TYPE_COLORS,
  SEVERITY_COLORS,
  SEVERITY_LABELS,
  FAILURE_LOG_TYPE_OPTIONS,
} from '../equipment/types/equipment';

// ──────────────────────────────────────────────────────────────────────────
// P5c — ASSET_RECORD_TYPES: 자산 하위레코드(점검/고장이력/사진)의 단일 레지스트리.
//
// 점검(INSPECTIONS)/고장이력(LOGS)/사진(PHOTOS)은 모두 "저장된 데이터는 자산별 RQ로
// 로드, 스테이징은 워킹카피 overlay" 라는 동일한 골격을 공유한다. 종전에는 store
// 플러밍(COLLECTIONS/Overlays), 커밋 flush(MEDIA_FLUSHERS), effective 훅, UI 컴포넌트가
// 타입마다 손으로 중복 구현돼 있었다. 이 레지스트리가 *per-type* 지식(필드/엔드포인트/
// 무효화 키/UI 종류/enum 색상맵)의 단일 출처다. 새 레코드 타입 추가 = 여기 엔트리 1개.
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

/** 미디어 레코드(커밋 flush)의 최소 계약 — MEDIA_FLUSHERS 가 다루는 union. */
export interface RecordPayload {
  id: string;
  equipmentId?: string;
  assetId?: string;
  side?: string;
  file?: File;
  description?: string | null;
  logType?: string;
  title?: string;
  logDate?: string | null;
  severity?: string | null;
  inspectionDate?: string;
  inspector?: string;
  content?: string | null;
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

export interface RecordTypeDef {
  /** 워킹카피 컬렉션 키(store overlay/COLLECTIONS 키와 동일). */
  key: 'inspections' | 'logs' | 'photos';
  /** 표시/로그 라벨. */
  label: string;
  /** 부모 식별 필드 — inspections=assetId, logs/photos=equipmentId. */
  parentKey: 'assetId' | 'equipmentId';
  /** UI 종류 — form-list(점검/고장이력) | gallery(사진). */
  ui: 'form-list' | 'gallery';
  /** form-list 폼 필드(gallery 는 비움). */
  fields: RecordFieldDef[];
  /** 저장된 데이터의 RQ base query key. */
  queryKey: string[];
  /** create 시 POST 할 경로(부모 realId 주입). */
  createUrl: (parentId: string) => string;
  /** create payload 빌더(미디어가 아닌 경우). */
  createBody?: (r: RecordPayload) => Record<string, unknown>;
  /** delete 시 DELETE 할 경로(레코드 realId). */
  deleteUrl: (id: string) => string;
  /** 커밋 후 무효화할 query key 들(점검은 nodeAssets 도). */
  invalidate: string[][];
  /** 미디어(multipart + blob objectUrl 수명주기) 여부 — photos=true. */
  media: boolean;
  /** form-list UI 의 per-type 텍스트/행 변형(gallery 는 미지정). */
  formList?: FormListConfig;
}

export const ASSET_RECORD_TYPES: RecordTypeDef[] = [
  {
    key: 'inspections',
    label: 'inspection',
    parentKey: 'assetId',
    ui: 'form-list',
    fields: [
      { name: 'inspectionDate', label: '점검일', type: 'date', defaultToday: true },
      { name: 'inspector', label: '점검자', type: 'text', required: true, placeholder: '점검자 이름' },
      { name: 'content', label: '내용', type: 'textarea', placeholder: '점검 내용 (선택)' },
    ],
    queryKey: ['inspection-logs'],
    createUrl: (id) => `/assets/${id}/inspections`,
    createBody: (i) => ({
      inspectionDate: i.inspectionDate,
      inspector: i.inspector,
      content: i.content ?? null,
    }),
    deleteUrl: (id) => `/inspection-logs/${id}`,
    // 점검 반영 → 현황 '마지막 점검일' 갱신(nodeAssets 도 무효화).
    invalidate: [['inspection-logs'], ['nodeAssets']],
    media: false,
    formList: {
      historyLabel: '점검 이력',
      emptyText: '아직 기록된 점검이 없습니다.',
      addLabel: '점검 추가',
      rowVariant: 'inspection',
    },
  },
  {
    key: 'logs',
    label: 'log',
    parentKey: 'equipmentId',
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
    queryKey: ['maintenance-logs'],
    createUrl: (id) => `/equipment/${id}/maintenance-logs`,
    createBody: (l) => ({
      logType: l.logType,
      title: l.title,
      logDate: l.logDate || undefined,
      severity: l.severity || undefined,
      description: l.description || undefined,
    }),
    deleteUrl: (id) => `/maintenance-logs/${id}`,
    invalidate: [['maintenance-logs']],
    media: false,
    formList: {
      historyLabel: '고장 이력',
      emptyText: '기록된 고장 이력이 없습니다.',
      addLabel: '고장 추가',
      rowVariant: 'log',
    },
  },
  {
    key: 'photos',
    label: 'photo',
    parentKey: 'equipmentId',
    ui: 'gallery',
    fields: [
      { name: 'side', label: '면', type: 'select', options: [
        { value: 'front', label: '전면' },
        { value: 'rear', label: '후면' },
      ], defaultValue: 'front' },
      { name: 'description', label: '설명', type: 'text' },
    ],
    queryKey: ['equipment-photos'],
    createUrl: (id) => `/equipment/${id}/photos`,
    deleteUrl: (id) => `/equipment-photos/${id}`,
    invalidate: [['equipment-photos']],
    media: true,
  },
];

/** 키 → 레지스트리 엔트리 조회(상수 시간). */
export const RECORD_TYPE_BY_KEY: Record<RecordTypeDef['key'], RecordTypeDef> = Object.fromEntries(
  ASSET_RECORD_TYPES.map((d) => [d.key, d]),
) as Record<RecordTypeDef['key'], RecordTypeDef>;

export type RecordTypeKey = RecordTypeDef['key'];

/**
 * 사진 multipart payload 빌더 — UI(갤러리)가 압축 File + objectUrl 을 들고 staging 하고,
 * 커밋 flush 가 이 함수로 FormData 를 만든다(종전 MEDIA_FLUSHERS photos.create 와 byte-identical).
 */
export function buildPhotoFormData(p: RecordPayload): FormData {
  const fd = new FormData();
  fd.append('file', p.file!);
  fd.append('side', p.side!);
  fd.append('takenAt', new Date().toISOString());
  if (p.description) fd.append('description', p.description);
  return fd;
}

/**
 * 레지스트리 엔트리의 create 를 실행한다(media=multipart, 그 외=JSON body).
 * 커밋 flush(useCommitWorkingCopy)가 컬렉션 무관하게 호출한다.
 */
export function createRecord(def: RecordTypeDef, r: RecordPayload, parentId: string): Promise<unknown> {
  if (def.media) {
    if (!r.file) return Promise.resolve();
    return api.post(def.createUrl(parentId), buildPhotoFormData(r), {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  }
  return api.post(def.createUrl(parentId), def.createBody!(r));
}
