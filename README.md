# issNOW.earth — Search Feature

A client-side search feature for the **Innovation Beyond SDGs** page of the issNOW.earth platform. It lets a visitor type a keyword and instantly find the right flagship program instead of scrolling through every card.

This README walks through how the feature was designed, from problem to shipped code, and ends with an overview of how it works.

---

## Step 1 — Define the problem

When a page holds many articles (programs, stories, heritage practices, museum exhibits), finding the *one* you want by scrolling is slow and frustrating. The more content the platform adds, the worse this gets. A search feature solves it: the reader types what they're looking for and the matching item surfaces immediately.

**Definition of success:** the search feature helps a user find the right article faster than scrolling — a relevant query returns the correct program at the top of the results, and an irrelevant query clearly shows nothing matched.

---

## Step 2 — Research and scope

I researched how existing websites implement search and studied the patterns they share:

- **Live filtering** — results narrow as you type, rather than after pressing a button.
- **Relevance ranking** — the best match appears first, not just any match.
- **Match highlighting** — the reader sees *why* a result surfaced.
- **Forgiving input** — case and accents don't break a search.
- **Clear feedback** — a result count, an empty state, and an easy way to clear the query.

From this research I scoped a feature that fits this page: a **client-side** search (no backend needed for a small, fixed set of programs) that ranks results by relevance, highlights matches, and handles the edge cases gracefully. I then built my own implementation from those findings rather than pulling in a heavy library, keeping a clear upgrade path to a fuzzy-search library (Fuse.js) or a server-side index if the content grows.

---

## Step 3 — User flow and logic
User Story--> As a User I want  to logon the site, and search for my Program. Success Criteria--> Retrieving the relevant Program from the search.

I mapped the logic step by step and accounted for the edge cases before writing code.
**Happy path**
1. User focuses the search box and types a query.
2. Input is debounced (~150 ms) so the list isn't re-rendered on every keystroke.
3. The query is normalized (lowercased, accents stripped) and split into terms.
4. Each program is scored across its fields — **title = 3, features/tags = 2, description = 1** — summed per term.
5. Programs scoring zero are dropped; the rest are sorted highest-score-first.
6. Matching cards render, with the matched text wrapped in a highlight, and a result count is announced.

**Edge cases handled**

| Edge case | Behavior |
|---|---|
| Empty / whitespace-only query | Show all programs in their original order |
| No match found | Show an empty-state message ("No programs match your search") |
| Mixed case (e.g. `HERITAGE`) | Matches regardless of case |
| Accented input (e.g. `herïtage`) | Accents normalized so it still matches |
| "Incorrect data" (special characters `(`, `c++`, `<img …>`) | Never crashes; regex metacharacters are escaped |
| Malicious query (HTML/script injection) | Input is escaped; nothing executable reaches the page |
| Offline / no server | Search runs entirely in the browser, so it works with no network once the page has loaded |
| Typo (e.g. `hertage`) | Current substring engine returns nothing — a documented limitation, with fuzzy search as the planned upgrade |

---

## Step 4 — Wireframing

I sketched the placement before styling: a single rounded search bar centered above the program grid, with a magnifier icon on the left and a clear (×) button on the right that appears only when there is text. Directly beneath the bar sits a small result-count line, and below that the existing two-column card grid, which now acts as the results area. The empty-state message occupies the grid's place when nothing matches.

```
[  🔍  Search programs by name, focus, or feature…      ✕  ]
                 3 programs found
   ┌───────────────┐   ┌───────────────┐
   │  program card │   │  program card │
   └───────────────┘   └───────────────┘
```

---

## Step 5 — UI design

First I designed a faithful **replica of the issNOW.earth page** — the teal/lime palette, the SDG-wheel logo, the four themed program cards (each with its icon box, progress bar, feature list, and Explore button), the impact stats, and the join section — matched to the real site down to the section background shades and border colors.

Then I designed the **search feature to live inside that replica**, styling the search bar to match the platform's design language: a translucent white field on the teal background, a lime focus ring, lime-tinted match highlighting, and a muted result count — so the feature looks native to the page rather than bolted on.

---

## Step 6 — Interactive prototype

The feature was built as a working, interactive prototype, not a static mockup:

- The four program cards are no longer hardcoded — they live as **data** (an `ARTICLES` array in `app.js`) and are rendered by JavaScript. This is what makes them searchable and rankable.
- Typing filters the grid live; the clear button resets it; the result count and empty state update in real time.
- Each program's visual theme (`teal` / `lime` / `grad`, plus an optional gradient border) is a property in its data entry, so editing or adding a program is a data change, not a markup change.

Files: `index.html` (structure), `styles.css` (design), `app.js` (data + search), and `innovation-beyond-sdgs.html` (a self-contained single-file build of all three).

---

## Step 7 — Tests

The search and rendering logic is covered by an automated suite (`app.test.js`, run with `npm test`) and a browser runner (`tests.html`). **37 tests, all passing.**

### Search — matching & ranking

| Test | What it checks | Result |
|---|---|---|
| Exact single match | `heritage` returns only the Heritage program | ✅ Pass |
| Multi-word: "city arts" | Returns only the Sibling City program | ✅ Pass |
| Multi-word: "youth stories" | Returns only the Youth Storytelling program | ✅ Pass |
| Single-word: "peace" | Returns only the Peace Museums program | ✅ Pass |
| Ranking: title weight wins | `global` ranks the title-match program first | ✅ Pass |
| Stable tie-break order | Equal scores keep original array order | ✅ Pass |
| Empty query returns all | Blank search shows all four, in order | ✅ Pass |
| Whitespace-only returns all | Spaces are treated as empty | ✅ Pass |
| No match returns empty | Unknown term returns an empty list | ✅ Pass |
| Case-insensitive | `HERITAGE` matches `Heritage` | ✅ Pass |
| Accent-insensitive | `herïtage` matches `Heritage` | ✅ Pass |
| Typo not matched (fuzzy TODO) | `hertage` returns nothing (documented limit) | ✅ Pass |
| Regex metachars don't throw: `(` | Special characters don't crash search | ✅ Pass |
| Regex metachars don't throw: `c++` | Special characters don't crash search | ✅ Pass |
| Does not mutate data order | Searching never reorders the source array | ✅ Pass |

### Normalization & output safety

| Test | What it checks | Result |
|---|---|---|
| `norm` lowercases | Uppercase input is lowercased | ✅ Pass |
| `norm` strips accents | `Café` → `cafe` | ✅ Pass |
| Escape `< > &` | Angle brackets/ampersands become safe entities | ✅ Pass |
| Escape leaves plain text | Ordinary text is untouched | ✅ Pass |

### Highlighting

| Test | What it checks | Result |
|---|---|---|
| Wraps the term | Matched text is wrapped in `<mark>` | ✅ Pass |
| Case-insensitive highlight | `HERITAGE` highlights for query `heritage` | ✅ Pass |
| Escapes source first | HTML in content is escaped before marking | ✅ Pass |
| Metachar term doesn't throw | `+` as a term doesn't crash highlighting | ✅ Pass |
| No term → no `<mark>` | Empty query adds no highlight markup | ✅ Pass |

### Security — injection through the query

| Test | What it checks | Result |
|---|---|---|
| Malicious query yields no cards | `<img … onerror=…>` matches nothing | ✅ Pass |
| No raw `<img>` in output | Injected tags never reach the DOM | ✅ Pass |
| No raw `onerror=` in output | Injected handlers never reach the DOM | ✅ Pass |

### Data integrity & rendering

| Test | What it checks | Result |
|---|---|---|
| Four articles present | Data set has the expected count | ✅ Pass |
| Unique ids | No duplicate program ids | ✅ Pass |
| Every icon key exists | No program references a missing icon | ✅ Pass |
| Every theme is valid | Themes are `teal` / `lime` / `grad` only | ✅ Pass |
| Progress is 0–100 | Progress values are valid percentages | ✅ Pass |
| cardHTML applies theme class | Rendered card carries its theme | ✅ Pass |
| cardHTML adds `.bordered` | Border flag drives the gradient border | ✅ Pass |
| cardHTML sets progress width | Progress bar width matches the data | ✅ Pass |
| cardHTML includes the title | Title text is rendered | ✅ Pass |
| card-2 not bordered | Right-column card has no border | ✅ Pass |

**Running the tests**

```bash
npm test          # Node runner (app.test.js) — exits non-zero on any failure
```

Or open `tests.html` in a browser for a visual pass/fail report. A GitHub Actions workflow (`.github/workflows/tests.yml`) runs `npm test` on every push and pull request.

---

## Feature overview — how it works

The page renders its four flagship programs from a data array (`ARTICLES` in `app.js`) rather than from fixed HTML. Because the content lives as data, it can be searched and ranked.

When the user types in the search box:

1. **Debounce** — input waits ~150 ms so rapid typing triggers a single update.
2. **Normalize** — the query is lowercased and stripped of accents, then split into terms.
3. **Score** — every program is scored against each term across three fields, weighted **title (3) > features (2) > description (1)**.
4. **Rank** — zero-score programs are removed and the rest are sorted best-first, so the most relevant program leads.
5. **Render** — matching cards are rebuilt into the grid with the matched words highlighted; a live result count is announced (with `aria-live` for screen readers) and a clear button appears.
6. **Empty & reset** — no matches shows an empty-state message; clearing the box (or emptying it) restores the full list.

Everything runs in the browser, so the search works offline once the page has loaded, and user input is escaped so it can never inject markup. The design keeps a clear upgrade path: swap the substring matcher for **Fuse.js** to tolerate typos, or move ranking to a server-side index (Postgres full-text, Meilisearch, Typesense) when the catalogue grows to thousands of items — the UI layer stays the same.

### Project files

| File | Purpose |
|---|---|
| `index.html` | Page structure and search markup |
| `styles.css` | Design system (palette, sections, card themes, search bar) |
| `app.js` | Program data + search, ranking, highlighting, rendering |
| `innovation-beyond-sdgs.html` | Self-contained single-file build (CSS + JS inlined) |
| `app.test.js` | Node test suite (`npm test`) |
| `tests.html` | Browser test runner |
| `package.json` | `npm test` script |
| `.github/workflows/tests.yml` | CI: runs the suite on push and PR |
