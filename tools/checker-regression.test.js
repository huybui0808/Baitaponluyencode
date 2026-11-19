// VI: Ca hoi quy cho quy tac phan biet dap an sai va loi trinh bay.
// EN: Regression cases for wrong answers versus presentation-only errors.
// Run with: node tools/checker-regression.test.js
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("script.js", "utf8");
const start = source.indexOf("function normalizeProgramOutput");
const end = source.indexOf("function scoreStatusClass", start);
if (start < 0 || end < 0) throw new Error("Could not locate checker functions in script.js");

const context = { module: { exports: {} }, Number, String, Math, RegExp };
context.taskPresentation = (task) => {
  const prompt = task.prompt || "Nhap n = ";
  const label = task.label || "Ket qua la: ";
  return {
    prompts: [prompt],
    promptText: prompt,
    resultLabel: label,
    lineLabels: null,
    expectedProgramOutput: (output) => prompt + label + output,
    expected: (output) => prompt + label + output,
    renderConsoleOutput: (output) => output,
  };
};
vm.runInNewContext(
  source.slice(start, end) + "\nmodule.exports = { hasExpectedSemanticOutput, classifyTestResult };",
  context,
);

const { hasExpectedSemanticOutput, classifyTestResult } = context.module.exports;
const cases = [
  ["15 must not pass as expected 5", "Nhap n = Ket qua la: 15", "5", {}, "FAIL"],
  ["extra output text is wrong", "Nhap n = Ket qua la: 5 done", "5", {}, "FAIL"],
  ["extra numeric result is wrong", "Nhap n = Ket qua la: 5 7", "5", {}, "FAIL"],
  ["wrong enum token is wrong", "Nhap n = Ket qua la: NOT YES", "YES", {}, "FAIL"],
  ["extra conflicting enum answer is wrong", "Ket qua NO YES", "YES", { tests: [{ output: "YES" }, { output: "NO" }] }, "FAIL"],
  ["missing prompt with correct answer is presentation", "Ket qua la: 5", "5", {}, "PRESENTATION"],
  ["different result label with correct number is presentation", "Nhap n = Tong tien = 5", "5", {}, "PRESENTATION"],
  ["extra output after correct number stays wrong", "Nhap n = Ket qua la: 5 xong", "5", {}, "FAIL"],
  ["extra number before correct answer stays wrong", "Nhap n = Bai 2, ket qua la: 5", "5", {}, "FAIL"],
  ["accented Vietnamese prompt is presentation", "Nhập n = Ket quả là: 5", "5", {}, "PRESENTATION"],
  ["case and punctuation differences in labels are presentation", "NHẬP n: KẾT QUẢ LÀ = 5", "5", {}, "PRESENTATION"],
  ["different enum heading with correct answer is presentation", "Phan loai: YES", "YES", {}, "PRESENTATION"],
  ["heading may mention another enum while the final answer is correct", "Ket qua phan loai NO: YES", "YES", { tests: [{ output: "YES" }, { output: "NO" }] }, "PRESENTATION"],
  ["canonical numeric output passes", "Nhap n = Ket qua la: 5", "5", {}, "PASS"],
  ["misplaced character is wrong", "Ket qua:\n**\n.*", "**\n**", { label: "Ket qua:\n" }, "FAIL"],
  ["shape spacing distortion is wrong", "Ket qua:\n*  *\n* *", "* *\n* *", { label: "Ket qua:\n" }, "FAIL"],
  ["missing shape row is wrong", "Ket qua:\n* *", "* *\n* *", { label: "Ket qua:\n" }, "FAIL"],
  ["extra shape row is wrong", "Ket qua:\n* *\n* *\n* *", "* *\n* *", { label: "Ket qua:\n" }, "FAIL"],
  ["extra letter-pattern row is wrong", "X\nX\nX", "X\nX", { id: 148, label: "Ket qua:\n" }, "FAIL"],
  ["different shape heading with exact pattern is presentation", "Hinh vuong:\n* *\n* *", "* *\n* *", { id: 133, label: "Hinh vuong rong:\n" }, "PRESENTATION"],
  ["accented result heading with exact shape is presentation", "Kết quả:\n* *\n* *", "* *\n* *", { id: 133, label: "Ket qua:\n" }, "PRESENTATION"],
  ["numeric table row boundaries are significant", "Ket qua:\n1 2 2 4", "1 2\n2 4", { id: 66, label: "Ket qua:\n" }, "FAIL"],
];

let failed = 0;
for (const [name, output, expected, task, expectedStatus] of cases) {
  const result = classifyTestResult({ output, exitCode: "0", timeLimitExceeded: false }, task, {
    input: "1",
    output: expected,
  });
  const passed = result.status === expectedStatus;
  console.log(`${passed ? "PASS" : "FAIL"} ${name}: ${result.status}`);
  if (!passed) failed++;
}

if (!hasExpectedSemanticOutput("Nhap n = Ket qua la: 5", "5", {})) {
  console.error("FAIL canonical semantic answer rejected");
  failed++;
}

// Exercise the production terminal-transcript renderer for an arbitrary input.
const rendererStart = source.indexOf("function taskPresentation");
const rendererEnd = source.indexOf("function renderFormatGuide", rendererStart);
const rendererContext = {
  Number, String, Math, RegExp,
  INPUT_LABELS: {},
  SINGLE_RESULT_LABELS: { 7: "Hai so sau khi hoan doi = " },
  RESULT_LABELS: {},
  OUTPUT_RULES: new Map(),
  taskSample: (task) => ({ input: task.tests[0].input }),
};
vm.runInNewContext(source.slice(rendererStart, rendererEnd), rendererContext);
const swapTask = {
  id: 7,
  input: "Hai số nguyên a và b.",
  title: "Hoán đổi hai số",
  tests: [{ input: "-5 2", output: "2 -5" }],
};
const transcript = rendererContext.taskPresentation(swapTask, "-5 2")
  .renderConsoleOutput("Nhap a = Nhap b = Hai so sau khi hoan doi = 2 -5", "-5 2");
const expectedTranscript = "Nhap a = -5\nNhap b = 2\nHai so sau khi hoan doi = 2 -5";
if (transcript !== expectedTranscript) {
  console.error(`FAIL custom input transcript: ${JSON.stringify(transcript)}`);
  failed++;
} else {
  console.log("PASS custom input is echoed after each prompt on its own line");
}
if (failed) process.exitCode = 1;
