// Stripe for the website subscription. STRIPE_SECRET_KEY is an Edge Function secret (copied from GitHub by the
// Sync to Supabase workflow); it never reaches a browser or the app.
import Stripe from 'npm:stripe@23.0.0';

export function stripe(): Stripe | null {
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) return null;
  // STRIPE_API_BASE points the functions at a fake Stripe in local end-to-end tests; it is never set on Supabase.
  const base = Deno.env.get('STRIPE_API_BASE');
  const where = base ? (u => ({ host: u.hostname, port: u.port, protocol: u.protocol.replace(':', '') as 'http' | 'https' }))(new URL(base)) : {};
  return new Stripe(key, { httpClient: Stripe.createFetchHttpClient(), maxNetworkRetries: 2, ...where });
}
export const cryptoProvider = Stripe.createSubtleCryptoProvider();
export type { Stripe };
