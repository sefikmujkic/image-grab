const MENU_ID = "image-grab";

browser.runtime.onInstalled.addListener(() => {
  browser.contextMenus.create({
    id: MENU_ID,
    title: "Download original",
    contexts: ["all"],
    visible: false,
  });
});

// Resolves true if the file was really saved. downloads.download() succeeds as soon as the
// download starts, so a 403 or hotlink block only shows up later as an interrupted state.
function filenameFor(url, folder) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return null;
    let name = decodeURIComponent(u.pathname.split("/").pop() || "image").replace(/[\\/:*?"<>|]+/g, "_");
    if (!/\.\w{2,5}$/.test(name)) name += "." + (u.searchParams.get("format") || "jpg");
    const dir = folder.replace(/\\/g, "/").split("/").map((p) => p.trim()).filter((p) => p && p !== "." && p !== "..").join("/");
    return dir ? dir + "/" + name : null;
  } catch (e) {
    return null;
  }
}

async function tryDownload(url, s) {
  try {
    const options = { url };
    if (s.saveMode === "ask") options.saveAs = true;
    const filename = s.folder ? filenameFor(url, s.folder) : null;
    if (filename) options.filename = filename;
    const id = await browser.downloads.download(options);
    for (let i = 0; i < 240; i++) {
      const [d] = await browser.downloads.search({ id });
      if (d && d.state === "complete") return true;
      if (!d || d.state === "interrupted") return false;
      await new Promise((r) => setTimeout(r, 250));
    }
    return true;
  } catch (e) {
    return false;
  }
}

async function save(url, fallback) {
  const s = await igSettings();
  if (await tryDownload(url, s)) return true;
  return !!fallback && fallback !== url && (await tryDownload(fallback, s));
}

// Sites often cover a picture with a link, so the browser sees a link, not an image. Show the item
// whenever a picture (or direct video) sits under the pointer, whatever the browser says it is.
browser.menus.onShown.addListener(async (info, tab) => {
  const s = await igSettings();
  let show = s.rightClick && (info.contexts.includes("image") || info.contexts.includes("video"));
  if (s.rightClick && !show && tab) {
    try {
      const res = await browser.tabs.sendMessage(tab.id, { type: "probe" }, { frameId: info.frameId });
      show = !!(res && res.has);
    } catch (e) {}
  }
  await browser.menus.update(MENU_ID, { visible: show });
  browser.menus.refresh();
});

browser.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return;
  let url = info.srcUrl;
  try {
    const res = await browser.tabs.sendMessage(
      tab.id,
      { type: "resolve", fallback: info.srcUrl },
      { frameId: info.frameId }
    );
    if (res && res.url) url = res.url;
  } catch (e) {
    // content script not reachable (e.g. restricted page): use the plain image URL
  }
  if (url) await save(url, info.srcUrl);
});

// Keyboard shortcut: every frame checks whether the pointer is over a picture.
browser.commands.onCommand.addListener(async (command) => {
  if (command !== "download-hovered") return;
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab) browser.tabs.sendMessage(tab.id, { type: "hotkey" }).catch(() => {});
});

browser.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "download" && msg.url) return save(msg.url, msg.fallback);
});
