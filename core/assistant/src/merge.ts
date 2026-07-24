// Reconciling a proposed manifest with the file it replaces. A model returns a whole new
// manifest as text, which loses the comments and blank-line spacing of the original. This
// transplants those back: it walks the proposed document and, for every node that still
// exists at the same key path in the original, copies the original's comments and spacing.
// Unchanged parts keep their comments; genuinely changed or removed keys do not, which is
// exactly right. Values always come from the proposal, so semantics are never altered.

import { isMap, isScalar, isSeq, parseDocument, type Node } from "yaml";

function copyComments(from: Node, to: Node): void {
  if (to.commentBefore == null && from.commentBefore != null) {
    to.commentBefore = from.commentBefore;
  }
  if (to.comment == null && from.comment != null) {
    to.comment = from.comment;
  }
  if (!to.spaceBefore && from.spaceBefore) {
    to.spaceBefore = true;
  }
}

function transplant(from: Node, to: Node): void {
  copyComments(from, to);

  if (isMap(from) && isMap(to)) {
    for (const toPair of to.items) {
      if (!isScalar(toPair.key)) {
        continue;
      }
      const key = toPair.key.value;
      const fromPair = from.items.find((p) => isScalar(p.key) && p.key.value === key);
      if (fromPair === undefined) {
        continue;
      }
      if (isScalar(fromPair.key)) {
        copyComments(fromPair.key, toPair.key);
      }
      if (fromPair.value != null && toPair.value != null) {
        transplant(fromPair.value as Node, toPair.value as Node);
      }
    }
    return;
  }

  if (isSeq(from) && isSeq(to)) {
    const count = Math.min(from.items.length, to.items.length);
    for (let i = 0; i < count; i++) {
      const fromItem = from.items[i];
      const toItem = to.items[i];
      if (fromItem != null && toItem != null) {
        transplant(fromItem as Node, toItem as Node);
      }
    }
  }
}

// Returns the proposed manifest with the original's comments and spacing preserved where
// the structure still matches. If either document fails to parse, the proposal is returned
// unchanged rather than risk mangling it.
export function mergeManifestComments(originalYaml: string, proposedYaml: string): string {
  const origDoc = parseDocument(originalYaml);
  const newDoc = parseDocument(proposedYaml);
  if (origDoc.errors.length > 0 || newDoc.errors.length > 0) {
    return proposedYaml;
  }
  if (newDoc.commentBefore == null && origDoc.commentBefore != null) {
    newDoc.commentBefore = origDoc.commentBefore;
  }
  if (origDoc.contents != null && newDoc.contents != null) {
    transplant(origDoc.contents, newDoc.contents);
  }
  return newDoc.toString();
}
