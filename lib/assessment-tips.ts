import type { assess, Task } from "./assessment";

export type AssessmentResult = ReturnType<typeof assess>;
export type AssessmentTip = { id: string; title: string; score: number; max: number; gap: number; gain: number | null; actual: string; target: string; action: string; provisional: boolean; tasks: { id: number; subject: string }[] };

export function assessmentTips(result: AssessmentResult, tasks: Task[], start: string, end: string): AssessmentTip[] {
  const periodTasks = tasks.filter(task => task.created >= start && task.created <= end);
  const unplanned = periodTasks.filter(task => !task.due || task.estimate === null || task.estimate <= 0);
  const time = result.insights.timesheet;
  const actions: Record<string, string> = {
    "1.1": `ส่งตรงเวลา ${result.onTime.count}/${result.onTime.total} งาน (เป้าหมาย ≥ 85%): ก่อนสิ้นปี 31 ธ.ค. 2569 ให้เร่งปิดงานที่มี Due date ในรอบให้ทันกำหนด แบ่งงานเป็นช่วงสั้น ๆ ตรวจสอบสถานะทุกวัน และลง timesheet ครั้งสุดท้ายในวันที่เสร็จจริงเพื่อยืนยันวันส่งงาน`,
    "1.2": `มีงานเลยกำหนดยังไม่เสร็จ ${result.insights.overdueTasks.length} งาน: แต่ละงานที่ค้างเลยกำหนดจะถูกหัก 1 คะแนนเต็ม ก่อนสิ้นปีควรเร่งเคลียร์ ปิดงาน หรือปรับสถานะให้เรียบร้อยเพื่อกู้คืนคะแนนส่วนที่ถูกหักไป`,
    "1.3": "ก่อนสิ้นปี ให้ตรวจสอบงานที่เสร็จจริงและกดเปลี่ยนสถานะเป็น Done/Closed ให้ครบถ้วน เพื่อเพิ่มจำนวนงานปิดเฉลี่ยต่อเดือนให้สูงกว่าหรือเท่ากับค่ากลางของทีม",
    "1.4": "สำหรับงานใหม่ก่อนสิ้นปี ให้กรอก Estimated time ก่อนเริ่มงาน และบริหารเวลาจริงให้คลาดเคลื่อนไม่เกิน ±30% (ต้องมีงานที่ประมาณเวลาอย่างน้อย 10 งานเพื่อรับคะแนนเต็ม 15 คะแนนในข้อนี้)",
    "2.1": `มี Time Sheet ${time.loggedDays ?? 0}/${time.workdays} วันทำงาน (เป้าหมาย ≥ 95%): ก่อนสิ้นปีนี้ ให้ลงเวลาทำงานจริงทุกวันจันทร์–ศุกร์ก่อนเลิกงาน และตรวจสอบวันที่ขาดบันทึกเพื่อบันทึกงานจริงให้ครบถ้วน`,
    "2.2": `ลงเวลาครบ 7 ชั่วโมงขึ้นไป ${time.fullDays ?? 0}/${time.workdays} วัน (เป้าหมาย ≥ 90%): ตรวจสอบว่ามีงานที่ทำจริงแต่ยังไม่ได้บันทึกเวลาหรือไม่ บันทึกให้ครบอย่างน้อย 7 ชม. ในทุกวันทำงานที่เหลือจนถึงสิ้นปี`,
    "2.3": `ยังมี ${unplanned.length} งานที่ขาด Due date หรือ Estimated time: ก่อนสิ้นปีให้ตรวจงานที่รับผิดชอบทั้งหมด และระบุทั้ง Due date และ Estimated time ให้ครบ 100%`,
    "2.4": "ลง Time Sheet ให้ผูกกับเลข Task และพิมพ์คำอธิบายรายละเอียดงานทุกครั้ง เพื่อรักษาความสมบูรณ์ของการบันทึกเวลาให้เกิน 95% จนถึงสิ้นปี",
  };
  return result.metrics.filter(metric => !metric.excluded && metric.max > 0 && (metric.score === null || metric.max - metric.score > 0.000001)).map(metric => ({
    id: metric.id, title: metric.title, score: metric.score ?? 0, max: metric.max, gap: metric.max - (metric.score ?? 0), gain: metric.provisional || metric.score === null || result.possible <= 0 ? null : (metric.max - metric.score) / result.possible * 100, actual: metric.actual, target: metric.target, provisional: !!metric.provisional || metric.score === null,
    action: metric.provisional || metric.score === null ? `ตรวจสอบข้อมูลและสิทธิ์ที่ยังไม่ครบก่อน: ${metric.detail} เมื่อยืนยันข้อมูลจริงได้แล้ว ให้กดอัปเดตข้อมูลเพื่อประเมินใหม่` : actions[metric.id],
    tasks: metric.id === "1.2" ? result.insights.overdueTasks.slice(0, 3) : metric.id === "2.3" ? unplanned.slice(0, 3) : [],
  })).sort((a, b) => Number(b.provisional) - Number(a.provisional) || b.gap - a.gap || a.id.localeCompare(b.id));
}

export function projectAssessmentScore(result: AssessmentResult, tips: AssessmentTip[], selectedIds: string[]) {
  const selected = new Set(selectedIds);
  const gain = tips.filter(tip => selected.has(tip.id) && tip.gain !== null).reduce((sum, tip) => sum + tip.gain!, 0);
  return { gain, total: Math.min(100, result.normalized + gain), count: tips.filter(tip => selected.has(tip.id) && tip.gain !== null).length };
}
