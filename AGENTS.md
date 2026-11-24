# Project instructions

## Required skill

- Always read and apply `.agents/skills/ui-ux-pro-max/SKILL.md` when working in this repository. Use its applicable guidance for the current task and preserve the user's latest instructions.
- For every UI change, check typography, spacing, accessibility, responsive behavior, loading states, empty states, and errors before finishing.

## UI conventions

- Keep the black/dark theme and the locally hosted Sarabun font.
- Use readable text: ordinary text, labels, metadata, and controls outside the team table must be at least 16px. The team table keeps names and column headings at 14px, score-limit subheadings at 12px, metric details/units at 14px, metric values at 22px, and total score values at 26px.
- Center both pages in a wider 100rem / 1600px container with padding around the content and responsive gutters.
- Keep the people, projects, and assigned tasks in the upper section of the individual page. The full-width assessment belongs in a separate lower section. Sections must never overlap.
- Use TanStack Table for the team assessment table. Preserve accessible sorting, name search, and clear units for every metric. Wide tables may scroll inside their own container; the page must not overflow horizontally.
- Provide synchronized native horizontal scrollbars above and below the team table with matching styling; do not substitute a range slider. Pin only the name column horizontally; the assessment level scrolls normally alongside the total score. Do not show a grouped header row.
- Show all filtered people on one page, without pagination or connection/access columns. Let the table grow to its full content height with normal page scrolling; do not cap its height or introduce an internal vertical scroll area. The first column contains only the linked name; the second displays the assessment level (ดีเด่น, ดี, มาตรฐาน, ปรับปรุง, ไม่ผ่าน) from the shared assessment result, before the total score column. Put score limits in the column headings rather than repeating them in every row.
- The team assessment is the home page `/`. The individual assessment is `/person`.
- The team table's ปริมาณงาน column is the total number of assigned tasks across all statuses in the selected date period. It is not completed tasks per month or the criterion 1.3 score. Hide the งานใหม่ที่วางแผนครบ table column without removing criterion 2.3 from assessment scoring.
- Team score headers use two lines: คะแนนรวม / เต็ม 100, ผลงาน / เต็ม 60, วินัย / เต็ม 40. Display only the three score columns (total, performance, discipline) with exactly three decimal places. Display all other table numbers, including hours, counts, percentages, and details, without decimals; preserve the underlying numeric values for calculations and sorting.

## Data and credentials

- Use the same assessment formula and selected date period on both pages.
- Read real tasks and Time Sheets. Do not invent scores or present inaccessible data as zero.
- Use one shared connected account API key for everyone. Do not offer per-person key entry. Show its verified owner and lock editing until the user selects Change API key.
- Keep the connection panel above the date filters on both pages. Show access flags only for permission denials or errors. Hide allowed and not-yet-checked flags; distinguish permission denial from network errors.
- Once connected, display the key owner, locked status, masked key, and connection actions in a compact single row. Keep controls at least 44px high and scroll the row horizontally on narrow screens.
- Remember the shared key in browser storage. Never print keys, embed them in source code, or include them in URLs, screenshots, or logs.

## Assessment criteria

- Use [เกณฑ์การประเมินผลงานประจำปี 2569](<docs/เกณฑ์การประเมินผลงานประจำปี 2569.md>) as the authoritative source for assessment scoring.
- Read this document before implementing, changing, or reviewing score calculations, targets, weights, evaluation periods, completion dates, working-day rules, or rating levels. Apply the same criteria to both the team table and the individual assessment.
- Follow the document's proportional scoring, maximum-score caps, overdue deductions, and transfer of the 15 points from criterion 1.4 to criterion 1.1 when fewer than 10 tasks have estimated time.
- Use actual Redmine Issues and Spent time. Follow the document's rules for company holidays, approved leave, and employees who start or transfer during the evaluation period. Do not invent calendar, leave, or employment-period data; disclose missing evidence and its effect on the assessment.
- Keep score descriptions and relevant regression tests consistent with the document. Explicit user instructions take precedence over repository guidance; identify any resulting scoring exception clearly.

## Verification

- Run relevant tests and the production build for functional changes.
- Verify responsive layouts and actual browser interactions when changing tables, navigation, or page structure.
- Keep changes focused on the requested work. Do not spawn sub-agents unless explicitly requested.
