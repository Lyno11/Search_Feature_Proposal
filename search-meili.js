/* =====================================================================
   search-meili.js — Meilisearch integration for the program search
   ---------------------------------------------------------------------
   DROP-IN: load this AFTER app.js in index.html:

       <script src="app.js"></script>
       <script src="search-meili.js"></script>

   It reuses app.js's data (ARTICLES) and render helpers (cardHTML,
   highlight, norm) and TAKES OVER the search box, querying Meilisearch
   instead of the in-browser matcher. If Meilisearch is unreachable
   (offline, service down, or not yet configured), it automatically
   falls back to app.js's local searchArticles() so the box still works.

   CONFIGURE: either edit CONFIG below, or set window.MEILI_CONFIG in the
   page before this script loads, e.g.

       <script>
         window.MEILI_CONFIG = {
           host: "https://ms-xxxx.meilisearch.io",   // or http://localhost:7700
           searchKey: "YOUR_SEARCH_ONLY_KEY",         // NEVER the admin/master key
           index: "programs"
         };
       </script>

   SECURITY: the browser must use a SEARCH-ONLY (public) key. The admin
   key stays server-side (used only by meili-seed.mjs).
   ===================================================================== */
(function () {
  "use strict";

  // ---- CONFIG ---------------------------------------------------------
  const CONFIG = Object.assign({
    host: "",            // "" until you provision an instance -> stays on local search
    searchKey: "",       // SEARCH-ONLY key
    index: "programs",
    limit: 50,
  }, (typeof window !== "undefined" && window.MEILI_CONFIG) || {});

  const configured = !!(CONFIG.host && CONFIG.searchKey);

  // ---- Requires app.js (loaded first) --------------------------------
  if (typeof ARTICLES === "undefined" || typeof cardHTML !== "function" ||
      typeof searchArticles !== "function" || typeof norm !== "function") {
    console.error("[search-meili] app.js must load before search-meili.js — aborting.");
    return;
  }

  // ---- Meilisearch query ---------------------------------------------
  async function meiliSearch(query) {
    const res = await fetch(`${CONFIG.host}/indexes/${CONFIG.index}/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${CONFIG.searchKey}`,
      },
      body: JSON.stringify({ q: query, limit: CONFIG.limit }),
    });
    if (!res.ok) throw new Error("Meilisearch HTTP " + res.status);
    const data = await res.json();
    // hits are the stored documents = article-shaped objects (see seed script)
    return data.hits || [];
  }

  // Try Meilisearch; fall back to the local matcher on any failure.
  async function backend(query) {
    if (configured) {
      try {
        return { source: "meili", list: await meiliSearch(query) };
      } catch (e) {
        console.warn("[search-meili] Meilisearch failed, using local search:", e.message);
      }
    }
    return { source: "local", list: searchArticles(query, ARTICLES) };
  }

  // ---- Re-wire the UI (cleanly replacing app.js's handlers) ----------
  const el = id => document.getElementById(id);
  // clone+replace strips any listeners app.js already attached
  const fresh = id => {
    const n = el(id);
    if (!n) return null;
    const c = n.cloneNode(true);
    n.parentNode.replaceChild(c, n);
    return c;
  };

  const input    = fresh("article-search");
  const clearBtn = fresh("search-clear");
  const resultsEl = el("results");
  const emptyEl   = el("empty");
  const countEl   = el("search-count");
  if (!input || !resultsEl || !emptyEl || !countEl) {
    console.error("[search-meili] search DOM not found — aborting.");
    return;
  }

  let reqId = 0; // guards against out-of-order async responses
  async function run(query) {
    const mine = ++reqId;
    const terms = norm(query).trim().split(/\s+/).filter(Boolean);
    const { source, list } = await backend(query);
    if (mine !== reqId) return; // a newer keystroke superseded this one

    resultsEl.innerHTML = list.map(a => cardHTML(a, terms)).join("");
    emptyEl.hidden = list.length !== 0;
    clearBtn.hidden = query.length === 0;
    countEl.textContent = query.trim()
      ? `${list.length} ${list.length === 1 ? "program" : "programs"} found` +
        (configured && source === "local" ? " (offline — cached results)" : "")
      : "";
  }

  let timer;
  input.addEventListener("input", e => {
    clearTimeout(timer);
    timer = setTimeout(() => run(e.target.value), 150); // debounce
  });
  clearBtn.addEventListener("click", () => { input.value = ""; input.focus(); run(""); });

  run(input.value || ""); // initial render through the (possibly Meili) backend

  // expose for tests / debugging
  if (typeof window !== "undefined") window.__meiliBackend = backend;
})();
