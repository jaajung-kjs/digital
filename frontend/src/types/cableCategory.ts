/**
 * CableCategory — replaces the cable half of the legacy MaterialCategory table.
 *
 * Backend route: GET /api/cable-categories.
 * Backend model: backend/src/services/cableCategory.service.ts.
 */

import type { SpecTemplate } from './specTemplate';

export type CableDisplayGroup = '전원' | '접지' | '네트워크' | '광' | '제어';

export interface CableCategory {
  id: string;
  code: string;
  name: string;
  description: string | null;
  displayColor: string | null;
  displayGroup: CableDisplayGroup | null;
  iconName: string | null;
  unit: string | null;
  specTemplate: SpecTemplate | null;
  sortOrder: number;
  isActive: boolean;
}

/** displayGroup 표시 순서 — 필터·삽입 바·범례·연결요약 공용(단일 출처). */
export const CABLE_DISPLAY_GROUPS: CableDisplayGroup[] = ['전원', '접지', '네트워크', '광', '제어'];

/**
 * displayGroup 대표색 — seed displayColor 에서 유래.
 * 전원→CBL-FCV/FR/VCT/HIV #ef4444, 접지→CBL-IV/BARE #eab308, 네트워크→CBL-UTP #3b82f6,
 * 광→CBL-OPT/OPJ/OPT-B #22c55e, 제어→CBL-COAX/SIG #6b7280. (범례·삽입 바·연결요약 공용 단일 출처)
 */
export const CABLE_DISPLAY_GROUP_COLORS: Record<CableDisplayGroup, string> = {
  '전원': '#ef4444',
  '접지': '#eab308',
  '네트워크': '#3b82f6',
  '광': '#22c55e',
  '제어': '#6b7280',
};

/**
 * 레거시 cableType(enum: AC/DC/LAN/FIBER/GROUND) → 표준 displayGroup.
 * categoryId 가 없거나 매칭 안 되는 케이블(구 시드/구데이터)을 원시 'FIBER' 대신 '광' 으로
 * 그룹핑하기 위한 폴백 브리지 — 같은 종류가 두 그룹으로 갈라지는 것을 방지한다.
 */
export const CABLE_TYPE_DISPLAY_GROUP: Record<string, CableDisplayGroup> = {
  AC: '전원',
  DC: '전원',
  LAN: '네트워크',
  FIBER: '광',
  GROUND: '접지',
};
