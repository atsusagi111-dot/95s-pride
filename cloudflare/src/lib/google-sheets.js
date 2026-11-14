// Google スプレッドシート(フォームの回答)をサービスアカウントで読む
// GOOGLE_SERVICE_ACCOUNT は、サービスアカウントの JSON 鍵をそのまま wrangler secret に入れる
// シートはそのサービスアカウントのメールアドレスに「閲覧者」として共有しておく

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

function base64url(input) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// PEM の秘密鍵を WebCrypto の鍵にする
async function importPrivateKey(pem) {
  const body = pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

// サービスアカウントでアクセストークンを取る(JWT を署名して交換する)
async function getAccessToken(serviceAccount) {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: nowSec,
    exp: nowSec + 3600,
  }));
  const key = await importPrivateKey(serviceAccount.private_key);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`));
  const assertion = `${header}.${claims}.${base64url(signature)}`;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) throw new Error(`Google のトークン取得に失敗しました: ${res.status}`);
  return (await res.json()).access_token;
}

// 回答シートの全行(1行目は見出し)を返す
export async function fetchSheetRows(env) {
  if (!env.GOOGLE_SERVICE_ACCOUNT) throw new Error('GOOGLE_SERVICE_ACCOUNT が設定されていません');
  const serviceAccount = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT);
  const token = await getAccessToken(serviceAccount);
  const range = encodeURIComponent(env.SHEET_RANGE || "'Form Responses 1'!A1:ZZ");
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID}/values/${range}?valueRenderOption=FORMATTED_VALUE`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`シートの読み取りに失敗しました: ${res.status}`);
  return (await res.json()).values || [];
}
