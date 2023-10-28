"use strict";
add_task(async function test_request_permissions_without_prompt() {
  async function pageScript() {
    const NO_PROMPT_PERM = "activeTab";
    window.addEventListener(
      "keypress",
      async () => {
        const permGranted = await browser.permissions.request({
          permissions: [NO_PROMPT_PERM],
        });
        browser.test.assertTrue(
          permGranted,
          `${NO_PROMPT_PERM} permission was granted.`
        );
        const perms = await browser.permissions.getAll();
        browser.test.assertTrue(
          perms.permissions.includes(NO_PROMPT_PERM),
          `${NO_PROMPT_PERM} permission exists.`
        );
        browser.test.sendMessage("permsGranted");
      },
      { once: true }
    );
    browser.test.sendMessage("pageReady");
  }

  const extension = ExtensionTestUtils.loadExtension({
    background() {
      browser.test.sendMessage("ready", browser.runtime.getURL("page.html"));
    },
    files: {
      "page.html": `<html><head><script src="page.js"></script></head></html>`,
      "page.js": pageScript,
    },
    manifest: {
      optional_permissions: ["activeTab"],
    },
  });
  await extension.startup();

  const url = await extension.awaitMessage("ready");

  const tab = openContentTab(url, undefined, null);
  await extension.awaitMessage("pageReady");
  await new Promise(resolve => requestAnimationFrame(resolve));
  await BrowserTestUtils.synthesizeMouseAtCenter(tab.browser, {}, tab.browser);
  await BrowserTestUtils.synthesizeKey("a", {}, tab.browser);
  await extension.awaitMessage("permsGranted");
  await extension.unload();

  const tabmail = document.getElementById("tabmail");
  tabmail.closeTab(tab);
});
