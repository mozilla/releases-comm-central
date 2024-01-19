/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async () => {
  await testCheckboxes(
    "panePrivacy",
    "privacyCategory",
    {
      checkboxID: "acceptRemoteContent",
      pref: "mailnews.message_display.disable_remote_image",
      prefValues: [true, false],
    },
    {
      checkboxID: "keepHistory",
      pref: "places.history.enabled",
    },
    {
      checkboxID: "acceptCookies",
      pref: "network.cookie.cookieBehavior",
      prefValues: [2, 0],
      enabledElements: ["#acceptThirdPartyMenu"],
      unaffectedElements: ["#cookieExceptions"],
    },
    {
      checkboxID: "privacyDoNotTrackCheckbox",
      pref: "privacy.donottrackheader.enabled",
    }
  );
});

add_task(async () => {
  await testCheckboxes(
    "panePrivacy",
    "privacyJunkCategory",
    {
      checkboxID: "manualMark",
      pref: "mail.spam.manualMark",
      enabledElements: ["#manualMarkMode radio"],
    },
    {
      checkboxID: "markAsReadOnSpam",
      pref: "mail.spam.markAsReadOnSpam",
    },
    {
      checkboxID: "enableJunkLogging",
      pref: "mail.spam.logging.enabled",
      enabledElements: ["#openJunkLogButton"],
    }
  );

  await testCheckboxes("panePrivacy", "privacySecurityCategory", {
    checkboxID: "enablePhishingDetector",
    pref: "mail.phishing.detection.enabled",
  });

  await testCheckboxes("panePrivacy", "enableAntiVirusQuarantine", {
    checkboxID: "enableAntiVirusQuarantine",
    pref: "mailnews.downloadToTempFile",
  });
});

add_task(async () => {
  Services.prefs.setBoolPref("mail.spam.manualMark", true);

  await testRadioButtons("panePrivacy", "privacyJunkCategory", {
    pref: "mail.spam.manualMarkMode",
    states: [
      {
        id: "manualMarkMode0",
        prefValue: 0,
      },
      {
        id: "manualMarkMode1",
        prefValue: 1,
      },
    ],
  });
});

add_task(async () => {
  // Telemetry pref is locked.
  // await testCheckboxes("paneAdvanced", undefined, {
  //   checkboxID: "submitTelemetryBox",
  //   pref: "toolkit.telemetry.enabled",
  // });

  await testCheckboxes("panePrivacy", "enableOCSP", {
    checkboxID: "enableOCSP",
    pref: "security.OCSP.enabled",
    prefValues: [0, 1],
  });
});

// Here we'd test the update choices, but I don't want to go near that.
add_task(async () => {
  await testRadioButtons("panePrivacy", "enableOCSP", {
    pref: "security.default_personal_cert",
    states: [
      {
        id: "certSelectionAuto",
        prefValue: "Select Automatically",
      },
      {
        id: "certSelectionAsk",
        prefValue: "Ask Every Time",
      },
    ],
  });
});

add_task(async function testRemoteContentDialog() {
  const { prefsDocument, prefsWindow } = await openNewPrefsTab("panePrivacy");

  let dialogPromise = BrowserTestUtils.promiseAlertDialogOpen(
    undefined,
    "chrome://messenger/content/preferences/permissions.xhtml",
    {
      isSubDialog: true,
      async callback(dialogWindow) {
        await TestUtils.waitForCondition(
          () => Services.focus.focusedWindow == dialogWindow,
          "waiting for subdialog to be focused"
        );

        const dialogDocument = dialogWindow.document;
        const url = dialogDocument.getElementById("url");
        const permissionsTree =
          dialogDocument.getElementById("permissionsTree");

        EventUtils.sendString("accept.invalid", dialogWindow);
        EventUtils.synthesizeMouseAtCenter(
          dialogDocument.getElementById("btnAllow"),
          {},
          dialogWindow
        );
        await new Promise(f => setTimeout(f));
        Assert.equal(url.value, "", "url input should be cleared");
        Assert.equal(
          permissionsTree.view.rowCount,
          1,
          "new entry should be added to list"
        );

        Assert.ok(
          BrowserTestUtils.isHidden(
            dialogDocument.getElementById("btnSession")
          ),
          "session button should be hidden"
        );

        EventUtils.sendString("block.invalid", dialogWindow);
        EventUtils.synthesizeMouseAtCenter(
          dialogDocument.getElementById("btnBlock"),
          {},
          dialogWindow
        );
        await new Promise(f => setTimeout(f));
        Assert.equal(url.value, "", "url input should be cleared");
        Assert.equal(
          permissionsTree.view.rowCount,
          2,
          "new entry should be added to list"
        );

        EventUtils.synthesizeMouseAtCenter(
          dialogDocument.getElementById("btnApplyChanges"),
          {},
          dialogWindow
        );
      },
    }
  );
  const remoteContentExceptions = prefsDocument.getElementById(
    "remoteContentExceptions"
  );
  EventUtils.synthesizeMouseAtCenter(remoteContentExceptions, {}, prefsWindow);
  await dialogPromise;

  // eslint-disable-next-line @microsoft/sdl/no-insecure-url
  const acceptURI = Services.io.newURI("http://accept.invalid/");
  const acceptPrincipal = Services.scriptSecurityManager.createContentPrincipal(
    acceptURI,
    {}
  );
  Assert.equal(
    Services.perms.testPermissionFromPrincipal(acceptPrincipal, "image"),
    Ci.nsIPermissionManager.ALLOW_ACTION,
    "accept permission should exist for accept.invalid"
  );

  // eslint-disable-next-line @microsoft/sdl/no-insecure-url
  const blockURI = Services.io.newURI("http://block.invalid/");
  const blockPrincipal = Services.scriptSecurityManager.createContentPrincipal(
    blockURI,
    {}
  );
  Assert.equal(
    Services.perms.testPermissionFromPrincipal(blockPrincipal, "image"),
    Ci.nsIPermissionManager.DENY_ACTION,
    "block permission should exist for block.invalid"
  );

  dialogPromise = BrowserTestUtils.promiseAlertDialogOpen(
    undefined,
    "chrome://messenger/content/preferences/permissions.xhtml",
    {
      isSubDialog: true,
      async callback(dialogWindow) {
        await TestUtils.waitForCondition(
          () => Services.focus.focusedWindow == dialogWindow,
          "waiting for subdialog to be focused"
        );

        const dialogDocument = dialogWindow.document;
        const permissionsTree =
          dialogDocument.getElementById("permissionsTree");

        Assert.equal(
          permissionsTree.view.rowCount,
          2,
          "list should be populated"
        );

        permissionsTree.view.selection.select(0);
        EventUtils.synthesizeMouseAtCenter(
          dialogDocument.getElementById("removePermission"),
          {},
          dialogWindow
        );
        Assert.equal(
          permissionsTree.view.rowCount,
          1,
          "row should be removed from list"
        );

        EventUtils.synthesizeMouseAtCenter(
          dialogDocument.getElementById("removeAllPermissions"),
          {},
          dialogWindow
        );
        Assert.equal(
          permissionsTree.view.rowCount,
          0,
          "row should be removed from list"
        );

        EventUtils.synthesizeMouseAtCenter(
          dialogDocument.getElementById("btnApplyChanges"),
          {},
          dialogWindow
        );
      },
    }
  );
  EventUtils.synthesizeMouseAtCenter(remoteContentExceptions, {}, prefsWindow);
  await dialogPromise;

  Assert.equal(
    Services.perms.testPermissionFromPrincipal(acceptPrincipal, "image"),
    Ci.nsIPermissionManager.UNKNOWN_ACTION,
    "permission should be removed for accept.invalid"
  );
  Assert.equal(
    Services.perms.testPermissionFromPrincipal(blockPrincipal, "image"),
    Ci.nsIPermissionManager.UNKNOWN_ACTION,
    "permission should be removed for block.invalid"
  );

  await closePrefsTab();
});

add_task(async function testCookiesDialog() {
  const { prefsDocument, prefsWindow } = await openNewPrefsTab("panePrivacy");

  let dialogPromise = BrowserTestUtils.promiseAlertDialogOpen(
    undefined,
    "chrome://messenger/content/preferences/permissions.xhtml",
    {
      isSubDialog: true,
      async callback(dialogWindow) {
        await TestUtils.waitForCondition(
          () => Services.focus.focusedWindow == dialogWindow,
          "waiting for subdialog to be focused"
        );

        const dialogDocument = dialogWindow.document;
        const url = dialogDocument.getElementById("url");
        const permissionsTree =
          dialogDocument.getElementById("permissionsTree");

        EventUtils.sendString("accept.invalid", dialogWindow);
        EventUtils.synthesizeMouseAtCenter(
          dialogDocument.getElementById("btnAllow"),
          {},
          dialogWindow
        );
        await new Promise(f => setTimeout(f));
        Assert.equal(url.value, "", "url input should be cleared");
        Assert.equal(
          permissionsTree.view.rowCount,
          1,
          "new entry should be added to list"
        );

        EventUtils.sendString("session.invalid", dialogWindow);
        EventUtils.synthesizeMouseAtCenter(
          dialogDocument.getElementById("btnSession"),
          {},
          dialogWindow
        );
        await new Promise(f => setTimeout(f));
        Assert.equal(url.value, "", "url input should be cleared");
        Assert.equal(
          permissionsTree.view.rowCount,
          2,
          "new entry should be added to list"
        );

        EventUtils.sendString("block.invalid", dialogWindow);
        EventUtils.synthesizeMouseAtCenter(
          dialogDocument.getElementById("btnBlock"),
          {},
          dialogWindow
        );
        await new Promise(f => setTimeout(f));
        Assert.equal(url.value, "", "url input should be cleared");
        Assert.equal(
          permissionsTree.view.rowCount,
          3,
          "new entry should be added to list"
        );

        EventUtils.synthesizeMouseAtCenter(
          dialogDocument.getElementById("btnApplyChanges"),
          {},
          dialogWindow
        );
      },
    }
  );
  const cookieExceptions = prefsDocument.getElementById("cookieExceptions");
  EventUtils.synthesizeMouseAtCenter(cookieExceptions, {}, prefsWindow);
  await dialogPromise;

  // eslint-disable-next-line @microsoft/sdl/no-insecure-url
  const acceptURI = Services.io.newURI("http://accept.invalid/");
  const acceptPrincipal = Services.scriptSecurityManager.createContentPrincipal(
    acceptURI,
    {}
  );
  Assert.equal(
    Services.perms.testPermissionFromPrincipal(acceptPrincipal, "cookie"),
    Ci.nsIPermissionManager.ALLOW_ACTION,
    "accept permission should exist for accept.invalid"
  );

  // eslint-disable-next-line @microsoft/sdl/no-insecure-url
  const sessionURI = Services.io.newURI("http://session.invalid/");
  const sessionPrincipal =
    Services.scriptSecurityManager.createContentPrincipal(sessionURI, {});
  Assert.equal(
    Services.perms.testPermissionFromPrincipal(sessionPrincipal, "cookie"),
    Ci.nsICookiePermission.ACCESS_SESSION,
    "session permission should exist for session.invalid"
  );

  // eslint-disable-next-line @microsoft/sdl/no-insecure-url
  const blockURI = Services.io.newURI("http://block.invalid/");
  const blockPrincipal = Services.scriptSecurityManager.createContentPrincipal(
    blockURI,
    {}
  );
  Assert.equal(
    Services.perms.testPermissionFromPrincipal(blockPrincipal, "cookie"),
    Ci.nsIPermissionManager.DENY_ACTION,
    "block permission should exist for block.invalid"
  );

  dialogPromise = BrowserTestUtils.promiseAlertDialogOpen(
    undefined,
    "chrome://messenger/content/preferences/permissions.xhtml",
    {
      isSubDialog: true,
      async callback(dialogWindow) {
        await TestUtils.waitForCondition(
          () => Services.focus.focusedWindow == dialogWindow,
          "waiting for subdialog to be focused"
        );

        const dialogDocument = dialogWindow.document;
        const permissionsTree =
          dialogDocument.getElementById("permissionsTree");

        Assert.equal(
          permissionsTree.view.rowCount,
          3,
          "list should be populated"
        );

        permissionsTree.view.selection.select(0);
        EventUtils.synthesizeMouseAtCenter(
          dialogDocument.getElementById("removePermission"),
          {},
          dialogWindow
        );
        Assert.equal(
          permissionsTree.view.rowCount,
          2,
          "row should be removed from list"
        );

        EventUtils.synthesizeMouseAtCenter(
          dialogDocument.getElementById("removeAllPermissions"),
          {},
          dialogWindow
        );
        Assert.equal(
          permissionsTree.view.rowCount,
          0,
          "row should be removed from list"
        );

        EventUtils.synthesizeMouseAtCenter(
          dialogDocument.getElementById("btnApplyChanges"),
          {},
          dialogWindow
        );
      },
    }
  );
  EventUtils.synthesizeMouseAtCenter(cookieExceptions, {}, prefsWindow);
  await dialogPromise;

  Assert.equal(
    Services.perms.testPermissionFromPrincipal(acceptPrincipal, "cookie"),
    Ci.nsIPermissionManager.UNKNOWN_ACTION,
    "permission should be removed for accept.invalid"
  );
  Assert.equal(
    Services.perms.testPermissionFromPrincipal(sessionPrincipal, "cookie"),
    Ci.nsIPermissionManager.UNKNOWN_ACTION,
    "permission should be removed for session.invalid"
  );
  Assert.equal(
    Services.perms.testPermissionFromPrincipal(blockPrincipal, "cookie"),
    Ci.nsIPermissionManager.UNKNOWN_ACTION,
    "permission should be removed for block.invalid"
  );

  await closePrefsTab();
});
