import { bizFile, globalFile } from './biz-path';
import { mutateJson, readJson, writeJsonAtomic } from './json-store';
import { getRepos, storageDriver } from './repos';
import { prisma } from '../prisma';

export function isPrismaStorage(): boolean {
  return storageDriver() === 'prisma';
}

const keyOf = (name: string) => name.replace(/.json$/i, '');

export async function readBizConfig<T>(name: string, fallback: T): Promise<T> {
  if (isPrismaStorage()) return (await getRepos()).config.get(keyOf(name), fallback);
  return readJson<T>(bizFile(name), fallback);
}

export async function writeBizConfig<T>(name: string, value: T): Promise<void> {
  if (isPrismaStorage()) {
    await (await getRepos()).config.set(keyOf(name), value);
    return;
  }
  await writeJsonAtomic(bizFile(name), value);
}

export async function mutateBizConfig<T, R>(
  name: string,
  fallback: T,
  fn: (current: T) => [T, R],
): Promise<R> {
  if (isPrismaStorage()) {
    const repo = (await getRepos()).config;
    const current = await repo.get(keyOf(name), fallback);
    const [next, result] = fn(current);
    await repo.set(keyOf(name), next);
    return result;
  }
  return mutateJson<T, R>(bizFile(name), fallback, fn);
}

export async function readGlobalConfig<T>(name: string, fallback: T): Promise<T> {
  if (isPrismaStorage()) {
    const row = await prisma.platformConfig.findUnique({ where: { key: keyOf(name) } });
    return row ? (row.value as T) : fallback;
  }
  return readJson<T>(globalFile(name), fallback);
}

export async function writeGlobalConfig<T>(name: string, value: T): Promise<void> {
  if (isPrismaStorage()) {
    const key = keyOf(name);
    await prisma.platformConfig.upsert({
      where: { key },
      create: { key, value: value as object },
      update: { value: value as object },
    });
    return;
  }
  await writeJsonAtomic(globalFile(name), value);
}

export async function mutateGlobalConfig<T, R>(
  name: string,
  fallback: T,
  fn: (current: T) => [T, R],
): Promise<R> {
  if (isPrismaStorage()) {
    const current = await readGlobalConfig(name, fallback);
    const [next, result] = fn(current);
    await writeGlobalConfig(name, next);
    return result;
  }
  return mutateJson<T, R>(globalFile(name), fallback, fn);
}
