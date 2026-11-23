import { taskPresentation } from "./problem-presentation.js";

// VI: Đối chiếu stdout. EN: Input echo belongs only to the displayed transcript.
// Keep every trailing newline: one final line break is still extra stdout
// for this project's strict presentation rules (only CRLF is normalized).
const normalize = value => String(value ?? "").replace(/\r\n?/g, "\n");
// Tail whitespace is a formatting rule for every problem. Interior spaces and
// line breaks stay significant so shapes and tables cannot drift.
const stripOutputTailWhitespace = value => String(value ?? "")
  .replace(/\r\n?/g, "\n")
  .split("\n")
  .map(line => line.replace(/[ \t]+$/g, ""))
  .join("\n")
  .replace(/\n+$/g, "");
const foldLabel = text => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/đ/g, "d");
const strictLayout = new Set([65,66,67,68,72,74,92,
  139,142,143,149]);

function labelPattern(presentation) {
  const labels = [...presentation.prompts, ...(presentation.lineLabels || [presentation.resultLabel])];
  const bodies = labels.map(label => foldLabel(label).match(/[\p{L}\p{N}]+/gu)?.join("[\\s:=()!.,_-]*"))
    .filter(Boolean).sort((a, b) => b.length - a.length);
  if (!bodies.length) return /a^/gu;
  // Never consume the minus sign or a digit from the start of a value.
  return new RegExp("(?<![\\p{L}\\p{N}_])(?:" + bodies.join("|") + ")(?![\\p{L}\\p{N}_])[!)]*[ \\t]*(?:[:=：＝;!?]+|[.,](?=\\s))?", "gu");
}

function removeHeadings(text, pattern, task) {
  const withoutKnown = foldLabel(text).replace(pattern, " ");
  // Allow a changed heading with an explicit separator. An answer token on
  // its own cannot become a heading just by adding a colon after it.
  return withoutKnown.split("\n").map(line => {
    let rest = line.trimStart();
    let heading;
    while ((heading = /^([\p{L}][\p{L} \t_'’()-]*)[:=：＝][ \t]*/u.exec(rest))) {
      const name = heading[1].trim();
      if (task.tests?.some(test => foldLabel(test.output.trim()) === name)) break;
      rest = rest.slice(heading[0].length);
    }
    // Recognizable I/O labels can also be missing their final colon.
    let prompt;
    while ((prompt = /^(?:nhap(?: vao)?|cho)\s+[\p{L}\p{N}_ ]{1,80}?(?=\s+(?:(?:nhap|cho)\b|(?:tong|hieu|tich|ket qua|gia tri|max|min|so luong)\b)|[:=]|$)/u.exec(rest))) {
      rest = rest.slice(prompt[0].length).trimStart();
    }
    rest = rest.replace(/^(?:nhap (?:vao )?(?:canh |bien )?[\p{L}][\p{L}\p{N}_ ]*|cho [\p{L}][\p{L}\p{N}_ ]*)(?:[:=]\s*|\s+(?=[+-]?(?:\d|[.,]\d)))/u, "");
    return rest.replace(/^(?:ket luan|(?:tong|hieu|tich|ket qua) (?:[\p{L} ]+ )?la)(?=\s*[+-]?\d|\s*$)/u, "").trim();
  }).join("\n");
}

// Compare base-10 digits directly. Adjacent long long values may have the
// same JavaScript Number. Extra decimal places use decimal half-away rounding.
const decimalToken = /^([+-]?)(\d+(?:[.,]\d*)?|[.,]\d+)(?:e([+-]?\d+))?$/i;
function decimalKey(token, places) {
  const match = decimalToken.exec(token);
  if (!match) return null;
  const exponent = Number(match[3] || 0);
  if (!Number.isSafeInteger(exponent)) return null;
  const [whole, fraction = ""] = match[2].split(/[.,]/);
  let digits = (whole + fraction).replace(/^0+/, "");
  if (!digits) return "0";
  let power = exponent - fraction.length;
  if (places !== undefined && power < -places) {
    const keep = digits.length + power + places;
    if (keep < 0) return "0";
    const roundUp = digits[keep] >= "5";
    digits = digits.slice(0, keep);
    if (roundUp) digits = (BigInt(digits || "0") + 1n).toString();
    if (!digits) return "0";
    power = -places;
  }
  const significant = digits.replace(/0+$/, "");
  return (match[1] === "-" ? "-" : "") + significant + "e" + (power + digits.length - significant.length);
}

function layoutMatches(actual, expected, pattern, task) {
  const rows = text => text.trimEnd().split("\n").map(line => line.trimEnd());
  const got = rows(actual);
  const want = rows(expected);
  const first = got.length - want.length;
  if (first < 0 || !want.every((line, i) => i === 0 || line === got[first + i])) return false;
  if (!got[first].endsWith(want[0])) return false;
  const inlinePrefix = got[first].slice(0, got[first].length - want[0].length);
  if (inlinePrefix && !inlinePrefix.trim()) return false; // first symbol shifted
  return !removeHeadings([...got.slice(0, first), inlinePrefix].join("\n"), pattern, task).trim();
}

function labeledNumericLinesMatch(actual, expected, presentation, pattern, task) {
  const labels = presentation.lineLabels;
  const expectedLines = normalize(expected).split("\n");
  if (!labels?.length || labels.length !== expectedLines.length ||
      !expectedLines.every(line => line.trim() && line.trim().split(/\s+/).every(token => decimalToken.test(token)))) return false;

  const numericLine = /^[ \t]*([+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?(?:[ \t]+[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?)*?)[ \t]*$/i;
  const actualLines = normalize(actual).split("\n");
  if (actualLines.length !== labels.length) return false;
  const actualValues = [];
  for (const label of labels) {
    const words = foldLabel(label).match(/[\p{L}\p{N}]+/gu) || [];
    if (!words.length) return false;
    const body = words.map(word => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s:=()!.,_-]*");
    const labelPattern = new RegExp("(?<![\\p{L}\\p{N}_])" + body + "(?![\\p{L}\\p{N}_])[!)]*[ \\t]*(?::|=)?[ \\t]*(.*)$", "u");
    const matches = actualLines.map(line => ({ line, match: labelPattern.exec(foldLabel(line)) })).filter(item => item.match);
    if (matches.length !== 1) return false;
    const { line, match } = matches[0];
    if (removeHeadings(line.slice(0, match.index), pattern, task).trim()) return false;
    const values = numericLine.exec(match[1]);
    if (!values) return false;
    actualValues.push(values[1].trim().split(/[ \t]+/));
  }
  return expectedLines.every((line, index) => {
    const values = line.trim().split(/\s+/);
    return values.length === actualValues[index].length &&
      values.every((value, at) => decimalKey(value) === decimalKey(actualValues[index][at]));
  });
}

function semanticMatch(actual, expected, task, presentation) {
  if (!actual.trim() || !expected.trim()) return false;
  const pattern = labelPattern(presentation);
  if (strictLayout.has(Number(task.id)) || String(task.kind || "").startsWith("matrix_shape_") ||
      /in hàng đầu của ma trận/iu.test(String(task.output || "")) || /^[\s*#.]+$/.test(expected)) {
    return layoutMatches(actual, expected, pattern, task);
  }
  // A result whose values are attached to the right labels remains correct
  // when the labeled lines are printed in the wrong order; classify that as PE.
  if (labeledNumericLinesMatch(actual, expected, presentation, pattern, task)) return true;
  // VI: Nhãn ở từng dòng output là phần trình bày; so giá trị sau nhãn theo đúng thứ tự.
  // EN: Compare values after each output label before judging presentation.
  const expectedTokens = removeHeadings(expected, pattern, task).trim().split(/\s+/);
  const isNumeric = expectedTokens.every(token => decimalToken.test(token));
  if (isNumeric) {
    // A correct value followed by prose is extra output, not a formatting-only
    // label change. Allow terminal punctuation, but require the answer at EOF.
    if (!/[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?[ \t\r\n.!?]*$/i.test(actual)) return false;
    // Input prompts are arbitrary task text (for example "Cho A =" or
    // "Nhap cac so ="). Strip prompt labels before comparing answer values;
    // different wording is a presentation error, not a wrong answer.
    const promptPattern = /(?:nhap(?: vao)?|cho)\s+[\p{L}\p{N}_ ]{1,100}?(?:[:=]\s*|\s+(?=[+-]?(?:\d|[.,]\d)))/giu;
    const numericPattern = /(?<![\p{L}\p{N}_])[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?(?![\p{L}\p{N}_])/giu;
    const tokens = removeHeadings(actual, pattern, task)
      .replace(promptPattern, " ")
      .match(numericPattern) || [];
    if (tokens.length !== expectedTokens.length) return false;
    const places = String(task.output || "").match(/(\d+)\s+chữ số sau/i);
    const precision = places ? Number(places[1]) : undefined;
    return tokens.length === expectedTokens.length && expectedTokens.every((token, i) =>
      decimalKey(tokens[i], precision) === decimalKey(token));
  }
  const clock = /^\d+:\d+:\d+$/.test(expected);
  if (clock) {
    const time = actual.trimEnd().match(/(\d+)\s*:\s*(\d+)\s*:\s*(\d+)$/);
    return !!time && expected.split(":").every((n, i) => decimalKey(n) === decimalKey(time[i + 1]))
      && !removeHeadings(actual.slice(0, time.index), pattern, task).trim();
  }
  // Preserve whole answer words and their order (VALID is a suffix of INVALID).
  const phrase = expectedTokens.map(token => token.replace(/[.*+?^$\x7b\x7d()|[\]\\]/g, "\\$&")).join("\\s+");
  const answer = new RegExp("(?<![\\p{L}\\p{N}_])(?:" + phrase + ")\\s*$", "iu").exec(actual);
  if (!answer) return false;
    const promptPattern = /(?:nhap(?: vao)?|cho)\s+[\p{L}\p{N}_ ]{1,100}?(?:[:=]\s*|\s+(?=[+-]?(?:\d|[.,]\d)))/giu;
  const prefix = removeHeadings(actual.slice(0, answer.index), pattern, task).replace(promptPattern, " ");
  return !prefix.trim();
}

function presentationSeverity(actual, expected, presentation) {
  const compact = text => foldLabel(text).replace(/[\s\p{P}\p{S}]/gu, "");
  if (compact(actual) === compact(expected)) return 0.05;
  const required = [...presentation.prompts, ...(presentation.lineLabels || [presentation.resultLabel])];
  return required.every(label => actual.includes(label)) ? 0.15 : 0.10;
}

export function classifyTestResult(result, task, test, presentation) {
  if (result.timeLimitExceeded) return { status: "TLE", message: "QUÁ THỜI GIAN (TLE)", penalty: 0 };
  if (String(result.exitCode) !== "0") return { status: "RUNTIME", message: "LỖI CHẠY", penalty: 0 };
  presentation ??= taskPresentation(task, test.input);
  const actual = normalize(result.output);
  const expected = normalize(presentation.expectedProgramOutput(test.output));
  if (actual === expected) return { status: "PASS", message: "ĐÚNG", penalty: 0 };
  if (stripOutputTailWhitespace(actual) === stripOutputTailWhitespace(expected)) {
    return { status: "PRESENTATION", message: "ĐÚNG THUẬT TOÁN · LỖI TRÌNH BÀY",
      penalty: presentationSeverity(actual, expected, presentation) };
  }
  if (semanticMatch(actual, normalize(test.output), task, presentation)) {
    return { status: "PRESENTATION", message: "ĐÚNG THUẬT TOÁN · LỖI TRÌNH BÀY",
      penalty: presentationSeverity(actual, expected, presentation) };
  }
  return { status: "FAIL", message: "SAI", penalty: 0 };
}
