// Session + admin record + permissions. A signed-in account without an ACTIVE row in public.admins gets nothing.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase.ts';
import type { AdminRec, RoleRec } from './types.ts';

export type Perms = { edit: boolean; publish: boolean; approveSacred: boolean; manageAdmins: boolean };
type AuthState = {
  loading: boolean;
  session: Session | null;
  admin: AdminRec | null;
  role: RoleRec | null;
  perms: Perms;
  recovering: boolean;   // arrived from a password-reset link
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};
const NONE: Perms = { edit: false, publish: false, approveSacred: false, manageAdmins: false };
const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [admin, setAdmin] = useState<AdminRec | null>(null);
  const [role, setRole] = useState<RoleRec | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState(false);

  async function load(s: Session | null) {
    setSession(s);
    if (!s) { setAdmin(null); setRole(null); setLoading(false); return; }
    const a = await supabase.from('admins').select('*').eq('user_id', s.user.id).maybeSingle<AdminRec>();
    const rec = a.data && a.data.active ? a.data : null;
    setAdmin(rec);
    if (rec) {
      const r = await supabase.from('roles').select('*').eq('id', rec.role).maybeSingle<RoleRec>();
      setRole(r.data ?? null);
    } else setRole(null);
    setLoading(false);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => load(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED' || event === 'PASSWORD_RECOVERY') {
        // defer: Supabase recommends not awaiting other calls inside this callback
        setTimeout(() => load(s), 0);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const perms: Perms = role ? {
    edit: role.can_edit_content, publish: role.can_publish, approveSacred: role.can_approve_sacred, manageAdmins: role.can_manage_admins,
  } : NONE;

  const value: AuthState = {
    loading, session, admin, role, perms, recovering,
    signOut: async () => { await supabase.auth.signOut(); setRecovering(false); },
    refresh: async () => { const { data } = await supabase.auth.getSession(); await load(data.session); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
