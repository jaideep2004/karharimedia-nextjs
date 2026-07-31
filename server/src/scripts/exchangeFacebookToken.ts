/**
 * Facebook token exchange script.
 *
 * Usage:
 *   FB_SHORT_LIVED_TOKEN=EAAB... npm run fb:exchange-token
 *   -- or --
 *   npm run fb:exchange-token -- --token=EAAB...
 *   -- or --
 *   npm run fb:exchange-token -- --token=EAAB... --page-id=12345
 *
 * Requires env: FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, MONGODB_URI, DSP_CREDENTIAL_ENCRYPTION_KEY
 *
 * What it does:
 *   1. Exchanges the short-lived user token for a long-lived (~60 day) token
 *      via the fb_exchange_token grant.
 *   2. Calls /me/accounts to fetch fresh page access tokens.
 *   3. Updates the dsp_providers document:
 *      - credentials.pageAccessToken / pageId
 *      - credentials.tokenExpiresAt
 *      - config.connectedPages[*].accessToken (for pages returned by /me/accounts)
 *
 * NOTE: A long-lived token cannot be extended again — run this with a fresh
 * short-lived token from the Graph API Explorer before the current token expires.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import https from 'https';

const FB_GRAPH_API = 'https://graph.facebook.com/v19.0';

function httpGet(url: string): Promise<{ status: number; body: Record<string, any> }> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode || 0, body: JSON.parse(data) });
        } catch {
          reject(new Error(`Non-JSON response (${res.statusCode}): ${data.slice(0, 500)}`));
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  if (!appId || !appSecret) {
    console.error('Missing FACEBOOK_APP_ID / FACEBOOK_APP_SECRET in server/.env');
    process.exit(1);
  }

  const argToken = process.argv.find((a) => a.startsWith('--token='))?.split('=')[1];
  const shortToken = process.env.FB_SHORT_LIVED_TOKEN || argToken;
  if (!shortToken) {
    console.error('Missing short-lived token. Set FB_SHORT_LIVED_TOKEN env or pass --token=EAAB...');
    process.exit(1);
  }

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('Missing MONGODB_URI');
    process.exit(1);
  }

  console.log('Exchanging short-lived token for long-lived token...');
  const exchange = await httpGet(
    `${FB_GRAPH_API}/oauth/access_token?grant_type=fb_exchange_token` +
      `&client_id=${encodeURIComponent(appId)}` +
      `&client_secret=${encodeURIComponent(appSecret)}` +
      `&fb_exchange_token=${encodeURIComponent(shortToken)}`
  );

  if (!exchange.body.access_token) {
    console.error('Exchange failed:', JSON.stringify(exchange.body, null, 2));
    process.exit(1);
  }

  const longToken = exchange.body.access_token;
  const expiresIn = exchange.body.expires_in ? Number(exchange.body.expires_in) : null;
  const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;
  console.log(`Long-lived token obtained. Expires: ${expiresAt?.toISOString() || 'unknown'} (${expiresIn ?? '?'}s)`);

  console.log('Fetching pages via /me/accounts...');
  const accounts = await httpGet(`${FB_GRAPH_API}/me/accounts?access_token=${encodeURIComponent(longToken)}`);
  const pages: Array<{ id: string; name: string; access_token?: string }> = accounts.body.data || [];
  if (pages.length === 0) {
    console.warn('No pages returned from /me/accounts. Only user token will be stored.');
  } else {
    console.log(`Found ${pages.length} page(s): ${pages.map((p) => p.name).join(', ')}`);
  }

  await mongoose.connect(mongoUri);
  const DspProvider = mongoose.model('DspProvider');

  const provider = await DspProvider.findOne({ key: 'facebook' });
  if (!provider) {
    console.error('No facebook provider found in dsp_providers. Run the provider bootstrap first.');
    await mongoose.disconnect();
    process.exit(1);
  }

  const creds = (provider as any).credentials || {};
  const config = (provider as any).config || {};
  const existingPages = Array.isArray(config.connectedPages) ? config.connectedPages : [];

  // Preserve existing default pageId unless --page-id passed
  const pageIdArg = process.argv.find((a) => a.startsWith('--page-id='))?.split('=')[1];
  const defaultPageId = pageIdArg || (creds.pageId as string) || pages[0]?.id || '';

  // Merge new page tokens into connectedPages, keeping old pages that no longer show up
  const mergedPages = existingPages.map((p: { id: string; name?: string; accessToken?: string }) => {
    const fresh = pages.find((np) => np.id === p.id);
    return {
      id: p.id,
      name: fresh?.name || p.name || '',
      accessToken: fresh?.access_token || p.accessToken || '',
    };
  });
  for (const np of pages) {
    if (!mergedPages.some((p: { id: string }) => p.id === np.id)) {
      mergedPages.push({ id: np.id, name: np.name, accessToken: np.access_token || '' });
    }
  }

  const defaultPageToken = pages.find((p) => p.id === defaultPageId)?.access_token || longToken;

  await DspProvider.updateOne(
    { key: 'facebook' },
    {
      $set: {
        'credentials.pageAccessToken': defaultPageToken,
        'credentials.pageId': defaultPageId,
        'credentials.tokenExpiresAt': expiresAt ? expiresAt.toISOString() : '',
        'config.connectedPages': mergedPages,
      },
    }
  );

  console.log('Stored tokens in dsp_providers.facebook:');
  console.log(`  credentials.pageAccessToken -> ${defaultPageToken.slice(0, 20)}...`);
  console.log(`  credentials.pageId           -> ${defaultPageId}`);
  console.log(`  credentials.tokenExpiresAt   -> ${expiresAt?.toISOString() || 'unknown'}`);
  console.log(`  config.connectedPages        -> ${mergedPages.length} page(s) with fresh tokens`);

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch(async (err) => {
  console.error('Script failed:', err instanceof Error ? err.message : err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
