import { describe, it, expect } from 'vitest';
import { resolveAssetDetailKind } from './resolveAssetDetailKind';

const a = (role: string) => ({ id: 'x', assetType: { role } }) as never;

describe('resolveAssetDetailKind (role 단일 소스)', () => {
  it('slot → conduit-ports', () => { expect(resolveAssetDetailKind(a('slot'))).toBe('conduit-ports'); });
  it('feeder → feeder-circuits', () => { expect(resolveAssetDetailKind(a('feeder'))).toBe('feeder-circuits'); });
  it('rack → rack', () => { expect(resolveAssetDetailKind(a('rack'))).toBe('rack'); });
  it('ofd → ofd', () => { expect(resolveAssetDetailKind(a('ofd'))).toBe('ofd'); });
  it('panel → distribution', () => { expect(resolveAssetDetailKind(a('panel'))).toBe('distribution'); });
  it('standalone → null', () => { expect(resolveAssetDetailKind(a('standalone'))).toBeNull(); });
  it('device → null', () => { expect(resolveAssetDetailKind(a('device'))).toBeNull(); });
  it('null asset → null', () => { expect(resolveAssetDetailKind(null)).toBeNull(); });
});
