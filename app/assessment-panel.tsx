"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { assess, PERIOD_END, type Task, type WorkEntry } from "@/lib/assessment";
import type { TeamBenchmark } from "@/lib/redmine-data";
import ScoreTipsDialog from "./score-tips-dialog";

function ScrollableTable({ children }: { children: ReactNode }) {
  const topScroll = useRef<HTMLDivElement>(null);
  const topContent = useRef<HTMLDivElement>(null);
  const tableScroll = useRef<HTMLDivElement>(null);
  const tableElement = useRef<HTMLTableElement>(null);

  useEffect(() => {
    const top = topScroll.current;
    const body = tableScroll.current;
    const table = tableElement.current;
    const content = topContent.current;
    if (!top || !body || !table || !content) return;

    let syncing = false;
    const syncFromTop = () => {
      if (syncing) return;
      syncing = true;
      body.scrollLeft = top.scrollLeft;
      syncing = false;
    };
    const syncFromBody = () => {
      if (syncing) return;
      syncing = true;
      top.scrollLeft = body.scrollLeft;
      syncing = false;
    };

    const updateWidth = () => {
      content.style.width = `${table.scrollWidth}px`;
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(table);

    top.addEventListener("scroll", syncFromTop, { passive: true });
    body.addEventListener("scroll", syncFromBody, { passive: true });

    return () => {
      observer.disconnect();
      top.removeEventListener("scroll", syncFromTop);
      body.removeEventListener("scroll", syncFromBody);
    };
  }, []);

  return (
    <div className="criteria-table-container">
      <div
        className="criteria-table-top-scroll"
        ref={topScroll}
        role="region"
        aria-label="เลื่อนตารางแนวนอนด้านบน"
        tabIndex={0}
      >
        <div ref={topContent} aria-hidden="true" />
      </div>
      <div className="table-scroll" ref={tableScroll}>
        <table ref={tableElement} className="criteria-table">
          {children}
        </table>
      </div>
    </div>
  );
}

export default function AssessmentPanel({
  tasks,
  entries,
  name,
  start,
  end,
  today,
  timeError,
  team,
  accessNote,
}: {
  tasks: Task[];
  entries: WorkEntry[] | null;
  name: string;
  start: string;
  end: string;
  today: string;
  timeError: string | null;
  team: TeamBenchmark;
  accessNote?: string;
}) {
  const result = assess(tasks, entries, {
    start,
    end,
    excludedDates: [],
    calendarConfirmed: true,
    teamMedian: team.median,
    fillMissingScores: true,
  });
  const historical = end < today;
  const format = (score: number) =>
    score.toLocaleString("th-TH", { maximumFractionDigits: 2 });
  const categoryTotal = (category: "ผลงาน" | "วินัย") => {
    const metrics = result.metrics.filter(
      (metric) => metric.category === category && metric.score !== null,
    );
    return {
      score: metrics.reduce((sum, metric) => sum + metric.score!, 0),
      weight: metrics.reduce((sum, metric) => sum + metric.max, 0),
      max: result.metrics
        .filter((metric) => metric.category === category)
        .reduce((sum, metric) => sum + metric.max, 0),
    };
  };
  const performance = categoryTotal("ผลงาน");
  const discipline = categoryTotal("วินัย");
  const meanings: Record<string, string> = {
    "1.1":
      "งานที่ครบกำหนดในรอบประเมินและทำเสร็จภายใน Due date ÷ งานที่ครบกำหนดทั้งหมด",
    "1.2":
      "จำนวนงานที่ยังไม่ Done หรือ Closed และเลย Due date แล้ว ณ วันตัดรอบ",
    "1.3": "จำนวนงานที่ปิดได้เฉลี่ยต่อเดือน เทียบกับค่ากลางของทีม",
    "1.4": "สัดส่วนงานที่ชั่วโมงทำจริงคลาดจาก Estimated time ไม่เกิน ±30%",
    "2.1": "จำนวนวันที่มีบันทึกเวลา ÷ จำนวนวันทำงาน",
    "2.2": "จำนวนวันที่ลงเวลารวมตั้งแต่ 7 ชั่วโมงขึ้นไป ÷ จำนวนวันทำงาน",
    "2.3":
      "งานที่สร้างในรอบประเมินซึ่งกรอกทั้ง Due date และ Estimated time ÷ งานทั้งหมดที่รับผิดชอบ",
    "2.4":
      "รายการ timesheet ที่ผูกกับเลขงาน (Task) และมีคำอธิบายว่าทำอะไร ÷ รายการทั้งหมด",
  };
  const levels = [
    {
      level: 5,
      title: "ดีเด่น",
      range: "90–100",
      meaning: "ผลงานและวินัยเกินมาตรฐานอย่างสม่ำเสมอ เป็นแบบอย่างให้ทีมได้",
    },
    {
      level: 4,
      title: "ดี",
      range: "80–ต่ำกว่า 90",
      meaning: "ผลงานดี มีจุดที่ปรับเพิ่มได้เล็กน้อย",
    },
    {
      level: 3,
      title: "ตามมาตรฐาน",
      range: "70–ต่ำกว่า 80",
      meaning: "ทำได้ตามที่คาดหวัง แต่มีบางตัวชี้วัดที่ควรพัฒนา",
    },
    {
      level: 2,
      title: "ต้องปรับปรุง",
      range: "60–ต่ำกว่า 70",
      meaning: "มีหลายตัวชี้วัดต่ำกว่าเป้า ต้องทำแผนพัฒนาร่วมกับหัวหน้า",
    },
    {
      level: 1,
      title: "ไม่ผ่าน",
      range: "ต่ำกว่า 60",
      meaning: "ต่ำกว่ามาตรฐานอย่างชัดเจน ต้องปรับปรุงเร่งด่วน",
    },
  ];
  return (
    <section className="assessment report" aria-labelledby="assessment-heading">
      <header className="report-heading">
        <div className="report-title-row"><h2 id="assessment-heading">เกณฑ์การประเมินผลงานประจำปี 2569</h2><ScoreTipsDialog result={result} tasks={tasks} name={name} start={start} end={end} /></div>
        <p className="report-person">ผลการประเมินของ {name}</p>
        <p className="help">
          รอบประเมิน {start} ถึง {end} · สิ้นสุดรอบประเมินประจำปี {PERIOD_END}
        </p>
        {accessNote && <p className="report-access-note">{accessNote}</p>}
      </header>
      <div className="report-totals">
        <div>
          <strong>
            {format(result.normalized)}
            {/* <span> / 100</span> */}
          </strong>
          <p>คะแนนรวม</p>
          <small>รวมคะแนนประเมินทุกข้อจากฐาน {result.possible} คะแนน</small>
        </div>
        <div>
          <strong>
            {format(performance.score)}
            {/* <span> / 60</span> */}
          </strong>
          <p>หมวดที่ 1 ผลงาน (Performance)</p>
          <small>คิดคะแนน {performance.weight} / 60 คะแนน</small>
        </div>
        <div>
          <strong>
            {format(discipline.score)}
            {/* <span> / {discipline.max}</span> */}
          </strong>
          <p>หมวดที่ 2 วินัย</p>
          <small>
            คิดคะแนน {discipline.weight} / {discipline.max} คะแนน
          </small>
        </div>
      </div>
      <div className="report-statistics">
        <div>
          <span>ส่งงานตรงเวลา</span>
          <strong>
            {result.onTime.percent === null ? "—" : `${result.onTime.percent}%`}
          </strong>
          <small>
            ({result.onTime.count}/{result.onTime.total})
          </small>
        </div>
        <div>
          <span>ส่งช้า</span>
          <strong>{result.onTime.late}</strong>
          <small>งาน</small>
        </div>
        <div>
          <span>ยังไม่เสร็จ</span>
          <strong>{result.onTime.pending}</strong>
          <small>งาน</small>
        </div>
        <div>
          <span>ลงเวลา</span>
          <strong>{entries === null ? "—" : format(result.hours)}</strong>
          <small>{entries === null ? "รอข้อมูล" : "ชม."}</small>
        </div>
      </div>
      <section
        className="report-insights"
        aria-label="สรุปรายละเอียดงานและ Time Sheet"
      >
        <div className="insight-card insight-overdue">
          <h3>งานเลยกำหนดยังไม่เสร็จ</h3>
          <strong>
            {result.insights.overdueTasks.length}
            <small> งาน</small>
          </strong>
          <p>นานสุด {result.insights.maxOverdueDays} วัน</p>
          <div className="insight-task-links">
            {result.insights.overdueTasks.slice(0, 3).map((task) => (
              <a
                key={task.id}
                href={`https://fastwork.zicure.com/issues/${task.id}`}
                title={`${task.subject} · เลยกำหนด ${task.days} วัน`}
                target="_blank"
                rel="noreferrer"
              >
                #{task.id} <span>({task.days} วัน)</span>
              </a>
            ))}
          </div>
        </div>
        <div className="insight-card insight-planning">
          <h3>งานใหม่ที่วางแผนครบ</h3>
          <strong>
            {result.insights.planning.percent === null
              ? "—"
              : `${result.insights.planning.percent}%`}
          </strong>
          <p>
            {result.insights.planning.complete}/{result.insights.planning.total}{" "}
            งานมีทั้งประมาณเวลาและ Due date
          </p>
          <small className="insight-meta">
            ยังกรอกไม่ครบ {result.insights.planning.missing} งาน
          </small>
        </div>
        <div className="insight-card insight-timesheet">
          <h3>วันที่ลง Time Sheet</h3>
          <strong>
            {result.insights.timesheet.loggedPercent === null
              ? "—"
              : `${result.insights.timesheet.loggedPercent}%`}
          </strong>
          <p>
            {result.insights.timesheet.loggedDays === null
              ? "อ่านข้อมูลเวลาไม่ได้"
              : `${result.insights.timesheet.loggedDays}/${result.insights.timesheet.workdays} วันทำงาน`}
          </p>
        </div>
        <div className="insight-card insight-missing-days">
          <h3>วันที่ไม่มี Time Sheet</h3>
          <strong>
            {result.insights.timesheet.missingDays ?? "—"}
            <small> วัน</small>
          </strong>
          <p>จาก {result.insights.timesheet.workdays} วันจันทร์–ศุกร์</p>
          {!!result.insights.timesheet.missingDates?.length && (
            <details>
              <summary>ดูวันที่ไม่มีบันทึก</summary>
              <ul className="missing-date-list">
                {result.insights.timesheet.missingDates.map((day) => (
                  <li key={day}>
                    <time dateTime={day}>{day}</time>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
        <div className="insight-card insight-full-days">
          <h3>ลงเวลาครบ 7 ชม. ขึ้นไป</h3>
          <strong>
            {result.insights.timesheet.fullDays ?? "—"}
            <small> วัน</small>
          </strong>
          <p>
            {result.insights.timesheet.fullPercent === null
              ? "อ่านข้อมูลเวลาไม่ได้หรือไม่มีวันทำงานในช่วง"
              : `${result.insights.timesheet.fullPercent}% ของวันทำงาน`}
          </p>
          <small className="insight-meta">
            {result.insights.timesheet.shortDays === null
              ? ""
              : `วันที่มีบันทึกแต่รวมไม่ถึง 7 ชม. ${result.insights.timesheet.shortDays} วัน`}
          </small>
        </div>
        <div className="insight-card insight-stale">
          <h3>งานค้างไม่อัปเดตเกิน 7 วัน</h3>
          <strong>
            {result.insights.staleTasks.length}
            <small> งาน</small>
          </strong>
          <p>
            {result.insights.staleTasks.length
              ? "ควรตรวจสอบ ปิดงาน หรืออัปเดตสถานะ"
              : "ไม่พบงานค้างที่ไม่อัปเดตเกิน 7 วัน"}
          </p>
          <div className="insight-task-links">
            {result.insights.staleTasks.slice(0, 3).map((task) => (
              <a
                key={task.id}
                href={`https://fastwork.zicure.com/issues/${task.id}`}
                title={`${task.subject} · ไม่อัปเดต ${task.days} วัน`}
                target="_blank"
                rel="noreferrer"
              >
                #{task.id} <span>({task.days} วัน)</span>
              </a>
            ))}
          </div>
        </div>
      </section>
      <section className="assessment-explanation" aria-labelledby="explanation-heading">
        <h3 id="explanation-heading">คำอธิบาย</h3>
      <p className="score-policy">
        ข้อ 2.1–2.2 คำนวณจาก Time Sheet จริงของ {name} ·
        วันทำงานคือจันทร์–ศุกร์ในช่วงที่เลือก ไม่หักวันลา · รวมฐาน 100 คะแนน
      </p>
      {result.provisionalCount > 0 && (
        <p className="provisional-score-note">
          มี {result.provisionalCount} ข้อที่ข้อมูลยังไม่พอ แสดง 0
          คะแนนชั่วคราวพร้อมเหตุผลในแต่ละข้อ ผลรวมนี้เป็นผลประเมินเบื้องต้น
        </p>
      )}
      <p className="insight-calendar-note">
        สถิติและคะแนนข้อ 2.1–2.2 ใช้ Time Sheet จริงของบุคคลที่กำลังดู
        คิดวันจันทร์–ศุกร์ในช่วงที่เลือก ไม่หักวันหยุดบริษัทและวันลา
      </p>
      <p className="team-benchmark">
        {team.median === null
          ? `ค่ากลางทีม: ${team.error || "อ่านข้อมูลไม่ได้"}`
          : `ค่ากลางทีมจาก Redmine: ${format(team.median)} งาน/เดือน · สมาชิก ${team.memberCount} คน ใน ${team.projectCount} โครงการเดียวกัน · ตามข้อมูลที่บัญชีนี้เข้าถึงได้`}
        {team.missingCompletion > 0 &&
          ` · ไม่นับ ${team.missingCompletion} งานทีมที่ขาดวันเสร็จ`}
      </p>
      {(timeError || historical) && (
        <div className="assessment-notes">
          {timeError && (
            <p role="alert" className="error">
              อ่าน Time Sheet ไม่สำเร็จ: {timeError}
            </p>
          )}
          {historical && (
            <p className="notice">
              ข้อมูลสถานะปัจจุบัน ณ วันตัดรอบย้อนหลัง ยังไม่สรุประดับผลประเมิน
            </p>
          )}
        </div>
      )}
      </section>
      {(["ผลงาน", "วินัย"] as const).map((category, index) => (
        <section
          className="report-category"
          key={category}
          aria-labelledby={`category-${index}`}
        >
          <h3 id={`category-${index}`}>
            หมวดที่ {index + 1}{" "}
            {category === "ผลงาน" ? "ผลงาน (Performance)" : "วินัย"}
            <span className="category-score"><strong>{format(category === "ผลงาน" ? performance.score : discipline.score)}</strong>/{category === "ผลงาน" ? performance.max : discipline.max} คะแนน</span>
          </h3>
          <ScrollableTable>
            <thead>
              <tr>
                <th scope="col">ตัวชี้วัด</th>
                <th scope="col">ความหมายและวิธีวัด</th>
                <th scope="col">เป้าหมาย (ได้คะแนนเต็ม)</th>
                <th scope="col">คะแนน</th>
              </tr>
            </thead>
            <tbody>
              {result.metrics
                .filter((metric) => metric.category === category)
                .map((metric) => (
                  <tr
                    key={metric.id}
                    className={
                      metric.excluded ? "excluded-metric" : undefined
                    }
                  >
                    <th scope="row">
                      <span>
                        {metric.id} {metric.title}
                        {metric.id === "1.1" && (
                          <span className="on-time-label">(On-time)</span>
                        )}
                      </span>
                    </th>
                    <td data-label="ผลการประเมิน">
                      <p>{meanings[metric.id]}</p>
                      <strong className="metric-result">
                        ผล: {metric.actual}
                      </strong>
                      <small>{metric.detail}</small>
                    </td>
                    <td data-label="เป้าหมาย">{metric.target}</td>
                    <td data-label="คะแนน" className="score-cell">
                      {metric.excluded ? (
                        <span className="excluded-badge">ไม่นำมาคำนวณ</span>
                      ) : metric.max === 0 ? (
                        <>
                          <span className="score-fraction"><strong>0</strong></span>
                          <span className="score-weight">
                            ย้ายน้ำหนักไปข้อ 1.1
                          </span>
                        </>
                      ) : metric.score === null ? (
                        <span className="waiting">
                          รอข้อมูล / {metric.max}
                        </span>
                      ) : (
                        <>
                          <span className="score-fraction"><strong>{format(metric.score)}</strong><span>/{metric.max}</span></span>
                          {(metric.assumed || metric.provisional) && <span className="score-weight">{metric.assumed ? "ตามสมมติฐาน" : "ชั่วคราว"}</span>}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </ScrollableTable>
        </section>
      ))}
      <section className="report-levels">
        <h3>ระดับผลการประเมิน</h3>
        <p className="report-outcome">
          {result.complete && !historical
            ? `ผล${result.provisionalCount ? "ประเมินเบื้องต้น" : "ของ"} ${name}: ${result.level}`
            : `ผลของ ${name}: ยังไม่สรุประดับ (รอข้อมูล)`}
        </p>
        <div className="table-scroll">
          <table className="levels-table">
            <thead>
              <tr>
                <th scope="col">ระดับ</th>
                <th scope="col">ผลการประเมิน</th>
                <th scope="col">คะแนนรวม</th>
                <th scope="col">ความหมาย</th>
              </tr>
            </thead>
            <tbody>
              {levels.map((level) => (
                <tr
                  key={level.level}
                  className={
                    result.complete &&
                    !historical &&
                    result.level === level.title
                      ? "active-level"
                      : undefined
                  }
                >
                  <td>{level.level}</td>
                  <th scope="row">{level.title}</th>
                  <td>{level.range}</td>
                  <td>{level.meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {!result.complete && (
        <p className="report-pending">
          รอข้อมูลอีก {result.possible - result.available} คะแนนจากฐาน{" "}
          {result.possible} · ข้อที่ข้อมูลไม่ครบยังไม่นำมาสรุประดับ
        </p>
      )}
    </section>
  );
}
