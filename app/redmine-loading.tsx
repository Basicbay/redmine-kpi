export default function RedmineLoading({ detail }: { detail?: string }) {
  return <p className="loading-panel loading-banner" role="status" aria-live="polite">
    <span className="loading-spinner" aria-hidden="true" />
    <span>กำลังโหลดข้อมูลจาก Redmine…{detail ? ` ${detail}` : ""}</span>
  </p>;
}
