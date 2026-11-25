export default function RedmineLoading({
  detail,
  percent,
}: {
  detail?: string;
  percent?: number;
}) {
  return (
    <div
      className="loading-panel loading-banner"
      role="status"
      aria-live="polite"
    >
      <span className="loading-spinner" aria-hidden="true" />
      <div className="loading-text-group">
        <span>
          กำลังโหลดข้อมูลจาก Redmine…
          {percent !== undefined ? ` (${Math.round(percent)}%)` : ""}
          {detail ? ` ${detail}` : ""}
        </span>
        {percent !== undefined && (
          <div
            className="loading-progress-track"
            role="progressbar"
            aria-valuenow={Math.round(percent)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="loading-progress-bar"
              style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
