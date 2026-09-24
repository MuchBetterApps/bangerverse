import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const localStore = process.env.NODE_ENV !== "production" || process.env.MAILG_SESSION_STORE === "file";
const localDir = join(process.cwd(), "work", "session-store");

function keyBytes(): Buffer {
  const raw = process.env.SESSION_ENCRYPTION_KEY;
  if (!raw) throw new Error("SESSION_ENCRYPTION_KEY must contain 32 random bytes encoded as base64");
  const bytes = Buffer.from(raw, "base64");
  if (bytes.length !== 32) throw new Error("SESSION_ENCRYPTION_KEY must decode to 32 bytes");
  return bytes;
}

function seal(value: unknown): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(), nonce);
  const payload = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), payload]).toString("base64url");
}

function open<T>(encoded: string): T {
  const value = Buffer.from(encoded, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", keyBytes(), value.subarray(0, 12));
  decipher.setAuthTag(value.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString("utf8")) as T;
}

async function redis(command: Array<string | number>): Promise<unknown> {
  if (!redisUrl || !redisToken) throw new Error("UPSTASH_REDIS_REST_URL and TOKEN are required in production");
  const response = await fetch(redisUrl, {
    method: "POST", headers: { Authorization: `Bearer ${redisToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(command), cache: "no-store",
  });
  if (!response.ok) throw new Error(`Session store unavailable (${response.status})`);
  const data = await response.json() as { result?: unknown; error?: string };
  if (data.error) throw new Error("Session store command failed");
  return data.result;
}

function localPath(key: string): string {
  if (!/^[a-z]+:[A-Za-z0-9_-]+$/.test(key)) throw new Error("Invalid store key");
  return join(localDir, key.replace(":", "-"));
}

export async function storeGet<T>(key: string): Promise<T | null> {
  if (redisUrl && redisToken) {
    const value = await redis(["GET", `mailg:${key}`]);
    return typeof value === "string" ? open<T>(value) : null;
  }
  if (!localStore) throw new Error("A durable Redis session store is required in production");
  try {
    const record = JSON.parse(await readFile(localPath(key), "utf8")) as { value: string; expires: number };
    if (record.expires < Date.now()) { await rm(localPath(key), { force: true }); return null; }
    return open<T>(record.value);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function storeSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const encrypted = seal(value);
  if (redisUrl && redisToken) { await redis(["SET", `mailg:${key}`, encrypted, "EX", ttlSeconds]); return; }
  if (!localStore) throw new Error("A durable Redis session store is required in production");
  await mkdir(localDir, { recursive: true, mode: 0o700 });
  const path = localPath(key);
  const temporary = `${path}.${randomBytes(6).toString("hex")}`;
  await writeFile(temporary, JSON.stringify({ value: encrypted, expires: Date.now() + ttlSeconds * 1000 }), { mode: 0o600 });
  await rename(temporary, path);
}

export async function storeDelete(key: string): Promise<void> {
  if (redisUrl && redisToken) { await redis(["DEL", `mailg:${key}`]); return; }
  if (!localStore) throw new Error("A durable Redis session store is required in production");
  await rm(localPath(key), { force: true });
}

export async function storeLock(key: string, value: string, ttlSeconds: number): Promise<boolean> {
  if (redisUrl && redisToken) return (await redis(["SET", `mailg:${key}`, value, "EX", ttlSeconds, "NX"])) === "OK";
  if (!localStore) throw new Error("A durable Redis session store is required in production");
  await mkdir(localDir, { recursive: true, mode: 0o700 });
  try { await writeFile(localPath(key), JSON.stringify({ value, expires: Date.now() + ttlSeconds * 1000 }), { flag: "wx", mode: 0o600 }); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    try {
      const existing = JSON.parse(await readFile(localPath(key), "utf8")) as { expires: number };
      if (existing.expires < Date.now()) await rm(localPath(key), { force: true });
    } catch { /* another process changed the lock */ }
    return false;
  }
}

export async function storeUnlock(key: string, value: string): Promise<void> {
  if (redisUrl && redisToken) {
    await redis(["EVAL", "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", 1, `mailg:${key}`, value]);
    return;
  }
  if (!localStore) return;
  try {
    const existing = JSON.parse(await readFile(localPath(key), "utf8")) as { value: string };
    if (existing.value === value) await rm(localPath(key), { force: true });
  } catch { /* lock expired */ }
}
