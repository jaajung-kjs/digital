import { describe, it, expect } from 'vitest';
import { substationCommitSchema } from '../src/schemas/substationCommit.schema.js';

describe('cable IN/OUT role 스키마', () => {
  it('cableCreate 가 sourceRole/targetRole 를 보존한다', () => {
    const p = substationCommitSchema.parse({
      cables: { creates: [{ tempId: 't', sourceAssetId: 'a', targetAssetId: 'b', cableType: 'AC', sourceRole: 'OUT', targetRole: 'IN' }] },
    });
    expect(p.cables?.creates[0]).toMatchObject({ sourceRole: 'OUT', targetRole: 'IN' });
  });
});
