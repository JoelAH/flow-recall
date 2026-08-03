import { Outlet } from 'react-router-dom';
import LeftNav from './LeftNav';
import { TopHeader } from './TopHeader';
import './Layout.css';

export default function Layout() {
  return (
    <div className="layout">
      <LeftNav />
      <div className="layout-main">
        <TopHeader />
        <main className="layout-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
