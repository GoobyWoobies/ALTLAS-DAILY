// Tiny test harness: runs in the browser, prints results into the page and
// sets document.title to "PASS n" or "FAIL n/m" so a headless run can read it.
const tests = [];
export function test(name, fn) {
  tests.push({ name, fn });
}

export function assert(cond, msg = 'assertion failed') {
  if (!cond) throw new Error(msg);
}
export function eq(a, b, msg = '') {
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  if (sa !== sb) throw new Error(`${msg} expected ${sb}, got ${sa}`);
}
export function near(a, b, tol, msg = '') {
  if (!(Math.abs(a - b) <= tol)) throw new Error(`${msg} expected ${b} ± ${tol}, got ${a}`);
}

export async function run() {
  const out = document.getElementById('out');
  const lines = [];
  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      lines.push(`ok   ${t.name}`);
    } catch (e) {
      failed += 1;
      lines.push(`FAIL ${t.name}\n     ${e.message}`);
    }
  }
  lines.push('', `${tests.length - failed}/${tests.length} passed`);
  out.textContent = lines.join('\n');
  document.title = failed ? `FAIL ${failed}/${tests.length}` : `PASS ${tests.length}`;
}
