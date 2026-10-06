import { describe, expect, it } from 'vitest';
import {
  CABLE_MEDIA, CORE_STATUSES, EQUIPMENT_STATUSES, isLineMedium, isLinkMedium, cableMediumLabel,
  DEFAULT_EQUIPMENT_STATUS, DEFAULT_CORE_STATUS,
} from './vocab.js';
import { circuitKey, coreKey, endRefKey, sameEndRef } from './types.js';

describe('매체 어휘', () => {
  it('광선로 매체는 fiber 하나이고 나머지는 국 내 연결용이다', () => {
    expect(CABLE_MEDIA.map((m) => m.key)).toEqual(['power', 'comm', 'ground', 'fiber']);
    expect(isLineMedium('fiber')).toBe(true);
    expect(isLinkMedium('fiber')).toBe(false);
    for (const k of ['power', 'comm', 'ground']) {
      expect(isLinkMedium(k)).toBe(true);
      expect(isLineMedium(k)).toBe(false);
    }
    expect(isLinkMedium('network')).toBe(false); // 옛 어휘는 받지 않는다
  });

  it('라벨은 어휘에서 읽고, 모르는 값은 그대로 돌려준다', () => {
    expect(cableMediumLabel('power')).toBe('전원');
    expect(cableMediumLabel('???')).toBe('???');
  });
});

describe('상태 어휘', () => {
  it('설비 상태에 철거예정·교체예정이 있고 기본은 정상이다', () => {
    expect(EQUIPMENT_STATUSES.map((s) => s.label)).toEqual(['정상', '예비', '고장', '철거예정', '교체예정']);
    expect(DEFAULT_EQUIPMENT_STATUS).toBe('normal');
  });
  it('코어 상태는 물리 상태뿐이다 — 「사용 중」은 저장하지 않는다', () => {
    expect(CORE_STATUSES.map((s) => s.value)).toEqual(['ok', 'broken', 'unusable']);
    expect(DEFAULT_CORE_STATUS).toBe('ok');
  });
});

describe('행 키', () => {
  it('회로·코어 키는 자연 키로 짓는다', () => {
    expect(circuitKey('e1', 3)).toBe('circuit:e1:3');
    expect(coreKey('l1', 5)).toBe('core:l1:5');
  });
  it('연결 끝 키는 대상만 본다 — 설비 표기는 같은 끝인지에 영향이 없다', () => {
    expect(endRefKey({ kind: 'equipment', equipmentId: 'e1', label: 'A' }))
      .toBe(endRefKey({ kind: 'equipment', equipmentId: 'e1', label: 'B' }));
    expect(endRefKey({ kind: 'core', lineId: 'l1', no: 5, side: 'A' })).toBe('core:l1:5:A');
    expect(sameEndRef({ kind: 'circuit', equipmentId: 'e1', no: 1 }, { kind: 'circuit', equipmentId: 'e1', no: 1 })).toBe(true);
    expect(sameEndRef({ kind: 'core', lineId: 'l1', no: 5, side: 'A' }, { kind: 'core', lineId: 'l1', no: 5, side: 'B' })).toBe(false);
  });
});
