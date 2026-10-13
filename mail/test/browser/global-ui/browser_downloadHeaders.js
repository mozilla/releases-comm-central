/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
const { NntpNewsGroup } = ChromeUtils.importESModule(
  "resource:///modules/NntpNewsGroup.sys.mjs"
);

const dialogURI = "chrome://messenger/content/downloadheaders.xhtml";
let account;
let server;

add_setup(() => {
  account = MailServices.accounts.createAccount();
  account.incomingServer = MailServices.accounts.createIncomingServer(
    null,
    "download-headers.invalid",
    "nntp"
  );
  server = account.incomingServer.QueryInterface(Ci.nsINntpIncomingServer);
  server.maxArticles = 500;
  server.notifyOn = true;
  server.markOldRead = false;

  registerCleanupFunction(() => MailServices.accounts.removeAccount(account));
});

/**
 * Opens the dialog for a new folder and closes it after the callback.
 *
 * @param {string} groupName - Name of the newsgroup to create.
 * @param {number} articleCount - Number of available articles.
 * @param {function(Window): (string|undefined|Promise<string|undefined>)} callback
 *   - Checks or changes the dialog and returns a button name, defaulting to cancel.
 * @returns {Promise<number[]>} The requested article range, or an empty array
 *   when cancelled.
 */
async function withDownloadDialog(groupName, articleCount, callback) {
  const rootFolder = server.rootFolder;
  rootFolder.createSubfolder(groupName, null);
  const folder = rootFolder
    .getChildNamed(groupName)
    .QueryInterface(Ci.nsIMsgNewsFolder);
  const newsGroup = new NntpNewsGroup(server, folder);

  const dialogPromise = BrowserTestUtils.promiseAlertDialogOpen(
    null,
    dialogURI,
    {
      async callback(win) {
        const doc = win.document;
        const dialog = doc.querySelector("dialog");
        let button = "cancel";
        try {
          // Native modal dialogs should receive focus automatically.
          // SimpleTest.promiseFocus() may explicitly request focus, which appears to
          // trigger a 1x1 window-sizing bug in Mutter on X11
          // (https://gitlab.gnome.org/GNOME/mutter/-/work_items/4717).
          await TestUtils.waitForCondition(
            () => win.document.hasFocus(),
            "Download Headers dialog should receive focus",
            20,
            100
          );
          button = await callback(win);
        } finally {
          EventUtils.synthesizeMouseAtCenter(
            dialog.getButton(button ?? "cancel"),
            {},
            win
          );
        }
      },
    }
  );

  const range = newsGroup.getArticlesRangeToFetch(
    window.msgWindow,
    1,
    articleCount
  );
  await dialogPromise;
  return range;
}

add_task(async function test_dialogContents() {
  const groupName = "mozilla.dev.apps.thunderbird";
  const articleCount = 10000;
  const range = await withDownloadDialog(groupName, articleCount, win => {
    const doc = win.document;
    Assert.equal(
      doc.getElementById("newsgroupLabel").textContent,
      groupName,
      "The dialog should display the newsgroup name"
    );
    Assert.deepEqual(
      doc.l10n.getAttributes(doc.getElementById("info")),
      { id: "download-headers-info-text", args: { count: articleCount } },
      "The description should use the article count for localization"
    );
    Assert.equal(
      doc.l10n.getAttributes(doc.querySelector("dialog").getButton("accept"))
        .id,
      "download-headers-ok-button",
      "The accept button should use the download label"
    );
  });
  Assert.deepEqual(range, [], "Cancelling should prevent downloading headers");
});

/**
 * Checks the selected download limit and mark as read setting.
 *
 * @param {Window} win - The dialog window.
 * @param {number} count - Expected header count.
 * @param {boolean} markOldRead - Expected mark as read setting.
 */
function assertSettings(win, count, markOldRead) {
  const doc = win.document;
  Assert.ok(
    doc.getElementById("some").selected,
    "The limited download option should be selected when opening the dialog"
  );
  Assert.ok(
    !doc.getElementById("all").selected,
    "The download all option should initially be unselected"
  );
  Assert.equal(
    doc.getElementById("number").value,
    String(count),
    "The header count should match the saved server setting"
  );
  Assert.equal(
    doc.getElementById("markread").checked,
    markOldRead,
    "The mark as read checkbox should match the saved server setting"
  );
  assertControlsEnabled(win, true);
}

/**
 * Checks whether the limited download controls are enabled.
 *
 * @param {Window} win - The dialog window.
 * @param {boolean} enabled - Expected enabled state.
 */
function assertControlsEnabled(win, enabled) {
  for (const id of ["number", "markread"]) {
    Assert.equal(
      win.document.getElementById(id).disabled,
      !enabled,
      `${id} should be ${enabled ? "enabled" : "disabled"}`
    );
  }
}

/**
 * Replaces the header count with keyboard input.
 *
 * @param {Window} win - The dialog window.
 * @param {number} count - The new header count.
 */
function setHeaderCount(win, count) {
  win.document.getElementById("number").focus();
  EventUtils.synthesizeKey("a", { accelKey: true }, win);
  EventUtils.sendString(String(count), win);
}

add_task(async function test_switchChoicesAndCancel() {
  server.maxArticles = 500;
  server.markOldRead = false;
  const range = await withDownloadDialog("test.cancel", 10000, win => {
    assertSettings(win, 500, false);
    const doc = win.document;
    setHeaderCount(win, 250);
    EventUtils.synthesizeMouseAtCenter(doc.getElementById("markread"), {}, win);

    EventUtils.synthesizeMouseAtCenter(doc.getElementById("all"), {}, win);
    Assert.ok(
      doc.getElementById("all").selected,
      "Clicking all should select downloading all headers"
    );
    assertControlsEnabled(win, false);

    EventUtils.synthesizeMouseAtCenter(doc.getElementById("some"), {}, win);
    assertSettings(win, 250, true);
    return "cancel";
  });
  Assert.deepEqual(range, [], "Cancelling should prevent downloading headers");
  Assert.equal(
    server.maxArticles,
    500,
    "Cancelling should preserve the saved header count"
  );
  Assert.ok(
    !server.markOldRead,
    "Cancelling should preserve the saved mark as read setting"
  );
});

add_task(async function test_downloadSomeAndSaveSettings() {
  for (const markOldRead of [true, false]) {
    server.maxArticles = 500;
    server.markOldRead = !markOldRead;
    const range = await withDownloadDialog(
      `test.some.${markOldRead}`,
      10000,
      win => {
        assertSettings(win, 500, !markOldRead);
        setHeaderCount(win, 250);
        EventUtils.synthesizeMouseAtCenter(
          win.document.getElementById("markread"),
          {},
          win
        );
        return "accept";
      }
    );
    Assert.deepEqual(
      range,
      [9751, 10000],
      "Accepting a limited download should request the latest 250 headers"
    );
    Assert.equal(
      server.maxArticles,
      250,
      "Accepting should save the header count"
    );
    Assert.equal(
      server.markOldRead,
      markOldRead,
      "Accepting should save the mark as read setting"
    );

    await withDownloadDialog(`test.saved.${markOldRead}`, 10000, win => {
      assertSettings(win, 250, markOldRead);
    });
  }
});

add_task(async function test_downloadAll() {
  for (const markOldRead of [false, true]) {
    server.maxArticles = 500;
    server.markOldRead = markOldRead;
    const range = await withDownloadDialog(
      `test.all.${markOldRead}`,
      10000,
      win => {
        assertSettings(win, 500, markOldRead);
        EventUtils.synthesizeMouseAtCenter(
          win.document.getElementById("all"),
          {},
          win
        );
        assertControlsEnabled(win, false);
        return "accept";
      }
    );
    Assert.deepEqual(
      range,
      [1, 10000],
      "Downloading all should request every available header"
    );
    Assert.equal(
      server.maxArticles,
      500,
      "Downloading all should preserve the saved limit for future downloads"
    );
    Assert.equal(
      server.markOldRead,
      markOldRead,
      "Downloading all should preserve the disabled mark as read setting"
    );
  }
});
