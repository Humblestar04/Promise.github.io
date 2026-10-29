// Free Bible versions from bible-api.com: [code, name]
const VERSIONS = [
  ["kjv", "King James Version"],
  ["web", "World English Bible"],
  ["asv", "American Standard Version"],
  ["bbe", "Bible in Basic English"],
  ["darby", "Darby Bible"],
  ["dra", "Douay-Rheims"],
  ["oeb-us", "Open English Bible"],
  ["ylt", "Young’s Literal (New Testament only)"]
];

// Downloads one verse (or range) in the chosen version. Needs internet.
async function fetchVerseText(label, translation) {
  let name;
  if (typeof label === "string") {
    name = label.replace(/^Psalm /, "Psalms ");
  } else if (label && typeof label === "object") {
    const book = label.book === "Psalm" ? "Psalms" : label.book;
    const verse = label.verse + (label.end ? "-" + label.end : "");
    name = book + " " + label.chapter + ":" + verse;
  } else {
    return null;
  }

  try {
    const res = await fetch("https://bible-api.com/" + encodeURIComponent(name) + "?translation=" + translation);
    if (!res.ok) return null;
    const data = await res.json();
    return (data.text || "").replace(/\s+/g, " ").trim() || null;
  } catch (_) {
    return null;
  }
}