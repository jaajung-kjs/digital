import { describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/api');

import { api } from '../../utils/api';
import {
  createOrgNode,
  deleteOrgNode,
  fetchCatalog,
  fetchNodeAssets,
  fetchOrgTree,
  fetchWorkingcopy,
  patchOrgNode,
  putCommit,
} from '../api';

describe('v2 api 경로', () => {
  it('catalog/workingcopy/nodes/commit 경로', async () => {
    (api.get as any).mockResolvedValue({ data: {} });
    (api.put as any).mockResolvedValue({ data: {} });

    await fetchCatalog();
    expect(api.get).toHaveBeenCalledWith('/v2/catalog');
    await fetchWorkingcopy('sub-1');
    expect(api.get).toHaveBeenCalledWith('/v2/substations/sub-1/workingcopy');
    await fetchNodeAssets('node-1');
    expect(api.get).toHaveBeenCalledWith('/v2/nodes/node-1/assets');
    await putCommit('sub-1', { assets: {} });
    expect(api.put).toHaveBeenCalledWith('/v2/substations/sub-1/commit', { assets: {} });
  });

  it('org-tree/org CRUD 경로', async () => {
    (api.get as any).mockResolvedValue({ data: {} });
    (api.post as any).mockResolvedValue({ data: {} });
    (api.patch as any).mockResolvedValue({ data: {} });
    (api.delete as any).mockResolvedValue({ data: {} });

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
