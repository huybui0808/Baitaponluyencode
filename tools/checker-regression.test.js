const { classifyTestResult } = require("../js/checker.js");
const { taskPresentation } = require("../js/problem-presentation.js");
function fixture(task) {
  const prompt = task.prompt || "Nhap n = ";
  const label = task.label || "Ket qua la: ";
  return {
    prompts: [prompt], resultLabel: label,
    expectedProgramOutput: output => prompt + label + output,
    expected: output => prompt + label + output,
    renderConsoleOutput: output => output,
  };
}
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
  }, fixture(task));
  const passed = result.status === expectedStatus;
  console.log(`${passed ? "PASS" : "FAIL"} ${name}: ${result.status}`);
  if (!passed) failed++;
}

const swapTask = {
  id: 7,
  input: "Hai số nguyên a và b.",
  title: "Hoán đổi hai số",
  tests: [{ input: "-5 2", output: "2 -5" }],
};
const transcript = taskPresentation(swapTask, "-5 2")
  .renderConsoleOutput("Nhap a = Nhap b = Thu tu sau khi hoan doi = 2 -5", "-5 2");
const expectedTranscript = "Nhap a = -5\nNhap b = 2\nThu tu sau khi hoan doi = 2 -5";
if (transcript !== expectedTranscript) {
  console.error(`FAIL custom input transcript: ${JSON.stringify(transcript)}`);
  failed++;
} else {
  console.log("PASS custom input is echoed after each prompt on its own line");
}
if (failed) process.exitCode = 1;

// Exercise the actual school tasks, their per-input prompts and the same entry
// point the single-test and batch buttons call. No hand-built labels here.
const assert = require("node:assert/strict");
const tasks = [1, 2, 3, 4].flatMap(n => require("../data/part" + n + ".json"));
let checked = 0;
function check(task, test, output, status, kwargs = {}) {
  const result = classifyTestResult({ output, exitCode: "0", ...kwargs }, task, test);
  assert.equal(result.status, status, "task " + task.id + ", test " + test.no + ": " + JSON.stringify(output).slice(0, 200));
  assert.equal(result.penalty > 0, status === "PRESENTATION");
  checked++;
}
for (const task of tasks) {
  for (const test of task.tests) {
    const p = taskPresentation(task, test.input);
    const canonical = p.expectedProgramOutput(test.output);
    check(task, test, canonical, "PASS");
    check(task, test, test.output, "PRESENTATION");
    check(task, test, "Kết quả: " + test.output, "PRESENTATION");
    check(task, test, canonical + "  \n\n", "PRESENTATION");
    check(task, test, canonical.replace(/Nhap/g, "Nhập") + " ", "PRESENTATION");
    check(task, test, canonical + "\nkết thúc", "FAIL");
    check(task, test, "", "FAIL");
    check(task, test, "987654321\n" + canonical, "FAIL");
    if (/^\d+$/.test(test.output)) {
      check(task, test, (BigInt(test.output) + 1n).toString(), "FAIL");
    }
  }
}
const triangle = tasks[19];
assert.equal(classifyTestResult({
  exitCode: "0",
  output: "Nhập a = Nhập b = Nhập c = Kết quả kiểm tra tam giác: VALID",
}, triangle, triangle.tests[0]).penalty, 0.05);
for (const test of triangle.tests) {
  const p = taskPresentation(triangle, test.input);
  const opposite = test.output === "VALID" ? "INVALID" : "VALID";
  check(triangle, test, p.expectedProgramOutput(opposite), "FAIL");
  const misspelled = test.output === "VALID" ? "VAILD" : "INVAILD";
  check(triangle, test, p.expectedProgramOutput(misspelled), "FAIL");
  check(triangle, test, "Nhập cạnh a = Nhập cạnh b = Nhập cạnh c = Kết luận: " + test.output, "PRESENTATION");
  check(triangle, test, test.output.toLowerCase(), "PRESENTATION");
  check(triangle, test, p.expectedProgramOutput(opposite + " " + test.output), "FAIL");
}
const checkValue = (id, expected, actual, status) =>
  check(tasks[id - 1], { input: "", output: expected }, actual, status);
checkValue(6, "01:02:03", "1:2:3", "PRESENTATION");
checkValue(6, "01:02:03", "1:3:2", "FAIL");
checkValue(22, "NOT RIGHT", " not   right ", "PRESENTATION");
checkValue(22, "RIGHT", "NOT RIGHT", "FAIL");
checkValue(28, "Q1", "Q11", "FAIL");
checkValue(2, "3\n-4", "3 4", "FAIL");
checkValue(2, "3\n-4", "3 -4", "PRESENTATION");
checkValue(2, "3\n-4", "-4 3", "FAIL");
checkValue(34, "2432902008176640000", "2432902008176640001", "FAIL");
checkValue(5, "6.57", "6.567", "PRESENTATION");
checkValue(5, "-6.57", "-6.565", "PRESENTATION");
checkValue(5, "6.57", "6.56", "FAIL");
checkValue(1, "5", "1+5", "FAIL");
checkValue(1, "5", "--5", "FAIL");
checkValue(148, "X .\n. X", "X . \n. X \n\n", "PRESENTATION");
checkValue(148, "X .\n. X", " X .\n. X", "FAIL");
checkValue(148, "X .\n. X", "X .\n\n. X", "FAIL");
check(triangle, triangle.tests[0], "VALID", "TLE", { timeLimitExceeded: true });
check(triangle, triangle.tests[0], "VALID", "RUNTIME", { exitCode: "1" });
console.log(checked + " verdict checks on " + tasks.length + " production tasks");
