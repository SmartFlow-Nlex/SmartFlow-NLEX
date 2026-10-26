/* Run logic that the application keeps inline or unexported, without
 * changing the application.
 *
 * Several behaviours the test-case sheet names live inside React components
 * (useMemo blocks, module-private helpers in "use client" files) or behind
 * modules with import-time side effects. These helpers read the REAL source
 * file, cut out the exact declaration or expression, transpile it with esbuild
 * and evaluate it. Nothing is copied into the tests, so a change to the app's
 * logic changes what the test runs; a change to its shape makes extraction
 * throw instead of silently testing stale code. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transformSync } from "esbuild";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export function readSource(relFromRepo: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relFromRepo), "utf8");
}

const OPEN: Record<string, string> = { "(": ")", "{": "}", "[": "]" };
const REGEX_PREV = new Set(["(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*", "%", "<", ">", "~", "^", ""]);

/** Index just past the string/comment/regex starting at i, or -1 if none starts there. */
function skipLiteral(src: string, i: number, prevSignificant: string): number {
  const c = src[i];
  if (c === "/" && src[i + 1] === "/") return src.indexOf("\n", i) === -1 ? src.length : src.indexOf("\n", i);
  if (c === "/" && src[i + 1] === "*") return src.indexOf("*/", i + 2) + 2;
  if (c === "'" || c === '"') {
    let j = i + 1;
    while (j < src.length && src[j] !== c) j += src[j] === "\\" ? 2 : 1;
    return j + 1;
  }
  if (c === "`") {
    let j = i + 1;
    while (j < src.length && src[j] !== "`") {
      if (src[j] === "\\") { j += 2; continue; }
      if (src[j] === "$" && src[j + 1] === "{") { j = matchClose(src, j + 1) + 1; continue; }
      j++;
    }
    return j + 1;
  }
  if (c === "/" && REGEX_PREV.has(prevSignificant)) {
    let j = i + 1;
    let inClass = false;
    while (j < src.length) {
      if (src[j] === "\\") { j += 2; continue; }
      if (src[j] === "[") inClass = true;
      else if (src[j] === "]") inClass = false;
      else if (src[j] === "/" && !inClass) break;
      else if (src[j] === "\n") return -1; // not a regex after all
      j++;
    }
    j++;
    while (/[a-z]/i.test(src[j] ?? "")) j++;
    return j;
  }
  return -1;
}

/** Given the index of an opening bracket, the index of its matching close. */
export function matchClose(src: string, openIdx: number): number {
  const stack: string[] = [OPEN[src[openIdx]]];
  let prev = src[openIdx];
  for (let i = openIdx + 1; i < src.length; i++) {
    const skip = skipLiteral(src, i, prev);
    if (skip !== -1) { i = skip - 1; prev = "x"; continue; }
    const c = src[i];
    if (OPEN[c]) stack.push(OPEN[c]);
    else if (c === ")" || c === "}" || c === "]") {
      if (stack.pop() !== c) throw new Error(`unbalanced '${c}' at ${i}`);
      if (stack.length === 0) return i;
    }
    if (!/\s/.test(c)) prev = c;
  }
  throw new Error("no matching close bracket");
}

function indexOfOrThrow(src: string, needle: string | RegExp, from = 0, what = String(needle)): number {
  if (typeof needle === "string") {
    const i = src.indexOf(needle, from);
    if (i === -1) throw new Error(`source no longer contains ${what}`);
    return i;
  }
  const re = new RegExp(needle.source, needle.flags.includes("g") ? needle.flags : needle.flags + "g");
  re.lastIndex = from;
  const m = re.exec(src);
  if (!m) throw new Error(`source no longer contains ${what}`);
  return m.index;
}

/** Index of a function body's `{`, skipping a return-type annotation such as
 *  `): { a: number } | null {` — a `{` that starts a type (first in the
 *  annotation, or after | & < , ( :) is a type literal, not the body. */
function bodyOpenAfterParams(src: string, closeParen: number): number {
  let i = closeParen + 1;
  while (/\s/.test(src[i])) i++;
  if (src[i] !== ":") return src.indexOf("{", closeParen);
  let prev = ":";
  for (i++; i < src.length; i++) {
    const c = src[i];
    if (/\s/.test(c)) continue;
    if (c === "{" && !"|&<,(:".includes(prev)) return i;
    if (c === "{" || c === "(" || c === "[" || c === "<") {
      i = c === "<" ? src.indexOf(">", i) : matchClose(src, i);
      prev = "x";
      continue;
    }
    prev = c;
  }
  throw new Error("function body not found");
}

/** Full text of `function name(...) {...}` or `const|let name = ...;` (export keyword dropped). */
export function declaration(src: string, name: string): string {
  const fnRe = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\*?\\s+${name}\\s*[(<]`);
  const fm = fnRe.exec(src);
  if (fm) {
    const start = fm.index + (fm[0].startsWith("export") ? fm[0].indexOf("function") : 0);
    // Parameters may hold default values with braces; skip the parameter list
    // first, then take the body.
    const paren = src.indexOf("(", start);
    const body = bodyOpenAfterParams(src, matchClose(src, paren));
    return src.slice(start, matchClose(src, body) + 1);
  }
  const constRe = new RegExp(`(?:export\\s+)?(const|let)\\s+${name}\\b[^=]*=`);
  const cm = constRe.exec(src);
  if (!cm) throw new Error(`source no longer declares ${name}`);
  const start = cm.index + (cm[0].startsWith("export") ? cm[0].indexOf(cm[1]) : 0);
  let i = cm.index + cm[0].length;
  let prev = "=";
  for (; i < src.length; i++) {
    const skip = skipLiteral(src, i, prev);
    if (skip !== -1) { i = skip - 1; prev = "x"; continue; }
    const c = src[i];
    if (OPEN[c]) { i = matchClose(src, i); prev = "x"; continue; }
    if (c === ";") break;
    if (!/\s/.test(c)) prev = c;
  }
  return src.slice(start, i) + ";";
}

/** The balanced bracket group that follows `anchor` (searched from `after`). Brackets included. */
export function groupAfter(src: string, anchor: string | RegExp, opener: "(" | "{" | "[" = "(", after: string | RegExp | null = null): string {
  const from = after == null ? 0 : indexOfOrThrow(src, after);
  const a = indexOfOrThrow(src, anchor, from);
  const open = src.indexOf(opener, a);
  return src.slice(open, matchClose(src, open) + 1);
}

/** The single argument inside a call's parentheses, e.g. the comparator of `.sort(...)`. */
export function argument(src: string, anchor: string | RegExp, after: string | RegExp | null = null): string {
  return groupAfter(src, anchor, "(", after).slice(1, -1).trim().replace(/,$/, "");
}

/** Text from `start` up to (not including) `end`, both searched in order. */
export function between(src: string, start: string | RegExp, end: string | RegExp, after: string | RegExp | null = null): string {
  const from = after == null ? 0 : indexOfOrThrow(src, after);
  const s = indexOfOrThrow(src, start, from);
  const e = indexOfOrThrow(src, end, s + 1);
  return src.slice(s, e);
}

/** Transpile TypeScript snippets and evaluate them, returning the named bindings. */
export function evaluate<T = Record<string, any>>(snippets: string[], names: string[], deps: Record<string, unknown> = {}): T {
  const ts = snippets.join("\n\n");
  const { code } = transformSync(ts, { loader: "ts", target: "es2022" });
  const fn = new Function(...Object.keys(deps), `${code}\nreturn { ${names.join(", ")} };`);
  return fn(...Object.values(deps)) as T;
}
