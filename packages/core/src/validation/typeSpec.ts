import type { AssetTypeSpec } from '../catalog/types.js';

export interface TypeSpecIssue { path: string; message: string }
export interface TypeSpecContext { categoryKeys: string[]; mediumKeys: string[] }

const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const DIRECTIONS = new Set(['IN', 'OUT', 'BI']);
const FIELD_TYPES = new Set(['text', 'number', 'date', 'select']);
const MAPPINGS = new Set(['byIndex', 'all']);

/**
 * 타입 스펙 구조 검증 — 저장 가능 여부 판정의 유일 구현.
 * 백엔드(저장 전)와 프론트 폼(사전 표시)이 공유한다. 이슈 0 = 유효.
 */
export function validateTypeSpec(spec: AssetTypeSpec, ctx: TypeSpecContext): TypeSpecIssue[] {
  const issues: TypeSpecIssue[] = [];
  const push = (path: string, message: string) => issues.push({ path, message });

  if (!KEY_RE.test(spec.key)) push('key', '키는 영문/숫자/대시/언더스코어만 허용됩니다');
  if (spec.name.trim() === '') push('name', '이름을 입력하세요');
  if (!ctx.categoryKeys.includes(spec.categoryKey)) push('categoryKey', '존재하지 않는 분류입니다');

  for (const k of ['installHours', 'removeHours', 'relocateHours'] as const) {
    if (spec.labor[k] < 0) push(`labor.${k}`, '공량은 0 이상이어야 합니다');
  }

  const fieldKeys = new Set<string>();
  spec.fields.forEach((f, i) => {
    if (f.key.trim() === '') push(`fields[${i}].key`, '필드 키를 입력하세요');
    else if (fieldKeys.has(f.key)) push(`fields[${i}].key`, `필드 키 중복: ${f.key}`);
    else fieldKeys.add(f.key);
    if (f.label.trim() === '') push(`fields[${i}].label`, '필드 라벨을 입력하세요');
    if (!FIELD_TYPES.has(f.type)) push(`fields[${i}].type`, '지원하지 않는 자료형입니다');
    if (f.type === 'select' && (f.options ?? []).length === 0) push(`fields[${i}].options`, 'select 필드는 옵션이 1개 이상 필요합니다');
  });

  const containerKeys = new Set<string>();
  spec.containers.forEach((c, i) => {
    if (!KEY_RE.test(c.key)) push(`containers[${i}].key`, '컨테이너 키는 영문/숫자/대시/언더스코어만 허용됩니다');
    else if (containerKeys.has(c.key)) push(`containers[${i}].key`, `컨테이너 키 중복: ${c.key}`);
    containerKeys.add(c.key);
    if (c.name.trim() === '') push(`containers[${i}].name`, '컨테이너 이름을 입력하세요');
    if (c.slotCount !== null && c.slotCount < 1) push(`containers[${i}].slotCount`, '슬롯 수는 1 이상이거나 자유형(null)이어야 합니다');
    if (c.slotCount === null && c.allowSpan) push(`containers[${i}].allowSpan`, '자유형 컨테이너는 span 을 가질 수 없습니다');
  });

  const portGroups = new Set<string>();
  let lineSideCount = 0;
  spec.ports.forEach((p, i) => {
    if (!KEY_RE.test(p.group)) push(`ports[${i}].group`, '포트 그룹은 영문/숫자/대시/언더스코어만 허용됩니다');
    else if (portGroups.has(p.group)) push(`ports[${i}].group`, `포트 그룹 중복: ${p.group}`);
    portGroups.add(p.group);
    if (p.count < 1) push(`ports[${i}].count`, '포트 수량은 1 이상이어야 합니다');
    if (!DIRECTIONS.has(p.direction)) push(`ports[${i}].direction`, '방향은 IN/OUT/BI 중 하나여야 합니다');
    if (!ctx.mediumKeys.includes(p.medium)) push(`ports[${i}].medium`, `존재하지 않는 매체입니다: ${p.medium}`);
    if (p.count > 1 && !p.namePattern.includes('{n}')) push(`ports[${i}].namePattern`, "이름 패턴에 '{n}' 이 필요합니다 (count > 1)");
    if (p.lineSide === true) {
      lineSideCount += 1;
      if (lineSideCount > 1) push(`ports[${i}].lineSide`, '선로측 그룹은 타입당 1개만 지정할 수 있습니다');
    }
  });

  const linkPairs = new Set<string>();
  spec.links.forEach((l, i) => {
    if (!portGroups.has(l.fromGroup)) push(`links[${i}].fromGroup`, `존재하지 않는 포트 그룹: ${l.fromGroup}`);
    if (!portGroups.has(l.toGroup)) push(`links[${i}].toGroup`, `존재하지 않는 포트 그룹: ${l.toGroup}`);
    else if (l.fromGroup === l.toGroup) push(`links[${i}].toGroup`, '자기 그룹으로의 링크는 허용되지 않습니다');
    if (!MAPPINGS.has(l.mapping)) push(`links[${i}].mapping`, '매핑은 byIndex/all 중 하나여야 합니다');
    const pair = `${l.fromGroup}→${l.toGroup}`;
    if (linkPairs.has(pair)) push(`links[${i}]`, `링크 룰 중복: ${pair}`);
    linkPairs.add(pair);
  });

  return issues;
}
