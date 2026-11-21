import { taskPresentation } from "./problem-presentation.js";

// VI: Đối chiếu stdout. EN: Input echo belongs only to the displayed transcript.
const normalize = value => String(value ?? "").replace(/\r\n?/g, "\n").replace(/\n$/, "");
const foldLabel = text => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/đ/g, "d");
const strictLayout = new Set([65,66,67,68,69,70,71,72,73,74,75,91,92,
  133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150]);

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
    return rest.replace(/^(?:nhap (?:canh |bien )?[a-z]|ket luan|(?:tong|hieu|tich|ket qua) (?:[\p{L} ]+ )?la)(?=\s*[+-]?\d|\s*$)/u, "").trim();
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

function semanticMatch(actual, expected, task, presentation) {
  if (!actual.trim() || !expected.trim()) return false;
  const pattern = labelPattern(presentation);
  if (strictLayout.has(Number(task.id)) || /^[\s*#.]+$/.test(expected)) {
    return layoutMatches(actual, expected, pattern, task);
  }
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
    const promptPattern = /(?:nh[aậ]p|cho)\s+[^:=\n]{0,100}[:=：＝]\s*/giu;
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
  const promptPattern = /(?:nh[aậ]p|cho)\s+[^:=\n]{0,100}[:=：＝]\s*/giu;
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
  if (semanticMatch(actual, normalize(test.output), task, presentation)) {
    return { status: "PRESENTATION", message: "ĐÚNG THUẬT TOÁN · LỖI TRÌNH BÀY",
      penalty: presentationSeverity(actual, expected, presentation) };
  }
  return { status: "FAIL", message: "SAI", penalty: 0 };
}
