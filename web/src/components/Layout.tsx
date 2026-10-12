import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Banners } from './Banners';
import { Sidebar } from './Sidebar';
import { SyncBadge } from './SyncBadge';
import { TabBar } from './TabBar';

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="app">
      <Sidebar />
      <div className="app-body">
        <header className="app-header">
          <span className="brand">Life Tracker</span>
          <SyncBadge />
          <Link to="/settings" className="nav-link-gear" aria-label="Settings">
            ⚙
          </Link>
        </header>
        <Banners />
        <main className="app-main">{children}</main>
      </div>
      <TabBar />
    </div>
  );
}
