import { beforeEach, describe, expect, it, vi } from 'vitest';

const put = vi.fn();
const get = vi.fn();
vi.mock('../../httpClient', () => ({ httpClient: { get: (...a: unknown[]) => get(...a), put: (...a: unknown[]) => put(...a), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));

import { fetchWorkingcopy, normalizeWorkingcopy, putCommit } from '../api';

beforeEach(() => { put.mockReset(); get.mockReset(); });

describe('model/api', () => {
  it('저장은 국을 가리지 않는 한 문으로 간다 — 사진이 없으면 JSON', async () => {
    put.mockResolvedValue({ data: { committedAt: 'x', changeLogId: 'y' } });
    await putCommit({ racks: { creates: [] } });
    expect(put).toHaveBeenCalledWith('/v2/commit', { racks: { creates: [] } });
  });

  it('사진이 있으면 multipart — payload 칸에 JSON, 사진은 제 id 를 칸 이름으로', async () => {
    put.mockResolvedValue({ data: {} });
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    await putCommit({}, new Map([['p1', file]]));
    const [url, form, cfg] = put.mock.calls[0]!;
    expect(url).toBe('/v2/commit');
    expect((form as FormData).get('payload')).toBe('{}');
    expect((form as FormData).get('p1')).toBeInstanceOf(File);
    expect(cfg).toEqual({ headers: { 'Content-Type': undefined } });
  });

  it('워킹카피를 읽을 때 날짜를 YYYY-MM-DD 로 접는다 — 저장이 그 꼴만 받는다', () => {
    const wc = normalizeWorkingcopy({
      substation: { id: 's', name: 'S' }, floors: [], racks: [],
      equipment: [{ id: 'e', installDate: '2024-03-11T00:00:00.000Z', circuits: [] }],
      links: [], farLinks: [], refEquipment: [],
      fiberLines: [{ id: 'l', cores: [{ lineId: 'l', no: 1, measurements: [{ id: 'm', measuredOn: '2024-09-25T00:00:00.000Z' }] }] }],
      maintenanceLogs: [], inspectionLogs: [], photos: [],
    } as never);
    expect(wc.equipment[0]!.installDate).toBe('2024-03-11');
    expect(wc.fiberLines[0]!.cores[0]!.measurements[0]!.measuredOn).toBe('2024-09-25');
  });

  it('fetchWorkingcopy 는 국 워킹카피를 읽어 접어 준다', async () => {
    get.mockResolvedValue({ data: { substation: { id: 's' }, floors: [], racks: [], equipment: [], links: [], farLinks: [], refEquipment: [], fiberLines: [], maintenanceLogs: [], inspectionLogs: [], photos: [] } });
    const wc = await fetchWorkingcopy('s');
    expect(get).toHaveBeenCalledWith('/v2/substations/s/workingcopy');
    expect(wc.racks).toEqual([]);
  });
});
