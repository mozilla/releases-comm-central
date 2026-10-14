/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { Feed } = ChromeUtils.importESModule("resource:///modules/Feed.sys.mjs");
var { FeedUtils } = ChromeUtils.importESModule(
  "resource:///modules/FeedUtils.sys.mjs"
);
var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { MockFilePicker } = SpecialPowers;

const server = MailServices.accounts.getAccount("account1").incomingServer;
const rootFolder = server.rootFolder;

add_setup(() => {
  MockFilePicker.init(window.browsingContext);
  registerCleanupFunction(() => {
    MockFilePicker.cleanup();
    for (const prefix of ["fz", "tb"]) {
      const folder = rootFolder.getChildNamed(`Prefix ${prefix} Feed`);
      if (folder) {
        FeedUtils.deleteFeed(new Feed(feedURL(prefix), folder));
        rootFolder.propagateDelete(folder, true);
      }
    }
  });
});

function feedURL(prefix) {
  return `https://example.org/browser/comm/mailnews/extensions/newsblog/test/browser/data/rss.xml?${prefix}`;
}

/**
 * Open the feed subscriptions dialog with the account selected.
 *
 * @returns {Promise<Window>}
 */
async function openSubscriptionsDialog() {
  const dialogPromise = BrowserTestUtils.domWindowOpenedAndLoaded(
    null,
    win =>
      win.location.href ==
      "chrome://messenger-newsblog/content/feed-subscriptions.xhtml"
  );
  window.openDialog(
    "chrome://messenger-newsblog/content/feed-subscriptions.xhtml",
    "",
    "centerscreen,chrome,dialog=no,resizable",
    { folder: rootFolder }
  );
  const dialogWindow = await dialogPromise;
  await TestUtils.waitForCondition(
    () =>
      dialogWindow.FeedSubscriptions.mView.currentItem?.folder == rootFolder,
    "waiting for the account to be selected"
  );
  return dialogWindow;
}

async function closeSubscriptionsDialog(dialogWindow) {
  const closedPromise = BrowserTestUtils.domWindowClosed(dialogWindow);
  dialogWindow.close();
  await closedPromise;
}

/**
 * Import an OPML file through the feed subscriptions dialog.
 *
 * @param {string} prefix - The namespace prefix used in the OPML file.
 */
async function importOPML(prefix) {
  const dialogWindow = await openSubscriptionsDialog();
  const { FeedSubscriptions } = dialogWindow;

  MockFilePicker.setFiles([
    new FileUtils.File(getTestFilePath(`data/opml-prefix-${prefix}.opml`)),
  ]);
  MockFilePicker.returnValue = MockFilePicker.returnOK;
  const importButton = dialogWindow.document.getElementById("importOPML");
  EventUtils.synthesizeMouseAtCenter(importButton, {}, dialogWindow);
  await TestUtils.waitForCondition(
    () =>
      FeedUtils.feedAlreadyExists(feedURL(prefix), server) &&
      FeedSubscriptions.mActionMode === null,
    "waiting for the import to finish"
  );

  await closeSubscriptionsDialog(dialogWindow);
}

/**
 * Check that the feed imported from the given OPML file kept the settings
 * from the file.
 *
 * @param {string} prefix - The namespace prefix used in the OPML file.
 */
function checkImportedFeed(prefix) {
  const url = feedURL(prefix);
  Assert.ok(
    FeedUtils.feedAlreadyExists(url, server),
    `feed from the ${prefix}: file should be subscribed`
  );
  Assert.ok(
    FeedUtils.getSubscriptionAttr(url, server, "quickMode", false),
    `feed from the ${prefix}: file should be in summary mode`
  );
  const options = FeedUtils.getSubscriptionAttr(url, server, "options", null);
  Assert.equal(
    options?.updates.enabled,
    false,
    `feed from the ${prefix}: file should be paused`
  );
  Assert.equal(
    options?.updates.updateMinutes,
    7,
    `feed from the ${prefix}: file should keep its update interval`
  );
}

add_task(async function testImportStandardPrefix() {
  await importOPML("fz");
  checkImportedFeed("fz");
});

add_task(async function testImportOtherPrefix() {
  await importOPML("tb");
  checkImportedFeed("tb");
});

add_task(async function testExport() {
  const dialogWindow = await openSubscriptionsDialog();
  const exportPath = PathUtils.join(PathUtils.tempDir, "opml-export.opml");
  registerCleanupFunction(() => IOUtils.remove(exportPath));

  MockFilePicker.setFiles([new FileUtils.File(exportPath)]);
  MockFilePicker.returnValue = MockFilePicker.returnOK;
  const exportButton = dialogWindow.document.getElementById("exportOPML");
  EventUtils.synthesizeMouseAtCenter(exportButton, {}, dialogWindow);
  await TestUtils.waitForCondition(
    () => IOUtils.exists(exportPath),
    "waiting for the export to be written"
  );
  await closeSubscriptionsDialog(dialogWindow);

  const text = await IOUtils.readUTF8(exportPath);
  Assert.equal(
    text.match(/xmlns:fz=/g)?.length,
    1,
    "export should declare the fz namespace once"
  );
  const doc = new DOMParser().parseFromString(text, "application/xml");
  Assert.equal(
    doc.documentElement.lookupNamespaceURI("fz"),
    FeedUtils.FZ_NS,
    "export should declare the fz namespace on the root"
  );
  for (const prefix of ["fz", "tb"]) {
    const outline = doc.querySelector(`outline[xmlUrl="${feedURL(prefix)}"]`);
    Assert.equal(
      outline?.getAttributeNS(FeedUtils.FZ_NS, "quickMode"),
      "true",
      `exported ${prefix}: feed should be in summary mode`
    );
    const options = JSON.parse(
      outline.getAttributeNS(FeedUtils.FZ_NS, "options")
    );
    Assert.equal(
      options.updates.enabled,
      false,
      `exported ${prefix}: feed should be paused`
    );
  }
});
