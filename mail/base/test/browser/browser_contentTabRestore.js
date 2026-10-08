/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that content tabs with mailnews URLs that would be loaded in a content
 * process are neither persisted nor restored, and that nntp: URLs are kept in
 * the parent process.
 */

const tabmail = document.getElementById("tabmail");
const contentTabType = tabmail.tabTypes.contentTab;

/**
 * @param {string} url
 * @returns {?object} The persisted state of a content tab showing `url`.
 */
function persist(url) {
  return contentTabType.persistTab({
    browser: {
      currentURI: Services.io.newURI(url),
      getAttribute: () => null,
    },
  });
}

add_task(function testPersistTab() {
  for (const url of [
    "nntps://news.invalid/some.group",
    "pop3://pop.invalid/",
    "smtp://smtp.invalid/",
  ]) {
    Assert.equal(persist(url), null, `${url} should not be persisted`);
  }
  const mailboxURL = `${PathUtils.toFileURI(
    PathUtils.join(PathUtils.tempDir, "message.eml")
  ).replace(/^file:/, "mailbox:")}?number=0&part=1.2`;
  for (const url of ["https://example.com/", mailboxURL]) {
    Assert.equal(persist(url)?.tabURI, url, `${url} should be persisted`);
  }
});

add_task(function testRestoreTab() {
  tabmail.restoreTab({
    mode: "contentTab",
    state: {
      tabURI: "pop3://pop.invalid/",
      linkHandler: "browsers",
      userContextId: "0",
    },
  });
  Assert.equal(tabmail.tabInfo.length, 1, "no tab should be restored");
});

/**
 * Restoring a content tab with an nntp: URL must keep it in the parent process.
 * The URL can't be loaded, but this must not crash.
 */
add_task(async function testRestoreNntpTab() {
  tabmail.restoreTab({
    mode: "contentTab",
    state: {
      tabURI: "nntp://news.invalid/some.group/1",
      linkHandler: "browsers",
      userContextId: "0",
    },
  });
  Assert.equal(tabmail.tabInfo.length, 2, "the tab should be restored");
  const tab = tabmail.tabInfo[1];
  await TestUtils.waitForCondition(
    () => !tab.browser.webProgress?.isLoadingDocument,
    "the load should finish"
  );
  Assert.ok(
    !tab.browser.isRemoteBrowser,
    "the tab should be in the parent process"
  );
  tabmail.closeTab(tab);
});
