// ---------- Bible books and the other names people say for them ----------
// Each entry: [official name, other names...]
const BOOKS = [
  ["Genesis"], ["Exodus"], ["Leviticus"], ["Numbers"], ["Deuteronomy"], ["Joshua"], ["Judges"], ["Ruth"],
  ["1 Samuel"], ["2 Samuel"], ["1 Kings"], ["2 Kings"], ["1 Chronicles"], ["2 Chronicles"],
  ["Ezra"], ["Nehemiah"], ["Esther"], ["Job"], ["Psalm", "psalms"], ["Proverbs"], ["Ecclesiastes"],
  ["Song of Solomon", "song of songs"], ["Isaiah"], ["Jeremiah"], ["Lamentations"], ["Ezekiel"], ["Daniel"],
  ["Hosea"], ["Joel"], ["Amos"], ["Obadiah"], ["Jonah"], ["Micah"], ["Nahum"], ["Habakkuk"], ["Zephaniah"],
  ["Haggai"], ["Zechariah"], ["Malachi"],
  ["Matthew"], ["Mark"], ["Luke"], ["John"], ["Acts"], ["Romans"], ["1 Corinthians"], ["2 Corinthians"],
  ["Galatians"], ["Ephesians"], ["Philippians"], ["Colossians"], ["1 Thessalonians"], ["2 Thessalonians"],
  ["1 Timothy"], ["2 Timothy"], ["Titus"], ["Philemon"], ["Hebrews"], ["James"], ["1 Peter"], ["2 Peter"],
  ["1 John"], ["2 John"], ["3 John"], ["Jude"], ["Revelation", "revelations"]
];

const ALIAS = {};
BOOKS.forEach(([name, ...others]) => {
  ALIAS[name.toLowerCase()] = name;
  others.forEach(a => { ALIAS[a] = name; });
});

// Matches things like: john 3:16, john 3 16, john chapter 3 verse 16, romans 12:1-2
const aliasPattern = Object.keys(ALIAS).sort((a, b) => b.length - a.length).join("|");
const REF_RE = new RegExp(
  "\\b(" + aliasPattern + ")\\s*(?:chapter\\s*)?(\\d{1,3})\\s*(?:[:.,]|verses?|\\s)\\s*(\\d{1,3})(?:\\s*(?:to|through|-)\\s*(\\d{1,3}))?(?!\\d)",
  "g"
);

// "first john" -> "1 john", "second corinthians" -> "2 corinthians"
function normalizeForReferences(text) {
  return text.toLowerCase()
    .replace(/\b(first|1st)\s+(?=[a-z])/g, "1 ")
    .replace(/\b(second|2nd)\s+(?=[a-z])/g, "2 ")
    .replace(/\b(third|3rd)\s+(?=[a-z])/g, "3 ")
    .replace(/\s+/g, " ");
}

// Finds the most recent verse reference in what was said, or null
function detectReference(spoken) {
  const text = normalizeForReferences(spoken).slice(-160);
  let last = null, m;
  REF_RE.lastIndex = 0;
  while ((m = REF_RE.exec(text)) !== null) last = m;
  if (!last) return null;
  const book = ALIAS[last[1]];
  const chapter = +last[2];
  const verse = +last[3];
  const end = last[4] && +last[4] > verse ? +last[4] : null;
  const label = book + " " + chapter + ":" + verse + (end ? "-" + end : "");
  return { book, chapter, verse, end, key: label, label };
}

// Verses we already have in verses.js, looked up by address (works offline)
const localByKey = {};
VERSES.forEach(([ref, text]) => {
  const m = ref.match(/^(.+) (\d+):(\d+)(?:-(\d+))?$/);
  if (!m) return;
  const last = m[4] ? +m[4] : +m[3];
  for (let v = +m[3]; v <= last; v++) localByKey[m[1] + " " + m[2] + ":" + v] = { ref, text };
});

// Any other verse: ask a free Bible website for the King James text (needs internet)
async function fetchVerseText(ref) {
  const name = (ref.book === "Psalm" ? "Psalms" : ref.book).replace(/ /g, "+");
  const query = name + "+" + ref.chapter + ":" + ref.verse + (ref.end ? "-" + ref.end : "");
  try {
    const res = await fetch("https://bible-api.com/" + query + "?translation=kjv");
    if (!res.ok) return null;
    const data = await res.json();
    return (data.text || "").replace(/\s+/g, " ").trim() || null;
  } catch (_) {
    return null;
  }
}