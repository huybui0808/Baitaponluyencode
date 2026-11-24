import { classifyTestResult } from './checker.js';
import { CONCEPT_NOTES, OUTPUT_RULES, taskPresentation, taskSample } from './problem-presentation.js';
import { initStreak, openStreak, recordCompletedBatch, setStreakSession, streakUserId } from './streak.js';
import { shiftStudyDate, streakFlameSvg, streakTier, summarizeStreak } from './streak-core.js';
import { bundledPartUrls } from './task-parts.js';
import { renderCppHighlight } from './code-highlight.js';
import { buildTaskPdfHtml } from './task-pdf.js';
import { initSiteAnnouncements } from './site-announcements.js';
// Logic giao dien, chay code, cham diem va luu tien do.
// VI: Lấy bài đã xuất bản từ Supabase; dùng bản đã đồng bộ hoặc JSON khi offline.
// EN: Load published tasks from Supabase, then cached tasks or bundled JSON offline.
// VI: AI hỗ trợ triển khai một số tính năng theo yêu cầu của chủ dự án. EN: AI assisted implementation of selected features under the project owner's direction.
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker
    .register("./sw.js")
    .then(() => navigator.storage?.persist?.())
    .catch((error) => console.warn("Không bật được cache offline:", error));
}

const PUBLISHED_TASK_CACHE = "onluyencpp-published-tasks-v1";
const PUBLISHED_TASK_CACHE_KEY = new URL("../data/.published-tasks.json", import.meta.url).href;
let catalogSyncWarning = "";
// VI: Số test của mỗi bài linh hoạt; giới hạn này chỉ để chặn dữ liệu bất thường.
// EN: Test counts may vary by task; this upper bound only rejects malformed data.
const MAX_TESTS = 30;
const MIN_TESTS = 8;
const MAX_VISIBLE_TESTS = 10;
const LEGACY_TEST_COUNT = 20;
let pendingBundledTaskParts = Promise.resolve([]);
function hasValidTestCount(tests) {
  return Array.isArray(tests) && tests.length >= MIN_TESTS && tests.length <= MAX_TESTS;
}
// VI: Giới hạn test công khai để luyện tập. EN: Limit the public practice cases.
function visibleTests(task) {
  return task.tests.slice(0, MAX_VISIBLE_TESTS);
}
function testSetVersion(task) {
  if (task?.test_set_version) return String(task.test_set_version);
  const encoder = new TextEncoder();
  const data = (task?.tests || []).map((test) => {
    const input = String(test.input ?? "");
    const output = String(test.output ?? "");
    return `${encoder.encode(input).length}:${input}${encoder.encode(output).length}:${output}`;
  }).join("");
  let hash = 2166136261;
  for (const byte of encoder.encode(data)) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

// VI: Bài đã xuất bản trong Supabase là nguồn chính; lưu bản mới nhất để chấm offline.
// EN: Cache the latest published Supabase tasks for offline grading.
async function readCachedPublishedTasks() {
  if (!("caches" in window)) return null;
  try {
    const response = await (await caches.open(PUBLISHED_TASK_CACHE)).match(PUBLISHED_TASK_CACHE_KEY);
    if (!response) return null;
    const tasks = await response.json();
    if (!Array.isArray(tasks) || !tasks.length) return null;
    const ids = new Set();
    if (!tasks.every((task) => {
      if (!Number.isInteger(task.id) || ids.has(task.id) || !hasValidTestCount(task.tests)) return false;
      ids.add(task.id);
      return true;
    })) return null;
    return tasks;
  } catch (_) {
    return null;
  }
}
async function cachePublishedTasks(tasks) {
  if (!("caches" in window)) return;
  try {
    const cache = await caches.open(PUBLISHED_TASK_CACHE);
    await cache.put(PUBLISHED_TASK_CACHE_KEY, new Response(JSON.stringify(tasks), {
      headers: { "Content-Type": "application/json; charset=utf-8" },
    }));
  } catch (error) {
    console.warn("Không lưu được bộ bài tập để dùng offline:", error);
  }
}

// [ADMIN] Ưu tiên nạp bài đã xuất bản từ Supabase (bảng problems + test_cases do Admin quản lý).
async function loadTasksFromSupabase() {
  if (!navigator.onLine) return null;
  try {
    const key = "sb_publishable_Fb40gK9h5FiDyJSI05nH0g_TmXM8W-m";
    const url =
      "https://dcdvtpmihijzbieblwfa.supabase.co/rest/v1/problems" +
      "?select=*,test_cases(no,input,output)&is_published=eq.true&order=id.asc&limit=1000";
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      headers: { apikey: key },
      cache: "no-cache",
      signal: controller.signal,
    });
    window.clearTimeout(timeout);
    if (!res.ok) {
      const details = await res.json().catch(() => ({}));
      console.warn("Không tải được danh sách bài từ Supabase:", res.status, details.message || "");
      catalogSyncWarning = "Chưa đồng bộ được bài online; đang dùng dữ liệu đã lưu.";
      return null;
    }
    const rows = await res.json();
    if (!Array.isArray(rows)) {
      catalogSyncWarning = "Dữ liệu bài online không hợp lệ; đang dùng dữ liệu đã lưu.";
      return null;
    }
    const tasks = rows
      .map((r) => ({
        id: r.id,
        title: r.title,
        section: r.section,
        level: r.level,
        statement: r.statement,
        input: r.input,
        output: r.output,
        constraints: r.constraints,
        knowledge_note: r.knowledge_note ?? null,
        presentation_rules: r.presentation_rules ?? "",
        sample_input: r.sample_input,
        sample_output: r.sample_output,
        test_set_version: r.test_set_version ?? null,
        tests: (r.test_cases || [])
          .sort((a, b) => a.no - b.no)
          .map((t) => ({ no: t.no, input: t.input, output: t.output })),
      }))
      .filter((t) => hasValidTestCount(t.tests));
    if (!tasks.length) {
      if (rows.length) catalogSyncWarning = "Bài online chưa đủ test hợp lệ; đang dùng dữ liệu đã lưu.";
      return null;
    }
    await cachePublishedTasks(tasks);
    return tasks;
  } catch (error) {
    console.warn("Không đồng bộ được danh sách bài online:", error);
    catalogSyncWarning = "Chưa đồng bộ được bài online; đang dùng dữ liệu đã lưu.";
    return null;
  }
}

async function loadTaskData() {
  const cachedTasks = await readCachedPublishedTasks();
  // VI: Bản đã đồng bộ là ảnh chụp của Supabase, gồm cả các bài đã xóa.
  // Không ghép thêm JSON đóng gói vì như vậy bài đã xóa sẽ xuất hiện lại offline.
  // EN: Keep the cached server snapshot authoritative over bundled fallback.
  if (cachedTasks) return cachedTasks;
  const dataFiles = await bundledPartUrls(import.meta.url);
  const coreFiles = dataFiles.filter((url) => Number(url.pathname.match(/part(\d+)\.json$/)?.[1]) <= 4);
  const deferredFiles = dataFiles.filter((url) => !coreFiles.includes(url));
  const readPart = async (url) => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 9000);
      let response;
      try { response = await fetch(url, { cache: "no-cache", signal: controller.signal }); }
      finally { window.clearTimeout(timeout); }
      if (!response.ok)
        throw new Error(`Không tải được ${url.pathname} (HTTP ${response.status}).`);
      const rows = await response.json();
      if (!Array.isArray(rows))
        throw new Error(`${url.pathname} không chứa một danh sách bài tập hợp lệ.`);
      return rows;
  };
  const coreResults = await Promise.allSettled((coreFiles.length ? coreFiles : dataFiles.slice(0, 1)).map(readPart));
  const parts = coreResults.filter((result) => result.status === "fulfilled").map((result) => result.value);
  if (!parts.length) throw coreResults.find((result) => result.status === "rejected")?.reason || new Error("Không tải được dữ liệu bài tập.");
  if (parts.length !== (coreFiles.length || 1)) catalogSyncWarning = "Một số phần bài đang tải chậm; các phần còn lại vẫn dùng được.";
  pendingBundledTaskParts = Promise.allSettled(deferredFiles.map(readPart))
    .then((results) => results.filter((result) => result.status === "fulfilled").flatMap((result) => result.value))
    .catch((error) => {
      console.warn("Chưa tải được các phần bài tập bổ sung:", error);
      catalogSyncWarning = "Một số phần bài tập đang tải chậm; hãy thử tải lại trang nếu chưa xuất hiện.";
      return [];
    });

  const tasks = parts.flat();
  const ids = new Set();
  for (const task of tasks) {
    if (!Number.isInteger(task.id) || ids.has(task.id)) {
      throw new Error(`ID bài tập không hợp lệ hoặc bị trùng: ${task.id}`);
    }
    if (!hasValidTestCount(task.tests)) {
      throw new Error(`Bài ${task.id} phải có từ ${MIN_TESTS} đến ${MAX_TESTS} test case.`);
    }
    ids.add(task.id);
  }
  return tasks.sort((a, b) => a.id - b.id);
}

async function refreshPublishedTasksInBackground() {
  const tasks = await loadTasksFromSupabase();
  if (!tasks?.length) return;
  const selectedId = current?.id;
  TASKS = tasks;
  current = TASKS.find((task) => task.id === selectedId) || TASKS[0];
  visible = TASKS;
  document.getElementById("siteTaskSummary").textContent = `${TASKS.length} bài luyện tập C++ · Từ cơ bản đến nâng cao`;
  renderList();
  updateProgress();
  selectTask(current.id);
}

let TASKS;
try {
  TASKS = await loadTaskData();
  document.title = `Ôn luyện C++ | Bài tập từ cơ bản đến nâng cao`;
  document.getElementById("siteTaskSummary").textContent =
    `${TASKS.length} bài luyện tập C++ · Từ cơ bản đến nâng cao`;
  if (catalogSyncWarning) {
    const syncStatus = document.getElementById("taskSyncStatus");
    syncStatus.textContent = catalogSyncWarning;
    syncStatus.hidden = false;
  }
  if (!TASKS.length) console.warn("Website chưa tải được bài tập nào.");
} catch (error) {
  console.error("Không thể khởi tạo website TLU C++:", error);
  const list = document.getElementById("tasklist");
  if (list) list.innerHTML = `<div class="task-load-error" role="alert"><strong>Chưa tải được danh sách bài.</strong><p>Kiểm tra mạng rồi thử lại. Điều hướng và tài khoản vẫn dùng được.</p><button type="button" id="retryTaskLoad">Thử tải lại</button><small>${String(error.message || "").replace(/[<>&"']/g, "")}</small></div>`;
  document.getElementById("retryTaskLoad")?.addEventListener("click", () => location.reload());
  throw error;
}
let TOTAL_TEST_CASES = TASKS.reduce((sum, task) => sum + task.tests.length, 0);
function currentBestScore(taskId) {
  const task = TASKS.find((item) => Number(item.id) === Number(taskId));
  const score = bestScores?.[taskId];
  if (!task || score === undefined || score === null) return undefined;
  const points = Number(score);
  if (!Number.isFinite(points) || points < 0 || points > 10) return undefined;
  const meta = bestScoreMeta?.[taskId];
  const version = testSetVersion(task);
  if (
    meta?.testSetVersion === version &&
    Number(meta.testsTotal) === task.tests.length
  ) {
    return points;
  }

  // Keep a saved best score visible when tests are revised. The migration
  // archives the old test metadata, then rebases the same points to this set.
  archiveScoreVersion(taskId, points, meta || {});
  const oldTotal = Number.isInteger(meta?.testsTotal) && meta.testsTotal > 0
    ? Number(meta.testsTotal)
    : LEGACY_TEST_COUNT;
  const oldPassed = Number.isInteger(meta?.testsPassed)
    ? Number(meta.testsPassed)
    : Math.round((points * oldTotal) / 10);
  bestScoreMeta[taskId] = {
    testsPassed: Math.max(0, Math.min(task.tests.length, Math.round((oldPassed * task.tests.length) / oldTotal))),
    testsTotal: task.tests.length,
    testSetVersion: version,
    points,
  };
  persistScores();
  return points;
}
const starter =
  "#include <iostream>\nusing namespace std;\n\nint main() {\n    // Viet code cua ban o day\n    return 0;\n}\n";

function renderCodeHighlight() {
  renderCppHighlight($("code").value, $("codeHighlight")?.querySelector("code"));
}
function renderCppSourceViews(root = document) {
  root.querySelectorAll("[data-cpp-source]").forEach((code) => {
    renderCppHighlight(code.textContent || "", code);
  });
}
let current = TASKS[0],
  filter = "all",
  visible = TASKS;
const $ = (id) => document.getElementById(id);
const SCORE_KEY = "tlu_cpp_best_scores_v1";
const SCORE_META_KEY = "tlu_cpp_best_score_meta_v1";
const GUEST_SCORE_OWNER_KEY = "tlu_cpp_guest_score_migration_owner_v1";
const SCORE_HISTORY_KEY = "tlu_cpp_best_score_history_v1";
const LEGACY_LATEST_SCORE_KEY = "tlu_cpp_latest_scores_v1";
const PROBLEM_RESET_VERSION_KEY = "tlu_cpp_problem_reset_versions_v1";
const SCORE_PRECISION = 1_000_000;
const TEST_TIME_LIMIT_MS = 1000;
const activeRuns = new Map(); // Một bài có tối đa một phiên chạy tại một thời điểm.
const runViews = new Map(); // Kết quả/progress được giữ riêng theo ID bài khi chuyển bài.
let nextRunId = 1;

function readStore(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "{}") || {};
  } catch (_) {
    return {};
  }
}
function archiveScoreVersion(taskId, score, meta = {}) {
  if (!Number.isFinite(Number(score))) return;
  const history = readStore(SCORE_HISTORY_KEY);
  const version = String(meta.testSetVersion || `legacy-${meta.testsTotal || LEGACY_TEST_COUNT}`);
  const key = `${taskId}:${version}`;
  if (history[key]) return;
  history[key] = {
    taskId: Number(taskId),
    points: Number(score),
    testsPassed: Number.isInteger(meta.testsPassed) ? meta.testsPassed : null,
    testsTotal: Number.isInteger(meta.testsTotal) ? meta.testsTotal : LEGACY_TEST_COUNT,
    testSetVersion: version,
    archivedAt: new Date().toISOString(),
  };
  try { localStorage.setItem(SCORE_HISTORY_KEY, JSON.stringify(history)); } catch (_) {}
}
let bestScores = readStore(SCORE_KEY);
let bestScoreMeta = readStore(SCORE_META_KEY);
const oldLatestScores = readStore(LEGACY_LATEST_SCORE_KEY);
// Nâng dữ liệu cũ lên điểm cao nhất, tuyệt đối không hạ điểm đã đạt.
for (const [id, value] of Object.entries(oldLatestScores)) {
  const score = Number(value);
  if (
    Number.isFinite(score) &&
    (bestScores[id] === undefined || score > Number(bestScores[id]))
  ) {
    bestScores[id] = score;
  }
}
let accountSuspended = false;
let confirmSignupOnce = false;
let currentUser = null; // Người dùng Supabase đang đăng nhập (null = khách)
const checkSiteAnnouncements = initSiteAnnouncements(() => supabase, () => currentUser);
function scoreStoreKey(key, userId = currentUser?.id) {
  return userId ? `${key}:${userId}` : key;
}
async function reconcileProblemLearningResets() {
  if (!supabase || !navigator.onLine) return false;
  const { data, error } = await supabase.rpc("get_problem_learning_reset_versions");
  if (error) {
    console.warn("Could not sync task reset markers:", error.message);
    return false;
  }
  const seen = readStore(PROBLEM_RESET_VERSION_KEY);
  let changed = false;
  for (const marker of data || []) {
    const id = String(marker.problem_id);
    const version = Number(marker.reset_version);
    if (!Number.isInteger(version) || version <= Number(seen[id] || 0)) continue;
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key === SCORE_KEY || key === SCORE_META_KEY || key === LEGACY_LATEST_SCORE_KEY ||
          key?.startsWith(`${SCORE_KEY}:`) || key?.startsWith(`${SCORE_META_KEY}:`)) keys.push(key);
    }
    for (const key of keys) {
      const values = readStore(key);
      if (Object.hasOwn(values, id)) {
        delete values[id];
        localStorage.setItem(key, JSON.stringify(values));
      }
    }
    localStorage.removeItem(`cppcode_v2_${id}`);
    const history = readStore(SCORE_HISTORY_KEY);
    for (const key of Object.keys(history)) {
      if (key.startsWith(`${id}:`)) delete history[key];
    }
    localStorage.setItem(SCORE_HISTORY_KEY, JSON.stringify(history));
    seen[id] = version;
    changed = true;
  }
  if (changed) {
    localStorage.setItem(PROBLEM_RESET_VERSION_KEY, JSON.stringify(seen));
    bestScores = readStore(scoreStoreKey(SCORE_KEY));
    bestScoreMeta = readStore(scoreStoreKey(SCORE_META_KEY));
  }
  return changed;
}
window.addEventListener("problem-learning-reset", () => {
  void reconcileProblemLearningResets().then((changed) => {
    if (changed) refreshScoreViews();
  });
});
function persistScores() {
  try {
    localStorage.setItem(scoreStoreKey(SCORE_KEY), JSON.stringify(bestScores));
    localStorage.setItem(scoreStoreKey(SCORE_META_KEY), JSON.stringify(bestScoreMeta));
    return true;
  } catch (_) {
    console.warn("Không thể lưu điểm vào localStorage.");
    return false;
  }
}
persistScores();

// ===== Supabase: đăng nhập, lưu điểm lên tài khoản, bảng xếp hạng =====
// Quy ước lưu: best_score giữ số test đúng; best_points lưu điểm theo tổng test của bài.
const SUPABASE_URL = "https://dcdvtpmihijzbieblwfa.supabase.co";
const SUPABASE_KEY = "sb_publishable_Fb40gK9h5FiDyJSI05nH0g_TmXM8W-m";
let supabase = null;
let supabaseInitPromise = null;
async function initializeSupabase() {
  if (!navigator.onLine) { renderAuthBox(); return null; }
  if (supabase) return supabase;
  if (supabaseInitPromise) return supabaseInitPromise;
  supabaseInitPromise = (async () => {
    try {
      const sdk = await Promise.race([import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm"), new Promise((_, reject) => setTimeout(() => reject(new Error("Supabase SDK load timeout")), 3500))]);
      if (supabase) return supabase;
      supabase = sdk.createClient(SUPABASE_URL, SUPABASE_KEY);
      supabase.auth.onAuthStateChange((_event, session) => setTimeout(() => handleSession(session), 0));
      renderAuthBox();
      return supabase;
    } catch (error) {
      console.warn("Supabase SDK unavailable; local practice remains available.", error);
      renderAuthBox();
      return null;
    }
  })();
  try { return await supabaseInitPromise; }
  finally { supabaseInitPromise = null; }
}void reconcileProblemLearningResets().then((changed) => {
  if (changed && !currentUser) refreshScoreViews();
});
let profileName = "";
let profileAvatarPath = "";
let myRole = "student"; // [ADMIN] student | admin | super_admin (lấy từ Supabase RPC get_my_role)
let loadedForUser = null;
let authMode = "login";
// VI: Chỉ ghi nhớ email đang chờ xác nhận trong tab; không đặt thời gian khóa gửi lại. EN: Remember a pending email in this tab without imposing a resend cooldown.
let pendingSignupEmail = "";
try { pendingSignupEmail = localStorage.getItem("onluyencpp_pending_signup_email") || ""; } catch (_) {}
let lbRequestId = 0;

function userDisplayName() {
  if (!currentUser) return "";
  const meta = currentUser.user_metadata || {};
  return (
    profileName ||
    meta.display_name ||
    meta.full_name ||
    (currentUser.email || "").split("@")[0] ||
    "Người dùng"
  );
}
function refreshScoreViews() {
  updateProgress();
  updateScore();
  renderList();
}
function setProgressSyncStatus(message = "") {
  const status = $("progressSyncStatus");
  if (!status) return;
  status.textContent = message;
  status.hidden = !message;
}
// VI: Thanh điều hướng gom chức năng vào một menu gọn. EN: Group navigation actions in one compact menu.
function renderAuthBox() {
  const box = $("authBox");
  if (!box) return;
  if (!supabase) {
    box.innerHTML = '<span class="auth-note">Dịch vụ đăng nhập chưa tải được</span>';
    return;
  }
  const isAdm = myRole === "admin" || myRole === "super_admin";
  const roleText = { student: "Học viên", admin: "Admin", super_admin: "Super Admin" }[myRole] || myRole;
  const accountHead = currentUser
    ? `<div class="ud-head"><b>${escapeHTML(userDisplayName())}</b><small>${escapeHTML(currentUser.email || "")}</small><span class="ud-role ${isAdm ? "adm" : ""}">${roleText}</span></div>`
    : '<div class="ud-head"><b>Điều hướng</b><small>Chọn khu vực bạn muốn mở</small></div>';
  const accountActions = currentUser
    ? `<button data-auth="profile" type="button">◉ Hồ sơ cá nhân</button>${isAdm ? '<button data-auth="admin" type="button">⚙ Khu vực quản trị</button>' : ""}<button data-auth="rename" type="button">✎ Đổi tên hiển thị</button><button data-auth="logout" type="button" class="danger">⎋ Đăng xuất</button>`
    : '<button data-auth="login" type="button" class="menu-login">Đăng nhập / Đăng ký</button>';
  const avatar = currentUser
    ? `<span class="user-initial user-avatar" aria-hidden="true">${avatarImageMarkup(profileAvatarPath, userDisplayName())}</span>`
    : '<span class="menu-trigger-icon" aria-hidden="true">☰</span>';
  const accountLabel = currentUser ? escapeHTML(userDisplayName())
    : '<span class="auth-full-label">Đăng nhập / Đăng ký</span><span class="auth-mobile-label">Đăng nhập</span>';
  box.innerHTML = `<div class="user-menu ${currentUser ? "" : "unauthenticated"}"><button class="user-chip menu-trigger" data-auth="menu" type="button" aria-label="${currentUser ? `Tài khoản ${escapeHTML(userDisplayName())}` : "Mở menu đăng nhập và điều hướng"}" aria-haspopup="true" aria-expanded="false">${avatar}<span class="user-label ${currentUser ? "" : "auth-label"}">${accountLabel}</span><span class="menu-chevron" aria-hidden="true">▾</span></button><div class="user-dropdown" hidden>${accountHead}<div class="menu-section-label">Học tập & cộng đồng</div><button data-auth="streak" type="button">🔥 Chuỗi ngày học</button><button data-auth="rank" type="button">🏆 Bảng xếp hạng</button><button data-auth="members" type="button">♙ Thành viên</button><button data-auth="submissions" type="button">▤ Bài đã nộp</button><button data-auth="info" type="button">ⓘ Thông tin</button>${currentUser ? '<div class="menu-separator"></div>' : ""}${accountActions}</div></div>`;
  bindAvatarImages(box);
}
// ----- Cửa sổ (overlay) -----
function openOverlay(id) {
  $(id).hidden = false;
  document.body.classList.add("no-scroll");
}
function closeOverlay(id) {
  $(id).hidden = true;
  if (!document.querySelector(".auth-overlay:not([hidden])"))
    document.body.classList.remove("no-scroll");
}
function setAuthMsg(msg, cls) {
  const el = $("authMsg");
  el.textContent = msg;
  el.className = "auth-msg " + (cls || "");
}
function updateResendConfirmationVisibility() {
  const button = $("resendConfirmation");
  if (!button) return;
  button.hidden = !(
    authMode === "login" &&
    pendingSignupEmail &&
    $("authEmail").value.trim().toLowerCase() === pendingSignupEmail.toLowerCase()
  );
}
function updateConfirmSignupVisibility() {
  const button = $("confirmCreateAccount");
  if (button) button.hidden = !(authMode === "register" && $("authEmail").value.trim() && $("authPassword").value);
}
function rememberPendingSignup(email) {
  pendingSignupEmail = email.trim();
  try { localStorage.setItem("onluyencpp_pending_signup_email", pendingSignupEmail); } catch (_) {}
  updateResendConfirmationVisibility();
}
function clearPendingSignup(email = "") {
  if (email && pendingSignupEmail.toLowerCase() !== email.trim().toLowerCase()) return;
  pendingSignupEmail = "";
  try { localStorage.removeItem("onluyencpp_pending_signup_email"); } catch (_) {}
  updateResendConfirmationVisibility();
}
function setAuthMode(mode) {
  authMode = mode;
  $("tabLogin").classList.toggle("active", mode === "login");
  $("tabRegister").classList.toggle("active", mode === "register");
  $("nameRow").hidden = mode !== "register";
  $("authSubmit").textContent =
    mode === "login" ? "Đăng nhập" : "Tạo tài khoản";
  $("authPassword").autocomplete =
    mode === "login" ? "current-password" : "new-password";
  $("authPasswordLabel").textContent =
    mode === "login"
      ? "Mật khẩu"
      : "Mật khẩu mới (12–64 ký tự, hoa/thường, số và ký tự đặc biệt)";
  setAuthMsg("");
  updateResendConfirmationVisibility();
  updateConfirmSignupVisibility();
}
function translateAuthError(err) {
  const m = String(err?.message || err || "");
  if (/invalid login credentials/i.test(m)) return "Sai email hoặc mật khẩu.";
  if (/already registered/i.test(m)) return "Email này đã được đăng ký.";
  if (/email not confirmed/i.test(m))
    return "Email chưa được xác nhận. Hãy mở email và bấm liên kết xác nhận.";
  if (/password should be at least/i.test(m))
    return "Mật khẩu chưa đạt độ dài tối thiểu trong cài đặt Supabase Auth.";
  if (/rate limit/i.test(m))
    return "Thử quá nhiều lần, hãy chờ một lúc rồi thử lại.";
  return m || "Có lỗi xảy ra, hãy thử lại.";
}
function isStrongPassword(password) {
  return (
    password.length >= 12 &&
    password.length <= 64 &&
    /\p{Ll}/u.test(password) &&
    /\p{Lu}/u.test(password) &&
    /\p{N}/u.test(password) &&
    /[\p{P}\p{S}]/u.test(password) &&
    !/\s/u.test(password)
  );
}

// ----- Đồng bộ điểm -----
// VI: Lấy đơn vị điểm theo độ chính xác của cột Supabase. EN: Use the precision of the Supabase score column.
function maxScoreUnits(passed, total) {
  return Math.floor((passed * 10 * SCORE_PRECISION) / total);
}

// Điểm khách (localStorage) được đẩy lên tài khoản khi đăng nhập;
// máy chủ chỉ giữ điểm cao hơn nên không thể làm tụt điểm.
async function syncGuestScoresUp() {
  if (accountSuspended) return;
  const userId = currentUser?.id;
  if (!userId) return;
  let owner = "";
  try { owner = localStorage.getItem(GUEST_SCORE_OWNER_KEY) || ""; } catch (_) {}
  // VI: Không chuyển phần điểm khách đang chờ của tài khoản trước sang tài khoản khác.
  // EN: Never migrate one account's failed guest-score transfer into another account.
  if (owner && owner !== userId) return;
  if (!owner) {
    owner = userId;
    try { localStorage.setItem(GUEST_SCORE_OWNER_KEY, owner); } catch (_) {}
  }
  const scores = readStore(SCORE_KEY);
  const metadata = readStore(SCORE_META_KEY);
  const pendingScores = {};
  const pendingMetadata = {};
  for (const [id, value] of Object.entries(scores)) {
    if (!/^\d{1,4}$/.test(id)) {
      pendingScores[id] = value;
      if (metadata[id]) pendingMetadata[id] = metadata[id];
      continue;
    }
    const meta = metadata[id];
    const task = TASKS.find((item) => String(item.id) === String(id));
    const versionMismatch = task?.test_set_version
      ? meta?.testSetVersion !== String(task.test_set_version) || meta?.testsTotal !== task.tests.length
      : meta?.testSetVersion
        ? meta.testSetVersion !== testSetVersion(task) || meta.testsTotal !== task.tests.length
        : task?.tests.length !== LEGACY_TEST_COUNT;
    if (!task || versionMismatch) {
      pendingScores[id] = value;
      if (meta) pendingMetadata[id] = meta;
      if (task) archiveScoreVersion(id, value, meta || {});
      continue;
    }
    const tests = Number.isInteger(meta?.testsPassed)
      ? meta.testsPassed
      : Math.round(Number(value) * 2);
    const points = Number.isFinite(Number(meta?.points)) ? Number(meta.points) : Number(value);
    if (tests < 0 || tests > task.tests.length || points < 0 || points > 10) {
      pendingScores[id] = value;
      if (meta) pendingMetadata[id] = meta;
      continue;
    }
    let { error } = await supabase.rpc("submit_score_with_presentation", {
      p_problem_id: Number(id),
      p_tests_passed: tests,
      p_tests_total: task.tests.length,
      p_test_set_version: testSetVersion(task),
      p_points: Math.min(points, maxScoreUnits(tests, task.tests.length) / SCORE_PRECISION),
    });
    if (error?.code === "PGRST202" && task.tests.length === LEGACY_TEST_COUNT) {
      ({ error } = await supabase.rpc("submit_score_with_presentation", {
        p_problem_id: Number(id), p_tests_passed: tests, p_points: points,
      }));
    }
    if (error) {
      console.warn("Không đồng bộ được điểm khách:", error.message);
      return;
    }
  }
  try {
    if (Object.keys(pendingScores).length) {
      localStorage.setItem(SCORE_KEY, JSON.stringify(pendingScores));
      localStorage.setItem(SCORE_META_KEY, JSON.stringify(pendingMetadata));
    } else {
      localStorage.removeItem(SCORE_KEY);
      localStorage.removeItem(SCORE_META_KEY);
      localStorage.removeItem(LEGACY_LATEST_SCORE_KEY);
      localStorage.removeItem(GUEST_SCORE_OWNER_KEY);
    }
  } catch (_) {}
}

// VI: Đẩy các điểm đã lưu riêng trong tài khoản nhưng chưa lên mạng.
// EN: Upload this account's locally saved scores that have not reached Supabase.
async function syncAccountScoresUp(userId = currentUser?.id) {
  if (!userId || !supabase || !navigator.onLine || accountSuspended || currentUser?.id !== userId) return false;
  await reconcileProblemLearningResets();
  if (currentUser?.id !== userId) return false;
  let legacySchema = false;
  let { data: remoteRows, error } = await supabase
    .from("user_progress")
    .select("problem_id,best_score,best_points,best_tests_total,test_set_version");
  if (error && /best_points|column/i.test(error.message || "")) {
    legacySchema = true;
    ({ data: remoteRows, error } = await supabase.from("user_progress").select("problem_id,best_score"));
  }
  if (error || currentUser?.id !== userId) {
    if (error) console.warn("Không kiểm tra được điểm cần đồng bộ:", error.message);
    return false;
  }

  const remote = new Map((remoteRows || []).map((row) => [String(row.problem_id), row]));
  const scores = readStore(scoreStoreKey(SCORE_KEY, userId));
  const metadata = readStore(scoreStoreKey(SCORE_META_KEY, userId));
  let changed = false;
  let complete = true;
  for (const [id, rawScore] of Object.entries(scores)) {
    if (currentUser?.id !== userId || !navigator.onLine) return false;
    if (!/^\d{1,4}$/.test(id)) continue;
    const task = TASKS.find((item) => String(item.id) === id);
    if (!task) continue;
    const meta = metadata[id] || {};
    const version = testSetVersion(task);
    const versionMismatch = task.test_set_version
      ? meta.testSetVersion !== String(task.test_set_version) || Number(meta.testsTotal) !== task.tests.length
      : meta.testSetVersion
        ? meta.testSetVersion !== version || Number(meta.testsTotal) !== task.tests.length
        : task.tests.length !== LEGACY_TEST_COUNT;
    if (versionMismatch) {
      complete = false;
      continue;
    }

    const points = Number(meta.points ?? rawScore);
    if (!Number.isFinite(points) || points <= 0 || points > 10) continue;
    const row = remote.get(id);
    const remoteTotal = Number(row?.best_tests_total || (legacySchema ? LEGACY_TEST_COUNT : task.tests.length));
    const remotePoints = row
      ? Number(row.best_points ?? ((Number(row.best_score) * 10) / remoteTotal))
      : -1;
    if (remotePoints >= points) continue;

    const passed = Number.isInteger(meta.testsPassed)
      ? meta.testsPassed
      : Math.round((points * task.tests.length) / 10);
    if (passed < 0 || passed > task.tests.length) continue;
    let { data, error: saveError } = await supabase.rpc("submit_score_with_presentation", {
      p_problem_id: Number(id),
      p_tests_passed: passed,
      p_tests_total: task.tests.length,
      p_test_set_version: version,
      p_points: Math.min(points, maxScoreUnits(passed, task.tests.length) / SCORE_PRECISION),
    });
    if (saveError?.code === "PGRST202" && task.tests.length === LEGACY_TEST_COUNT) {
      ({ data, error: saveError } = await supabase.rpc("submit_score_with_presentation", {
        p_problem_id: Number(id), p_tests_passed: passed, p_points: points,
      }));
    }
    if (currentUser?.id !== userId) return false;
    if (saveError) {
      console.warn(`Chưa đồng bộ được điểm bài ${id}:`, saveError.message);
      complete = false;
      continue;
    }
    scores[id] = Math.max(Number(scores[id] || 0), Number(data) || 0);
    metadata[id] = { ...meta, points: scores[id] };
    changed = true;
  }
  if (changed && currentUser?.id === userId) {
    try {
      localStorage.setItem(scoreStoreKey(SCORE_KEY, userId), JSON.stringify(scores));
      localStorage.setItem(scoreStoreKey(SCORE_META_KEY, userId), JSON.stringify(metadata));
    } catch (_) {}
  }
  return complete;
}

async function loadCloudProgress() {
  const userId = currentUser?.id;
  if (!userId) return;
  await reconcileProblemLearningResets();
  let legacySchema = false;
  let { data, error } = await supabase
    .from("user_progress")
    .select("problem_id,best_score,best_points,best_tests_total,test_set_version");
  if (error && /best_points|column/i.test(error.message || "")) {
    legacySchema = true;
    ({ data, error } = await supabase
      .from("user_progress")
      .select("problem_id,best_score"));
  }
  if (currentUser?.id !== userId) return;
  if (error) {
    console.warn("Không tải được điểm từ tài khoản:", error.message);
    setProgressSyncStatus("Chưa tải được tiến độ từ Supabase; đang giữ dữ liệu đã lưu trên thiết bị.");
    return;
  }
  setProgressSyncStatus();
  const cloud = readStore(scoreStoreKey(SCORE_KEY, userId));
  const cloudMeta = readStore(scoreStoreKey(SCORE_META_KEY, userId));
  for (const row of data || []) {
    const task = TASKS.find((item) => String(item.id) === String(row.problem_id));
    if (!task) continue;
    const rowVersion = row.test_set_version || null;
    const rowTotal = Number(row.best_tests_total || (legacySchema ? LEGACY_TEST_COUNT : task.tests.length));
    const expectedVersion = testSetVersion(task);
    const points = Number(row.best_points ?? ((Number(row.best_score) * 10) / rowTotal));
    if (!Number.isFinite(points) || points < 0 || points > 10) continue;
    if ((rowVersion && rowVersion !== expectedVersion) || rowTotal !== task.tests.length) {
      archiveScoreVersion(row.problem_id, points, {
        testsPassed: Number(row.best_score), testsTotal: rowTotal, testSetVersion: rowVersion,
      });
    }
    const localPoints = Number(cloud[row.problem_id] ?? -1);
    const localMeta = cloudMeta[row.problem_id];
    const keepLocal = localPoints > points;
    const bestPoints = Math.max(points, localPoints);
    if (keepLocal && (
      localMeta?.testSetVersion !== expectedVersion ||
      Number(localMeta?.testsTotal) !== task.tests.length
    )) {
      archiveScoreVersion(row.problem_id, localPoints, localMeta || {});
    }
    cloud[row.problem_id] = bestPoints;
    const sourceTotal = keepLocal && Number.isInteger(localMeta?.testsTotal) && localMeta.testsTotal > 0
      ? localMeta.testsTotal
      : rowTotal;
    const oldPassed = keepLocal ? localMeta?.testsPassed : Number(row.best_score);
    const scaledPassed = Number.isInteger(oldPassed) && sourceTotal > 0
      ? Math.round((oldPassed * task.tests.length) / sourceTotal)
      : Math.round((bestPoints * task.tests.length) / 10);
    cloudMeta[row.problem_id] = {
      testsPassed: Math.max(0, Math.min(task.tests.length, scaledPassed)),
      testsTotal: task.tests.length,
      testSetVersion: expectedVersion,
      points: bestPoints,
    };
  }
  bestScores = cloud;
  bestScoreMeta = cloudMeta;
  persistScores();
}
let progressRefreshInFlight = null;
async function refreshAccountProgress() {
  const userId = currentUser?.id;
  if (!userId || !supabase || !navigator.onLine || accountSuspended) return;
  if (progressRefreshInFlight) return progressRefreshInFlight;
  progressRefreshInFlight = (async () => {
    const syncComplete = await syncAccountScoresUp(userId);
    if (currentUser?.id !== userId) return;
    await loadCloudProgress();
    if (currentUser?.id === userId) {
      if (!syncComplete) setProgressSyncStatus("Một số điểm chưa đồng bộ được; sẽ tự thử lại khi có mạng hoặc mở lại trang.");
      refreshScoreViews();
    }
  })();
  try { await progressRefreshInFlight; }
  finally { progressRefreshInFlight = null; }
}
async function loadProfileName() {
  let { data, error } = await supabase
    .from("profiles")
    .select("display_name,avatar_path")
    .eq("user_id", currentUser.id)
    .maybeSingle();
  if (error) {
    ({ data } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", currentUser.id)
      .maybeSingle());
  }
  profileName = (data?.display_name || "").trim();
  profileAvatarPath = (data?.avatar_path || "").trim();
}
// [ADMIN] Lấy quyền của tài khoản; nút Quản trị chỉ là tiện ích giao diện,
// còn quyền thật được Supabase (RLS/RPC) kiểm tra lại ở mọi thao tác.
async function loadMyRole() {
  try {
    const { data, error } = await supabase.rpc("get_my_role");
    if (error)
      console.warn("get_my_role lỗi (đã chạy admin.sql chưa?):", error.message);
    myRole = data || "student";
  } catch (_) {
    myRole = "student";
  }
}
async function openAdminPanel() {
  try {
    const mod = await import("./admin.js?v=2");
    mod.openAdmin({
      supabase,
      user: currentUser,
      role: myRole,
      tasks: TASKS,
      onClose: (changed) => {
        if (changed) location.reload(); // nạp lại để thấy bài/test vừa chỉnh sửa
      },
    });
  } catch (error) {
    alert("Không mở được khu vực quản trị: " + error.message);
  }
}
let suspensionDismissed = false;
function renderSuspensionNotice() {
  const notice = $("suspensionNotice");
  if (notice) notice.hidden = !accountSuspended || suspensionDismissed;
}
async function refreshSuspensionStatus() {
  if (!supabase || !currentUser || !navigator.onLine) return accountSuspended;
  try {
    const { data: lockData, error: lockError } = await supabase.rpc("get_my_lock_status");
    if (!lockError) accountSuspended = Boolean(lockData);
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      if (/user_banned|banned/i.test(`${error.code || ""} ${error.message || ""}`)) accountSuspended = true;
    } else {
      const until = data.user?.banned_until;
      accountSuspended = accountSuspended || Boolean(until && new Date(until).getTime() > Date.now());
    }
    if (!accountSuspended) suspensionDismissed = false;
    renderSuspensionNotice();
  } catch (_) {}
  return accountSuspended;
}
$("dismissSuspensionNotice")?.addEventListener("click", () => { suspensionDismissed = true; renderSuspensionNotice(); });
window.addEventListener("online", async () => {
  await Promise.all([initializeSupabase(), refreshPublishedTasksInBackground()]);
  await refreshSuspensionStatus();
  await refreshAccountProgress();
});
window.addEventListener("focus", () => { void refreshAccountProgress(); });
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    void refreshSuspensionStatus();
    void refreshAccountProgress();
  }
});
setInterval(async () => {
  if (document.hidden) return;
  await refreshSuspensionStatus();
}, 30000);
async function handleSession(session) {
  const user = session?.user || null;
  if (!user) {
    if (loadedForUser) {
      // Vừa đăng xuất: quay về điểm của khách trên thiết bị này
      currentUser = null;
      accountSuspended = false;
      suspensionDismissed = false;
      renderSuspensionNotice();
      loadedForUser = null;
      profileName = "";
      profileAvatarPath = "";
      myRole = "student";
      bestScores = readStore(SCORE_KEY);
      bestScoreMeta = readStore(SCORE_META_KEY);
      setStreakSession(null);
      refreshScoreViews();
    }
    renderAuthBox();
    void checkSiteAnnouncements();
    return;
  }
  currentUser = user;
  if (loadedForUser !== user.id) setStreakSession(user);
  await refreshSuspensionStatus();
  clearPendingSignup(user.email || "");
  closeOverlay("authOverlay");
  if (loadedForUser === user.id) {
    renderAuthBox();
    void checkSiteAnnouncements();
    return;
  }
  bestScores = readStore(scoreStoreKey(SCORE_KEY, user.id));
  bestScoreMeta = readStore(scoreStoreKey(SCORE_META_KEY, user.id));
  loadedForUser = user.id;
  renderAuthBox();
  await syncGuestScoresUp();
  const accountScoresSynced = await syncAccountScoresUp(user.id);
  await loadCloudProgress();
  if (!accountScoresSynced && !accountSuspended) setProgressSyncStatus("Một số điểm chưa đồng bộ được; sẽ tự thử lại khi có mạng hoặc mở lại trang.");
  await loadProfileName();
  await loadMyRole();
  renderAuthBox();
  refreshScoreViews();
  void checkSiteAnnouncements();
}
// Gọi sau khi chấm toàn bộ test của bài. Trả về dòng ghi chú để hiện trong kết quả.
async function syncScoreAfterGrading(taskId, passed, points, testsTotal, version) {
  // VI: Tai khoan bi dinh chi chi duoc luyen tap; khong gui diem len Supabase. EN: Keep suspended-account score writes out of Supabase.
  if (accountSuspended) return "\nTài khoản đang bị đình chỉ; điểm không được đồng bộ.";
  if (!navigator.onLine)
    return "\nKhông có Internet; điểm đã lưu trên thiết bị này.";
  if (!supabase) return "";
  if (!currentUser)
    return "\nĐăng nhập để lưu điểm lên tài khoản và vào bảng xếp hạng.";
  const userId = currentUser.id;
  const local = bestScoreMeta[taskId];
  if (local?.testSetVersion === version && local.testsTotal === testsTotal &&
      Number.isInteger(local.testsPassed) && local.points > points) {
    passed = local.testsPassed;
    points = local.points;
  }
  let { data, error } = await supabase.rpc("submit_score_with_presentation", {
    p_problem_id: Number(taskId),
    p_tests_passed: passed,
    p_tests_total: testsTotal,
    p_test_set_version: version,
    p_points: Math.min(points, maxScoreUnits(passed, testsTotal) / SCORE_PRECISION),
  });
  if (error?.code === "PGRST202" && testsTotal === LEGACY_TEST_COUNT) {
    ({ data, error } = await supabase.rpc("submit_score_with_presentation", {
      p_problem_id: Number(taskId), p_tests_passed: passed, p_points: points,
    }));
  }
  if (currentUser?.id !== userId) return "";
  if (error) {
    const saved = persistScores();
    return `\nChưa đồng bộ được điểm: ${error.message}. ${saved ? "Điểm đã được giữ trên thiết bị này." : "Điểm hiện chỉ có trong phiên này."}`;
  }
  bestScores[taskId] = Math.max(Number(bestScores[taskId] ?? 0), Number(data));
  persistScores();
  return "\nĐã lưu điểm lên tài khoản.";
}

async function saveCodeSubmission(taskId, code, passed = null, testNo = null, outcome = "partial", runMode = "batch", testsTotal = null, version = null) {
  if (!currentUser) return "";
  if (!supabase || !navigator.onLine) return "\nLịch sử bài nộp cần kết nối Internet để lưu mã nguồn.";
  try {
    let { data, error } = await supabase.rpc("save_code_submission", {
      p_problem_id: Number(taskId),
      p_source_code: code,
      p_tests_passed: passed,
      p_tests_total: testsTotal,
      p_test_set_version: version,
      p_test_no: testNo,
      p_outcome: outcome,
      p_run_mode: runMode,
    });
    if (error?.code === "PGRST202" && testsTotal === LEGACY_TEST_COUNT && (testNo == null || testNo <= LEGACY_TEST_COUNT)) {
      ({ data, error } = await supabase.rpc("save_code_submission", {
        p_problem_id: Number(taskId), p_source_code: code, p_tests_passed: passed,
        p_test_no: testNo, p_outcome: outcome, p_run_mode: runMode,
      }));
    }
    if (error) throw error;
    return data == null ? "" : "\nĐã lưu mã nguồn vào lịch sử bài nộp.";
  } catch (error) {
    console.warn("Không lưu được lịch sử code:", error.message || error);
    return "\nChưa lưu được mã nguồn vào lịch sử bài nộp.";
  }
}
// VI: Chỉ lưu lượt chạy khi bài chưa đạt điểm tối đa trước lúc bắt đầu; không lưu lượt hủy.
// EN: Store attempts only if the task was not already perfect when the run started; never store cancellations.
async function saveRunSubmission(job, passed = null, testNo = null, outcome = "partial") {
  if (
    !job ||
    job.kind === "single" ||
    job.maxScoreAtStart ||
    job.controller?.signal.aborted ||
    outcome === "cancelled"
  ) return "";
  return saveCodeSubmission(
    job.taskId,
    job.code,
    passed,
    testNo,
    outcome,
    job.kind,
    job.testsTotal,
    testSetVersion(job.task),
  );
}

// ----- Bảng xếp hạng theo số bài hoàn thành và tổng điểm -----
function openLeaderboard() {
  openOverlay("lbOverlay");
  loadLeaderboard();
}
function rankRowClass(r) {
  const rank = Number(r.rank_no);
  return `${r.is_me ? "me" : ""} ${rank <= 3 ? "rank-" + rank : ""}`;
}
async function loadLeaderboard() {
  const reqId = ++lbRequestId;
  const body = $("lbBody");
  const head = $("lbHead");
  const showMsg = (msg) => {
    body.innerHTML = `<tr><td colspan="5" class="lb-empty">${escapeHTML(msg)}</td></tr>`;
  };
  showMsg("Đang tải...");
  head.innerHTML =
    "<tr><th>Hạng</th><th>Tên</th><th>Bài 10/10</th><th>Test đúng</th><th>Tổng điểm</th></tr>";
  $("lbNote").textContent =
    "Ưu tiên số bài đạt 10/10, sau đó đến tổng điểm và số test đúng.";
  const { data, error } = await supabase.rpc("get_rank_combined", {
    p_limit: 100,
  });
  if (reqId !== lbRequestId) return;
  if (error) return showMsg("Không tải được bảng xếp hạng: " + error.message);
  if (!data?.length)
    return showMsg("Chưa có ai trên bảng xếp hạng.");
  body.innerHTML = data
    .map(
      (r) =>
        `<tr class="${rankRowClass(r)}"><td class="lb-rank">${Number(r.rank_no)}</td><td class="lb-name"><button class="lb-profile-link" type="button" data-profile="${escapeHTML(r.user_id)}">${escapeHTML(r.display_name || "(chưa đặt tên)")}</button>${r.is_me ? " <small>(bạn)</small>" : ""}</td><td class="lb-score">${Number(r.solved)}</td><td>${Number(r.total_correct)}</td><td>${Number(r.total_points).toFixed(2)}</td></tr>`,
    )
    .join("");
}
$("lbBody").addEventListener("click", (event) => {
  const profileButton = event.target.closest("[data-profile]");
  if (profileButton) openProfile(profileButton.dataset.profile);
});
async function loadMemberDirectory(query = "") {
  const results = $("memberSearchResults");
  if (!currentUser) { results.textContent = "Đăng nhập để xem danh sách thành viên."; return; }
  results.textContent = "Đang tải thành viên…";
  const { data, error } = await supabase.rpc(query ? "search_member_profiles" : "list_member_directory", query ? { p_search: query, p_limit: 50 } : { p_limit: 100 });
  if (error) { results.textContent = error.message; return; }
  results.innerHTML = data?.length ? data.map((member) => `<button class="directory-member" type="button" data-profile="${escapeHTML(member.user_id)}"><span class="profile-avatar" aria-hidden="true">${avatarImageMarkup(member.avatar_path, member.display_name)}</span><span><b>${escapeHTML(member.display_name || "Thành viên")}</b><small>${Number(member.solved)}/${TASKS.length} bài hoàn thành · ${Number(member.total_points || 0).toFixed(2)} điểm</small></span><span class="directory-arrow">›</span></button>`).join("") : "Không tìm thấy thành viên phù hợp.";
  bindAvatarImages(results);
}
$("memberSearchForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = $("memberSearch").value.trim();
  if (query.length < 2) { $("memberSearchResults").textContent = "Nhập ít nhất 2 ký tự để tìm."; return; }
  await loadMemberDirectory(query);
});
$("memberSearchResults").addEventListener("click", (event) => {
  const button = event.target.closest("[data-profile]");
  if (button) openProfile(button.dataset.profile);
});
$("memberSearch").addEventListener("input", () => {
  if (!$("memberSearch").value.trim()) void loadMemberDirectory();
});
let submissionScope = "all";
let submissionOffset = 0;
const SUBMISSION_PAGE_SIZE = 40;
async function loadSubmissions(reset = true) {
  const list = $("submissionList");
  if (!currentUser) { list.textContent = "Đăng nhập để xem lịch sử bài nộp."; $("submissionMore").hidden = true; return; }
  if (reset) { submissionOffset = 0; list.innerHTML = '<div class="auth-loading">Đang tải lịch sử…</div>'; }
  const { data, error } = await supabase.rpc("list_code_submissions", { p_scope: submissionScope, p_limit: SUBMISSION_PAGE_SIZE, p_offset: submissionOffset });
  if (error) { list.textContent = "Không tải được lịch sử: " + error.message; return; }
  const outcomeFilter = $("submissionOutcome").value;
  // Include the first accepted submission alongside earlier attempts.
  const rows = (data || []).filter(row => !outcomeFilter || row.outcome === outcomeFilter);
  const canDeleteSubmissions = myRole === "admin" || myRole === "super_admin";
  const markup = rows.map(row => {
    const outcomeNames = {accepted:"Đúng", partial:"Chưa đạt hết", wrong:"Sai", compile_error:"Lỗi biên dịch", runtime_error:"Lỗi chạy", cancelled:"Đã hủy"};
    const codeAccessMessage = '<p class="profile-subtle">Bạn có thể xem mã nguồn của người khác sau khi đạt 10/10 ở bài này.</p>';
    const codeDetails = row.source_code != null
      ? `<details class="profile-history-item"><summary>Xem mã nguồn đã lưu</summary><pre><code data-cpp-source>${escapeHTML(row.source_code)}</code></pre></details>`
      : codeAccessMessage;
    const deleteAction = canDeleteSubmissions ? `<div class="submission-delete-actions"><button class="submission-delete" type="button" data-start-delete aria-label="Xóa bài nộp">Xóa</button><div class="submission-delete-confirm" hidden><span>Xóa mục bài nộp này?</span><button class="submission-delete-confirm-btn" type="button" data-confirm-delete="${Number(row.submission_id)}">Xác nhận xóa</button><button class="submission-delete-cancel" type="button" data-cancel-delete>Hủy</button></div></div>` : "";
    const submittedTask = TASKS.find((task) => Number(task.id) === Number(row.problem_id));
    const submittedTotal = Number(row.tests_total || submittedTask?.tests.length || 0);
    return `<article class="submission-entry"><div class="submission-entry-head"><span class="submission-badge ${escapeHTML(row.outcome)}">${escapeHTML(outcomeNames[row.outcome] || "Đã chạy")}</span><b>${String(row.problem_id).padStart(3,"0")}. ${escapeHTML(taskTitle(row.problem_id))}</b><time>${formatLocalDate(row.created_at)}</time></div><div class="submission-entry-meta"><button class="lb-profile-link" type="button" data-profile="${escapeHTML(row.user_id)}">${escapeHTML(row.display_name || "Thành viên")}</button><span>${row.test_no ? `Test ${Number(row.test_no)}` : `${Number(row.tests_passed || 0)}/${submittedTotal} test đúng`}</span><span>${row.run_mode === "single" ? "Chạy một test" : "Chạy toàn bộ"}</span></div>${codeDetails}${deleteAction}</article>`;
  }).join("");
  if (reset) list.innerHTML = markup || '<p class="profile-subtle">Chưa có bài nộp trong phạm vi này.</p>';
  else if (markup) list.insertAdjacentHTML("beforeend", markup);
  renderCppSourceViews(list);
  submissionOffset += (data || []).length;
  $("submissionMore").hidden = !data || data.length < SUBMISSION_PAGE_SIZE;
}
document.querySelectorAll("[data-submission-scope]").forEach(button => button.addEventListener("click", () => {
  submissionScope = button.dataset.submissionScope;
  document.querySelectorAll("[data-submission-scope]").forEach(tab => tab.classList.toggle("active", tab === button));
  void loadSubmissions();
}));
$("submissionOutcome").addEventListener("change", () => void loadSubmissions());
$("submissionMore").addEventListener("click", () => void loadSubmissions(false));
$("submissionList").addEventListener("click", async event => {
  const startDelete = event.target.closest("[data-start-delete]");
  if (startDelete) {
    const confirmation = startDelete.parentElement.querySelector(".submission-delete-confirm");
    startDelete.hidden = true;
    confirmation.hidden = false;
    confirmation.querySelector("[data-confirm-delete]")?.focus();
    return;
  }
  const cancelDelete = event.target.closest("[data-cancel-delete]");
  if (cancelDelete) {
    const actions = cancelDelete.closest(".submission-delete-actions");
    actions.querySelector(".submission-delete-confirm").hidden = true;
    actions.querySelector("[data-start-delete]").hidden = false;
    return;
  }
  const confirmDelete = event.target.closest("[data-confirm-delete]");
  if (confirmDelete) {
    if (!(myRole === "admin" || myRole === "super_admin")) return;
    confirmDelete.disabled = true;
    try {
      const { data, error } = await supabase.rpc("admin_delete_code_submission", {
        p_submission_id: Number(confirmDelete.dataset.confirmDelete),
      });
      if (error) throw error;
      if (data === false) throw new Error("Submission not found.");
      showAppToast("Đã xóa bài nộp.");
      await loadSubmissions(true);
    } catch (error) {
      showAppToast("Could not delete submission: " + error.message, "error");
      confirmDelete.disabled = false;
    }
    return;
  }
  const profileButton = event.target.closest("[data-profile]");
  if (profileButton) openProfile(profileButton.dataset.profile);
});
const MEMBER_LEVELS = [
  { min: 0, name: "Tân binh" },
  { min: 5, name: "Học viên" },
  { min: 20, name: "Lập trình viên" },
  { min: 50, name: "Thành thạo" },
  { min: 100, name: "Chuyên gia" },
  { min: 150, name: "Huyền thoại" },
];
function getMemberLevel(solved) {
  let index = 0;
  for (let i = 0; i < MEMBER_LEVELS.length; i++) {
    if (solved >= MEMBER_LEVELS[i].min) index = i;
  }
  const currentLevel = MEMBER_LEVELS[index];
  const nextLevel = MEMBER_LEVELS[index + 1];
  const percent = nextLevel
    ? Math.min(
        100,
        Math.round(
          ((solved - currentLevel.min) / (nextLevel.min - currentLevel.min)) *
            100,
        ),
      )
    : 100;
  return { currentLevel, nextLevel, percent };
}
function taskTitle(taskId) {
  return TASKS.find((task) => task.id === Number(taskId))?.title || `Bài ${taskId}`;
}
// VI: Hiển thị ảnh công khai nếu có, nếu không dùng chữ cái đầu làm avatar dự phòng. EN: Show a public uploaded photo when available, otherwise use an initials fallback.
function avatarImageMarkup(avatarPath, displayName) {
  const initial = escapeHTML((displayName || "?").slice(0, 1).toUpperCase());
  if (!avatarPath || !supabase)
    return `<span class="avatar-fallback">${initial}</span>`;
  const publicUrl = supabase.storage.from("member-avatars").getPublicUrl(avatarPath).data.publicUrl;
  return `<img class="avatar-photo" data-avatar src="${escapeHTML(publicUrl)}?v=${Date.now()}" alt="" loading="lazy"><span class="avatar-fallback" hidden>${initial}</span>`;
}
function bindAvatarImages(root) {
  root.querySelectorAll("img[data-avatar]").forEach((image) => {
    image.addEventListener("error", () => {
      image.hidden = true;
      const fallback = image.parentElement.querySelector(".avatar-fallback");
      if (fallback) fallback.hidden = false;
    }, { once: true });
  });
}
function formatLocalDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const options = { timeZone: "Asia/Ho_Chi_Minh" };
  return date.toLocaleTimeString("vi-VN", { ...options, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }) + " · " + date.toLocaleDateString("vi-VN", { ...options, day: "2-digit", month: "2-digit", year: "numeric" });
}
function canManagePassword(user) {
  return (user?.identities || []).some((identity) => identity.provider === "email");
}
function memberStreakMarkup(result) {
  if (result.error || !result.data?.today)
    return '<section class="profile-streak profile-section"><h3>Chuỗi ngày học</h3><p class="profile-subtle">Chưa tải được chuỗi ngày học. Hãy thử mở lại hồ sơ khi có mạng hoặc sau khi cập nhật SQL.</p></section>';
  const today = String(result.data.today);
  const days = Array.isArray(result.data.days) ? result.data.days : [];
  const summary = summarizeStreak(days, today);
  const completed = new Set(summary.days);
  const week = Array.from({ length: 7 }, (_, index) => shiftStudyDate(today, index - 6));
  const weekdayNames = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  const recent = week.map((day) => {
    const date = new Date(`${day}T12:00:00Z`);
    const done = completed.has(day);
    return `<span class="profile-streak-day${done ? " done" : ""}${day === today ? " today" : ""}" title="${escapeHTML(`${day}: ${done ? "Đã học" : "Chưa học"}`)}"><small>${weekdayNames[date.getUTCDay()]}</small><b>${Number(day.slice(8))}</b></span>`;
  }).join("");
  return `<section class="profile-streak profile-section" data-tier="${streakTier(summary.current)}" aria-label="Chuỗi ngày học">
    <div class="profile-streak-main"><div class="profile-streak-flame" aria-hidden="true">${streakFlameSvg(streakTier(summary.current), "profile-streak")}</div><div><h3>Chuỗi ngày học</h3><p><strong>${summary.current}</strong> ngày liên tiếp <span>· Dài nhất ${summary.longest} ngày</span></p></div></div>
    <div class="profile-streak-week" aria-label="Bảy ngày học gần nhất">${recent}</div>
    <p class="profile-streak-note">${summary.completedToday ? "Đã học trong ngày hôm nay." : summary.pendingToday ? "Đã học hôm qua; hôm nay vẫn có thể duy trì chuỗi." : "Chưa ghi nhận lượt học hôm nay."}</p>
  </section>`;
}
async function openProfile(userId) {
  if (!currentUser) {
    alert("Đăng nhập để xem hồ sơ thành viên.");
    return;
  }
  const content = $("profileContent");
  content.innerHTML = '<div class="auth-loading">Đang tải hồ sơ…</div>';
  openOverlay("profileOverlay");
  try {
    const [profileResult, progressResult, streakResult] = await Promise.all([
      supabase.rpc("get_member_profile", { p_user_id: userId }),
      supabase.rpc("get_member_progress", { p_user_id: userId }),
      Promise.resolve(supabase.rpc("get_member_streak", { p_user_id: userId }))
        .catch((error) => ({ error })),
    ]);
    const error =
      profileResult.error || progressResult.error;
    if (error) throw error;
    const profile = profileResult.data?.[0];
    if (!profile) throw new Error("Không tìm thấy hồ sơ thành viên.");

    const ownProfile = userId === currentUser.id;
    const solved = Number(profile.solved || 0);
    const level = getMemberLevel(solved);
    const progress = progressResult.data || [];
    const emailIdentity = ownProfile && canManagePassword(currentUser);
    const accountSettings = ownProfile
      ? `<div class="profile-section"><button class="btn" type="button" data-profile-action="rename">✎ Đổi tên hiển thị</button></div>
        <div class="profile-section"><h3>Bảo mật tài khoản</h3>
          ${
            emailIdentity
              ? `<div class="profile-settings">
                  <form id="changeEmailForm" class="profile-section">
                    <h3>Đổi email</h3>
                    <p class="profile-subtle">Email mới cần được xác nhận theo thiết lập Supabase Auth.</p>
                    <label for="profileNewEmail">Email mới</label><input id="profileNewEmail" name="newEmail" type="email" autocomplete="email" required maxlength="254">
                    <label for="profileEmailPassword">Mật khẩu hiện tại để xác minh</label><input id="profileEmailPassword" name="currentPassword" type="password" autocomplete="current-password" required>
                    <button class="btn primary" type="submit">Gửi yêu cầu đổi email</button><p id="changeEmailMessage" class="profile-message" role="status"></p>
                  </form>
                  <form id="changePasswordForm" class="profile-section">
                    <h3>Đổi mật khẩu</h3>
                    <label for="profileCurrentPassword">Mật khẩu hiện tại</label><input id="profileCurrentPassword" name="currentPassword" type="password" autocomplete="current-password" required>
                    <label for="profileNewPassword">Mật khẩu mới</label><input id="profileNewPassword" name="newPassword" type="password" autocomplete="new-password" minlength="12" required>
                    <label for="profileConfirmPassword">Nhập lại mật khẩu mới</label><input id="profileConfirmPassword" name="confirmPassword" type="password" autocomplete="new-password" minlength="12" required>
                    <p class="profile-subtle">12–64 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt; không có khoảng trắng.</p>
                    <button class="btn primary" type="submit">Đổi mật khẩu</button><p id="changePasswordMessage" class="profile-message" role="status"></p>
                  </form>
                </div>`
              : '<p class="profile-subtle">Tài khoản này đăng nhập bằng nhà cung cấp bên ngoài. Hãy quản lý email và mật khẩu tại nhà cung cấp đó.</p>'
          }
        </div>`
      : "";
    content.innerHTML = `
      <div class="profile-head">
        <div class="profile-avatar-wrap"><div class="profile-avatar avatar-stack" aria-hidden="true">${avatarImageMarkup(profile.avatar_path, profile.display_name)}</div>${ownProfile ? '<label class="avatar-upload-control">Tải ảnh đại diện<input id="avatarUpload" type="file" accept="image/png,image/jpeg,image/webp"></label><p id="avatarUploadMessage" class="avatar-upload-message" role="status"></p>' : ""}</div>
        <div><h2 id="profileTitle">${escapeHTML(profile.display_name || "Người dùng")}</h2><div class="profile-meta">Cấp bậc: <b>${level.currentLevel.name}</b>${ownProfile ? ` · ${escapeHTML(currentUser.email || "")}` : ""}</div></div>
      </div>
      <div class="profile-stats">
        <div class="profile-stat"><b>${solved}/${TASKS.length}</b><span>Bài đạt 10/10</span></div>
        <div class="profile-stat"><b>${Number(profile.attempted || 0)}</b><span>Bài đã thử</span></div>
        <div class="profile-stat"><b>${Number(profile.total_correct || 0)}</b><span>Test đúng</span></div>
        <div class="profile-stat"><b>${Number(profile.total_points || 0).toFixed(2)}</b><span>Tổng điểm</span></div>
      </div>
      ${memberStreakMarkup(streakResult)}
      <section class="profile-section profile-level-section" aria-label="Tiến độ cấp bậc">
        <h3>Tiến độ cấp bậc</h3>
        <div class="profile-level-track"><span style="width:${level.percent}%"></span></div>
        <p class="profile-subtle">${level.nextLevel ? `${solved}/${level.nextLevel.min} bài hoàn thành để lên cấp ${level.nextLevel.name}.` : "Đã đạt cấp bậc cao nhất."}</p>
      </section>
      <section class="profile-section"><h3>Tiến độ bài tập</h3>
        <p class="profile-progress-hint">Vuốt ngang để xem các bài và điểm tốt nhất.</p>
        <div class="profile-progress-list" tabindex="0" role="list" aria-label="Tiến độ bài tập, vuốt ngang để xem thêm">${
          progress.length
            ? progress
                .map(
                  (item) =>
                    `<div class="profile-progress-item" role="listitem"><span class="profile-progress-title">${String(item.problem_id).padStart(3, "0")}. ${escapeHTML(taskTitle(item.problem_id))}</span><b>${Number(item.best_points ?? Number(item.best_score) / 2).toFixed(2)}/10 · ${Number(item.best_score)}/${Number(item.best_tests_total || TASKS.find((task) => Number(task.id) === Number(item.problem_id))?.tests.length || 0)}</b></div>`,
                )
                .join("")
            : '<p class="profile-subtle">Chưa có tiến độ bài tập.</p>'
        }</div>
      </section>
      ${accountSettings}`;
    bindAvatarImages(content);
  } catch (error) {
    content.innerHTML = `<h2 id="profileTitle">Không tải được hồ sơ</h2><p class="profile-subtle">${escapeHTML(error.message || String(error))}</p>`;
  }
}

$("profileContent").addEventListener("click", (event) => {
  if (event.target.closest('[data-profile-action="rename"]')) renameUser();
});
// VI: Nén ảnh về WebP trước khi tải lên để tiết kiệm dung lượng. EN: Resize and convert profile photos to WebP before upload.
async function uploadProfileAvatar(input) {
  const file = input.files?.[0];
  const message = $("avatarUploadMessage");
  if (!file || !message || !currentUser) return;
  if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 8 * 1024 * 1024) {
    message.textContent = "Chọn ảnh PNG, JPEG hoặc WebP, dung lượng tối đa 8 MB.";
    message.className = "avatar-upload-message profile-message err";
    input.value = "";
    return;
  }
  input.disabled = true;
  message.textContent = "Đang tối ưu và tải ảnh lên…";
  message.className = "avatar-upload-message";
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.84));
    if (!blob) throw new Error("Không chuyển đổi được ảnh này sang WebP.");
    const path = `${currentUser.id}/avatar.webp`;
    const { error: uploadError } = await supabase.storage
      .from("member-avatars")
      .upload(path, blob, { cacheControl: "0", contentType: "image/webp", upsert: true });
    if (uploadError) throw uploadError;
    const { error: profileError } = await supabase.rpc("set_my_avatar_path", { p_avatar_path: path });
    if (profileError) throw profileError;
    profileAvatarPath = path;
    renderAuthBox();
    await openProfile(currentUser.id);
  } catch (error) {
    message.textContent = error.message || "Không tải được ảnh đại diện.";
    message.className = "avatar-upload-message profile-message err";
  } finally {
    input.value = "";
    input.disabled = false;
  }
}
$("profileContent").addEventListener("change", (event) => {
  const input = event.target.closest("#avatarUpload");
  if (input) void uploadProfileAvatar(input);
});
$("profileContent").addEventListener("submit", async (event) => {
  const form = event.target;
  if (!form.matches("#changeEmailForm, #changePasswordForm")) return;
  event.preventDefault();
  const emailChange = form.id === "changeEmailForm";
  const message = $(emailChange ? "changeEmailMessage" : "changePasswordMessage");
  const submit = form.querySelector('[type="submit"]');
  const currentPassword = form.elements.namedItem("currentPassword").value;
  const newEmail = emailChange
    ? form.elements.namedItem("newEmail").value.trim()
    : "";
  const newPassword = emailChange
    ? ""
    : form.elements.namedItem("newPassword").value;
  if (!emailChange) {
    const confirmPassword = form.elements.namedItem("confirmPassword").value;
    if (!isStrongPassword(newPassword)) {
      message.textContent = "Mật khẩu mới chưa đạt đủ yêu cầu bảo mật.";
      message.className = "profile-message err";
      return;
    }
    if (newPassword !== confirmPassword) {
      message.textContent = "Hai mật khẩu mới không trùng nhau.";
      message.className = "profile-message err";
      return;
    }
    if (newPassword === currentPassword) {
      message.textContent = "Mật khẩu mới phải khác mật khẩu hiện tại.";
      message.className = "profile-message err";
      return;
    }
  } else if (newEmail.toLowerCase() === currentUser.email?.toLowerCase()) {
    message.textContent = "Email mới phải khác email hiện tại.";
    message.className = "profile-message err";
    return;
  }

  submit.disabled = true;
  message.textContent = "Đang xác minh tài khoản…";
  message.className = "profile-message";
  try {
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: currentUser.email,
      password: currentPassword,
    });
    if (verifyError) throw verifyError;
    const update = emailChange
      ? await supabase.auth.updateUser({ email: newEmail })
      : await supabase.auth.updateUser({ password: newPassword });
    if (update.error) throw update.error;
    message.textContent = emailChange
      ? "Đã gửi yêu cầu. Hãy xác nhận email theo hướng dẫn trong thư."
      : "Đã đổi mật khẩu thành công.";
    message.className = "profile-message ok";
    form.reset();
  } catch (error) {
    message.textContent = error.message || "Không cập nhật được tài khoản.";
    message.className = "profile-message err";
  } finally {
    submit.disabled = false;
  }
});

// VI: Hộp thoại đổi tên và toast thay cho hộp thoại mặc định của trình duyệt. EN: Use a styled rename dialog and toast instead of native browser popups.
let toastTimer = 0;
function showAppToast(message, kind = "success") {
  const toast = $("appToast");
  toast.textContent = message;
  toast.dataset.kind = kind;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 5200);
}
// VI: Sao chép được cả khi Clipboard API bị chặn; EN: Fall back when Clipboard API is unavailable.
async function copyTextToClipboard(text) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.append(field);
    let copied = false;
    try {
      field.select();
      copied = document.execCommand("copy");
    } finally {
      field.remove();
    }
    if (!copied) throw new Error("Clipboard copy failed");
  }
}
function renameUser() {
  $("renameInput").value = userDisplayName();
  $("renameMessage").textContent = "";
  $("renameMessage").className = "profile-message";
  $("renameConfirm").hidden = true;
  $("renameContinue").hidden = false;
  openOverlay("renameOverlay");
  requestAnimationFrame(() => $("renameInput").focus());
}
$("renameInput").addEventListener("input", () => {
  $("renameConfirm").hidden = true;
  $("renameContinue").hidden = false;
  $("renameMessage").textContent = "";
});
$("renameForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const currentName = userDisplayName();
  const name = $("renameInput").value.trim().replace(/\s+/g, " ");
  const message = $("renameMessage");
  message.className = "profile-message err";
  if (name.length < 3 || name.length > 30 || !/^[\p{L}\p{N}][\p{L}\p{N} ._'’\-]*[\p{L}\p{N}]$/u.test(name)) {
    message.textContent = "Tên cần dài 3–30 ký tự, bắt đầu và kết thúc bằng chữ hoặc số.";
    return;
  }
  if (name.toLocaleLowerCase() === currentName.toLocaleLowerCase()) {
    message.textContent = "Tên mới phải khác tên hiện tại.";
    return;
  }
  message.textContent = "";
  $("renameConfirmText").textContent = `Đổi tên “${currentName}” thành “${name}”? Mỗi 30 ngày chỉ đổi một lần và thay đổi sẽ được lưu vào lịch sử quản trị.`;
  $("renameConfirm").hidden = false;
  $("renameContinue").hidden = true;
});
$("renameBack").addEventListener("click", () => {
  $("renameConfirm").hidden = true;
  $("renameContinue").hidden = false;
});
$("renameConfirmButton").addEventListener("click", async () => {
  const button = $("renameConfirmButton");
  const message = $("renameMessage");
  const name = $("renameInput").value.trim().replace(/\s+/g, " ");
  button.disabled = true;
  button.textContent = "Đang cập nhật…";
  message.textContent = "Đang lưu tên mới vào tài khoản và lịch sử quản trị…";
  message.className = "profile-message";
  try {
    const { data, error } = await supabase.rpc("request_display_name_change", { p_display_name: name });
    if (error) throw error;
    profileName = name;
    renderAuthBox();
    if (!$("profileOverlay").hidden && currentUser) void openProfile(currentUser.id);
    const nextAllowed = data ? new Date(data).toLocaleString("vi-VN") : "sau 30 ngày";
    closeOverlay("renameOverlay");
    showAppToast(`Đã đổi tên thành công. Bạn có thể đổi tên tiếp từ ${nextAllowed}.`, "success");
  } catch (error) {
    message.textContent = error.message || "Không đổi được tên. Hãy thử lại.";
    message.className = "profile-message err";
  } finally {
    button.disabled = false;
    button.textContent = "Xác nhận đổi tên";
  }
});
// ----- Gắn sự kiện -----
$("authBox").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-auth]");
  if (!btn || !supabase) return;
  const action = btn.dataset.auth;
  // VI: Mọi lối tắt nằm trong một menu. EN: All navigation shortcuts share one menu.
  const dd = $("authBox").querySelector(".user-dropdown");
  if (action !== "menu" && dd) dd.hidden = true;
  if (action === "menu") {
    if (dd) {
      dd.hidden = !dd.hidden;
      btn.setAttribute("aria-expanded", String(!dd.hidden));
    }
    return;
  }
  if (action === "info") {
    $("statsBar").hidden = !$("statsBar").hidden;
    if (!$("statsBar").hidden) $("closeInfo").focus();
    return;
  }
  if (action === "streak") { openStreak(); return; }
  if (action === "login") {
    setAuthMode("login");
    openOverlay("authOverlay");
    $("authEmail").focus();
  } else if (action === "rank") openLeaderboard();
  else if (action === "members") {
    openOverlay("membersOverlay");
    void loadMemberDirectory();
  } else if (action === "submissions") {
    openOverlay("submissionsOverlay");
    void loadSubmissions();
  } else if (action === "profile") openProfile(currentUser.id);
  else if (action === "admin") openAdminPanel();
  else if (action === "rename") renameUser();
  else if (action === "logout") await supabase.auth.signOut();
});
$("closeInfo").addEventListener("click", () => {
  $("statsBar").hidden = true;
  document.querySelector('[data-auth="info"]')?.focus();
});
document
  .querySelectorAll("[data-close]")
  .forEach((b) =>
    b.addEventListener("click", () => closeOverlay(b.dataset.close)),
  );
document.querySelectorAll(".auth-overlay").forEach((o) =>
  o.addEventListener("click", (e) => {
    if (e.target === o) closeOverlay(o.id);
  }),
);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape")
    document
      .querySelectorAll(".auth-overlay:not([hidden])")
      .forEach((o) => closeOverlay(o.id));
});
// [NAVBAR] Bấm ra ngoài thì đóng menu tài khoản
document.addEventListener("click", (e) => {
  if (e.target.closest(".user-menu")) return;
  const dd = document.querySelector(".user-dropdown");
  if (dd) {
    dd.hidden = true;
    document.querySelector('[data-auth="menu"]')?.setAttribute("aria-expanded", "false");
  }
});
$("tabLogin").addEventListener("click", () => setAuthMode("login"));
$("tabRegister").addEventListener("click", () => setAuthMode("register"));
$("lbRefresh").addEventListener("click", loadLeaderboard);
$("authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!supabase) return;
  const email = $("authEmail").value.trim();
  const password = $("authPassword").value;
  if (!email || !password) {
    setAuthMsg("Nhập email và mật khẩu.", "err");
    return;
  }
  if (
    authMode === "register" &&
    !isStrongPassword(password)
  ) {
    setAuthMsg(
      "Mật khẩu cần 12–64 ký tự, có chữ hoa, chữ thường, số và ký tự đặc biệt; không có khoảng trắng.",
      "err",
    );
    return;
  }
  if (
    authMode === "register" && pendingSignupEmail &&
    email.toLowerCase() === pendingSignupEmail.toLowerCase()
  ) {
    setAuthMode("login");
    $("authEmail").value = email;
    updateResendConfirmationVisibility();
    setAuthMsg("Email này đang chờ xác nhận. Không gửi lại tự động; bạn có thể dùng nút gửi lại email nếu cần.", "ok");
    return;
  }
  if (authMode === "register" && !confirmSignupOnce) {
    setAuthMsg("Đang kiểm tra tài khoản...");
    let loginError;
    try { ({ error: loginError } = await supabase.auth.signInWithPassword({ email, password })); }
    catch (error) { setAuthMsg(translateAuthError(error), "err"); return; }
    if (!loginError) { clearPendingSignup(email); setAuthMsg("Tài khoản này đã tồn tại và đã đăng nhập.", "ok"); return; }
    if (/email not confirmed/i.test(String(loginError.message || ""))) {
      rememberPendingSignup(email); setAuthMode("login"); $("authEmail").value = email; updateResendConfirmationVisibility();
      setAuthMsg("Tài khoản này đang chờ xác nhận email. Không gửi thêm email; dùng nút gửi lại nếu cần.", "ok"); return;
    }
    if (!/invalid login credentials/i.test(String(loginError.message || ""))) { setAuthMsg(translateAuthError(loginError), "err"); return; }
    updateConfirmSignupVisibility(); setAuthMsg("Chưa tìm thấy tài khoản với thông tin này. Bấm Tiếp tục tạo tài khoản nếu bạn muốn gửi email xác nhận."); return;
  }
  confirmSignupOnce = false;
  $("authSubmit").disabled = true;
  setAuthMsg("Đang xử lý...");
  try {
    if (authMode === "login") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      clearPendingSignup(email);
    } else {
      const name =
        $("authName").value.trim().slice(0, 30) || email.split("@")[0];
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: name, full_name: name } },
      });
      if (error) throw error;
      const duplicateEmail = Array.isArray(data.user?.identities) && data.user.identities.length === 0;
      if (duplicateEmail) {
        const emailWasPending = pendingSignupEmail.toLowerCase() === email.toLowerCase();
        if (!emailWasPending) clearPendingSignup(email);
        setAuthMode("login");
        $("authEmail").value = email;
        updateResendConfirmationVisibility();
        setAuthMsg(emailWasPending
          ? "Tài khoản này đang chờ xác nhận. Không gửi mã mới tự động; bạn có thể gửi lại bằng nút bên dưới."
          : "Email này đã có tài khoản. Hãy đăng nhập; không cần tạo lại tài khoản hoặc gửi thêm email xác nhận.", "ok");
      } else if (!data.session) {
        rememberPendingSignup(email);
        setAuthMode("login");
        $("authEmail").value = email;
        updateResendConfirmationVisibility();
        setAuthMsg("Đã gửi email xác nhận. Mở email để xác nhận rồi đăng nhập. Nếu chưa nhận được, dùng nút gửi lại bên dưới.", "ok");
      }
    }
  } catch (err) {
    if (/already registered/i.test(String(err?.message || ""))) {
      rememberPendingSignup(email);
      setAuthMode("login");
      $("authEmail").value = email;
      updateResendConfirmationVisibility();
      setAuthMsg("Email này đã đăng ký. Hãy đăng nhập; nếu chưa xác nhận, bạn có thể gửi lại email bên dưới.", "ok");
      return;
    }
    if (/email not confirmed/i.test(String(err?.message || ""))) {
      rememberPendingSignup(email);
      setAuthMode("login");
      $("authEmail").value = email;
      updateResendConfirmationVisibility();
      setAuthMsg("Email chưa được xác nhận. Hãy mở email hoặc gửi lại xác nhận bên dưới.", "err");
      return;
    }
    setAuthMsg(translateAuthError(err), "err");
  } finally {
    $("authSubmit").disabled = false;
    $("confirmCreateAccount").disabled = false;
  }
});
$("confirmCreateAccount").addEventListener("click", (event) => { event.currentTarget.disabled = true; confirmSignupOnce = true; $("authForm").requestSubmit(); });
$("authPassword").addEventListener("input", updateConfirmSignupVisibility);
$("authEmail").addEventListener("input", () => { updateResendConfirmationVisibility(); updateConfirmSignupVisibility(); });
$("resendConfirmation").addEventListener("click", async () => {
  const email = $("authEmail").value.trim();
  if (!email) {
    setAuthMsg("Nhập email cần xác nhận trước.", "err");
    return;
  }
  const button = $("resendConfirmation");
  button.disabled = true;
  setAuthMsg("Đang gửi email xác nhận…");
  try {
    const { error } = await supabase.auth.resend({ type: "signup", email });
    if (error) throw error;
    rememberPendingSignup(email);
    setAuthMsg("Đã gửi email xác nhận. Hãy kiểm tra hộp thư đến và thư rác.", "ok");
  } catch (error) {
    setAuthMsg(translateAuthError(error), "err");
  } finally {
    button.disabled = false;
  }
});
initStreak({
  getSupabase: () => supabase,
  getUser: () => currentUser,
  problemTitle: (id) => TASKS.find((task) => Number(task.id) === Number(id))?.title,
  onLogin: () => { setAuthMode("login"); openOverlay("authOverlay"); $("authEmail").focus(); },
});
renderAuthBox();
void initializeSupabase();

const STATUS_LABELS = {
  todo: "Chưa làm",
  doing: "Đã thử nhưng còn test sai",
  done: "Đạt 10/10",
};
function getTaskState(taskId) {
  const value = currentBestScore(taskId);
  if (value === undefined || value === null || !Number.isFinite(Number(value)))
    return "todo";
  return Number(value) >= 10 ? "done" : "doing";
}
function ensureStatusLegend() {
  const list = $("tasklist");
  if (!list || $("statusLegend")) return;
  const legend = document.createElement("div");
  legend.id = "statusLegend";
  legend.className = "status-legend";
  legend.setAttribute("aria-label", "Chú thích màu trạng thái bài tập");
  legend.innerHTML =
    '<span><i class="legend-dot todo"></i>Xám: Chưa chấm</span><span><i class="legend-dot done"></i>Xanh: Đạt 10/10</span><span><i class="legend-dot doing"></i>Vàng: Đã chấm, còn test sai</span>';
  list.parentNode.insertBefore(legend, list);
}
function storageId(task) {
  return `v2_${task.id}`;
}
// VI: Chuyen code cu sang khoa theo ID bai; neu khoa cu bi dung chung thi giu ban cu de ca hai bai khong mat code. EN: Migrate old code to task-ID keys and preserve ambiguous legacy keys.
function loadSavedCode(task) {
  const key = "cppcode_" + storageId(task);
  const currentValue = localStorage.getItem(key);
  if (currentValue !== null) return currentValue;
  if (Number(readStore(PROBLEM_RESET_VERSION_KEY)[task.id] || 0) > 0) return null;
  const legacyId = task.legacyId || task.id;
  const legacyKey = "cppcode_" + legacyId;
  const legacyValue = localStorage.getItem(legacyKey);
  if (legacyValue === null) return null;
  localStorage.setItem(key, legacyValue);
  const owners = TASKS.filter((candidate) => String(candidate.legacyId || candidate.id) === String(legacyId));
  if (owners.length === 1) localStorage.removeItem(legacyKey);
  return legacyValue;
}
function updateProgress() {
  const done = TASKS.filter((t) => getTaskState(t.id) === "done").length;
  const doing = TASKS.filter((t) => getTaskState(t.id) === "doing").length;
  const todo = TASKS.length - done - doing;
  $("progressSummary").textContent =
    `${done}/${TASKS.length} bài đạt 10/10 · ${doing} bài đã chấm còn lỗi · ${todo} bài chưa chấm`;
}
function updateScore() {
  const best = currentBestScore(current.id);
  $("scoreSummary").textContent =
    best === undefined
      ? "Điểm cao nhất: Chưa chấm"
      : `Điểm cao nhất: ${Number(best).toFixed(2)}/10`;
}
function renderPartFilters() {
  const filters = $("filters");
  const names = new Map();
  // VI: Giữ tên ngắn cho bốn phần cũ; khi tên phần đổi trong dữ liệu, nút dùng tên mới.
  // EN: Preserve familiar legacy labels, but let renamed sections supply their own label.
  const legacyShortNames = new Map([
    ["Nhập xuất và phép tính cơ bản", "Nhập xuất"],
    ["Câu lệnh rẽ nhánh", "Rẽ nhánh"],
    ["Vòng lặp cơ bản và số học", "Vòng lặp"],
    ["Vòng lặp lồng nhau và bài toán tổng hợp", "For tổng hợp"],
  ]);
  for (const task of TASKS) {
    const match = /^Phần\s+(\d+)\s*-\s*(.+)$/u.exec(task.section || "");
    if (match && !names.has(Number(match[1]))) names.set(Number(match[1]), match[2]);
  }
  filters.replaceChildren();
  const add = (value, label, title) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.filter = String(value);
    button.textContent = label;
    button.title = title;
    if (value === "all") button.classList.add("active");
    filters.appendChild(button);
  };
  add("all", "Tất cả", "Tất cả bài tập");
  for (const [number, name] of [...names].sort((a, b) => a[0] - b[0])) {
    add(number, legacyShortNames.get(name) || name, `Phần ${number} - ${name}`);
  }
}
function renderList() {
  ensureStatusLegend();
  const q = $("search").value.trim().toLowerCase();
  visible = TASKS.filter(
    (t) =>
      (filter === "all" || t.section.startsWith("Phần " + filter + " - ")) &&
      (!q ||
        String(t.id).includes(q) ||
        t.title.toLowerCase().includes(q) ||
        t.section.toLowerCase().includes(q)),
  );
  $("tasklist").innerHTML = visible
    .map((t) => {
      const state = getTaskState(t.id);
      const label = STATUS_LABELS[state];
      const best = currentBestScore(t.id);
      const scoreText =
        best === undefined ? "" : ` · Cao nhất ${Number(best).toFixed(2)}/10`;
      const running = activeRuns.has(t.id);
      return `<button class="taskbtn status-${state} ${t.id === current.id ? "active" : ""} ${running ? "is-running" : ""}" data-id="${t.id}" title="${label}${scoreText}${running ? " · Đang chấm" : ""}" aria-label="Bài ${String(t.id).padStart(3, "0")}: ${escapeHTML(t.title)}. Trạng thái: ${label}${running ? ". Đang chấm" : ""}"><b>${String(t.id).padStart(3, "0")}</b><span class="taskbtn-text">${escapeHTML(t.title)}<small>${escapeHTML(t.level)} · ${escapeHTML(t.section.split(" - ")[1].slice(0, 45))}${running ? " · ĐANG CHẤM" : scoreText}</small></span><span class="task-state-mark ${state}" aria-hidden="true"></span></button>`;
    })
    .join("");
  document
    .querySelectorAll(".taskbtn")
    .forEach((b) =>
      b.addEventListener("click", () => selectTask(+b.dataset.id)),
    );
}
function escapeHTML(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function refreshRunControls() {
  const busy = activeRuns.has(current.id);
  $("runone").disabled = busy;
  $("runall").disabled = busy;
  $("cancelrun").hidden = !busy;
  $("cancelrun").disabled = !busy;
}
function renderRunViewForCurrentTask() {
  const active = activeRuns.get(current.id);
  const view = active || runViews.get(current.id);
  if (view) {
    setStatus(view.statusMessage || "Đang xử lý...", view.statusClass || "");
    renderRunOutput(view.output || "");
  } else {
    setStatus(
      "Dán code C++ vào khung trên, chọn test và nhấn chạy. Chuyển bài khác không làm dừng phiên chấm.",
      "",
    );
    renderRunOutput("");
  }
  refreshRunControls();
}
function renderRunOutput(text) {
  const output = $("runoutput");
  output.replaceChildren();
  const lines = String(text || "").split("\n");
  lines.forEach((line, index) => {
    const match = /^(TEST \d{1,2}: )(.*)$/.exec(line);
    if (match) {
      const row = document.createElement("span");
      row.className = match[2].includes("LỖI TRÌNH BÀY")
        ? "test-result-presentation"
        : match[2] === "ĐÚNG"
          ? "test-result-pass"
          : match[2].includes("THỜI GIAN")
            ? "test-result-timeout"
            : match[2].includes("LỖI CHẠY")
              ? "test-result-runtime"
              : "test-result-fail";
      row.textContent = line;
      output.append(row);
    } else {
      output.append(document.createTextNode(line));
    }
    if (index < lines.length - 1) output.append(document.createTextNode("\n"));
  });
}
// VI: Ghi chú khái niệm toán học hiển thị ngay trong đề liên quan. EN: Show a short concept reminder beside each related problem.
function renderFormatGuide(task) {
  const guide = $("formatGuide");
  const sample = taskSample(task);
  const presentation = taskPresentation(task, sample.input);
  guide.replaceChildren();
  guide.hidden = false;
  const title = document.createElement("b");
  title.textContent = "Yêu cầu trình bày";
  const details = document.createElement("pre");
  const inputRule = presentation.prompts.length
    ? `Nhập theo thứ tự: ${presentation.prompts.map((prompt) => prompt.trim()).join(" → ")}`
    : "Nhập dữ liệu theo mẫu đề bài.";
  const outputRule = presentation.resultLabel || presentation.lineLabels
    ? `Kết quả: ${(presentation.lineLabels || [presentation.resultLabel.trimEnd()]).join(" · ")}`
    : "Kết quả: In đúng các dòng trong output mẫu theo thứ tự.";
  const taskRule = OUTPUT_RULES.get(task.id);
  details.textContent = [inputRule, outputRule, taskRule].filter(Boolean).join("\n");
  guide.append(title, details);
}

function sampleTranscript(task) {
  const sample = taskSample(task);
  // VI: Bài mới đã lưu toàn bộ màn hình mẫu, kể cả input được echo.
  // EN: New tasks store the complete sample screen, including echoed input.
  if (Number(task.id) > 150 && !String(task.presentation_rules ?? "").trim()) return sample.output;
  const presentation = taskPresentation(task, sample.input);
  return presentation.expected(sample.output, sample.input);
}

function setTestListExpanded(expanded) {
  const toggle = $("toggleTests");
  const shown = Math.min(current.tests.length, MAX_VISIBLE_TESTS);
  $("tests").classList.toggle("collapsed", !expanded);
  toggle.textContent = expanded ? "Thu gọn test mẫu" : `Xem ${shown} test mẫu`;
  toggle.setAttribute("aria-expanded", String(expanded));
}

function selectTask(id) {
  const task = TASKS.find((t) => t.id === id);
  if (!task) return;
  current = task;
  renderList();
  $("crumb").textContent = current.section;
  $("title").textContent =
    String(current.id).padStart(3, "0") + ". " + current.title;
  $("level").textContent = current.level;
  $("statement").textContent = current.statement;
  const note = current.knowledge_note ?? CONCEPT_NOTES.get(current.id) ?? "";
  $("conceptNote").replaceChildren();
  $("conceptNote").hidden = !note;
  if (note) {
    const noteTitle = document.createElement("b");
    noteTitle.textContent = "Kiến thức cần nhớ";
    const noteBody = document.createElement("p");
    noteBody.textContent = note.replace(/^Kiến thức cần nhớ:\s*/, "");
    $("conceptNote").append(noteTitle, noteBody);
  }
  renderFormatGuide(current);
  $("inputdesc").textContent = current.input;
  $("outputdesc").textContent = current.output;
  $("constraints").textContent = "Ràng buộc: " + current.constraints;
  $("sampleRun").textContent = sampleTranscript(current);
  const practiceTests = visibleTests(current);
  const total = current.tests.length;
  const hidden = total - practiceTests.length;
  $("testHeading").textContent = `${total} test chấm điểm`;
  $("testVisibilityNote").textContent = hidden
    ? `Có thể xem ${practiceTests.length} test đầu. ${hidden} test còn lại được ẩn và vẫn chạy khi chấm điểm.`
    : `Có thể xem cả ${total} test. Chọn một test để nạp input.`;
  $("testScoringNote").textContent = `Chấm điểm chạy đủ ${total} test. Điểm trước khi trừ lỗi trình bày bằng số test đúng chia cho ${total}, rồi nhân 10. Hệ thống lưu điểm cao nhất.`;
  $("runall").textContent = "Chấm điểm";
  $("downloadPdf").textContent = `Xuất đề + ${practiceTests.length} test PDF`;
  $("tests").innerHTML = practiceTests
    .map(
      (x, i) =>
        `<div class="case ${i === 0 ? "selected" : ""}" data-index="${i}" role="button" tabindex="0" aria-label="B\u1ea5m \u0111\u1ec3 ch\u00e9p input TEST ${String(x.no).padStart(2, "0")} v\u00e0 n\u1ea1p v\u00e0o \u00f4 ch\u1ea1y th\u1eed"><div class="casehead"><b>TEST ${String(x.no).padStart(2, "0")}</b><span class="case-copy-hint">B\u1ea5m \u0111\u1ec3 ch\u00e9p input</span></div><div class="casegrid"><div><label>Input</label><pre>${escapeHTML(x.input)}</pre></div><div><label>Expected output</label><pre>${escapeHTML(taskPresentation(current, x.input).expected(x.output))}</pre></div></div></div>`,
    )
    .join("");
  $("toggleTests").hidden = practiceTests.length <= 4;
  setTestListExpanded(false);
  $("tests").querySelectorAll(".case").forEach((c) => {
    // VI: Bấm thẻ vừa nạp input vừa sao chép; EN: Selecting a card loads and copies its input.
    const selectAndCopy = async () => {
      const index = +c.dataset.index;
      const test = practiceTests[index];
      $("tests")
        .querySelectorAll(".case")
        .forEach((x) => x.classList.remove("selected"));
      c.classList.add("selected");
      $("stdin").value = test.input;
      const testLabel = "TEST " + String(index + 1).padStart(2, "0");
      try {
        await copyTextToClipboard(test.input);
        setStatus("Đã sao chép input " + testLabel + " và nạp vào ô chạy thử.", "ok");
      } catch {
        setStatus("Đã nạp input " + testLabel + "; trình duyệt không cho phép sao chép tự động.", "err");
      }
    };
    c.addEventListener("click", (e) => {
      if (e.target.closest("button, a, input, textarea, select")) return;
      void selectAndCopy();
    });
    c.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      void selectAndCopy();
    });
  });
  $("stdin").value = practiceTests[0].input;
  updateProgress();
  updateScore();
  renderRunViewForCurrentTask();
  const saved = loadSavedCode(current);
  $("code").value = saved === null ? starter : saved;
  renderCodeHighlight();
}
function setStatus(msg, cls) {
  $("runstatus").className = "status " + (cls || "");
  $("runstatus").textContent = msg;
}
function updateJobView(job, message, cls, output) {
  job.statusMessage = message;
  job.statusClass = cls || "";
  if (output !== undefined) job.output = output;
  runViews.set(job.taskId, {
    statusMessage: job.statusMessage,
    statusClass: job.statusClass,
    output: job.output || "",
    state: job.state,
    updatedAt: Date.now(),
  });
  // Chỉ ghi vào giao diện khi đang mở đúng bài của phiên chấm này.
  if (current.id === job.taskId) renderRunViewForCurrentTask();
}
function createRun(task, code, kind) {
  if (activeRuns.has(task.id))
    throw new Error(
      "Bài này đang có một phiên chạy. Hãy chờ hoặc hủy phiên hiện tại.",
    );
  const job = {
    runId: nextRunId++,
    taskId: task.id,
    task,
    code,
    kind,
    streakUserIdAtStart: streakUserId(),
    maxScoreAtStart: Number(currentBestScore(task.id) ?? 0) >= 10,
    controller: new AbortController(),
    state: "running",
    pass: 0,
    formatErrors: 0,
    presentationPenalty: 0,
    lines: [],
    currentTest: 0,
    total: kind === "batch" ? task.tests.length : 1,
    testsTotal: task.tests.length,
    statusMessage: "Đang khởi tạo phiên chạy...",
    statusClass: "",
    output: "",
  };
  activeRuns.set(task.id, job);
  updateJobView(
    job,
    kind === "batch"
      ? `Đang chấm bài ${task.id}: 0/${job.total} test.`
      : `Đang chạy một test của bài ${task.id}...`,
    "",
    "",
  );
  renderList();
  return job;
}
function finishRun(job) {
  if (activeRuns.get(job.taskId) === job) activeRuns.delete(job.taskId);
  renderList();
  if (current.id === job.taskId) renderRunViewForCurrentTask();
}
function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted)
      return reject(new DOMException("Đã hủy phiên chấm.", "AbortError"));
    const timer = setTimeout(done, ms);
    function done() {
      signal.removeEventListener("abort", cancel);
      resolve();
    }
    function cancel() {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      reject(new DOMException("Đã hủy phiên chấm.", "AbortError"));
    }
    signal.addEventListener("abort", cancel, { once: true });
  });
}

function exportCurrentTaskPdf() {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    setStatus(
      "Trình duyệt đang chặn cửa sổ PDF. Hãy cho phép pop-up cho website rồi thử lại.",
      "err",
    );
    return;
  }
  printWindow.document.open();
  printWindow.document.write(buildTaskPdfHtml(current, visibleTests(current), escapeHTML));
  printWindow.document.close();
  setStatus(
    "Đã mở bản in của bài hiện tại. Chọn “Lưu dưới dạng PDF” để tải file.",
    "ok",
  );
  let printStarted = false;
  const startPrint = () => {
    if (printStarted || printWindow.closed) return;
    printStarted = true;
    try {
      printWindow.focus();
      printWindow.print();
    } catch (_) {}
  };
  printWindow.addEventListener("load", () => setTimeout(startPrint, 350), {
    once: true,
  });
  // Fallback cho một số trình duyệt không phát load sau document.write.
  setTimeout(startPrint, 1200);
}

$("downloadPdf").addEventListener("click", exportCurrentTaskPdf);

$("search").addEventListener("input", renderList);
renderPartFilters();
document.querySelectorAll("#filters button").forEach((b) =>
  b.addEventListener("click", () => {
    filter = b.dataset.filter;
    document
      .querySelectorAll("#filters button")
      .forEach((x) => x.classList.toggle("active", x === b));
    renderList();
  }),
);
$("toggleTests").addEventListener("click", () => {
  setTestListExpanded($("tests").classList.contains("collapsed"));
});
$("loadCppFile").addEventListener("click", () => $("cppFileInput").click());
$("cppFileInput").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  const status = $("fileLoadStatus");
  if (!file) return;
  if (!/\.cpp$/i.test(file.name)) {
    status.textContent = "Chỉ nhận tệp có đuôi .cpp.";
    status.classList.add("err");
    event.target.value = "";
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    status.textContent = "Tệp quá lớn (tối đa 2 MB). Hãy chọn đúng file mã nguồn .cpp.";
    status.classList.add("err");
    event.target.value = "";
    return;
  }
  try {
    const code = await file.text();
    if (!code.trim()) throw new Error("Tệp đang trống.");
    $("code").value = code.replace(/^\uFEFF/, "");
    $("code").dispatchEvent(new Event("input", { bubbles: true }));
    status.textContent = `Đã nạp ${file.name}. Mã nguồn nằm trong trình duyệt; hãy chọn test chạy thử hoặc bấm Chấm điểm.`;
    status.classList.remove("err");
  } catch (error) {
    status.textContent = error.message || "Không đọc được tệp. Hãy lưu lại dưới dạng UTF-8 rồi thử lại.";
    status.classList.add("err");
  } finally {
    event.target.value = "";
  }
});
$("code").addEventListener("input", () => {
  renderCodeHighlight();
  try {
    localStorage.setItem("cppcode_" + storageId(current), $("code").value);
  } catch (_) {}
});
$("code").addEventListener("scroll", () => {
  const overlay = $("codeHighlight");
  overlay.scrollTop = $("code").scrollTop;
  overlay.scrollLeft = $("code").scrollLeft;
});
$("resetcode").onclick = () => {
  $("code").value = starter;
  renderCodeHighlight();
  try {
    localStorage.setItem("cppcode_" + storageId(current), starter);
  } catch (_) {}
};
$("clearcode").onclick = () => {
  $("code").value = "";
  renderCodeHighlight();
  try {
    localStorage.setItem("cppcode_" + storageId(current), "");
  } catch (_) {}
};

function workerRequest(
  workerUrl,
  message,
  { signal, timeoutMs, timeoutOnStartMessage = false } = {},
) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted)
      return reject(new DOMException("Đã hủy phiên chấm.", "AbortError"));

    const worker = new Worker(workerUrl, { type: "module" });
    let settled = false;
    let timer = null;
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      worker.terminate();
    };
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };
    const onAbort = () =>
      finish(
        reject,
        new DOMException("Đã hủy phiên chấm.", "AbortError"),
      );
    const startTimeout = () => {
      if (timeoutMs && !timer)
        timer = setTimeout(() => finish(resolve, { timedOut: true }), timeoutMs);
    };
    if (timeoutMs && !timeoutOnStartMessage) startTimeout();

    signal?.addEventListener("abort", onAbort, { once: true });
    worker.onmessage = (event) => {
      if (event.data?.type === "started" && timeoutMs) {
        startTimeout();
        return;
      }
      finish(resolve, event.data);
    };
    worker.onerror = (event) =>
      finish(reject, new Error(event.message || "Web Worker gặp lỗi."));
    worker.postMessage(message);
  });
}

async function waitForOfflineCache(signal) {
  if (
    !navigator.serviceWorker ||
    location.protocol === "file:" ||
    navigator.serviceWorker.controller
  )
    return;
  await Promise.race([
    navigator.serviceWorker.ready.catch(() => null),
    wait(3000, signal).catch((error) => {
      if (signal?.aborted) throw error;
    }),
  ]);
  if (signal?.aborted)
    throw new DOMException("Đã hủy phiên chấm.", "AbortError");
}

async function compileCode(code, signal) {
  if (!code.trim()) throw new Error("Bạn chưa dán mã nguồn C++.");
  await waitForOfflineCache(signal);
  const result = await workerRequest(
    new URL("../workers/cpp-compiler-worker.js", import.meta.url),
    { type: "compile", source: code },
    { signal },
  );
  if (result.type === "compile-error") {
    const error = new Error(result.message || "Biên dịch thất bại.");
    error.code = "COMPILE_ERROR";
    throw error;
  }
  if (result.type !== "compiled" || !result.module)
    throw new Error("Compiler không trả về chương trình đã biên dịch.");
  return result.module;
}

async function runCompiled(module, stdin, signal) {
  const result = await workerRequest(
    new URL("../workers/cpp-runner-worker.js", import.meta.url),
    { type: "run", module, input: stdin },
    {
      signal,
      timeoutMs: TEST_TIME_LIMIT_MS,
      timeoutOnStartMessage: true,
    },
  );
  if (result.timedOut)
    return {
      output: "",
      stderr: "",
      timeLimitExceeded: true,
      exitCode: "TLE",
    };
  return {
    output: String(result.stdout || "").replace(/\r\n?/g, "\n"),
    stderr: String(result.stderr || "").trimEnd(),
    runtimeError: result.runtimeError || "",
    timeLimitExceeded: false,
    exitCode: String(result.exitCode ?? 1),
  };
}

function createRunnerSession(module, signal) {
  const worker = new Worker(
    new URL("../workers/cpp-runner-worker.js", import.meta.url),
    { type: "module" },
  );
  let pending = null;
  let timer = null;
  let closed = false;
  let resolveReady;
  let rejectReady;
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const clearRunTimer = () => {
    clearTimeout(timer);
    timer = null;
  };
  const close = () => {
    if (closed) return;
    closed = true;
    clearRunTimer();
    signal?.removeEventListener("abort", onAbort);
    worker.terminate();
  };
  const onAbort = () => {
    const error = new DOMException("Đã hủy phiên chấm.", "AbortError");
    if (pending) {
      const current = pending;
      pending = null;
      current.reject(error);
    } else {
      rejectReady(error);
    }
    close();
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  worker.onmessage = (event) => {
    const message = event.data;
    if (message?.type === "ready") {
      resolveReady();
    } else if (message?.type === "started" && pending && !timer) {
      timer = setTimeout(() => {
        const current = pending;
        pending = null;
        close();
        current?.resolve({
          output: "",
          stderr: "",
          runtimeError: "",
          timeLimitExceeded: true,
          exitCode: "TLE",
        });
      }, TEST_TIME_LIMIT_MS);
    } else if (message?.type === "finished" && pending) {
      clearRunTimer();
      const current = pending;
      pending = null;
      current.resolve({
        output: String(message.stdout || "").replace(/\r\n?/g, "\n"),
        stderr: String(message.stderr || "").trimEnd(),
        runtimeError: message.runtimeError || "",
        timeLimitExceeded: false,
        exitCode: String(message.exitCode ?? 1),
      });
    }
  };
  worker.onerror = (event) => {
    const error = new Error(event.message || "Web Worker gặp lỗi.");
    if (pending) {
      const current = pending;
      pending = null;
      current.reject(error);
    } else {
      rejectReady(error);
    }
    close();
  };
  worker.postMessage({ type: "init", module });

  return {
    ready,
    close,
    run(input) {
      if (closed) return Promise.reject(new Error("Runner worker đã kết thúc."));
      if (pending) return Promise.reject(new Error("Runner worker đang bận."));
      return new Promise((resolve, reject) => {
        pending = { resolve, reject };
        try {
          worker.postMessage({ type: "run", input });
        } catch (error) {
          pending = null;
          reject(error);
          close();
        }
      });
    },
  };
}

async function* runCompiledBatch(module, tests, signal) {
  let runner = null;
  try {
    for (let index = 0; index < tests.length; index++) {
      if (signal?.aborted)
        throw new DOMException("Đã hủy phiên chấm.", "AbortError");
      if (!runner) {
        runner = createRunnerSession(module, signal);
        await runner.ready;
      }
      const result = await runner.run(tests[index].input);
      if (result.timeLimitExceeded) {
        runner.close();
        runner = null;
      }
      yield { index, test: tests[index], result };
    }
  } finally {
    runner?.close();
  }
}

async function compileRun(stdin, code, signal) {
  const module = await compileCode(code, signal);
  return runCompiled(module, stdin, signal);
}
function normalize(s) {
  return String(s ?? "")
    .replace(/\r/g, "")
    .trimEnd();
}
function scoreStatusClass(passed, total) {
  const ratio = total ? passed / total : 0;
  if (ratio >= 1) return "ok";
  if (ratio >= 0.75) return "good";
  if (ratio >= 0.5) return "warn";
  if (ratio >= 0.25) return "low";
  return "err";
}

$("runone").onclick = async () => {
  const task = current;
  const code = $("code").value;
  const stdin = $("stdin").value;
  const target = task.tests.find(
    (x) => normalize(x.input) === normalize(stdin),
  );
  let job;
  try {
    job = createRun(task, code, "single");
  } catch (e) {
    setStatus(e.message, "err");
    return;
  }
  try {
    updateJobView(
      job,
      "Đang biên dịch C++20 trong trình duyệt...",
      "",
      "Đang khởi tạo compiler C++20 cục bộ…",
    );
    const result = await compileRun(stdin, job.code, job.controller.signal);
    if (job.controller.signal.aborted)
      throw new DOMException("Đã hủy phiên chấm.", "AbortError");
    const grade = target
      ? classifyTestResult(result, task, target)
      : { status: "CUSTOM", message: "ĐÃ CHẠY · INPUT TỰ NHẬP", penalty: 0 };
    const ok = grade.status === "PASS";
    const singleRunOutcome = !target
      ? "wrong"
      : result.timeLimitExceeded || result.exitCode !== "0"
        ? "runtime_error"
        : grade.status === "FAIL"
          ? "wrong"
          : "partial";
    if (target) await saveRunSubmission(job, null, target.no, singleRunOutcome);
    job.state = "completed";
    const text = result.timeLimitExceeded
      ? "Kết quả: TIME LIMIT EXCEEDED (TLE)\nChương trình vượt giới hạn thực thi 1,0 giây."
      : "Kết quả chạy:\n" +
        (taskPresentation(task, stdin).renderConsoleOutput(result.output, stdin) || "(không có output)") +
        (result.stderr ? "\n\nStandard error:\n" + result.stderr : "") +
        (result.runtimeError ? "\n\nRuntime error:\n" + result.runtimeError : "") +
        (target
          ? "\n\nExpected output:\n" + taskPresentation(task, target.input).expected(target.output)
          : "\n\nĐây là lượt chạy thử với input bạn nhập, không chấm điểm.");
    updateJobView(
      job,
      result.timeLimitExceeded
        ? "QUÁ THỜI GIAN (TLE) · Vượt giới hạn 1,0 giây."
        : grade.message,
      ok
        ? "ok"
        : grade.status === "CUSTOM"
          ? ""
        : grade.status === "PRESENTATION"
          ? "warn"
        : result.timeLimitExceeded
          ? "warn"
          : result.exitCode !== "0"
            ? "low"
            : "err",
      text + "\n\nLượt chạy thử không làm thay đổi điểm cao nhất.",
    );
  } catch (error) {
    const cancelled =
      error.name === "AbortError" || job.controller.signal.aborted;
    await saveRunSubmission(
      job,
      null,
      target?.no || null,
      cancelled
        ? "cancelled"
        : error.code === "COMPILE_ERROR"
          ? "compile_error"
          : "runtime_error",
    );
    if (cancelled) {
      job.state = "cancelled";
      updateJobView(
        job,
        "ĐÃ HỦY phiên chạy. Không chấm điểm và không thay đổi điểm cao nhất.",
        "err",
        (job.output || "") + "\n\nĐã hủy theo yêu cầu.",
      );
    } else {
      job.state = "error";
      updateJobView(
        job,
        error.code === "COMPILE_ERROR"
          ? "BIÊN DỊCH THẤT BẠI."
          : "Không chạy được: " + error.message,
        "err",
        (error.code === "COMPILE_ERROR" ? "Lỗi biên dịch:\n" : "Lỗi chạy cục bộ:\n") +
          error.message +
          "\nKhông thay đổi điểm.",
      );
    }
  } finally {
    finishRun(job);
  }
};

$("runall").onclick = async () => {
  const task = current;
  const code = $("code").value;
  let job;
  try {
    job = createRun(task, code, "batch");
  } catch (e) {
    setStatus(e.message, "err");
    return;
  }
  try {
    updateJobView(
      job,
      `Đang biên dịch C++20 cho bài ${job.taskId}...`,
      "",
      "Đang khởi tạo compiler C++20 cục bộ…",
    );
    const module = await compileCode(job.code, job.controller.signal);
    for await (const { index: i, test, result } of runCompiledBatch(
      module,
      job.task.tests,
      job.controller.signal,
    )) {
      if (job.controller.signal.aborted)
        throw new DOMException("Đã hủy phiên chấm.", "AbortError");
      job.currentTest = i + 1;
      updateJobView(
        job,
        `Đang chấm bài ${job.taskId}: TEST ${i + 1}/${job.total} · Đúng ${job.pass} test. Chuyển sang bài khác không làm dừng phiên này.`,
        "",
        job.lines.join("\n"),
      );
      const grade = classifyTestResult(result, job.task, test);
      if (grade.status === "PASS" || grade.status === "PRESENTATION") job.pass++;
      if (grade.status === "PRESENTATION") {
        job.formatErrors++;
        job.presentationPenalty += grade.penalty;
      }
      job.lines.push(`TEST ${i + 1}: ${grade.message}`);
      updateJobView(
        job,
        `Đang chấm bài ${job.taskId}: ${i + 1}/${job.total} test · Đúng ${job.pass} test.`,
        "",
        job.lines.join("\n"),
      );
    }
    if (job.controller.signal.aborted)
      throw new DOMException("Đã hủy phiên chấm.", "AbortError");
    await refreshSuspensionStatus();
    if (job.controller.signal.aborted)
      throw new DOMException("Đã hủy phiên chấm.", "AbortError");
    // VI: Chấm đủ test trước rồi mới trừ tổng lỗi trình bày; không hạ điểm cao nhất đã lưu.
    // EN: Apply the capped formatting deduction after all tests; preserve the saved high score.
    const requestedPenalty = Math.min(1.5, job.presentationPenalty);
    const algorithmPoints = job.total ? (job.pass / job.total) * 10 : 0;
    const scoreUnits = maxScoreUnits(job.pass, job.total) - Math.round(requestedPenalty * SCORE_PRECISION);
    const score = Math.max(0, scoreUnits) / SCORE_PRECISION;
    const appliedPenalty = Math.max(0, algorithmPoints - score);
    const suspendedForRun = accountSuspended;
    const currentScore = currentBestScore(job.taskId);
    if (currentScore === undefined && bestScores[job.taskId] !== undefined) {
      archiveScoreVersion(job.taskId, bestScores[job.taskId], bestScoreMeta[job.taskId] || {});
    }
    const oldBest =
      currentScore === undefined
        ? -1
        : Number(currentScore);
    const improved = score > oldBest;
    if (improved && !suspendedForRun) {
      bestScores[job.taskId] = score;
      bestScoreMeta[job.taskId] = {
        testsPassed: job.pass,
        testsTotal: job.testsTotal,
        testSetVersion: testSetVersion(job.task),
        points: score,
      };
      persistScores();
    }
    job.state = "completed";
    // VI: Một lượt chấm đủ test ghi tối đa một ngày học, kể cả đáp án sai.
    // EN: A fully completed batch marks at most one study day, regardless of verdict.
    try {
      await recordCompletedBatch({ problemId: job.taskId,
        userIdAtStart: job.streakUserIdAtStart, suspended: accountSuspended });
    } catch (streakError) {
      console.warn("Không ghi được ngày học; lượt chấm vẫn hợp lệ:", streakError);
    }
    const historyNote = await saveRunSubmission(
      job,
      job.pass,
      null,
      job.pass === job.total && job.formatErrors === 0
        ? "accepted"
        : job.pass === 0
          ? "wrong"
          : "partial",
    );
    const cloudNote = suspendedForRun ? "\nTài khoản đang bị đình chỉ: lượt chấm này không tính điểm." : await syncScoreAfterGrading(job.taskId, job.pass, score, job.testsTotal, testSetVersion(job.task));
    const best = Number(currentBestScore(job.taskId) ?? (suspendedForRun ? 0 : score));
    const summary = suspendedForRun
      ? `\n\nHoàn tất: ${job.pass}/${job.total} test đúng thuật toán; ${job.formatErrors} test lỗi trình bày. Tài khoản đang bị đình chỉ nên lượt này không được tính điểm.\nĐiểm cao nhất đã lưu trước đó: ${best.toFixed(2)}/10.${cloudNote}`
      : `\n\nHoàn tất: ${job.pass}/${job.total} test đúng thuật toán; ${job.formatErrors} test lỗi trình bày.\nTrừ ${appliedPenalty.toFixed(2)} điểm do trình bày. Điểm lượt này: ${score.toFixed(2)}/10.\nĐiểm cao nhất được lưu: ${best.toFixed(2)}/10${improved ? " (đã cập nhật)" : " (giữ nguyên, không bị giảm)"}.${cloudNote}`;
    updateJobView(
      job,
      `Đã chấm xong bài ${job.taskId}: ${job.pass}/${job.total} test đúng · Điểm cao nhất ${best.toFixed(2)}/10.`,
      `${scoreStatusClass(Math.round((best / 10) * job.total), job.total)} completed-summary`,
      job.lines.join("\n") + summary + historyNote,
    );
    updateProgress();
    updateScore();
    renderList();
  } catch (error) {
    await saveRunSubmission(
      job,
      job.pass,
      null,
      error.name === "AbortError" || job.controller.signal.aborted
        ? "cancelled"
        : error.code === "COMPILE_ERROR"
          ? "compile_error"
          : "runtime_error",
    );
    if (error.name === "AbortError" || job.controller.signal.aborted) {
      job.state = "cancelled";
      updateJobView(
        job,
        `ĐÃ HỦY bài ${job.taskId} tại TEST ${Math.min(job.currentTest, job.total)}/${job.total}. Không chấm điểm lượt này; điểm cao nhất cũ được giữ nguyên.`,
        "err",
        job.lines.join("\n") +
          "\n\nĐÃ HỦY: lượt chạy này không được tính điểm.",
      );
    } else {
      job.state = "error";
      updateJobView(
        job,
        error.code === "COMPILE_ERROR"
          ? "BIÊN DỊCH THẤT BẠI · Chưa chạy test case nào."
          : `Lỗi chạy cục bộ tại TEST ${job.currentTest}/${job.total}.`,
        "err",
        job.lines.join("\n") +
          `\n\n${error.code === "COMPILE_ERROR" ? "Lỗi biên dịch:\n" : "Lỗi chạy:\n"}${error.message}\nLượt chấm chưa hoàn tất nên không cập nhật điểm. Điểm cao nhất cũ vẫn được giữ.`,
      );
    }
  } finally {
    finishRun(job);
    updateProgress();
    updateScore();
  }
};

$("cancelrun").onclick = () => {
  const job = activeRuns.get(current.id);
  if (!job) return;
  updateJobView(
    job,
    `Đang hủy phiên chấm bài ${job.taskId}...`,
    "err",
    job.output,
  );
  job.controller.abort();
};

// Cảnh báo trước khi rời hẳn/tải lại trang. Chuyển bài trong trang hoặc chuyển tab trình duyệt không dừng phiên chấm.
window.addEventListener("beforeunload", (event) => {
  if (activeRuns.size > 0) {
    event.preventDefault();
    event.returnValue = "";
  }
});

renderList();
selectTask(TASKS[0].id); // Bài đầu tiên theo thứ tự hiển thị.
void pendingBundledTaskParts.then((laterTasks) => {
  if (!laterTasks.length) return;
  const ids = new Set(TASKS.map((task) => task.id));
  const additions = laterTasks.filter((task) => {
    if (!Number.isInteger(task.id) || ids.has(task.id) || !hasValidTestCount(task.tests)) return false;
    ids.add(task.id);
    return true;
  });
  if (!additions.length) return;
  TASKS = [...TASKS, ...additions].sort((a, b) => a.id - b.id);
  visible = filter === "all" ? TASKS : TASKS.filter((task) => task.section === filter);
  TOTAL_TEST_CASES = TASKS.reduce((sum, task) => sum + task.tests.length, 0);
  document.getElementById("siteTaskSummary").textContent = `${TASKS.length} bài luyện tập C++ · Từ cơ bản đến nâng cao`;
  renderList();
  updateProgress();
  if (catalogSyncWarning) {
    const status = $("taskSyncStatus");
    if (status) { status.textContent = catalogSyncWarning; status.hidden = false; }
  }
});
window.setTimeout(() => { void refreshPublishedTasksInBackground(); }, 1800);
