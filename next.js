// Move to the next or previous verse by hand
function stepVerse(delta) {
  // read the reference currently on the screen, e.g. "John 3:16 (KJV)"
  const m = $("topRef").textContent.match(/^(.+) (\d+):(\d+)(?:-(\d+))?/);
  if (!m) return;                                   // nothing is showing yet

  const book = m[1];
  const chapter = +m[2];
  const start = +m[3];
  const end = m[4] ? +m[4] : start;
  const verse = delta > 0 ? end + 1 : start - 1;    // after the last verse shown, or before the first
  if (verse < 1) return;

  const label = book + " " + chapter + ":" + verse;
  callReference({ book, chapter, verse, end: null, key: label, label });

  // stop the verse the pastor first said from jumping back onto the screen
  const seen = detectReference(lastSpoken);
  dismissedKey = seen ? seen.key : null;

  pinned.source = "chosen";
  render(lastSpoken);
}

$("prev").addEventListener("click", () => stepVerse(-1));
$("next").addEventListener("click", () => stepVerse(1));

// Keyboard: right arrow = next verse, left arrow = previous verse
document.addEventListener("keydown", e => {
  const tag = e.target.tagName;
  if (tag === "INPUT" || tag === "SELECT") return;  // don't steal the arrows while typing
  if (e.key === "ArrowRight") { e.preventDefault(); stepVerse(1); }
  if (e.key === "ArrowLeft") { e.preventDefault(); stepVerse(-1); }
});