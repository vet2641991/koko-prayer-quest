// The parent's Koko account (optional): sign in with an emailed code, see Koko Premium, sign out, delete the account.
// Behind the parental gate. Nothing about the child is in the account: progress stays on the device.
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Platform, TextInput, View } from 'react-native';
import { manageUrl, storeName } from '../account/billing';
import { deleteAccount, requestCode, signOut, verifyCode } from '../account/session';
import { GrownUpsOnly } from '../components/GrownUps';
import { Btn, Card, Screen, T } from '../components/ui';
import { useAccess } from '../state/access';
import { C, F } from '../theme';

export default function AccountScreen() { return <GrownUpsOnly><Account /></GrownUpsOnly>; }

function Account() {
  const access = useAccess();
  const [email, setEmail] = useState(''), [code, setCode] = useState(''), [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState('');
  const run = (fn: () => Promise<string | void>) => async () => {
    setBusy(true); setMsg('');
    try { const m = await fn(); if (m) setMsg(m); } catch (e) { setMsg(String((e as Error).message ?? e)); } finally { setBusy(false); }
  };
  const back = () => (router.canGoBack() ? router.back() : router.replace('/parents'));
  const confirmDelete = () => {
    const go = run(async () => { await deleteAccount(); await access.refresh(); return 'Your account was deleted.'; });
    const text = `Your Koko account and its link to Koko Premium will be deleted. A website subscription is cancelled now. A subscription bought in the ${storeName} must be cancelled in the ${storeName} settings.`;
    if (Platform.OS === 'web') { if (window.confirm(text)) void go(); }
    else Alert.alert('Delete account?', text, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => void go() }]);
  };

  return <Screen light>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Btn label="‹" kind="soft" onPress={back} accessibilityLabel="Back" style={{ minHeight: 44, paddingVertical: 4 }} />
      <T size={26} style={{ flex: 1 }}>Family account</T>
    </View>
    {access.parent ? <>
      <Card>
        <T size={13} color={C.muted}>SIGNED IN AS</T><T size={18}>{access.parent.email}</T>
        <T weight="medium" color={C.muted}>{access.premium ? `Koko Premium is on${access.until ? ` until ${new Date(access.until).toLocaleDateString()}` : ''}.` : 'No Koko Premium on this account yet.'}</T>
      </Card>
      {access.premium ? <Btn label="Manage subscription" kind="soft" disabled={busy} onPress={run(async () => {
        const url = await manageUrl();
        if (url) await Linking.openURL(url); else return 'Manage it where you subscribed: the App Store, Google Play, or the Koko website.';
      })} /> : <Btn label="Koko Premium" onPress={() => router.replace('/premium')} />}
      <Btn label="Sign out" kind="soft" disabled={busy} onPress={run(async () => { await signOut(); await access.refresh(); })} />
      <Btn label="Delete account" kind="soft" disabled={busy} onPress={confirmDelete} />
    </> : <Card>
      <T weight="medium" color={C.muted}>Sign in with the email you used for Koko Premium (on the website or another phone). We send a 6-digit code: no password. Your child's progress stays on this device.</T>
      {!sent ? <>
        <TextInput value={email} onChangeText={setEmail} placeholder="Parent's email" autoCapitalize="none" autoComplete="email" keyboardType="email-address"
          accessibilityLabel="Parent's email" style={inputStyle} />
        <Btn label={busy ? 'Sending…' : 'Send me a code'} disabled={busy || !email.includes('@')} onPress={run(async () => {
          await requestCode(email.trim().toLowerCase()); setSent(true); return `We emailed a code to ${email.trim()}.`;
        })} />
      </> : <>
        <TextInput value={code} onChangeText={t => setCode(t.replace(/\D/g, ''))} placeholder="6-digit code" keyboardType="number-pad" maxLength={6}
          autoComplete="one-time-code" accessibilityLabel="Code from the email" style={inputStyle} />
        <Btn label={busy ? 'Checking…' : 'Sign in'} disabled={busy || code.length !== 6} onPress={run(async () => {
          await verifyCode(email.trim().toLowerCase(), code); await access.refresh(); setSent(false); setCode('');
        })} />
        <Btn label="Use another email" kind="soft" onPress={() => { setSent(false); setCode(''); setMsg(''); }} />
      </>}
    </Card>}
    {msg ? <T weight="medium" center>{msg}</T> : null}
  </Screen>;
}

const inputStyle = { borderWidth: 2, borderColor: C.line, borderRadius: 14, padding: 12, fontSize: 18, fontFamily: F.en, backgroundColor: C.white };
