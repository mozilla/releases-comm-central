/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that sending a message updates the taskbar progress meter.
 */

const { MockRegistrar } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistrar.sys.mjs"
);

const gProgressEvents = [];
let smtpServer, smtpIdentity;

add_setup(async function () {
  smtpServer = await ServerTestUtils.createServer(
    ServerTestUtils.serverDefs.smtp.plain
  );

  let smtpAccount, smtpOutgoingServer;
  ({ smtpAccount, smtpIdentity, smtpOutgoingServer } = createSMTPAccount());
  smtpIdentity.fullName = "Bart Simpson";
  await addLoginInfo("smtp://test.test", "user", "password");

  let mockTaskbar;
  if (AppConstants.platform == "win") {
    mockTaskbar = MockRegistrar.register("@mozilla.org/windows-taskbar;1", {
      QueryInterface: ChromeUtils.generateQI(["nsIWinTaskbar"]),
      get available() {
        return true;
      },
      getTaskbarProgress(docShell) {
        return {
          QueryInterface: ChromeUtils.generateQI(["nsITaskbarProgress"]),
          setProgressState(state, current, maximum) {
            gProgressEvents.push({
              windowId: docShell.outerWindowID,
              state,
              current,
              maximum,
            });
          },
        };
      },
    });
  } else if (AppConstants.platform == "macosx") {
    mockTaskbar = MockRegistrar.register(
      "@mozilla.org/widget/macdocksupport;1",
      {
        QueryInterface: ChromeUtils.generateQI(["nsITaskbarProgress"]),
        setProgressState(state, current, maximum) {
          gProgressEvents.push({ state, current, maximum });
        },
      }
    );
  } else if (AppConstants.platform == "linux") {
    mockTaskbar = MockRegistrar.register(
      "@mozilla.org/widget/taskbarprogress/gtk;1",
      {
        QueryInterface: ChromeUtils.generateQI(["nsIGtkTaskbarProgress"]),
        setProgressState(state, current, maximum) {
          gProgressEvents.push({
            windowId: this._currentWindowId,
            state,
            current,
            maximum,
          });
        },
        setPrimaryWindow(win) {
          this._currentWindowId = win.docShell.outerWindowID;
        },
      }
    );
  }

  registerCleanupFunction(async function () {
    smtpOutgoingServer.closeCachedConnections();

    MailServices.accounts.removeAccount(smtpAccount, false);
    Services.logins.removeAllLogins();

    MockRegistrar.unregister(mockTaskbar);
  });
});

add_task(async function () {
  const { composeWindow } = await newComposeWindow(
    smtpIdentity,
    // We need enough data to get more than one progress report. Each chunk is
    // 65536 bytes, so this is plenty.
    "I will not waste chalk.\n".repeat(6000)
  );
  const windowId = composeWindow.docShell.outerWindowID;
  const composeDocument = composeWindow.document;
  const toolbarButton = composeDocument.getElementById("button-send");

  Assert.ok(!toolbarButton.disabled, "toolbar button should not be disabled");
  EventUtils.synthesizeMouseAtCenter(toolbarButton, {}, composeWindow);

  await BrowserTestUtils.domWindowClosed(composeWindow);

  const progressEventCount = gProgressEvents.length;
  let previous = 0;
  Assert.greaterOrEqual(
    progressEventCount,
    2,
    "at least two progress events should have occurred"
  );
  for (let i = 0; i < progressEventCount; i++) {
    const progressEvent = gProgressEvents[i];
    if ("windowId" in progressEvent) {
      // Not on macOS.
      Assert.equal(
        progressEvent.windowId,
        windowId,
        "progress events should be on the compose window"
      );
    }
    if (i < progressEventCount - 1) {
      Assert.equal(
        progressEvent.state,
        Ci.nsITaskbarProgress.STATE_NORMAL,
        `event ${i} must be in the normal state`
      );
      Assert.greater(
        progressEvent.current,
        previous,
        `event ${i} must have a sane current value`
      );
      Assert.lessOrEqual(
        progressEvent.current,
        progressEvent.maximum,
        `event ${i} must have a sane current value`
      );
      previous = progressEvent.current;
    } else {
      Assert.equal(
        progressEvent.state,
        Ci.nsITaskbarProgress.STATE_NO_PROGRESS,
        `event ${i} must be in the no progress state`
      );
      Assert.equal(
        progressEvent.current,
        0,
        `event ${i} must have no current value`
      );
      Assert.equal(
        progressEvent.maximum,
        0,
        `event ${i} must have no maximum value`
      );
    }
  }
});
