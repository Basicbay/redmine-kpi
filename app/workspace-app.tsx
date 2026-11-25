"use client";

import { useState, useEffect } from "react";
import TeamTable from "./team/team-table";
import Dashboard from "./dashboard";
import { useRedmineWorkspace } from "./use-redmine-workspace";

export default function WorkspaceApp({
  today,
  initialTab = "team",
}: {
  today: string;
  initialTab?: "team" | "person";
}) {
  const workspaceState = useRedmineWorkspace(today);
  const [activeTab, setActiveTab] = useState<"team" | "person">(initialTab);

  // Sync tab with browser URL history without causing full page reload
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      if (path === "/person") {
        setActiveTab("person");
        const userParam = Number(new URLSearchParams(window.location.search).get("user"));
        if (Number.isSafeInteger(userParam) && userParam > 0) {
          workspaceState.selectPerson(userParam);
        }
      } else {
        setActiveTab("team");
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [workspaceState]);

  const switchTab = (tab: "team" | "person", userId?: number) => {
    setActiveTab(tab);
    if (tab === "person") {
      const targetId = userId ?? workspaceState.userId;
      const url = targetId ? `/person?user=${targetId}` : `/person`;
      window.history.pushState(null, "", url);
      if (userId && userId !== workspaceState.userId) {
        workspaceState.selectPerson(userId);
      }
    } else {
      window.history.pushState(null, "", "/");
    }
  };

  return (
    <main className="workspace">
      <header className="page-heading">
        <div>
          <p className="site-name">ระบบประเมินผลงาน</p>
          <h1>ผลงานประจำปี 2569</h1>
          <nav className="page-tabs" aria-label="เมนูหลัก">
            <button
              type="button"
              className={`page-tab ${activeTab === "team" ? "page-tab-active" : ""}`}
              onClick={() => switchTab("team")}
              aria-current={activeTab === "team" ? "page" : undefined}
            >
              ผลประเมินทุกคน
            </button>
            <button
              type="button"
              className={`page-tab ${activeTab === "person" ? "page-tab-active" : ""}`}
              onClick={() => switchTab("person")}
              aria-current={activeTab === "person" ? "page" : undefined}
            >
              ดูรายบุคคล
            </button>
          </nav>
        </div>
      </header>

      {/* Keep both alive or switch smoothly while sharing identical workspaceState in memory */}
      <div style={{ display: activeTab === "team" ? "block" : "none" }}>
        <TeamTable
          today={today}
          sharedWorkspace={workspaceState}
          onSelectPerson={(id) => switchTab("person", id)}
        />
      </div>

      <div style={{ display: activeTab === "person" ? "block" : "none" }}>
        <Dashboard
          today={today}
          sharedWorkspace={workspaceState}
        />
      </div>
    </main>
  );
}
