import { CIRCUIT_CURRENTS, EQUIPMENT_STATUSES, SWITCH_STATES } from '@twin/core';
import { EMPTY, formatDate } from '../../../components/ui';
import type { ChangeItem } from '../../model/types';
import { CIRCUIT_FIELD_LABELS, EQUIPMENT_FIELD_LABELS, LINK_FIELD_LABELS, RECORD_FIELD_LABELS } from '../equipment/fieldLabels';

/**
 * 변경 이력 한 줄의 **화면 문장** — 「상태: 정상 → 고장」, 「차단기 3 표기: — → MCCB3」.
 * 칸 이름은 칸을 그리는 곳과 같은 말(`fieldLabels`), 닫힌 어휘는 그 어휘의 말(정상·교류·투입).
 */

const CHOICES: Record<string, readonly { value: string; label: string }[]> = {
  status: EQUIPMENT_STATUSES, current: CIRCUIT_CURRENTS, switch: SWITCH_STATES,
};
const DATES = new Set(['installDate', 'occurredAt', 'inspectedAt']);
const RECORD_NAME = { maintenance: '고장 이력', inspection: '점검 기록', photo: '사진' } as const;

const tableOf = (entity: ChangeItem['entity']): Record<string, string> =>
  entity === 'circuit' ? CIRCUIT_FIELD_LABELS
    : entity === 'link' ? LINK_FIELD_LABELS
      : entity === 'equipment' ? EQUIPMENT_FIELD_LABELS
        : RECORD_FIELD_LABELS;

/** 값 하나 — 빈 값은 「—」, 어휘는 말, 날짜는 날, 길이는 단위를 붙인다. */
export function valueText(name: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return EMPTY;
  if (typeof v === 'string' && CHOICES[name]) return CHOICES[name]!.find((c) => c.value === v)?.label ?? v;
  if (typeof v === 'string' && DATES.has(name)) return formatDate(v);
  if (name === 'lengthM' && typeof v === 'number') return `${v} m`;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** 연결의 다른 끝 — 설비 이름, 차단기는 「분전반 차단기 3」, 코어는 「선로 코어 5」. 지금은 없으면 「(삭제됨)」. */
function peerText(it: ChangeItem): string {
  const name = it.peerName ?? '(삭제됨)';
  if (!it.peer) return name;
  if (it.peer.kind === 'circuit') return `${name} 차단기 ${it.peer.no}`;
  if (it.peer.kind === 'core') return `${name} 코어 ${it.peer.no}`;
  return name;
}

/** 칸마다 한 줄 — 차례는 칸을 그리는 차례(이름표 표의 차례)다. 표에 없는 칸은 뒤로. */
function fieldLines(it: ChangeItem, prefix: string): string[] {
  const table = tableOf(it.entity);
  const keys = Object.keys(table);
  const rank = (n: string) => (keys.includes(n) ? keys.indexOf(n) : keys.length);
  return [...it.fields]
    .sort((a, b) => rank(a.name) - rank(b.name))
    .map((f) => `${prefix}${table[f.name] ?? f.name}: ${valueText(f.name, f.before)} → ${valueText(f.name, f.after)}`);
}

/** 한 변경(`ChangeItem`)을 화면 줄로 — 고치기는 칸마다 한 줄, 만들기·지우기는 한 줄. */
export function historyLines(it: ChangeItem): string[] {
  switch (it.entity) {
    case 'equipment':
      if (it.action === 'create') return ['설비 등록'];
      if (it.action === 'delete') return ['설비 삭제'];
      return fieldLines(it, '');
    case 'circuit':
      return fieldLines(it, `차단기 ${it.no ?? ''} `);
    case 'link':
      if (it.action === 'create') return [`연결 추가: ${peerText(it)}`];
      if (it.action === 'delete') return [`연결 삭제: ${peerText(it)}`];
      return fieldLines(it, `연결(${peerText(it)}) `);
    default: {
      const what = RECORD_NAME[it.entity];
      const content = it.fields.find((f) => f.name === 'content');
      const summary = content ? `: ${valueText('content', it.action === 'delete' ? content.before : content.after)}` : '';
      if (it.action === 'create') return [`${what} 등록${summary}`];
      if (it.action === 'delete') return [`${what} 삭제${summary}`];
      return fieldLines(it, `${what} `);
    }
  }
}
