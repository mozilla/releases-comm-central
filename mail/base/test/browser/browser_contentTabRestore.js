/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that content tabs with mailnews URLs that can't be loaded in a content
 * process are neither persisted nor restored.
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
    // There's no protocol handler for nntp: URLs, so a content tab showing one
    // has nothing worth restoring. Such links open the newsgroup instead.
    "nntp://news.invalid/some.group/1",
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
      tabURI: "nntp://news.invalid/some.group/1",
      linkHandler: "browsers",
      userContextId: "0",
    },
  });
  Assert.equal(tabmail.tabInfo.length, 1, "no tab should be restored");
});
