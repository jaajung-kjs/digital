/**
 * apiError.ts 테스트 — 에러→표시 문구 번역의 유일 지점
 *
 * axios 형상 에러(response.data.{message,error,details})에서 메시지/코드/이슈를
 * 추출하는 3개 함수를 검증한다. 비-axios 에러는 항상 fallback.
 */
import { describe, it, expect } from 'vitest';
import { apiErrorMessage, apiErrorCode, apiErrorIssues } from '../apiError';

function axiosError(data: unknown, status = 400) {
  return {
    isAxiosError: true,
    message: 'Request failed',
    response: { status, data },
  };
}

describe('apiErrorMessage', () => {
  it('axios 에러의 response.data.message 를 반환한다', () => {
    const err = axiosError({ message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    expect(apiErrorMessage(err, '기본 실패')).toBe('아이디 또는 비밀번호가 올바르지 않습니다.');
  });

  it('response.data.message 가 없으면 fallback 을 반환한다', () => {
    const err = axiosError({ error: 'SOME_CODE' });
    expect(apiErrorMessage(err, '기본 실패')).toBe('기본 실패');
  });

  it('비-axios 에러는 fallback 을 반환한다', () => {
    expect(apiErrorMessage(new Error('아무 메시지'), '기본 실패')).toBe('기본 실패');
    expect(apiErrorMessage('문자열 에러', '기본 실패')).toBe('기본 실패');
    expect(apiErrorMessage(undefined, '기본 실패')).toBe('기본 실패');
  });
});

describe('apiErrorCode', () => {
  it('axios 에러의 response.data.error 를 반환한다', () => {
    const err = axiosError({ error: 'CABLE_CATEGORY_IN_USE', message: '사용 중' });
    expect(apiErrorCode(err)).toBe('CABLE_CATEGORY_IN_USE');
  });

  it('response.data.error 가 없으면 null 을 반환한다', () => {
    const err = axiosError({ message: '실패' });
    expect(apiErrorCode(err)).toBeNull();
  });

  it('비-axios 에러는 null 을 반환한다', () => {
    expect(apiErrorCode(new Error('x'))).toBeNull();
  });
});

describe('apiErrorIssues', () => {
  it('INVALID_TYPE_SPEC 의 details 배열을 반환한다', () => {
    const details = [{ path: 'fields[0].key', message: '키가 비어 있습니다' }];
    const err = axiosError({ error: 'INVALID_TYPE_SPEC', message: '검증 실패', details });
    expect(apiErrorIssues(err)).toEqual(details);
  });

  it('error 코드가 INVALID_TYPE_SPEC 이 아니면 null 을 반환한다', () => {
    const err = axiosError({ error: 'OTHER_CODE', details: [{ path: 'x', message: 'y' }] });
    expect(apiErrorIssues(err)).toBeNull();
  });

  it('details 가 배열이 아니면 null 을 반환한다', () => {
    const err = axiosError({ error: 'INVALID_TYPE_SPEC' });
    expect(apiErrorIssues(err)).toBeNull();
  });

  it('비-axios 에러는 null 을 반환한다', () => {
    expect(apiErrorIssues(new Error('x'))).toBeNull();
  });
});
