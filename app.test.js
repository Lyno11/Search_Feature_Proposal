/* =====================================================================
   Run with:   node app.test.js
   No dependencies, no browser. Exits with code 1 if any test fails
   (so it can gate a CI step). Loads the CURRENT app.js unchanged by
   stubbing a minimal `document`, then tests the pure functions.
   ===================================================================== */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

/* ---- Load app.js into a sandbox with a fake DOM ------------------- */
function stubEl() {
  return { value: "", textContent: "", innerHTML: "", hidden: false,
           addEventListener() {}, focus() {} };
}
const sandbox = {
  document: { getElementById: () => stubEl() },
  setTimeout: (fn) => { return 0; },   // never fires during load
  clearTimeout: () => {},
  console,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const code = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
// append an export so we can reach the module-scope consts/functions
vm.runInContext(
  code +
  "\n;Object.assign(globalThis, { norm, searchArticles, escapeHTML, highlight, cardHTML, ARTICLES, ICONS });",
  sandbox
);
const { norm, searchArticles, escapeHTML, highlight, cardHTML, ARTICLES, ICONS } = sandbox;

/* ---- Tiny assertion harness -------------------------------------- */
let passed = 0, failed = 0;
const fails = [];
function check(name, cond, detail) {
  if (cond) { passed++; }
  else { failed++; fails.push(name + (detail ? "  — " + detail : "")); }
}
function eq(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  check(name, g === w, `got ${g}, wanted ${w}`);
}
const titles = q => searchArticles(q, ARTICLES).map(a => a.title);

/* =====================================================================
   1. searchArticles — matching & ranking
   ===================================================================== */
eq("exact single match",
   titles("heritage"), ["AI-Powered Cultural Heritage Platform"]);

eq("multi-word: city arts",
   titles("city arts"), ["International Sibling City Arts Exchange"]);

eq("multi-word: youth stories",
   titles("youth stories"), ["Global Youth Storytelling Archive"]);

eq("single-word: peace",
   titles("peace"), ["Virtual Peace Museums Network"]);

// "global": Youth = title(3)+tag "Interactive global map"(2)=5 -> must rank first
eq("ranking: title weight wins",
   titles("global"),
   ["Global Youth Storytelling Archive",
    "International Sibling City Arts Exchange",
    "Virtual Peace Museums Network"]);

// "cultural": AI Heritage highest; Sibling & Peace tie -> original array order
eq("stable tie-break order",
   titles("cultural"),
   ["AI-Powered Cultural Heritage Platform",
    "International Sibling City Arts Exchange",
    "Virtual Peace Museums Network"]);

eq("empty query returns all in order",
   titles(""),
   ["Global Youth Storytelling Archive",
    "AI-Powered Cultural Heritage Platform",
    "International Sibling City Arts Exchange",
    "Virtual Peace Museums Network"]);

eq("whitespace-only query returns all",
   titles("   ").length, 4);

eq("no match returns empty", titles("quantum"), []);

eq("case-insensitive", titles("HERITAGE"),
   ["AI-Powered Cultural Heritage Platform"]);

eq("accent-insensitive (herïtage)",
   titles("her\u00EFtage"), ["AI-Powered Cultural Heritage Platform"]);

// Documented CURRENT limitation — flip this expectation when Fuse.js lands
eq("typo not matched (fuzzy TODO)", titles("hertage"), []);

check("regex metachars don't throw: '('",
      (() => { try { searchArticles("(", ARTICLES); return true; } catch { return false; } })());
check("regex metachars don't throw: 'c++'",
      (() => { try { searchArticles("c++", ARTICLES); return true; } catch { return false; } })());
check("does not mutate ARTICLES order",
      ARTICLES[0].id === "youth-storytelling" && ARTICLES[3].id === "peace-museums");

/* =====================================================================
   2. norm — normalization
   ===================================================================== */
eq("norm lowercases", norm("HeLLo"), "hello");
eq("norm strips accents", norm("Caf\u00E9"), "cafe");

/* =====================================================================
   3. escapeHTML — output safety
   ===================================================================== */
eq("escape < > &", escapeHTML('<a> & "b"'), "&lt;a&gt; &amp; &quot;b&quot;");
eq("escape leaves plain text", escapeHTML("Peace Museums"), "Peace Museums");

/* =====================================================================
   4. highlight — match wrapping + escaping
   ===================================================================== */
eq("highlight wraps the term",
   highlight("Cultural Heritage", ["heritage"]), "Cultural <mark>Heritage</mark>");

eq("highlight is case-insensitive",
   highlight("HERITAGE site", ["heritage"]), "<mark>HERITAGE</mark> site");

eq("highlight escapes HTML in source text first",
   highlight("<b>hi</b>", []), "&lt;b&gt;hi&lt;/b&gt;");

check("highlight with regex-metachar term doesn't throw",
      (() => { try { highlight("a+b", ["+"]); return true; } catch { return false; } })());

check("no term -> no <mark>",
      highlight("plain text", []).indexOf("<mark>") === -1);

/* =====================================================================
   5. XSS / injection through the query path
   ===================================================================== */
(() => {
  const q = '<img src=x onerror=alert(1)>';
  const terms = norm(q).trim().split(/\s+/).filter(Boolean);
  const html = searchArticles(q, ARTICLES).map(a => cardHTML(a, terms)).join("");
  // malicious query matches nothing, and nothing unescaped leaks into output
  check("malicious query yields no cards", searchArticles(q, ARTICLES).length === 0);
  check("no raw <img in rendered output", html.indexOf("<img") === -1);
  check("no raw onerror= in rendered output", html.indexOf("onerror=") === -1);
})();

/* =====================================================================
   6. Data integrity & rendering
   ===================================================================== */
eq("four articles present", ARTICLES.length, 4);

check("every article has a unique id",
      new Set(ARTICLES.map(a => a.id)).size === ARTICLES.length);

check("every icon key exists in ICONS",
      ARTICLES.every(a => typeof ICONS[a.icon] === "string" && ICONS[a.icon].length > 0),
      "an article references a missing icon");

check("every theme is valid",
      ARTICLES.every(a => ["teal", "lime", "grad"].includes(a.theme)),
      "an article has an unknown theme");

check("progress is a number 0..100",
      ARTICLES.every(a => typeof a.progress === "number" && a.progress >= 0 && a.progress <= 100));

// cardHTML output structure
(() => {
  const a = ARTICLES[0];
  const html = cardHTML(a, []);
  check("cardHTML applies theme class", html.includes("theme-" + a.theme));
  check("cardHTML adds .bordered when border=true", a.border ? html.includes("bordered") : true);
  check("cardHTML sets progress width", html.includes("width:" + a.progress + "%"));
  check("cardHTML includes the title", html.includes(a.title));
})();

check("bordered flag drives the class (card-2 not bordered)",
      cardHTML(ARTICLES[1], []).includes("bordered") === false);

/* =====================================================================
   Report
   ===================================================================== */
console.log(`\n${passed} passed, ${failed} failed  (${passed + failed} total)`);
if (failed) {
  console.log("\nFAILURES:");
  fails.forEach(f => console.log("  ✗ " + f));
  process.exit(1);
} else {
  console.log("All tests passed. ✓");
}
