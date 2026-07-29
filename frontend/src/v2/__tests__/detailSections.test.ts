import { describe, expect, it } from 'vitest';
import type { V2AssetType } from '../types';
import { deriveDetailSections } from '../components/detailSections';

const base: V2AssetType = {
  id: 't', key: 'X', name: 'X', categoryId: 'c', sortOrder: 1, isActive: true, assetCount: 0,
  placeable: false, defaultWidth: null, defaultHeight: null,
  laborType: null, installHours: 0, removeHours: 0, relocateHours: 0,
  fieldDefs: [{ key: 'installDate', label: '설치일', type: 'date' }],
  containerSpecs: [], portTemplates: [], linkRules: [],
};

describe('deriveDetailSections — capability 유무로만 파생 (역할 매핑 0)', () => {
  it('컨테이너 명세 있으면 수용 섹션', () => {
    const t = { ...base, containerSpecs: [{ id: 's', key: 'main', name: '슬롯', slotCount: 12, allowSpan: true, accepts: {}, sortOrder: 0 }] };
    expect(deriveDetailSections(t).containerSpecs).toHaveLength(1);
  });
  it('포트 템플릿 있으면 포트 섹션', () => {
    const t = { ...base, portTemplates: [{ id: 'p', group: 'P', count: 2, direction: 'BI' as const, medium: 'network', namePattern: '포트 {n}', sortOrder: 0 }] };
    expect(deriveDetailSections(t).showPorts).toBe(true);
    expect(deriveDetailSections(base).showPorts).toBe(false);
  });
});
