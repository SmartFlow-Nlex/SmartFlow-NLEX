/**
 * A tiny test harness, so the game's tests need nothing beyond the
 * TypeScript compiler already in the repo. `scripts/test-grand-prix.js`
 * compiles core/ and tests/ and runs every registered test.
 */

type TestFn = () => void | Promise<void>;

const registry: { name: string; fn: TestFn }[] = [];

export function test(name: string, fn: TestFn): void {
  registry.push({ name, fn });
}

class AssertionError extends Error {}

function fail(message: string): never {
  throw new AssertionError(message);
}

export const assert = {
  ok(value: unknown, message = 'expected a truthy value'): void {
    if (!value) {
      fail(message);
    }
  },
  equal<T>(actual: T, expected: T, message = ''): void {
    if (actual !== expected) {
      fail(`${message} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`.trim());
    }
  },
  deepEqual(actual: unknown, expected: unknown, message = ''): void {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    if (a !== b) {
      fail(`${message} expected ${b}, got ${a}`.trim());
    }
  },
  atLeast(actual: number, min: number, message = ''): void {
    if (!(actual >= min)) {
      fail(`${message} expected >= ${min}, got ${actual}`.trim());
    }
  },
  atMost(actual: number, max: number, message = ''): void {
    if (!(actual <= max)) {
      fail(`${message} expected <= ${max}, got ${actual}`.trim());
    }
  },
};

export async function runAll(filter?: string): Promise<{ passed: number; failed: number }> {
  let passed = 0;
  let failed = 0;
  for (const { name, fn } of registry) {
    if (filter !== undefined && !name.includes(filter)) {
      continue;
    }
    const started = Date.now();
    try {
      await fn();
      passed += 1;
      console.log(`  ok   ${name} (${Date.now() - started} ms)`);
    } catch (error) {
      failed += 1;
      console.log(`  FAIL ${name}\n       ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { passed, failed };
}
