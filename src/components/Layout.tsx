import { Outlet, NavLink } from 'react-router-dom';
import { InstallBanner } from './InstallBanner';
import { OfflineIndicator } from './OfflineIndicator';

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}>
      <InstallBanner />
      <OfflineIndicator />
      <main className="flex-1 pb-20">
        <Outlet />
      </main>
      <nav
        className="fixed bottom-0 left-0 right-0 border-t flex justify-around items-center z-10"
        style={{
          backgroundColor: 'var(--color-bg)',
          borderColor: 'var(--color-border)',
          height: 'calc(4rem + env(safe-area-inset-bottom))',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <NavLink
          to="/"
          end
          className="flex flex-col items-center gap-1 px-4 py-2 text-sm font-medium transition-colors"
          style={({ isActive }) => ({ color: isActive ? 'var(--color-accent)' : 'var(--color-text-muted)' })}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          <span>Home</span>
        </NavLink>

        <NavLink
          to="/search"
          className="flex flex-col items-center gap-1 px-4 py-2 text-sm font-medium transition-colors"
          style={({ isActive }) => ({ color: isActive ? 'var(--color-accent)' : 'var(--color-text-muted)' })}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span>Search</span>
        </NavLink>

        <NavLink
          to="/progress"
          className="flex flex-col items-center gap-1 px-4 py-2 text-sm font-medium transition-colors"
          style={({ isActive }) => ({ color: isActive ? 'var(--color-accent)' : 'var(--color-text-muted)' })}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <span>Progress</span>
        </NavLink>

        <NavLink
          to="/settings"
          className="flex flex-col items-center gap-1 px-4 py-2 text-sm font-medium transition-colors"
          style={({ isActive }) => ({ color: isActive ? 'var(--color-accent)' : 'var(--color-text-muted)' })}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span>Settings</span>
        </NavLink>
      </nav>
    </div>
  );
}
