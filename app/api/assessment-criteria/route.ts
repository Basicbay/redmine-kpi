import { readFile } from "node:fs/promises";
import path from "node:path";

export async function GET() {
  const file = await readFile(path.join(process.cwd(), "docs", "เกณฑ์ประเมินผลงานประจำปี-2569.pdf"));
  return new Response(file, { headers: { "Content-Type": "application/pdf", "Cache-Control": "private, no-store" } });
}
