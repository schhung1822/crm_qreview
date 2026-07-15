// OAuth2 cho Gmail (gửi email hệ thống qua tài khoản Gmail). Server-only.
// Khác Drive: scope = https://mail.google.com/ (đủ để gửi qua SMTP XOAUTH2 của nodemailer).
// Luồng: superadmin nhập Client ID/Secret → /gmail-auth (consent, access_type=offline) → Google
// gọi lại /gmail-callback kèm code → đổi code lấy REFRESH TOKEN → lưu (mã hóa). Sau đó gửi mail
// dùng refresh token (nodemailer tự lấy access token).
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
// Scope gửi mail đầy đủ (tương thích SMTP XOAUTH2). Nếu chỉ cần gửi có thể dùng gmail.send,
// nhưng mail.google.com an toàn nhất với nodemailer.
const SCOPE = 'https://mail.google.com/';

export function buildGmailAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string,
  loginHint?: string,
): string {
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline', // để nhận refresh_token
    prompt: 'consent', // ép cấp lại refresh_token mỗi lần kết nối
    state,
  });
  if (loginHint) p.set('login_hint', loginHint);
  return `${AUTH_URL}?${p.toString()}`;
}

export interface GmailTokenResult {
  refreshToken?: string;
  accessToken: string;
}

// Đổi authorization code lấy token. Trả refresh_token (chỉ có khi access_type=offline + consent).
export async function exchangeGmailCode(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
): Promise<GmailTokenResult> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`Google token ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const j = (await res.json()) as { access_token?: string; refresh_token?: string };
  if (!j.access_token) throw new Error('Google không trả access_token.');
  return { refreshToken: j.refresh_token, accessToken: j.access_token };
}
