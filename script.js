// Logic giao dien, chay code, cham diem va luu tien do.
// Du lieu 150 bai duoc nap tu 4 file JSON trong thu muc data/.
// VI: AI hỗ trợ triển khai một số tính năng theo yêu cầu của chủ dự án. EN: AI assisted implementation of selected features under the project owner's direction.
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker
    .register("./sw.js")
    .then(() => navigator.storage?.persist?.())
    .catch((error) => console.warn("Không bật được cache offline:", error));
}

const TASK_DATA_FILES = [
  "./data/part1.json",
  "./data/part2.json",
  "./data/part3.json",
  "./data/part4.json",
];

// [ADMIN] Ưu tiên nạp bài đã xuất bản từ Supabase (bảng problems + test_cases do Admin quản lý).
// Nếu bảng trống hoặc lỗi mạng thì tự quay về 4 file JSON như cũ.
async function loadTasksFromSupabase() {
  if (!navigator.onLine) return null;
  try {
    const key = "sb_publishable_Fb40gK9h5FiDyJSI05nH0g_TmXM8W-m";
    const url =
      "https://dcdvtpmihijzbieblwfa.supabase.co/rest/v1/problems" +
      "?select=*,test_cases(no,input,output)&is_published=eq.true&order=sort_order.asc,id.asc&limit=1000";
    const res = await fetch(url, {
      headers: { apikey: key },
      cache: "no-cache",
    });
    if (!res.ok) return null;
    const rows = await res.json();
    if (!Array.isArray(rows)) return null;
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
        sample_input: r.sample_input,
        sample_output: r.sample_output,
        tests: (r.test_cases || [])
          .sort((a, b) => a.no - b.no)
          .map((t) => ({ no: t.no, input: t.input, output: t.output })),
      }))
      .filter((t) => t.tests.length === 20);
    return tasks.length ? tasks : null;
  } catch (_) {
    return null;
  }
}

async function loadTaskData() {
  const dbTasks = await loadTasksFromSupabase();
  if (dbTasks) return dbTasks;
  const parts = await Promise.all(
    TASK_DATA_FILES.map(async (file) => {
      const url = new URL(file, import.meta.url);
      const response = await fetch(url, { cache: "no-cache" });
      if (!response.ok)
        throw new Error(`Không tải được ${file} (HTTP ${response.status}).`);
      const rows = await response.json();
      if (!Array.isArray(rows))
        throw new Error(`${file} không chứa một danh sách bài tập hợp lệ.`);
      return rows;
    }),
  );

  const tasks = parts.flat();
  const ids = new Set();
  for (const task of tasks) {
    if (!Number.isInteger(task.id) || ids.has(task.id)) {
      throw new Error(`ID bài tập không hợp lệ hoặc bị trùng: ${task.id}`);
    }
    if (!Array.isArray(task.tests) || task.tests.length !== 20) {
      throw new Error(`Bài ${task.id} phải có đúng 20 test case.`);
    }
    ids.add(task.id);
  }
  return tasks.sort((a, b) => a.id - b.id);
}

let TASKS;
try {
  TASKS = await loadTaskData();
  if (TASKS.length !== 150) {
    console.warn(
      `Website đang tải ${TASKS.length} bài, thay vì 150 bài dự kiến.`,
    );
  }
} catch (error) {
  console.error("Không thể khởi tạo website TLU C++:", error);
  document.body.innerHTML = `
    <main style="max-width:760px;margin:48px auto;padding:24px;font-family:Arial,sans-serif;line-height:1.6">
      <h1>Không tải được dữ liệu bài tập</h1>
      <p>Hãy kiểm tra xem thư mục <b>data</b> có đủ 4 file JSON và bạn đã tải website qua máy chủ (GitHub Pages, Cloudflare Pages, Netlify hoặc Live Server) hay chưa.</p>
      <pre id="loadError" style="white-space:pre-wrap;color:#a33"></pre>
    </main>`;
  document.getElementById("loadError").textContent = error.message;
  throw error;
}
const starter =
  "#include <iostream>\nusing namespace std;\n\nint main() {\n    // Viet code cua ban o day\n    return 0;\n}\n";
let current = TASKS[0],
  filter = "all",
  visible = TASKS;
const $ = (id) => document.getElementById(id);
const SCORE_KEY = "tlu_cpp_best_scores_v1";
const SCORE_META_KEY = "tlu_cpp_best_score_meta_v1";
const LEGACY_LATEST_SCORE_KEY = "tlu_cpp_latest_scores_v1";
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
function persistScores() {
  if (currentUser && navigator.onLine) return;
  try {
    localStorage.setItem(SCORE_KEY, JSON.stringify(bestScores));
    localStorage.setItem(SCORE_META_KEY, JSON.stringify(bestScoreMeta));
  } catch (_) {
    console.warn("Không thể lưu điểm vào localStorage.");
  }
}
persistScores();

// ===== Supabase: đăng nhập, lưu điểm lên tài khoản, bảng xếp hạng =====
// Quy ước lưu: bảng user_progress.best_score = SỐ TEST ĐÚNG (0-20).
// Điểm hiển thị = số test đúng / 2 (mỗi test 0,5 điểm).
const SUPABASE_URL = "https://dcdvtpmihijzbieblwfa.supabase.co";
const SUPABASE_KEY = "sb_publishable_Fb40gK9h5FiDyJSI05nH0g_TmXM8W-m";
const MAX_TESTS = 20;
let supabase = null;
try {
  if (!navigator.onLine) throw new Error("Offline");
  // Nạp động: nếu CDN lỗi thì website vẫn chạy bình thường (chỉ mất đăng nhập).
  const { createClient } =
    await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm");
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
} catch (error) {
  console.error("Không tải được Supabase SDK:", error);
}
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
  box.innerHTML = `<div class="user-menu"><button class="user-chip menu-trigger" data-auth="menu" type="button" aria-haspopup="true" aria-expanded="false">${avatar}<span class="user-label">${currentUser ? escapeHTML(userDisplayName()) : "Danh mục"}</span><span class="menu-chevron" aria-hidden="true">▾</span></button><div class="user-dropdown" hidden>${accountHead}<div class="menu-section-label">Học tập & cộng đồng</div><button data-auth="rank" type="button">🏆 Bảng xếp hạng</button><button data-auth="members" type="button">♙ Thành viên</button><button data-auth="submissions" type="button">▤ Bài đã nộp</button><button data-auth="info" type="button">ⓘ Th&#244;ng tin li&#234;n h&#7879;</button>${currentUser ? '<div class="menu-separator"></div>' : ""}${accountActions}</div></div>`;
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
// Điểm khách (localStorage) được đẩy lên tài khoản khi đăng nhập;
// máy chủ chỉ giữ điểm cao hơn nên không thể làm tụt điểm.
async function syncGuestScoresUp() {
  if (accountSuspended) return;
  const scores = readStore(SCORE_KEY);
  const metadata = readStore(SCORE_META_KEY);
  for (const [id, value] of Object.entries(scores)) {
    if (!/^\d{1,4}$/.test(id)) continue;
    const meta = metadata[id];
    const tests = Number.isInteger(meta?.testsPassed)
      ? meta.testsPassed
      : Math.round(Number(value) * 2);
    const points = Number.isFinite(Number(meta?.points)) ? Number(meta.points) : Number(value);
    if (tests < 0 || tests > MAX_TESTS || points < 0 || points > 10) continue;
    const { error } = await supabase.rpc("submit_score_with_presentation", {
      p_problem_id: Number(id),
      p_tests_passed: tests,
      p_points: points,
    });
    if (error) {
      console.warn("Không đồng bộ được điểm khách:", error.message);
      return;
    }
  }
  try {
    localStorage.removeItem(SCORE_KEY);
    localStorage.removeItem(SCORE_META_KEY);
    localStorage.removeItem(LEGACY_LATEST_SCORE_KEY);
  } catch (_) {}
}

async function loadCloudProgress() {
  let { data, error } = await supabase
    .from("user_progress")
    .select("problem_id,best_score,best_points");
  if (error && /best_points|column/i.test(error.message || "")) {
    ({ data, error } = await supabase
      .from("user_progress")
      .select("problem_id,best_score"));
  }
  if (error) {
    console.warn("Không tải được điểm từ tài khoản:", error.message);
    return;
  }
  const cloud = {};
  const cloudMeta = {};
  for (const row of data) {
    cloud[row.problem_id] = Number(row.best_points ?? Number(row.best_score) / 2);
    cloudMeta[row.problem_id] = {
      testsPassed: Number(row.best_score),
      points: cloud[row.problem_id],
    };
  }
  bestScores = cloud;
  bestScoreMeta = cloudMeta;
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
window.addEventListener("online", () => refreshSuspensionStatus());
document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshSuspensionStatus(); });
setInterval(() => { if (!document.hidden) refreshSuspensionStatus(); }, 30000);
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
      refreshScoreViews();
    }
    renderAuthBox();
    return;
  }
  currentUser = user;
  await refreshSuspensionStatus();
  clearPendingSignup(user.email || "");
  closeOverlay("authOverlay");
  if (loadedForUser === user.id) {
    renderAuthBox();
    return;
  }
  loadedForUser = user.id;
  renderAuthBox();
  await syncGuestScoresUp();
  await loadCloudProgress();
  await loadProfileName();
  await loadMyRole();
  renderAuthBox();
  refreshScoreViews();
}
// Gọi sau mỗi lần chấm đủ 20 test. Trả về dòng ghi chú để hiện trong kết quả.
async function syncScoreAfterGrading(taskId, passed, points) {
  // VI: Tai khoan bi dinh chi chi duoc luyen tap; khong gui diem len Supabase. EN: Keep suspended-account score writes out of Supabase.
  if (accountSuspended) return "\nT\u00e0i kho\u1ea3n \u0111ang b\u1ecb \u0111\u00ecnh ch\u1ec9; \u0111i\u1ec3m kh\u00f4ng \u0111\u01b0\u1ee3c \u0111\u1ed3ng b\u1ed9.";
  if (!navigator.onLine)
    return "\nKhông có Internet; điểm đã lưu trên thiết bị này.";
  if (!supabase) return "";
  if (!currentUser)
    return "\nĐăng nhập để lưu điểm lên tài khoản và vào bảng xếp hạng.";
  const { data, error } = await supabase.rpc("submit_score_with_presentation", {
    p_problem_id: Number(taskId),
    p_tests_passed: passed,
    p_points: points,
  });
  if (error)
    return `\nChưa lưu được điểm lên tài khoản: ${error.message}. Điểm chỉ có trong phiên này.`;
  bestScores[taskId] = Number(data);
  return "\nĐã lưu điểm lên tài khoản.";
}

async function saveCodeSubmission(taskId, code, passed = null, testNo = null, outcome = "partial", runMode = "batch") {
  if (!supabase || !currentUser || !navigator.onLine) return;
  try {
    const { error } = await supabase.rpc("save_code_submission", {
      p_problem_id: Number(taskId),
      p_source_code: code,
      p_tests_passed: passed,
      p_test_no: testNo,
      p_outcome: outcome,
      p_run_mode: runMode,
    });
    if (error) console.warn("Không lưu được lịch sử code:", error.message);
  } catch (error) {
    console.warn("Không lưu được lịch sử code:", error.message || error);
  }
}
// VI: Chỉ lưu lượt chạy khi bài chưa đạt điểm tối đa trước lúc bắt đầu; không lưu lượt hủy.
// EN: Store attempts only if the task was not already perfect when the run started; never store cancellations.
async function saveRunSubmission(job, passed = null, testNo = null, outcome = "partial") {
  if (
    !job ||
    job.maxScoreAtStart ||
    job.controller?.signal.aborted ||
    outcome === "cancelled"
  ) return;
  await saveCodeSubmission(
    job.taskId,
    job.code,
    passed,
    testNo,
    outcome,
    job.kind,
  );
}
// ----- Bảng xếp hạng: số bài hoàn thành, sau đó tổng số test đúng -----
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
    "Xếp theo số bài đạt 10/10, rồi tổng số test đúng ở tất cả bài (mỗi test đúng 0,5 điểm).";
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
        `<tr class="${rankRowClass(r)}"><td class="lb-rank">${Number(r.rank_no)}</td><td class="lb-name"><button class="lb-profile-link" type="button" data-profile="${escapeHTML(r.user_id)}">${escapeHTML(r.display_name || "(chưa đặt tên)")}</button>${r.is_me ? " <small>(bạn)</small>" : ""}</td><td class="lb-score">${Number(r.solved)}/${TASKS.length}</td><td>${Number(r.total_correct)}/${TASKS.length * MAX_TESTS}</td><td>${Number(r.total_points).toFixed(1)}/${TASKS.length * 10}</td></tr>`,
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
  results.innerHTML = data?.length ? data.map((member) => `<button class="directory-member" type="button" data-profile="${escapeHTML(member.user_id)}"><span class="profile-avatar" aria-hidden="true">${avatarImageMarkup(member.avatar_path, member.display_name)}</span><span><b>${escapeHTML(member.display_name || "Thành viên")}</b><small>${Number(member.solved)}/${TASKS.length} bài hoàn thành · ${Number(member.total_points || 0).toFixed(1)} điểm</small></span><span class="directory-arrow">›</span></button>`).join("") : "Không tìm thấy thành viên phù hợp.";
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
    const canViewCode = row.source_code != null;
    const deleteAction = canDeleteSubmissions ? `<div class="submission-delete-actions"><button class="submission-delete" type="button" data-start-delete aria-label="Xóa bài nộp">Xóa</button><div class="submission-delete-confirm" hidden><span>Xóa mục bài nộp này?</span><button class="submission-delete-confirm-btn" type="button" data-confirm-delete="${Number(row.submission_id)}">Xác nhận xóa</button><button class="submission-delete-cancel" type="button" data-cancel-delete>Hủy</button></div></div>` : "";
    return `<article class="submission-entry"><div class="submission-entry-head"><span class="submission-badge ${escapeHTML(row.outcome)}">${escapeHTML(outcomeNames[row.outcome] || "Đã chạy")}</span><b>${String(row.problem_id).padStart(3,"0")}. ${escapeHTML(taskTitle(row.problem_id))}</b><time>${formatLocalDate(row.created_at)}</time></div><div class="submission-entry-meta"><button class="lb-profile-link" type="button" data-profile="${escapeHTML(row.user_id)}">${escapeHTML(row.display_name || "Thành viên")}</button><span>${row.test_no ? `Test ${Number(row.test_no)}` : `${Number(row.tests_passed || 0)}/20 test đúng`}</span><span>${row.run_mode === "single" ? "Chạy một test" : "Chạy toàn bộ"}</span></div>${canViewCode ? `<details class="profile-history-item"><summary>Xem mã nguồn đã lưu</summary><pre>${escapeHTML(row.source_code)}</pre></details>` : '<p class="profile-subtle">Mã nguồn chỉ hiển thị cho chủ tài khoản, Admin hoặc khi bài đã hoàn thành.</p>'}${deleteAction}</article>`;
  }).join("");
  if (reset) list.innerHTML = markup || '<p class="profile-subtle">Chưa có bài nộp trong phạm vi này.</p>';
  else if (markup) list.insertAdjacentHTML("beforeend", markup);
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
      showAppToast("\u0110\u00e3 x\u00f3a b\u00e0i n\u1ed9p.");
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
  return value ? new Date(value).toLocaleString("vi-VN") : "—";
}
function canManagePassword(user) {
  return (user?.identities || []).some((identity) => identity.provider === "email");
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
    const [profileResult, progressResult, historyResult] = await Promise.all([
      supabase.rpc("get_member_profile", { p_user_id: userId }),
      supabase.rpc("get_member_progress", { p_user_id: userId }),
      supabase.rpc("list_member_submissions", {
        p_user_id: userId,
        p_limit: 100,
      }),
    ]);
    const error =
      profileResult.error || progressResult.error || historyResult.error;
    if (error) throw error;
    const profile = profileResult.data?.[0];
    if (!profile) throw new Error("Không tìm thấy hồ sơ thành viên.");

    const ownProfile = userId === currentUser.id;
    const isAdmin = myRole === "admin" || myRole === "super_admin";
    const solved = Number(profile.solved || 0);
    const level = getMemberLevel(solved);
    const progress = progressResult.data || [];
    const history = historyResult.data || [];
    const historyNote = ownProfile
      ? "Chỉ bạn và Admin được xem các bản code chưa hoàn thành."
      : isAdmin
        ? "Bạn đang xem toàn bộ lịch sử code của thành viên này với quyền Admin."
        : "Các bản code chỉ hiển thị khi thành viên đã đạt 10/10 bài tương ứng.";
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
        <div class="profile-stat"><b>${Number(profile.total_points || 0).toFixed(1)}</b><span>Tổng điểm</span></div>
      </div>
      <div class="profile-level-track"><span style="width:${level.percent}%"></span></div>
      <p class="profile-subtle">${level.nextLevel ? `${solved}/${level.nextLevel.min} bài hoàn thành để lên cấp ${level.nextLevel.name}.` : "Đã đạt cấp bậc cao nhất."}</p>
      <section class="profile-section"><h3>Tiến độ bài tập</h3>
        <p class="profile-progress-hint">Vuốt ngang để xem các bài và điểm tốt nhất.</p>
        <div class="profile-progress-list" tabindex="0" role="list" aria-label="Tiến độ bài tập, vuốt ngang để xem thêm">${
          progress.length
            ? progress
                .map(
                  (item) =>
                    `<div class="profile-progress-item" role="listitem"><span class="profile-progress-title">${String(item.problem_id).padStart(3, "0")}. ${escapeHTML(taskTitle(item.problem_id))}</span><b>${Number(item.best_points ?? Number(item.best_score) / 2).toFixed(1)}/10 · ${Number(item.best_score)}/20</b></div>`,
                )
                .join("")
            : '<p class="profile-subtle">Chưa có tiến độ bài tập.</p>'
        }</div>
      </section>
      <section class="profile-section"><h3>Lịch sử code</h3><p class="profile-subtle">${historyNote}</p>
        ${
          history.length
            ? history
                .map(
                  (item) =>
                    `<details class="profile-history-item"><summary>Bài ${String(item.problem_id).padStart(3, "0")} · ${({accepted:"Đúng",partial:"Chưa đạt hết",wrong:"Sai",compile_error:"Lỗi biên dịch",runtime_error:"Lỗi chạy",cancelled:"Đã hủy"})[item.outcome] || "Đã chạy"} · ${item.test_no ? `Test ${item.test_no}` : `${item.tests_passed ?? 0}/20 test đúng`} · ${formatLocalDate(item.created_at)}</summary><pre>${escapeHTML(item.source_code)}</pre></details>`,
                )
                .join("")
            : '<p class="profile-subtle">Chưa có bản code sai hoặc chưa đạt được lưu để hiển thị.</p>'
        }
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
    return;
  }
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
    setAuthMsg("\u0110ang ki\u1ec3m tra t\u00e0i kho\u1ea3n...");
    let loginError;
    try { ({ error: loginError } = await supabase.auth.signInWithPassword({ email, password })); }
    catch (error) { setAuthMsg(translateAuthError(error), "err"); return; }
    if (!loginError) { clearPendingSignup(email); setAuthMsg("T\u00e0i kho\u1ea3n n\u00e0y \u0111\u00e3 t\u1ed3n t\u1ea1i v\u00e0 \u0111\u00e3 \u0111\u0103ng nh\u1eadp.", "ok"); return; }
    if (/email not confirmed/i.test(String(loginError.message || ""))) {
      rememberPendingSignup(email); setAuthMode("login"); $("authEmail").value = email; updateResendConfirmationVisibility();
      setAuthMsg("T\u00e0i kho\u1ea3n n\u00e0y \u0111ang ch\u1edd x\u00e1c nh\u1eadn email. Kh\u00f4ng g\u1eedi th\u00eam email; d\u00f9ng n\u00fat g\u1eedi l\u1ea1i n\u1ebfu c\u1ea7n.", "ok"); return;
    }
    if (!/invalid login credentials/i.test(String(loginError.message || ""))) { setAuthMsg(translateAuthError(loginError), "err"); return; }
    updateConfirmSignupVisibility(); setAuthMsg("Ch\u01b0a t\u00ecm th\u1ea5y t\u00e0i kho\u1ea3n v\u1edbi th\u00f4ng tin n\u00e0y. B\u1ea5m Ti\u1ebfp t\u1ee5c t\u1ea1o t\u00e0i kho\u1ea3n n\u1ebfu b\u1ea1n mu\u1ed1n g\u1eedi email x\u00e1c nh\u1eadn."); return;
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
$("authGoogle").addEventListener("click", async () => {
  if (!supabase) return;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin + window.location.pathname },
  });
  if (error) setAuthMsg(translateAuthError(error), "err");
});

renderAuthBox();
if (supabase) {
  // Không await Supabase trực tiếp trong callback (tránh treo SDK) nên dùng setTimeout.
  supabase.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => handleSession(session), 0);
  });
}

const STATUS_LABELS = {
  todo: "Chưa làm",
  doing: "Đã thử nhưng còn test sai",
  done: "Đạt 10/10",
};
function getTaskState(taskId) {
  const value = bestScores[taskId];
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
  const best = bestScores[current.id];
  $("scoreSummary").textContent =
    best === undefined
      ? "Điểm cao nhất: Chưa chấm"
      : `Điểm cao nhất: ${Number(best).toFixed(1)}/10`;
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
      const best = bestScores[t.id];
      const scoreText =
        best === undefined ? "" : ` · Cao nhất ${Number(best).toFixed(1)}/10`;
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
const CONCEPT_NOTES = new Map([
  [4, "Kiến thức cần nhớ: π là hằng số xấp xỉ 3,14. Chu vi hình tròn C = 2πr; diện tích S = πr². Dùng đúng giá trị π và cách làm tròn đề bài yêu cầu."],
  [16, "Kiến thức cần nhớ: Năm nhuận là năm chia hết cho 400, hoặc chia hết cho 4 nhưng không chia hết cho 100."],
  [20, "Kiến thức cần nhớ: Ba cạnh tạo thành tam giác khi tổng độ dài của từng cặp cạnh lớn hơn cạnh còn lại. Cần kiểm tra cả điều kiện độ dài dương."],
  [21, "Kiến thức cần nhớ: Tam giác đều có ba cạnh bằng nhau; tam giác cân có ít nhất hai cạnh bằng nhau; tam giác thường có ba cạnh khác nhau. Kiểm tra tính hợp lệ trước khi phân loại."],
  [22, "Kiến thức cần nhớ: Tam giác vuông thỏa mãn định lý Pythagore: bình phương cạnh lớn nhất bằng tổng bình phương hai cạnh còn lại. Ba cạnh cũng phải tạo thành tam giác hợp lệ."],
  [24, "Kiến thức cần nhớ: Với ax + b = 0, nếu a khác 0 thì x = -b/a. Nếu a = 0, phương trình có vô số nghiệm khi b = 0 và vô nghiệm khi b khác 0."],
  [30, "Kiến thức cần nhớ: Với ax² + bx + c = 0 và a khác 0, biệt thức Δ = b² - 4ac. Δ > 0 có hai nghiệm thực, Δ = 0 có nghiệm kép, Δ < 0 không có nghiệm thực."],
  [34, "Kiến thức cần nhớ: N! = 1 × 2 × ... × N; theo quy ước, 0! = 1. Hãy chú ý giới hạn kiểu dữ liệu để tránh tràn số."],
  [39, "Kiến thức cần nhớ: Số đối xứng có các chữ số đọc từ trái sang phải giống khi đọc từ phải sang trái. Ví dụ: 1221 và 7."],
  [40, "Kiến thức cần nhớ: GCD (ƯCLN) là ước dương lớn nhất cùng chia hết hai số. Bài này quy ước gcd(0,0) = 0."],
  [41, "Kiến thức cần nhớ: LCM (BCNN) là bội dương nhỏ nhất cùng chia hết cho hai số. Nếu một trong hai số bằng 0 thì theo đề, kết quả bằng 0."],
  [47, "Kiến thức cần nhớ: Dãy Fibonacci được xác định bởi F₀ = 0, F₁ = 1 và Fₙ = Fₙ₋₁ + Fₙ₋₂ với n ≥ 2."],
  [48, "Kiến thức cần nhớ: Số nguyên tố là số nguyên lớn hơn 1 chỉ có đúng hai ước dương: 1 và chính nó. Vì vậy 0, 1 và số âm không phải số nguyên tố."],
  [49, "Kiến thức cần nhớ: Khi đếm số nguyên tố trong [1, N], chỉ xét số nguyên lớn hơn 1; các số 0 và 1 không phải số nguyên tố."],
  [50, "Kiến thức cần nhớ: Ước dương của n là số nguyên dương chia n không dư. Chỉ đếm mỗi ước một lần."],
  [51, "Kiến thức cần nhớ: Ước thực sự của n là các ước dương nhỏ hơn n; không tính chính n."],
  [52, "Kiến thức cần nhớ: Số hoàn hảo là số nguyên dương bằng tổng các ước dương thực sự của nó. Ví dụ: 6 = 1 + 2 + 3."],
  [53, "Kiến thức cần nhớ: Số chữ số 0 tận cùng của N! được tính bằng tổng floor(N/5) + floor(N/25) + floor(N/125) + ...; không cần tính trực tiếp N!."],
  [59, "Kiến thức cần nhớ: Số Armstrong có k chữ số nếu bằng tổng từng chữ số lũy thừa k. Ví dụ: 153 = 1³ + 5³ + 3³."],
  [60, "Kiến thức cần nhớ: Phân tích thừa số nguyên tố có tính cả số lần lặp. Ví dụ: 12 = 2 × 2 × 3 có 3 thừa số nguyên tố."],
  [61, "Kiến thức cần nhớ: Thừa số nguyên tố lớn nhất là thừa số lớn nhất trong phân tích n thành tích các số nguyên tố; các thừa số lặp vẫn thuộc phân tích."],
  [63, "Kiến thức cần nhớ: Quy tắc Collatz: n chẵn thì chia 2; n lẻ thì đổi thành 3n + 1. Đếm số lần biến đổi cho đến khi đạt 1, không tính giá trị ban đầu là một bước."],
  [79, "Kiến thức cần nhớ: Số đối xứng là số có biểu diễn thập phân đọc xuôi và đọc ngược như nhau. Số 0 cũng là số đối xứng."],
  [80, "Kiến thức cần nhớ: Số Armstrong có k chữ số nếu bằng tổng từng chữ số lũy thừa k. Cần dùng số chữ số của từng số đang xét."],
  [86, "Kiến thức cần nhớ: Số Harshad (Niven) là số nguyên dương chia hết cho tổng các chữ số của chính nó."],
  [88, "Kiến thức cần nhớ: Hai số nguyên tố cùng nhau khi ƯCLN của chúng bằng 1. Không yêu cầu từng số riêng lẻ phải là số nguyên tố."],
  [90, "Kiến thức cần nhớ: Một số nguyên dương có đúng 3 ước dương khi và chỉ khi nó là bình phương của một số nguyên tố."],
  [94, "Kiến thức cần nhớ: Số nguyên tố phải lớn hơn 1; số đối xứng có biểu diễn thập phân đọc xuôi và đọc ngược như nhau. Một số phải thỏa mãn đồng thời cả hai điều kiện."],
  [95, "Kiến thức cần nhớ: Số chính phương là bình phương của một số nguyên không âm, chẳng hạn 0, 1, 4, 9, 16. Khi kiểm tra, tránh sai số do căn bậc hai thực."],
  [110, "Kiến thức cần nhớ: Trước hết kiểm tra số nguyên tố; sau đó tính tổng chữ số và kiểm tra tổng đó chẵn. Hai điều kiện phải cùng đúng."],
  [111, "Kiến thức cần nhớ: Số đối xứng là số có biểu diễn thập phân đọc xuôi và đọc ngược như nhau."],
  [115, "Kiến thức cần nhớ: Chỉ đếm các ước của N mà bản thân chúng là số nguyên tố. Mỗi giá trị nguyên tố chỉ tính một lần."],
  [116, "Kiến thức cần nhớ: Đếm các ước dương của N đồng thời là số chính phương; ước chính phương có dạng k² với k là số nguyên không âm."],
  [118, "Kiến thức cần nhớ: Hai số nguyên tố cùng nhau khi gcd(a,b) = 1. Điều kiện a < b nghĩa là mỗi cặp không phân biệt thứ tự và không ghép một số với chính nó."],
  [128, "Kiến thức cần nhớ: Số nguyên dương có đúng 3 ước dương khi và chỉ khi nó là bình phương của một số nguyên tố."],
  [129, "Kiến thức cần nhớ: Công thức Leibniz: π = 4(1 - 1/3 + 1/5 - 1/7 + ...). Dùng đúng N số hạng đầu và chú ý phép chia phải thực hiện trên kiểu số thực."],
]);

const RESULT_LABELS = {
  2: ["Hieu = ", "Tich = "],
  3: ["Chu vi = ", "Dien tich = "],
  4: ["Chu vi C = ", "Dien tich S = "],
  6: ["Thoi gian (HH:MM:SS) = "],
};
const SINGLE_RESULT_LABELS = {
  1: "Tong cua a va b = ",
  5: "Trung binh cong = ",
  7: "Hai so sau khi hoan doi = ",
  8: "Thuong va so du = ",
  9: "Tong tien phai tra = ",
  10: "So tien sau giam = ",
  25: "Tien dien phai tra = ",
  26: "Gia ve phai tra = ",
  27: "Phi van chuyen = ",
};
// VI: Bài không ghi ký hiệu biến trong mô tả vẫn cần nhãn nhập rõ ràng.
// EN: Add an explicit input prompt when the statement names a value, not a variable.
const INPUT_LABELS = {
  26: ["Nhap tuoi = "],
};
const OUTPUT_RULES = new Map([
  [2, "In hiệu ở dòng thứ nhất và tích ở dòng thứ hai, mỗi kết quả có nhãn riêng."],
  [3, "In chu vi trước, diện tích sau; mỗi kết quả trên một dòng và có nhãn."],
  [4, "In chu vi C trước, diện tích S sau; mỗi kết quả trên một dòng, làm tròn đúng 2 chữ số sau dấu chấm (.), giữ số 0 tận cùng."],
  [5, "In trung bình cộng với đúng 2 chữ số sau dấu chấm (.), giữ số 0 tận cùng."],
  [6, "In thời gian theo đúng mẫu HH:MM:SS; giờ có thể lớn hơn 23."],
  [10, "In giá sau giảm với đúng 2 chữ số sau dấu chấm (.), giữ số 0 tận cùng."],
  [21, "Chỉ in đúng một nhãn phân loại theo đề bài."],
  [23, "Chỉ in một chữ cái xếp loại, không kèm lời giải thích."],
  [24, "In đúng trường hợp vô nghiệm/vô số nghiệm hoặc nghiệm với đúng 2 chữ số sau dấu chấm (.), giữ số 0 tận cùng. Nếu nghiệm bằng 0, in 0.00 không có dấu âm."],
  [28, "Chỉ in đúng một nhãn vị trí theo đề bài."],
  [30, "Chỉ in đúng một nhãn phân loại nghiệm theo đề bài."],
  [65, "In đủ 10 dòng theo mẫu N x i = kết_quả; mỗi phép nhân trên một dòng."],
  [66, "In đúng N hàng và N cột; các số trên một hàng cách nhau đúng một dấu cách."],
  [67, "In đúng n hàng, mỗi hàng m dấu *; không thêm dòng mô tả."],
  [68, "In tam giác căn trái; dòng thứ i có đúng i dấu *."],
  [69, "In tam giác căn trái từ n dấu * giảm dần đến một dấu *."],
  [70, "In các số trên từng dòng, cách nhau đúng một dấu cách."],
  [71, "Dòng thứ i gồm i lần số i, các số cách nhau đúng một dấu cách."],
  [72, "Căn giữa kim tự tháp bằng dấu cách; dòng i có n-i dấu cách đầu dòng và 2*i-1 dấu *."],
  [73, "In kim tự tháp ngược; mỗi dòng sau thụt vào một dấu cách và giảm hai dấu *."],
  [74, "Chỉ in viền hình chữ nhật; phần trong là dấu cách và không có dấu cách thừa cuối dòng."],
  [75, "Bắt đầu bằng # ở góc trên trái; # và . thay phiên theo cả hàng lẫn cột."],
  [46, "In H với đúng 6 chữ số sau dấu chấm (.), giữ đủ các số 0 tận cùng."],
  [93, "In kết quả e^x với đúng 6 chữ số sau dấu chấm (.), giữ đủ các số 0 tận cùng."],
  [129, "In giá trị Pi xấp xỉ với đúng 6 chữ số sau dấu chấm (.), giữ đủ các số 0 tận cùng."],
  [130, "In S với đúng 6 chữ số sau dấu chấm (.), giữ đủ các số 0 tận cùng."],
  [131, "In S với đúng 6 chữ số sau dấu chấm (.), giữ đủ các số 0 tận cùng."],
  [132, "In S với đúng 6 chữ số sau dấu chấm (.), giữ đủ các số 0 tận cùng."],
  [133, "Chỉ in viền hình vuông; phần trong là dấu cách."],
  [134, "In hình X đúng kích thước N x N bằng dấu *."],
  [135, "In dấu cộng đúng kích thước N x N bằng dấu *."],
  [136, "Chỉ in hai cạnh và đáy của kim tự tháp; phần trong là dấu cách."],
  [137, "In đồng hồ cát theo đúng số hàng và vị trí dấu *."],
  [138, "In hình cánh bướm theo đúng hai nửa đối xứng."],
  [139, "In tam giác Floyd; các số cách nhau đúng một dấu cách."],
  [140, "In N dòng số 0 và 1 theo quy tắc bắt đầu của từng dòng."],
  [141, "In N dòng; dòng i gồm M lần số i, cách nhau đúng một dấu cách."],
  [142, "In đúng N hàng và M cột; phần tử hàng i, cột j bằng i*j."],
  [143, "In kim tự tháp số đối xứng và căn giữa bằng dấu cách."],
  [144, "In kim tự tháp số đối xứng ngược theo đúng số bậc."],
  [145, "In viền hình thoi rỗng; phần trong là dấu cách."],
  [146, "In hai cạnh và cạnh đáy của tam giác vuông rỗng."],
  [147, "In tam giác vuông ngược rỗng theo đúng số hàng."],
  [148, "Bắt đầu bằng X ở góc trên trái; X và dấu chấm thay phiên nhau."],
  [149, "In N dòng đầu của tam giác Pascal; các số cùng dòng cách nhau một dấu cách."],
  [150, "In hình bình hành rỗng; mỗi hàng lệch trái dần và chỉ có viền dấu *."],
]);

function taskSample(task) {
  const firstTest = task.tests?.[0] || {};
  return {
    input: String(task.sample_input ?? firstTest.input ?? ""),
    output: String(task.sample_output ?? firstTest.output ?? ""),
  };
}

function taskPresentation(task, input = taskSample(task).input) {
  const fieldNames = [];
  const inputDescription = String(task.input || "");
  const fieldPattern = /(^|[^\p{L}\p{N}])([A-Za-z])(?=$|[^\p{L}\p{N}])/gu;
  for (const match of inputDescription.matchAll(fieldPattern)) {
    const name = match[2];
    if (!fieldNames.includes(name)) fieldNames.push(name);
  }
  const inputCount = String(input || "").trim().split(/\s+/).filter(Boolean).length;
  const prompts = INPUT_LABELS[task.id] || fieldNames.slice(0, inputCount).map((name) => `Nhap ${name} = `);

  let resultLabel = SINGLE_RESULT_LABELS[task.id] || "Ket qua la: ";
  const title = String(task.title || "").toLocaleLowerCase("vi");
  if (task.id >= 65 && task.id <= 75 || task.id >= 91 && task.id <= 92 || task.id >= 133) {
    resultLabel = "Ket qua:\n";
  } else if (SINGLE_RESULT_LABELS[task.id]) {
  } else if (/đếm/.test(title)) {
    resultLabel = "So luong la: ";
  } else if (/tổng/.test(title)) {
    resultLabel = "Tong la: ";
  } else if (/tìm/.test(title)) {
    resultLabel = "Gia tri can tim la: ";
  } else if (/kiểm tra/.test(title)) {
    resultLabel = "Ket qua kiem tra: ";
  } else if (/bảng|dãy|day/.test(title)) {
    resultLabel = "Day so la:\n";
  }
  const lineLabels = RESULT_LABELS[task.id] || null;
  const formattedOutput = (rawOutput) => {
    const lines = String(rawOutput ?? "").split("\n");
    if (lineLabels && lineLabels.length === lines.length)
      return lines.map((line, index) => lineLabels[index] + line).join("\n");
    return resultLabel + String(rawOutput ?? "");
  };
  // EN: The judge supplies stdin without terminal echo. Keep program stdout
  // faithful, then build a visible terminal transcript with echoed inputs.
  // VI: Test dùng stdin nên không tự echo; giữ stdout thật và ghép input vào
  // transcript hiển thị ngay sau từng prompt.
  const promptText = prompts.join("");
  const inputEchoValues = (inputValue) => {
    const normalizedInput = String(inputValue ?? "").replace(/\r/g, "").trim();
    const tokens = normalizedInput ? normalizedInput.split(/\s+/) : [];
    const lines = normalizedInput ? normalizedInput.split("\n") : [];
    if (prompts.length && prompts.length === tokens.length) return tokens;
    if (prompts.length && prompts.length === lines.length) return lines;
    return null;
  };
  const expectedProgramOutput = (rawOutput) => promptText + formattedOutput(rawOutput);
  const expected = (rawOutput, inputValue = input) => {
    const values = inputEchoValues(inputValue);
    if (!values) return expectedProgramOutput(rawOutput);
    return prompts.map((prompt, index) => `${prompt}${values[index]}\n`).join("") + formattedOutput(rawOutput);
  };
  const renderConsoleOutput = (rawOutput, inputValue = input) => {
    const values = inputEchoValues(inputValue);
    if (!values) return String(rawOutput ?? "");
    let cursor = 0;
    let transcript = "";
    for (let index = 0; index < prompts.length; index++) {
      const promptAt = String(rawOutput ?? "").indexOf(prompts[index], cursor);
      if (promptAt < 0) return String(rawOutput ?? "");
      transcript += String(rawOutput ?? "").slice(cursor, promptAt);
      transcript += `${prompts[index]}${values[index]}\n`;
      cursor = promptAt + prompts[index].length;
    }
    return transcript + String(rawOutput ?? "").slice(cursor);
  };
  return {
    prompts,
    promptText,
    resultLabel,
    lineLabels,
    expected,
    expectedProgramOutput,
    renderConsoleOutput,
    guide: [
      "Mỗi lời nhắc nhập giữ trên cùng dòng với giá trị được nhập, đúng thứ tự sau:",
      ...(prompts.length ? prompts : ["Không có dữ liệu vào"]),
      "Test tự cấp dữ liệu và mô phỏng terminal hiện giá trị ngay sau lời nhắc. Không tự xuống dòng sau lời nhắc trước khi nhập.",
      "Mẫu phần kết quả:",
      ...(lineLabels || [resultLabel.trimEnd()]),
      OUTPUT_RULES.get(task.id) || "In đúng nhãn kết quả và thứ tự theo mẫu; không thêm lời giải thích hoặc nội dung thừa.",
    ].join("\n"),
  };
}

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
  const outputRule = `Kết quả: ${(presentation.lineLabels || [presentation.resultLabel.trimEnd()]).join(" · ")}`;
  const taskRule = OUTPUT_RULES.get(task.id);
  details.textContent = [inputRule, outputRule, taskRule].filter(Boolean).join("\n");
  guide.append(title, details);
}

function sampleTranscript(task) {
  const sample = taskSample(task);
  const presentation = taskPresentation(task, sample.input);
  return presentation.expected(sample.output, sample.input);
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
  const note = CONCEPT_NOTES.get(current.id) || "";
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
  $("tests").innerHTML = current.tests
    .map(
      (x, i) =>
        `<div class="case ${i === 0 ? "selected" : ""}" data-index="${i}"><div class="casehead"><b>TEST ${String(x.no).padStart(2, "0")}</b><button data-copy="${i}" type="button">Chép input</button></div><div class="casegrid"><div><label>Input</label><pre>${escapeHTML(x.input)}</pre></div><div><label>Expected output</label><pre>${escapeHTML(taskPresentation(current, x.input).expected(x.output))}</pre></div></div></div>`,
    )
    .join("");
  $("tests").classList.add("collapsed");
  $("toggleTests").textContent = `Hiện tất cả ${current.tests.length} test`;
  $("toggleTests").setAttribute("aria-expanded", "false");
  document.querySelectorAll(".case").forEach((c) =>
    c.addEventListener("click", (e) => {
      if (e.target.dataset.copy !== undefined) {
        e.stopPropagation();
        navigator.clipboard?.writeText(
          current.tests[+e.target.dataset.copy].input,
        );
        return;
      }
      document
        .querySelectorAll(".case")
        .forEach((x) => x.classList.remove("selected"));
      c.classList.add("selected");
      $("stdin").value = current.tests[+c.dataset.index].input;
      setStatus(
        "Đã nạp TEST " + String(+c.dataset.index + 1).padStart(2, "0") + ".",
        "",
      );
    }),
  );
  $("stdin").value = current.tests[0].input;
  updateProgress();
  updateScore();
  renderRunViewForCurrentTask();
  const saved = loadSavedCode(current);
  $("code").value = saved === null ? starter : saved;
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
    maxScoreAtStart: Number(bestScores[task.id] ?? 0) >= 10,
    controller: new AbortController(),
    state: "running",
    pass: 0,
    formatErrors: 0,
    presentationPenalty: 0,
    lines: [],
    currentTest: 0,
    total: kind === "batch" ? task.tests.length : 1,
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

function buildTaskPdfHtml(task) {
  const testsHtml = task.tests
    .map(
      (test) => `
    <article class="test-case">
      <h3>TEST ${String(test.no).padStart(2, "0")}</h3>
      <div class="io-grid">
        <section><h4>INPUT</h4><pre>${escapeHTML(test.input)}</pre></section>
        <section><h4>OUTPUT MONG ĐỢI</h4><pre>${escapeHTML(test.output)}</pre></section>
      </div>
    </article>`,
    )
    .join("");

  return `<!doctype html>
<html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bài ${String(task.id).padStart(3, "0")} - ${escapeHTML(task.title)}</title>
<style>
  @page { size: A4; margin: 15mm 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #172033; font: 11pt/1.55 Arial, Helvetica, sans-serif; }
  .toolbar { position: sticky; top: 0; padding: 12px; background: #eef2f8; text-align: center; border-bottom: 1px solid #ccd4e1; }
  .toolbar button { border: 0; border-radius: 7px; padding: 9px 18px; background: #344a80; color: #fff; font-weight: 700; cursor: pointer; }
  .document { max-width: 190mm; margin: 0 auto; padding: 8mm 0; }
  .brand { color: #415a91; font-size: 10pt; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
  h1 { margin: 5px 0 4px; font-size: 21pt; line-height: 1.25; }
  .meta { color: #596579; font-size: 9.5pt; margin-bottom: 14px; }
  h2 { margin: 16px 0 7px; padding-bottom: 4px; border-bottom: 1px solid #d7deea; font-size: 13pt; }
  h3 { margin: 0 0 7px; font-size: 10.5pt; color: #334a7d; }
  h4 { margin: 0 0 4px; color: #53627a; font-size: 8.5pt; text-transform: uppercase; }
  p { margin: 5px 0 9px; }
  .info-grid, .io-grid, .sample-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
  .info, .sample, .test-case { border: 1px solid #d6dce7; border-radius: 6px; padding: 9px; }
  .constraints { border-left: 3px solid #b28b36; padding: 7px 10px; margin: 10px 0; background: #faf7ef; }
  pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font: 9pt/1.45 Consolas, monospace; }
  .test-list { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .test-case { break-inside: avoid; page-break-inside: avoid; }
  .footer { margin-top: 16px; padding-top: 7px; border-top: 1px solid #d7deea; color: #697487; font-size: 8pt; }
  @media print { .toolbar { display: none; } .document { padding: 0; max-width: none; } }
  @media screen { body { background: #f4f6fa; } .document { background: #fff; min-height: 100vh; padding: 14mm; box-shadow: 0 2px 20px #24314a18; } }
</style></head><body>
<div class="toolbar"><button onclick="window.print()">In / Lưu thành PDF</button> <span>Chọn “Save as PDF / Lưu dưới dạng PDF” trong hộp thoại in.</span></div>
<main class="document">
  <div class="brand">TLU · C++ MIDTERM LAB</div>
  <h1>Bài ${String(task.id).padStart(3, "0")}. ${escapeHTML(task.title)}</h1>
  <div class="meta">${escapeHTML(task.section)} · Mức độ: ${escapeHTML(task.level)} · C++20</div>
  <h2>Đề bài</h2><p>${escapeHTML(task.statement)}</p>
  <div class="info-grid">
    <section class="info"><h3>INPUT</h3><p>${escapeHTML(task.input)}</p></section>
    <section class="info"><h3>OUTPUT</h3><p>${escapeHTML(task.output)}</p></section>
  </div>
  <div class="constraints"><strong>Ràng buộc:</strong> ${escapeHTML(task.constraints)}</div>
  <h2>Ví dụ</h2>
  <div class="sample-grid">
    <section class="sample"><h4>Sample input</h4><pre>${escapeHTML(task.sample_input ?? "")}</pre></section>
    <section class="sample"><h4>Sample output</h4><pre>${escapeHTML(task.sample_output ?? "")}</pre></section>
  </div>
  <h2>20 test case tự kiểm tra</h2>
  <div class="test-list">${testsHtml}</div>
  <div class="footer">Tài liệu luyện tập được tạo tự động từ dữ liệu của website TLU C++. Các test trong tài liệu này là test luyện tập công khai.</div>
</main></body></html>`;
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
  printWindow.document.write(buildTaskPdfHtml(current));
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
  const expanded = $("tests").classList.toggle("collapsed") === false;
  $("toggleTests").textContent = expanded
    ? "Thu gọn test case"
    : `Hiện tất cả ${current.tests.length} test`;
  $("toggleTests").setAttribute("aria-expanded", expanded ? "true" : "false");
});
$("code").addEventListener("input", () => {
  try {
    localStorage.setItem("cppcode_" + storageId(current), $("code").value);
  } catch (_) {}
});
$("resetcode").onclick = () => {
  $("code").value = starter;
  try {
    localStorage.setItem("cppcode_" + storageId(current), starter);
  } catch (_) {}
};
$("clearcode").onclick = () => {
  $("code").value = "";
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
    new URL("./workers/cpp-compiler-worker.js", import.meta.url),
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
    new URL("./workers/cpp-runner-worker.js", import.meta.url),
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
    output: String(result.stdout || "").replace(/\r/g, ""),
    stderr: String(result.stderr || "").trimEnd(),
    runtimeError: result.runtimeError || "",
    timeLimitExceeded: false,
    exitCode: String(result.exitCode ?? 1),
  };
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
function normalizeProgramOutput(value) {
  return String(value ?? "").replace(/\r\n?/g, "\n").replace(/\n$/, "");
}
function hasExpectedSemanticOutput(actual, expected, task) {
  const a = normalizeProgramOutput(actual);
  const e = normalizeProgramOutput(expected);
  const numericOnly = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:\s+[+-]?(?:\d+(?:\.\d*)?|\.\d+))*$/;
  if (numericOnly.test(e.trim())) {
    const decimals = Number(String(task.output || "").match(/(\d+)\s+chữ số sau/)?.[1]);
    const numberPattern = Number.isInteger(decimals)
      ? /[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)/g
      : /[+-]?(?:\d+(?:\.\d*)?|\.\d+)/g;
    const parseNumbers = (text) =>
      (text.match(numberPattern) || []).map((number) => Number(number.replace(",", ".")));
    const expectedNumbers = parseNumbers(e);
    const actualNumbers = parseNumbers(a);
    if (expectedNumbers.length && actualNumbers.length >= expectedNumbers.length) {
      const actualSuffix = actualNumbers.slice(-expectedNumbers.length);
      if (expectedNumbers.every((number, index) => number === actualSuffix[index])) return true;
      if (Number.isInteger(decimals) && decimals >= 0 && decimals <= 10) {
        const scale = 10 ** decimals;
        if (expectedNumbers.every((number, index) =>
          Math.round(actualSuffix[index] * scale + Number.EPSILON) / scale === number,
        )) return true;
      }
    }
  }
  const trimLineTails = (text) => text.split("\n").map((line) => line.replace(/[\t ]+$/g, "")).join("\n").replace(/\n+$/g, "");
  return trimLineTails(a).includes(trimLineTails(e));
}
// VI: Phân loại mức lỗi trình bày sau khi đã khớp nội dung đáp án. EN: Rank formatting-only mismatches after semantic output matches.
function presentationSeverity(actual, expected, presentation) {
  const compact = (value) => String(value ?? "").toLocaleLowerCase("vi").replace(/[\s\p{P}\p{S}]/gu, "");
  if (compact(actual) === compact(expected)) return 0.05;
  const required = [...presentation.prompts, ...(presentation.lineLabels || [presentation.resultLabel])];
  const actualText = normalizeProgramOutput(actual);
  const allLabelsPresent = required.every((label) => actualText.includes(label));
  if (!allLabelsPresent) return 0.10;
  return 0.15;
}
function classifyTestResult(result, task, test) {
  if (result.timeLimitExceeded) return { status: "TLE", message: "QUÁ THỜI GIAN", penalty: 0 };
  if (result.exitCode !== "0") return { status: "RUNTIME", message: "LỖI CHẠY", penalty: 0 };
  const presentation = taskPresentation(task, test.input);
  const actual = normalizeProgramOutput(result.output);
  const expectedProgramOutput = normalizeProgramOutput(
    presentation.expectedProgramOutput(test.output),
  );
  if (actual === expectedProgramOutput) return { status: "PASS", message: "ĐÚNG", penalty: 0 };
  if (hasExpectedSemanticOutput(actual, test.output, task)) {
    const expectedTranscript = presentation.expected(test.output, test.input);
    const actualTranscript = presentation.renderConsoleOutput(actual, test.input);
    return {
      status: "PRESENTATION",
      message: "ĐÚNG THUẬT TOÁN · LỖI TRÌNH BÀY",
      penalty: presentationSeverity(actualTranscript, expectedTranscript, presentation),
    };
  }
  return { status: "FAIL", message: "SAI", penalty: 0 };
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
      : { status: "FAIL", message: "INPUT KHÔNG THUỘC TEST", penalty: 0 };
    const ok = grade.status === "PASS";
    const singleRunOutcome = !target
      ? "wrong"
      : result.timeLimitExceeded || result.exitCode !== "0"
        ? "runtime_error"
        : grade.status === "FAIL"
          ? "wrong"
          : "partial";
    await saveRunSubmission(job, null, target?.no || null, singleRunOutcome);
    job.state = "completed";
    const text = result.timeLimitExceeded
      ? "Kết quả: TIME LIMIT EXCEEDED (TLE)\nChương trình vượt giới hạn thực thi 1,0 giây."
      : "Program output:\n" +
        (target
          ? taskPresentation(task, target.input).renderConsoleOutput(result.output, target.input)
          : result.output || "(không có output)") +
        (result.stderr ? "\n\nStandard error:\n" + result.stderr : "") +
        (result.runtimeError ? "\n\nRuntime error:\n" + result.runtimeError : "") +
        (target
          ? "\n\nExpected output:\n" + taskPresentation(task, target.input).expected(target.output)
          : "\n\nInput này không thuộc 20 test mẫu.");
    updateJobView(
      job,
      result.timeLimitExceeded
        ? "QUÁ THỜI GIAN (TLE) · Vượt giới hạn 1,0 giây."
        : grade.message,
      ok
        ? "ok"
        : grade.status === "PRESENTATION"
          ? "warn"
        : result.timeLimitExceeded
          ? "warn"
          : result.exitCode !== "0"
            ? "low"
            : "err",
      text +
        "\n\nChạy riêng một test không làm thay đổi điểm cao nhất.",
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
    for (let i = 0; i < job.task.tests.length; i++) {
      if (job.controller.signal.aborted)
        throw new DOMException("Đã hủy phiên chấm.", "AbortError");
      job.currentTest = i + 1;
      updateJobView(
        job,
        `Đang chấm bài ${job.taskId}: TEST ${i + 1}/${job.total} · Đúng ${job.pass} test. Chuyển sang bài khác không làm dừng phiên này.`,
        "",
        job.lines.join("\n"),
      );
      const test = job.task.tests[i];
      const result = await runCompiled(module, test.input, job.controller.signal);
      if (job.controller.signal.aborted)
        throw new DOMException("Đã hủy phiên chấm.", "AbortError");
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
    // VI: Chấm đủ test trước rồi mới trừ tổng lỗi trình bày; không hạ điểm cao nhất đã lưu.
    // EN: Apply the capped formatting deduction after all tests; preserve the saved high score.
    const requestedPenalty = Math.min(1.5, job.presentationPenalty);
    const rawScore = Math.max(0, job.pass * 0.5 - requestedPenalty);
    const score = job.formatErrors
      ? Math.floor(rawScore * 10 + 1e-8) / 10
      : rawScore;
    const appliedPenalty = Math.max(0, job.pass * 0.5 - score);
    const suspendedForRun = accountSuspended;
    const oldBest =
      bestScores[job.taskId] === undefined
        ? -1
        : Number(bestScores[job.taskId]);
    const improved = score > oldBest;
    if (improved && !suspendedForRun) {
      bestScores[job.taskId] = score;
      bestScoreMeta[job.taskId] = { testsPassed: job.pass, points: score };
      persistScores();
    }
    job.state = "completed";
    await saveRunSubmission(
      job,
      job.pass,
      null,
      job.pass === job.total && job.formatErrors === 0
        ? "accepted"
        : job.pass === 0
          ? "wrong"
          : "partial",
    );
    const cloudNote = suspendedForRun ? "\nT\u00e0i kho\u1ea3n \u0111ang b\u1ecb \u0111\u00ecnh ch\u1ec9: l\u01b0\u1ee3t ch\u1ea5m n\u00e0y kh\u00f4ng t\u00ednh \u0111i\u1ec3m." : await syncScoreAfterGrading(job.taskId, job.pass, score);
    const best = Number(bestScores[job.taskId] ?? (suspendedForRun ? 0 : score));
    const summary = suspendedForRun
      ? `\n\nHoàn tất: ${job.pass}/${job.total} test đúng thuật toán; ${job.formatErrors} test lỗi trình bày. Tài khoản đang bị đình chỉ nên lượt này không được tính điểm.\nĐiểm cao nhất đã lưu trước đó: ${best.toFixed(1)}/10.${cloudNote}`
      : `\n\nHoàn tất: ${job.pass}/${job.total} test đúng thuật toán; ${job.formatErrors} test lỗi trình bày.\nTrừ ${appliedPenalty.toFixed(1)} điểm do trình bày. Điểm lượt này: ${score.toFixed(1)}/10.\nĐiểm cao nhất được lưu: ${best.toFixed(1)}/10${improved ? " (đã cập nhật)" : " (giữ nguyên, không bị giảm)"}.${cloudNote}`;
    updateJobView(
      job,
      `Đã chấm xong bài ${job.taskId}: ${job.pass}/${job.total} test đúng · Điểm cao nhất ${best.toFixed(1)}/10.`,
      scoreStatusClass(Math.floor(best * 2), job.total),
      job.lines.join("\n") + summary,
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
selectTask(TASKS[0].id); // [ADMIN] bài đầu tiên theo thứ tự hiển thị (trước đây là bài số 1)
