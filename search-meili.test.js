/* =====================================================================
   search-meili.test.js — integration tests for the Meilisearch layer
   ---------------------------------------------------------------------
   Run:  node search-meili.test.js
   No server and no browser needed: it loads app.js + search-meili.js in
   a sandbox with a stub DOM and a MOCKED fetch, then drives the search
   box and asserts what gets rendered. Exits 1 on any failure.
   ===================================================================== */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const APP = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
const INT = fs.readFileSync(path.join(__dirname, "search-meili.js"), "utf8");

/* ---- grab the real ARTICLES once (to build realistic mock hits) ---- */
const ARTICLES = (() => {
  const s = { console,
    document: { getElementById: () => ({ addEventListener(){}, focus(){},
      cloneNode(){ return this; }, value:"", innerHTML:"", textContent:"", hidden:false,
      parentNode:{ replaceChild(){} } }) },
    setTimeout: () => 0, clearTimeout(){}, window: {} };
  s.globalThis = s; vm.createContext(s);
  vm.runInContext(APP + "\n;globalThis.__A = ARTICLES;", s);
  return s.__A;
})();
const HERITAGE = ARTICLES.find(a => a.id === "ai-heritage");
const YOUTH    = ARTICLES.find(a => a.id === "youth-storytelling");

/* ---- stub DOM ---- */
function makeEl(id, els) {
  const e = { id, value:"", textContent:"", innerHTML:"", hidden:false, _l:{},
    addEventListener(t, fn){ (this._l[t] = this._l[t] || []).push(fn); },
    dispatch(t, ev){ (this._l[t] || []).forEach(fn => fn(ev)); },
    focus(){}, cloneNode(){ return makeEl(id, els); } };
  e.parentNode = { replaceChild(n, o){ els[o.id] = n; } };
  return e;
}

/* ---- load app.js + search-meili.js with a given fetch + config ---- */
function setup({ config, fetchImpl }) {
  const els = {};
  ["article-search","search-clear","results","empty","search-count"].forEach(id => els[id] = makeEl(id, els));
  const sandbox = {
    console,
    document: { getElementById: id => els[id] },
    fetch: fetchImpl,
    setTimeout: (fn) => { fn(); return 0; },  // debounce fires immediately
    clearTimeout() {},
    window: { MEILI_CONFIG: config },
  };
  sandbox.globalThis = sandbox; sandbox.window.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(APP, sandbox);
  vm.runInContext(INT, sandbox);
  return els;
}

const tick  = () => new Promise(r => global.setTimeout(r, 5)); // flush async chain
const type  = (els, q) => { const i = els["article-search"]; i.value = q; i.dispatch("input", { target: i }); };
const click = (els, id) => els[id].dispatch("click", {});
const cards = html => (html.match(/<article class="card/g) || []).length;

const okHits = hits => async () => ({ ok:true, status:200, json: async () => ({ hits }) });

/* ---- assertion harness ---- */
let passed = 0, failed = 0; const fails = [];
function check(name, cond, detail){ cond ? passed++ : (failed++, fails.push(name + (detail?"  — "+detail:""))); }
function eq(name, got, want){ const g=JSON.stringify(got), w=JSON.stringify(want); check(name, g===w, `got ${g}, wanted ${w}`); }

/* =====================================================================
   Tests
   ===================================================================== */
async function main() {

  // 1) Correct request is sent to Meilisearch
  {
    const calls = [];
    const fetchImpl = async (url, opts) => { calls.push({ url, opts }); return (await okHits([HERITAGE])()); };
    const els = setup({ config:{ host:"http://localhost:7700", searchKey:"test-key", index:"programs" }, fetchImpl });
    await tick();
    type(els, "zzz"); await tick();
    const last = calls[calls.length - 1];
    check("request URL is /indexes/<index>/search", last.url === "http://localhost:7700/indexes/programs/search", last.url);
    check("request method is POST", last.opts.method === "POST");
    check("Authorization uses the search key", last.opts.headers["Authorization"] === "Bearer test-key");
    check("Content-Type is application/json", last.opts.headers["Content-Type"] === "application/json");
    eq("request body carries q + limit", JSON.parse(last.opts.body), { q:"zzz", limit:50 });
  }

  // 2) Renders Meilisearch's hits — NOT the local result
  {
    // query "zzz" -> local search returns [] ; mock returns [HERITAGE].
    // If the Heritage card shows, results came from Meilisearch.
    const els = setup({ config:{ host:"http://h", searchKey:"k", index:"programs" }, fetchImpl: okHits([HERITAGE]) });
    await tick();
    type(els, "zzz"); await tick();
    check("renders 1 card from Meili hits", cards(els["results"].innerHTML) === 1, String(cards(els["results"].innerHTML)));
    check("card is the Heritage program", els["results"].innerHTML.includes("Heritage"));
    check("no offline note when Meili answered", !els["search-count"].textContent.includes("offline"));
  }

  // 3) Falls back to local search when the request throws (offline)
  {
    const els = setup({ config:{ host:"http://h", searchKey:"k", index:"programs" }, fetchImpl: async () => { throw new Error("network down"); } });
    await tick();
    type(els, "heritage"); await tick();
    check("fallback renders local match", els["results"].innerHTML.includes("Heritage"));
    check("offline note shown on fallback", els["search-count"].textContent.includes("offline"));
  }

  // 4) Falls back on a non-OK HTTP status (e.g. 403/404)
  {
    const els = setup({ config:{ host:"http://h", searchKey:"bad", index:"programs" }, fetchImpl: async () => ({ ok:false, status:403, json: async()=>({}) }) });
    await tick();
    type(els, "heritage"); await tick();
    check("fallback on HTTP 403", els["results"].innerHTML.includes("Heritage"));
    check("offline note on HTTP error", els["search-count"].textContent.includes("offline"));
  }

  // 5) Unconfigured (no host/key) -> local search, and NO offline note, and fetch never called
  {
    let fetchCalled = false;
    const els = setup({ config:{ host:"", searchKey:"" }, fetchImpl: async () => { fetchCalled = true; return okHits([])(); } });
    await tick();
    type(els, "heritage"); await tick();
    check("unconfigured never calls fetch", fetchCalled === false);
    check("unconfigured renders local match", els["results"].innerHTML.includes("Heritage"));
    check("unconfigured shows NO offline note", !els["search-count"].textContent.includes("offline"));
  }

  // 6) Empty query -> all programs, and no count text
  {
    const els = setup({ config:{ host:"http://h", searchKey:"k", index:"programs" }, fetchImpl: okHits(ARTICLES) });
    await tick(); // initial run("") settles
    check("empty query renders all four", cards(els["results"].innerHTML) === 4, String(cards(els["results"].innerHTML)));
    eq("no count text for empty query", els["search-count"].textContent, "");
  }

  // 7) Clear button resets to all + clears the input
  {
    const fetchImpl = async (url, opts) => {
      const q = JSON.parse(opts.body).q;
      return okHits(q ? [HERITAGE] : ARTICLES)();
    };
    const els = setup({ config:{ host:"http://h", searchKey:"k", index:"programs" }, fetchImpl });
    await tick();
    type(els, "heritage"); await tick();
    check("query renders 1 card", cards(els["results"].innerHTML) === 1);
    click(els, "search-clear"); await tick();
    check("clear restores all four", cards(els["results"].innerHTML) === 4, String(cards(els["results"].innerHTML)));
    check("clear empties the input", els["article-search"].value === "");
  }

  // 8) Out-of-order responses: a late/stale response must not overwrite a newer one
  {
    const resolvers = [];
    const fetchImpl = () => new Promise(res => {
      resolvers.push(hits => res({ ok:true, status:200, json: async () => ({ hits }) }));
    });
    const els = setup({ config:{ host:"http://h", searchKey:"k", index:"programs" }, fetchImpl });
    // resolvers[0] is the initial run("") — leave it pending.
    type(els, "a"); // resolvers[1] -> reqId 2
    type(els, "b"); // resolvers[2] -> reqId 3
    resolvers[2](YOUTH ? [YOUTH] : []);      // newest resolves first -> renders "b"
    await tick();
    const afterB = els["results"].innerHTML;
    check("newest response renders", afterB.includes("Storytelling"));
    resolvers[1]([HERITAGE]);                 // stale older response resolves late
    await tick();
    check("stale response does NOT overwrite newer", els["results"].innerHTML.includes("Storytelling"));
    check("stale response did not inject older result", !els["results"].innerHTML.includes("Heritage"));
  }

  /* ---- report ---- */
  console.log(`\n${passed} passed, ${failed} failed  (${passed + failed} total)`);
  if (failed) { console.log("\nFAILURES:"); fails.forEach(f => console.log("  ✗ " + f)); process.exit(1); }
  console.log("All integration tests passed. ✓");
}

main().catch(e => { console.error(e); process.exit(1); });
