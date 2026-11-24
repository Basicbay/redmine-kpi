"use client";

import { useState } from "react";
import ApiConnection from "./api-connection";
import RedmineLoading from "./redmine-loading";
import { PERIOD_START, PERIOD_END, validDate } from "@/lib/assessment";
import AssessmentPanel from "./assessment-panel";
import { filterTasksByStatus, type TaskStatus } from "@/lib/task-filters";
import { useRedmineWorkspace } from "./use-redmine-workspace";

export default function Dashboard({ today }: { today: string }) {
  const state = useRedmineWorkspace(today);
  const {
    workspace,
    directory,
    people,
    userId,
    start,
    end,
    error,
    setError,
    pending,
    revision,
  } = state;
  const [projectId, setProjectId] = useState<number | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const [taskPage, setTaskPage] = useState(0);
  const [taskStatus, setTaskStatus] = useState<TaskStatus | null>(null);
  const maxAllowedEnd = today > PERIOD_END ? PERIOD_END : today;
  const [draftStart, setDraftStart] = useState(PERIOD_START);
  const [draftEnd, setDraftEnd] = useState(maxAllowedEnd);

  function choosePerson(
    id: number,
    nextEnd = end,
    nextStart = start,
    fresh = false,
  ) {
    setProjectId(null);
    setTaskPage(0);
    if (id !== userId) setTaskStatus(null);
    setDraftStart(nextStart);
    setDraftEnd(nextEnd);
    state.selectPerson(id, nextEnd, nextStart, fresh);
  }
  function selectStatus(status: TaskStatus) {
    const next = taskStatus === status ? null : status;
    setTaskStatus(next);
    setTaskPage(0);
    if (
      projectId !== null &&
      !filterTasksByStatus(tasks, next, end).some(
        (task) => task.projectId === projectId,
      )
    )
      setProjectId(null);
  }

  const unlocked = !!workspace && workspace.userId === userId;
  const person = unlocked ? workspace?.person : undefined;
  const selectedName =
    people.find((user) => user.id === userId)?.name || "ผู้ใช้";
  const tasks =
    person?.tasks.filter(
      (task) => task.created >= start && task.created <= end,
    ) || [];
  const statusTasks = filterTasksByStatus(tasks, taskStatus, end);
  const projects = new Map<
    number,
    { id: number; name: string; count: number }
  >();
  for (const task of statusTasks) {
    const project = projects.get(task.projectId) || {
      id: task.projectId,
      name: task.project,
      count: 0,
    };
    project.count++;
    projects.set(task.projectId, project);
  }
  const filteredProjects = [...projects.values()]
    .filter((project) =>
      project.name
        .toLocaleLowerCase()
        .includes(projectSearch.toLocaleLowerCase()),
    )
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "th"));
  const matchesProjectSearch = (name: string) =>
    name.toLocaleLowerCase().includes(projectSearch.toLocaleLowerCase());
  const searchedTasks = statusTasks.filter((task) =>
    matchesProjectSearch(task.project),
  );
  const projectTasks = tasks.filter(
    (task) =>
      matchesProjectSearch(task.project) &&
      (projectId === null || task.projectId === projectId),
  );
  const filteredTasks = searchedTasks.filter(
    (task) => projectId === null || task.projectId === projectId,
  );
  const shownTasks = filteredTasks.slice(taskPage * 25, (taskPage + 1) * 25);
  const selectedProject =
    projectId === null ? "ทุกโครงการ" : projects.get(projectId)?.name;

  return (
    <>
      <section
        id="workbench"
        className="workbench"
        aria-label="Redmine workspace"
      >
        <ApiConnection
          account={state.activeAccount}
          pending={pending}
          revision={revision}
          onConnect={(key) => state.connect(key, 0)}
          onDisconnect={state.signOut}
        />
        <form
          className="period-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (
              !validDate(draftStart) ||
              !validDate(draftEnd) ||
              draftStart < PERIOD_START ||
              draftStart > draftEnd ||
              draftEnd > today ||
              draftEnd > PERIOD_END
            ) {
              setError(
                "กรุณาระบุช่วงวันที่ในรอบประเมินให้ถูกต้อง และไม่เกินวันนี้",
              );
              return;
            }
            choosePerson(userId, draftEnd, draftStart);
          }}
        >
          <div>
            <label htmlFor="period-start">ตั้งแต่วันที่</label>
            <input
              id="period-start"
              type="date"
              min={PERIOD_START}
              max={draftEnd}
              value={draftStart}
              disabled={pending || !unlocked}
              onChange={(e) => setDraftStart(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="period-end">ถึงวันที่ (default วันนี้)</label>
            <input
              id="period-end"
              type="date"
              min={draftStart}
              max={today < PERIOD_END ? today : PERIOD_END}
              value={draftEnd}
              disabled={pending || !unlocked}
              onChange={(e) => setDraftEnd(e.target.value)}
              required
            />
          </div>
          <button className="primary-button" disabled={pending || !unlocked}>
            กรองวันที่
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={pending || !unlocked}
            onClick={() => choosePerson(userId, end, start, true)}
          >
            อัปเดตข้อมูล
          </button>
          <div className="top-status-filter" role="group" aria-label="สถานะงาน">
            {(
              [
                ["todo", "To do"],
                ["doing", "Doing"],
                ["closed", "Close"],
                ["done", "Done"],
                ["late", "ส่งช้า"],
                ["unfinished", "ยังไม่เสร็จ"],
                ["overdue", "งานเลยกำหนดยังไม่เสร็จ"],
                ["stale", "งานค้างไม่อัปเดตเกิน 7 วัน"],
                ["missing", "ขาดวันที่เสร็จ"],
              ] as [TaskStatus, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`primary-button status-filter-button status-filter-${value}`}
                disabled={pending || !unlocked}
                aria-pressed={taskStatus === value}
                title={
                  value === "late"
                    ? "เสร็จหลัง Due date หรืองานค้างเลยกำหนด · คลิกซ้ำเพื่อแสดงทั้งหมด"
                    : value === "overdue"
                    ? "งานที่ยังไม่เสร็จและเลย Due date แล้ว · คลิกซ้ำเพื่อแสดงทั้งหมด"
                    : value === "stale"
                    ? "งานที่ยังไม่เสร็จและไม่อัปเดตเกิน 7 วัน · คลิกซ้ำเพื่อแสดงทั้งหมด"
                    : "คลิกซ้ำเพื่อแสดงทุกสถานะ"
                }
                onClick={() => selectStatus(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </form>
        <p className="date-filter-description">
          Task ตามวันที่สร้าง · Time Sheet ตามวันที่ลงเวลา · เริ่มนับ 11 ส.ค.
          2569
          {unlocked && workspace && <>
            {" · อัปเดต "}
            <time dateTime={workspace.person.loadedAt}>{new Date(workspace.person.loadedAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}</time>
            {state.fromCache ? " · จากแคช 30 วินาที" : ""}
          </>}
        </p>
        {pending && (
          <RedmineLoading />
        )}
        {error && (
          <p role="alert" className="error-banner">
            {error}
          </p>
        )}
        {!unlocked && !pending && (
          <p className="locked-notice">
            {state.activeAccount
              ? `เลือกรายชื่อเพื่อดูข้อมูลตามสิทธิ์บัญชี ${state.activeAccount.name}`
              : "กรอก API key เพื่อเริ่มดูข้อมูล"}
          </p>
        )}
        <div className="three-columns" aria-busy={pending}>
          <section
            className="directory-column"
            aria-labelledby="people-heading"
          >
            <div className="column-heading">
              <h2 id="people-heading">รายชื่อ</h2>
              <span>{people.length}</span>
            </div>
            {!!directory?.unavailable && (
              <p className="notice">
                บางโครงการอ่านรายชื่อไม่ได้ จึงแสดงรายชื่อเท่าที่เข้าถึงได้
              </p>
            )}
            <label className="search-label">
              <span className="sr-only">ค้นหารายชื่อ</span>
              <input
                type="search"
                placeholder="ค้นหารายชื่อ"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
              />
            </label>
            <ul className="selection-list people-list">
              {people
                .filter((user) =>
                  user.name
                    .toLocaleLowerCase()
                    .includes(userSearch.toLocaleLowerCase()),
                )
                .map((user) => (
                  <li
                    key={user.id}
                    className="person-row"
                    data-user-id={user.id}
                  >
                    <button
                      type="button"
                      className="person-select"
                      disabled={pending}
                      aria-pressed={userId === user.id}
                      onClick={() => choosePerson(user.id)}
                    >
                      <span className="person-avatar" aria-hidden="true">
                        {user.name.slice(0, 1)}
                      </span>
                      <span>
                        {user.name}
                        {state.permissions[user.id] === "denied" && (
                          <small className="account-flag account-invalid">
                            ไม่มีสิทธิ์เข้าถึง
                          </small>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
            </ul>
            {!!people.length &&
              !people.some((user) =>
                user.name
                  .toLocaleLowerCase()
                  .includes(userSearch.toLocaleLowerCase()),
              ) && <p className="empty-state">ไม่พบรายชื่อตามคำค้น</p>}
          </section>
          <section
            className="projects-column"
            aria-labelledby="projects-heading"
          >
            <div className="column-heading">
              <h2 id="projects-heading">โครงการ</h2>
              <span>{filteredProjects.length}</span>
            </div>
            <p className="help column-description">
              จำนวนงานที่มอบหมายให้ {selectedName}
            </p>
            <label className="search-label">
              <span className="sr-only">ค้นหาโครงการ</span>
              <input
                type="search"
                placeholder="ค้นหาโครงการ"
                value={projectSearch}
                onChange={(e) => {
                  setProjectSearch(e.target.value);
                  setProjectId(null);
                  setTaskPage(0);
                }}
              />
            </label>
            <ul className="selection-list project-list">
              <li>
                <button
                  disabled={pending || !workspace}
                  aria-pressed={projectId === null}
                  onClick={() => {
                    setProjectId(null);
                    setTaskPage(0);
                  }}
                >
                  <span>ทุกโครงการ</span>
                  <span className="count">{searchedTasks.length}</span>
                </button>
              </li>
              {filteredProjects.map((project) => (
                <li key={project.id}>
                  <button
                    disabled={pending}
                    aria-pressed={projectId === project.id}
                    onClick={() => {
                      setProjectId(project.id);
                      setTaskPage(0);
                    }}
                  >
                    <span>{project.name}</span>
                    <span className="count">{project.count}</span>
                  </button>
                </li>
              ))}
            </ul>
            {!filteredProjects.length && (
              <p className="empty-state">ไม่พบโครงการที่มีงานตรงกับตัวกรอง</p>
            )}
          </section>
          <section className="tasks-column" aria-labelledby="tasks-heading">
            <div className="column-heading">
              <h2 id="tasks-heading">งานที่มอบหมาย</h2>
              <span>{filteredTasks.length}</span>
            </div>
            <p className="help column-description">
              {selectedName} / {selectedProject} · แสดง {filteredTasks.length}{" "}
              จาก {projectTasks.length} งาน
            </p>
            {workspace && (
              <div className={`access-scope access-${workspace.access.mode}`}>
                <strong>
                  {workspace.access.mode === "own"
                    ? "เชื่อมต่อด้วย key ส่วนตัว"
                    : "ดูข้อมูลตามสิทธิ์"}
                </strong>
                <span>
                  {workspace.access.mode === "own"
                    ? `ใช้ key ส่วนตัวของ ${workspace.access.owner.name}`
                    : `ใช้สิทธิ์ของ ${workspace.access.owner.name} เห็นเฉพาะงานและ Time Sheet ที่บัญชีนี้เข้าถึงได้`}
                </span>
              </div>
            )}
            <ul className="task-list">
              {shownTasks.map((task) => (
                <li key={task.id}>
                  <div className="task-title">
                    <a
                      href={`https://fastwork.zicure.com/issues/${task.id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      #{task.id} {task.subject}
                    </a>
                    <span className={task.done ? "status done" : "status"}>
                      {task.status}
                    </span>
                  </div>
                  <p className="task-project">{task.project}</p>
                  <p className="task-metadata">
                    {task.tracker || "ไม่ระบุประเภท"} · ความสำคัญ:{" "}
                    {task.priority || "ไม่ระบุ"} · ความคืบหน้า:{" "}
                    {task.progress == null
                      ? "ไม่มีข้อมูล"
                      : `${task.progress}%`}
                  </p>
                  <dl className="task-facts">
                    <div>
                      <dt>วันที่สร้าง</dt>
                      <dd>{task.created}</dd>
                    </div>
                    <div>
                      <dt>กำหนดส่ง</dt>
                      <dd
                        className={
                          !task.done &&
                          task.due &&
                          task.due < (workspace?.end || today)
                            ? "late"
                            : ""
                        }
                      >
                        {task.due || "ยังไม่ระบุ"}
                      </dd>
                    </div>
                    <div>
                      <dt>ประมาณ / ใช้จริงในช่วงวันที่</dt>
                      <dd>
                        {task.estimate ?? "—"} /{" "}
                        {task.hours === null
                          ? "—"
                          : task.hours.toLocaleString("th-TH", {
                              maximumFractionDigits: 2,
                            })}{" "}
                        ชม.
                      </dd>
                    </div>
                    <div>
                      <dt>วันที่เสร็จที่ใช้ประเมิน</dt>
                      <dd>
                        {task.done
                          ? task.completed || "รอข้อมูล"
                          : "ยังไม่เสร็จ"}
                      </dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
            {!shownTasks.length && (
              <p className="empty-state">
                ไม่พบงานที่มอบหมายในโครงการหรือคำค้นนี้
              </p>
            )}
            <nav className="pagination" aria-label="หน้ารายการงาน">
              <button
                disabled={pending || taskPage === 0}
                onClick={() => setTaskPage((page) => page - 1)}
              >
                ก่อนหน้า
              </button>
              <span>
                {filteredTasks.length ? taskPage * 25 + 1 : 0}–
                {Math.min((taskPage + 1) * 25, filteredTasks.length)} /{" "}
                {filteredTasks.length}
              </span>
              <button
                disabled={
                  pending || (taskPage + 1) * 25 >= filteredTasks.length
                }
                onClick={() => setTaskPage((page) => page + 1)}
              >
                ถัดไป
              </button>
            </nav>
          </section>
        </div>
      </section>
      {workspace && person && (
        <AssessmentPanel
          key={`${userId}-${start}-${workspace.end}-${revision}`}
          tasks={person.tasks}
          entries={person.entries}
          name={selectedName}
          start={start}
          end={workspace.end}
          today={today}
          timeError={person.timeError}
          team={person.team}
          accessNote={
            workspace.access.mode === "own"
              ? `ข้อมูลจาก key ส่วนตัวของ ${workspace.access.owner.name}`
              : `ข้อมูลตามสิทธิ์ของ ${workspace.access.owner.name} งานและเวลาบางส่วนอาจไม่ปรากฏตามสิทธิ์ของบัญชีนี้`
          }
        />
      )}
    </>
  );
}
