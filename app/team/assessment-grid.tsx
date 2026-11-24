"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { createColumnHelper, createSortedRowModel, rowSortingFeature, tableFeatures, useTable, type SortingState } from "@tanstack/react-table";
import type { AssessmentRow } from "./actions";

export type GridPerson = AssessmentRow & { name: string };
const features = tableFeatures({ rowSortingFeature, sortedRowModel: createSortedRowModel() });
const helper = createColumnHelper<typeof features, GridPerson>();
const ratingLevels = ["ไม่ผ่าน", "ปรับปรุง", "มาตรฐาน", "ดี", "ดีเด่น"];
const ratingRank: Record<string, number> = { "ไม่ผ่าน": 1, "ต้องปรับปรุง": 2, "ตามมาตรฐาน": 3, "ดี": 4, "ดีเด่น": 5 };
const format = (n: number | null | undefined, digits = 0) => n == null ? "—" : n.toLocaleString("th-TH", { minimumFractionDigits: digits, maximumFractionDigits: digits });
function Metric({ value, unit, detail, tone, digits = 0 }: { value?: number | null; unit?: string; detail?: string; tone?: string; digits?: number }) {
  return <div className={`grid-metric ${tone || ""}`}><strong>{format(value, digits)}{value != null && unit && <span>{unit}</span>}</strong>{value != null && detail && <small>{detail}</small>}</div>;
}

export default function AssessmentGrid({ data }: { data: GridPerson[] }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "total", desc: true }]);
  const topScroll = useRef<HTMLDivElement>(null);
  const topContent = useRef<HTMLDivElement>(null);
  const tableScroll = useRef<HTMLDivElement>(null);
  const tableElement = useRef<HTMLTableElement>(null);
  useEffect(() => {
    const top = topScroll.current, content = topContent.current, bottom = tableScroll.current, element = tableElement.current;
    if (!top || !content || !bottom || !element) return;
    const fromTop = () => { if (Math.abs(bottom.scrollLeft - top.scrollLeft) > 1) bottom.scrollLeft = top.scrollLeft; };
    const fromBottom = () => { if (Math.abs(top.scrollLeft - bottom.scrollLeft) > 1) top.scrollLeft = bottom.scrollLeft; };
    const resize = () => { content.style.width = `${bottom.scrollWidth}px`; fromBottom(); };
    const observer = new ResizeObserver(resize);
    observer.observe(bottom); observer.observe(element);
    top.addEventListener("scroll", fromTop, { passive: true });
    bottom.addEventListener("scroll", fromBottom, { passive: true });
    resize();
    return () => { observer.disconnect(); top.removeEventListener("scroll", fromTop); bottom.removeEventListener("scroll", fromBottom); };
  }, []);
  const columns = useMemo(() => {
    const stat = (id: keyof NonNullable<AssessmentRow["stats"]>, header: string, unit?: string, tone?: string, detail?: (r: GridPerson) => string) => helper.accessor(row => row.stats?.[id] ?? undefined, { id, header, sortUndefined: "last", cell: c => <Metric value={c.getValue()} unit={unit} tone={tone} detail={detail?.(c.row.original)} /> });
    return helper.columns([
      helper.accessor("name", { header: "รายชื่อ", sortDescFirst: false, sortFn: (a, b) => a.original.name.localeCompare(b.original.name, "th"), cell: c => <Link className="grid-person-name" href={`/person?user=${c.row.original.id}`}>{c.getValue()}</Link> }),
      helper.accessor(row => row.level ? ratingRank[row.level] : undefined, { id: "level", header: "ระดับผลประเมิน", sortUndefined: "last", cell: c => { const rank = c.getValue(); return rank === undefined ? "—" : <span className={`rating-level rating-level-${rank}`} title={c.row.original.preliminary ? "ระดับเบื้องต้นจากคะแนนที่มีข้อมูลในระบบ" : undefined}>{ratingLevels[rank - 1]}</span>; } }),
      helper.accessor("total", { header: () => <span className="grid-score-heading">คะแนนรวม<small>เต็ม 100</small></span>, sortUndefined: "last", cell: c => <Metric value={c.getValue()} tone="grid-score-total" digits={3} /> }),
      helper.accessor("performance", { header: () => <span className="grid-score-heading">ผลงาน<small>เต็ม 60</small></span>, sortUndefined: "last", cell: c => <Metric value={c.getValue()} tone="grid-score-performance" digits={3} /> }),
      helper.accessor("discipline", { header: () => <span className="grid-score-heading">วินัย<small>เต็ม 40</small></span>, sortUndefined: "last", cell: c => <Metric value={c.getValue()} tone="grid-score-discipline" digits={3} /> }),
      stat("workload", "ปริมาณงาน", "Task"),
      stat("onTime", "ส่งงานตรงเวลา", "%", "grid-positive", r => `${format(r.stats?.onTimeCount)}/${format(r.stats?.dueTasks)} งาน`),
      stat("late", "ส่งช้า", "งาน", "grid-negative"),
      stat("pending", "ยังไม่เสร็จ", "งาน", "grid-warning"),
      stat("hours", "ลงเวลา", "ชม."),
      stat("overdue", "งานเลยกำหนดยังไม่เสร็จ", "งาน", "grid-negative", r => `นานสุด ${format(r.stats?.maxOverdueDays)} วัน`),
      stat("loggedDays", "วันที่ลง Time Sheet", "วัน", undefined, r => `${format(r.stats?.loggedPercent)}% จาก ${format(r.stats?.workdays)} วันทำงาน`),
      stat("missingDays", "วันที่ไม่มี Time Sheet", "วัน", "grid-negative"),
      stat("fullDays", "ลงเวลาครบ 7 ชม. ขึ้นไป", "วัน", "grid-positive", r => `${format(r.stats?.fullPercent)}% ของวันทำงาน`),
      stat("stale", "งานค้างไม่อัปเดตเกิน 7 วัน", "งาน", "grid-warning"),

    ]);
  }, []);
  const table = useTable({ features, data, columns, getRowId: r => String(r.id), state: { sorting }, onSortingChange: setSorting, enableSortingRemoval: false });
  return <section className="assessment-grid" aria-label="ผลประเมินทีม">
    <div className="grid-heading"><div><h2>ผลการประเมินรายบุคคล</h2><p>คะแนนและสถิติจากงานจริง · {data.length} คน</p></div><span className="grid-hint">เลื่อนตารางเพื่อดูทุกตัวชี้วัด →</span></div>
    <div className="team-table-top-scroll" ref={topScroll} role="region" aria-label="เลื่อนตารางแนวนอนด้านบน" aria-controls="team-assessment-table-scroll" tabIndex={0}><div ref={topContent} aria-hidden="true" /></div>
    <div className="team-table-scroll" ref={tableScroll} id="team-assessment-table-scroll" role="region" aria-label="ตารางผลประเมินทุกคน" tabIndex={0}>
      <table ref={tableElement} className="team-table assessment-data-table"><caption>— หมายถึงยังไม่มีผลหรืออ่านข้อมูลไม่ได้ · ผลเบื้องต้นอาจมีบางข้อที่ข้อมูลไม่พอ · กดหัวคอลัมน์เพื่อเรียงลำดับ</caption><thead>{table.getHeaderGroups().map(group => <tr key={group.id}>{group.headers.map(header => { const sorted = header.column.getIsSorted(); return <th key={header.id} scope="col" data-column={header.column.id} aria-sort={sorted === "desc" ? "descending" : sorted === "asc" ? "ascending" : "none"}>{header.column.getCanSort() ? <button type="button" onClick={header.column.getToggleSortingHandler()}><table.FlexRender header={header} /><SortIcon direction={sorted} /></button> : <table.FlexRender header={header} />}</th>; })}</tr>)}</thead><tbody>{table.getRowModel().rows.map(row => <tr key={row.id} data-person-id={row.original.id}>{row.getAllCells().map(cell => { const content: ReactNode = <table.FlexRender cell={cell} />; return cell.column.id === "name" ? <th key={cell.id} scope="row" data-column={cell.column.id}>{content}</th> : <td key={cell.id} data-column={cell.column.id}>{content}</td>; })}</tr>)}{!data.length && <tr><td colSpan={15} className="empty-state">ไม่พบรายชื่อ หรือยังไม่ได้เชื่อมต่อบัญชี</td></tr>}</tbody></table>
    </div>

  </section>;
}

function SortIcon({ direction }: { direction: false | "asc" | "desc" }) {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d={direction === "desc" ? "M6 9l6 6 6-6" : direction === "asc" ? "M6 15l6-6 6 6" : "M8 9l4-4 4 4M8 15l4 4 4-4"} /></svg>;
}
