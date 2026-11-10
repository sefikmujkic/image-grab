const MENU_ID = "image-grab";

browser.runtime.onInstalled.addListener(() => {
  browser.contextMenus.create({
    id: MENU_ID,
    title: "Download original",
    contexts: ["image", "video"],
  });
});

async function save(url, fallback) {
  try {
    await browser.downloads.download({ url, saveAs: false });
  } catch (e) {
    // some blob:/data: URLs are refused; fall back to the displayed image
    if (fallback && fallback !== url) await browser.downloads.download({ url: fallback });
  }
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

browser.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "download" && msg.url) return save(msg.url);
});
