import type { CableMedium } from '../model/vocab.js';

/**
 * 마스터 시드 — **빈 DB 에만** 들어간다(현장이 고친 값은 덮지 않는다, `seed/next.ts`).
 *
 * 품셈·단가는 옛 `catalog.ts` 의 **임시값**을 옮겼다(그 파일의 `labor` 주석 참고). 직종은
 * 비워 둔다 — 노임단가를 올린 뒤 종류 화면에서 고른다.
 *
 * 옛 카탈로그와 달리 **장비 단위만** 있다: UPS 의 정류기·인버터, 충전기의 IRCU·정류기,
 * OFD 슬롯 같은 내부 부품은 종류가 아니다(현황에서 세지 않고, 연결도 거기서 끝나지 않는다).
 */
export interface LaborSeed {
  laborCode: string | null;
  unitPrice: number | null;
  installManDays: number | null;
  removeManDays: number | null;
  relocateManDays: number | null;
}

const labor = (installManDays: number, removeManDays: number, relocateManDays: number, unitPrice: number | null): LaborSeed =>
  ({ laborCode: null, unitPrice, installManDays, removeManDays, relocateManDays });
/** 품이 따로 들지 않는 것 — 랙째 들어오는 일체형의 함체 등. */
const noLabor: LaborSeed = { laborCode: null, unitPrice: null, installManDays: null, removeManDays: null, relocateManDays: null };

export const MASTER_CATEGORIES = [
  { key: '구조', name: '구조', sortOrder: 1 },
  { key: '통신', name: '통신', sortOrder: 2 },
  { key: '전원', name: '전원', sortOrder: 3 },
  { key: '공조', name: '공조', sortOrder: 4 },
];

/**
 * 랙 종류 — 바닥에 서는 함체. 일체형 장비의 함체(UPS반·분전반함…)는 품을 장비 쪽에 두므로
 * 비워 둔다 — 둘 다 적으면 설계서에서 같은 일을 두 번 센다.
 */
export const MASTER_RACK_TYPES = [
  { key: 'RACK-19', name: '19인치 통신랙', sortOrder: 1, ...labor(1, 0.5, 1, 1_200_000) },
  { key: 'RACK-MINI-OPT', name: '소형광단국 랙', sortOrder: 2, ...labor(1, 0.5, 1, 1_000_000) },
  { key: 'RACK-OFD', name: 'OFD 함체', sortOrder: 3, ...noLabor },
  { key: 'RACK-PANEL', name: '분전반함', sortOrder: 4, ...noLabor },
  { key: 'RACK-CHARGER', name: '충전기반', sortOrder: 5, ...noLabor },
  { key: 'RACK-UPS', name: 'UPS반', sortOrder: 6, ...noLabor },
  { key: 'RACK-BATTERY', name: '축전지반', sortOrder: 7, ...noLabor },
  { key: 'RACK-WALL', name: '벽부함', sortOrder: 8, ...noLabor },
  { key: 'RACK-STANDALONE', name: '단독형(공조·외부)', sortOrder: 9, ...noLabor },
];

export const MASTER_EQUIPMENT_TYPES = [
  // 통신
  { key: 'OTE', name: '송변전광단말장치', categoryKey: '통신', sortOrder: 1, ...labor(3, 1.5, 3, 0) },
  { key: 'KEPCIT', name: 'KepCIT', categoryKey: '통신', sortOrder: 2, ...labor(4, 2, 4, 0) },
  { key: 'PITR', name: 'PITR', categoryKey: '통신', sortOrder: 3, ...labor(3, 1.5, 3, 0) },
  { key: 'CT1000', name: '통합단말장치', categoryKey: '통신', sortOrder: 4, ...labor(2, 1, 2, 0) },
  { key: 'PTPU', name: 'PTPU', categoryKey: '통신', sortOrder: 5, ...labor(0.5, 0.25, 0.5, 3_000_000) },
  { key: 'OMS', name: 'OMS', categoryKey: '통신', sortOrder: 6, ...labor(0.5, 0.25, 0.5, 3_000_000) },
  { key: 'I-MUX', name: 'I-MUX', categoryKey: '통신', sortOrder: 7, ...labor(0.5, 0.25, 0.5, 2_000_000) },
  { key: 'PCM', name: 'PCM 단국장치', categoryKey: '통신', sortOrder: 8, ...labor(0.5, 0.25, 0.5, 2_000_000) },
  { key: 'OPT-SW', name: '광스위치', categoryKey: '통신', sortOrder: 9, ...labor(0.5, 0.25, 0.5, 2_000_000) },
  { key: 'MEDIA-CONV', name: '광컨버터', categoryKey: '통신', sortOrder: 10, ...labor(0.25, 0.1, 0.25, 300_000) },
  { key: 'SW-L2', name: 'L2 스위치', categoryKey: '통신', sortOrder: 11, ...labor(0.5, 0.25, 0.5, 1_500_000) },
  { key: 'SW-L3', name: 'L3 스위치', categoryKey: '통신', sortOrder: 12, ...labor(0.75, 0.4, 0.75, 4_000_000) },
  { key: 'SW-POE', name: 'PoE 스위치', categoryKey: '통신', sortOrder: 13, ...labor(0.3, 0.15, 0.3, 500_000) },
  { key: 'UTM', name: 'UTM', categoryKey: '통신', sortOrder: 14, ...labor(0.75, 0.4, 0.75, 5_000_000) },
  { key: 'CSU-DSU', name: 'CSU/DSU', categoryKey: '통신', sortOrder: 15, ...labor(0.3, 0.15, 0.3, 800_000) },
  { key: 'PIA', name: 'PIA', categoryKey: '통신', sortOrder: 16, ...labor(0.5, 0.25, 0.5, 1_500_000) },
  { key: 'SERVER', name: '서버(랙형)', categoryKey: '통신', sortOrder: 17, ...labor(0.75, 0.4, 0.75, 8_000_000) },
  { key: 'RTU', name: 'RTU', categoryKey: '통신', sortOrder: 18, ...labor(1, 0.5, 1, null) },
  { key: 'EQ-OFD', name: 'OFD', categoryKey: '통신', sortOrder: 19, ...labor(0.5, 0.25, 0.5, 350_000) },
  { key: 'EXT', name: '외부 설비', categoryKey: '통신', sortOrder: 20, ...labor(0, 0, 0, 0) },
  // 전원
  { key: 'AC-HOUSE', name: '소내전원반', categoryKey: '전원', sortOrder: 31, ...labor(3, 1.5, 3, 8_000_000) },
  { key: 'PWR-PANEL', name: '분전반', categoryKey: '전원', sortOrder: 32, ...labor(2, 1, 2, 6_000_000) },
  { key: 'CHARGER', name: '충전기', categoryKey: '전원', sortOrder: 33, ...labor(5.8, 2.8, 5.8, 16_800_000) },
  { key: 'UPS', name: 'UPS', categoryKey: '전원', sortOrder: 34, ...labor(4, 2, 4, 18_000_000) },
  { key: 'BATTERY', name: '축전지', categoryKey: '전원', sortOrder: 35, ...labor(3, 1.5, 3, 6_500_000) },
  { key: 'GROUND-BOX', name: '접지함체', categoryKey: '전원', sortOrder: 36, ...labor(0.5, 0.25, 0.5, 500_000) },
  // 공조
  { key: 'HVAC-AC', name: '냉난방기', categoryKey: '공조', sortOrder: 41, ...labor(1, 0.5, 1, 2_500_000) },
  { key: 'HVAC-CRAC', name: '항온항습기', categoryKey: '공조', sortOrder: 42, ...labor(3, 1.5, 3, 30_000_000) },
];

/** 케이블 종류 — 옛 17종 그대로. 매체: 옛 network·control → comm, 광 점퍼 → comm, 다심 광 → fiber. */
export const MASTER_CABLE_TYPES: {
  key: string; name: string; medium: CableMedium; sortOrder: number;
  laborCode: string | null; unitPrice: number | null; installManDays: number | null; removeManDays: number | null;
}[] = [
  { key: 'F-CV', name: 'F-CV 전력케이블', medium: 'power', sortOrder: 1, laborCode: null, unitPrice: 4_800, installManDays: 0.03, removeManDays: 0.015 },
  { key: 'FR-CV', name: '난연/내화케이블', medium: 'power', sortOrder: 2, laborCode: null, unitPrice: 6_200, installManDays: 0.035, removeManDays: 0.018 },
  { key: 'VCT', name: '캡타이어 VCT', medium: 'power', sortOrder: 3, laborCode: null, unitPrice: 3_900, installManDays: 0.03, removeManDays: 0.015 },
  { key: 'HIV', name: '비닐절연전선 HIV', medium: 'power', sortOrder: 4, laborCode: null, unitPrice: 900, installManDays: 0.02, removeManDays: 0.01 },
  { key: 'UTP', name: 'UTP/S-FTP케이블', medium: 'comm', sortOrder: 5, laborCode: null, unitPrice: 700, installManDays: 0.02, removeManDays: 0.01 },
  { key: 'CABLE-OPGW', name: 'OPGW(광복합가공지선)', medium: 'fiber', sortOrder: 6, laborCode: null, unitPrice: 12_000, installManDays: 0.06, removeManDays: 0.03 },
  { key: 'FIBER-CABLE', name: '광케이블', medium: 'fiber', sortOrder: 7, laborCode: null, unitPrice: 3_400, installManDays: 0.06, removeManDays: 0.03 },
  { key: 'BREAKOUT', name: '브레이크아웃케이블', medium: 'fiber', sortOrder: 8, laborCode: null, unitPrice: 5_600, installManDays: 0.06, removeManDays: 0.03 },
  { key: 'FIBER-JUMPER', name: '광점퍼코드', medium: 'comm', sortOrder: 9, laborCode: null, unitPrice: 2_100, installManDays: 0.04, removeManDays: 0.02 },
  { key: 'GND-IV', name: '접지전선 IV/F-GV', medium: 'ground', sortOrder: 10, laborCode: null, unitPrice: 1_500, installManDays: 0.02, removeManDays: 0.01 },
  { key: 'GND-BARE', name: '나동연선', medium: 'ground', sortOrder: 11, laborCode: null, unitPrice: 2_600, installManDays: 0.02, removeManDays: 0.01 },
  { key: 'CVV-S', name: '제어케이블 CVV-S', medium: 'comm', sortOrder: 12, laborCode: null, unitPrice: 2_800, installManDays: 0.025, removeManDays: 0.012 },
  { key: 'CPEV-S', name: '통신케이블 CPEV-S', medium: 'comm', sortOrder: 13, laborCode: null, unitPrice: 1_200, installManDays: 0.02, removeManDays: 0.01 },
  { key: 'PCM-CABLE', name: 'PCM케이블', medium: 'comm', sortOrder: 14, laborCode: null, unitPrice: 2_400, installManDays: 0.025, removeManDays: 0.012 },
  { key: 'COAX', name: '동축케이블', medium: 'comm', sortOrder: 15, laborCode: null, unitPrice: 3_100, installManDays: 0.025, removeManDays: 0.012 },
  { key: 'CHAMP', name: '챔프케이블', medium: 'comm', sortOrder: 16, laborCode: null, unitPrice: 1_800, installManDays: 0.02, removeManDays: 0.01 },
  { key: 'SIGNAL', name: '데이터/신호케이블', medium: 'comm', sortOrder: 17, laborCode: null, unitPrice: 2_200, installManDays: 0.025, removeManDays: 0.012 },
];

/**
 * 시드 코드가 **고르는** 종류 — 서버 코드에 종류 key 를 적지 않으려고 여기 둔다(가드레일).
 * 직할 시드가 OFD 를 세우고 OPGW 선로를 까는 데 쓴다. 엑셀 근거 중계 패치(코어 ↔ 코어)는 광점퍼코드.
 */
export const SEED_PICKS = {
  ofdRackType: 'RACK-OFD',
  ofdEquipmentType: 'EQ-OFD',
  opgwCableType: 'CABLE-OPGW',
  fiberJumperCableType: 'FIBER-JUMPER',
} as const;
