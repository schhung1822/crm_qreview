// Kho lưu API key AI - mã hóa AES-GCM, lưu file .data/ai-secrets.json (gitignored).
// Chạy được không cần DB. Khi có DB, có thể thay read()/write() bằng Prisma.
// QUAN TRỌNG: chỉ dùng ở server. KHÔNG bao giờ trả plaintext key ra client.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { decryptWith, encryptWith } from '../crypto';
import { bizFile } from '../data/biz-path';
import { env } from '../env';
import { resolveEncryptionKey } from './key';

export const AI_PROVIDERS = [
  'anthropic',
  'openai',
  'gemini',
  'deepseek',
  'moonshot',
  'qwen',
  'minimax',
] as const;
export type AiProviderId = (typeof AI_PROVIDERS)[number];

export const AI_TASKS = ['writing', 'analysis'] as const;
export type AiTask = (typeof AI_TASKS)[number];

export interface ProviderMeta {
  id: AiProviderId;
  label: string;
  envVar: string;
  models: { writer: string; fast: string };
  keyHint: string;
}

export const PROVIDER_META: Record<AiProviderId, ProviderMeta> = {
  anthropic: {
    id: 'anthropic',
    label: 'Claude (Anthropic)',
    envVar: 'ANTHROPIC_API_KEY',
    models: { writer: 'claude-opus-4-8', fast: 'claude-haiku-4-5-20251001' },
    keyHint: 'sk-ant-...',
  },
  openai: {
    id: 'openai',
    label: 'ChatGPT (OpenAI)',
    envVar: 'OPENAI_API_KEY',
    models: { writer: 'gpt-4o', fast: 'gpt-4o-mini' },
    keyHint: 'sk-...',
  },
  gemini: {
    id: 'gemini',
    label: 'Gemini (Google)',
    envVar: 'GEMINI_API_KEY',
    // Mặc định đời 2.x (1.5 đã bị gỡ khỏi v1beta). Người dùng vẫn chọn lại trong danh sách.
    models: { writer: 'gemini-2.5-pro', fast: 'gemini-2.5-flash' },
    keyHint: 'AIza...',
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    envVar: 'DEEPSEEK_API_KEY',
    models: { writer: 'deepseek-chat', fast: 'deepseek-chat' },
    keyHint: 'sk-...',
  },
  moonshot: {
    id: 'moonshot',
    label: 'Kimi (Moonshot AI)',
    envVar: 'MOONSHOT_API_KEY',
    models: { writer: 'kimi-k2-0711-preview', fast: 'moonshot-v1-8k' },
    keyHint: 'sk-...',
  },
  qwen: {
    id: 'qwen',
    label: 'Qwen (Alibaba)',
    envVar: 'DASHSCOPE_API_KEY',
    models: { writer: 'qwen-plus', fast: 'qwen-turbo' },
    keyHint: 'sk-...',
  },
  minimax: {
    id: 'minimax',
    label: 'MiniMax',
    envVar: 'MINIMAX_API_KEY',
    models: { writer: 'MiniMax-Text-01', fast: 'MiniMax-Text-01' },
    keyHint: 'eyJ...',
  },
};

interface ProviderEntry {
  encrypted?: string;
  enabled: boolean;
  model?: string;
  updatedAt?: string;
}

interface SecretsData {
  providers: Partial<Record<AiProviderId, ProviderEntry>>;
  routing: Record<AiTask, AiProviderId>;
}

const NAME = 'ai-secrets.json'; // CÔ LẬP THEO BIZ

function emptyData(): SecretsData {
  return { providers: {}, routing: { writing: 'anthropic', analysis: 'anthropic' } };
}

async function read(): Promise<SecretsData> {
  try {
    const raw = await fs.readFile(bizFile(NAME), 'utf8');
    const parsed = JSON.parse(raw) as SecretsData;
    return { ...emptyData(), ...parsed, routing: { ...emptyData().routing, ...parsed.routing } };
  } catch {
    return emptyData();
  }
}

async function write(data: SecretsData): Promise<void> {
  const file = bizFile(NAME);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), { mode: 0o600 });
}

// Key từ env (fallback) khi store chưa có.
function envKey(provider: AiProviderId): string | undefined {
  switch (provider) {
    case 'anthropic':
      return env.anthropicKey;
    case 'openai':
      return env.openaiKey;
    case 'gemini':
      return env.geminiKey;
    case 'deepseek':
      return env.deepseekKey;
    case 'moonshot':
      return env.moonshotKey;
    case 'qwen':
      return env.qwenKey;
    case 'minimax':
      return env.minimaxKey;
  }
}

function mask(key: string): string {
  if (key.length <= 8) return '••••';
  return `••••••${key.slice(-4)}`;
}

// ─── API public (server-only) ───

export interface ProviderStatus {
  id: AiProviderId;
  label: string;
  keyHint: string;
  hasKey: boolean;
  source: 'store' | 'env' | 'none';
  masked?: string;
  enabled: boolean;
  model: string;
  defaultModel: string;
}

export async function getProvidersStatus(): Promise<{
  providers: ProviderStatus[];
  routing: Record<AiTask, AiProviderId>;
}> {
  const data = await read();
  const providers = AI_PROVIDERS.map((id) => {
    const meta = PROVIDER_META[id];
    const entry = data.providers[id];
    const storeKey = entry?.encrypted
      ? safeDecrypt(entry.encrypted)
      : undefined;
    const fallback = envKey(id);
    const effective = storeKey ?? fallback;
    return {
      id,
      label: meta.label,
      keyHint: meta.keyHint,
      hasKey: Boolean(effective),
      source: storeKey ? 'store' : fallback ? 'env' : 'none',
      masked: effective ? mask(effective) : undefined,
      enabled: entry?.enabled ?? Boolean(effective),
      model: entry?.model ?? meta.models.writer,
      defaultModel: meta.models.writer,
    } satisfies ProviderStatus;
  });
  return { providers, routing: data.routing };
}

export async function setProviderKey(provider: AiProviderId, key: string): Promise<void> {
  const data = await read();
  const encrypted = encryptWith(resolveEncryptionKey(), key.trim());
  data.providers[provider] = {
    ...(data.providers[provider] ?? { enabled: true }),
    encrypted,
    enabled: true,
    updatedAt: new Date().toISOString(),
  };
  await write(data);
}

export async function deleteProviderKey(provider: AiProviderId): Promise<void> {
  const data = await read();
  if (data.providers[provider]) {
    delete data.providers[provider]!.encrypted;
    data.providers[provider]!.enabled = false;
  }
  await write(data);
}

export async function setProviderEnabled(
  provider: AiProviderId,
  enabled: boolean,
): Promise<void> {
  const data = await read();
  data.providers[provider] = { ...(data.providers[provider] ?? {}), enabled };
  await write(data);
}

export async function setProviderModel(provider: AiProviderId, model: string): Promise<void> {
  const data = await read();
  data.providers[provider] = { ...(data.providers[provider] ?? { enabled: true }), model };
  await write(data);
}

export async function setRouting(task: AiTask, provider: AiProviderId): Promise<void> {
  const data = await read();
  data.routing[task] = provider;
  await write(data);
}

// Lấy key ĐỂ HIỂN THỊ LẠI cho người quản lý (icon con mắt). CHỈ trả key do CHÍNH biz nhập
// (source='store'); KHÔNG bao giờ trả key nền tảng cấu hình qua ENV — nếu chủ nền tảng đặt key
// dùng chung qua ENV, tenant có quyền aikeys:manage KHÔNG được đọc lộ khóa chung đó.
export async function getRevealableKey(provider: AiProviderId): Promise<string | undefined> {
  const data = await read();
  const entry = data.providers[provider];
  if (entry?.encrypted) return safeDecrypt(entry.encrypted);
  return undefined;
}

// Lấy key thật để gọi API (server-only). Tôn trọng enabled.
export async function getActiveKey(provider: AiProviderId): Promise<string | undefined> {
  const data = await read();
  const entry = data.providers[provider];
  if (entry && entry.enabled === false) return undefined;
  if (entry?.encrypted) {
    const k = safeDecrypt(entry.encrypted);
    if (k) return k;
  }
  return envKey(provider);
}

export async function getRouting(): Promise<Record<AiTask, AiProviderId>> {
  return (await read()).routing;
}

export async function getProviderModel(
  provider: AiProviderId,
  tier: 'writer' | 'fast' = 'writer',
): Promise<string> {
  const data = await read();
  return data.providers[provider]?.model ?? PROVIDER_META[provider].models[tier];
}

function safeDecrypt(payload: string): string | undefined {
  try {
    return decryptWith(resolveEncryptionKey(), payload);
  } catch {
    return undefined;
  }
}
