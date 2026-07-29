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
    await deleteOrgNode('floors', 'id2');
    expect(api.delete).toHaveBeenCalledWith('/v2/org/floors/id2');
  });
});
