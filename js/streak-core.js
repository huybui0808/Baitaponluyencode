// VI: Một ngày học bắt đầu lúc 03:00 theo múi giờ tài khoản.
// EN: A study day starts at 03:00 in the account time zone.
export const STREAK_MILESTONES = Object.freeze([3, 10, 20, 30, 60, 90, 100, 150, 200]);
export const DEFAULT_STREAK_TIME_ZONE = "Asia/Ho_Chi_Minh";

const FLAME_CORE = "M32 34c1 8 10 13 10 23a10 10 0 0 1-20 0c0-9 6-16 10-23Z";
const FLAME_SHAPES = Object.freeze([
  "M35 3c3 13 19 21 23 35 6 19-5 34-24 35C14 74 5 61 8 45c2-10 9-18 17-29-1 10 1 16 5 20C36 26 36 15 35 3Z",
  "M35 3c3 13 19 21 23 35 6 19-5 34-24 35C14 74 5 61 8 45c2-10 9-18 17-29-1 10 1 16 5 20C36 26 36 15 35 3Z",
  "M35 3c3 13 19 21 23 35 6 19-5 34-24 35C14 74 5 61 8 45c2-10 9-18 17-29-1 10 1 16 5 20C36 26 36 15 35 3Z",
  "M34 3c2 11 9 18 16 25 7 8 11 15 9 25-2 13-12 21-27 21S5 66 6 51c0-10 5-19 13-28-1 9 0 14 4 18 1-13 6-25 11-38Zm8 28c1 6 4 10 8 13-1-7-4-12-8-17Z",
  "M32 2c1 10 5 17 10 22 2-8 2-14 2-19 8 11 17 18 21 31 6 19-6 38-32 38S-1 55 5 39c3-9 9-16 17-23-1 9 0 15 4 18 1-12 3-22 6-32Z",
  "M32 4c1 11-3 20-8 29 8-3 12-10 14-18 11 11 21 20 20 34-1 14-11 24-26 24S5 65 6 50c1-9 5-16 12-24-1 10 1 16 5 19-1-14 3-27 9-41Zm-12 41c-3 7-2 13 1 17 2 2 5 4 8 5-5-7-7-14-7-23Z",
  "M34 2c3 10 1 18-3 25 8-2 13-9 15-17 10 10 18 18 18 31 0 19-13 32-32 32S0 60 4 43c2-9 8-17 18-25-1 9 1 15 5 18-1-13 2-23 7-34Zm-2 16c-1 7-5 13-11 18 1-8 4-14 11-18Zm-4 25c-6 8-8 15-5 22 2 4 5 6 9 7-5-9-5-17-4-29Z",
  "M32 1c3 12 8 20 14 25 1-9 0-15-2-21 11 12 20 22 20 38 0 18-12 30-32 30S0 59 4 42c2-11 8-20 18-29-1 10 1 16 5 19 0-12 2-22 5-31Zm-15 38c-4 7-5 14-2 21 2 4 5 6 9 7-5-9-6-17-4-28Zm26-5c1 6 4 10 8 13-1-7-4-12-8-17Z",
  "M32 2c1 10 4 17 8 22 3-7 4-14 3-21 8 9 12 17 13 25 5-5 7-11 7-17 6 11 8 21 5 32-3 14-15 22-36 22S-1 54 5 38c3-9 8-15 15-21-1 10 1 16 5 19 0-12 3-24 7-34Zm-2 40c-6 8-8 15-5 22 2 4 5 6 9 7-5-9-5-18-4-29Z",
  "M32 2c4 13 12 19 20 23-2-8-5-14-9-20 15 9 25 22 23 37-2 16-15 28-34 28S1 59 5 42c2-9 8-17 17-24-1 10 1 15 5 18 0-13 2-24 5-34Zm-15 34c-4 9-3 18 2 24 3 4 7 6 12 7-8-10-10-19-7-33Zm27-2c1 7 5 12 10 16-1-9-5-16-12-23Z",
  "M32 1c2 11 5 18 10 23 3-7 4-14 3-21 7 8 11 15 13 23 5-5 7-10 7-16 7 10 9 20 6 31-4 16-17 29-39 29S-2 58 4 40c3-10 9-18 19-26-1 10 1 16 5 19 0-12 1-22 4-32Zm-9 39c-5 9-5 18 0 25 3 4 6 6 11 7-6-10-7-19-5-32Zm18-4c1 8 5 14 11 18-1-10-5-17-13-25Z",
]);
const FLAME_DETAILS = Object.freeze([
  "", "", "",
  '<path class="streak-flame-detail" d="M10 54c-3-7-2-14 3-21 4 7 4 13 1 19Zm41-18c4-7 3-14-1-21 8 7 10 15 6 23Z"/>',
  '<path class="streak-flame-detail" d="M8 55c-4-8-3-15 3-22 4 8 3 14 1 20Zm41-20c4-7 3-14-1-21 8 6 11 14 7 23Z"/>',
  '<path class="streak-flame-detail" d="M8 54c-4-6-3-12 2-18 4 6 4 12 2 17Zm40-19c4-6 3-12-1-18 7 6 9 12 6 20Z"/>',
  '<path class="streak-flame-detail" d="M3 55c-5-7-3-15 4-22M61 53c5-7 4-14-2-20" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>',
  '<path class="streak-flame-detail" d="m7 38 3-5 3 5-3 5Zm43-18 3-5 3 5-3 5Zm8 35 2-4 3 4-3 4Z"/>',
  '<path class="streak-flame-detail" d="m8 32 3-5 3 5-3 5Zm47-11 3-6 3 6-3 6Zm-5 39 2-4 3 4-3 4Z"/>',
  '<ellipse class="streak-flame-detail" cx="32" cy="55" rx="30" ry="10" transform="rotate(-24 32 55)" fill="none" stroke="currentColor" stroke-width="2.5"/>',
  '<path class="streak-flame-detail" d="m6 34 3-6 3 6-3 6Zm46-15 3-7 3 7-3 7Zm5 42 3-6 3 6-3 6ZM14 18l2-4 2 4-2 4Z"/><path class="streak-flame-detail" d="M6 56c-4-7-3-14 2-20m48-11c5-6 5-13 1-19" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>',
]);
const FLAME_PALETTES = Object.freeze([
  ["#d5dfdb", "#87958f", "#6f7e78", "#e3ebe7", "#aab8b1"],
  ["#fffde0", "#ffd84e", "#c88515", "#fff9b7", "#ffe07a"],
  ["#fffbd0", "#fff044", "#e98b08", "#fff9a8", "#ffe46d"],
  ["#fff1bd", "#ff9b2f", "#df4b08", "#ffedc2", "#ffc76b"],
  ["#ffe0c9", "#ff5149", "#a90f3a", "#ffd6c6", "#ff927a"],
  ["#efffc2", "#71db40", "#087449", "#d9f99d", "#86efac"],
  ["#d6ffff", "#25d7e0", "#08708f", "#cffafe", "#67e8f9"],
  ["#e0f2ff", "#5ba6ff", "#1e40af", "#dbeafe", "#93c5fd"],
  ["#e7eaff", "#8187ff", "#3730a3", "#e0e7ff", "#a5b4fc"],
  ["#f5e6ff", "#c16bff", "#6b21a8", "#f3e8ff", "#d8b4fe"],
  ["#ffe6f3", "#ff72be", "#9d174d", "#fce7f3", "#f9a8d4"],
]);

export function streakFlameSvg(tier, instance = "icon") {
  const level = Math.max(0, Math.min(10, Number.isFinite(Number(tier)) ? Math.trunc(Number(tier)) : 0));
  const safeId = String(instance).replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 48) || "icon";
  const [top, middle, bottom, coreTop, coreBottom] = FLAME_PALETTES[level];
  const outerId = `streak-flame-outer-${safeId}`;
  const coreId = `streak-flame-core-${safeId}`;
  const detail = FLAME_DETAILS[level]
    .replace(/<path class="streak-flame-detail"(?![^>]*\bfill=)/g, `<path class="streak-flame-detail" fill="url(#${outerId})"`)
    .replace('stroke="currentColor"', `stroke="url(#${outerId})"`);
  return `<svg class="streak-flame streak-flame-colored" viewBox="0 0 64 76" aria-hidden="true"><defs><linearGradient id="${outerId}" x1="0" y1="0" x2="0.18" y2="1"><stop stop-color="${top}"/><stop offset=".34" stop-color="${middle}"/><stop offset="1" stop-color="${bottom}"/></linearGradient><linearGradient id="${coreId}" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${coreTop}"/><stop offset="1" stop-color="${coreBottom}"/></linearGradient></defs><path class="streak-flame-outer" d="${FLAME_SHAPES[level]}" fill="url(#${outerId})"/>${detail}<path class="streak-flame-core" d="${FLAME_CORE}" fill="url(#${coreId})"/></svg>`;
}

const dateFormatters = new Map();

export function studyDateAt(instant, timeZone = DEFAULT_STREAK_TIME_ZONE) {
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) throw new RangeError("Invalid study timestamp");
  let formatter = dateFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit",
      hourCycle: "h23",
    });
    dateFormatters.set(timeZone, formatter);
  }
  const parts = Object.fromEntries(formatter.formatToParts(date).map(({ type, value }) => [type, value]));
  const localDay = `${parts.year}-${parts.month}-${parts.day}`;
  return Number(parts.hour) < 3 ? shiftStudyDate(localDay, -1) : localDay;
}

export function shiftStudyDate(day, amount) {
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new RangeError("Invalid study date");
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function streakTier(days) {
  if (days <= 0) return 0;
  let tier = 1;
  for (const milestone of STREAK_MILESTONES) {
    if (days < milestone) break;
    tier++;
  }
  return tier;
}

export function summarizeStreak(rawDays, today) {
  const days = [...new Set(rawDays.map((entry) => typeof entry === "string" ? entry : entry.study_date))]
    .filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day) && day <= today).sort();
  let longest = 0;
  let run = 0;
  let previous = "";
  for (const day of days) {
    run = previous && shiftStudyDate(previous, 1) === day ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }
  const last = days.at(-1);
  const completedToday = last === today;
  const active = completedToday || last === shiftStudyDate(today, -1);
  return {
    current: active ? run : 0,
    longest,
    completedToday,
    pendingToday: !completedToday && active,
    lastDay: last || null,
    days,
  };
}

export function calendarCells(year, month) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12)
    throw new RangeError("Invalid calendar month");
  const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells = Array(firstWeekday).fill(null);
  for (let day = 1; day <= count; day++)
    cells.push(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  return cells;
}
