/* =====================================================================
   meili-seed.mjs — create + configure the Meilisearch index and load
   the programs from app.js (single source of truth).

   Run (Node 18+):
     MEILI_HOST=http://localhost:7700 \
     MEILI_ADMIN_KEY=YOUR_ADMIN_OR_MASTER_KEY \
     node meili-seed.mjs

   Uses the ADMIN/master key — run it server-side / from your machine,
   NEVER ship this key to the browser. The browser uses a search-only key.
   ===================================================================== */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const HOST  = process.env.MEILI_HOST      || "http://localhost:7700";
const ADMIN = process.env.MEILI_ADMIN_KEY || "";
const INDEX = process.env.MEILI_INDEX     || "programs";

if (!ADMIN) {
  console.error("Set MEILI_ADMIN_KEY (admin/master key). Aborting.");
  process.exit(1);
}

/* Load ARTICLES out of app.js without a browser (stub the DOM). */
function loadArticles() {
  const code = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  const stubEl = () => ({ value:"", textContent:"", innerHTML:"", hidden:false,
                          addEventListener(){}, focus(){} });
  const sandbox = {
    document: { getElementById: () => stubEl() },
    setTimeout: () => 0, clearTimeout: () => {}, console,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code + "\n;globalThis.__ARTICLES = ARTICLES;", sandbox);
  return sandbox.__ARTICLES;
}

async function api(method, endpoint, body) {
  const res = await fetch(`${HOST}${endpoint}`, {
    method,
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ADMIN}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${endpoint} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

async function main() {
  const articles = loadArticles();
  console.log(`Loaded ${articles.length} programs from app.js`);

  // 1) Create the index (id = primary key). Ignore "already exists".
  try {
    await api("POST", "/indexes", { uid: INDEX, primaryKey: "id" });
    console.log(`Created index "${INDEX}"`);
  } catch (e) {
    if (/already exists|index_already_exists/i.test(e.message)) {
      console.log(`Index "${INDEX}" already exists — continuing`);
    } else throw e;
  }

  // 2) Settings: search priority title > tags > description (mirrors the
  //    local 3/2/1 weighting), typo tolerance on, theme filterable for facets.
  await api("PATCH", `/indexes/${INDEX}/settings`, {
    searchableAttributes: ["title", "tags", "description"],
    filterableAttributes: ["theme"],
    typoTolerance: { enabled: true },
  });
  console.log("Applied index settings (searchable attributes, typo tolerance)");

  // 3) Upsert the documents.
  await api("POST", `/indexes/${INDEX}/documents`, articles);
  console.log("Submitted documents.");

  console.log("\nDone. Meilisearch indexes asynchronously — check the tasks");
  console.log("queue or dashboard, then test a search against the index.");
}

main().catch(e => { console.error(e); process.exit(1); });
