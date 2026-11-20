// VI: Một ngày học bắt đầu lúc 03:00 theo múi giờ tài khoản.
// EN: A study day starts at 03:00 in the account time zone.
export const STREAK_MILESTONES = Object.freeze([3, 10, 20, 30, 60, 90, 100, 150, 200]);
export const DEFAULT_STREAK_TIME_ZONE = "Asia/Ho_Chi_Minh";

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

export function summarizeVisibleStreak(confirmedDays, pendingDays, today) {
  return summarizeStreak([
    ...confirmedDays,
    ...pendingDays.map((entry) => typeof entry === "string" ? entry : entry.studyDate),
  ], today);
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
