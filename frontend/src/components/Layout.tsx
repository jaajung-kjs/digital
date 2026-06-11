import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="h-screen flex flex-col bg-bg">
      {/* Header */}
      <header className="bg-surface shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center">
              <span className="text-xl font-bold text-primary">
                ICT 디지털 트윈
              </span>
            </Link>

            {/* User Menu */}
            <div className="flex items-center space-x-4">
              <span className="text-sm text-content-muted">
                {user?.name}
                <span className="ml-1 text-xs text-content-faint">
                  ({user?.role === 'ADMIN' ? '관리자' : '일반'})
                </span>
              </span>
              <button
                onClick={handleLogout}
                className="text-sm text-content-muted hover:text-content"
              >
                로그아웃
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
