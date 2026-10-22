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
