import type { EditableFieldOption } from '../assets/components/EditableField';

/**
 * 전압 버스 표준(한전 통신실/변전소). 상은 전문 표기 Φ(파이) — 단상=1Φ, 3상=3Φ. DC 는 상 없음.
 *
 * 전압은 **버스(피더 입력) 단위 속성**이다 — 한 피더 아래 모든 CB 는 같은 전압을 공유한다.
 * 따라서 값은 피더 입력(IN) 케이블의 specParams.voltage 한 곳에만 저장하고, CB 행은 그 버스
 * 전압을 **상속(읽기전용)** 한다. value=label(조합 문자열) 그대로 저장.
 */
export const VOLTAGE_OPTIONS: EditableFieldOption[] = [
  { value: '', label: '—' },
  { value: 'AC 220V 1Φ', label: 'AC 220V 1Φ' },
  { value: 'AC 380V 3Φ', label: 'AC 380V 3Φ' },
  { value: 'AC 220V 3Φ', label: 'AC 220V 3Φ' },
  { value: 'DC 48V', label: 'DC 48V' },
  { value: 'DC 125V', label: 'DC 125V' },
];
