# Redmine personal assessment (2569 / 2026)

## Run

1. `npm install`
2. Copy `.env.example` to `.env.local` and configure `REDMINE_URL`.
3. `npm run dev`, then open http://localhost:3000.
4. Enter the API key of the person whose assessment you want to view.

At least one validated API key is required. `localStorage` under `redmine.accounts` remembers each connected person's key independently, plus the last active account. The old `redmine.accessKey` format migrates automatically after successful authentication. A person with a remembered key is loaded with that key automatically; a person without one can be viewed through the active account's Redmine permissions. Badges distinguish remembered, invalid, and permission-limited access. A per-person forget button removes one key; signing out explicitly forgets all keys. Temporary network errors preserve credentials. Keys are sent through server actions and are not placed in URLs, cookies, or server files.

API requests never fall back to `REDMINE_API_KEY` from the environment. Registering a personal key verifies its owner against the selected person. Reading a different person is permitted only as allowed by Redmine and returns explicit `own` or `limited` access metadata. The report states which account's permissions supplied its data. Authentication failures flag the saved key as invalid; resource permission errors do not invalidate otherwise valid credentials. Failed personal-key authentication can fall back to another remembered valid account with the limited-access label.

## Interface

A black, full-width body contains three columns: people, projects, and tasks plus the entire assessment report. The navigation columns stay alongside the report while scrolling on desktop. Layout and report typography respond to the actual task-column width, including compact screens. Status/date filters affect both the project list/counts and assigned tasks. Projects with no matching tasks are hidden; selecting a status that removes the currently selected project returns to all matching projects. Assessment uses all projects in the applied period for the selected person. Its structure follows the PDF, with performance 60 points and discipline 40 points. Criteria 2.1 and 2.2 use the selected person's visible actual timesheets, Monday–Friday without subtracting company holidays or leave. The total base is 100.

The date filter starts at 2026-08-11 and is inclusive. Tasks are filtered by creation date in Asia/Bangkok; timesheets use their spent date. The filter applies to project counts, task lists, task hours, and assessment. Accounts and people preserve the applied date range.

The people and project columns are wider on desktop. Seven buttons beside the date filter select To do, Doing, Close, Done, late, unfinished, or missing completion. Late includes both late completions and unfinished overdue tasks; it does not infer a completion date for Done/Closed tasks missing one. Click the selected button again to show all statuses. The selection filters the task list and resets pagination. Changing dates preserves the selection. Advanced task filters and task search have been removed.

The three score summaries use large cyan (total), green (performance), and orange (discipline) numbers with contrasting backgrounds. Values remain calculated personal scores rather than fixed 100/60/40 placeholders.

## Loading performance

- Issue queries filter creation dates on the server, padding the range by one day at each end for timezone safety; exact Bangkok boundaries are still applied locally.
- Each collection fetches its first page, then loads remaining pages four at a time, retaining order and detecting incomplete, duplicate, or changing totals.
- Successful GET results have a bounded, credential-and-URL-scoped 30-second server cache. Concurrent identical requests share one in-flight fetch. Authentication is never cached, and failed requests are never cached.
- Repeated people/date views use a bounded 30-second browser memory cache, also scoped by key and person. Task data are not persisted to localStorage.
- The update button bypasses both caches. Changing a status/project filter is local and makes no API requests.
- Directory/project/team membership reads reuse identical cached requests. Time-entry collections are reused across people viewed with the same key and date range.

Below the four large on-time/late/pending/hours statistics, six operational summaries show overdue pending tasks with longest delay and issue links, planning completeness, actual timesheet weekday coverage, missing timesheet dates, days with at least seven hours, and pending work not updated for more than seven days. All values use the selected person's own period and are not copied from another employee's example. Dates are compared to the applied cutoff; exactly seven days is not counted as stale. Time-entry failures show unavailable values rather than falsely counting every day as missing. These observed timesheet statistics drive the actual scores in 2.1 and 2.2.

## Calculation

The criteria originate in `docs/เกณฑ์ประเมินผลงานประจำปี-2569.pdf`.

- All API pages are read before scoring. Duplicate or incomplete pagination fails. Time-entry failures preserve browsing but leave dependent scores pending.
- Done and Closed names, ignoring leading stars, count as finished; other closed statuses such as Rejected do not.
- Completion uses the latest visible task timesheet date in the selected range across all authors, then `closed_on` when no timesheets exist in that range. Task hours also use only this range. Tasks without either date can be viewed with the missing-completion filter button.
- On-time denominator: filtered tasks due in the selected period. The raw percentage is separate from the weighted score: 93/148 displays 63%, and 45 late plus 10 pending account for the remainder. Scoring uses the unrounded ratio. Overdue counts filtered pending tasks due before cutoff.
- Accuracy compares completed tasks' actual hours against positive estimates, inclusive ±30%. Fewer than ten estimated tasks in the round transfers 15 points from 1.4 to 1.1, preserving the total weight of the included criteria.
- Workload uses completed tasks per calendar day converted at 30.4375 days/month. Planning checks due date and positive estimate on tasks created in the period.
- For 1.3, the team consists of individual members of the projects containing the employee's tasks in the applied period, including the employee and members with zero completed tasks. Memberships and project issues are fetched with the supplied key; duplicate members/issues and group memberships are excluded. The median of each member's confirmed completed tasks/month is calculated using the same scope and month unit as the personal assessment. A zero median satisfies the PDF's “at least team median” target without division by zero. Unknown completion dates are excluded consistently and their count is disclosed. Only aggregate team statistics leave the server; permission failures leave the benchmark unavailable with a reason. This does not reconstruct historical project membership or adjust for roles.
- Criteria 2.1 and 2.2 use the selected user's real timesheets. 2.1 counts weekdays with any time entry against weekdays in the applied range (95% target, 15 points). 2.2 sums that user's entries across tasks per weekday and counts days with at least 7 hours (90% target, 10 points). No attendance points are automatically granted. Company holidays and leave are not subtracted. Other time-based criteria remain in use.
- All eight criteria show numeric scores. Where the included criteria still lack evidence or have zero denominators, the display uses a clearly labelled provisional zero with a reason, rather than inventing measured performance. The report labels the result preliminary whenever such zeros remain. The zero team median is explicitly handled by the comparative target. Historical cutoffs continue to suppress an overall level because current issue assignments/statuses are not reconstructed historically.
- Current assignee, due date, estimate, and status are used. Visibility permissions can hide data even when requests succeed. Final review belongs to the supervisor.

The screenshot reference of 63% is a calculation fixture, not hardcoded personal data. Matching a live person's screenshot requires that person's valid key and the same data scope. The PDF does not explicitly define estimated-task sample scope, the planning denominator, or partial-month arithmetic; implementation choices above are documented for review.

The original PDF remains available at `/api/assessment-criteria`. The report uses locally hosted Sarabun Regular, Bold, and ExtraBold, matching the PDF's font family and weight hierarchy. Its large left-aligned heading, three large score summaries, orange discipline accent, and four-column criteria tables follow the source document in the requested black theme. The font license is included under `public/fonts/sarabun/OFL.txt`; builds do not fetch Google Fonts.

## Validation

- `npm test` — access enforcement, no key fallback, score examples, boundaries, weight transfer, date filtering, missing data, pagination, and task/user time separation.
- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
#   r e d m i n e - k p i  
 