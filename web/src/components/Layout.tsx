import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Sidebar } from './Sidebar';
import { TabBar } from './TabBar';
import '../features/quickAdd/quickAdd.css';

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="app">
      <Sidebar />
      <div className="app-body">
        <header className="app-header">
          <span className="brand">Life Tracker</span>
          <Link to="/quick-add" className="link-button header-quick-add">
            + Something came up
          </Link>
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
