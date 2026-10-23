// Koko Premium for parents: what it is, the price, subscribe, restore. Behind the parental gate.
// The store screens Apple and Google require: price and period, auto-renewal, how to cancel, Terms and Privacy.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Linking, Platform, View } from 'react-native';
import { buy, manageUrl, monthlyOffer, restore, storeName, type Offer } from '../account/billing';
import { GrownUpsOnly } from '../components/GrownUps';
import { Btn, Card, IMG, Screen, T } from '../components/ui';
import { ACCOUNT_URL, PRIVACY_URL, TERMS_URL } from '../config';
import { useAccess } from '../state/access';
import { C } from '../theme';

export default function PremiumScreen() { return <GrownUpsOnly><Premium /></GrownUpsOnly>; }

function Premium() {
  const access = useAccess();
  const [offer, setOffer] = useState<Offer | null>(null), [busy, setBusy] = useState(''), [msg, setMsg] = useState('');
  useEffect(() => { monthlyOffer().then(setOffer).catch(() => setMsg('The store is not reachable right now. Please try again later.')); }, []);
  const run = (label: string, fn: () => Promise<string | void>) => async () => {
    setBusy(label); setMsg('');
    try { const m = await fn(); await access.refresh(); if (m) setMsg(m); }
    catch (e) { setMsg(String((e as Error).message ?? e)); }
    finally { setBusy(''); }
  };
  const until = access.until ? new Date(access.until).toLocaleDateString() : null;
  const web = Platform.OS === 'web';

  return <Screen light>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Btn label="‹" kind="soft" onPress={() => (router.canGoBack() ? router.back() : router.replace('/parents'))} accessibilityLabel="Back" style={{ minHeight: 44, paddingVertical: 4 }} />
      <T size={26} style={{ flex: 1 }}>Koko Premium</T>
    </View>
    <Card style={{ alignItems: 'center' }}>
      <Image source={IMG.cheer} style={{ width: 120, height: 120 }} resizeMode="contain" />
      {access.premium
        ? <><T size={22} center>Koko Premium is on 🎉</T>
            <T weight="medium" color={C.muted} center>{until ? `Paid until ${until}.` : 'No end date.'} Every lesson is open.</T></>
        : <><T size={22} center>Open every lesson</T>
            <T weight="medium" color={C.muted} center>All the Arabic books, the Prayer and Islamic Studies, with every new lesson as it comes out. Made by DHM Institute; sacred texts approved by Dr. Hassan Muslim.</T></>}
    </Card>

    {access.premium ? <>
      <Btn label="Manage subscription" kind="soft" onPress={run('manage', async () => {
        const url = await manageUrl();
        if (url) await Linking.openURL(url); else return 'Manage it where you subscribed: the App Store, Google Play, or the Koko website.';
      })} disabled={Boolean(busy)} />
    </> : <>
      <Card>
        <T size={28} center>{offer ? `${offer.price} / month` : '…'}</T>
        <T size={13} weight="medium" color={C.muted} center>
          {web ? 'Paid securely with Stripe. Renews every month until you cancel; cancel any time from your account.'
            : `Paid with your ${storeName} account when you confirm. Renews every month unless cancelled at least 24 hours before the end of the month. Manage or cancel in your ${storeName} settings.`}
        </T>
      </Card>
      <Btn label={busy === 'buy' ? 'Opening…' : 'Subscribe'} onPress={run('buy', async () => {
        if (!offer) return 'The store is not reachable right now. Please try again later.';
        if (await buy(offer)) return 'Thank you! Every lesson is open.';
      })} disabled={!offer || Boolean(busy)} />
      {!web ? <Btn label={busy === 'restore' ? 'Restoring…' : 'Restore purchases'} kind="soft" onPress={run('restore', async () =>
        (await restore()) ? 'Restored. Every lesson is open.' : `No Koko Premium was found for this ${storeName} account.`)} disabled={Boolean(busy)} /> : null}
    </>}
    {msg ? <T weight="medium" center color={C.ink}>{msg}</T> : null}

    <Card>
      <T size={16}>{access.parent ? `Family account: ${access.parent.email}` : 'Subscribed on the website, or on another phone?'}</T>
      <T size={13} weight="medium" color={C.muted}>{access.parent ? 'Koko Premium follows this email on every device and on the website.'
        : 'Sign in with the same email to use it here. Signing in is optional.'}</T>
      <Btn label={access.parent ? 'Account' : 'Sign in with email'} kind="soft" onPress={() => router.push('/account')} />
    </Card>
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {!web ? <Btn label="Terms of Use" kind="soft" onPress={() => Linking.openURL(TERMS_URL)} style={{ flex: 1 }} /> : null}
      <Btn label="Privacy" kind="soft" onPress={() => Linking.openURL(PRIVACY_URL)} style={{ flex: 1 }} />
      {web ? <Btn label="Website account" kind="soft" onPress={() => Linking.openURL(ACCOUNT_URL)} style={{ flex: 1 }} /> : null}
    </View>
  </Screen>;
}
