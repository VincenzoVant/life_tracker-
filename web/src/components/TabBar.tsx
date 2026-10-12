import { NavLink } from 'react-router';
import { NAV_ITEMS } from './nav';

export function TabBar() {
  return (
    <nav className="tabbar" aria-label="Main">
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.to === '/'}>
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
