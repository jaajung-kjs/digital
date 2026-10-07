import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { workingCopyStore as store } from '../../../model/store/workingCopy';
import { AddEquipmentDialog } from '../AddEquipmentDialog';
import { AddRackDialog } from '../AddRackDialog';

vi.mock('../../../model/hooks', () => ({
  useCatalog: () => ({ data: {
    categories: [{ id: 'c', key: 'k', name: '전원', sortOrder: 1 }],
    rackTypes: [{ id: 'rt', key: 'r', name: 'UPS반', sortOrder: 1 }],
    equipmentTypes: [{ id: 'et', key: 'e', name: 'UPS', categoryId: 'c', sortOrder: 1 }],
    cableTypes: [], media: [],
  } }),
}));

const rack0 = { id: 'r0', substationId: 'S1', name: 'UPS#1', rackTypeId: 'rt', floorId: null, x: null, y: null, width: null, height: null, facing: null, updatedAt: '' };

beforeEach(() => store.getState().reset());

describe('랙 추가', () => {
  it('같은 이름의 설비를 함께 만든다 — 일체형(UPS반 + UPS)', () => {
    const onCreated = vi.fn();
    render(<AddRackDialog substationId="S1" open onClose={vi.fn()} onCreated={onCreated} />);
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: 'UPS#1' } });
    fireEvent.change(screen.getByLabelText('랙 품목'), { target: { value: 'rt' } });
    fireEvent.click(screen.getByLabelText('같은 이름의 설비 함께 등록'));
    fireEvent.change(screen.getByLabelText('설비 품목'), { target: { value: 'et' } });
    fireEvent.click(screen.getByRole('button', { name: '추가' }));
    const o = store.getState().overlays;
    const rack = Object.values(o.racks.creates)[0]!;
    const eq = Object.values(o.equipment.creates)[0]!;
    expect(rack).toMatchObject({ name: 'UPS#1', rackTypeId: 'rt', substationId: 'S1' });
    expect(eq).toMatchObject({ name: 'UPS#1', typeId: 'et', rackId: rack.id, status: 'normal', circuitCount: 0 });
    expect(onCreated).toHaveBeenCalledWith(rack.id);
  });

  it('같은 국에 같은 이름의 랙이 있으면 추가할 수 없다', () => {
    store.getState().create('racks', rack0);
    render(<AddRackDialog substationId="S1" open onClose={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: 'UPS#1' } });
    fireEvent.change(screen.getByLabelText('랙 품목'), { target: { value: 'rt' } });
    expect(screen.getByRole('button', { name: '추가' })).toBeDisabled();
    expect(screen.getByText(/같은 이름의 랙이 있습니다/)).toBeInTheDocument();
  });
});

describe('설비 추가', () => {
  it('고른 랙에 차단기 없이 만든다 — 차단기·회로 수를 묻지 않는다(차단기는 상세에서 한 줄씩 더한다)', () => {
    store.getState().create('racks', rack0);
    const onCreated = vi.fn();
    render(<AddEquipmentDialog substationId="S1" open defaultRackId="r0" onClose={vi.fn()} onCreated={onCreated} />);
    expect(screen.queryByLabelText(/차단기 수|회로 수/)).toBeNull();
    expect(screen.queryByText(/차단기 수|회로 수/)).toBeNull();
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: '송광치' } });
    fireEvent.change(screen.getByLabelText('설비 품목'), { target: { value: 'et' } });
    fireEvent.click(screen.getByRole('button', { name: '추가' }));
    const eq = Object.values(store.getState().overlays.equipment.creates)[0]!;
    expect(eq).toMatchObject({ name: '송광치', typeId: 'et', rackId: 'r0', substationId: 'S1', circuitCount: 0, status: 'normal' });
    expect(onCreated).toHaveBeenCalledWith(eq.id);
  });

  it('같은 국에 같은 이름의 설비가 있으면 추가할 수 없다', () => {
    store.getState().create('racks', rack0);
    store.getState().create('equipment', { id: 'e0', substationId: 'S1', rackId: 'r0', name: '송광치', typeId: 'et', status: 'normal', model: null, maker: null, madeOn: null, serial: null, installDate: null, manager: null, note: null, circuitCount: 0, panelCount: null, updatedAt: '' });
    render(<AddEquipmentDialog substationId="S1" open defaultRackId="r0" onClose={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: '송광치' } });
    fireEvent.change(screen.getByLabelText('설비 품목'), { target: { value: 'et' } });
    expect(screen.getByRole('button', { name: '추가' })).toBeDisabled();
    expect(screen.getByText(/같은 이름의 설비가 있습니다/)).toBeInTheDocument();
  });
});

describe('닫았다 다시 열면 빈 상자다', () => {
  it('랙 추가', () => {
    const { rerender } = render(<AddRackDialog substationId="S1" open onClose={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: '쓰다 만' } });
    rerender(<AddRackDialog substationId="S1" open={false} onClose={vi.fn()} onCreated={vi.fn()} />);
    rerender(<AddRackDialog substationId="S1" open onClose={vi.fn()} onCreated={vi.fn()} />);
    expect(screen.getByLabelText('이름')).toHaveValue('');
  });
  it('설비 추가', () => {
    const { rerender } = render(<AddEquipmentDialog substationId="S1" open onClose={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: '쓰다 만' } });
    rerender(<AddEquipmentDialog substationId="S1" open={false} onClose={vi.fn()} onCreated={vi.fn()} />);
    rerender(<AddEquipmentDialog substationId="S1" open onClose={vi.fn()} onCreated={vi.fn()} />);
    expect(screen.getByLabelText('이름')).toHaveValue('');
  });
});
