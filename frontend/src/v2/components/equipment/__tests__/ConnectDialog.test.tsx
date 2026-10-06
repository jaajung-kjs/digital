import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { workingCopyStore as store } from '../../../model/store/workingCopy';
import { ConnectDialog } from '../ConnectDialog';

vi.mock('../../../model/hooks', () => ({
  useCatalog: () => ({ data: { categories: [], rackTypes: [], equipmentTypes: [], media: [],
    cableTypes: [{ id: 'fcv', key: 'a', name: 'F-CV 전력케이블', medium: 'power', sortOrder: 1 }, { id: 'opgw', key: 'b', name: 'OPGW', medium: 'fiber', sortOrder: 2 }] } }),
}));

beforeEach(() => {
  store.getState().reset();
  const s = store.getState();
  s.create('racks', { id: 'r', substationId: 'S1', name: '랙', rackTypeId: 'rt', floorId: null, x: null, y: null, width: null, height: null, facing: null, updatedAt: '' });
  s.create('equipment', { id: 'p', substationId: 'S1', rackId: 'r', name: '분전반', typeId: 't', status: 'normal', model: null, maker: null, madeOn: null, serial: null, installDate: null, manager: null, note: null, circuitCount: 1, panelCount: null, updatedAt: '' });
  s.create('equipment', { id: 'o', substationId: 'S1', rackId: 'r', name: '송광치', typeId: 't', status: 'normal', model: null, maker: null, madeOn: null, serial: null, installDate: null, manager: null, note: null, circuitCount: 0, panelCount: null, updatedAt: '' });
});

describe('잇기 대화상자', () => {
  it('회로에서 설비로 — 국 내 연결 케이블 품목만 고를 수 있다', () => {
    const onCreated = vi.fn();
    render(<ConnectDialog substationId="S1" from={{ kind: 'circuit', equipmentId: 'p', no: 1 }} open onClose={vi.fn()} onCreated={onCreated} />);
    fireEvent.click(screen.getByText('송광치'));
    const cable = screen.getByLabelText('케이블 품목') as HTMLSelectElement;
    expect([...cable.options].map((o) => o.textContent)).not.toContain('OPGW');
    fireEvent.change(cable, { target: { value: 'fcv' } });
    fireEvent.change(screen.getByLabelText('길이(m)'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: '잇기' }));
    const link = Object.values(store.getState().overlays.links.creates)[0]!;
    expect(link).toMatchObject({ substationId: 'S1', cableTypeId: 'fcv', lengthM: 12, a: { kind: 'circuit', equipmentId: 'p', no: 1 }, b: { kind: 'equipment', equipmentId: 'o' } });
    expect(onCreated).toHaveBeenCalledWith(link.id);
  });

  it('자기 자신은 고를 수 없다(LINK_SELF 미리 보기)', () => {
    render(<ConnectDialog substationId="S1" from={{ kind: 'equipment', equipmentId: 'o' }} open onClose={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.click(screen.getAllByText('송광치')[0]!);
    expect(screen.getByRole('button', { name: '잇기' })).toBeDisabled();
    expect(screen.getByText('연결의 두 끝이 같습니다')).toBeInTheDocument();
  });

  it('쓰인 회로 끝은 고를 수 없다', () => {
    const s = store.getState();
    s.create('links', { id: 'k', substationId: 'S1', cableTypeId: null, lengthM: null, spec: null, note: null, pathPoints: [], a: { kind: 'circuit', equipmentId: 'p', no: 1 }, b: { kind: 'equipment', equipmentId: 'o' }, updatedAt: '' });
    render(<ConnectDialog substationId="S1" from={{ kind: 'equipment', equipmentId: 'o' }} open onClose={vi.fn()} onCreated={vi.fn()} />);
    const taken = screen.getByText('분전반 회로 1');
    expect(taken).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(taken);
    expect(taken).not.toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: '잇기' })).toBeDisabled();
    fireEvent.click(screen.getByText('분전반'));
    expect(screen.getByText('분전반')).toHaveAttribute('aria-selected', 'true');
  });
});
