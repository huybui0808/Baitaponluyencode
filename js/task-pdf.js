// Self-contained printable task sheet builder; data is supplied by the app.
export function buildTaskPdfHtml(task, practiceTests, escapeHTML) {
  const testsHtml = practiceTests
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
  <h2>${practiceTests.length} test mẫu</h2>
  <div class="test-list">${testsHtml}</div>
  <div class="footer">Tài liệu luyện tập được tạo tự động từ dữ liệu của website TLU C++. Các test trong tài liệu này là test luyện tập công khai.</div>
</main></body></html>`;
}
