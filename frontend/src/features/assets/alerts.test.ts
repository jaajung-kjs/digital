import { describe, it, expect } from 'vitest';
import { assetAlert, INSTALL_AGE_ALERT_YEARS } from './alerts';

const today = new Date('2026-06-05');

describe('assetAlert (설치 후 경과)', () => {
  it('installDate 없으면 null', () => {
    expect(assetAlert({ installDate: null }, today)).toBeNull();
  });
  it(`설치 ${INSTALL_AGE_ALERT_YEARS}년 미만이면 null`, () => {
    expect(assetAlert({ installDate: '2020-06-05' }, today)).toBeNull();
  });
  it(`설치 ${INSTALL_AGE_ALERT_YEARS}년 이상이면 replace 경고 + 경과 연수`, () => {
    const r = assetAlert({ installDate: '2000-06-05' }, today);
    expect(r?.kind).toBe('replace');
    expect(r?.years).toBe(25);
    expect(r?.label).toBe('설치 25년 경과');
  });
  it('경계: 정확히 임계 연수면 경고', () => {
    const installed = new Date(today);
    installed.setFullYear(installed.getFullYear() - INSTALL_AGE_ALERT_YEARS);
    const r = assetAlert({ installDate: installed.toISOString().slice(0, 10) }, today);
    expect(r?.kind).toBe('replace');
    expect(r?.years).toBe(INSTALL_AGE_ALERT_YEARS);
  });
});
