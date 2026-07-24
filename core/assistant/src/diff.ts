// A minimal line diff for showing a proposed manifest against the current one. It computes
// a longest-common-subsequence of lines and renders context, removals, and additions. This
// is display only; it carries no dependency.

interface Op {
  kind: " " | "-" | "+";
  line: string;
}

function diffOps(before: string[], after: string[]): Op[] {
  const n = before.length;
  const m = after.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = before[i] === after[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      ops.push({ kind: " ", line: before[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      ops.push({ kind: "-", line: before[i]! });
      i++;
    } else {
      ops.push({ kind: "+", line: after[j]! });
      j++;
    }
  }
  while (i < n) ops.push({ kind: "-", line: before[i++]! });
  while (j < m) ops.push({ kind: "+", line: after[j++]! });
  return ops;
}

// Renders a unified-style diff between two texts. Unchanged when the texts are identical.
export function renderDiff(before: string, after: string): string {
  if (before === after) {
    return "(no changes)";
  }
  const ops = diffOps(before.split("\n"), after.split("\n"));
  return ops.map((op) => `${op.kind} ${op.line}`).join("\n");
}
