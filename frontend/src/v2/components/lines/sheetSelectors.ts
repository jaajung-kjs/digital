import { lineSheet, type SheetBlock } from '@twin/core';
import { effectiveCores, effectiveRows, equipmentName, linesTouching, outsideLinks } from '../../model/store/effective';
import type { WorkingCopyState } from '../../model/store/workingCopy';
import type { FiberLine } from '../../model/types';

type S = Pick<WorkingCopyState, 'saved' | 'overlays'>;

/**
 * 워킹카피 → 선번장 블록(`lineSheet`). 판정은 core 한 곳이고, 여기는 입력을 모을 뿐이다.
 *
 * 연결은 **들른 국의 effective 연결 + 아직 안 들른 국의 먼 연결**이다 — 먼 연결 규칙은 삭제 펼침이
 * 쓰는 `outsideLinks` 그대로다(들른 국의 것은 그 국 행이 정답, 지우기로 한 것은 뺀다). 그래야 상대 국을
 * 들르기 전에도 대국 연결 칸에 이름이 서고, 들른 뒤에도 같은 연결이 두 번 세어지지 않는다.
 */
export function sheetBlocks(s: S, substationId: string): SheetBlock[] {
  const lines = linesTouching(s, substationId);
  const ids = new Set(lines.map((l) => l.id));
  return lineSheet({
    substationId,
    lines,
    cores: lines.flatMap((l) => effectiveCores(s, l.id)),
    measurements: effectiveRows(s, 'coreMeasurements').filter((m) => ids.has(m.lineId)),
    links: [...effectiveRows(s, 'links'), ...outsideLinks(s)],
    /* 단자 설비 차례 — 이름(자연 순서: OFD2 < OFD10), 같으면 id(core 가 가른다). */
    equipmentOrder: (id) => equipmentName(s, id) ?? '',
  });
}

/** 블록의 광선로(머리에 상대국 이름·케이블 품목을 적는다). */
export function lineOf(s: S, lineId: string): FiberLine | undefined {
  return effectiveRows(s, 'fiberLines').find((l) => l.id === lineId);
}

/** 상대 국 이름 — 광선로가 두 끝 국 이름을 함께 싣는다. */
export function peerSubstationName(line: FiberLine, side: 'A' | 'B'): string {
  return side === 'A' ? line.bSubstationName : line.aSubstationName;
}

/**
 * 블록이 어디인가 — `OFD · 슬롯 2 · 어댑터 25–48`(단자가 비면 「단자 미지정」)와 상대 국 이름.
 * 선번장 머리와 측정 입력 제목이 같은 말을 쓰도록 한 곳에서 짓는다. 설비·광선로를 못 찾아도 빈 글자가 아니라 「—」다.
 */
export function blockWhere(s: S, b: SheetBlock): { where: string; peer: string } {
  const where = b.equipmentId
    ? [equipmentName(s, b.equipmentId) ?? '—', b.panel != null ? `슬롯 ${b.panel}` : null, `어댑터 ${b.startNo}–${b.startNo + b.coreCount - 1}`].filter(Boolean).join(' · ')
    : '단자 미지정';
  const line = lineOf(s, b.lineId);
  return { where, peer: (line ? peerSubstationName(line, b.side) : '') || '—' };
}
