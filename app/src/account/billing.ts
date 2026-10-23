// App Store / Google Play subscription through RevenueCat. A parent can subscribe without an account (Apple asks
// that buying not require one); signing in links the purchase to the parent's Koko account, so it also works on
// other devices and on the website.
import { Platform } from 'react-native';
import Purchases, { type PurchasesPackage } from 'react-native-purchases';
import { PREMIUM_ENTITLEMENT, REVENUECAT_KEYS } from '../config';

const apiKey = Platform.OS === 'ios' ? REVENUECAT_KEYS.ios : Platform.OS === 'android' ? REVENUECAT_KEYS.android : '';
let configured = false;

export const storeBillingAvailable = () => Boolean(apiKey);
export const storeName = Platform.OS === 'ios' ? 'App Store' : 'Google Play';

export function initStoreBilling(): boolean {
  if (!apiKey) return false;
  if (!configured) { Purchases.configure({ apiKey }); configured = true; }
  return true;
}

/** Links (or unlinks) the store purchases to the signed-in parent. */
export async function identify(userId: string | null) {
  if (!initStoreBilling()) return;
  try {
    if (userId) await Purchases.logIn(userId);
    else if (!(await Purchases.isAnonymous())) await Purchases.logOut();
  } catch { /* offline: RevenueCat retries on the next launch */ }
}

/** Premium from the store, as RevenueCat knows it (works offline from its cache). */
export async function storePremium(): Promise<{ premium: boolean; until: string | null }> {
  if (!initStoreBilling()) return { premium: false, until: null };
  try {
    const e = (await Purchases.getCustomerInfo()).entitlements.active[PREMIUM_ENTITLEMENT];
    return { premium: Boolean(e), until: e?.expirationDate ?? null };
  } catch { return { premium: false, until: null }; }
}

export type Offer = { price: string; pkg: PurchasesPackage };
export async function monthlyOffer(): Promise<Offer | null> {
  if (!initStoreBilling()) return null;
  const o = (await Purchases.getOfferings()).current;
  const pkg = o?.monthly ?? o?.availablePackages[0];
  return pkg ? { price: pkg.product.priceString, pkg } : null;
}

/** Buys; false when the parent cancelled the store sheet. */
export async function buy(offer: Offer): Promise<boolean> {
  try {
    const r = await Purchases.purchasePackage(offer.pkg);
    return Boolean(r.customerInfo.entitlements.active[PREMIUM_ENTITLEMENT]);
  } catch (e) {
    if ((e as { userCancelled?: boolean }).userCancelled) return false;
    throw e;
  }
}

export async function restore(): Promise<boolean> {
  if (!initStoreBilling()) return false;
  return Boolean((await Purchases.restorePurchases()).entitlements.active[PREMIUM_ENTITLEMENT]);
}

/** Where the parent manages or cancels the store subscription. */
export async function manageUrl(): Promise<string | null> {
  if (!initStoreBilling()) return null;
  try { return (await Purchases.getCustomerInfo()).managementURL; } catch { return null; }
}
