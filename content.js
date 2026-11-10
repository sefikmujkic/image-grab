// Finds the largest version of an image (or the file behind a video), and shows a download button on hover.
let last = null;
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
  return [...new Set(c.map(abs).filter((u) => u && !u.startsWith("javascript:")))];
}

function measure(url) {
  return new Promise((resolve) => {
    const im = new Image();
    const t = setTimeout(() => resolve(0), 5000);
    im.onload = () => { clearTimeout(t); resolve(im.naturalWidth * im.naturalHeight); };
    im.onerror = () => { clearTimeout(t); resolve(0); };
    im.src = url;
  });
}

async function bestFor(img, fallback) {
  if (!img) return fallback;
  if (img.tagName === "VIDEO") return videoUrl(img) || fallback;
  const urls = candidatesFor(img);
  const sizes = await Promise.all(urls.map(measure));
  let bestUrl = null, bestSize = 0;
  urls.forEach((u, i) => { if (sizes[i] > bestSize) { bestSize = sizes[i]; bestUrl = u; } });
  return bestUrl || fallback || img.currentSrc || img.src;
}

// Right-click menu path.
browser.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "resolve") {
    const img = last ? imageAt(last.x, last.y, last.target) : null;
    return bestFor(img, msg.fallback).then((url) => ({ url }));
  }
});

// Hover button path.
const MIN_SIZE = 120;
let host, button, current = null, ticking = false, mouse = { x: 0, y: 0 }, busy = false;

function ensureButton() {
  if (host) return;
  host = document.createElement("div");
  host.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;";
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `
    <style>
      button{position:fixed;display:none;width:36px;height:36px;padding:0;border:0;border-radius:18px;
        background:rgba(0,0,0,.72);color:#fff;cursor:pointer;align-items:center;justify-content:center;
        box-shadow:0 1px 4px rgba(0,0,0,.4);font:600 13px system-ui,sans-serif;transition:background .15s}
      button:hover{background:rgba(0,0,0,.9)}
      button.show{display:flex}
      svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    </style>
    <button title="Download original" aria-label="Download original">
      <svg viewBox="0 0 24 24"><path d="M12 3v12m0 0l-5-5m5 5l5-5M5 21h14"/></svg>
    </button>`;
  button = root.querySelector("button");
  button.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!current || busy) return;
    busy = true;
    button.style.opacity = ".5";
    try {
      const url = await bestFor(current, current.currentSrc || current.src);
      await browser.runtime.sendMessage({ type: "download", url });
    } finally {
      busy = false;
      button.style.opacity = "";
    }
  });
  (document.documentElement || document).appendChild(host);
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

function place(img) {
  ensureButton();
  const c = container();
  if (host.parentNode !== c) c.appendChild(host);
  const r = img.getBoundingClientRect();
  const left = Math.min(Math.max(r.right - 44, r.left + 8), window.innerWidth - 44);
  const top = Math.min(Math.max(r.top + 8, 8), window.innerHeight - 44);
  button.style.left = left + "px";
  button.style.top = top + "px";
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
    mouse = { x: e.clientX, y: e.clientY };
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  },
  { passive: true }
);
window.addEventListener("scroll", () => { if (current) hide(); }, { passive: true, capture: true });
