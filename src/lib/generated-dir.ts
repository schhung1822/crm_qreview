import os from 'node:os';
import path from 'node:path';

export function generatedImageDir(): string {
  const custom = process.env.GENERATED_IMAGE_DIR?.trim();
  if (custom) return path.resolve(custom);
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) return path.join(os.tmpdir(), 'generated');
  return path.join(process.cwd(), 'public', 'generated');
}

export function bundledGeneratedImageDir(): string {
  return path.join(process.cwd(), 'public', 'generated');
}
