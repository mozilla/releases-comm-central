/* -*- Mode: indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set sts=2 sw=2 et tw=80: */
"use strict";

add_task(async function testPrintPreview() {
  let tab = window.openContentTab("http://example.net/");

  let extension = ExtensionTestUtils.loadExtension({
    manifest: {
      permissions: ["tabs"],
    },

    async background() {
      await browser.tabs.print();
      browser.test.assertTrue(true, "print preview entered");
      browser.test.notifyPass("tabs.print");
    },
  });

  is(
    document.querySelector(".printPreviewBrowser"),
    null,
    "There shouldn't be any print preview browser"
  );

  await extension.startup();

  // Ensure we're showing the preview...
  await BrowserTestUtils.waitForCondition(() => {
    let preview = document.querySelector(".printPreviewBrowser");
    return preview && BrowserTestUtils.is_visible(preview);
  });

  //  await new Promise (r => window.setTimeout(r, 5000));
  /*gBrowser.getTabDialogBox(gBrowser.selectedBrowser).*/

  let browser = window.document.getElementById("tabmail").selectedBrowser;
  window.PrintUtils.getTabDialogBox(browser).abortAllDialogs();

  // Wait for the preview to go away
  await BrowserTestUtils.waitForCondition(
    () => !document.querySelector(".printPreviewBrowser")
  );

  await extension.awaitFinish("tabs.print");
  await extension.unload();

  let tabmail = window.document.getElementById("tabmail");
  tabmail.closeTab(tab);
});
