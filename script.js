// Logic giao dien, chay code, cham diem va luu tien do.
// Du lieu 150 bai duoc nap tu 4 file JSON trong thu muc data/.
const TASK_DATA_FILES = [
  "./data/part1.json",
  "./data/part2.json",
  "./data/part3.json",
  "./data/part4.json",
];

async function loadTaskData() {
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
const LEGACY_LATEST_SCORE_KEY = "tlu_cpp_latest_scores_v1";
const NETWORK_TIMEOUT_MS = 30000;
// Wandbox có thể trả HTTP 429 khi nhận quá nhiều yêu cầu trong thời gian ngắn.
// Tự chờ và thử lại đúng test đó; không đánh dấu lỗi dịch vụ thành FAIL.
const RATE_LIMIT_BASE_DELAY_MS = 5000;
const RATE_LIMIT_MAX_DELAY_MS = 60000;
const NORMAL_TEST_GAP_MS = 1200;
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
function persistScores() {
  try {
    localStorage.setItem(SCORE_KEY, JSON.stringify(bestScores));
  } catch (_) {
    console.warn("Không thể lưu điểm vào localStorage.");
  }
}
persistScores();

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
  return task.legacyId || task.id;
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
    $("runoutput").textContent = view.output || "";
  } else {
    setStatus(
      "Dán code C++ vào khung trên, chọn test và nhấn chạy. Chuyển bài khác không làm dừng phiên chấm.",
      "",
    );
    $("runoutput").textContent = "";
  }
  refreshRunControls();
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
  $("inputdesc").textContent = current.input;
  $("outputdesc").textContent = current.output;
  $("constraints").textContent = "Ràng buộc: " + current.constraints;
  $("samplein").textContent = current.sample_input;
  $("sampleout").textContent = current.sample_output;
  $("tests").innerHTML = current.tests
    .map(
      (x, i) =>
        `<div class="case ${i === 0 ? "selected" : ""}" data-index="${i}"><div class="casehead"><b>TEST ${String(x.no).padStart(2, "0")}</b><button data-copy="${i}" type="button">Chép input</button></div><div class="casegrid"><div><label>Input</label><pre>${escapeHTML(x.input)}</pre></div><div><label>Expected output</label><pre>${escapeHTML(x.output)}</pre></div></div></div>`,
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
  const saved = localStorage.getItem("cppcode_" + storageId(current));
  $("code").value = saved || starter;
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
    controller: new AbortController(),
    state: "running",
    pass: 0,
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
  <div class="meta">${escapeHTML(task.section)} · Mức độ: ${escapeHTML(task.level)} · C++17</div>
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

const TLU_TLE_MARKER = "__TLU_INTERNAL_TIME_LIMIT_1S__";
function addOneSecondRuntimeLimit(source) {
  const prefix = `#include <csignal>\n#include <unistd.h>\nstatic void tlu_internal_time_limit_handler(int){\n  const char message[]="\\n${TLU_TLE_MARKER}\\n";\n  write(STDERR_FILENO,message,sizeof(message)-1);\n  _exit(124);\n}\nstruct TluInternalTimeLimitTimer{\n  TluInternalTimeLimitTimer(){\n    std::signal(SIGALRM,tlu_internal_time_limit_handler);\n    alarm(1);\n  }\n};\nstatic TluInternalTimeLimitTimer tlu_internal_time_limit_timer_instance;\n`;
  return prefix + source;
}
function parseRetryAfterMs(headerValue) {
  if (!headerValue) return 0;
  const seconds = Number(headerValue);
  if (Number.isFinite(seconds) && seconds >= 0)
    return Math.ceil(seconds * 1000);
  const dateMs = Date.parse(headerValue);
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - Date.now()) : 0;
}
async function compileRun(stdin, code, parentSignal) {
  if (!code.trim()) throw new Error("Bạn chưa dán mã nguồn C++.");
  if (parentSignal?.aborted)
    throw new DOMException("Đã hủy phiên chấm.", "AbortError");
  const requestController = new AbortController();
  let networkTimedOut = false;
  const forwardAbort = () => requestController.abort();
  parentSignal?.addEventListener("abort", forwardAbort, { once: true });
  const timer = setTimeout(() => {
    networkTimedOut = true;
    requestController.abort();
  }, NETWORK_TIMEOUT_MS);
  try {
    const payload = {
      code: addOneSecondRuntimeLimit(code),
      compiler: "gcc-head",
      options: "warning,c++17",
      stdin,
      save: false,
    };
    const res = await fetch("https://wandbox.org/api/compile.json", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: requestController.signal,
    });
    if (!res.ok) {
      const serviceError = new Error(
        "Dịch vụ biên dịch trả về HTTP " + res.status + ".",
      );
      serviceError.httpStatus = res.status;
      serviceError.code =
        res.status === 429 ? "HTTP_429" : "HTTP_" + res.status;
      serviceError.retryAfterMs = parseRetryAfterMs(
        res.headers?.get?.("Retry-After"),
      );
      throw serviceError;
    }
    const data = await res.json();
    const compileError =
      data.compiler_error ||
      data.compiler_output ||
      data.compiler_message ||
      "";
    const programError = String(data.program_error || "");
    const programMessage = String(data.program_message || "");
    const timeLimitExceeded =
      programError.includes(TLU_TLE_MARKER) ||
      programMessage.includes(TLU_TLE_MARKER);
    const status = String(data.status ?? "0");
    const hasCompileError = /(^|\n).*?(fatal error:|error:)/i.test(
      String(compileError),
    );
    if (
      status !== "0" &&
      !timeLimitExceeded &&
      hasCompileError &&
      !data.program_output &&
      !programMessage
    ) {
      throw new Error(compileError || "Biên dịch thất bại.");
    }
    const output = String(
      data.program_output ?? data.program_message ?? data.program_error ?? "",
    )
      .replace(TLU_TLE_MARKER, "")
      .trimEnd();
    return {
      output,
      compileError,
      raw: data,
      timeLimitExceeded,
      exitCode: status,
    };
  } catch (error) {
    if (parentSignal?.aborted)
      throw new DOMException("Đã hủy phiên chấm.", "AbortError");
    if (networkTimedOut) {
      const timeoutError = new Error(
        "Máy chủ hoặc mạng không phản hồi sau 30 giây. Đây không phải TLE của code.",
      );
      timeoutError.code = "NETWORK_TIMEOUT";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener("abort", forwardAbort);
  }
}

// Chỉ retry lỗi giới hạn dịch vụ HTTP 429. Test đang chờ không bị tính PASS/FAIL.
// Backoff tăng dần 5s, 10s, 20s, 40s, tối đa 60s; nút Hủy vẫn hoạt động trong lúc chờ.
async function compileRunWithRetry(stdin, code, job, testNo) {
  let retryCount = 0;
  while (true) {
    if (job.controller.signal.aborted)
      throw new DOMException("Đã hủy phiên chấm.", "AbortError");
    try {
      return await compileRun(stdin, code, job.controller.signal);
    } catch (error) {
      if (job.controller.signal.aborted || error.name === "AbortError") {
        throw new DOMException("Đã hủy phiên chấm.", "AbortError");
      }
      if (error.code !== "HTTP_429") throw error;

      retryCount++;
      const exponentialDelay = Math.min(
        RATE_LIMIT_MAX_DELAY_MS,
        RATE_LIMIT_BASE_DELAY_MS * Math.pow(2, Math.min(retryCount - 1, 5)),
      );
      const delay = Math.max(exponentialDelay, Number(error.retryAfterMs) || 0);
      let remaining = delay;
      while (remaining > 0) {
        const chunk = Math.min(1000, remaining);
        const secondsLeft = Math.ceil(remaining / 1000);
        const priorResults = job.lines.join("\n");
        const waitingLine = `TEST ${String(testNo).padStart(2, "0")}: ĐANG CHỜ DỊCH VỤ (HTTP 429) · lần thử lại ${retryCount}.`;
        updateJobView(
          job,
          `Wandbox đang giới hạn yêu cầu (HTTP 429) tại TEST ${testNo}/${job.total}. Đã có ${job.pass} test đúng. Tự thử lại sau ${secondsLeft} giây; bạn có thể Hủy nếu không muốn chờ.`,
          "warn",
          (priorResults ? priorResults + "\n" : "") + waitingLine,
        );
        await wait(chunk, job.controller.signal);
        remaining -= chunk;
      }
    }
  }
}
function normalize(s) {
  return String(s ?? "")
    .replace(/\r/g, "")
    .trimEnd();
}
function testResultLabel(result, expected) {
  if (result.timeLimitExceeded) return "TLE (> 1,0 giây)";
  if (result.exitCode !== "0") return `RUNTIME ERROR (exit ${result.exitCode})`;
  return normalize(result.output) === normalize(expected) ? "PASS" : "FAIL";
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
    const result = await compileRunWithRetry(
      stdin,
      job.code,
      job,
      target?.no || 1,
    );
    if (job.controller.signal.aborted)
      throw new DOMException("Đã hủy phiên chấm.", "AbortError");
    const ok =
      !result.timeLimitExceeded &&
      result.exitCode === "0" &&
      target &&
      normalize(result.output) === normalize(target.output);
    job.state = "completed";
    const text = result.timeLimitExceeded
      ? "Kết quả: TIME LIMIT EXCEEDED (TLE)\nChương trình vượt giới hạn thực thi 1,0 giây."
      : "Program output:\n" +
        (result.output || "(không có output)") +
        (target
          ? "\n\nExpected output:\n" + target.output
          : "\n\nInput này không thuộc 20 test mẫu.");
    updateJobView(
      job,
      result.timeLimitExceeded
        ? "QUÁ THỜI GIAN (TLE) · Vượt giới hạn 1,0 giây."
        : ok
          ? "ĐÚNG với test đang chọn."
          : "CHƯA KHỚP output mong đợi.",
      ok ? "ok" : "err",
      (result.compileError
        ? "Compiler message:\n" + result.compileError + "\n\n"
        : "") +
        text +
        "\n\nChạy riêng một test không làm thay đổi điểm cao nhất.",
    );
  } catch (error) {
    if (error.name === "AbortError") {
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
        error.code === "NETWORK_TIMEOUT"
          ? "CONNECTION TIMEOUT · Không nhận được phản hồi từ máy chủ."
          : "Không chạy được: " + error.message,
        "err",
        "Lỗi kết nối/dịch vụ: " +
          error.message +
          "\nKhông tính đây là TLE và không thay đổi điểm.",
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
      const result = await compileRunWithRetry(
        test.input,
        job.code,
        job,
        i + 1,
      );
      if (job.controller.signal.aborted)
        throw new DOMException("Đã hủy phiên chấm.", "AbortError");
      const label = testResultLabel(result, test.output);
      const ok = label === "PASS";
      if (ok) job.pass++;
      job.lines.push(
        `TEST ${String(i + 1).padStart(2, "0")}: ${label}${result.compileError ? " | " + result.compileError.slice(0, 160) : ""}`,
      );
      updateJobView(
        job,
        `Đang chấm bài ${job.taskId}: ${i + 1}/${job.total} test · Đúng ${job.pass} test.`,
        "",
        job.lines.join("\n"),
      );
      if (i < job.task.tests.length - 1)
        await wait(NORMAL_TEST_GAP_MS, job.controller.signal);
    }
    if (job.controller.signal.aborted)
      throw new DOMException("Đã hủy phiên chấm.", "AbortError");
    const score = Math.round((job.pass / job.total) * 100) / 10;
    const oldBest =
      bestScores[job.taskId] === undefined
        ? -1
        : Number(bestScores[job.taskId]);
    const improved = score > oldBest;
    if (improved) {
      bestScores[job.taskId] = score;
      persistScores();
    }
    job.state = "completed";
    const best = Number(bestScores[job.taskId] ?? score);
    const summary = `\n\nHoàn tất: ${job.pass}/${job.total} test đúng.\nĐiểm cao nhất được lưu: ${best.toFixed(1)}/10${improved ? " (đã cập nhật)" : " (giữ nguyên, không bị giảm)"}.`;
    updateJobView(
      job,
      `Đã chấm xong bài ${job.taskId}: ${job.pass}/${job.total} test đúng · Điểm cao nhất ${best.toFixed(1)}/10.`,
      best >= 10 ? "ok" : "err",
      job.lines.join("\n") + summary,
    );
    updateProgress();
    updateScore();
    renderList();
  } catch (error) {
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
      const network = error.code === "NETWORK_TIMEOUT";
      updateJobView(
        job,
        network
          ? `CONNECTION TIMEOUT tại TEST ${job.currentTest}/${job.total}. Không tính là TLE.`
          : `Lỗi dịch vụ tại TEST ${job.currentTest}/${job.total}.`,
        "err",
        job.lines.join("\n") +
          `\n\n${error.message}\nLượt chấm chưa hoàn tất nên không cập nhật điểm. Điểm cao nhất cũ vẫn được giữ.`,
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
selectTask(1);
