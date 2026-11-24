"use client";

import { useEffect, useRef, useState } from "react";
import { assessmentTips, projectAssessmentScore, type AssessmentResult } from "@/lib/assessment-tips";
import type { Task } from "@/lib/assessment";

export default function ScoreTipsDialog({ result, tasks, name, start, end }: { result: AssessmentResult; tasks: Task[]; name: string; start: string; end: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const bodyOverflow = useRef<string | null>(null);
  const [selection, setSelection] = useState<string[] | null>(null);
  const tips = assessmentTips(result, tasks, start, end);
  const eligible = tips.filter(tip => tip.gain !== null).map(tip => tip.id);
  const selected = selection ?? eligible;
  const projected = projectAssessmentScore(result, tips, selected);
  const pendingCount = tips.filter(tip => tip.provisional).length;
  const format = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  useEffect(() => () => { if (bodyOverflow.current !== null) document.body.style.overflow = bodyOverflow.current; }, []);
  const restore = () => {
    if (dialog.current?.open) return;
    if (bodyOverflow.current !== null) { document.body.style.overflow = bodyOverflow.current; bodyOverflow.current = null; }
    opener.current?.focus();
  };
  const close = () => { dialog.current?.close(); restore(); };
  return <>
    <button ref={opener} className="score-tips-trigger" type="button" aria-label="แนะนำวิธีเพิ่มคะแนน" aria-haspopup="dialog" title="เคล็ดลับเพิ่มคะแนน" onClick={() => {
      if (!dialog.current || dialog.current.open) return;
      bodyOverflow.current = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      dialog.current.showModal();
    }}><svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6M10 21h4M8 14a6 6 0 1 1 8 0c-1 .8-1 1.5-1 2H9c0-.5 0-1.2-1-2Z" /><path d="M12 2V1M3 8H1M23 8h-2M4 3l1.5 1.5M20 3l-1.5 1.5" /></svg></button>
    <dialog
      ref={dialog}
      className="score-tips-dialog"
      aria-labelledby="score-tips-heading"
      aria-describedby="score-tips-person"
      onClose={restore}
      onCancel={event => { event.preventDefault(); close(); }}
      onClick={event => {
        if (dialog.current && event.target === dialog.current) {
          const rect = dialog.current.getBoundingClientRect();
          const inDialog =
            rect.top <= event.clientY &&
            event.clientY <= rect.top + rect.height &&
            rect.left <= event.clientX &&
            event.clientX <= rect.left + rect.width;
          if (!inDialog) close();
        }
      }}
    >
      <header className="score-tips-header">
        <div>
          <p className="score-tips-eyebrow">คำแนะนำเพิ่มคะแนนสูงสุดก่อนสิ้นปี · ปี 2569</p>
          <h2 id="score-tips-heading">ทำอะไรแล้ว คะแนนจะเพิ่มเท่าไร? (ประมาณการก่อนสิ้นปี)</h2>
          <p id="score-tips-person">
            {name}<span>รอบปัจจุบัน {start} ถึง {end} · สิ้นสุดรอบ 31 ธ.ค. 2569</span>
          </p>
        </div>
        <button className="score-tips-close" type="button" aria-label="ปิดคำแนะนำ" onClick={close}>
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </header>
      <div className="score-tips-content">
        <section className="score-projection" aria-label="จำลองคะแนนหลังปรับปรุง"><div className="projection-current"><span>คะแนนปัจจุบัน</span><strong>{format(result.normalized)}<small>/100</small></strong></div><div className="projection-after"><span>ถ้าถึงเป้าหมายข้อที่เลือก</span><strong data-projected-score>{format(projected.total)}<small>/100</small></strong></div><div className="projection-gain"><span>เพิ่มได้ตามสมมติฐาน</span><strong data-projected-gain>+{format(projected.gain)}</strong><small>จาก {projected.count} ข้อที่เลือก</small></div></section>
        <div className="projection-track" aria-hidden="true"><span style={{ width: `${Math.min(100, Math.max(0, result.normalized))}%` }} /><span style={{ width: `${Math.min(100 - result.normalized, projected.gain)}%` }} /></div>
        <p className="projection-assumption">จำลองให้ข้อที่เลือกทำได้ถึงเป้าหมายเต็ม โดยข้อมูลจริงต้องเข้าเกณฑ์ของรอบประเมิน คะแนนยังไม่เปลี่ยนจนกว่าจะอัปเดตข้อมูลจาก Redmine{pendingCount ? ` · ยังไม่รวม ${pendingCount} ข้อที่ข้อมูลไม่พอ` : ""}</p>
        <div className="tips-section-heading"><div><h3>เริ่มจากข้อที่ช่วยเพิ่มคะแนนได้มาก</h3><p>ตรวจสอบข้อมูลที่ขาดก่อน แล้วเลือกข้อที่ต้องการจำลอง</p></div>{eligible.length > 0 && <button type="button" className="secondary-button" onClick={() => setSelection(selected.length ? [] : eligible)}>{selected.length ? "ยกเลิกทั้งหมด" : "เลือกทุกข้อ"}</button>}</div>
        {tips.length ? <ol className="score-tips-list">{tips.map(tip => {
          const checked = selected.includes(tip.id) && tip.gain !== null;
          return <li key={tip.id} className={`score-tip ${checked ? "score-tip-selected" : ""} ${tip.provisional ? "score-tip-pending" : ""}`} data-tip-id={tip.id}>
            <div className="score-tip-heading"><div><span className="score-tip-index">ข้อ {tip.id}</span><h3>{tip.title}</h3></div><span className={`tip-gain-badge ${tip.provisional ? "tip-gain-unknown" : ""}`}>{tip.gain === null ? "รอตรวจสอบข้อมูล" : `+${format(tip.gain)} คะแนน`}</span></div>
            <div className="tip-score-comparison"><span>ตอนนี้ <strong>{format(tip.score)}</strong>/{tip.max}</span><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 12h16m-6-6 6 6-6 6" /></svg><span>{tip.provisional ? "ยังยืนยันคะแนนเพิ่มไม่ได้" : <>ถ้าถึงเป้าหมาย <strong>{format(tip.max)}</strong>/{tip.max}</>}</span></div>
            <p className="score-tip-current">ผลปัจจุบัน: {tip.actual}</p><p className="tip-target">เป้าหมาย: {tip.target}</p>
            <p className="tip-action">{tip.action}</p>
            {tip.tasks.length > 0 && <div className="score-tip-tasks">{tip.tasks.map(task => <a key={task.id} href={`https://fastwork.zicure.com/issues/${task.id}`} title={task.subject} target="_blank" rel="noreferrer">#{task.id} {task.subject}<span aria-hidden="true"> ↗</span></a>)}</div>}
            {tip.gain !== null && <label className="tip-select"><input type="checkbox" checked={checked} onChange={() => setSelection(checked ? selected.filter(id => id !== tip.id) : [...selected, tip.id])} /><span>จำลองว่าทำได้ถึงเป้าหมายข้อ {tip.id}</span></label>}
          </li>;
        })}</ol> : <div className="score-tip tips-complete"><h3>คะแนนครบทุกข้อที่ประเมินได้แล้ว</h3><p>รักษาการส่งงานตรงเวลา วางแผนงานให้ครบ และลง Time Sheet จริงอย่างสม่ำเสมอ</p></div>}
        {result.estimatedCount < 10 && <p className="score-tips-footnote">มีงานที่ระบุประมาณเวลา {result.estimatedCount} งาน ซึ่งน้อยกว่า 10 งาน น้ำหนัก 15 คะแนนของข้อ 1.4 จึงย้ายไปข้อ 1.1 ตามเกณฑ์</p>}
        <footer className="tips-footer"><p>ประมาณการจากข้อมูลที่บัญชีนี้เข้าถึงได้ เมื่อข้อมูลงานหรือฐานประเมินเปลี่ยน คะแนนอาจเปลี่ยนตาม ผลสุดท้ายพิจารณาร่วมกับผู้บังคับบัญชา</p><button className="secondary-button" type="button" onClick={close}>ปิดคำแนะนำ</button></footer>
      </div>
    </dialog>
  </>;
}
