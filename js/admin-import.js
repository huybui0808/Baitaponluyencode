// VI: Phân biệt thay đề thật với các lần chỉ cập nhật test hoặc ràng buộc.
// EN: Distinguish replaced exercises from test-case or constraint-only edits.
export const MAX_AUTO_RESET_PROBLEMS = 50;

export function exceedsAutoResetLimit(count) {
  return !Number.isInteger(count) || count < 0 || count > MAX_AUTO_RESET_PROBLEMS;
}

function comparableText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .toLocaleLowerCase("vi")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function fieldChanged(existing, incoming, field) {
  return comparableText(existing?.[field]) !== comparableText(incoming?.[field]);
}

export function findReplacedProblems(tasks, existingById) {
  return tasks.filter((task) => {
    const existing = existingById.get(task.id);
    if (!existing) return false;

    const titleChanged = fieldChanged(existing, task, "title");
    const statementChanged = fieldChanged(existing, task, "statement");
    const inputChanged = fieldChanged(existing, task, "input");
    const outputChanged = fieldChanged(existing, task, "output");

    // A title plus statement change identifies the replacement in this project.
    // If the title stays the same, require the statement and both I/O descriptions
    // to change. Test data, sample values and constraints alone never reset progress.
    return (titleChanged && statementChanged) ||
      (statementChanged && inputChanged && outputChanged);
  });
}
