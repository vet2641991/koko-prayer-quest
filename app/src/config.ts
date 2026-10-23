// Where the app reads its content: the same static export the PWA uses (GitHub Pages). Never Supabase.
import Constants from 'expo-constants';

export const CONTENT_URL: string = (process.env.EXPO_PUBLIC_CONTENT_URL
  ?? (Constants.expoConfig?.extra as { contentUrl?: string } | undefined)?.contentUrl
  ?? 'https://koko.dhm-institute.com').replace(/\/$/, '');

export const remote = (path: string) => `${CONTENT_URL}/${path}`;

/** DHM Institute pages (opened only behind the parental gate). */
export const BOOKING_URL = 'https://dhm-institute.com/trial-sessions/booking';
export const DHM_URL = 'https://dhm-institute.com/';
export const PRIVACY_URL = `${CONTENT_URL}/privacy.html`;

// ---------------------------------------------------------------------------------------------------------------
// Koko Premium. Only public values here: the Supabase publishable key and RevenueCat's public SDK keys are made to
// ship inside apps. They come from GitHub variables, written into app.json's "extra" by the build workflow
// (or EXPO_PUBLIC_* when running locally). Without them the app has no subscription and every lesson stays open.
// ---------------------------------------------------------------------------------------------------------------
const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;
export const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://pwgkxdiwqrxkndkyzwlw.supabase.co').replace(/\/$/, '');
export const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? extra.supabasePublishableKey ?? '';
export const REVENUECAT_KEYS = {
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? extra.revenuecatIosKey ?? '',
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? extra.revenuecatAndroidKey ?? '',
};
export const PREMIUM_ENTITLEMENT = 'premium';
export const PREMIUM_PRICE_WEB = '$35';   // the Stripe price; in the stores the store shows its own local price
export const ACCOUNT_URL = `${CONTENT_URL}/account.html`;
/** Apple's standard licence agreement: the Terms of Use every subscription screen must link to. */
export const TERMS_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
