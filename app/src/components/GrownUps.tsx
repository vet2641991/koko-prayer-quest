// Parents' screens (Koko Premium, the parent account) show the parental gate first unless a grown-up just answered
// it, so a child cannot reach a purchase even through a deep link.
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { grownUpRecently, useParentalGate } from './ParentalGate';
import { Screen, T } from './ui';
import { C } from '../theme';

export function GrownUpsOnly({ children }: { children: ReactNode }) {
  const [ok, setOk] = useState(grownUpRecently());
  const back = () => (router.canGoBack() ? router.back() : router.replace('/parents'));
  const { open, gate } = useParentalGate(back);
  useEffect(() => { if (!ok) open(() => setOk(true)); }, []);
  if (ok) return <>{children}</>;
  return <Screen light><T color={C.muted} center>For grown-ups</T>{gate}</Screen>;
}
