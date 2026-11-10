// Guesses at larger versions of an image URL. These are only guesses: content.js loads every
// candidate and keeps the one with the most pixels, so a wrong guess just fails to load and loses.
function ruleCandidates(u) {
  let url;
  try { url = new URL(u); } catch { return []; }
  const out = [];
  const h = url.hostname;
  const p = url.pathname;
  const withPath = (path) => url.origin + path + url.search;

  // X / Twitter
  if (h === "pbs.twimg.com" && p.startsWith("/media/")) {
    for (const name of ["orig", "4096x4096"]) {
      const o = new URL(url);
      o.searchParams.set("name", name);
      out.push(o.href);
    }
    out.push(u.replace(/:(small|medium|large|thumb)$/, ":orig"));
  }

  // Tumblr
  if (h.endsWith("media.tumblr.com")) {
    out.push(u.replace(/\/s\d+x\d+\//, "/s2048x3072/"));
    out.push(u.replace(/_\d+\.(jpe?g|png|gif)/, "_1280.$1"));
  }

  // Reddit
  if (h === "preview.redd.it") out.push("https://i.redd.it" + p);

  // Pinterest
  if (h === "i.pinimg.com") out.push(u.replace(/\/\d+x\d*\//, "/originals/"));

  // Wikimedia thumbnails
  if (h === "upload.wikimedia.org") out.push(url.origin + p.replace(/\/thumb\/(.+?)\/[^/]+$/, "/$1"));

  // Imgur thumbnails (id plus one size letter)
  if (h === "i.imgur.com") {
    const m = p.match(/^\/([A-Za-z0-9]{5}|[A-Za-z0-9]{7})[sbtmlh](\.\w+)$/);
    if (m) out.push(`${url.origin}/${m[1]}${m[2]}`);
  }

  // Medium
  if (h === "miro.medium.com") out.push(u.replace(/\/resize:fit:\d+\//, "/resize:fit:2400/"));

  // Shopify
  if (h.endsWith("shopify.com")) out.push(withPath(p.replace(/_(\d+x\d*|x\d+)(\.\w+)$/, "$2")));

  // WordPress style "-300x200" and "-scaled" suffixes
  const wp = p.replace(/-\d+x\d+(\.\w+)$/, "$1").replace(/-scaled(\.\w+)$/, "$1");
  if (wp !== p) out.push(withPath(wp));

  // Resize parameters in the query string
  const SIZE_KEYS = ["w", "width", "h", "height", "size", "resize", "fit", "crop", "maxwidth", "max_width", "quality", "q"];
  if (SIZE_KEYS.some((k) => url.searchParams.has(k))) {
    const o = new URL(url);
    SIZE_KEYS.forEach((k) => o.searchParams.delete(k));
    out.push(o.href);
    if (url.searchParams.has("w") || url.searchParams.has("width")) {
      const big = new URL(o);
      big.searchParams.set(url.searchParams.has("w") ? "w" : "width", "4000");
      out.push(big.href);
    }
  }
  if (url.search && /\.(jpe?g|png|webp|gif|avif)$/i.test(p)) out.push(url.origin + p);

  return out.filter((x) => x && x !== u);
}
