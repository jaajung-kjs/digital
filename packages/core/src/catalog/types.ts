/** 포트 방향. BI = 양방향(일반 통신 포트). */
export type Direction = 'IN' | 'OUT' | 'BI';

export interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select';
  unit?: string;
  options?: string[];
}

export interface PlacementSpec {
  placeable: boolean;
  defaultWidth?: number;
  defaultHeight?: number;
}

export interface LaborRules {
  laborType: string | null;
  installHours: number;
  removeHours: number;
  relocateHours: number;
}

/** 빈 객체({}) = 모두 수용. 둘 다 있으면 OR. */
export interface AcceptRule {
  categoryKeys?: string[];
  typeKeys?: string[];
}

export interface ContainerSpec {
  key: string; // 타입 내 유일 (예: 'main')
  name: string; // 표시명 (예: '슬롯')
  slotCount: number | null; // null = 자유형(순서 리스트, 위치 검증 없음)
  allowSpan: boolean;
  accepts: AcceptRule;
}

export interface PortTemplate {
  group: string; // 타입 내 유일 (예: 'A', 'IN')
  count: number; // 기본 수량 — 인스턴스에서 오버라이드 가능(12C/24C 광슬롯)
  direction: Direction;
  medium: string; // CableGroup 이름과 대응하는 자유 문자열 ('광'|'전원'|...)
  namePattern: string; // '{n}' 치환 (예: '코어 {n}')
}

export interface InternalLinkRule {
  fromGroup: string;
  toGroup: string;
  mapping: 'byIndex' | 'all';
}

export interface AssetTypeSpec {
  key: string;
  name: string;
  categoryKey: string;
  sortOrder: number;
  placement: PlacementSpec;
  labor: LaborRules;
  fields: FieldDef[];
  containers: ContainerSpec[];
  ports: PortTemplate[];
  links: InternalLinkRule[];
}

/** ---- 인스턴스 참조 형상 (DB 행이 이 형상으로 매핑되어 순수 함수에 들어온다) ---- */

export interface AssetRef {
  id: string;
  typeKey: string;
  name: string;
  parentAssetId?: string | null;
  containerKey?: string | null;
  slotIndex?: number | null;
  slotSpan?: number | null;
}

export interface PortRef {
  id: string;
  assetId: string;
  group: string;
  index: number; // 1-based
  name: string;
  direction: Direction;
  medium: string;
}

export interface CableRef {
  id: string;
  aPortId: string;
  bPortId: string;
  categoryKey?: string | null;
}
