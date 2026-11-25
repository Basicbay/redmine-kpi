import { Suspense } from "react";
import { connection } from "next/server";
import { bangkokDate } from "@/lib/assessment";
import WorkspaceApp from "../workspace-app";

async function Content() {
  await connection();
  return <WorkspaceApp today={bangkokDate()} initialTab="person" />;
}

export default function PersonPage() {
  return (
    <Suspense
      fallback={
        <main className="workspace">
          <div className="loading-panel" role="status">
            กำลังเปิดหน้าประเมิน…
          </div>
        </main>
      }
    >
      <Content />
    </Suspense>
  );
}
