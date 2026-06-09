import { useState } from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { TreePanel } from './tree/TreePanel';
import { Breadcrumb } from './Breadcrumb';
import { useTreeRouteSync } from '../hooks/useTreeRouteSync';

const COLLAPSE_KEY = 'appshell-nav-collapsed';

export function AppShell() {
  useTreeRouteSync(); // route → tree highlight/reveal sync (no UI)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');
  const toggle = () =>
    setCollapsed((c) => {
      const n = !c;
      localStorage.setItem(COLLAPSE_KEY, n ? '1' : '0');
      return n;
    });

  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="h-screen flex flex-col">
      <header className="shrink-0 h-12 flex items-center gap-3 px-3 border-b border-gray-200 bg-white">
        <button
          onClick={toggle}
          aria-label={collapsed ? '트리 펼치기' : '트리 접기'}
          className="text-gray-500 hover:text-gray-800 px-1 text-lg"
        >
          ☰
        </button>
        <Link to="/" className="font-semibold text-sm shrink-0">
          ICT 디지털 트윈
        </Link>
        <div className="flex-1 min-w-0">
          <Breadcrumb />
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-sm text-gray-600">
            {user?.name}
            <span className="ml-1 text-xs text-gray-400">
              ({user?.role === 'ADMIN' ? '관리자' : '일반'})
            </span>
          </span>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            로그아웃
          </button>
        </div>
      </header>
      <div className="flex-1 min-h-0 flex">
        <nav
          className={`${collapsed ? 'w-0' : 'w-72'} shrink-0 border-r border-gray-200 overflow-hidden transition-[width] duration-150`}
        >
          <div className="w-72 h-full overflow-y-auto">
            <TreePanel />
          </div>
        </nav>
        <main className="flex-1 min-h-0 relative">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
