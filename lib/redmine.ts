import "server-only";

import { createHash } from "node:crypto";

const responses = new Map<string, { until: number; value: unknown }>();
const pending = new Map<string, Promise<unknown>>();

class RedmineError extends Error {
  constructor(message: string, public status: number, public resource: string) { super(message); }
}

export async function request<T>(path: string, accessKey?: string, options: { fresh?: boolean } = {}): Promise<T> {
  const url = process.env.REDMINE_URL;
  const key = accessKey?.trim();
  if (!key) throw new Error("กรุณากรอก API key ของบุคคลที่ต้องการดู");
  if (!url) throw new Error("กรุณาตั้งค่า REDMINE_URL ใน .env.local");
  const cacheKey = createHash("sha256").update(`${url}\0${key}\0${path}`).digest("hex");
  const cacheable = !path.startsWith("users/current.json");
  const cached = responses.get(cacheKey);
  if (cacheable && !options.fresh && cached && cached.until > Date.now()) return cached.value as T;
  const existing = pending.get(cacheKey);
  if (existing) return existing as Promise<T>;
  const operation = fetchResource<T>(url, key, path).then(value => {
    if (cacheable) {
      if (responses.size >= 256) responses.delete(responses.keys().next().value!);
      responses.set(cacheKey, { until: Date.now() + 30_000, value });
    }
    return value;
  });
  pending.set(cacheKey, operation);
  try { return await operation; }
  finally { if (pending.get(cacheKey) === operation) pending.delete(cacheKey); }
}

async function fetchResource<T>(url: string, key: string, path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${url.replace(/\/$/, "")}/${path}`, {
      headers: { Accept: "application/json", "X-Redmine-API-Key": key },
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error("ติดต่อ Redmine ไม่สำเร็จ กรุณาตรวจสอบเครือข่ายและ URL");
  }
  if (!response.ok) throw new RedmineError(`Redmine ตอบกลับ HTTP ${response.status} กรุณาตรวจสอบ API key สิทธิ์เข้าถึง และการเปิด REST API`, response.status, path);
  if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("Redmine ไม่ได้ส่งข้อมูล JSON กรุณาตรวจสอบ URL และการเปิด REST API");
  return response.json() as Promise<T>;
}


