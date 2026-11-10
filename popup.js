const grid = document.getElementById("grid");
const empty = document.getElementById("empty");
const all = document.getElementById("all");
const go = document.getElementById("go");
const status = document.getElementById("status");
const selected = new Set();
let tab;

function refresh() {
  go.disabled = selected.size === 0;
  go.textContent = selected.size ? `Download ${selected.size}` : "Download";
  all.checked = selected.size > 0 && selected.size === grid.children.length;
  for (const el of grid.children) el.classList.toggle("on", selected.has(Number(el.dataset.i)));
}

function showEmpty(text) {
  empty.hidden = false;
  empty.textContent = text;
  all.disabled = true;
}

(async () => {
  [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  let items;
  try {
    items = await browser.tabs.sendMessage(tab.id, { type: "listAll" }, { frameId: 0 });
  } catch {
    return showEmpty("This page can't be read.");
  }
  if (!items || !items.length) return showEmpty("No images found on this page.");
  for (const it of items) {
    const b = document.createElement("button");
    b.className = "tile";
    b.dataset.i = it.i;
    b.innerHTML = `<img alt="" loading="lazy"><span></span><i>✓</i>`;
    b.querySelector("img").src = it.thumb;
    b.querySelector("span").textContent = it.w ? `${it.w}×${it.h}` : "";
    b.addEventListener("click", () => {
      selected.has(it.i) ? selected.delete(it.i) : selected.add(it.i);
      refresh();
    });
    grid.appendChild(b);
  }
  status.textContent = `${items.length} found`;
})();

all.addEventListener("change", () => {
  selected.clear();
  if (all.checked) for (const el of grid.children) selected.add(Number(el.dataset.i));
  refresh();
});

go.addEventListener("click", async () => {
  go.disabled = true;
  status.textContent = "Finding originals…";
  try {
    const res = await browser.tabs.sendMessage(
      tab.id,
      { type: "downloadAll", indices: [...selected] },
      { frameId: 0 }
    );
    status.textContent = `Saved ${res.count} of ${selected.size}`;
  } catch {
    status.textContent = "Something went wrong.";
  }
  go.disabled = false;
});
