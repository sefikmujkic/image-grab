// Settings shared by the background page, the content script and the settings page.
const IG_DEFAULTS = {
  showButton: true,        // the hover button on pictures
  showOnVideos: true,      // the hover button on videos
  corner: "bottom-left",   // bottom-left | bottom-right | top-left | top-right
  minSize: 120,            // smallest picture (px) that gets a button
  preview: true,           // hold a key to preview the full-size picture
  previewKey: "z",
  rightClick: true,        // "Download original" in the right-click menu
  saveMode: "browser",     // browser: follow Firefox's own setting | ask: ask every time
  folder: "",              // optional subfolder inside the Downloads folder
  blockedSites: "",        // one site per line: no hover button or preview there
};

async function igSettings() {
  try {
    return { ...IG_DEFAULTS, ...(await browser.storage.local.get(IG_DEFAULTS)) };
  } catch (e) {
    return { ...IG_DEFAULTS };
  }
}

function igBlocked(host, list) {
  const h = String(host || "").toLowerCase().replace(/^www\./, "");
  return String(list || "")
    .split(/[\s,]+/)
    .map((s) => s.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/?#].*$/, ""))
    .filter(Boolean)
    .some((d) => h === d || h.endsWith("." + d));
}
