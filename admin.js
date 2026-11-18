// Khu vực Quản trị (Admin / Super Admin). Nạp động từ script.js khi bấm nút "Quản trị".
// Mọi thao tác ghi đều cần Supabase kiểm tra lại bằng RLS / RPC đã cấu hình trong dự án Supabase;
// việc ẩn nút ở giao diện chỉ để tiện dùng, KHÔNG phải lớp bảo mật.
// VI: Công cụ quản trị được bổ sung theo yêu cầu của chủ dự án; AI có hỗ trợ viết và chỉnh sửa mã. EN: Admin tools follow the project owner's requirements; AI assisted with writing and editing code.

const CSS_URL = new URL("./admin.css", import.meta.url).href;
const DATA_FILES = [
  "./data/part1.json",
  "./data/part2.json",
  "./data/part3.json",
  "./data/part4.json",
].map((f) => new URL(f, import.meta.url));
const MIN_TESTS = 1;
const MAX_TESTS = 30;
const hasValidTestCount = (count) => Number.isInteger(count) && count >= MIN_TESTS && count <= MAX_TESTS;

const PRIMARY = [
  ["dash", "▦", "Tổng quan"],
  ["problems", "✎", "Bài tập"],
  ["users", "👥", "Người dùng"],
];
const SECONDARY = [
  ["stats", "📊", "Thống kê", false],
  ["admins", "🛡", "Quản trị viên", true],
  ["audit", "🕘", "Nhật ký hoạt động", true],
];
const ACTION_LABELS = {
  problem_insert: "Thêm bài tập",
  problem_update: "Sửa bài tập",
  problem_delete: "Xóa bài tập",
  tests_saved: "Lưu test case",
  user_locked: "Khóa tài khoản",
  user_unlocked: "Mở khóa tài khoản",
  role_granted_admin: "Cấp quyền Admin",
  role_revoked_admin: "Thu hồi quyền Admin",
  profile_rename: "Đổi tên hiển thị",
};
const ROLE_LABELS = {
  student: "Student",
  admin: "Admin",
  super_admin: "Super Admin",
};

let ctx, sb, root, isSuper, dirty, state;

const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const fmt = (d) =>
  d
    ? new Date(d).toLocaleString("vi-VN", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";
const $ = (s, r) => (r || root).querySelector(s);
const pad3 = (n) => String(n).padStart(3, "0");
const roleBadge = (r) =>
  `<span class="adm-badge ${r === "super_admin" ? "sup" : r === "admin" ? "adm" : ""}">${ROLE_LABELS[r] || esc(r)}</span>`;

async function rpc(name, args) {
  const { data, error } = await sb.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}
async function q(promise) {
  const { data, error } = await promise;
  if (error) throw new Error(error.message);
  return data;
}
function taskTitle(id) {
  const t = (ctx.tasks || []).find((x) => String(x.id) === String(id));
  return t ? t.title : "";
}

// ---------- Thông báo & hộp thoại ----------
function toast(msg, kind) {
  document.querySelectorAll(".adm-toast").forEach((e) => e.remove());
  const el = document.createElement("div");
  el.className = "adm-toast " + (kind || "");
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), kind === "err" ? 6000 : 3000);
}
function confirmBox(message, { danger = false, okText = "Xác nhận" } = {}) {
  return new Promise((resolve) => {
    const m = document.createElement("div");
    m.className = "adm-modal center";
    m.style.zIndex = 80;
    m.innerHTML = `<div class="adm-panel"><h2>Xác nhận</h2><p style="color:var(--muted);font-size:13.5px;line-height:1.6;margin:10px 0 18px">${esc(message)}</p>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button class="adm-btn" data-r="0">Hủy</button><button class="adm-btn ${danger ? "danger" : "primary"}" data-r="1">${esc(okText)}</button></div></div>`;
    m.addEventListener("click", (e) => {
      const b = e.target.closest("[data-r]");
      if (b || e.target === m) {
        m.remove();
        resolve(!!b && b.dataset.r === "1");
      }
    });
    document.body.appendChild(m);
  });
}
function openModal(html, center) {
  const m = document.createElement("div");
  m.className = "adm-modal" + (center ? " center" : "");
  m.innerHTML = `<div class="adm-panel">${html}</div>`;
  root.appendChild(m);
  return m;
}

// ---------- Khung giao diện ----------
export function openAdmin(c) {
  ctx = c;
  sb = c.supabase;
  isSuper = c.role === "super_admin";
  dirty = false;
  state = { view: "dash" };
  if (!document.getElementById("admCss")) {
    const l = document.createElement("link");
    l.id = "admCss";
    l.rel = "stylesheet";
    l.href = CSS_URL;
    document.head.appendChild(l);
  }
  document.getElementById("admRoot")?.remove();
  root = document.createElement("div");
  root.id = "admRoot";
  root.className = "adm-root";
  const menuItem = (v, ic, label, mobile) =>
    `<button class="adm-item ${mobile ? "mobile-only" : ""}" data-view="${v}">${ic}<span>${label}</span></button>`;
  root.innerHTML = `
    <nav class="adm-nav">
      <div class="adm-brand"><span class="adm-logo">⚙</span><span>Quản trị</span></div>
      <div class="adm-tabs">${PRIMARY.map(([v, ic, l]) => `<button class="adm-tab" data-view="${v}">${ic} ${l}</button>`).join("")}</div>
      <div class="adm-spacer"></div>
      <span class="adm-role ${isSuper ? "super" : ""}">${isSuper ? "★ Super Admin" : "Admin"}</span>
      <div class="adm-more">
        <button class="adm-iconbtn" id="admMenuBtn" aria-label="Menu" aria-expanded="false">☰</button>
        <div class="adm-menu" id="admMenu" hidden>
          ${PRIMARY.map(([v, ic, l]) => menuItem(v, ic, l, true)).join("")}
          <hr class="mobile-only" />
          ${SECONDARY.filter((s) => !s[3] || isSuper)
            .map(([v, ic, l, sup]) =>
              menuItem(v, ic, l + (sup ? "" : ""), false).replace(
                "</button>",
                sup ? "<small>Super</small></button>" : "</button>",
              ),
            )
            .join("")}
          <hr />
          <button class="adm-item" data-act="close">↩<span>Về trang luyện tập</span></button>
        </div>
      </div>
      <button class="adm-iconbtn" data-act="close" aria-label="Đóng" title="Đóng">✕</button>
    </nav>
    <div class="adm-body" id="admBody"></div>`;
  document.body.appendChild(root);
  document.body.classList.add("no-scroll");

  root.addEventListener("click", (e) => {
    const menu = $("#admMenu");
    const mb = e.target.closest("#admMenuBtn");
    if (mb) {
      menu.hidden = !menu.hidden;
      mb.setAttribute("aria-expanded", String(!menu.hidden));
      return;
    }
    if (!e.target.closest("#admMenu")) menu.hidden = true;
    const v = e.target.closest("[data-view]");
    if (v && !e.target.closest("#admBody")) {
      menu.hidden = true;
      show(v.dataset.view);
    } else if (e.target.closest("[data-act=close]")) closeAdmin();
  });
  document.addEventListener("keydown", onKey);
  show("dash");
}
function onKey(e) {
  if (e.key !== "Escape" || !root) return;
  const modals = root.querySelectorAll(".adm-modal");
  if (modals.length) modals[modals.length - 1].remove();
}
function closeAdmin() {
  document.removeEventListener("keydown", onKey);
  root?.remove();
  root = null;
  if (!document.querySelector(".auth-overlay:not([hidden])"))
    document.body.classList.remove("no-scroll");
  if (ctx.onClose) ctx.onClose(dirty);
}

const VIEWS = {
  dash: viewDash,
  stats: viewStats,
  problems: viewProblems,
  users: viewUsers,
  admins: viewAdmins,
  audit: viewAudit,
};
async function show(view) {
  if ((view === "admins" || view === "audit") && !isSuper) view = "dash";
  state.view = view;
  root
    .querySelectorAll(".adm-tab,.adm-item[data-view]")
    .forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  const body = $("#admBody");
  body.innerHTML = '<div class="adm-loading">Đang tải…</div>';
  try {
    await VIEWS[view](body);
  } catch (err) {
    body.innerHTML = `<div class="adm-note err">Lỗi: ${esc(err.message)}<br>Nếu báo thiếu hàm/bảng, hãy kiểm tra cấu trúc dữ liệu và các hàm RPC đã được cấu hình trong Supabase.</div>
      <button class="adm-btn" id="admRetry">Thử lại</button>`;
    $("#admRetry").onclick = () => show(view);
  }
}
const head = (title, sub, extra) =>
  `<div class="adm-h"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ""}</div><div>${extra || ""}</div></div>`;

// ---------- Tổng quan ----------
async function viewDash(body) {
  const s = await rpc("admin_stats");
  const cards = [
    [
      "Người dùng",
      s.total_users,
      `${s.locked_users} tài khoản bị khóa`,
      "#6e5dc4",
    ],
    [
      "Hoạt động 7 ngày",
      s.active_users,
      "người có chấm bài gần đây",
      "#36c27b",
    ],
    ["Bài đạt 10/10", s.completed, "tính theo lượt (người × bài)", "#edbd4d"],
    ["Điểm trung bình", `${s.avg_score}/10`, "trên các bài đã làm", "#6fc9e8"],
    [
      "Bài đã xuất bản",
      `${s.published}/${s.problems}`,
      "hiển thị cho học viên",
      "#9c8cff",
    ],
    ["Lượt bài đã làm", s.attempts, "bản ghi tiến độ", "#ff858d"],
    ["Quản trị viên", s.admins, "Admin + Super Admin", "#f2c879"],
    ["Bị khóa", s.locked_users, "không ghi được điểm", "#9aa3b2"],
  ];
  body.innerHTML =
    head(
      "Tổng quan",
      "Tình hình hệ thống hiện tại",
      `<button class="adm-btn primary" data-go="new">＋ Thêm bài tập</button>`,
    ) +
    `<div class="adm-grid c4">${cards
      .map(
        ([l, v, sub, c]) =>
          `<div class="adm-card adm-stat" style="--tint:${c}"><div class="lbl">${l}</div><div class="val">${esc(v)}</div><div class="sub">${sub}</div></div>`,
      )
      .join("")}</div>
    <div class="adm-grid c2" style="margin-top:14px">
      <div class="adm-card"><h2>Lối tắt</h2><div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="adm-btn" data-go="problems">✎ Quản lý bài tập</button>
        <button class="adm-btn" data-go="users">👥 Quản lý người dùng</button>
        <button class="adm-btn" data-go="stats">📊 Xem thống kê chi tiết</button>
        ${isSuper ? '<button class="adm-btn" data-go="admins">🛡 Quản trị viên</button>' : ""}</div></div>
      <div class="adm-card"><h2>Lưu ý</h2><p style="margin:0;color:var(--muted);font-size:13px;line-height:1.6">
        Thay đổi bài tập/test sẽ hiện cho học viên sau khi họ tải lại trang. Bài đã <b>xuất bản</b> cần có từ <b>${MIN_TESTS} đến ${MAX_TESTS} test</b>.</p></div></div>`;
  body.onclick = (e) => {
    const g = e.target.closest("[data-go]");
    if (!g) return;
    if (g.dataset.go === "new")
      show("problems").then(() => openProblemEditor(null));
    else show(g.dataset.go);
  };
}

// ---------- Thống kê ----------
function bars(items, labelKey, valKey) {
  const max = Math.max(1, ...items.map((i) => i[valKey]));
  return `<div class="adm-bars">${items
    .map(
      (i) =>
        `<div class="adm-bar" title="${esc(i[labelKey])}: ${i[valKey]}"><em>${i[valKey]}</em><i style="height:${Math.max(2, (i[valKey] / max) * 100)}%"></i><b>${esc(i[labelKey])}</b></div>`,
    )
    .join("")}</div>`;
}
async function viewStats(body) {
  const s = await rpc("admin_stats");
  const hist = s.histogram.map((c, i) => ({ l: String(i), n: Number(c) }));
  const per = [...s.per_problem]
    .sort((a, b) => b.attempted - a.attempted)
    .slice(0, 40);
  body.innerHTML =
    head("Thống kê", "Điểm và tiến độ học tập (điểm mỗi bài: 0–10)") +
    `<div class="adm-grid c2">
      <div class="adm-card"><h2>Phân bố điểm cao nhất (số lượt bài theo mức điểm)</h2>${bars(hist, "l", "n")}</div>
      <div class="adm-card"><h2>Đăng ký mới 14 ngày qua</h2>${bars(
        s.signups.map((x) => ({ l: x.day, n: Number(x.n) })),
        "l",
        "n",
      )}</div></div>
    <div class="adm-card" style="margin-top:14px"><h2>Theo từng bài (nhiều người làm nhất)</h2>
      <div class="adm-tablewrap"><table class="adm-table"><thead><tr><th>Bài</th><th>Đã làm</th><th>Đạt 10/10</th><th>Tỉ lệ</th><th>Điểm TB</th></tr></thead><tbody>
      ${
        per.length
          ? per
              .map((r) => {
                const rate = r.attempted
                  ? Math.round((r.completed / r.attempted) * 100)
                  : 0;
                return `<tr><td><span class="ttl">${pad3(r.problem_id)}</span> <span class="mut">${esc(taskTitle(r.problem_id))}</span></td><td>${r.attempted}</td><td>${r.completed}</td>
          <td><div class="adm-progress"><i style="width:${rate}%"></i></div><span class="mut">${rate}%</span></td><td>${r.avg}/10</td></tr>`;
              })
              .join("")
          : '<tr><td colspan="5" class="adm-empty">Chưa có dữ liệu.</td></tr>'
      }</tbody></table></div></div>`;
}

// ---------- Bài tập ----------
async function loadProblems() {
  state.problems = await q(
    sb
      .from("problems")
      .select(
        "id,title,section,level,sort_order,is_published,test_cases(count)",
      )
      .order("sort_order")
      .order("id"),
  );
  return state.problems;
}
const testCount = (p) => p.test_cases?.[0]?.count ?? 0;
const partOf = (p) => (/^Phần\s*(\d+)/.exec(p.section) || [])[1] || "?";

async function viewProblems(body) {
  await loadProblems();
  state.pf = state.pf || { text: "", part: "all", status: "all" };
  body.innerHTML =
    head(
      "Quản lý bài tập",
      "Thêm, sửa, xóa, sắp xếp thứ tự, quản lý test case",
      `<button class="adm-btn" data-act="import">⇪ Nhập từ file JSON</button> <button class="adm-btn primary" data-act="new">＋ Thêm bài</button>`,
    ) +
    `<div class="adm-toolbar"><input class="adm-input" id="pfText" placeholder="Tìm theo số hoặc tên bài…" value="${esc(state.pf.text)}">
      <select class="adm-select" id="pfPart"><option value="all">Mọi phần</option>${[1, 2, 3, 4].map((n) => `<option value="${n}">Phần ${n}</option>`).join("")}</select>
      <select class="adm-select" id="pfStatus"><option value="all">Mọi trạng thái</option><option value="pub">Đã xuất bản</option><option value="draft">Bản nháp</option><option value="bad">Số test không hợp lệ</option></select></div>
    <div id="pList"></div>`;
  $("#pfPart").value = state.pf.part;
  $("#pfStatus").value = state.pf.status;
  const rerender = () => renderProblemList();
  $("#pfText").oninput = (e) => ((state.pf.text = e.target.value), rerender());
  $("#pfPart").onchange = (e) => ((state.pf.part = e.target.value), rerender());
  $("#pfStatus").onchange = (e) => (
    (state.pf.status = e.target.value),
    rerender()
  );
  body.onclick = onProblemsClick;
  renderProblemList();
}
function filteredProblems() {
  const { text, part, status } = state.pf;
  const t = text.trim().toLowerCase();
  return state.problems.filter(
    (p) =>
      (!t || String(p.id).includes(t) || p.title.toLowerCase().includes(t)) &&
      (part === "all" || partOf(p) === part) &&
      (status === "all" ||
        (status === "pub" && p.is_published) ||
        (status === "draft" && !p.is_published) ||
        (status === "bad" && !hasValidTestCount(testCount(p)))),
  );
}
function renderProblemList() {
  const list = filteredProblems();
  const box = $("#pList");
  if (!state.problems.length) {
    box.innerHTML = `<div class="adm-card adm-empty">Chưa có bài nào trong cơ sở dữ liệu.<br><br>Bấm <b>“Nhập từ file JSON”</b> để chuyển 150 bài hiện có sang Supabase, hoặc <b>“Thêm bài”</b> để tạo bài mới.</div>`;
    return;
  }
  box.innerHTML = `<div class="adm-tablewrap"><table class="adm-table"><thead><tr><th>#</th><th>Bài</th><th>Phần</th><th>Mức độ</th><th>Test</th><th>Xuất bản</th><th></th></tr></thead><tbody>
    ${
      list
        .map((p) => {
          const n = testCount(p);
          return `<tr data-id="${p.id}"><td><b>${pad3(p.id)}</b></td><td class="ttl">${esc(p.title)}</td><td class="mut">${esc(p.section.split(" - ")[0])}</td>
        <td>${esc(p.level)}</td><td><span class="adm-badge ${hasValidTestCount(n) ? "ok" : "warn"}">${n} test</span></td>
        <td><button class="adm-switch ${p.is_published ? "on" : ""}" data-act="pub" aria-label="Xuất bản"></button></td>
        <td><div class="adm-actions"><button class="adm-btn sm" data-act="up" title="Lên">↑</button><button class="adm-btn sm" data-act="down" title="Xuống">↓</button>
        <button class="adm-btn sm" data-act="edit">Sửa</button><button class="adm-btn sm danger" data-act="del">Xóa</button></div></td></tr>`;
        })
        .join("") ||
      '<tr><td colspan="7" class="adm-empty">Không có bài phù hợp.</td></tr>'
    }</tbody></table></div>
    <p class="mut" style="color:var(--muted);font-size:12px;margin-top:8px">Hiển thị ${list.length}/${state.problems.length} bài. Thứ tự hiển thị trên website theo cột sắp xếp (↑ ↓).</p>`;
}
async function onProblemsClick(e) {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;
  try {
    if (act === "new") return openProblemEditor(null);
    if (act === "import") return importFromJson();
    const id = Number(b.closest("tr")?.dataset.id);
    const p = state.problems.find((x) => x.id === id);
    if (act === "edit") return openProblemEditor(id);
    if (act === "pub") {
      if (!p.is_published && !hasValidTestCount(testCount(p)))
        return toast(
          `Cần từ ${MIN_TESTS} đến ${MAX_TESTS} test để xuất bản (hiện ${testCount(p)}).`,
          "err",
        );
      await q(
        sb
          .from("problems")
          .update({
            is_published: !p.is_published,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id),
      );
      dirty = true;
      await loadProblems();
      return renderProblemList();
    }
    if (act === "del") {
      if (
        !(await confirmBox(
          `Xóa bài ${pad3(id)}. ${p.title}? Toàn bộ test case của bài sẽ bị xóa theo (điểm học viên đã lưu không bị xóa).`,
          { danger: true, okText: "Xóa bài" },
        ))
      )
        return;
      await q(sb.from("problems").delete().eq("id", id));
      dirty = true;
      toast("Đã xóa bài.", "ok");
      await loadProblems();
      return renderProblemList();
    }
    if (act === "up" || act === "down")
      return moveProblem(id, act === "up" ? -1 : 1);
  } catch (err) {
    toast(err.message, "err");
  }
}
async function moveProblem(id, dir) {
  const view = filteredProblems();
  const vi = view.findIndex((x) => x.id === id);
  const other = view[vi + dir];
  if (!other) return;
  const arr = [...state.problems];
  const a = arr.findIndex((x) => x.id === id);
  const b = arr.findIndex((x) => x.id === other.id);
  [arr[a], arr[b]] = [arr[b], arr[a]];
  const changes = arr
    .map((p, i) => ({ id: p.id, title: p.title, sort_order: (i + 1) * 10 }))
    .filter(
      (r) =>
        r.sort_order !== state.problems.find((p) => p.id === r.id).sort_order,
    );
  if (changes.length)
    await q(sb.from("problems").upsert(changes, { onConflict: "id" }));
  dirty = true;
  await loadProblems();
  renderProblemList();
}

// ----- Trình sửa bài (nội dung + test case) -----
async function openProblemEditor(id) {
  try {
    if (!state.problems) await loadProblems();
    const isNew = id == null;
    let p = {
      id: state.problems.reduce((m, x) => Math.max(m, x.id), 0) + 1,
      title: "",
      section: "Phần 1 - ",
      level: "Dễ",
      statement: "",
      input: "",
      output: "",
      constraints: "",
      sample_input: "",
      sample_output: "",
      sort_order:
        state.problems.reduce((m, x) => Math.max(m, x.sort_order), 0) + 10,
      is_published: false,
    };
    let tests = [];
    if (!isNew) {
      p = await q(sb.from("problems").select("*").eq("id", id).single());
      tests = (
        await q(
          sb
            .from("test_cases")
            .select("no,input,output")
            .eq("problem_id", id)
            .order("no"),
        )
      ).map((t) => ({ input: t.input, output: t.output }));
    }
    const ed = {
      p,
      tests,
      isNew,
      tab: "info",
      testsDirty: false,
      bad: new Set(),
    };
    const modal = openModal("");
    const panel = modal.firstElementChild;
    const levels = [
      ...new Set([
        "Dễ",
        "Trung bình",
        "Khó",
        ...(ctx.tasks || []).map((t) => t.level),
      ]),
    ];
    const m = /^Phần\s*(\d+)\s*-\s*(.*)$/.exec(p.section) || [];
    ed.partNo = m[1] && +m[1] >= 1 && +m[1] <= 4 ? m[1] : "1";
    ed.partName = m[2] ?? "";

    const collect = () => {
      if (ed.tab !== "info") return;
      const g = (i) => panel.querySelector("#" + i).value;
      if (isNew) ed.p.id = Number(g("fId"));
      ed.p.title = g("fTitle").trim();
      ed.p.level = g("fLevel").trim();
      ed.partNo = g("fPartNo");
      ed.partName = g("fPartName").trim();
      ed.p.statement = g("fStatement");
      ed.p.input = g("fInput");
      ed.p.output = g("fOutput");
      ed.p.constraints = g("fCons");
      ed.p.sample_input = g("fSin");
      ed.p.sample_output = g("fSout");
    };
    const draw = () => {
      panel.innerHTML = `<div class="head"><div><h2>${isNew ? "Thêm bài tập mới" : `Sửa bài ${pad3(p.id)}`}</h2>
          <span style="color:var(--muted);font-size:12.5px">${isNew ? "Điền nội dung, thêm test rồi lưu." : esc(p.title)}</span></div>
          <button class="adm-iconbtn" data-x="close" aria-label="Đóng">✕</button></div>
        <div class="adm-subtabs"><button class="adm-subtab ${ed.tab === "info" ? "active" : ""}" data-tab="info">Nội dung</button>
          <button class="adm-subtab ${ed.tab === "tests" ? "active" : ""}" data-tab="tests">Test case (${ed.tests.length})</button></div>
        <div id="edBody"></div>
        <div class="adm-foot"><button class="adm-btn" data-x="close">Hủy</button><button class="adm-btn primary" data-x="save">Lưu thay đổi</button></div>`;
      const eb = panel.querySelector("#edBody");
      eb.innerHTML = ed.tab === "info" ? infoHtml() : testsHtml();
      if (ed.tab === "tests") bindTests(eb);
    };
    const infoHtml = () => `
      <div class="adm-row3"><label class="adm-field"><span>Số bài (ID)</span><input class="adm-input" id="fId" type="number" min="1" value="${p.id}" ${isNew ? "" : "disabled"}></label>
        <label class="adm-field"><span>Tên bài</span><input class="adm-input" id="fTitle" value="${esc(p.title)}"></label>
        <label class="adm-field"><span>Mức độ khó</span><input class="adm-input" id="fLevel" list="fLevels" value="${esc(p.level)}"><datalist id="fLevels">${levels.map((l) => `<option value="${esc(l)}">`).join("")}</datalist></label></div>
      <div class="adm-row2"><label class="adm-field"><span>Phần</span><select class="adm-select" id="fPartNo">${[1, 2, 3, 4].map((n) => `<option value="${n}" ${String(n) === ed.partNo ? "selected" : ""}>Phần ${n}</option>`).join("")}</select></label>
        <label class="adm-field"><span>Tên phần (nhóm bài)</span><input class="adm-input" id="fPartName" value="${esc(ed.partName)}" placeholder="VD: Vòng lặp cơ bản"></label></div>
      <label class="adm-field"><span>Đề bài</span><textarea class="adm-textarea" id="fStatement" style="min-height:120px">${esc(p.statement)}</textarea></label>
      <div class="adm-row2"><label class="adm-field"><span>Mô tả INPUT</span><textarea class="adm-textarea" id="fInput">${esc(p.input)}</textarea></label>
        <label class="adm-field"><span>Mô tả OUTPUT</span><textarea class="adm-textarea" id="fOutput">${esc(p.output)}</textarea></label></div>
      <label class="adm-field"><span>Ràng buộc</span><input class="adm-input" id="fCons" value="${esc(p.constraints)}"></label>
      <div class="adm-row2"><label class="adm-field"><span>Sample input</span><textarea class="adm-textarea" id="fSin">${esc(p.sample_input)}</textarea></label>
        <label class="adm-field"><span>Sample output</span><textarea class="adm-textarea" id="fSout">${esc(p.sample_output)}</textarea></label></div>
      <div style="display:flex;align-items:center;gap:10px"><button class="adm-switch ${p.is_published ? "on" : ""}" data-x="pub" aria-label="Xuất bản"></button>
        <span style="font-size:13px">Xuất bản cho học viên <span style="color:var(--muted)">(cần ${MIN_TESTS}–${MAX_TESTS} test)</span></span></div>`;
    const testsHtml = () => `
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        <button class="adm-btn sm" data-t="add" ${ed.tests.length >= MAX_TESTS ? "disabled" : ""}>＋ Thêm test</button>
        <button class="adm-btn sm" data-t="check">✔ Kiểm tra dữ liệu</button>
        <button class="adm-btn sm" data-t="paste">⇩ Dán JSON</button></div>
      <div id="tPaste" hidden style="margin-bottom:12px"><textarea class="adm-textarea" id="tPasteBox" placeholder='[{"input":"1 2","output":"3"}, …] — thay thế toàn bộ test hiện có'></textarea>
        <div style="margin-top:6px"><button class="adm-btn sm primary" data-t="applypaste">Áp dụng</button></div></div>
      <div id="tNote"></div>
      ${
        ed.tests.length
          ? ed.tests
              .map(
                (
                  t,
                  i,
                ) => `<div class="adm-tc ${ed.bad.has(i) ? "bad" : ""}" data-i="${i}"><div class="top"><b>TEST ${String(i + 1).padStart(2, "0")}</b>
        <button class="adm-btn sm danger" data-t="del">Xóa</button></div><div class="adm-row2">
        <label class="adm-field" style="margin:0"><span>Input</span><textarea class="adm-textarea" data-f="input">${esc(t.input)}</textarea></label>
        <label class="adm-field" style="margin:0"><span>Output mong đợi</span><textarea class="adm-textarea" data-f="output">${esc(t.output)}</textarea></label></div></div>`,
              )
              .join("")
          : '<div class="adm-card adm-empty">Chưa có test case nào.</div>'
      }`;
    const validate = () => {
      ed.bad = new Set();
      const msgs = [];
      const seen = new Map();
      ed.tests.forEach((t, i) => {
        if (!t.input.trim())
          (ed.bad.add(i), msgs.push(`TEST ${i + 1}: input trống`));
        if (!t.output.trim())
          (ed.bad.add(i), msgs.push(`TEST ${i + 1}: output trống`));
        const k = t.input.replace(/\r/g, "").trimEnd();
        if (k && seen.has(k))
          (ed.bad.add(i),
            msgs.push(
              `TEST ${i + 1}: trùng input với TEST ${seen.get(k) + 1}`,
            ));
        else if (k) seen.set(k, i);
      });
      if (!hasValidTestCount(ed.tests.length))
        msgs.unshift(`Số test phải từ ${MIN_TESTS} đến ${MAX_TESTS} (hiện có ${ed.tests.length}).`);
      return msgs;
    };
    const bindTests = (eb) => {
      eb.addEventListener("input", (e) => {
        const f = e.target.dataset.f;
        if (!f) return;
        ed.tests[+e.target.closest(".adm-tc").dataset.i][f] = e.target.value;
        ed.testsDirty = true;
      });
      eb.addEventListener("click", (e) => {
        const b = e.target.closest("[data-t]");
        if (!b) return;
        const a = b.dataset.t;
        if (a === "add")
          (ed.tests.push({ input: "", output: "" }),
            (ed.testsDirty = true),
            draw());
        else if (a === "del")
          (ed.tests.splice(+b.closest(".adm-tc").dataset.i, 1),
            (ed.testsDirty = true),
            (ed.bad = new Set()),
            draw());
        else if (a === "paste") eb.querySelector("#tPaste").hidden = false;
        else if (a === "applypaste") {
          try {
            const arr = JSON.parse(eb.querySelector("#tPasteBox").value);
            if (!Array.isArray(arr) || arr.length > MAX_TESTS)
              throw new Error(`Cần một mảng tối đa ${MAX_TESTS} phần tử.`);
            ed.tests = arr.map((x) => ({
              input: String(x.input ?? ""),
              output: String(x.output ?? ""),
            }));
            ed.testsDirty = true;
            ed.bad = new Set();
            draw();
          } catch (err) {
            eb.querySelector("#tNote").innerHTML =
              `<div class="adm-note err">JSON không hợp lệ: ${esc(err.message)}</div>`;
          }
        } else if (a === "check") {
          const msgs = validate();
          draw();
          panel.querySelector("#tNote").innerHTML = msgs.length
            ? `<div class="adm-note err">${msgs.map(esc).join("<br>")}</div>`
            : `<div class="adm-note ok">Dữ liệu hợp lệ: ${ed.tests.length} test, không trống, không trùng input.</div>`;
        }
      });
    };
    const save = async () => {
      collect();
      const n = ed.p.id;
      if (!Number.isInteger(n) || n < 1)
        return toast("Số bài phải là số nguyên dương.", "err");
      if (!ed.p.title) return toast("Hãy nhập tên bài.", "err");
      if (ed.p.is_published && !hasValidTestCount(ed.tests.length))
        return toast(
          `Cần từ ${MIN_TESTS} đến ${MAX_TESTS} test để xuất bản (hiện ${ed.tests.length}).`,
          "err",
        );
      const btn = panel.querySelector("[data-x=save]");
      btn.disabled = true;
      try {
        if (
          isNew &&
          (await q(sb.from("problems").select("id").eq("id", n).maybeSingle()))
        )
          throw new Error(`Bài số ${n} đã tồn tại.`);
        const row = {
          id: n,
          title: ed.p.title,
          level: ed.p.level || "Dễ",
          section: `Phần ${ed.partNo} - ${ed.partName || "Chưa đặt tên"}`,
          statement: ed.p.statement,
          input: ed.p.input,
          output: ed.p.output,
          constraints: ed.p.constraints,
          sample_input: ed.p.sample_input,
          sample_output: ed.p.sample_output,
          sort_order: ed.p.sort_order,
          // Publish only after changed tests have been saved and validated server-side.
          is_published: ed.testsDirty && ed.p.is_published ? false : ed.p.is_published,
          updated_at: new Date().toISOString(),
        };
        await q(sb.from("problems").upsert(row, { onConflict: "id" }));
        if (ed.testsDirty)
          await rpc("admin_save_tests", { p_problem: n, p_tests: ed.tests });
        if (ed.testsDirty && ed.p.is_published)
          await q(sb.from("problems").update({ is_published: true }).eq("id", n));
        dirty = true;
        modal.remove();
        toast("Đã lưu bài tập.", "ok");
        if (state.view === "problems") {
          await loadProblems();
          renderProblemList();
        }
      } catch (err) {
        btn.disabled = false;
        toast(err.message, "err");
      }
    };
    panel.addEventListener("click", (e) => {
      const t = e.target.closest("[data-tab]");
      if (t) {
        collect();
        ed.tab = t.dataset.tab;
        return draw();
      }
      const x = e.target.closest("[data-x]")?.dataset.x;
      if (x === "close") modal.remove();
      else if (x === "save") save();
      else if (x === "pub") {
        ed.p.is_published = !ed.p.is_published;
        e.target.closest("[data-x]").classList.toggle("on", ed.p.is_published);
      }
    });
    draw();
  } catch (err) {
    toast(err.message, "err");
  }
}

// ----- Nhập 150 bài từ file JSON hiện có vào Supabase -----
async function importFromJson() {
  if (
    !(await confirmBox(
      "Nhập toàn bộ bài và test từ 4 file JSON (data/part1–4.json) vào Supabase? Bài trùng số (ID) sẽ bị ghi đè cả nội dung lẫn test.",
      { okText: "Bắt đầu nhập" },
    ))
  )
    return;
  const modal = openModal(
    `<h2>Đang nhập dữ liệu…</h2><p id="impMsg" style="color:var(--muted);font-size:13px">Đang đọc file JSON…</p><div class="adm-progress" style="margin-top:10px"><i id="impBar" style="width:0"></i></div>`,
    true,
  );
  const msg = (t, pct) => {
    modal.querySelector("#impMsg").textContent = t;
    if (pct != null) modal.querySelector("#impBar").style.width = pct + "%";
  };
  try {
    const parts = await Promise.all(
      DATA_FILES.map(async (u) => {
        const r = await fetch(u, { cache: "no-cache" });
        if (!r.ok)
          throw new Error(`Không tải được ${u.pathname} (HTTP ${r.status}).`);
        return r.json();
      }),
    );
    const tasks = parts.flat().sort((a, b) => a.id - b.id);
    const existingProblems = await q(
      sb.from("problems").select("id,is_published").in("id", tasks.map((task) => task.id)),
    );
    const existingById = new Map(existingProblems.map((problem) => [problem.id, problem]));
    const rows = tasks.map((t, i) => ({
      id: t.id,
      title: t.title,
      section: t.section,
      level: t.level,
      statement: t.statement ?? "",
      input: t.input ?? "",
      output: t.output ?? "",
      constraints: t.constraints ?? "",
      sample_input: t.sample_input ?? "",
      sample_output: t.sample_output ?? "",
      sort_order: (i + 1) * 10,
      // Keep existing valid publications during import; new rows publish after tests are saved.
      is_published: Boolean(existingById.get(t.id)?.is_published),
    }));
    for (let i = 0; i < rows.length; i += 50) {
      msg(
        `Đang lưu thông tin bài… ${Math.min(i + 50, rows.length)}/${rows.length}`,
        5,
      );
      await q(
        sb.from("problems").upsert(rows.slice(i, i + 50), { onConflict: "id" }),
      );
    }
    for (let i = 0; i < tasks.length; i++) {
      msg(
        `Đang lưu test case bài ${tasks[i].id}… (${i + 1}/${tasks.length})`,
        5 + ((i + 1) / tasks.length) * 95,
      );
      await rpc("admin_save_tests", {
        p_problem: tasks[i].id,
        p_tests: tasks[i].tests.map((x) => ({
          input: x.input,
          output: x.output,
        })),
      });
    }
    const publishableIds = tasks
      .filter((task) => hasValidTestCount(task.tests?.length))
      .map((task) => task.id);
    if (publishableIds.length) {
      await q(
        sb.from("problems")
          .update({ is_published: true })
          .in("id", publishableIds),
      );
    }
    dirty = true;
    modal.remove();
    toast(`Đã nhập ${tasks.length} bài.`, "ok");
    await loadProblems();
    renderProblemList();
  } catch (err) {
    modal.remove();
    toast("Nhập thất bại: " + err.message, "err");
  }
}

// ---------- Người dùng ----------
async function viewUsers(body) {
  body.innerHTML =
    head("Quản lý người dùng", "Xem tài khoản, tiến độ, khóa / mở khóa") +
    `<div class="adm-toolbar"><input class="adm-input" id="uSearch" placeholder="Tìm theo tên hoặc email…"></div><div id="uList"></div>`;
  let timer;
  $("#uSearch").oninput = (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => loadUsers(e.target.value.trim()), 300);
  };
  body.onclick = (e) => {
    const tr = e.target.closest("tr[data-u]");
    if (tr) openUserDrawer(state.users.find((u) => u.user_id === tr.dataset.u));
  };
  await loadUsers("");
}
async function loadUsers(search) {
  state.users = await rpc("admin_list_users", {
    p_search: search,
    p_limit: 200,
  });
  const box = $("#uList");
  if (!box) return;
  box.innerHTML = `<div class="adm-tablewrap"><table class="adm-table"><thead><tr><th>Người dùng</th><th>Quyền</th><th>Trạng thái</th><th>Hoàn thành</th><th>Tham gia</th><th>Hoạt động gần nhất</th></tr></thead><tbody>
    ${
      state.users
        .map(
          (
            u,
          ) => `<tr class="click" data-u="${u.user_id}"><td><div class="ttl">${esc(u.display_name || "(chưa đặt tên)")}</div><div class="mut">${esc(u.email)}</div></td>
      <td>${roleBadge(u.role)}</td><td>${u.is_locked ? '<span class="adm-badge bad">Bị khóa</span>' : '<span class="adm-badge ok">Hoạt động</span>'}</td>
      <td>${u.solved}/${u.attempted} <span class="mut">bài</span></td><td class="mut">${fmt(u.created_at)}</td><td class="mut">${fmt(u.last_activity)}</td></tr>`,
        )
        .join("") ||
      '<tr><td colspan="6" class="adm-empty">Không tìm thấy tài khoản.</td></tr>'
    }</tbody></table></div>
    <p style="color:var(--muted);font-size:12px;margin-top:8px">${state.users.length} tài khoản (tối đa 200 dòng mỗi lần; dùng ô tìm kiếm để thu hẹp).</p>`;
}
async function openUserDrawer(u) {
  if (!u) return;
  const me = ctx.user.id;
  const canLock =
    u.user_id !== me &&
    u.role !== "super_admin" &&
    (u.role === "student" || isSuper);
  const canRole = isSuper && u.user_id !== me && u.role !== "super_admin";
  const modal = openModal(`<div class="adm-loading">Đang tải…</div>`);
  const panel = modal.firstElementChild;
  modal.addEventListener("click", (e) => e.target === modal && modal.remove());
  let prog = [];
  try {
    prog = await rpc("admin_user_progress_with_points", { p_user: u.user_id });
  } catch (err) {
    toast(err.message, "err");
  }
  panel.innerHTML = `<div class="head"><div><h2>${esc(u.display_name || "(chưa đặt tên)")}</h2><span style="color:var(--muted);font-size:12.5px">${esc(u.email)}</span></div>
      <button class="adm-iconbtn" data-x="close" aria-label="Đóng">✕</button></div>
    <dl class="adm-kv"><dt>Quyền</dt><dd>${roleBadge(u.role)}</dd><dt>Trạng thái</dt><dd>${u.is_locked ? '<span class="adm-badge bad">Bị khóa</span>' : '<span class="adm-badge ok">Hoạt động</span>'}</dd>
      <dt>Tham gia</dt><dd>${fmt(u.created_at)}</dd><dt>Gần nhất</dt><dd>${fmt(u.last_activity)}</dd><dt>Hoàn thành</dt><dd>${u.solved} bài đạt 10/10 · ${u.attempted} bài đã làm</dd></dl>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px">
      ${canLock ? `<button class="adm-btn ${u.is_locked ? "" : "danger"}" data-x="lock">${u.is_locked ? "🔓 Mở khóa tài khoản" : "🔒 Khóa tài khoản"}</button>` : ""}
      ${canRole ? `<button class="adm-btn ${u.role === "admin" ? "danger" : "primary"}" data-x="role">${u.role === "admin" ? "Thu hồi quyền Admin" : "Cấp quyền Admin"}</button>` : ""}
      <button class="adm-btn" data-x="codes">⌘ Lịch sử code</button></div>
    <h2 style="font-size:15px">Tiến độ học tập</h2>
    <div class="adm-tablewrap"><table class="adm-table"><thead><tr><th>Bài</th><th>Điểm</th><th>Test đúng</th><th>Cập nhật</th></tr></thead><tbody>
    ${
      prog
        .map(
          (
            r,
          ) => `<tr><td><b>${pad3(r.problem_id)}</b> <span class="mut">${esc(taskTitle(r.problem_id))}</span></td><td>${Number(r.best_points ?? Number(r.best_score) / 2).toFixed(2)}/10</td>
      <td>${r.best_score}/${Number(r.best_tests_total || ctx.tasks?.find((task) => Number(task.id) === Number(r.problem_id))?.tests.length || 0)}</td><td class="mut">${fmt(r.updated_at)}</td></tr>`,
        )
        .join("") ||
      '<tr><td colspan="4" class="adm-empty">Chưa làm bài nào.</td></tr>'
    }</tbody></table></div>
    <div id="adminUserCodeHistory" style="margin-top:16px"></div>`;
  panel.addEventListener("click", async (e) => {
    const x = e.target.closest("[data-x]")?.dataset.x;
    if (!x) return;
    if (x === "close") return modal.remove();
    try {
      if (x === "codes") {
        const target = $("#adminUserCodeHistory");
        target.innerHTML = '<div class="adm-loading">Đang tải lịch sử code…</div>';
        const codes = (await rpc("list_member_submissions", {
          p_user_id: u.user_id,
          p_limit: 100,
        })).filter((row) => row.outcome !== "accepted");
        target.innerHTML = `<h2 style="font-size:15px">Lịch sử code chưa đạt (${codes.length})</h2>${codes.length ? codes.map((row) => { const total = Number(row.tests_total || ctx.tasks?.find((task) => Number(task.id) === Number(row.problem_id))?.tests.length || 0); return `<details class="adm-tc"><summary><b>Bài ${pad3(row.problem_id)}</b> · ${row.tests_passed == null ? (row.test_no ? `Test ${row.test_no}` : "Đã chạy") : `${row.tests_passed}/${total} test đúng`} · ${fmt(row.created_at)}</summary><textarea class="adm-textarea" readonly style="min-height:240px">${esc(row.source_code)}</textarea></details>`; }).join("") : '<div class="adm-empty">Chưa có bản code sai hoặc chưa đạt để hiển thị.</div>'}`;
        return;
      } else if (x === "lock") {
        if (
          !(await confirmBox(
            u.is_locked
              ? `Mở khóa tài khoản ${u.display_name}?`
              : `Khóa tài khoản ${u.display_name}? Người này sẽ không lưu được điểm mới.`,
            { danger: !u.is_locked },
          ))
        )
          return;
        await rpc("admin_set_locked", {
          p_user: u.user_id,
          p_locked: !u.is_locked,
        });
        toast(u.is_locked ? "Đã mở khóa." : "Đã khóa tài khoản.", "ok");
      } else if (x === "role") {
        const grant = u.role !== "admin";
        if (
          !(await confirmBox(
            grant
              ? `Cấp quyền Admin cho ${u.display_name} (${u.email})?`
              : `Thu hồi quyền Admin của ${u.display_name}?`,
            { danger: !grant },
          ))
        )
          return;
        await rpc("super_set_role", {
          p_user: u.user_id,
          p_role: grant ? "admin" : "student",
        });
        toast(grant ? "Đã cấp quyền Admin." : "Đã thu hồi quyền Admin.", "ok");
      }
      modal.remove();
      await loadUsers($("#uSearch")?.value.trim() || "");
    } catch (err) {
      toast(err.message, "err");
    }
  });
}

// ---------- Quản trị viên (chỉ Super Admin) ----------
async function viewAdmins(body) {
  const all = await rpc("admin_list_users", { p_search: "", p_limit: 500 });
  const admins = all.filter((u) => u.role !== "student");
  body.innerHTML =
    head("Quản trị viên", "Chỉ Super Admin được cấp hoặc thu hồi quyền Admin") +
    `<div class="adm-card"><h2>Danh sách quản trị (${admins.length})</h2><div class="adm-tablewrap"><table class="adm-table"><thead><tr><th>Tài khoản</th><th>Quyền</th><th>Từ</th><th></th></tr></thead><tbody>
      ${admins
        .map(
          (
            u,
          ) => `<tr><td><div class="ttl">${esc(u.display_name)}</div><div class="mut">${esc(u.email)}</div></td><td>${roleBadge(u.role)}</td><td class="mut">${fmt(u.created_at)}</td>
        <td><div class="adm-actions">${u.role === "admin" ? `<button class="adm-btn sm danger" data-revoke="${u.user_id}">Thu hồi</button>` : '<span class="mut">Không thể thu hồi</span>'}</div></td></tr>`,
        )
        .join("")}</tbody></table></div></div>
    <div class="adm-card" style="margin-top:14px"><h2>Cấp quyền Admin cho học viên</h2>
      <input class="adm-input" id="gSearch" placeholder="Nhập ít nhất 2 ký tự của tên hoặc email…"><div id="gList" style="margin-top:12px"></div></div>`;
  const byId = (id) => all.find((u) => u.user_id === id);
  const apply = async (id, role, text) => {
    const u = byId(id) || state.found?.find((x) => x.user_id === id);
    if (
      !(await confirmBox(
        `${text} ${u?.display_name || ""} (${u?.email || ""})?`,
        { danger: role === "student" },
      ))
    )
      return;
    try {
      await rpc("super_set_role", { p_user: id, p_role: role });
      toast("Đã cập nhật quyền.", "ok");
      show("admins");
    } catch (err) {
      toast(err.message, "err");
    }
  };
  let timer;
  $("#gSearch").oninput = (e) => {
    clearTimeout(timer);
    const v = e.target.value.trim();
    timer = setTimeout(async () => {
      if (v.length < 2) return ($("#gList").innerHTML = "");
      try {
        state.found = (
          await rpc("admin_list_users", { p_search: v, p_limit: 20 })
        ).filter((u) => u.role === "student");
        $("#gList").innerHTML = state.found.length
          ? `<div class="adm-tablewrap"><table class="adm-table"><tbody>${state.found
              .map(
                (
                  u,
                ) => `<tr><td><div class="ttl">${esc(u.display_name)}</div><div class="mut">${esc(u.email)}</div></td>
            <td><div class="adm-actions"><button class="adm-btn sm primary" data-grant="${u.user_id}">Cấp Admin</button></div></td></tr>`,
              )
              .join("")}</tbody></table></div>`
          : '<div class="adm-empty">Không có học viên phù hợp.</div>';
      } catch (err) {
        toast(err.message, "err");
      }
    }, 300);
  };
  body.onclick = (e) => {
    const r = e.target.closest("[data-revoke]");
    const g = e.target.closest("[data-grant]");
    if (r) apply(r.dataset.revoke, "student", "Thu hồi quyền Admin của");
    if (g) apply(g.dataset.grant, "admin", "Cấp quyền Admin cho");
  };
}

// ---------- Nhật ký (chỉ Super Admin) ----------
async function viewAudit(body) {
  const rows = await q(
    sb
      .from("admin_audit_log")
      .select("created_at,actor_name,action,target,detail")
      .order("created_at", { ascending: false })
      .limit(150),
  );
  body.innerHTML =
    head(
      "Nhật ký hoạt động",
      "150 thao tác quản trị và đổi tên gần nhất",
      `<button class="adm-btn" data-r="1">↻ Làm mới</button>`,
    ) +
    `<div class="adm-tablewrap"><table class="adm-table"><thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Thao tác</th><th>Đối tượng</th></tr></thead><tbody>
    ${
      rows
        .map((r) => {
          const d = r.detail || {};
          const extra = d.old_name || d.new_name
            ? ` · ${esc(d.old_name || "(chưa đặt tên)")} → ${esc(d.new_name || "")}`
            : d.title
            ? ` · ${esc(d.title)}`
            : d.count != null
              ? ` · ${d.count} test`
              : d.name
                ? ` · ${esc(d.name)}`
                : "";
          const isUser = /^(user_|role_|profile_)/.test(r.action);
          return `<tr><td class="mut">${fmt(r.created_at)}</td><td>${esc(r.actor_name || "—")}</td><td><span class="adm-badge ${/delete|revoked|locked$/.test(r.action) && !/unlocked/.test(r.action) ? "bad" : ""}">${esc(ACTION_LABELS[r.action] || r.action)}</span></td>
        <td class="mut">${isUser ? "" : "Bài "}${esc(isUser ? d.name || String(r.target).slice(0, 8) : pad3(r.target))}${extra}</td></tr>`;
        })
        .join("") ||
      '<tr><td colspan="4" class="adm-empty">Chưa có hoạt động nào.</td></tr>'
    }</tbody></table></div>`;
  body.onclick = (e) => e.target.closest("[data-r]") && show("audit");
}
