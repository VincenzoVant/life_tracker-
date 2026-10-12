import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Sidebar } from './Sidebar';
import { TabBar } from './TabBar';

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="app">
      <Sidebar />
      <div className="app-body">
        <header className="app-header">
          <span className="brand">Life Tracker</span>
          <Link to="/settings" className="nav-link-gear" aria-label="Settings">
            ⚙
          </Link>
        </header>
        <main className="app-main">{children}</main>
      </div>
      <TabBar />
    </div>
  );
}
