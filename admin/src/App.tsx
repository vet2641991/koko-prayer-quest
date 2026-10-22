import { Navigate, Route, Routes, useLocation } from 'react-router';
import type { ReactNode } from 'react';
import { useAuth } from './auth.tsx';
import { Layout } from './components/Layout.tsx';
import { configured } from './supabase.ts';
import { AdminsPage } from './pages/Admins.tsx';
import { AuditPage } from './pages/Audit.tsx';
import { CatalogPage } from './pages/Catalog.tsx';
import { ContentHome, ContentPage } from './pages/Content.tsx';
import { ForgotPassword, Login, ResetPassword } from './pages/Login.tsx';
import { MediaPage } from './pages/Media.tsx';
import { PromosPage } from './pages/Promos.tsx';
import { UnitPage } from './pages/Unit.tsx';
import { WorldPage } from './pages/World.tsx';

/** Only an active admin gets past here. A signed-in account that is not an admin sees why, and can sign out. */
function Protected({ children }: { children: ReactNode }) {
  const { loading, session, admin, recovering, signOut } = useAuth();
  const loc = useLocation();
  if (loading) return <p className="center muted">Loading…</p>;
  if (recovering) return <Navigate to="/reset" replace />;
  if (!session) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (!admin) return <div className="auth-page"><div className="card auth">
    <h1>No access</h1><p>You are signed in as {session.user.email}, but this account is not an active admin.
      Ask the owner to add you.</p><button onClick={() => signOut()}>Sign out</button></div></div>;
  return <>{children}</>;
}

export function App() {
  const { session, admin } = useAuth();
  if (!configured) return <div className="auth-page"><div className="card auth"><h1>Not configured</h1>
    <p>Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (see admin/.env.example and docs/DEPLOY.md).</p></div></div>;
  return <Routes>
    <Route path="/login" element={session && admin ? <Navigate to="/content" replace /> : <Login />} />
    <Route path="/forgot" element={<ForgotPassword />} />
    <Route path="/reset" element={<ResetPassword />} />
    <Route element={<Protected><Layout /></Protected>}>
      <Route path="/content" element={<ContentPage />}>
        <Route index element={<ContentHome />} />
        <Route path="world/:worldId" element={<WorldPage />} />
        <Route path="unit/:unitId" element={<UnitPage />} />
      </Route>
      <Route path="/media" element={<MediaPage />} />
      <Route path="/promos" element={<PromosPage />} />
      <Route path="/catalog" element={<CatalogPage />} />
      <Route path="/audit" element={<AuditPage />} />
      <Route path="/admins" element={<AdminsPage />} />
    </Route>
    <Route path="*" element={<Navigate to="/content" replace />} />
  </Routes>;
}
