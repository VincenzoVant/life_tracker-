import { NavLink } from 'react-router';
import { NAV_ITEMS } from './nav';

export function Sidebar() {
  return (
    <nav className="sidebar" aria-label="Sidebar">
      <strong>Life Tracker</strong>
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.to === '/'}>
          {item.label}
        </NavLink>
      ))}
      <NavLink to="/settings">Settings</NavLink>
    </nav>
  );
}
