/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
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

  await clearStatusBar();
}

/**
 * Stop anything active in the status bar and clear the status text.
 */
async function clearStatusBar() {
  const status = window.MsgStatusFeedback;
  try {
    await TestUtils.waitForCondition(
      () =>
        !status._startTimeoutID &&
        !status._meteorsSpinning &&
        !status._stopTimeoutID,
      "waiting for meteors to stop spinning"
    );
  } catch (ex) {
    // If the meteors don't stop spinning within 5 seconds, something has got
    // confused somewhere and they'll probably keep spinning forever.
    // Reset and hope we can continue without more problems.
    Assert.ok(!status._startTimeoutID, "meteors should not have a start timer");
    Assert.ok(!status._meteorsSpinning, "meteors should not be spinning");
    Assert.ok(!status._stopTimeoutID, "meteors should not have a stop timer");
    if (status._startTimeoutID) {
      clearTimeout(status._startTimeoutID);
      status._startTimeoutID = null;
    }
    if (status._stopTimeoutID) {
      clearTimeout(status._stopTimeoutID);
      status._stopTimeoutID = null;
    }
    status._stopMeteors();
  }

  Assert.ok(
    BrowserTestUtils.isHidden(status._progressBar),
    "progress bar should not be visible"
  );
  Assert.ok(
    status._progressBar.hasAttribute("value"),
    "progress bar should not be in the indeterminate state"
  );
  if (BrowserTestUtils.isVisible(status._progressBar)) {
    // Somehow the progress bar is still visible and probably in the
    // indeterminate state, meaning vsync timers are still active. Reset it.
    status._stopMeteors();
  }

  Assert.equal(
    status._startRequests,
    0,
    "status bar should not have any start requests"
  );
  Assert.equal(
    status._activeProcesses.length,
    0,
    "status bar should not have any active processes"
  );
  status._startRequests = 0;
  status._activeProcesses.length = 0;

  if (status._statusIntervalId) {
    clearInterval(status._statusIntervalId);
    delete status._statusIntervalId;
  }
  status._statusText.value = "";
  status._statusLastShown = 0;
  status._statusQueue.length = 0;
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

    await clearStatusBar();

    // Some tests that open new windows confuse mochitest, which waits for a
    // focus event on the main window, and the test times out. If we focus a
    // different window (browser-harness.xhtml should be the only other window
    // at this point) then mochitest gets its focus event and the test ends.
    await SimpleTest.promiseFocus([...Services.wm.getEnumerator(null)][1]);
  });
});
