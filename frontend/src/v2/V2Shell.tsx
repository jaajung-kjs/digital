/**
 * V2Shell — v2 전용 최상위 레이아웃
 *
 * 구조:
 *   ┌── header (shrink-0, h-12) ──────────────────────────────────────────┐
 *   │  [Boxes] ICT 디지털 트윈  |  워크스페이스  자산 카탈로그  |  사용자(역할) 로그아웃 │
 *   └─────────────────────────────────────────────────────────────────────┘
 *   ┌── <Outlet/> (flex-1, min-h-0) ─────────────────────────────────────┐
 *   │  v2 페이지가 자체 OrgTreePanel 보유 → 이중 사이드바 없음           │
 *   └─────────────────────────────────────────────────────────────────────┘
 */
import { Outlet, Link, NavLink, useNavigate } from 'react-router-dom';
import { Boxes, LogOut } from 'lucide-react';
import { useV2AuthStore, isAdminRole } from './authStore';

export function V2Shell() {
  const user = useV2AuthStore((s) => s.user);
  const logout = useV2AuthStore((s) => s.logout);
  const navigate = useNavigate();

  const roleLabel = isAdminRole(user?.role) ? '관리자' : '조회';

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex h-screen flex-col">
      {/* ── 상단 헤더 ── */}
      <header className="shrink-0 flex h-12 items-center gap-4 border-b border-line bg-surface px-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
        {/* 타이틀 */}
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2 text-sm font-semibold text-content"
        >
          <Boxes size={20} className="text-primary" />
          ICT 디지털 트윈
        </Link>

        {/* 내비게이션 링크 */}
        <nav className="flex items-center gap-1" aria-label="주요 메뉴">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `rounded px-3 py-1.5 text-sm transition-colors ${
                isActive
                  ? 'bg-surface-2 font-medium text-content'
                  : 'text-content-muted hover:text-content'
              }`
            }
          >
            워크스페이스
          </NavLink>
          <NavLink
            to="/catalog"
            className={({ isActive }) =>
              `rounded px-3 py-1.5 text-sm transition-colors ${
                isActive
                  ? 'bg-surface-2 font-medium text-content'
                  : 'text-content-muted hover:text-content'
              }`
            }
          >
            자산 카탈로그
          </NavLink>
        </nav>

        {/* 우측: 사용자 + 로그아웃 */}
        <div className="ml-auto flex shrink-0 items-center gap-3">
          {user && (
            <span className="text-sm text-content-muted">
              {user.username}
              <span className="ml-1 text-xs text-content-faint">({roleLabel})</span>
            </span>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-sm text-content-muted transition-colors hover:text-content"
          >
            <LogOut size={16} />
            로그아웃
          </button>
        </div>
      </header>

      {/* ── 콘텐츠 영역 ── */}
      <div className="flex min-h-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}

export default V2Shell;
