import { globalFile } from '../data/biz-path';
import { readJson, writeJsonAtomic } from '../data/json-store';

export interface GeneratedImageBlob {
  name: string;
  contentType: string;
  dataBase64: string;
  createdAt: string;
}

function fileFor(name: string): string {
  return globalFile(`generated/${name}.json`);
}

export async function saveGeneratedImageBlob(
  name: string,
  contentType: string,
  dataBase64: string,
): Promise<void> {
  await writeJsonAtomic(fileFor(name), {
    name,
    contentType,
    dataBase64,
    createdAt: new Date().toISOString(),
  } satisfies GeneratedImageBlob);
}

export async function getGeneratedImageBlob(name: string): Promise<GeneratedImageBlob | null> {
  return readJson<GeneratedImageBlob | null>(fileFor(name), null);
}
