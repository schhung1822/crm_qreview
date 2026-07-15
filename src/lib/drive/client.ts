// Google Drive API client (OAuth2 + upload). Server-only.
// Scope drive.file = chỉ động tới file DO APP tạo (ít quyền nhất).
// Credential (clientId/clientSecret) truyền vào từ store (người dùng nhập) hoặc env.

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
// drive.file = chỉ file DO APP tạo; spreadsheets = đọc/ghi nội dung Google Sheet (đăng bài vào Sheet).
// LƯU Ý: người đã kết nối trước khi thêm scope này phải KẾT NỐI LẠI Drive để cấp quyền Sheets.
const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets',
];

export const DRIVE_FOLDER_NAME = 'SEO-AEO-GEO-by-noti';

// Host đích đều là hằng của Google (không user-controlled) nên không cần chắn SSRF như safeFetch,
// nhưng VẪN cần timeout để một kết nối Google treo không làm nghẽn request vô hạn.
const DRIVE_TIMEOUT_MS = 20_000;
function gfetch(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(DRIVE_TIMEOUT_MS) });
}

export interface DriveCreds {
  clientId?: string;
  clientSecret?: string;
}

export function buildAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline', // để nhận refresh_token
    prompt: 'consent', // ép cấp lại refresh_token mỗi lần kết nối
    include_granted_scopes: 'true',
    state,
  });
  return `${AUTH_URL}?${p.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
}

export async function exchangeCode(
  creds: DriveCreds,
  code: string,
  redirectUri: string,
): Promise<TokenResponse> {
  const res = await gfetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: creds.clientId ?? '',
      client_secret: creds.clientSecret ?? '',
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) throw new Error(`Google token ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as TokenResponse;
}

export async function refreshAccessToken(creds: DriveCreds, refreshToken: string): Promise<string> {
  const res = await gfetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: creds.clientId ?? '',
      client_secret: creds.clientSecret ?? '',
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`Google refresh ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const token = ((await res.json()) as { access_token?: string }).access_token;
  // Google có thể trả 200 kèm body lỗi (scope/consent) → access_token thiếu; chặn để không
  // truyền Bearer rỗng xuống các call sau.
  if (typeof token !== 'string' || !token) throw new Error('Google refresh: thiếu access_token.');
  return token;
}

export async function fetchEmail(accessToken: string): Promise<string | undefined> {
  try {
    const r = await gfetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) return undefined;
    return ((await r.json()) as { email?: string }).email;
  } catch {
    return undefined;
  }
}

// Đảm bảo có folder chứa bài (tái dùng nếu còn tồn tại, tạo mới nếu chưa/đã bị xóa).
export async function ensureFolder(
  accessToken: string,
  name: string,
  existingId?: string,
): Promise<string> {
  if (existingId) {
    const r = await gfetch(
      `https://www.googleapis.com/drive/v3/files/${existingId}?fields=id,name,trashed`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (r.ok) {
      const d = (await r.json()) as { name?: string; trashed?: boolean };
      // Tái dùng chỉ khi folder còn sống VÀ đúng tên hiện tại (đổi tên hằng → tạo folder mới).
      if (!d.trashed && d.name === name) return existingId;
    }
  }
  const res = await gfetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder' }),
  });
  if (!res.ok) throw new Error(`Drive folder ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return ((await res.json()) as { id: string }).id;
}

// Upload multipart (metadata + nội dung) → trả id + link xem.
export async function uploadFile(
  accessToken: string,
  opts: { name: string; mimeType: string; content: string; folderId?: string },
): Promise<{ id: string; webViewLink?: string }> {
  const boundary = `seogeo${Date.now()}`;
  const metadata = { name: opts.name, ...(opts.folderId ? { parents: [opts.folderId] } : {}) };
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${opts.mimeType}\r\n\r\n` +
    `${opts.content}\r\n` +
    `--${boundary}--`;
  const res = await gfetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'content-type': `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  if (!res.ok) throw new Error(`Drive upload ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as { id: string; webViewLink?: string };
}
