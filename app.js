/* =====================================================================
   issNOW.earth — Programs data + client-side search
   ---------------------------------------------------------------------
   TO EDIT A CARD:  change its entry in the ARTICLES array below.
   TO ADD A CARD:   copy an entry, give it a new id, pick a theme.
   theme: "teal" | "lime" | "grad"      border: true/false (green edge)
   ===================================================================== */

/* Shared SVGs (white stroke, used inside the cards) */
const ICONS = {
  book:  `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h6a3 3 0 0 1 3 3v13a2.5 2.5 0 0 0-2.5-2H2z"/><path d="M22 4h-6a3 3 0 0 0-3 3v13a2.5 2.5 0 0 1 2.5-2H22z"/></svg>`,
  doc:   `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="3" width="10" height="18" rx="1"/><path d="M7 21h10"/><path d="M10 7h4M10 10h4M10 13h4"/></svg>`,
  globe: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z"/></svg>`,
  heart: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>`
};
const ARROW = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`;

/* ------------------------- ARTICLE DATA ------------------------- */
const ARTICLES = [
  {
    id: "youth-storytelling",
    title: "Global Youth Storytelling Archive",
    description: "Digital platform preserving stories from young people worldwide",
    tags: ["Multimedia story submissions", "Interactive global map", "SDG-aligned themes", "Youth voice amplification"],
    fracBig: "45K", fracSub: "of 1.0M stories", progress: 4.5,
    icon: "book", theme: "teal", border: true,
    url: "#"
  },
  {
    id: "ai-heritage",
    title: "AI-Powered Cultural Heritage Platform",
    description: "Using AI to document and share cultural heritage practices",
    tags: ["AI-assisted documentation", "Rich media galleries", "Cultural practice discovery", "Heritage preservation"],
    fracBig: "1K", fracSub: "of 10K practices", progress: 12.5,
    icon: "doc", theme: "lime", border: false,
    url: "#"
  },
  {
    id: "sibling-city",
    title: "International Sibling City Arts Exchange",
    description: "Pairing cities worldwide for cultural exchange through arts",
    tags: ["City pairing system", "Exchange program management", "Success story showcase", "Global arts network"],
    fracBig: "127", fracSub: "of 500 city pairs", progress: 25.4,
    icon: "globe", theme: "grad", border: true,
    url: "#"
  },
  {
    id: "peace-museums",
    title: "Virtual Peace Museums Network",
    description: "Virtual museums dedicated to peace-building and cultural understanding",
    tags: ["Virtual museum tours", "Peace-building exhibitions", "Educational resources", "Global accessibility"],
    fracBig: "2.4M", fracSub: "of 150M visitors/year", progress: 24.0,
    icon: "heart", theme: "teal", border: false,
    url: "#"
  }
];

/* ------------------------- SEARCH / RANKING ------------------------- */
/* Normalize: lowercase + strip accents so "cafe" matches "café". */
function norm(s) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/* Score each article across fields (title > tags > description),
   drop zero-score items, sort best-first. */
function searchArticles(query, articles) {
  const terms = norm(query).trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return articles.slice();

  return articles
    .map(a => {
      const title = norm(a.title);
      const tags  = norm(a.tags.join(" "));
      const desc  = norm(a.description);
      let score = 0;
      for (const t of terms) {
        if (title.includes(t)) score += 3;
        if (tags.includes(t))  score += 2;
        if (desc.includes(t))  score += 1;
      }
      return { a, score };
    })
    .filter(r => r.score > 0)
    .sort((x, y) => y.score - x.score)
    .map(r => r.a);
}

/* ------------------------- RENDERING ------------------------- */
function escapeHTML(s) {
  return s.replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));
}

/* Wrap the matched query terms in <mark> so users see why a card surfaced. */
function highlight(text, terms) {
  let out = escapeHTML(text);
  for (const t of terms) {
    if (!t) continue;
    const re = new RegExp("(" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi");
    out = out.replace(re, "<mark>$1</mark>");
  }
  return out;
}

function cardHTML(a, terms) {
  const features = a.tags.map(t => `<li>${highlight(t, terms)}</li>`).join("");
  return `
    <article class="card theme-${a.theme}${a.border ? " bordered" : ""}">
      <div class="card-top">
        <div class="icon-box">${ICONS[a.icon] || ""}</div>
        <div class="frac"><div class="big">${escapeHTML(a.fracBig)}</div><div class="sub">${escapeHTML(a.fracSub)}</div></div>
      </div>
      <h3>${highlight(a.title, terms)}</h3>
      <p class="desc">${highlight(a.description, terms)}</p>
      <div class="prog-row"><span>Progress to 2030</span><b>${a.progress}%</b></div>
      <div class="track"><div class="fill" style="width:${a.progress}%"></div></div>
      <ul class="feat">${features}</ul>
      <a class="btn-explore" href="${a.url}">Explore Program ${ARROW}</a>
    </article>`;
}

/* ------------------------- WIRE UP ------------------------- */
const input    = document.getElementById("article-search");
const clearBtn = document.getElementById("search-clear");
const resultsEl = document.getElementById("results");
const emptyEl   = document.getElementById("empty");
const countEl   = document.getElementById("search-count");

function run(query) {
  const terms = norm(query).trim().split(/\s+/).filter(Boolean);
  const list = searchArticles(query, ARTICLES);

  resultsEl.innerHTML = list.map(a => cardHTML(a, terms)).join("");
  emptyEl.hidden = list.length !== 0;
  clearBtn.hidden = query.length === 0;

  // Announce result count only while searching.
  countEl.textContent = query.trim()
    ? `${list.length} ${list.length === 1 ? "program" : "programs"} found`
    : "";
}

let timer;
input.addEventListener("input", e => {
  clearTimeout(timer);
  timer = setTimeout(() => run(e.target.value), 150); // debounce
});
clearBtn.addEventListener("click", () => {
  input.value = "";
  input.focus();
  run("");
});

run(""); // initial: show all programs
