import { describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/api');

import { api } from '../../utils/api';
import { fetchCatalog, fetchNodeAssets, fetchWorkingcopy, putCommit } from '../api';

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
});
