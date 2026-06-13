import { describe, it, expect } from 'vitest';
import { substationCommitSchema } from '../src/schemas/substationCommit.schema.js';

describe('cable number 스키마', () => {
  it('cableCreate 가 number 를 보존한다', () => {
    const p = substationCommitSchema.parse({
      cables: { creates: [{ tempId: 't', sourceAssetId: 'a', targetAssetId: 'b', cableType: 'FIBER', number: 5 }] },
    });
    expect(p.cables?.creates[0]).toMatchObject({ number: 5 });
  });
});
