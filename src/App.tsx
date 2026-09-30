import type { MouseEvent, ReactNode } from 'react';
import { RouterProvider, VerticalNavigation } from '@capra/core';
import { BookOutlined, HomeOutlined, NodesOutlined } from '@capra/icons';
import { Navigate, Route, Routes, useHref, useLocation, useNavigate, type NavigateOptions } from 'react-router-dom';
import HomePage from './pages/HomePage';
import MethodologyPage from './pages/MethodologyPage';
import WizardRoute from './pages/WizardRoute';
import { useStore } from './state/DesignStore';

declare module '@capra/core' {
  interface RouterConfig {
    routerOptions: NavigateOptions;
  }
}

/** VerticalNavigation.Item renders a plain <a>, so route client-side and resolve the href under CRIBL_BASE_PATH. */
function NavItem({ to, label, icon, isActive }: { to: string; label: string; icon: ReactNode; isActive: boolean }) {
  const navigate = useNavigate();
  const href = useHref(to);
  return (
    <VerticalNavigation.Item
      label={label}
      icon={icon}
      href={href}
      isActive={isActive}
      onClick={(e: MouseEvent) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
    />
  );
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const { current } = useStore();
  const path = location.pathname;
  const inDesign = path.startsWith('/designs/');

  return (
    <RouterProvider navigate={navigate} useHref={useHref}>
      <div className="app-shell">
        <div className="app-shell__nav">
          <VerticalNavigation aria-label="Architecture Designer navigation">
            <VerticalNavigation.ItemList>
              <NavItem to="/" label="Designs" icon={<HomeOutlined />} isActive={path === '/'} />
              {current && <NavItem to={`/designs/${current.id}`} label={current.name} icon={<NodesOutlined />} isActive={inDesign} />}
            </VerticalNavigation.ItemList>
            <VerticalNavigation.Footer>
              <NavItem to="/methodology" label="Methodology" icon={<BookOutlined />} isActive={path === '/methodology'} />
            </VerticalNavigation.Footer>
          </VerticalNavigation>
        </div>
        <main className="app-shell__main">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/methodology" element={<MethodologyPage />} />
            <Route path="/designs/:designId" element={<WizardRoute />} />
            <Route path="/designs/:designId/:step" element={<WizardRoute />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </RouterProvider>
  );
}
