import { describe, it, expect } from 'vitest';
import { vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

const SLOT = 'slotA';
const TWIN = 'slotB';
const SLOT_ASSET = { id: SLOT, name: '슬롯', parentAssetId: 'ofdA', substationId: 's1', assetType: { role: 'slot' } };
const opgw = { id: 'opgw', sourceAssetId: SLOT, targetAssetId: TWIN, sourceRole: 'IN', targetRole: 'IN', specParams: { cores: 24 } };
const localOut3 = { id: 'c-l3', sourceAssetId: 'eqpL', targetAssetId: SLOT, sourceRole: null, targetRole: 'OUT', number: 3 };
const remoteOut3 = { id: 'c-r3', sourceAssetId: 'eqpR', targetAssetId: TWIN, sourceRole: null, targetRole: 'OUT', number: 3 };

const A = (id: string, name: string, sub: string, parent: string | null, role: string | null = null) =>
  ({ id, name, substationId: sub, parentAssetId: parent, slotIndex: null, assetType: { role } });
const SLIM = [
  A('eqpL', '자국장비', 's1', null, 'device'),
  A('eqpR', '대국장비', 's2', null, 'device'),
  A(TWIN, '북춘천슬롯', 's2', 'ofdB', 'slot'),
  A('ofdA', 'OFD', 's1', null, 'ofd'),
];
const NAMES = new Map([['s1', '춘천'], ['s2', '북춘천']]);

vi.mock('../../trace/traceGraph', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../trace/traceGraph')>();
  return {
    ...orig,
    useTraceGraph: () => ({
      graph: orig.buildTraceGraph({ assets: SLIM as never[], cables: [opgw, localOut3, remoteOut3] as never[], substationNames: NAMES }),
      isLoading: false,
    }),
  };
});

import { EquipmentSelectCell } from './EquipmentSelectCell';

function wrap(ui: ReactNode) { return render(<>{ui}</>); }

describe('EquipmentSelectCell (읽기전용)', () => {
  it('자국 점유 코어 → 연결 설비명 표시', () => {
    wrap(<EquipmentSelectCell slot={SLOT_ASSET as never} coreNumber={3} side="local" />);
    expect(screen.getByText('자국장비')).toBeInTheDocument();
  });

  it('빈 코어 → 대시(—)', () => {
    wrap(<EquipmentSelectCell slot={SLOT_ASSET as never} coreNumber={5} side="local" />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('endpoint 가드: 대국 셀은 대국 설비(자국 아님)', () => {
    wrap(<EquipmentSelectCell slot={SLOT_ASSET as never} coreNumber={3} side="remote" />);
    expect(screen.getByText('대국장비')).toBeInTheDocument();
    expect(screen.queryByText('자국장비')).toBeNull();
  });
});
