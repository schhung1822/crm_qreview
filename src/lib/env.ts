// Truy cập biến môi trường có kiểm soát. Chỉ đọc từ process.env (server-side).
// Mọi tích hợp ngoài (Claude, DataForSEO, WP, Wix) đều "graceful degrade":
// thiếu key → dùng mock, app vẫn chạy được.

function get(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

export const env = {
  anthropicKey: get('ANTHROPIC_API_KEY'),
  openaiKey: get('OPENAI_API_KEY'),
  geminiKey: get('GEMINI_API_KEY'),
  deepseekKey: get('DEEPSEEK_API_KEY'),
  claudeWriter: get('CLAUDE_MODEL_WRITER') ?? 'claude-opus-4-8',
  claudeFast: get('CLAUDE_MODEL_FAST') ?? 'claude-haiku-4-5-20251001',

  dataForSeoLogin: get('DATAFORSEO_LOGIN'),
  dataForSeoPassword: get('DATAFORSEO_PASSWORD'),

  encryptionKey: get('ENCRYPTION_KEY'),
  databaseUrl: get('DATABASE_URL'),
};

export const hasClaude = () => Boolean(env.anthropicKey);
export const hasKeywordProvider = () =>
  Boolean(env.dataForSeoLogin && env.dataForSeoPassword);
export const hasDatabase = () => Boolean(env.databaseUrl);
