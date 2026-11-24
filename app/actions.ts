"use server";

import { bangkokDate, PERIOD_START, PERIOD_END, validDate } from "@/lib/assessment";
import { getDirectory, getPersonData } from "@/lib/redmine-data";
import { request } from "@/lib/redmine";

function validate(key: string, end: string, start: string) {
  if (typeof key !== "string" || !key.trim() || key.length > 256) throw new Error("กรุณากรอก API key ของบุคคลที่ต้องการดู");
  if (typeof start !== "string" || !validDate(start) || start < PERIOD_START || start > end || typeof end !== "string" || !validDate(end) || end > bangkokDate() || end > PERIOD_END) throw new Error("กรุณาระบุช่วงวันที่ในปี 2569 ตั้งแต่ 11 สิงหาคม ถึงวันนี้");
}

function invalidKey(error: unknown) {
  return error instanceof Error && "resource" in error && error.resource === "users/current.json"
    && "status" in error && (error.status === 401 || error.status === 403);
}

export async function loadWorkspace(key: string, end: string, start = PERIOD_START, expectedUserId?: number, fresh = false) {
  try {
    validate(key, end, start);
    const directory = await getDirectory(key, fresh);
    if (expectedUserId !== undefined && (!Number.isSafeInteger(expectedUserId) || directory.current.id !== expectedUserId)) throw new Error("API key ไม่ตรงกับบุคคลที่เลือก กรุณาใช้ key ของบุคคลนั้น");
    const person = await getPersonData(key, directory.current.id, end, start, fresh);
    return { data: { directory, person, start, end, access: { owner: directory.current, mode: "own" as const } } };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "เชื่อมต่อไม่สำเร็จ", invalidKey: invalidKey(error) };
  }
}

export async function loadPerson(key: string, userId: number, end: string, start = PERIOD_START, expectedOwnerId?: number, fresh = false) {
  try {
    validate(key, end, start);
    if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error("กรุณาเลือกผู้ใช้ที่ถูกต้อง");
    const account = await request<{ user: { id: number; firstname?: string; lastname?: string } }>("users/current.json", key);
    if (expectedOwnerId !== undefined && account.user.id !== expectedOwnerId) throw new Error("API key ไม่ตรงกับบัญชีที่จดจำไว้ กรุณาเชื่อมต่อใหม่");
    const owner = { id: account.user.id, name: `${account.user.firstname || ""} ${account.user.lastname || ""}`.trim() || `#${account.user.id}` };
    return { data: await getPersonData(key, userId, end, start, fresh), access: { owner, mode: account.user.id === userId ? "own" as const : "limited" as const } };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "โหลดข้อมูลผู้ใช้ไม่สำเร็จ", invalidKey: invalidKey(error) };
  }
}
