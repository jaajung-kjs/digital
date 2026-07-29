/**
 * V2LoginPage 테스트
 *
 * - 폼 렌더 확인
 * - 제출 시 authStore.login 호출
 * - 오류 시 에러 메시지 표시
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { V2LoginPage } from '../pages/V2LoginPage';

// v2 authStore 모킹
const mockLogin = vi.fn();
const mockNavigate = vi.fn();

vi.mock('../authStore', () => ({
  useV2AuthStore: (sel: (s: { login: typeof mockLogin }) => unknown) =>
    sel({ login: mockLogin }),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderPage() {
  return render(
    <MemoryRouter>
      <V2LoginPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('V2LoginPage 렌더', () => {
  it('아이디·비밀번호 입력, 접속 버튼이 있다', () => {
    renderPage();
    expect(screen.getByLabelText('아이디')).toBeInTheDocument();
    expect(screen.getByLabelText('비밀번호')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /접속/ })).toBeInTheDocument();
  });
});

describe('V2LoginPage 제출', () => {
  it('성공 시 login 호출 후 / 로 이동', async () => {
    mockLogin.mockResolvedValueOnce(undefined);
    renderPage();

    fireEvent.change(screen.getByLabelText('아이디'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'admin123' } });
    fireEvent.click(screen.getByRole('button', { name: /접속/ }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({ username: 'admin', password: 'admin123' });
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    });
  });

  it('실패 시 에러 메시지 표시, 이동 없음', async () => {
    mockLogin.mockRejectedValueOnce(new Error('아이디 또는 비밀번호가 올바르지 않습니다.'));
    renderPage();

    fireEvent.change(screen.getByLabelText('아이디'), { target: { value: 'wrong' } });
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'bad' } });
    fireEvent.click(screen.getByRole('button', { name: /접속/ }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('아이디 또는 비밀번호가 올바르지 않습니다.');
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
