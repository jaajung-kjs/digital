import { describe, expect, it, vi } from 'vitest';

vi.mock('../httpClient', () => ({
  httpClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  tokenStorage: {
    getAccessToken: vi.fn(),
    setAccessToken: vi.fn(),
    getRefreshToken: vi.fn(),
    setRefreshToken: vi.fn(),
    clearTokens: vi.fn(),
  },
}));

import { httpClient as api } from '../httpClient';
import {
  createOrgNode,
  deleteOrgNode,
  fetchAssetPorts,
  fetchCatalog,
  fetchNodeAssets,
  fetchOrgTree,
  fetchWorkingcopy,
  patchOrgNode,
  photoUrl,
  putCommit,
  searchAssets,
} from '../api';

describe('v2 api 경로', () => {
  it('catalog/workingcopy/nodes/commit 경로', async () => {
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });
    (api.put as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });

    await fetchCatalog();
    expect(api.get).toHaveBeenCalledWith('/v2/catalog');
    await fetchWorkingcopy('sub-1');
    expect(api.get).toHaveBeenCalledWith('/v2/substations/sub-1/workingcopy');
    await fetchNodeAssets('node-1');
    expect(api.get).toHaveBeenCalledWith('/v2/nodes/node-1/assets');
    await putCommit('sub-1', { assets: {} });
    expect(api.put).toHaveBeenCalledWith('/v2/substations/sub-1/commit', { assets: {} });
  });

  it('searchAssets/fetchAssetPorts 경로', async () => {
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    await searchAssets('슬롯');
    expect(api.get).toHaveBeenCalledWith('/v2/search/assets', { params: { q: '슬롯' } });
    await fetchAssetPorts('a-1');
    expect(api.get).toHaveBeenCalledWith('/v2/assets/a-1/ports');
  });

  it('org-tree/org CRUD 경로', async () => {
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });
    (api.patch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });
    (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });

    await fetchOrgTree();
    expect(api.get).toHaveBeenCalledWith('/v2/org-tree');
    await createOrgNode('branches', { headquartersId: 'h', name: 'n' });
    expect(api.post).toHaveBeenCalledWith('/v2/org/branches', { headquartersId: 'h', name: 'n' });
    await patchOrgNode('substations', 'id1', { name: 'x' });
    expect(api.patch).toHaveBeenCalledWith('/v2/org/substations/id1', { name: 'x' });
    await deleteOrgNode('substations', 'id2');
    expect(api.delete).toHaveBeenCalledWith('/v2/org/substations/id2');
  });

  /* 지우려는 것이 이미 없으면 지워진 것이다(DELETE 는 멱등하다). 화면이 낡았을 뿐인데
     「찾을 수 없습니다」라고 하면, 정작 그 낡은 줄은 화면에 남고 사람은 또 누른다. */
  it('deleteOrgNode: 이미 없으면(404) 지워진 것으로 본다', async () => {
    const notFound = Object.assign(new Error('Not Found'), {
      isAxiosError: true,
      response: { status: 404, data: { error: 'NOT_FOUND' } },
    });
    (api.delete as ReturnType<typeof vi.fn>).mockRejectedValueOnce(notFound);
    await expect(deleteOrgNode('substations', 'gone')).resolves.toBeUndefined();
  });

  it('deleteOrgNode: 막힌 것(409)은 그대로 알린다', async () => {
    const conflict = Object.assign(new Error('Conflict'), {
      isAxiosError: true,
      response: { status: 409, data: { error: 'HAS_CHILDREN' } },
    });
    (api.delete as ReturnType<typeof vi.fn>).mockRejectedValueOnce(conflict);
    await expect(deleteOrgNode('substations', 'busy')).rejects.toBe(conflict);
  });

  it('사진이 있으면 저장이 multipart 로 간다 — 칸 이름이 그 사진의 id 다', async () => {
    (api.put as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { committedAt: 'now' } });
    const file = new File(['a'], 'a.png', { type: 'image/png' });

    await putCommit('sub-1', { records: { photos: { creates: [{ id: 'ph-1', assetId: 'a-1' }] } } }, new Map([['ph-1', file]]));

    const [url, body, config] = (api.put as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
    expect(url).toBe('/v2/substations/sub-1/commit');
    expect(body).toBeInstanceOf(FormData);
    /* 저장 내용은 payload 칸에, 파일은 제 id 칸에 — 서버가 그 줄에 경로를 지어 준다. */
    expect(JSON.parse((body as FormData).get('payload') as string)).toMatchObject({
      records: { photos: { creates: [{ id: 'ph-1' }] } },
    });
    expect((body as FormData).get('ph-1')).toBe(file);
    expect(config?.headers?.['Content-Type']).toBeUndefined();
  });

  it('사진이 없으면 저장은 그냥 JSON 이다', async () => {
    (api.put as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { committedAt: 'now' } });

    await putCommit('sub-1', { assets: {} });

    const [, body] = (api.put as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
    expect(body).toEqual({ assets: {} });
  });

  it('photoUrl: filePath의 basename만 취해 서빙 경로 생성', () => {
    expect(photoUrl('assets/abc-123.png')).toBe('/api/v2/photos/abc-123.png');
  });
});
