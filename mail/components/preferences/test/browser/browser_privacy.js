/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { OSKeyStore } = ChromeUtils.importESModule(
  "resource://gre/modules/OSKeyStore.sys.mjs"
);
const { OSKeyStoreTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/OSKeyStoreTestUtils.sys.mjs"
);

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

/**
 * Tests the remote content dialog.
 */
add_task(async function testRemoteContentDialog() {
  const { prefsDocument } = await openNewPrefsTab("panePrivacy");

  const remoteContentExceptions = prefsDocument.getElementById(
    "remoteContentExceptions"
  );
  await promiseSubDialog(
    remoteContentExceptions,
    "chrome://messenger/content/preferences/permissions.xhtml",
    async function (dialogWindow) {
      const dialogDocument = dialogWindow.document;
      const url = dialogDocument.getElementById("url");
      const permissionsTree = dialogDocument.getElementById("permissionsTree");

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
        BrowserTestUtils.isHidden(dialogDocument.getElementById("btnSession")),
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
    },
    "btnApplyChanges"
  );

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

  await promiseSubDialog(
    remoteContentExceptions,
    "chrome://messenger/content/preferences/permissions.xhtml",
    async function (dialogWindow) {
      const dialogDocument = dialogWindow.document;
      const permissionsTree = dialogDocument.getElementById("permissionsTree");

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
    },
    "btnApplyChanges"
  );

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

/**
 * Tests the cookies dialogs.
 */
add_task(async function testCookiesDialog() {
  const { prefsDocument } = await openNewPrefsTab(
    "panePrivacy",
    "privacyCategory"
  );

  const cookieExceptions = prefsDocument.getElementById("cookieExceptions");
  await promiseSubDialog(
    cookieExceptions,
    "chrome://messenger/content/preferences/permissions.xhtml",
    async function (dialogWindow) {
      const dialogDocument = dialogWindow.document;
      const url = dialogDocument.getElementById("url");
      const permissionsTree = dialogDocument.getElementById("permissionsTree");

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
    },
    "btnApplyChanges"
  );

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

  await promiseSubDialog(
    cookieExceptions,
    "chrome://messenger/content/preferences/permissions.xhtml",
    async function (dialogWindow) {
      const dialogDocument = dialogWindow.document;
      const permissionsTree = dialogDocument.getElementById("permissionsTree");

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
    },
    "btnApplyChanges"
  );

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

  await promiseSubDialog(
    prefsDocument.getElementById("showCookiesButton"),
    "chrome://messenger/content/preferences/cookies.xhtml",
    () => {},
    "closeButton"
  );
  await closePrefsTab();
});

async function subtestPasswordManager(prefsDocument, primaryPassword = "") {
  for (const [origin, realm, username, password] of [
    ["https://example.com", "realm", "username", "password"],
    ["https://example.org", "realm", "username", "password"],
    ["https://caldav.test.test", "caldav:write", "user", "test1234"],
    ["https://carddav.test.test", "carddav:write", "user", "test1234"],
    ["imap://imap.test.test", "imap://imap.test.test", "user", "test1234"],
    ["smtp://smtp.test.test", "smtp://smtp.test.test", "user", "test1234"],
  ]) {
    const loginInfo = Cc[
      "@mozilla.org/login-manager/loginInfo;1"
    ].createInstance(Ci.nsILoginInfo);
    loginInfo.init(origin, null, realm, username, password, "", "");
    await Services.logins.addLoginAsync(loginInfo);
  }

  await promiseSubDialog(
    prefsDocument.getElementById("showPasswords"),
    "chrome://messenger/content/preferences/passwordManager.xhtml",
    async dialogWindow => {
      const dialogDocument = dialogWindow.document;
      const filterInput = dialogDocument.getElementById("filter");
      const tree = dialogDocument.getElementById("signonsTree");
      const passwordColumn = tree.columns.passwordCol;
      const removeButton = dialogDocument.getElementById("removeSignon");
      const removeAllButton = dialogDocument.getElementById("removeAllSignons");
      const showPasswordButton =
        dialogDocument.getElementById("togglePasswords");

      // Sanity check.

      await TestUtils.waitForCondition(
        () => tree.view.rowCount,
        "waiting for tree to be populated"
      );
      Assert.equal(filterInput.value, "", "filter value should be cleared");
      Assert.equal(tree.view.rowCount, 6, "all logins should be displayed");
      Assert.ok(removeButton.disabled, "remove button should be disabled");
      Assert.ok(
        !removeAllButton.disabled,
        "remove all button should be enabled"
      );
      Assert.equal(
        removeAllButton.dataset.l10nId,
        "remove-all",
        "remove all button should have the right label"
      );

      // Test filtering.

      Assert.equal(
        dialogDocument.activeElement,
        filterInput,
        "filter input should have focus"
      );
      EventUtils.sendString("test", dialogWindow);
      EventUtils.synthesizeKey("KEY_Enter", {}, dialogWindow);
      Assert.equal(
        tree.view.rowCount,
        4,
        "only logins matching the filter should be displayed"
      );
      Assert.ok(removeButton.disabled, "remove button should be disabled");
      Assert.ok(
        !removeAllButton.disabled,
        "remove all button should be enabled"
      );
      Assert.equal(
        removeAllButton.dataset.l10nId,
        "remove-all-shown",
        "remove all button should have the right label"
      );

      Assert.equal(
        dialogDocument.activeElement,
        filterInput,
        "filter input should have focus"
      );
      EventUtils.synthesizeKey("KEY_Escape", {}, dialogWindow);
      await TestUtils.waitForCondition(
        () => removeAllButton.dataset.l10nId == "remove-all",
        "waiting for tree to repopulate"
      );
      Assert.equal(filterInput.value, "", "filter value should be cleared");
      Assert.equal(tree.view.rowCount, 6, "all logins should be displayed");
      Assert.ok(removeButton.disabled, "remove button should be disabled");
      Assert.ok(
        !removeAllButton.disabled,
        "remove all button should be enabled"
      );
      Assert.equal(
        removeAllButton.dataset.l10nId,
        "remove-all",
        "remove all button should have the right label"
      );

      Assert.equal(
        dialogDocument.activeElement,
        filterInput,
        "filter input should have focus"
      );
      EventUtils.sendString("example", dialogWindow);
      EventUtils.synthesizeKey("KEY_Enter", {}, dialogWindow);
      Assert.equal(
        tree.view.rowCount,
        2,
        "only logins matching the filter should be displayed"
      );
      Assert.ok(removeButton.disabled, "remove button should be disabled");
      Assert.ok(
        !removeAllButton.disabled,
        "remove all button should be enabled"
      );
      Assert.equal(
        removeAllButton.dataset.l10nId,
        "remove-all-shown",
        "remove all button should have the right label"
      );

      // Test selecting and removing a password.

      tree.view.selection.select(0);
      Assert.ok(!removeButton.disabled, "remove button should be enabled");
      Assert.ok(
        !removeAllButton.disabled,
        "remove all button should be enabled"
      );

      EventUtils.synthesizeMouseAtCenter(removeButton, {}, dialogWindow);
      await TestUtils.waitForCondition(
        () => tree.view.rowCount == 1,
        "waiting for tree to be updated"
      );
      Assert.equal(
        (await Services.logins.getAllLogins()).length,
        5,
        "login should have been removed"
      );

      // Clear the filter.

      await TestUtils.waitForTick();
      EventUtils.synthesizeMouseAtCenter(filterInput, {}, dialogWindow);
      EventUtils.synthesizeKey("KEY_Escape", {}, dialogWindow);
      await TestUtils.waitForCondition(
        () => removeAllButton.dataset.l10nId == "remove-all",
        "waiting for tree to repopulate"
      );
      Assert.equal(filterInput.value, "", "filter value should be cleared");
      Assert.equal(
        tree.view.rowCount,
        5,
        "all remaining logins should be displayed"
      );
      Assert.equal(
        removeAllButton.dataset.l10nId,
        "remove-all",
        "remove all button should have the right label"
      );
      Assert.ok(removeButton.disabled, "remove button should be disabled");
      Assert.ok(
        !removeAllButton.disabled,
        "remove all button should be enabled"
      );

      // Test the show/hide passwords toggle.

      if (primaryPassword || OSKeyStoreTestUtils.canTestOSKeyStoreLogin()) {
        Assert.ok(
          passwordColumn.element.hidden,
          "passwords column should be hidden"
        );
        Assert.equal(
          showPasswordButton.dataset.l10nId,
          "show-passwords",
          "toggle passwords button should have the right label"
        );

        function promiseAlertDialog(buttonName) {
          // If there's a primary password set, we should be asked for it.
          // If there isn't, and we can't ask the OS for authentication, we
          // should be asked if the user really wants to show passwords.
          // Both of these cases use commonDialog.xhtml, so this function
          // checks that the right question was asked by seeing if the
          // password field is visible.
          return BrowserTestUtils.promiseAlertDialog(undefined, undefined, {
            callback(win) {
              const doc = win.document;
              const passwordInput = doc.getElementById("password1Textbox");
              if (primaryPassword) {
                Assert.ok(
                  BrowserTestUtils.isVisible(passwordInput),
                  "password input should be visible"
                );
                Assert.equal(
                  doc.activeElement,
                  passwordInput,
                  "password input should have focus"
                );
                if (buttonName == "accept") {
                  EventUtils.sendString(primaryPassword, win);
                }
              } else {
                Assert.ok(
                  BrowserTestUtils.isHidden(passwordInput),
                  "password input should not be visible"
                );
              }
              doc.querySelector("dialog").getButton(buttonName).click();
            },
          });
        }

        const cancelPromise =
          OSKeyStore.canReauth() && !primaryPassword
            ? OSKeyStoreTestUtils.waitForOSKeyStoreLogin(false)
            : promiseAlertDialog("cancel");
        EventUtils.synthesizeMouseAtCenter(
          showPasswordButton,
          {},
          dialogWindow
        );
        await cancelPromise;
        await SimpleTest.promiseFocus(dialogWindow);

        // Wait to prove nothing happened.
        // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
        await new Promise(resolve => setTimeout(resolve, 1000));
        Assert.ok(
          passwordColumn.element.hidden,
          "passwords column should be hidden"
        );
        Assert.equal(
          showPasswordButton.dataset.l10nId,
          "show-passwords",
          "toggle passwords button should have the right label"
        );

        const acceptPromise =
          OSKeyStore.canReauth() && !primaryPassword
            ? OSKeyStoreTestUtils.waitForOSKeyStoreLogin(true)
            : promiseAlertDialog("accept");
        EventUtils.synthesizeMouseAtCenter(
          showPasswordButton,
          {},
          dialogWindow
        );
        await acceptPromise;
        await SimpleTest.promiseFocus(dialogWindow);

        await TestUtils.waitForCondition(
          () => !passwordColumn.element.hidden,
          "waiting for the passwords to be shown"
        );
        Assert.ok(
          !passwordColumn.element.hidden,
          "passwords column should be shown"
        );
        Assert.equal(
          showPasswordButton.dataset.l10nId,
          "hide-passwords",
          "toggle passwords button should have the right label"
        );

        EventUtils.synthesizeMouseAtCenter(
          showPasswordButton,
          {},
          dialogWindow
        );

        await TestUtils.waitForCondition(
          () => passwordColumn.element.hidden,
          "waiting for the passwords to be shown"
        );
        Assert.ok(
          passwordColumn.element.hidden,
          "passwords column should be hidden"
        );
        Assert.equal(
          showPasswordButton.dataset.l10nId,
          "show-passwords",
          "toggle passwords button should have the right label"
        );
      } else {
        // Some builds intentionally don't test key store logins.
        // See OSKeyStoreTestUtils.sys.mjs for why.
        info(
          "Showing passwords column not tested. This should only happen in official builds or debug builds."
        );
      }

      // Test removing all passwords.

      const promptPromise = BrowserTestUtils.promiseAlertDialog("accept");
      EventUtils.synthesizeMouseAtCenter(removeAllButton, {}, dialogWindow);
      await promptPromise;
      await SimpleTest.promiseFocus(dialogWindow);
      await TestUtils.waitForCondition(
        () => tree.view.rowCount == 0,
        "waiting for tree to be cleared"
      );
      Assert.equal(
        (await Services.logins.getAllLogins()).length,
        0,
        "all logins should have been removed"
      );
      Assert.ok(removeButton.disabled, "remove button should be disabled");
      Assert.ok(
        removeAllButton.disabled,
        "remove all button should be disabled"
      );
    },
    "closeButton"
  );
}

/**
 * Tests the password manager.
 */
add_task(async function testPasswordManager() {
  const { prefsDocument } = await openNewPrefsTab(
    "panePrivacy",
    "privacyPasswordsCategory"
  );
  await subtestPasswordManager(prefsDocument);
  await closePrefsTab();
});

/**
 * Tests the primary password dialogs, and the password manager with a primary
 * password set.
 */
add_task(async function testPrimaryPassword() {
  const tokendb = Cc["@mozilla.org/security/pk11tokendb;1"].getService(
    Ci.nsIPK11TokenDB
  );
  const token = tokendb.getInternalKeyToken();
  Assert.ok(!token.hasPassword, "there should be no primary password");

  const { prefsDocument, prefsWindow } = await openNewPrefsTab(
    "panePrivacy",
    "privacyPasswordsCategory"
  );

  async function changePassword(whatToClick, oldPassword, newPassword) {
    await promiseSubDialog(
      whatToClick,
      "chrome://mozapps/content/preferences/changemp.xhtml",
      async function (dialogWindow) {
        const dialogDocument = dialogWindow.document;
        if (oldPassword) {
          EventUtils.synthesizeMouseAtCenter(
            dialogDocument.getElementById("oldpw"),
            {},
            dialogWindow
          );
          EventUtils.sendString(oldPassword, dialogWindow);
        }
        EventUtils.synthesizeMouseAtCenter(
          dialogDocument.getElementById("pw1"),
          {},
          dialogWindow
        );
        EventUtils.sendString(newPassword, dialogWindow);
        EventUtils.synthesizeMouseAtCenter(
          dialogDocument.getElementById("pw2"),
          {},
          dialogWindow
        );
        EventUtils.sendString(newPassword, dialogWindow);
      },
      "accept"
    ).then(() => BrowserTestUtils.promiseAlertDialog("accept"));
    await SimpleTest.promiseFocus(prefsWindow);
    Assert.ok(token.hasPassword, "there should be a primary password");
    Assert.ok(
      token.checkPassword(newPassword),
      `the primary password should be "${newPassword}"`
    );
    Assert.ok(
      passwordCheckbox.checked,
      "the primary password checkbox should be checked"
    );
  }

  // Set the primary password, then check it is used in the password manager.

  const passwordCheckbox = prefsDocument.getElementById("useMasterPassword");
  if (OSKeyStore.canReauth()) {
    // There's an OS prompt when setting the password for the first time.
    OSKeyStoreTestUtils.waitForOSKeyStoreLogin(true);
  }
  await changePassword(passwordCheckbox, undefined, "super-secure");
  await subtestPasswordManager(prefsDocument, "super-secure");

  await changePassword(
    prefsDocument.getElementById("changeMasterPassword"),
    "super-secure",
    "replacement"
  );

  // Clear the primary password.

  await TestUtils.waitForTick();
  await promiseSubDialog(
    passwordCheckbox,
    "chrome://mozapps/content/preferences/removemp.xhtml",
    async function (dialogWindow) {
      EventUtils.sendString("replacement", dialogWindow);
    },
    "accept"
  ).then(() => BrowserTestUtils.promiseAlertDialog("accept"));
  await SimpleTest.promiseFocus(prefsWindow);
  Assert.ok(!token.hasPassword, "there should not be a primary password");
  Assert.ok(
    !passwordCheckbox.checked,
    "the primary password checkbox should not be checked"
  );

  await closePrefsTab();
}).skip(!OSKeyStoreTestUtils.canTestOSKeyStoreLogin());
// Some builds intentionally don't test key store logins.
// See OSKeyStoreTestUtils.sys.mjs for why.

/**
 * Tests the certificate manager and device manager dialogs.
 */
add_task(async function testSecurityDialogs() {
  const { prefsDocument } = await openNewPrefsTab(
    "panePrivacy",
    "privacySecurityCategory"
  );
  await promiseSubDialog(
    prefsDocument.getElementById("manageCertificatesButton"),
    "chrome://pippki/content/certManager.xhtml",
    () => {}
  );
  await promiseSubDialog(
    prefsDocument.getElementById("viewSecurityDevicesButton"),
    "chrome://pippki/content/device_manager.xhtml",
    () => {}
  );
  await closePrefsTab();
});
