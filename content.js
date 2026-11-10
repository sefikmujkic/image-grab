// Finds the largest version of an image (or the file behind a video), shows a download button
// on hover, a hold-to-preview on key Z, and lists every image on the page for the toolbar popup.
// ruleCandidates() comes from rules.js, loaded first.
let last = null;
// If another copy of this extension already runs in this page, leave the on-page UI to it so only
// one button ever appears and a shortcut press doesn't download twice.
const UI_ENABLED = !document.documentElement.hasAttribute("data-image-grab-ui");
if (UI_ENABLED) document.documentElement.setAttribute("data-image-grab-ui", "1");
document.addEventListener(
  "contextmenu",
  (e) => { last = { x: e.clientX, y: e.clientY, target: e.target }; },
  true
);

const IMG_EXT = /\.(jpe?g|png|gif|webp|avif|bmp|tiff?)(\?|#|$)/i;
const DATA_ATTRS = [
  "data-src", "data-original", "data-full", "data-full-src", "data-large",
  "data-zoom-image", "data-hires", "data-highres", "data-lazy-src", "data-image",
];

const abs = (u) => { try { return new URL(u, document.baseURI).href; } catch { return null; } };

function parseSrcset(s) {
  const out = [];
  const re = /\s*(\S+)(?:\s+(\d+(?:\.\d+)?)[wx])?\s*(?:,|$)/g;
  let m;
  while ((m = re.exec(s || "")) && m[0]) out.push(m[1]);
  return out;
}

const isMedia = (el) => el.tagName === "IMG" || el.tagName === "VIDEO";

function imageAt(x, y, fallback) {
  const stack = document.elementsFromPoint(x, y);
  return stack.find(isMedia) || (fallback && isMedia(fallback) ? fallback : null);
}

// Direct file URL of a video, or null for streams (blob:, HLS, DASH) that can't be saved as a file.
function videoUrl(v) {
  const list = [v.currentSrc, v.src, ...[...v.querySelectorAll("source")].map((s) => s.src)]
    .map(abs)
    .filter((u) => u && /^https?:/.test(u) && !/\.(m3u8|mpd)(\?|#|$)/i.test(u));
  return list[0] || null;
}

function candidatesFor(img) {
  const c = [];
  const link = img.closest("a[href]");
  if (link && IMG_EXT.test(link.href)) c.push(link.href);
  for (const holder of [img, link, img.parentElement]) {
    if (!holder) continue;
    for (const a of DATA_ATTRS) if (holder.getAttribute(a)) c.push(holder.getAttribute(a));
    if (holder.getAttribute("data-srcset")) c.push(...parseSrcset(holder.getAttribute("data-srcset")));
  }
  const picture = img.closest("picture");
  if (picture) for (const s of picture.querySelectorAll("source")) c.push(...parseSrcset(s.srcset));
  c.push(...parseSrcset(img.srcset));
  if (img.currentSrc) c.push(img.currentSrc);
  if (img.src) c.push(img.src);
  const base = [...new Set(c.map(abs).filter((u) => u && /^(https?:|data:image|blob:)/.test(u)))];
  const guesses = base.filter((u) => u.startsWith("http")).flatMap((u) => ruleCandidates(u));
  return [...new Set([...base, ...guesses])];
}

function measure(url) {
  return new Promise((resolve) => {
    const im = new Image();
    const t = setTimeout(() => resolve(0), 6000);
    im.onload = () => { clearTimeout(t); resolve(im.naturalWidth * im.naturalHeight); };
    im.onerror = () => { clearTimeout(t); resolve(0); };
    im.src = url;
  });
}

const resolved = new WeakMap();

function bestFor(img, fallback) {
  if (!img) return Promise.resolve(fallback);
  if (img.tagName === "VIDEO") return Promise.resolve(videoUrl(img) || fallback);
  if (!resolved.has(img)) {
    resolved.set(img, (async () => {
      const urls = candidatesFor(img);
      const sizes = await Promise.all(urls.map(measure));
      let bestUrl = null, bestSize = 0;
      urls.forEach((u, i) => { if (sizes[i] > bestSize) { bestSize = sizes[i]; bestUrl = u; } });
      return bestUrl;
    })());
  }
  return resolved.get(img).then((u) => u || fallback || img.currentSrc || img.src);
}

// Saves a file in the page itself, with the page's cookies and referrer. Used when the
// background download is refused (hotlink protection, logged-in images).
async function blobSave(url) {
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) throw new Error("http " + r.status);
  const blob = await r.blob();
  let name = decodeURIComponent((new URL(url).pathname.split("/").pop() || "image")).replace(/[^\w.\- ]+/g, "_");
  if (!/\.\w{2,5}$/.test(name)) name += "." + ((blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg").split("+")[0]);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.documentElement.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

async function send(url, fallback) {
  const ok = await browser.runtime.sendMessage({ type: "download", url, fallback });
  if (ok) return;
  try { await blobSave(url); } catch { if (fallback && fallback !== url) await blobSave(fallback); }
}

// ---- Messages from the background page and the popup ----
let listed = [];

browser.runtime.onMessage.addListener((msg) => {
  if (!msg) return;
  if (msg.type === "resolve") {
    const img = last ? imageAt(last.x, last.y, last.target) : null;
    return bestFor(img, msg.fallback).then((url) => ({ url }));
  }
  if (msg.type === "probe") {
    const el = last ? imageAt(last.x, last.y, last.target) : null;
    const r = el && el.getBoundingClientRect();
    const ok = el && r.width >= 50 && r.height >= 50 && (el.tagName === "IMG" || videoUrl(el));
    return Promise.resolve({ has: !!ok });
  }
  if (msg.type === "hotkey") {
    if (current) downloadCurrent();
    return;
  }
  if (msg.type === "listAll") {
    const seen = new Set();
    listed = [];
    for (const im of document.images) {
      const src = im.currentSrc || im.src;
      const r = im.getBoundingClientRect();
      const big = Math.max(im.naturalWidth, r.width) >= 100 && Math.max(im.naturalHeight, r.height) >= 100;
      if (!src || !big || seen.has(src) || /^data:image\/svg/.test(src)) continue;
      seen.add(src);
      listed.push(im);
    }
    return Promise.resolve(
      listed.map((im, i) => ({ i, thumb: im.currentSrc || im.src, w: im.naturalWidth, h: im.naturalHeight }))
    );
  }
  if (msg.type === "downloadAll") {
    const queue = [...msg.indices];
    let count = 0;
    const worker = async () => {
      while (queue.length) {
        const im = listed[queue.shift()];
        if (!im) continue;
        try { await send(await bestFor(im, im.currentSrc || im.src), im.currentSrc || im.src); count++; } catch {}
      }
    };
    return Promise.all([worker(), worker(), worker()]).then(() => ({ count }));
  }
});

// ---- Hover button ----
const MIN_SIZE = 120;
let host, root, button, preview, current = null, ticking = false, mouse = { x: 0, y: 0 }, busy = false;
let previewing = false;

function ensureButton() {
  if (host) return;
  host = document.createElement("div");
  host.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;";
  root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `
    <style>
      button{position:fixed;display:none;width:36px;height:36px;padding:0;border:0;border-radius:18px;
        background:rgba(0,0,0,.72);color:#fff;cursor:pointer;align-items:center;justify-content:center;
        box-shadow:0 1px 4px rgba(0,0,0,.4);transition:background .15s}
      button:hover{background:rgba(0,0,0,.9)}
      button.show{display:flex}
      button.done{background:#16a34a}
      svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
      .ok{display:none}
      button.done .arrow{display:none}
      button.done .ok{display:block}
      img{position:fixed;display:none;left:50%;top:50%;transform:translate(-50%,-50%);max-width:92vw;max-height:92vh;
        object-fit:contain;border-radius:6px;box-shadow:0 8px 40px rgba(0,0,0,.55);background:#111;pointer-events:none}
      img.show{display:block}
    </style>
    <button title="Download original (Alt+Shift+D)" aria-label="Download original">
      <svg class="arrow" viewBox="0 0 24 24"><path d="M12 3v12m0 0l-5-5m5 5l5-5M5 21h14"/></svg>
      <svg class="ok" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>
    </button>
    <img alt="">`;
  button = root.querySelector("button");
  preview = root.querySelector("img");
  button.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    downloadCurrent();
  });
  (document.documentElement || document).appendChild(host);
}

async function downloadCurrent() {
  if (!current || busy) return;
  busy = true;
  button.style.opacity = ".5";
  try {
    await send(await bestFor(current, current.currentSrc || current.src), current.currentSrc || current.src);
    button.classList.add("done");
    setTimeout(() => button && button.classList.remove("done"), 1200);
  } finally {
    busy = false;
    button.style.opacity = "";
  }
}

function hide() {
  current = null;
  if (button) button.classList.remove("show");
}

// A modal <dialog> (like a gallery lightbox) sits in the top layer and makes everything outside it
// inert, so the button has to live inside it to be visible and clickable.
function container() {
  let dialog = null;
  try { dialog = document.querySelector("dialog:modal"); } catch {}
  if (dialog) return dialog;
  const fs = document.fullscreenElement;
  if (fs && !["VIDEO", "IMG"].includes(fs.tagName)) return fs;
  return document.documentElement;
}

// One button, always on the bottom-left corner of the picture, centered on the corner so it stays
// clear of the enlarge and share buttons sites put just inside the other corners.
const HALF = 18;

function place(img) {
  ensureButton();
  const c = container();
  if (host.parentNode !== c) c.appendChild(host);
  const r = img.getBoundingClientRect();
  button.style.left = Math.min(Math.max(r.left - HALF, 4), window.innerWidth - 2 * HALF - 4) + "px";
  button.style.top = Math.min(Math.max(r.bottom - HALF, 4), window.innerHeight - 2 * HALF - 4) + "px";
  button.classList.add("show");
}

function update() {
  ticking = false;
  const stack = document.elementsFromPoint(mouse.x, mouse.y);
  if (host && stack.includes(host)) return; // pointer is on the button
  const img = stack.find((el) => {
    if (!isMedia(el)) return false;
    if (el.tagName === "VIDEO" && !videoUrl(el)) return false;
    const r = el.getBoundingClientRect();
    return r.width >= MIN_SIZE && r.height >= MIN_SIZE;
  });
  if (!img) return hide();
  current = img;
  place(img);
}

document.addEventListener(
  "mousemove",
  (e) => {
    if (!UI_ENABLED) return;
    mouse = { x: e.clientX, y: e.clientY };
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  },
  { passive: true }
);
window.addEventListener("scroll", () => { if (current) hide(); }, { passive: true, capture: true });

// ---- Hold Z over an image to preview the full-size version ----
function hidePreview() {
  previewing = false;
  if (preview) preview.classList.remove("show");
}

document.addEventListener("keydown", async (e) => {
  if (!UI_ENABLED || e.key.toLowerCase() !== "z" || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  // Works on any picture under the pointer, including small thumbnails the button skips.
  const img = document.elementsFromPoint(mouse.x, mouse.y).find((el) => {
    if (el.tagName !== "IMG") return false;
    const r = el.getBoundingClientRect();
    return r.width >= 24 && r.height >= 24;
  });
  if (!img) return;
  ensureButton();
  const c = container();
  if (host.parentNode !== c) c.appendChild(host);
  previewing = true;
  preview.src = img.currentSrc || img.src;
  preview.classList.add("show");
  const url = await bestFor(img, img.currentSrc || img.src);
  if (previewing && preview.src !== url) preview.src = url;
}, true);
document.addEventListener("keyup", (e) => { if (e.key.toLowerCase() === "z") hidePreview(); }, true);
window.addEventListener("blur", hidePreview);
