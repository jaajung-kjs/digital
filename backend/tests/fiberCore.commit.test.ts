import { describe, it, expect } from 'vitest';
import { substationCommitSchema } from '../src/schemas/substationCommit.schema.js';

describe('substationCommitSchema: fiberCores', () => {
  it('fiberCores create/update/delete 를 파싱한다', () => {
    const parsed = substationCommitSchema.parse({
      fiberCores: {
        creates: [{ tempId: 't1', fiberPathId: 'fp1', coreNumber: 5, purpose: '통합단말', circuitText: '원주 GR2링' }],
        updates: [{ id: 'fc1', baseVersion: null, patch: { spliceType: '패치', usageOverride: '사용' } }],
        deletes: [{ id: 'fc2', baseVersion: null }],
      },
    });
    expect(parsed.fiberCores?.creates[0]).toMatchObject({ tempId: 't1', fiberPathId: 'fp1', coreNumber: 5 });
    expect(parsed.fiberCores?.updates[0].patch).toMatchObject({ spliceType: '패치', usageOverride: '사용' });
    expect(parsed.fiberCores?.deletes[0].id).toBe('fc2');
  });
});
