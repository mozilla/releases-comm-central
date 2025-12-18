/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { clearStatusBar } = ChromeUtils.importESModule(
  "resource://testing-common/mail/CleanupHelpers.sys.mjs"
);

/**
 * Helper to add logins to the login manager.
 *
 * @param {string} hostname
 * @param {string} username
 * @param {string} password
 */
async function addLoginInfo(hostname, username, password) {
  const loginInfo = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(
    Ci.nsILoginInfo
  );
  loginInfo.init(hostname, null, hostname, username, password, "", "");
  await Services.logins.addLoginAsync(loginInfo);
}

/**
 * Opens a .eml file in a standalone message window and waits for it to load.
 *
 * @param {nsIFile} file - The file to open.
 */
async function openMessageFromFile(file) {
  const fileURL = Services.io
    .newFileURI(file)
    .mutate()
    .setQuery("type=application/x-message-display")
    .finalize();

  const winPromise = BrowserTestUtils.domWindowOpenedAndLoaded();
  window.openDialog(
    "chrome://messenger/content/messageWindow.xhtml",
    "_blank",
    "all,chrome,dialog=no,status,toolbar",
    fileURL
  );
  const win = await winPromise;
  await messageLoadedIn(win.messageBrowser);
  await TestUtils.waitForCondition(() => Services.focus.activeWindow == win);
  return win;
}

/**
 * Wait for a message to be fully loaded in the given about:message.
 *
 * @param {browser} aboutMessageBrowser - The browser for the about:message
 *   window displaying the message.
 */
async function messageLoadedIn(aboutMessageBrowser) {
  await TestUtils.waitForCondition(
    () =>
      aboutMessageBrowser.contentDocument.readyState == "complete" &&
      aboutMessageBrowser.currentURI.spec == "about:message"
  );
  await TestUtils.waitForCondition(
    () => aboutMessageBrowser.contentWindow.msgLoaded,
    "waiting for message to be loaded"
  );
  // We need to be sure the ContextMenu actors are ready before trying to open a
  // context menu from the message. I can't find a way to be sure, so let's wait.
  await new Promise(resolve => setTimeout(resolve, 500));
}

/**
 * Wait for network connections to become idle.
 *
 * @param {nsIMsgIncomingServer} server - The server with connections to wait for.
 */
async function promiseServerIdle(server) {
  if (server.type == "imap") {
    server.QueryInterface(Ci.nsIImapIncomingServer);
    await TestUtils.waitForCondition(
      () => server.allConnectionsIdle,
      "waiting for IMAP connection to become idle"
    );
  } else if (server.type == "pop3") {
    await TestUtils.waitForCondition(
      () => !server.wrappedJSObject.runningClient,
      "waiting for POP3 connection to become idle"
    );
  } else if (server.type == "nntp") {
    await TestUtils.waitForCondition(
      () => server.wrappedJSObject._busyConnections.length == 0,
      "waiting for NNTP connection to become idle"
    );
  }

  await clearStatusBar(window);
}

// Report and remove any remaining accounts/servers. If we register a cleanup
// function here, it will run before any other cleanup function has had a
// chance to run. Instead, when it runs register another cleanup function
// which will run last.
registerCleanupFunction(function () {
  registerCleanupFunction(async function () {
    Services.prefs.clearUserPref("mail.pane_config.dynamic");
    Services.prefs.clearUserPref("mail.threadpane.listview");

    const tabmail = document.getElementById("tabmail");
    if (tabmail.tabInfo.length > 1) {
      Assert.report(
        true,
        undefined,
        undefined,
        "Unexpected tab(s) open at the end of the test run"
      );
      tabmail.closeOtherTabs(0);
    }

    for (const server of MailServices.accounts.allServers) {
      Assert.report(
        true,
        undefined,
        undefined,
        `Found server ${server.key} at the end of the test run`
      );
      MailServices.accounts.removeIncomingServer(server, false);
    }
    for (const account of MailServices.accounts.accounts) {
      Assert.report(
        true,
        undefined,
        undefined,
        `Found account ${account.key} at the end of the test run`
      );
      MailServices.accounts.removeAccount(account, false);
    }

    await clearStatusBar(window);

    // Some tests that open new windows confuse mochitest, which waits for a
    // focus event on the main window, and the test times out. If we focus a
    // different window (browser-harness.xhtml should be the only other window
    // at this point) then mochitest gets its focus event and the test ends.
    await SimpleTest.promiseFocus([...Services.wm.getEnumerator(null)][1]);
  });
});
