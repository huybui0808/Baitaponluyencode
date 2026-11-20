import {
  DEFAULT_STREAK_TIME_ZONE, STREAK_MILESTONES, calendarCells,
  streakTier, studyDateAt, summarizeStreak,
} from "./streak-core.js";
import { pendingStreakDays } from "./streak-sync.js";

// VI: Giao diện và đồng bộ chuỗi học độc lập với điểm và lịch sử mã nguồn.
// EN: Study streak UI and sync are separate from scoring and source history.
const byId = (id) => document.getElementById(id);
const snapshotKey = (userId) => `onluyencpp_streak_snapshot_${userId}`;
const knownUserKey = "onluyencpp_streak_known_user";
const state = {
  userId: null, timezone: DEFAULT_STREAK_TIME_ZONE, pendingTimezone: null,
  pendingEffectiveAt: null, days: [], pending: [], error: "", serverOffset: 0,
  calendarYear: 0, calendarMonth: 0, loading: false,
};
let options = null;
let refreshToken = 0;
let celebrationTimer = 0;
const flushingUsers = new Set();
const retryAfterFlush = new Set();
const RPC_TIMEOUT_MS = 10000;

async function streakRpc(client, name, args) {
  const controller = new AbortController();
  const request = client.rpc(name, args);
  if (typeof request.abortSignal === "function") request.abortSignal(controller.signal);
  let timer;
  try {
    return await Promise.race([
      request,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("timeout"));
        }, RPC_TIMEOUT_MS);
      }),
    ]);
  } finally { clearTimeout(timer); }
}

function activeUserId() {
  const signedIn = options?.getUser()?.id;
  if (signedIn) return signedIn;
  return !navigator.onLine ? state.userId : null;
}

function currentInstant() { return Date.now() + state.serverOffset; }
function currentStudyDate() { return studyDateAt(currentInstant(), state.timezone); }

function loadSnapshot(userId) {
  try {
    const saved = JSON.parse(localStorage.getItem(snapshotKey(userId)) || "null");
    if (saved && Array.isArray(saved.days)) {
      state.days = saved.days;
      state.timezone = saved.timezone || DEFAULT_STREAK_TIME_ZONE;
      state.pendingTimezone = saved.pendingTimezone || null;
      state.pendingEffectiveAt = saved.pendingEffectiveAt || null;
    }
  } catch (_) { /* An invalid local cache must not block the page. */ }
}

function saveSnapshot() {
  if (!state.userId) return;
  try {
    localStorage.setItem(snapshotKey(state.userId), JSON.stringify({
      days: state.days, timezone: state.timezone,
      pendingTimezone: state.pendingTimezone, pendingEffectiveAt: state.pendingEffectiveAt,
    }));
  } catch (_) { /* Streak remains available from Supabase when storage is full. */ }
}

function setMonthFromToday() {
  const today = currentStudyDate();
  state.calendarYear = Number(today.slice(0, 4));
  state.calendarMonth = Number(today.slice(5, 7));
}

function paintRecent() {
  const root = byId("streakRecent");
  root.replaceChildren();
  if (!state.userId) { root.textContent = "Đăng nhập để xem lịch sử ngày học."; return; }
  const recent = [...state.days].sort((a, b) => b.study_date.localeCompare(a.study_date)).slice(0, 3);
  if (!recent.length) { root.textContent = "Chưa có ngày học nào được lưu."; return; }
  for (const entry of recent) {
    const item = document.createElement("div");
    item.className = "streak-recent-item";
    const mark = document.createElement("span");
    mark.textContent = "✓";
    const detail = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = entry.problem_id
      ? `#${String(entry.problem_id).padStart(3, "0")} · ${options?.problemTitle(entry.problem_id) || "Bài tập"}`
      : "Ngày học đã lưu";
    const date = document.createElement("small");
    date.textContent = `Ngày học ${entry.study_date.split("-").reverse().join("/")}`;
    detail.append(name, date);
    item.append(mark, detail);
    root.append(item);
  }
}

function paintCalendar(today) {
  const root = byId("streakCalendar");
  root.replaceChildren();
  const { calendarYear: year, calendarMonth: month } = state;
  byId("streakMonthLabel").textContent = `Tháng ${month}/${year}`;
  const todayMonth = today.slice(0, 7);
  byId("streakNextMonth").disabled = `${year}-${String(month).padStart(2, "0")}` >= todayMonth;
  const confirmed = new Set(state.days.map((entry) => entry.study_date));
  const pending = new Set(state.pending.map((entry) => entry.studyDate));
  for (const date of calendarCells(year, month)) {
    const cell = document.createElement("span");
    cell.className = "streak-day";
    cell.setAttribute("role", "gridcell");
    if (date) {
      cell.textContent = String(Number(date.slice(8)));
      cell.classList.toggle("done", confirmed.has(date));
      cell.classList.toggle("pending", !confirmed.has(date) && pending.has(date));
      cell.classList.toggle("today", date === today);
      cell.classList.toggle("future", date > today);
      cell.setAttribute("aria-label", `${date.split("-").reverse().join("/")}: ${confirmed.has(date) ? "Đã học" : pending.has(date) ? "Chờ đồng bộ" : date > today ? "Chưa tới" : "Chưa học"}`);
    } else cell.setAttribute("aria-hidden", "true");
    root.append(cell);
  }
}

function paint() {
  if (!options) return;
  const today = currentStudyDate();
  if (!state.calendarYear) setMonthFromToday();
  // VI: Chỉ hiển thị số ngày Supabase đã xác nhận; lượt cục bộ có trạng thái riêng.
  // EN: Count only server-confirmed days; keep local pending marks separate.
  const summary = summarizeStreak(state.days, today);
  const confirmedToday = state.days.some((entry) => entry.study_date === today);
  const pendingToday = state.pending.some((entry) => entry.studyDate === today);
  const count = state.userId ? summary.current : 0;
  const badge = byId("streakNav");
  badge.dataset.tier = String(streakTier(count));
  badge.dataset.pending = state.pending.length ? "true" : "false";
  badge.title = state.pending.length ? "Chuỗi đã xác nhận; có lượt học đang chờ đồng bộ" : "Mở chuỗi ngày học";
  badge.setAttribute("aria-label", state.userId ? `Chuỗi ngày học: ${count} ngày${state.pending.length ? ", đang chờ đồng bộ" : ""}. Mở chi tiết` : "Đăng nhập để xem chuỗi ngày học");
  byId("streakNavCount").textContent = state.userId ? String(count) : "—";
  byId("streakOverlay").querySelector(".streak-page").dataset.tier = String(streakTier(count));
  byId("streakCurrent").textContent = String(count);
  byId("streakLongest").textContent = `${state.userId ? summary.longest : 0} ngày`;
  byId("streakToday").textContent = !state.userId ? "Đăng nhập" : confirmedToday ? "Đã học" : pendingToday ? "Chờ đồng bộ" : "Chưa học";
  byId("streakTodayNote").textContent = !state.userId
    ? "Đăng nhập để lưu chuỗi học của bạn."
    : confirmedToday ? "Ngày học này đã được xác nhận."
      : pendingToday ? "Lượt nộp đã lưu trên thiết bị, đang chờ xác nhận."
        : summary.pendingToday ? "Chuỗi hôm qua còn nguyên; hãy nộp một bài hôm nay."
          : "Nộp và chấm xong một bài để bắt đầu chuỗi.";
  byId("streakSyncStatus").textContent = !state.userId ? "Đăng nhập để đồng bộ trên các thiết bị."
    : state.error || (state.pending.length ? `${state.pending.length} ngày học đang chờ đồng bộ.`
      : navigator.onLine ? "Đã đồng bộ với tài khoản." : "Đang offline; hiển thị dữ liệu đã lưu trên thiết bị.");
  byId("streakRetry").hidden = !state.pending.length;
  byId("streakRetry").disabled = !navigator.onLine || !options.getUser();
  byId("streakTimezone").value = state.pendingTimezone || state.timezone;
  byId("streakTimezone").disabled = !options.getUser() || !navigator.onLine;
  byId("streakTimezoneForm").querySelector("button").disabled = !options.getUser() || !navigator.onLine;
  if (state.pendingTimezone && state.pendingEffectiveAt) {
    byId("streakTimezoneMessage").textContent = `Múi giờ ${state.pendingTimezone} sẽ áp dụng từ ${new Date(state.pendingEffectiveAt).toLocaleString("vi-VN", { timeZone: state.timezone })}.`;
  }
  byId("streakContinue").textContent = state.userId ? "Tiếp tục luyện bài" : "Đăng nhập để lưu chuỗi";
  paintCalendar(today);
  paintRecent();
}

function showCelebration(days) {
  byId("streakCelebrationTitle").textContent = `Chúc mừng! Bạn đã giữ chuỗi ${days} ngày.`;
  const notice = byId("streakCelebration");
  notice.hidden = false;
  clearTimeout(celebrationTimer);
  celebrationTimer = setTimeout(() => { notice.hidden = true; }, 2400);
}

async function checkCelebration(day, userId) {
  if (!options?.getUser() || options.getUser().id !== userId) return;
  const summary = summarizeStreak(state.days, day);
  if (!STREAK_MILESTONES.includes(summary.current) || summary.lastDay !== day) return;
  const entry = state.days.find((item) => item.study_date === day);
  if (!entry || entry.celebrated_at) return;
  let data;
  let error;
  try { ({ data, error } = await streakRpc(options.getSupabase(), "take_streak_celebration", { p_study_date: day })); }
  catch (_) { return; }
  if (error || !data || activeUserId() !== userId) return;
  entry.celebrated_at = new Date().toISOString();
  saveSnapshot();
  showCelebration(summary.current);
}

async function readPending(userId) {
  try { state.pending = await pendingStreakDays.list(userId); }
  catch (_) { state.pending = []; state.error = "Trình duyệt không lưu được ngày học offline."; }
}

async function flushPending(userId) {
  const client = options?.getSupabase();
  if (flushingUsers.has(userId)) { retryAfterFlush.add(userId); return; }
  if (!client || !navigator.onLine || options.getUser()?.id !== userId) return;
  flushingUsers.add(userId);
  try {
   for (const entry of [...state.pending]) {
    if (activeUserId() !== userId) return;
    let data;
    let error;
    try {
      ({ data, error } = await streakRpc(client, "claim_streak_day", {
        p_event_id: entry.eventId, p_problem_id: entry.problemId,
        p_completed_at: entry.completedAt, p_offline: entry.offline,
      }));
    } catch (_) {
      error = { message: "timeout" };
    }
    if (activeUserId() !== userId) return;
    if (error) {
      if (!entry.offline && error.code !== "PGRST202") {
        entry.offline = true;
        try { await pendingStreakDays.put(entry); } catch (_) {}
      }
      state.error = /Offline study time/i.test(error.message || "")
        ? "Ngày học offline cần xác minh thời điểm; dấu mốc vẫn được giữ trên thiết bị."
        : error.code === "PGRST202" ? "Chức năng chuỗi cần áp dụng SQL 20261205 trên Supabase."
          : /This problem is unavailable/i.test(error.message || "")
            ? "Bài này chưa được xuất bản trong Supabase nên chưa thể lưu chuỗi."
            : /Suspended accounts/i.test(error.message || "")
              ? "Tài khoản đang bị đình chỉ nên lượt này không được tính vào chuỗi."
          : /timeout/i.test(error.message || "")
            ? "Supabase chưa phản hồi trong 10 giây. Lượt học vẫn nằm trên thiết bị và sẽ được gửi lại."
            : `Supabase chưa lưu ngày học: ${String(error.message || error.code || "lỗi kết nối").slice(0, 180)}`;
      paint();
      return;
    }
    if (!/^(recorded|already_counted)$/.test(data?.status || "")
        || !/^\d{4}-\d{2}-\d{2}$/.test(data?.study_date || "")) {
      state.error = "Supabase trả dữ liệu chuỗi không hợp lệ; lượt học vẫn được giữ để thử lại.";
      paint();
      return;
    }
    if (!state.days.some((day) => day.study_date === data.study_date)) {
      state.days.push({ study_date: data.study_date, problem_id: entry.problemId, celebrated_at: null });
      saveSnapshot();
    }
    try { await pendingStreakDays.delete(entry.key); } catch (_) { /* The server still deduplicates by event ID. */ }
    state.pending = state.pending.filter((item) => item.key !== entry.key);
    state.error = "";
    paint();
    await loadRemote(userId, false);
    if (data?.status === "recorded") await checkCelebration(data.study_date, userId);
   }
  } finally {
    flushingUsers.delete(userId);
    if (retryAfterFlush.delete(userId) && activeUserId() === userId)
      queueMicrotask(() => { void flushPending(userId).catch(() => {}); });
  }
}

async function loadRemote(userId, flush = true) {
  const client = options?.getSupabase();
  if (!client || !navigator.onLine || options.getUser()?.id !== userId) return;
  let data;
  let error;
  try { ({ data, error } = await streakRpc(client, "get_my_streak")); }
  catch (_) { error = { message: "timeout" }; }
  if (activeUserId() !== userId) return;
  if (error) {
    state.error = error.code === "PGRST202"
      ? "Chức năng chuỗi cần áp dụng SQL 20261205 trên Supabase."
      : "Chưa tải được chuỗi từ Supabase. Đang hiển thị các ngày đã xác nhận trước đó trên thiết bị này.";
    paint();
    return;
  }
  if (!Array.isArray(data?.days) || !data?.timezone) {
    state.error = "Supabase trả dữ liệu chuỗi không hợp lệ; giữ các ngày đã xác nhận trước đó.";
    paint();
    return;
  }
  state.error = "";
  // VI: Một phản hồi đọc bắt đầu trước lượt ghi không được xóa ngày vừa xác nhận.
  // EN: A read started before a confirmed write must not hide that new day.
  state.days = [...new Map([...state.days, ...data.days].map((day) => [day.study_date, day])).values()];
  state.timezone = data.timezone;
  state.pendingTimezone = data?.pending_timezone || null;
  state.pendingEffectiveAt = data?.pending_effective_at || null;
  state.serverOffset = data?.server_time ? new Date(data.server_time).getTime() - Date.now() : 0;
  saveSnapshot();
  if (flush) await flushPending(userId);
  setMonthFromToday();
  paint();
  if (!state.pending.length) await checkCelebration(currentStudyDate(), userId);
}

export async function refreshStreak() {
  if (!options) return;
  const userId = activeUserId();
  const token = ++refreshToken;
  if (!userId) { state.userId = null; state.days = []; state.pending = []; state.error = ""; paint(); return; }
  if (state.userId !== userId) {
    state.userId = userId;
    state.days = [];
    state.pending = [];
    state.timezone = DEFAULT_STREAK_TIME_ZONE;
    state.calendarYear = 0;
    loadSnapshot(userId);
  }
  await readPending(userId);
  if (token !== refreshToken || state.userId !== userId) return;
  paint();
  await loadRemote(userId);
}

export function setStreakSession(user) {
  if (user?.id) {
    try { localStorage.setItem(knownUserKey, user.id); } catch (_) {}
    state.userId = user.id;
    state.days = [];
    state.pending = [];
    state.calendarYear = 0;
    loadSnapshot(user.id);
  } else {
    try { localStorage.removeItem(knownUserKey); } catch (_) {}
    state.userId = null;
    state.days = [];
    state.pending = [];
  }
  void refreshStreak();
}

export function streakUserId() { return activeUserId(); }

export async function recordCompletedBatch({ problemId, userIdAtStart, suspended }) {
  const userId = activeUserId();
  if (!userId || userId !== userIdAtStart || suspended) return;
  if (state.pendingTimezone && state.pendingEffectiveAt
      && new Date(state.pendingEffectiveAt).getTime() <= currentInstant()) {
    state.timezone = state.pendingTimezone;
    state.pendingTimezone = null;
    state.pendingEffectiveAt = null;
  }
  const completedAt = new Date(currentInstant()).toISOString();
  const studyDate = studyDateAt(completedAt, state.timezone);
  if (state.days.some((day) => day.study_date === studyDate)
      || state.pending.some((entry) => entry.studyDate === studyDate)) return;
  const entry = { key: `${userId}:${studyDate}`, eventId: crypto.randomUUID(), userId,
    problemId: Number(problemId), completedAt, studyDate, offline: !navigator.onLine };
  try {
    await pendingStreakDays.put(entry);
    await readPending(userId);
    paint();
    if (navigator.onLine && options.getUser()?.id === userId) void flushPending(userId).catch((error) => {
      console.warn("Chưa đồng bộ được ngày học:", error);
      state.error = "Chưa đồng bộ được ngày học; dấu mốc vẫn lưu trên thiết bị.";
      paint();
    });
  } catch (_) {
    state.error = "Không lưu được ngày học chờ đồng bộ trên thiết bị này.";
    paint();
  }
}

export function openStreak() {
  byId("streakOverlay").hidden = false;
  document.body.classList.add("no-scroll");
  byId("streakOverlay").querySelector(".streak-close").focus();
  void refreshStreak();
}

export function initStreak(config) {
  options = config;
  if (!config.getUser() && !navigator.onLine) {
    try { state.userId = localStorage.getItem(knownUserKey); } catch (_) {}
    if (state.userId) loadSnapshot(state.userId);
  }
  const list = byId("streakTimezoneList");
  const zones = typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone") : ["Asia/Ho_Chi_Minh", "UTC", "Asia/Tokyo", "Europe/London"];
  for (const zone of [DEFAULT_STREAK_TIME_ZONE, ...zones.filter((item) => item !== DEFAULT_STREAK_TIME_ZONE)]) {
    const option = document.createElement("option");
    option.value = zone;
    list.append(option);
  }
  byId("streakNav").addEventListener("click", openStreak);
  byId("streakRetry").addEventListener("click", () => { void refreshStreak(); });
  byId("streakContinue").addEventListener("click", () => {
    byId("streakOverlay").hidden = true;
    if (!document.querySelector(".auth-overlay:not([hidden])")) document.body.classList.remove("no-scroll");
    if (!state.userId) config.onLogin();
  });
  byId("streakPrevMonth").addEventListener("click", () => {
    state.calendarMonth--;
    if (state.calendarMonth < 1) { state.calendarMonth = 12; state.calendarYear--; }
    paint();
  });
  byId("streakNextMonth").addEventListener("click", () => {
    const next = state.calendarYear * 12 + state.calendarMonth;
    const today = currentStudyDate();
    if (next > Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7)) - 1) return;
    state.calendarMonth++;
    if (state.calendarMonth > 12) { state.calendarMonth = 1; state.calendarYear++; }
    paint();
  });
  byId("streakTimezoneForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const zone = byId("streakTimezone").value.trim();
    const message = byId("streakTimezoneMessage");
    if (!config.getUser() || !config.getSupabase()) return;
    try { new Intl.DateTimeFormat("en-US", { timeZone: zone }); }
    catch (_) { message.textContent = "Hãy chọn một múi giờ hợp lệ trong danh sách."; return; }
    const button = event.currentTarget.querySelector("button");
    button.disabled = true;
    let error;
    try { ({ error } = await config.getSupabase().rpc("set_my_streak_timezone", { p_timezone: zone })); }
    catch (_) { error = { message: "Network unavailable" }; }
    button.disabled = false;
    if (error) { message.textContent = "Chưa lưu được múi giờ. Hãy thử lại."; return; }
    message.textContent = "Đã lưu. Múi giờ mới áp dụng từ ngày học tiếp theo.";
    await refreshStreak();
  });
  window.addEventListener("online", () => { void refreshStreak(); });
  window.addEventListener("focus", () => { void refreshStreak(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void refreshStreak(); });
  setInterval(() => {
    if (document.hidden) return;
    // VI: Tab đang mở cũng cần thấy ngày học từ thiết bị khác và thử lại lượt đang chờ.
    // EN: Poll visible tabs for cross-device marks and retry queued submissions.
    if (navigator.onLine && options.getUser())
      void refreshStreak();
    else paint();
  }, 60_000);
  void refreshStreak();
}
