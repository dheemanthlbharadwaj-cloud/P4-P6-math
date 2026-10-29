/* ---------- Firebase init (modular SDK, named database "default") ---------- */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getFirestore, collection, doc, setDoc, getDoc, getDocs, deleteDoc, onSnapshot, serverTimestamp, query, where,
  updateDoc as __updateDoc,
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, getDocsFromCache, Timestamp,
  terminate, clearIndexedDbPersistence,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  createUserWithEmailAndPassword, updatePassword, deleteUser,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { markerKey, parseMarker, serializeMarker, isStale, markerFromDocs, advance, floors, skipChange } from "./syncdelta.v1.js";

const firebaseConfig = {
  projectId: "primary-math-sg",
  appId: "1:762269301954:web:8f782dd637b3e2ee990f5b",
  storageBucket: "primary-math-sg.firebasestorage.app",
  apiKey: "AIzaSyCg3Ik5TrWz7nJjGVgDr7QEYVkH1VjHUbg",
  authDomain: "primary-math-sg.firebaseapp.com",
  messagingSenderId: "762269301954",
};
const fbApp = initializeApp(firebaseConfig);
// persistent IndexedDB cache (shared by tabs) so a reload only has to fetch what changed (delta loading, see startListening)
let db, persistOK = false;
try {
  db = initializeFirestore(fbApp, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }, "default");
  persistOK = typeof indexedDB !== "undefined";
} catch (e) { console.warn("persistent cache unavailable, full loads only", e); db = getFirestore(fbApp, "default"); }
const auth = getAuth(fbApp);
// secondary app: lets the master create / rotate volunteer logins without signing themselves out
const adminApp = initializeApp(firebaseConfig, "account-admin");
const adminAuth = getAuth(adminApp);
window.__db = db;

const USER_DOMAIN = "users.primary-math-sg.web.app";
const LEVELS = ["LV1", "LV2", "LV3"];
const userEmail = u => `${u.toLowerCase()}@${USER_DOMAIN}`;
const accessKey = q => `${q.chapter || ""}|${q.difficulty || ""}`;
let STRUCT = { chapters: [], removed_reasons: [] };   // meta/structure: chapters -> subtopics
const chapterNames = () => STRUCT.chapters.map(c => c.name);
const subtopicsOf = ch => (STRUCT.chapters.find(c => c.name === ch) || { subtopics: ch === "Removed" ? STRUCT.removed_reasons : [] }).subtopics;

/* ---------- identity (per-person accounts: master + volunteers) ---------- */
let myName = "";          // username shown in last_edited_by / verified_by
let myRole = null;        // "master" | "volunteer"
let myKeys = [];          // volunteer scope: ["Topic|LV2", ...]
let myScope = { topics: [], levels: [] };

const CLOUDINARY_CLOUD = "n9gn4u6k";
const CLOUDINARY_PRESET = "p6maths_editor";

/* ---------- state ---------- */
let allQuestions = [];
let qById = new Map();
let currentId = null;
let currentDraft = null;
let dirty = false;
let unsubs = [];
let cropper = null;
let cropTargetCallback = null;

/* ---------- login ---------- */
document.getElementById("loginBtn").onclick = doLogin;
document.getElementById("loginPass").addEventListener("keydown", e => { if (e.key === "Enter") doLogin(); });
document.getElementById("loginName").addEventListener("keydown", e => { if (e.key === "Enter") doLogin(); });
localStorage.removeItem("p6_name"); localStorage.removeItem("p6_gate"); // old passphrase login, retired

async function doLogin() {
  const user = document.getElementById("loginName").value.trim().toLowerCase();
  const pass = document.getElementById("loginPass").value;
  const errEl = document.getElementById("loginerr");
  errEl.textContent = "";
  if (!user || !pass) { errEl.textContent = "Enter your username and password."; return; }
  try {
    await signInWithEmailAndPassword(auth, userEmail(user), pass);
  } catch (e) {
    errEl.textContent = "Wrong username or password, or access has been revoked.";
  }
}

document.getElementById("signoutBtn").onclick = async () => { await signOut(auth); location.reload(); };
// Full refresh: forget the sync markers + the local copy, then reload (everything is read again; covers deletions / missed edits)
document.getElementById("fullRefreshBtn").onclick = async () => {
  const uid = auth.currentUser && auth.currentUser.uid;
  try {
    const kill = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith("qsync:" + (uid || ""))) kill.push(k); }
    kill.forEach(k => localStorage.removeItem(k));
  } catch (_) {}
  try { await terminate(db); await clearIndexedDbPersistence(db); } catch (_) { /* another tab open: markers are gone anyway, so the reload does a full load */ }
  location.reload();
};

onAuthStateChanged(auth, async user => {
  if (!user) { document.getElementById("loginwrap").style.display = "flex"; return; }
  const errEl = document.getElementById("loginerr");
  try {
    const adm = await getDoc(doc(db, "admins", user.uid)).catch(() => null);
    if (adm && adm.exists()) {
      myRole = "master"; myName = adm.data().username || "master";
    } else {
      const v = await getDoc(doc(db, "volunteers", user.uid));
      if (!v.exists() || v.data().active !== true) throw new Error("revoked");
      const vd = v.data();
      myRole = "volunteer"; myName = vd.username; myKeys = vd.keys || [];
      myScope = { topics: vd.topics || [], levels: vd.levels || [] };
    }
  } catch (e) {
    await signOut(auth);
    document.getElementById("loginwrap").style.display = "flex";
    errEl.textContent = "This account has no access. Ask the admin.";
    return;
  }
  enterApp();
});

function enterApp() {
  document.getElementById("loginwrap").style.display = "none";
  document.getElementById("app").classList.add("on");
  const isM = myRole === "master";
  document.getElementById("presence").textContent = isM
    ? `Signed in as ${myName} (master)`
    : `Signed in as ${myName} · ${myScope.topics.join(", ")} · ${myScope.levels.join(", ")}`;
  document.getElementById("accessBtn").style.display = isM ? "" : "none";
  document.getElementById("exportJsonBtn").style.display = isM ? "" : "none";
  document.getElementById("exportZipBtn").style.display = isM ? "" : "none";
  if (!isM) {
    // volunteers can only filter within their own scope
    const df = document.getElementById("diffFilter");
    Array.from(df.options).forEach(o => { if (o.value && !myScope.levels.includes(o.value)) o.remove(); });
  }
  startListening();
}

/* ---------- realtime data ---------- */
function applyChange(change) {
  const d = { id: change.doc.id, ...change.doc.data() };
  if (change.type === "removed") { qById.delete(d.id); return; }
  const prev = qById.get(d.id);
  qById.set(d.id, d);
  if (change.type === "modified" && prev && prev._loadedOnce) {
    const editedByOther = d.last_edited_by && d.last_edited_by !== myName;
    if (editedByOther) showToast(`${d.last_edited_by || "Someone"} updated ${d.id}`);
    if (currentId === d.id && !dirty && editedByOther) openQuestion(d.id);
  }
  d._loadedOnce = true;
}

function startListening() {
  getDoc(doc(db, "meta", "topics")).then(snap => { window.__oldTopics = (snap.data() && snap.data().topics) || []; });
  getDoc(doc(db, "meta", "structure")).then(snap => {
    STRUCT = snap.data() || STRUCT;
    let chs = chapterNames();
    if (myRole === "volunteer") chs = chs.filter(c => myScope.topics.includes(c));
    const sel = document.getElementById("topicFilter");
    chs.forEach(c => { const o = document.createElement("option"); o.value = c; o.textContent = `${STRUCT.chapters.find(x => x.name === c).no}. ${c}`; sel.appendChild(o); });
    if (myRole === "master") { const o = document.createElement("option"); o.value = "Removed"; o.textContent = "Removed (cancelled themes)"; sel.appendChild(o); }
    window.__allTopics = chapterNames();
    fillSubtopicFilter();
    renderList();
  });

  const onErr = err => showToast("Sync error: " + err.message);
  const handle = snap => {
    snap.docChanges().forEach(applyChange);
    // a question that moves out of this listener's scope arrives as "removed" and is dropped above
    allQuestions = Array.from(qById.values());
    renderList();
  };
  // Delta loading. Per scope (master: "all"; volunteer: each access_key) a marker in localStorage holds the newest
  // last_edited_at seen (one per stored type: Timestamp from editor saves, ISO string from scripts).
  //  - marker present and < 7 days old and the local cache has docs: render the cache, then listen ONLY to docs edited after the marker
  //  - otherwise: full load (as before), then set the marker and switch to the delta listeners
  const uid = auth.currentUser.uid;
  const qcol = collection(db, "questions");
  const scopes = myRole === "master"
    ? [{ id: "all", build: (...c) => query(qcol, ...c), owns: () => true }]
    // one listener per topic|level pair: security rules only allow reading questions in scope
    : myKeys.map(k => ({ id: k, build: (...c) => query(qcol, where("access_key", "==", k), ...c), owns: d => d.access_key === k }));
  scopes.forEach(sc => loadScope(sc, uid, handle, onErr));
}

function saveMarker(uid, sc, marker) { try { localStorage.setItem(markerKey(uid, sc.id), serializeMarker(marker)); } catch (_) {} }

function attachDelta(uid, sc, marker, handle, onErr) {
  const f = floors(marker);
  const mk = () => snap => {
    let moved = false;
    snap.docChanges().forEach(ch => {
      if (skipChange(ch.type, true)) return;
      applyChange(ch);
      if (!ch.doc.metadata.hasPendingWrites && advance(marker, ch.doc.data().last_edited_at)) moved = true;
    });
    if (moved) saveMarker(uid, sc, marker);
    allQuestions = Array.from(qById.values());
    renderList();
  };
  unsubs.push(onSnapshot(sc.build(where("last_edited_at", ">", Timestamp.fromMillis(f.tsMs))), mk(), onErr));
  unsubs.push(onSnapshot(sc.build(where("last_edited_at", ">", f.strIso)), mk(), onErr));
}

async function loadScope(sc, uid, handle, onErr) {
  let marker = null;
  if (persistOK) { try { marker = parseMarker(localStorage.getItem(markerKey(uid, sc.id))); } catch (_) {} }
  if (marker && !isStale(marker, Date.now())) {
    try {
      const snap = await getDocsFromCache(sc.build());
      if (!snap.empty) {
        snap.docs.forEach(d => qById.set(d.id, { id: d.id, ...d.data(), _loadedOnce: true }));
        allQuestions = Array.from(qById.values());
        renderList();
        attachDelta(uid, sc, marker, handle, onErr);
        return;
      }
    } catch (_) { /* cache unreadable: fall through to a full load */ }
  }
  // full load: first server-confirmed snapshot replaces this scope's questions, then hand over to the delta listeners
  const loadStart = Date.now();
  let un = null, done = false;
  un = onSnapshot(sc.build(), { includeMetadataChanges: true }, snap => {
    if (done || snap.metadata.fromCache) return;
    done = true;
    if (un) un(); else queueMicrotask(() => un && un());
    Array.from(qById.keys()).forEach(id => { if (sc.owns(qById.get(id))) qById.delete(id); });
    snap.docs.forEach(d => qById.set(d.id, { id: d.id, ...d.data(), _loadedOnce: true }));
    allQuestions = Array.from(qById.values());
    renderList();
    const m = markerFromDocs(snap.docs.map(d => d.data()), loadStart);
    if (persistOK) saveMarker(uid, sc, m);
    attachDelta(uid, sc, m, handle, onErr);
  }, onErr);
}

/* ---------- filters + list ---------- */
function fillSubtopicFilter() {
  const ch = document.getElementById("topicFilter").value;
  const sf = document.getElementById("subtopicFilter");
  sf.innerHTML = '<option value="">All subtopics</option>' + (ch ? subtopicsOf(ch).map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("") : "");
}
document.getElementById("topicFilter").addEventListener("input", fillSubtopicFilter);
["searchBox", "topicFilter", "subtopicFilter", "selFilter", "yearFilter", "diffFilter", "figFilter", "verifyFilter", "paperFilter"].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener("input", renderList);
});

function renderList() {
  const search = document.getElementById("searchBox").value.trim().toLowerCase();
  const topic = document.getElementById("topicFilter").value;
  const year = document.getElementById("yearFilter").value;
  const diff = document.getElementById("diffFilter").value;
  const fig = document.getElementById("figFilter").value;
  const verify = document.getElementById("verifyFilter") ? document.getElementById("verifyFilter").value : "";
  const paper = document.getElementById("paperFilter") ? document.getElementById("paperFilter").value : "";

  let list = allQuestions.slice().sort((a, b) => a.id.localeCompare(b.id));
  const subtopic = document.getElementById("subtopicFilter").value;
  const selF = document.getElementById("selFilter").value;
  if (topic) list = list.filter(q => q.chapter === topic);
  else list = list.filter(q => !q.excluded);            // removed questions only show when "Removed" is chosen
  if (subtopic) list = list.filter(q => q.subtopic === subtopic);
  if (selF === "selected") list = list.filter(q => q.selected);
  if (selF === "unselected") list = list.filter(q => !q.selected);
  if (year) list = list.filter(q => String(q.year) === year);
  if (diff) list = list.filter(q => q.difficulty === diff);
  if (paper) list = list.filter(q => q.paper === paper);
  if (fig === "missing") list = list.filter(q => (q.figure && q.figure.filename) && !q.figure_url);
  if (fig === "has") list = list.filter(q => q.figure_url);
  if (verify === "verified") list = list.filter(q => q.verified);
  if (verify === "unverified") list = list.filter(q => !q.verified);
  if (verify === "errors") list = list.filter(q => q.has_error || (q.error_log || "").trim());
  if (verify === "reports") list = list.filter(q => __reportsByQ.has(q.id));
  if (search) {
    list = list.filter(q => {
      const hay = [q.id, q.question, q.source, q.chapter, q.subtopic, q.topic_primary, JSON.stringify(q.question_parts || [])].join(" ").toLowerCase();
      return hay.includes(search);
    });
  }

  document.getElementById("countLbl").textContent = `${list.length} of ${allQuestions.filter(q => !q.excluded).length} questions · ${list.filter(q => q.selected).length} selected`;

  // group topic-wise by default (unless a search is active, where flat relevance order reads better)
  const box = document.getElementById("qlist");
  box.innerHTML = "";

  function renderItem(q, container) {
    const div = document.createElement("div");
    div.className = "qitem" + (q.id === currentId ? " active" : "");
    const diffCls = (q.difficulty || "").toLowerCase();
    div.innerHTML = `<div class="qid">${q.id} <span class="badge ${diffCls}">${q.difficulty || "?"}</span>${q.verified ? '<span class="badge verified">✓ verified</span>' : ""}${q.has_error || (q.error_log || "").trim() ? '<span class="badge err">⚠ error</span>' : ""}${q.selected ? '<span class="badge sel">★ selected</span>' : ""}${__reportBadge(q)}</div>
      <div class="qmeta">${escapeHtml(q.subtopic || "")} · ${q.year || ""} · ${q.paper || ""} (${q.calculator_allowed ? "Calc" : "No Calc"}) · ${q.source || ""}</div>
      <div class="qsnip">${escapeHtml((q.question || (q.question_parts||[]).map(p=>p.text).join(" ") || "").slice(0,80))}</div>`;
    div.onclick = () => openQuestion(q.id);
    container.appendChild(div);
  }

  if (search) {
    list.forEach(q => renderItem(q, box));
    return;
  }

  const lvN = q => parseInt((q.difficulty || "LV9").slice(2)) || 9;
  const chOrder = [...chapterNames(), "Removed"];
  const byCh = new Map();
  list.forEach(q => {
    const c = q.chapter || "Unassigned";
    if (!byCh.has(c)) byCh.set(c, new Map());
    const m = byCh.get(c), st = q.subtopic || "Unassigned";
    if (!m.has(st)) m.set(st, []);
    m.get(st).push(q);
  });
  const ordIdx = (arr, x) => { const i = arr.indexOf(x); return i === -1 ? 999 : i; };
  Array.from(byCh.keys()).sort((a, b) => ordIdx(chOrder, a) - ordIdx(chOrder, b)).forEach(c => {
    const m = byCh.get(c), subs = subtopicsOf(c);
    const total = Array.from(m.values()).reduce((n, a) => n + a.length, 0);
    const ch = STRUCT.chapters.find(x => x.name === c);
    const header = document.createElement("div");
    header.className = "topic-header";
    header.innerHTML = `${ch ? ch.no + ". " : ""}${escapeHtml(c)} <span class="topic-count">${total}</span>`;
    box.appendChild(header);
    Array.from(m.keys()).sort((a, b) => ordIdx(subs, a) - ordIdx(subs, b)).forEach(st => {
      const qs = m.get(st).sort((a, b) =>
        (b.selected ? 1 : 0) - (a.selected ? 1 : 0) || lvN(a) - lvN(b) || (a.selected_rank || 99) - (b.selected_rank || 99) || a.id.localeCompare(b.id));
      const sh = document.createElement("div");
      sh.className = "sub-header";
      sh.innerHTML = `${escapeHtml(st)} <span class="topic-count">${qs.filter(q => q.selected).length}★ / ${qs.length}</span>`;
      box.appendChild(sh);
      qs.forEach(q => renderItem(q, box));
    });
  });
}

/* ---------- toast ---------- */
let toastTimer = null;
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.style.display = "none", 4000);
}

/* ---------- latex helpers ---------- */
function autoLatex(text) {
  if (!text) return text;
  const parts = text.split(/(\$[^$]*\$)/g);
  return parts.map(seg => {
    if (seg.startsWith("$") && seg.endsWith("$")) return seg;
    let s = seg;
    s = s.replace(/\bsqrt\(([^()]+)\)/g, (m, inner) => `$\\sqrt{${inner}}$`);
    s = s.replace(/\b(\d+)\s*\/\s*(\d+)\b/g, (m, a, b) => `$\\frac{${a}}{${b}}$`);
    s = s.replace(/\b([a-zA-Z])\^(\d+)\b/g, (m, v, n) => `$${v}^{${n}}$`);
    s = s.replace(/\b([a-zA-Z])\s*=\s*(-?\d+(?:\.\d+)?)\b/g, (m, v, n) => `$${v}=${n}$`);
    s = s.replace(/(\d+(?:\.\d+)?)\s*×\s*(\d+(?:\.\d+)?)/g, (m, a, b) => `$${a}\\times ${b}$`);
    s = s.replace(/(\d+(?:\.\d+)?)\s*÷\s*(\d+(?:\.\d+)?)/g, (m, a, b) => `$${a}\\div ${b}$`);
    return s;
  }).join("");
}

function renderLatexPreview(el, text) {
  if (!text) { el.innerHTML = "<span style='color:var(--muted)'>(empty)</span>"; return; }
  const parts = text.split(/(\$[^$]*\$)/g);
  el.innerHTML = "";
  parts.forEach(seg => {
    if (seg.startsWith("$") && seg.endsWith("$") && seg.length > 1) {
      const span = document.createElement("span");
      try {
        katex.render(seg.slice(1, -1), span, { throwOnError: false });
      } catch (e) { span.textContent = seg; }
      el.appendChild(span);
    } else if (seg) {
      el.appendChild(document.createTextNode(seg));
    }
  });
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------- editor ---------- */
function openQuestion(id) {
  currentId = id;
  currentDraft = JSON.parse(JSON.stringify(qById.get(id)));
  dirty = false;
  document.getElementById("empty").style.display = "none";
  const ed = document.getElementById("editor");
  ed.style.display = "block";
  renderEditor();
  renderList();
}

function markDirty() {
  dirty = true;
  const s = document.getElementById("saveStatus");
  if (s) { s.textContent = "Unsaved changes"; s.className = "status-dirty"; }
}

function renderEditor() {
  const q = currentDraft;
  const ed = document.getElementById("editor");

  ed.innerHTML = `
    <div class="card">
      <h3>Question ${q.id}</h3>
      <div class="row">
        <div>
          <label>Difficulty</label>
          <select id="f_diff">
            ${["LV1","LV2","LV3"].filter(d => myRole === "master" || myScope.levels.includes(d) || q.difficulty === d).map(d => `<option value="${d}" ${q.difficulty===d?"selected":""}>${d}</option>`).join("")}
          </select>
        </div>
        <div>
          <label>Type</label>
          <select id="f_type">
            ${["short","long","mcq"].map(d => `<option value="${d}" ${q.question_type===d?"selected":""}>${d}</option>`).join("")}
          </select>
        </div>
        <div>
          <label>Year</label>
          <input type="number" id="f_year" value="${q.year||""}">
        </div>
      </div>
      <div class="row">
        <div>
          <label>Topic (chapter)</label>
          <select id="f_chapter" ${myRole !== "master" ? "disabled" : ""}>
            ${[...chapterNames(), "Removed"].map(c => `<option value="${escapeHtml(c)}" ${q.chapter===c?"selected":""}>${escapeHtml(c)}</option>`).join("")}
          </select>
        </div>
        <div>
          <label>Subtopic</label>
          <select id="f_subtopic">${subtopicsOf(q.chapter).map(st => `<option value="${escapeHtml(st)}" ${q.subtopic===st?"selected":""}>${escapeHtml(st)}</option>`).join("")}</select>
        </div>
      </div>
      <div class="verify-toggle sel-toggle ${q.selected ? "on" : ""}" id="selToggle" ${myRole !== "master" ? 'style="pointer-events:none;opacity:.7"' : ""}>
        <input type="checkbox" id="f_selected" ${q.selected ? "checked" : ""} ${myRole !== "master" ? "disabled" : ""}>
        <span class="vlabel">${q.selected ? "★ Selected (in the 5-5-5 set)" : "Not selected"}</span>
        <span class="vmeta">${myRole === "master" ? "click to toggle" : "set by admin"}</span>
      </div>
      <label>Old topic tags</label>
      <div class="chiprow" id="topicChips">
        ${(window.__oldTopics || []).map(t => `<span class="chip ${((q.topics||[]).includes(t))?"on":""}" data-t="${escapeHtml(t)}">${escapeHtml(t)}</span>`).join("")}
      </div>

      <label style="margin-top:16px">Source <span class="srclink" id="viewSourceBtn">↗ View source page</span></label>
      <div class="sourcemeta">${escapeHtml(q.source||"")} — ${escapeHtml(q.paper||"")} (${q.calculator_allowed ? "Calculator Allowed" : "No Calculator"}) — ${escapeHtml(q.source_pdf||"")} (PDF page ${q.source_pdf_page||"?"})</div>

      <div class="verify-toggle ${q.verified ? "on" : ""}" id="verifyToggle">
        <input type="checkbox" id="f_verified" ${q.verified ? "checked" : ""}>
        <span class="vlabel">${q.verified ? "✓ Verified" : "Mark as verified"}</span>
        <span class="vmeta" id="verifyMeta">${q.verified && q.verified_by ? `by ${escapeHtml(q.verified_by)}` : ""}</span>
      </div>

      <div class="verify-toggle err-toggle ${q.has_error ? "on" : ""}" id="errorToggle">
        <input type="checkbox" id="f_hasError" ${q.has_error ? "checked" : ""}>
        <span class="vlabel">${q.has_error ? "⚠ Error flagged" : "Flag as error"}</span>
        <span class="vmeta" id="errorMeta">${q.has_error && q.error_flagged_by ? `by ${escapeHtml(q.error_flagged_by)}` : ""}</span>
      </div>
      <label style="margin-top:10px" for="f_errorLog">Error log</label>
      <textarea id="f_errorLog" placeholder="Describe the error: what is wrong, where it occurs, how to fix it…">${escapeHtml(q.error_log || "")}</textarea>
      <div id="reportsBox"></div>
    </div>

    <div class="card">
      <h3>Figure</h3>
      <div id="figArea"></div>
    </div>

    <div class="card">
      <h3>Question text</h3>
      <label>Main question${q.question_type==="mcq" ? " (stem)" : ""}</label>
      <textarea id="f_question">${escapeHtml(q.question||"")}</textarea>
      <div class="preview" id="prev_question"></div>
      ${q.question_type!=="mcq" ? `<div id="qpartsArea"></div>
      <button class="btn small" id="addPartBtn" style="margin-top:8px">+ Add part</button>` : ""}
    </div>

    ${q.question_type==="mcq" ? `
    <div class="card">
      <h3>Options</h3>
      <div id="optionsArea"></div>
    </div>
    ` : `
    <div class="card">
      <h3>Answer</h3>
      <div class="row">
        <div><label>Answer (number)</label><input type="text" id="f_answer" value="${q.answer!=null?q.answer:""}"></div>
        <div><label>Answer (symbolic / latex)</label><input type="text" id="f_answer_symbol" value="${escapeHtml(q.answer_symbol||"")}"></div>
        <div><label>Unit</label><input type="text" id="f_unit" value="${escapeHtml(q.unit||"")}"></div>
      </div>
      <div class="preview" id="prev_answer"></div>
      <div id="apartsArea"></div>
      <button class="btn small" id="addAPartBtn" style="margin-top:8px">+ Add answer part</button>
    </div>
    `}

    <div class="savebar">
      <span id="saveStatus" class="status-saved">Saved</span>
      <button class="btn" id="revertBtn">Revert</button>
      <button class="btn primary" id="saveBtn">Save</button>
    </div>
  `;

  // chapter / subtopic / selected
  const chSel = document.getElementById("f_chapter"), stSel = document.getElementById("f_subtopic");
  chSel.addEventListener("change", () => {
    q.chapter = chSel.value;
    stSel.innerHTML = subtopicsOf(q.chapter).map(st => `<option value="${escapeHtml(st)}">${escapeHtml(st)}</option>`).join("");
    q.subtopic = stSel.value; markDirty();
  });
  stSel.addEventListener("change", () => { q.subtopic = stSel.value; markDirty(); });
  const selToggle = document.getElementById("selToggle"), selBox = document.getElementById("f_selected");
  if (myRole === "master") selToggle.onclick = e => {
    if (e.target !== selBox) selBox.checked = !selBox.checked;
    q.selected = selBox.checked; if (!q.selected) q.selected_rank = null;
    selToggle.classList.toggle("on", q.selected);
    selToggle.querySelector(".vlabel").textContent = q.selected ? "★ Selected (in the 5-5-5 set)" : "Not selected";
    markDirty();
  };

  // topic chips
  ed.querySelectorAll("#topicChips .chip").forEach(chip => {
    chip.onclick = () => {
      chip.classList.toggle("on");
      const t = chip.dataset.t;
      q.topics = q.topics || [];
      if (chip.classList.contains("on")) { if (!q.topics.includes(t)) q.topics.push(t); }
      else { q.topics = q.topics.filter(x => x !== t); }
      markDirty();
    };
  });

  // figure area
  renderFigArea();

  // question/answer live preview + auto latex on blur
  const qEl = document.getElementById("f_question");
  const prevQ = document.getElementById("prev_question");
  renderLatexPreview(prevQ, qEl.value);
  qEl.addEventListener("input", () => { markDirty(); renderLatexPreview(prevQ, qEl.value); });
  qEl.addEventListener("blur", () => {
    qEl.value = autoLatex(qEl.value);
    renderLatexPreview(prevQ, qEl.value);
  });

  if (q.question_type === "mcq") {
    renderOptions();
  } else {
    const ansSym = document.getElementById("f_answer_symbol");
    const prevA = document.getElementById("prev_answer");
    renderLatexPreview(prevA, ansSym.value);
    [document.getElementById("f_answer"), ansSym, document.getElementById("f_unit"), document.getElementById("f_year")].forEach(el => {
      el.addEventListener("input", () => { markDirty(); renderLatexPreview(prevA, ansSym.value); });
    });
    ansSym.addEventListener("blur", () => { ansSym.value = autoLatex(ansSym.value); renderLatexPreview(prevA, ansSym.value); });
  }
  document.getElementById("f_year").addEventListener("input", markDirty);
  document.getElementById("f_diff").addEventListener("change", markDirty);

  const verifyToggle = document.getElementById("verifyToggle");
  const verifyCheckbox = document.getElementById("f_verified");
  verifyToggle.onclick = e => {
    if (e.target !== verifyCheckbox) verifyCheckbox.checked = !verifyCheckbox.checked;
    q.verified = verifyCheckbox.checked;
    q.verified_by = q.verified ? myName : null;
    q.verified_at_local = q.verified ? new Date().toISOString() : null;
    verifyToggle.classList.toggle("on", q.verified);
    verifyToggle.querySelector(".vlabel").textContent = q.verified ? "✓ Verified" : "Mark as verified";
    verifyToggle.querySelector(".vmeta").textContent = q.verified ? `by ${myName}` : "";
    markDirty();
  };

  const errorToggle = document.getElementById("errorToggle");
  const errorCheckbox = document.getElementById("f_hasError");
  errorToggle.onclick = e => {
    if (e.target !== errorCheckbox) errorCheckbox.checked = !errorCheckbox.checked;
    q.has_error = errorCheckbox.checked;
    q.error_flagged_by = q.has_error ? myName : null;
    errorToggle.classList.toggle("on", q.has_error);
    errorToggle.querySelector(".vlabel").textContent = q.has_error ? "⚠ Error flagged" : "Flag as error";
    errorToggle.querySelector(".vmeta").textContent = q.has_error ? `by ${myName}` : "";
    markDirty();
  };
  const errorLogEl = document.getElementById("f_errorLog");
  errorLogEl.addEventListener("input", () => { q.error_log = errorLogEl.value; markDirty(); });
  document.getElementById("f_type").addEventListener("change", () => {
    q.question_type = document.getElementById("f_type").value;
    markDirty();
    renderEditor();
  });

  if (q.question_type !== "mcq") {
    renderParts();
    renderAParts();

    document.getElementById("addPartBtn").onclick = () => {
      q.question_parts = q.question_parts || [];
      const nextLabel = String.fromCharCode(97 + q.question_parts.length);
      q.question_parts.push({ part: nextLabel, text: "" });
      markDirty(); renderParts();
    };
    document.getElementById("addAPartBtn").onclick = () => {
      q.answer_parts = q.answer_parts || [];
      const nextLabel = String.fromCharCode(97 + q.answer_parts.length);
      q.answer_parts.push({ part: nextLabel, value: null, symbol: "", fraction: null, unit: "" });
      markDirty(); renderAParts();
    };
  }

  document.getElementById("viewSourceBtn").onclick = () => openSourceModal(q);
  document.getElementById("saveBtn").onclick = saveCurrent;
  document.getElementById("revertBtn").onclick = () => openQuestion(q.id);
}

function renderParts() {
  const q = currentDraft;
  const area = document.getElementById("qpartsArea");
  area.innerHTML = "";
  (q.question_parts || []).forEach((p, i) => {
    const row = document.createElement("div");
    row.className = "part-row";
    row.innerHTML = `<div class="plabel">(${escapeHtml(p.part||String.fromCharCode(97+i))})</div>
      <div style="flex:1">
        <textarea data-i="${i}">${escapeHtml(p.text||"")}</textarea>
        <div class="preview" data-prev="${i}"></div>
      </div>
      <button class="btn small rm" data-i="${i}">✕</button>`;
    area.appendChild(row);
    const ta = row.querySelector("textarea");
    const prev = row.querySelector("[data-prev]");
    renderLatexPreview(prev, ta.value);
    ta.addEventListener("input", () => { q.question_parts[i].text = ta.value; markDirty(); renderLatexPreview(prev, ta.value); });
    ta.addEventListener("blur", () => { ta.value = autoLatex(ta.value); q.question_parts[i].text = ta.value; renderLatexPreview(prev, ta.value); });
    row.querySelector(".rm").onclick = () => { q.question_parts.splice(i, 1); markDirty(); renderParts(); };
  });
}

function renderAParts() {
  const q = currentDraft;
  const area = document.getElementById("apartsArea");
  area.innerHTML = "";
  (q.answer_parts || []).forEach((p, i) => {
    const row = document.createElement("div");
    row.className = "part-row";
    row.innerHTML = `<div class="plabel">(${escapeHtml(p.part||String.fromCharCode(97+i))})</div>
      <div style="flex:1" class="row">
        <input type="text" placeholder="value" data-f="value" data-i="${i}" value="${p.value!=null?p.value:""}">
        <input type="text" placeholder="symbol (latex)" data-f="symbol" data-i="${i}" value="${escapeHtml(p.symbol||"")}">
        <input type="text" placeholder="unit" data-f="unit" data-i="${i}" value="${escapeHtml(p.unit||"")}">
      </div>
      <button class="btn small rm" data-i="${i}">✕</button>`;
    area.appendChild(row);
    row.querySelectorAll("input").forEach(inp => {
      inp.addEventListener("input", () => {
        const f = inp.dataset.f;
        q.answer_parts[i][f] = inp.value;
        markDirty();
      });
      inp.addEventListener("blur", () => {
        if (inp.dataset.f === "symbol") { inp.value = autoLatex(inp.value); q.answer_parts[i].symbol = inp.value; }
      });
    });
    row.querySelector(".rm").onclick = () => { q.answer_parts.splice(i, 1); markDirty(); renderAParts(); };
  });
}

function renderOptions() {
  const q = currentDraft;
  const area = document.getElementById("optionsArea");
  q.options = q.options || { "1": "", "2": "", "3": "", "4": "" };
  if (q.answer_key == null) q.answer_key = 1;
  area.innerHTML = "";
  ["1", "2", "3", "4"].forEach(k => {
    const row = document.createElement("div");
    row.className = "part-row";
    row.innerHTML = `
      <label class="mcq-radio">
        <input type="radio" name="f_answer_key" value="${k}" ${String(q.answer_key) === k ? "checked" : ""}>
        <span>Correct</span>
      </label>
      <div style="flex:1">
        <textarea data-k="${k}">${escapeHtml(q.options[k] || "")}</textarea>
        <div class="preview" data-prevopt="${k}"></div>
      </div>`;
    area.appendChild(row);
    const ta = row.querySelector("textarea");
    const prev = row.querySelector("[data-prevopt]");
    renderLatexPreview(prev, ta.value);
    ta.addEventListener("input", () => { q.options[k] = ta.value; markDirty(); renderLatexPreview(prev, ta.value); });
    ta.addEventListener("blur", () => { ta.value = autoLatex(ta.value); q.options[k] = ta.value; renderLatexPreview(prev, ta.value); });
    row.querySelector('input[type="radio"]').addEventListener("change", () => {
      q.answer_key = parseInt(k);
      q.answer_symbol = q.options[k] || null;
      markDirty();
    });
  });
}

/* ---------- figure / crop ---------- */
function renderFigArea() {
  const q = currentDraft;
  const area = document.getElementById("figArea");
  if (q.figure_url) {
    area.innerHTML = `<div class="figbox"><img id="figImg" src="${q.figure_url}" crossorigin="anonymous"></div>
      <div class="figbtns">
        <button class="btn small" id="cropBtn">Crop</button>
        <label class="btn small" style="cursor:pointer">Replace<input type="file" id="replaceFile" accept="image/*" style="display:none"></label>
        <button class="btn small" id="removeFigBtn">Remove figure</button>
      </div>`;
    document.getElementById("cropBtn").onclick = () => openCropModal(q.figure_url, url => {
      q.figure_url = url; markDirty(); renderFigArea();
    });
    document.getElementById("removeFigBtn").onclick = () => { q.figure_url = null; markDirty(); renderFigArea(); };
  } else {
    area.innerHTML = `<div class="nofig">No figure ${q.figure&&q.figure.filename ? "(expected: "+escapeHtml(q.figure.filename)+", not uploaded yet)" : ""}</div>
      <div class="figbtns"><label class="btn small" style="cursor:pointer">Upload image<input type="file" id="replaceFile" accept="image/*" style="display:none"></label></div>`;
  }
  const fileInp = document.getElementById("replaceFile");
  if (fileInp) fileInp.addEventListener("change", async e => {
    const file = e.target.files[0];
    if (!file) return;
    showToast("Uploading…");
    try {
      const url = await uploadToCloudinary(file);
      q.figure_url = url;
      if (!q.figure) q.figure = {};
      q.figure.filename = q.figure.filename || file.name;
      markDirty(); renderFigArea();
      showToast("Image uploaded");
    } catch (err) { showToast("Upload failed: " + err.message); }
  });
}

function uploadToCloudinary(fileOrBlob, filename) {
  const form = new FormData();
  form.append("file", fileOrBlob, filename || "upload.png");
  form.append("upload_preset", CLOUDINARY_PRESET);
  return fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, { method: "POST", body: form })
    .then(r => r.json()).then(j => {
      if (j.secure_url) return j.secure_url;
      throw new Error(j.error ? j.error.message : "upload failed");
    });
}

function openCropModal(imgUrl, onSave) {
  const modal = document.getElementById("cropModal");
  modal.classList.add("on");
  const img = document.getElementById("cropimg");
  img.crossOrigin = "anonymous";
  img.src = imgUrl + (imgUrl.includes("?") ? "&" : "?") + "t=" + Date.now();
  if (cropper) { cropper.destroy(); cropper = null; }
  img.onload = () => { cropper = new Cropper(img, { viewMode: 1, autoCropArea: 0.9 }); };
  document.getElementById("cropSaveBtn").onclick = () => {
    if (!cropper) return;
    cropper.getCroppedCanvas().toBlob(blob => {
      showToast("Uploading crop…");
      uploadToCloudinary(blob, "cropped.png").then(url => {
        onSave(url);
        closeModal("cropModal");
        showToast("Crop saved");
      }).catch(err => showToast("Upload failed: " + err.message));
    });
  };
}

function closeModal(id) {
  document.getElementById(id).classList.remove("on");
  if (id === "cropModal" && cropper) { cropper.destroy(); cropper = null; }
}

/* ---------- source viewer (PDF.js, with page navigation) ---------- */
let pdfDoc = null;
let pdfPageNum = 1;
let pdfZoom = 1.2;
let pdfRenderTask = null;
let pdfTargetPage = 1;

async function openSourceModal(q) {
  document.getElementById("sourceModalTitle").textContent = `${q.source || q.id} — page ${q.source_pdf_page || "?"}`;
  const body = document.getElementById("sourceModalBody");
  const toolbar = document.getElementById("pdfToolbar");
  document.getElementById("sourceModal").classList.add("on");

  if (!q.source_pdf_url) {
    toolbar.style.display = "none";
    body.innerHTML = `<div class="nofig">No source PDF linked for this question yet.</div>`;
    return;
  }

  toolbar.style.display = "flex";
  body.innerHTML = `<div id="pdfCanvasWrap"><canvas id="pdfCanvas"></canvas></div><div class="pdf-status" id="pdfLoadingMsg" style="text-align:center;padding:20px">Loading PDF…</div>`;
  pdfTargetPage = q.source_pdf_page || 1;
  pdfZoom = 1.2;

  try {
    const loadingTask = pdfjsLib.getDocument(q.source_pdf_url);
    pdfDoc = await loadingTask.promise;
    document.getElementById("pdfLoadingMsg").remove();
    document.getElementById("pdfPageCount").textContent = pdfDoc.numPages;
    document.getElementById("pdfPageInput").max = pdfDoc.numPages;
    pdfPageNum = Math.min(Math.max(1, pdfTargetPage), pdfDoc.numPages);
    renderPdfPage(pdfPageNum);
  } catch (e) {
    body.innerHTML = `<div class="nofig">Couldn't load PDF: ${escapeHtml(e.message)}</div>`;
    toolbar.style.display = "none";
  }
}

async function renderPdfPage(num) {
  if (!pdfDoc) return;
  pdfPageNum = Math.min(Math.max(1, num), pdfDoc.numPages);
  document.getElementById("pdfPageInput").value = pdfPageNum;

  if (pdfRenderTask) { try { pdfRenderTask.cancel(); } catch (e) {} }
  const page = await pdfDoc.getPage(pdfPageNum);
  const viewport = page.getViewport({ scale: pdfZoom });
  const canvas = document.getElementById("pdfCanvas");
  const ctx = canvas.getContext("2d");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  pdfRenderTask = page.render({ canvasContext: ctx, viewport });
  try { await pdfRenderTask.promise; } catch (e) { /* cancelled render, ignore */ }
}

document.getElementById("pdfPrev").onclick = () => renderPdfPage(pdfPageNum - 1);
document.getElementById("pdfNext").onclick = () => renderPdfPage(pdfPageNum + 1);
document.getElementById("pdfPageInput").addEventListener("change", e => renderPdfPage(parseInt(e.target.value) || 1));
document.getElementById("pdfJumpBtn").onclick = () => renderPdfPage(pdfTargetPage);
document.getElementById("pdfZoomIn").onclick = () => { pdfZoom = Math.min(3, pdfZoom + 0.2); document.getElementById("pdfZoomLbl").textContent = Math.round(pdfZoom / 1.2 * 100) + "%"; renderPdfPage(pdfPageNum); };
document.getElementById("pdfZoomOut").onclick = () => { pdfZoom = Math.max(0.4, pdfZoom - 0.2); document.getElementById("pdfZoomLbl").textContent = Math.round(pdfZoom / 1.2 * 100) + "%"; renderPdfPage(pdfPageNum); };

/* ---------- save ---------- */
function saveCurrent() {
  const q = currentDraft;
  q.difficulty = document.getElementById("f_diff").value;
  q.question_type = document.getElementById("f_type").value;
  q.year = parseInt(document.getElementById("f_year").value) || q.year;
  q.question = autoLatex(document.getElementById("f_question").value);

  if (q.question_type === "mcq") {
    // MCQ: persist options + answer_key, and clear the free-response-only fields
    q.options = q.options || {};
    q.answer_key = q.answer_key != null ? parseInt(q.answer_key) : null;
    q.answer_symbol = (q.options && q.answer_key != null) ? (q.options[String(q.answer_key)] || null) : null;
    q.question_parts = null;
    q.answer_parts = null;
    q.answer = null;
    q.unit = null;
  } else {
    const rawAns = document.getElementById("f_answer").value;
    q.answer = rawAns === "" ? null : (isNaN(rawAns) ? rawAns : Number(rawAns));
    q.answer_symbol = autoLatex(document.getElementById("f_answer_symbol").value) || null;
    q.unit = document.getElementById("f_unit").value || null;
    // not an MCQ: no options/answer_key
    q.options = null;
    q.answer_key = null;
  }

  q.last_edited_by = myName;
  q.last_edited_at = serverTimestamp();
  q.chapter = document.getElementById("f_chapter").value;
  q.subtopic = document.getElementById("f_subtopic").value;
  q.excluded = q.chapter === "Removed";
  q.access_key = accessKey(q);
  delete q._gate;
  if (myRole === "volunteer" && !myKeys.includes(q.access_key)) {
    showToast(`You can only save questions at your assigned levels (${myScope.levels.join(", ")}).`);
    return;
  }

  // error flag + log (read from DOM at save time like the other fields)
  const errChk = document.getElementById("f_hasError");
  if (errChk) {
    q.has_error = errChk.checked;
    if (q.has_error && !q.error_flagged_by) q.error_flagged_by = myName;
    if (!q.has_error) q.error_flagged_by = null;
  }
  const errLog = document.getElementById("f_errorLog");
  if (errLog) q.error_log = errLog.value.trim() || null;

  const { _loadedOnce, ...toSave } = q;
  setDoc(doc(db, "questions", q.id), toSave, { merge: false }).then(() => {
    dirty = false;
    const s = document.getElementById("saveStatus");
    if (s) { s.textContent = "Saved"; s.className = "status-saved"; }
    showToast("Saved " + q.id);
  }).catch(err => {
    if (err.code === "permission-denied") {
      showToast("Not allowed: this question is outside your access, or your access was revoked.");
    } else {
      showToast("Save failed: " + err.message);
    }
  });
}

/* ---------- export ---------- */
document.getElementById("exportJsonBtn").onclick = () => {
  const data = allQuestions.map(({ _loadedOnce, _gate, access_key, ...rest }) => rest);
  downloadBlob(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }), "p6_maths_questions.json");
};

document.getElementById("exportZipBtn").onclick = async () => {
  showToast("Building zip… this can take a minute");
  const zip = new JSZip();
  const data = allQuestions.map(({ _loadedOnce, _gate, access_key, ...rest }) => rest);
  zip.file("questions.json", JSON.stringify(data, null, 1));
  const figFolder = zip.folder("figures");
  let n = 0;
  for (const q of data) {
    if (q.figure_url) {
      try {
        const resp = await fetch(q.figure_url);
        const blob = await resp.blob();
        const ext = (q.figure_url.split(".").pop() || "png").split("?")[0];
        figFolder.file(`${q.id}.${ext}`, blob);
        n++;
      } catch (e) { /* skip failed fetch */ }
    }
  }
  showToast(`Zipping ${n} images…`);
  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, "p6_maths_export.zip");
  showToast("Export ready");
};

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}


/* ================= master: access dashboard ================= */
window.closeModal = closeModal;
let volunteers = [];      // [{uid, ...volunteers doc}]
let editingUid = null;

function genPassword() {
  const a = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const r = crypto.getRandomValues(new Uint32Array(12));
  return Array.from(r, x => a[x % a.length]).join("");
}
function keysFor(topics, levels) { return topics.flatMap(t => levels.map(l => `${t}|${l}`)); }
function countScope(keys) { const ks = new Set(keys); return allQuestions.filter(q => ks.has(accessKey(q))).length; }

document.getElementById("accessBtn").onclick = async () => {
  if (myRole !== "master") return;
  document.getElementById("accessModal").classList.add("on");
  renderAccForm();
  await loadVolunteers();
};

async function loadVolunteers() {
  const snap = await getDocs(collection(db, "volunteers"));
  volunteers = snap.docs.map(d => ({ uid: d.id, ...d.data() })).sort((a, b) => (a.username || "").localeCompare(b.username || ""));
  renderAccTable(); renderCoverage();
}

function selectedVals(id) { return Array.from(document.querySelectorAll(`#${id} input:checked`)).map(i => i.value); }

function renderAccForm(v) {
  const topics = window.__allTopics || [];
  document.getElementById("accTopics").innerHTML = topics.map(t =>
    `<label><input type="checkbox" value="${escapeHtml(t)}" ${v && (v.topics || []).includes(t) ? "checked" : ""}>${escapeHtml(t)}</label>`).join("");
  document.getElementById("accLevels").innerHTML = LEVELS.map(l =>
    `<label><input type="checkbox" value="${l}" ${v && (v.levels || []).includes(l) ? "checked" : ""}>${l}</label>`).join("");
  const u = document.getElementById("accUser"), n = document.getElementById("accName");
  u.value = v ? v.username : ""; u.disabled = !!v; n.value = v ? (v.name || "") : "";
  editingUid = v ? v.uid : null;
  document.getElementById("accFormTitle").textContent = v ? `Edit access — ${v.username}` : "Add volunteer";
  document.getElementById("accSaveBtn").textContent = v ? "Save access" : "Create volunteer";
  document.getElementById("accCancelEdit").style.display = v ? "" : "none";
  document.getElementById("accCred").innerHTML = "";
  const upd = () => {
    const k = keysFor(selectedVals("accTopics"), selectedVals("accLevels"));
    document.getElementById("accScopeCount").textContent = k.length ? `${countScope(k)} questions in this scope` : "Pick at least one topic and one level.";
  };
  document.querySelectorAll("#accTopics input, #accLevels input").forEach(i => i.onchange = upd); upd();
}
document.getElementById("accCancelEdit").onclick = () => renderAccForm();

function showCred(username, password, note) {
  document.getElementById("accCred").innerHTML =
    `<div class="credbox">${escapeHtml(note)}\nSite: https://primary-math-sg.web.app\nUsername: ${escapeHtml(username)}\nPassword: ${escapeHtml(password)}</div>
     <button class="btn small" id="accCopy" style="margin-top:6px">Copy login details</button>`;
  document.getElementById("accCopy").onclick = () => {
    navigator.clipboard.writeText(`Site: https://primary-math-sg.web.app\nUsername: ${username}\nPassword: ${password}`);
    showToast("Copied");
  };
}

document.getElementById("accSaveBtn").onclick = async () => {
  const topics = selectedVals("accTopics"), levels = selectedVals("accLevels");
  const name = document.getElementById("accName").value.trim();
  if (!topics.length || !levels.length) { showToast("Pick at least one topic and one level."); return; }
  const keys = keysFor(topics, levels);
  try {
    if (editingUid) {
      const v = volunteers.find(x => x.uid === editingUid);
      await setDoc(doc(db, "volunteers", editingUid), { ...stripUid(v), name, topics, levels, keys, updated_at: new Date().toISOString(), updated_by: myName });
      showToast(`Access updated for ${v.username}`);
      renderAccForm();
    } else {
      const username = document.getElementById("accUser").value.trim().toLowerCase();
      if (!/^[a-z0-9.\-]{3,30}$/.test(username)) { showToast("Username: 3–30 letters, numbers, dots or dashes."); return; }
      if (username === "master" || volunteers.some(x => x.username === username)) { showToast("That username is taken."); return; }
      const password = genPassword();
      const cred = await createUserWithEmailAndPassword(adminAuth, userEmail(username), password);
      const uid = cred.user.uid;
      await signOut(adminAuth);
      await setDoc(doc(db, "volunteer_secrets", uid), { password, updated_at: new Date().toISOString() });
      await setDoc(doc(db, "volunteers", uid), { username, name, topics, levels, keys, active: true, created_at: new Date().toISOString(), created_by: myName });
      renderAccForm();
      showCred(username, password, "Volunteer created. Send these details privately:");
    }
    await loadVolunteers();
  } catch (e) { showToast("Failed: " + e.message); }
};
function stripUid(v) { const { uid, ...r } = v; return r; }

// change a volunteer's password using the stored current one (master-only collection)
async function rotatePassword(v) {
  const sec = await getDoc(doc(db, "volunteer_secrets", v.uid));
  const oldPw = sec.exists() ? sec.data().password : null;
  if (!oldPw) throw new Error("no stored password for this account");
  const cred = await signInWithEmailAndPassword(adminAuth, userEmail(v.username), oldPw);
  const newPw = genPassword();
  await updatePassword(cred.user, newPw);
  await signOut(adminAuth);
  await setDoc(doc(db, "volunteer_secrets", v.uid), { password: newPw, updated_at: new Date().toISOString() });
  return newPw;
}

async function accAction(act, uid) {
  const v = volunteers.find(x => x.uid === uid); if (!v) return;
  try {
    if (act === "edit") { renderAccForm(v); document.querySelector("#accessModal .modal-body").scrollTop = 0; return; }
    if (act === "revoke") {
      await setDoc(doc(db, "volunteers", uid), { ...stripUid(v), active: false, revoked_at: new Date().toISOString(), revoked_by: myName });
      await rotatePassword(v);
      showToast(`${v.username} revoked and password changed`);
    }
    if (act === "restore") {
      const pw = await rotatePassword(v);
      await setDoc(doc(db, "volunteers", uid), { ...stripUid(v), active: true, restored_at: new Date().toISOString(), restored_by: myName });
      renderAccForm(); showCred(v.username, pw, `Access restored for ${v.username} with a NEW password:`);
    }
    if (act === "reset") {
      const pw = await rotatePassword(v);
      renderAccForm(); showCred(v.username, pw, `New password for ${v.username}:`);
    }
    if (act === "show") {
      const sec = await getDoc(doc(db, "volunteer_secrets", uid));
      renderAccForm(); showCred(v.username, sec.exists() ? sec.data().password : "(none stored)", `Current login for ${v.username}:`);
    }
    if (act === "delete") {
      const sec = await getDoc(doc(db, "volunteer_secrets", uid));
      if (sec.exists()) {
        const cred = await signInWithEmailAndPassword(adminAuth, userEmail(v.username), sec.data().password);
        await deleteUser(cred.user);
      }
      await deleteDoc(doc(db, "volunteers", uid));
      await deleteDoc(doc(db, "volunteer_secrets", uid));
      showToast(`${v.username} deleted`);
    }
    await loadVolunteers();
  } catch (e) { showToast("Failed: " + e.message); try { await signOut(adminAuth); } catch (_) {} }
}

function renderAccTable() {
  const t = document.getElementById("accTable");
  if (!volunteers.length) { t.innerHTML = `<tr><td class="helptxt">No volunteers yet.</td></tr>`; return; }
  t.innerHTML = `<tr><th>Username</th><th>Name</th><th>Topics</th><th>Levels</th><th>Questions</th><th>Edits</th><th>Status</th><th>Actions</th></tr>` +
    volunteers.map(v => {
      const edits = allQuestions.filter(q => q.last_edited_by === v.username).length;
      return `<tr>
        <td><b>${escapeHtml(v.username)}</b></td><td>${escapeHtml(v.name || "")}</td>
        <td>${(v.topics || []).map(escapeHtml).join("<br>")}</td><td>${(v.levels || []).join(", ")}</td>
        <td>${countScope(v.keys || [])}</td><td>${edits}</td>
        <td>${v.active ? '<span class="pill on">active</span>' : '<span class="pill off">revoked</span>'}</td>
        <td><div class="acc-actions">
          <button class="btn small" data-a="edit" data-u="${v.uid}">Edit</button>
          ${v.active ? `<button class="btn small" data-a="show" data-u="${v.uid}">Show login</button>
          <button class="btn small" data-a="reset" data-u="${v.uid}">New password</button>
          <button class="btn small" data-a="revoke" data-u="${v.uid}">Revoke</button>`
          : `<button class="btn small" data-a="restore" data-u="${v.uid}">Restore</button>`}
          <button class="btn small" data-a="delete" data-u="${v.uid}">Delete</button>
        </div></td></tr>`;
    }).join("");
  // in-page two-click confirm (browser confirm() popups are blocked in some embedded browsers)
  const NEEDS_CONFIRM = { revoke: "Click again to revoke", reset: "Click again for new password", delete: "Click again to delete" };
  t.querySelectorAll("button[data-a]").forEach(b => b.onclick = () => {
    const a = b.dataset.a;
    if (NEEDS_CONFIRM[a] && b.dataset.armed !== "1") {
      const orig = b.textContent;
      b.dataset.armed = "1"; b.textContent = NEEDS_CONFIRM[a];
      b.style.background = "var(--bad)"; b.style.borderColor = "var(--bad)"; b.style.color = "#fff";
      setTimeout(() => { if (b.isConnected) { b.dataset.armed = ""; b.textContent = orig; b.style.background = b.style.borderColor = b.style.color = ""; } }, 5000);
      return;
    }
    b.disabled = true; b.textContent = "Working…";
    accAction(a, b.dataset.u);
  });
}

function renderCoverage() {
  const topics = window.__allTopics || [];
  const covered = new Set(volunteers.filter(v => v.active).flatMap(v => v.keys || []));
  const rows = topics.map(t => {
    const cells = LEVELS.map(l => {
      const k = `${t}|${l}`, n = allQuestions.filter(q => accessKey(q) === k).length;
      return `<td style="color:${covered.has(k) ? "var(--good)" : n ? "var(--warn)" : "var(--muted)"}">${n}${covered.has(k) ? " ✓" : ""}</td>`;
    }).join("");
    return `<tr><td>${escapeHtml(t)}</td>${cells}</tr>`;
  }).join("");
  document.getElementById("accCoverage").innerHTML =
    `<table class="acc-table"><tr><th>Topic</th><th>LV1</th><th>LV2</th><th>LV3</th></tr>${rows}</table>
     <div style="margin-top:6px">✓ = assigned to at least one active volunteer.</div>`;
}

/* ---------- student reports (question_reports, from the Catapult Mathletes app) ---------- */
/* student-reports v1: added by backend/scripts/editor-reports.mjs in the p4-p6-math repo */
var __REPORT_REASONS = {
  "wrong-answer": "The answer is wrong", "marked-wrong": "Right answer was marked wrong", "unclear": "Unclear or has a typo",
  "figure": "Picture missing or wrong", "other": "Something else",
};
var __reports = new Map();    // reportId -> open report
var __reportsByQ = new Map(); // questionId -> [open reports]
function __reportBadge(q) {
  const n = (__reportsByQ.get(q.id) || []).length;
  return n ? `<span class="badge rep">⚑ ${n} student report${n > 1 ? "s" : ""}</span>` : "";
}
function __listenReports() {
  __reports.clear(); __reportsByQ = new Map();
  const handle = snap => {
    snap.docChanges().forEach(ch => {
      if (ch.type === "removed") __reports.delete(ch.doc.id);
      else __reports.set(ch.doc.id, { id: ch.doc.id, ...ch.doc.data() });
    });
    __reportsByQ = new Map();
    for (const r of __reports.values()) {
      if (!__reportsByQ.has(r.question_id)) __reportsByQ.set(r.question_id, []);
      __reportsByQ.get(r.question_id).push(r);
    }
    renderList();
    __renderReportsBox();
  };
  const onErr = err => console.warn("student reports:", err.message);
  const reportsCol = collection(db, "question_reports");
  if (myRole === "master") unsubs.push(onSnapshot(query(reportsCol, where("status", "==", "open")), handle, onErr));
  else myKeys.forEach(k => unsubs.push(onSnapshot(query(reportsCol, where("access_key", "==", k), where("status", "==", "open")), handle, onErr)));
}
function __reportTime(t) {
  try { return t && t.toDate ? t.toDate().toLocaleString("en-SG", { dateStyle: "medium", timeStyle: "short" }) : ""; } catch (e) { return ""; }
}
function __renderReportsBox() {
  const box = document.getElementById("reportsBox");
  if (!box) return;
  const secs = r => ((r.updated_at && r.updated_at.seconds) || 0);
  const list = ((currentId && __reportsByQ.get(currentId)) || []).slice().sort((a, b) => secs(b) - secs(a));
  if (!list.length) { box.innerHTML = ""; return; }
  box.innerHTML = `<div class="reports-box"><div class="reports-title">⚑ Student reports (${list.length} open)</div>` + list.map(r => `
    <div class="report" data-id="${escapeHtml(r.id)}">
      <div class="report-reason">${escapeHtml(__REPORT_REASONS[r.reason] || r.reason || "")}${r.times_reported > 1 ? ` <span class="report-meta">· reported ${r.times_reported} times</span>` : ""}</div>
      ${r.note ? `<div class="report-note">“${escapeHtml(r.note)}”</div>` : ""}
      <div class="report-meta">${r.answer_given ? `Student's answer: <b>${escapeHtml(r.answer_given)}</b> · ` : ""}${escapeHtml(r.context || "")} · ${escapeHtml(r.grade || "")} · ${__reportTime(r.updated_at || r.created_at)}</div>
      <div class="report-actions">
        <input class="report-res" placeholder="What did you do? (optional)">
        <button class="btn small" data-act="resolved">✓ Resolved</button>
        <button class="btn small" data-act="dismissed">Dismiss</button>
      </div>
    </div>`).join("") + "</div>";
  box.querySelectorAll(".report button").forEach(b => {
    b.onclick = async () => {
      const el = b.closest(".report");
      const note = el.querySelector(".report-res").value.trim();
      b.disabled = true;
      try {
        await __updateDoc(doc(db, "question_reports", el.dataset.id), {
          status: b.dataset.act, resolved_by: myName, resolved_at: serverTimestamp(), ...(note ? { resolution_note: note } : {}),
        });
        showToast(b.dataset.act === "resolved" ? "Report marked resolved" : "Report dismissed");
      } catch (e) {
        b.disabled = false;
        showToast("Couldn't update the report: " + e.message);
      }
    };
  });
}
var __renderEditorBase = renderEditor;
renderEditor = function () { __renderEditorBase.apply(this, arguments); __renderReportsBox(); };
var __startListeningBase = startListening;
startListening = function () { __startListeningBase.apply(this, arguments); __listenReports(); };
