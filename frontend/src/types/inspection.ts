/**
 * 점검 이력(inspection_logs) — 점검 전용(날짜 + 점검자 + 내용).
 * 가장 최근 inspectionDate 가 자산 현황의 "마지막 점검일"(lastMaintenanceDate)로 연동된다.
 * 백엔드 InspectionLogDetail 과 1:1 매핑 (날짜는 ISO 문자열).
 */
export interface InspectionLog {
  id: string;
  assetId: string;
  inspectionDate: string;
  inspector: string;
  content: string | null;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
  updatedByName: string | null;
}

export interface InspectionFormData {
  inspectionDate: string;
  inspector: string;
  content?: string | null;
}
