import { PORT_DIRECTIONS } from '../catalog/types.js';
import { portKind } from '../catalog/portKinds.js';
import type { AssetTypeSpec } from '../catalog/types.js';

export interface TypeSpecIssue { path: string; message: string }
export interface TypeSpecContext { categoryKeys: string[]; mediumKeys: string[] }

const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const DIRECTIONS: ReadonlySet<string> = new Set<string>(PORT_DIRECTIONS.map((d) => d.value));

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

  const portGroups = new Set<string>();
  spec.ports.forEach((p, i) => {
    if (!KEY_RE.test(p.group)) push(`ports[${i}].group`, '포트 그룹은 영문/숫자/대시/언더스코어만 허용됩니다');
    else if (portGroups.has(p.group)) push(`ports[${i}].group`, `포트 그룹 중복: ${p.group}`);
    portGroups.add(p.group);
    if (p.count < 1) push(`ports[${i}].count`, '포트 수량은 1 이상이어야 합니다');
    if (!DIRECTIONS.has(p.direction))
      push(`ports[${i}].direction`, `방향은 ${PORT_DIRECTIONS.map((d) => d.value).join('/')} 중 하나여야 합니다`);
    if (!ctx.mediumKeys.includes(p.medium)) push(`ports[${i}].medium`, `존재하지 않는 매체입니다: ${p.medium}`);
    if (p.count > 1 && !p.namePattern.includes('{n}')) push(`ports[${i}].namePattern`, "이름 패턴에 '{n}' 이 필요합니다 (count > 1)");

    const positions = p.positions ?? 1;
    if (positions < 1) push(`ports[${i}].positions`, '심선 수는 1 이상이어야 합니다');
    // 다심은 종류가 정한다 — 아무 포트에나 코어 수를 적으면 어휘가 뜻을 잃는다.
    if (positions > 1 && !portKind(p.medium)?.multiCore)
      push(`ports[${i}].positions`, `${portKind(p.medium)?.name ?? p.medium} 포트는 심선을 여러 가닥 나를 수 없습니다`);
    if (positions === 1 && portKind(p.medium)?.multiCore)
      push(`ports[${i}].positions`, `${portKind(p.medium)?.name ?? p.medium} 포트는 심선 수가 2 이상이어야 합니다`);
  });

  return issues;
}
