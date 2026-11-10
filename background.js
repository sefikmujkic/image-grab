const MENU_ID = "image-grab";

browser.runtime.onInstalled.addListener(() => {
  browser.contextMenus.create({
    id: MENU_ID,
    title: "Download original",
    contexts: ["image", "video"],
  });
});

// Resolves true if the file was really saved. downloads.download() succeeds as soon as the
// download starts, so a 403 or hotlink block only shows up later as an interrupted state.
async function tryDownload(url) {
  try {
    const id = await browser.downloads.download({ url, saveAs: false });
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
  if (await tryDownload(url)) return true;
  return !!fallback && fallback !== url && (await tryDownload(fallback));
}

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
  await save(url, info.srcUrl);
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
