import { Suspense } from "react";
import { connection } from "next/server";
import { bangkokDate } from "@/lib/assessment";
import TeamTable from "./team/team-table";
import Link from "next/link";

async function Content() {
  await connection();
  return <TeamTable today={bangkokDate()} />;
}

export default function Home() {
  return <main className="workspace">
    <header className="page-heading">
      <div>
        <p className="site-name">ระบบประเมินผลงาน</p>
        <h1>ผลงานประจำปี 2569</h1>
        <nav className="page-tabs" aria-label="เมนูหลัก">
          <Link className="page-tab page-tab-active" href="/" aria-current="page">ผลประเมินทุกคน</Link>
          <Link className="page-tab" href="/person">ดูรายบุคคล</Link>
        </nav>
      </div>
    </header>
    <Suspense fallback={<div className="loading-panel" role="status">กำลังเปิดหน้าประเมิน…</div>}><Content /></Suspense>
  </main>;
}
