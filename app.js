// ---------- 0. Shortcut for finding page elements ----------
const $ = id => document.getElementById(id);

// ---------- 1. Turn text into comparable word stems ----------
const STOP = new Set(("a an the and or but if of to in on at for with from by is are was were be been am it its this that these those " +
  "i you he she we they me my your our their him her us them as so not no do does did have has had will would can could shall should may might must " +
  "into unto upon thou thee thy thine ye hath doth than then there here what which who whom when where why how all any each every some more most " +
  "very just also about up out over again got get like said say says today let").split(" "));

function stem(w) {
  w = w.replace(/[^a-z]/g, "");
  if (w.length <= 3) return w;
  let s = w.replace(/(ing|ed|ly|ness)$/, "");
  if (s.length < 3) s = w;
  s = s.replace(/([bdgnmprt])\1$/, "$1");
  let t = s.replace(/(es|s|e)$/, "");
  return t.length >= 3 ? t : s;
}
function words(str) { return str.toLowerCase().split(/[^a-z']+/).filter(Boolean); }
function stems(str) { return words(str).filter(w => !STOP.has(w)).map(stem).filter(w => w.length > 1); }

// ---------- 2. Build the search index ----------
const docFreq = new Map();
const index = VERSES.map(([ref, text, themes]) => {
  const terms = new Map();
  stems(text).forEach(t => terms.set(t, Math.max(terms.get(t) || 0, 1)));
  stems(themes).forEach(t => terms.set(t, 2));          // theme words count double
  terms.forEach((_, t) => docFreq.set(t, (docFreq.get(t) || 0) + 1));
  return { ref, text, terms };
});
const idf = t => Math.log(1 + VERSES.length / (docFreq.get(t) || 1));

// ---------- 3. Score every verse against the latest words ----------
function findVerses(spoken) {
  const recent = words(spoken).slice(-40);               // only the most recent words matter
  const n = recent.length;
  const weighted = [];                                    // later words count more
  recent.forEach((w, i) => {
    if (STOP.has(w)) return;
    const s = stem(w);
    if (s.length > 1) weighted.push({ stem: s, raw: w, weight: 0.5 + 0.5 * (i / Math.max(n - 1, 1)) });
  });
  return index.map(v => {
    let score = 0; const hit = new Map();
    weighted.forEach(({ stem: s, raw, weight }) => {
      if (v.terms.has(s)) { score += idf(s) * v.terms.get(s) * weight; hit.set(s, raw); }
    });
    score = score / Math.pow(v.terms.size, 0.25);         // stop long verses winning by size
    return { ref: v.ref, text: v.text, score, matched: [...hit.values()] };
  }).filter(r => r.matched.length >= 2)                   // need at least two matching words
    .sort((a, b) => b.score - a.score).slice(0, 4);
}

// ---------- 4. Show results ----------
// pinned = the verse held on the big screen: {ref, text, matched, source, key}
//   text is the King James wording if we have it, or null if it must be downloaded
//   source "called" = the pastor said the reference, "chosen" = you clicked it
let pinned = null;
let dismissedKey = null;  // a called reference you sent away, so it doesn't come straight back
let lastSpoken = "";
let version = "kjv";      // the Bible version chosen in the dropdown

const textCache = {};             // downloaded verses, saved as "version|reference"
const failedKeys = new Set();     // downloads that didn't work
const loadingKeys = new Set();    // downloads in progress

// Gives the verse wording in the chosen version. Starts a download if we don't have it yet.
function textIn(ref, kjvText) {
  if (version === "kjv" && kjvText) return kjvText;
  const key = version + "|" + ref;
  if (textCache[key]) return textCache[key];
  if (failedKeys.has(key)) return "Couldn’t load this verse in " + version.toUpperCase() + ". Check your internet connection.";
  if (!loadingKeys.has(key)) {
    loadingKeys.add(key);
    const v = version;
    fetchVerseText(ref, v).then(text => {
      loadingKeys.delete(key);
      if (text) textCache[key] = text; else failedKeys.add(key);
      render(lastSpoken);
    });
  }
  return "Loading the verse…";
}

function render(spoken) {
  lastSpoken = spoken;
  $("heard").textContent = spoken.trim() ? spoken.trim().split(/\s+/).slice(-40).join(" ") : "Nothing yet.";

  const results = findVerses(spoken);
  const ul = $("others");
  ul.innerHTML = "";
  if ($("unpin")) $("unpin").hidden = !pinned;

  let main = pinned;
  const others = results.filter(r => !pinned || r.ref !== pinned.ref);
  if (!main && others.length) main = others.shift();

  if (!main) {
    $("top").classList.add("idle");
    $("topRef").textContent = "No match yet";
    $("topText").textContent = "Keep listening. A match appears once a few meaningful words fit a verse.";
    $("topWhy").textContent = "";
    return;
  }

  $("top").classList.remove("idle");
  $("topRef").textContent = main.ref + " (" + version.toUpperCase() + ")";
  $("topText").textContent = textIn(main.ref, main.text);
  $("topWhy").textContent = pinned
    ? (pinned.source === "called" ? "Called by the pastor" : "Chosen by you")
    : "Matched on: " + main.matched.join(", ");

  others.forEach(r => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    const b = document.createElement("strong"); b.textContent = r.ref;
    const s = document.createElement("span");
    const preview = version === "kjv" ? r.text : textCache[version + "|" + r.ref];
    if (preview) s.textContent = preview.length > 90 ? preview.slice(0, 90) + "…" : preview;
    btn.append(b, s);
    btn.addEventListener("click", () => {
      if (pinned && pinned.key) dismissedKey = pinned.key;
      pinned = { ref: r.ref, text: r.text, matched: r.matched, source: "chosen", key: null };
      render(lastSpoken);
    });
    li.append(btn);
    ul.append(li);
  });
}

if ($("unpin")) {
  $("unpin").addEventListener("click", () => {
    if (pinned && pinned.key) dismissedKey = pinned.key;
    pinned = null;
    render(lastSpoken);
  });
}

// ---------- 5. When the pastor calls a verse by name ----------
let pendingKey = null, pendingTimer = null;

function callReference(ref) {
  dismissedKey = null;
  const local = localByKey[ref.key];
  pinned = {
    ref: local ? local.ref : ref.label,
    text: local ? local.text : null,
    matched: [], source: "called", key: ref.key
  };
  render(lastSpoken);                                     // the name shows up right away
}

function handleReference(spoken) {
  const ref = detectReference(spoken);
  if (!ref) return;
  if (ref.key === dismissedKey) return;
  if (pinned && pinned.key === ref.key) return;
  if (ref.key === pendingKey) return;
  pendingKey = ref.key;
  clearTimeout(pendingTimer);
  // wait half a second so "John 3:1" turning into "John 3:16" doesn't flash the wrong verse
  pendingTimer = setTimeout(() => { pendingKey = null; callReference(ref); }, 500);
}

function update(spoken) {
  handleReference(spoken);
  render(spoken);
}

// ---------- 6. Listen with the browser's speech recognition ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, listening = false, finalText = "";

function setStatus(msg) { $("status").textContent = msg; }

function startListening() {
  rec = new SR();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = "en-US";                                     // try "en-NG" for Nigerian English
  rec.onresult = e => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText += " " + t; else interim += " " + t;
    }
    update(finalText + " " + interim);
  };
  rec.onerror = e => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      stopListening();
      setStatus("Microphone blocked. Allow microphone access for this page, then try again.");
    } else if (e.error !== "no-speech" && e.error !== "aborted") {
      setStatus("Listening problem: " + e.error);
    }
  };
  rec.onend = () => { if (listening) { try { rec.start(); } catch (_) {} } };  // keep going during a long sermon
  try { rec.start(); } catch (_) {}
  listening = true;
  $("mic").textContent = "Stop listening";
  $("mic").classList.add("on");
  $("mic").setAttribute("aria-pressed", "true");
  setStatus("Listening…");
}

function stopListening() {
  listening = false;
  if (rec) { try { rec.stop(); } catch (_) {} }
  $("mic").textContent = "Start listening";
  $("mic").classList.remove("on");
  $("mic").setAttribute("aria-pressed", "false");
  setStatus("");
}

$("mic").addEventListener("click", () => {
  if (!SR) { setStatus("This browser can’t listen. Open the page in Chrome, or type a sentence below to test."); return; }
  listening ? stopListening() : startListening();
});
$("manual").addEventListener("input", e => update(e.target.value));
if (!SR) setStatus("Speech recognition isn’t available here. You can still test by typing below.");

// ---------- 7. Bible version picker ----------
VERSIONS.forEach(([code, name]) => {
  const opt = document.createElement("option");
  opt.value = code;
  opt.textContent = name;
  $("version").append(opt);
});
try {
  const saved = localStorage.getItem("verseFinderVersion");   // remember your choice next time
  if (saved && VERSIONS.some(v => v[0] === saved)) version = saved;
} catch (_) {}
$("version").value = version;
$("version").addEventListener("change", e => {
  version = e.target.value;
  try { localStorage.setItem("verseFinderVersion", version); } catch (_) {}
  render(lastSpoken);
});

// ---------- 8. Make the app installable ----------
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}