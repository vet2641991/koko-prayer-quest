// Web build of the app: there is no App Store here, so Koko Premium is bought on the website (Stripe Checkout).
import type { PurchasesPackage } from 'react-native-purchases';
import { PREMIUM_PRICE_WEB } from '../config';
import { callFunction } from './session';

export const storeBillingAvailable = () => false;
export const storeName = 'the website';
export function initStoreBilling() { return false; }
export async function identify(_userId: string | null) { /* nothing to link */ }
export async function storePremium() { return { premium: false, until: null as string | null }; }
export type Offer = { price: string; pkg: PurchasesPackage | null };
export async function monthlyOffer(): Promise<Offer | null> { return { price: PREMIUM_PRICE_WEB, pkg: null }; }
export async function buy(_offer: Offer): Promise<boolean> {
  const { url } = await callFunction<{ url: string }>('stripe-checkout');
  window.location.assign(url);
  return false;
}
export async function restore() { return false; }
export async function manageUrl(): Promise<string | null> {
  try { return (await callFunction<{ url: string }>('stripe-portal')).url; } catch { return null; }
}
