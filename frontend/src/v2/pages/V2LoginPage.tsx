import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Boxes, AlertCircle } from 'lucide-react';
import { useV2AuthStore } from '../store/authStore';
import { apiErrorMessage } from '../apiError';
import { Button, Input } from '../../components/ui';

export function V2LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const navigate = useNavigate();
  const login = useV2AuthStore((s) => s.login);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError('');
    setSubmitting(true);
    try {
      await login({ username, password });
      navigate('/', { replace: true });
    } catch (err: unknown) {
      setLocalError(apiErrorMessage(err, '로그인에 실패했습니다.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* LEFT — 브랜드 패널 */}
      <div className="hidden md:flex md:w-[45%] flex-col justify-between p-12 bg-gradient-to-br from-[#1c1917] to-[#292524] text-white">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded border border-white/20">
            <Boxes className="h-6 w-6 text-primary" />
          </div>
          <span className="text-lg font-semibold tracking-tight">ICT 디지털 트윈</span>
        </div>

        <div className="space-y-4">
          <h1 className="text-3xl font-bold leading-snug">
            변전소 설비 현황관리 시스템
          </h1>
          <p className="text-base text-white/60">
            현황 · 평면도 · 계통도 통합 관리
          </p>
        </div>

        <p className="text-sm text-white/40">강원본부 · v2.0</p>
      </div>

      {/* RIGHT — 폼 패널 */}
      <div className="flex flex-1 items-center justify-center bg-surface px-6 py-12">
        <div className="w-full max-w-sm">
          {/* 모바일 브랜드 */}
          <div className="mb-8 flex items-center gap-3 md:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded border border-line">
              <Boxes className="h-5 w-5 text-primary" />
            </div>
            <span className="text-base font-semibold text-content">ICT 디지털 트윈</span>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-content">로그인</h2>
            <p className="mt-2 text-sm text-content-muted">
              계정 정보를 입력해 시스템에 접속하세요.
            </p>
          </div>

          {localError && (
            <div
              role="alert"
              className="mb-6 flex items-start gap-2 rounded bg-danger-bg p-3 text-sm text-danger"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{localError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="username"
                className="mb-1.5 block text-sm font-medium text-content"
              >
                아이디
              </label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                placeholder="아이디를 입력하세요"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium text-content"
              >
                비밀번호
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="비밀번호를 입력하세요"
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              disabled={submitting}
              className="w-full justify-center py-2.5"
            >
              {submitting ? '접속 중...' : '접속'}
            </Button>
          </form>

          <p className="mt-8 text-center text-xs text-content-faint">
            © 2026 ICT 디지털 트윈 시스템
          </p>
        </div>
      </div>
    </div>
  );
}

export default V2LoginPage;
