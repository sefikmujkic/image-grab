if (location.search.includes("embed")) document.documentElement.classList.add("embed");
const $ = (id) => document.getElementById(id);
const COMMAND = "download-hovered";
const isMac = /Mac/.test(navigator.platform);
let saveTimer;

function flash(text = "Saved") {
  const el = $("saved");
  el.textContent = text;
  el.classList.add("on");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => el.classList.remove("on"), 1200);
}

async function save(patch) {
  await browser.storage.local.set(patch);
  flash();
}

const labelKey = (k) => (k ? k.toUpperCase() : "None");

async function load() {
  const s = await igSettings();
  for (const id of ["showButton", "showOnVideos", "preview", "rightClick"]) $(id).checked = s[id];
  $("askWhere").checked = s.saveMode === "ask";
  $("folder").value = s.folder;
  $("blockedSites").value = s.blockedSites;
  $("previewKey").textContent = labelKey(s.previewKey);
  for (const [id, value] of [["corner", s.corner], ["minSize", String(s.minSize)]]) markSegment(id, value);
  await showShortcut();
}

function markSegment(id, value) {
  for (const b of $(id).querySelectorAll("button")) b.setAttribute("aria-checked", String(b.dataset.value === value));
}

for (const id of ["showButton", "showOnVideos", "preview", "rightClick"]) {
  $(id).addEventListener("change", () => save({ [id]: $(id).checked }));
}
$("askWhere").addEventListener("change", () => save({ saveMode: $("askWhere").checked ? "ask" : "browser" }));
$("folder").addEventListener("change", () => save({ folder: $("folder").value.trim() }));
$("blockedSites").addEventListener("change", () => save({ blockedSites: $("blockedSites").value }));

for (const id of ["corner", "minSize"]) {
  $(id).addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    markSegment(id, b.dataset.value);
    save({ [id]: id === "minSize" ? Number(b.dataset.value) : b.dataset.value });
  });
}

// Preview key: press a letter or number.
$("previewKey").addEventListener("click", () => {
  const chip = $("previewKey");
  chip.classList.add("listening");
  chip.textContent = "Press a key";
  const done = (key) => {
    document.removeEventListener("keydown", onKey, true);
    chip.classList.remove("listening");
    chip.textContent = labelKey(key);
  };
  const onKey = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") return done((await igSettings()).previewKey);
    if (!/^[a-z0-9]$/i.test(e.key) || e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key.toLowerCase();
    await save({ previewKey: key });
    done(key);
  };
  document.addEventListener("keydown", onKey, true);
});

// Keyboard shortcut: press the new combination.
async function showShortcut() {
  const cmd = (await browser.commands.getAll()).find((c) => c.name === COMMAND);
  $("shortcut").textContent = cmd && cmd.shortcut ? cmd.shortcut : "None";
}

function shortcutFrom(e) {
  const named = { " ": "Space", ",": "Comma", ".": "Period", ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right", Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown", Insert: "Insert", Delete: "Delete" };
  let key = named[e.key] || (/^[a-z0-9]$/i.test(e.key) ? e.key.toUpperCase() : /^F([1-9]|1[0-2])$/.test(e.key) ? e.key : null);
  if (!key) return null;
  const mods = [];
  if (e.ctrlKey) mods.push(isMac ? "MacCtrl" : "Ctrl");
  if (e.metaKey) mods.push("Command");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  if (!mods.some((m) => m !== "Shift")) return null; // needs Ctrl, Alt or Command
  return [...mods, key].join("+");
}

function showError(text) {
  $("shortcutError").hidden = !text;
  $("shortcutError").textContent = text || "";
}

$("shortcut").addEventListener("click", () => {
  const chip = $("shortcut");
  chip.classList.add("listening");
  chip.textContent = "Press keys";
  showError("");
  const stop = async () => {
    document.removeEventListener("keydown", onKey, true);
    chip.classList.remove("listening");
    await showShortcut();
  };
  const onKey = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") return stop();
    if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return;
    const shortcut = shortcutFrom(e);
    if (!shortcut) return showError("Use Ctrl, Alt or Command with a key.");
    try {
      await browser.commands.update({ name: COMMAND, shortcut });
      flash();
    } catch (err) {
      showError("Firefox did not accept that shortcut.");
    }
    stop();
  };
  document.addEventListener("keydown", onKey, true);
});

$("shortcutReset").addEventListener("click", async () => {
  showError("");
  try { await browser.commands.reset(COMMAND); flash(); } catch (e) { showError("Could not reset."); }
  await showShortcut();
});

$("shortcutOff").addEventListener("click", async () => {
  showError("");
  try { await browser.commands.update({ name: COMMAND, shortcut: "" }); flash(); } catch (e) { showError("Could not turn it off."); }
  await showShortcut();
});

load();
