/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// eslint-disable-next-line mozilla/no-redeclare-with-import-autofix
const { LoginHelper } = ChromeUtils.importESModule(
  "resource://gre/modules/LoginHelper.sys.mjs"
);
const { OSKeyStore } = ChromeUtils.importESModule(
  "resource://gre/modules/OSKeyStore.sys.mjs"
);
const { OSKeyStoreTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/OSKeyStoreTestUtils.sys.mjs"
);
const { CreateInBackend } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/CreateInBackend.sys.mjs"
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
      checkboxID: "globalPrivacyControlCheckbox",
      pref: "privacy.globalprivacycontrol.enabled",
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
  await SpecialPowers.pushPrefEnv({
    set: [["mail.spam.manualMark", true]],
  });

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

function assertPermission(origin, type, capability) {
  const principal = Services.scriptSecurityManager.createContentPrincipal(
    Services.io.newURI(origin),
    {}
  );
  Assert.equal(
    Services.perms.testExactPermissionFromPrincipal(principal, type),
    capability,
    `${origin} should have the expected ${type} permission`
  );
}

/**
 * Tests the remote content dialog.
 */
add_task(async function testRemoteContentDialog() {
  const { prefsDocument } = await openNewPrefsTab("panePrivacy");

  const remoteContentExceptions = prefsDocument.getElementById(
    "remoteContentExceptions"
  );
  const [remoteContentTitle, remoteContentDescription] =
    await prefsDocument.l10n.formatValues([
      "remote-content-permissions-title",
      "remote-content-permissions-description",
    ]);
  await promiseSubDialog(
    remoteContentExceptions,
    "chrome://messenger/content/preferences/permissions.xhtml",
    async function (dialogWindow) {
      const dialogDocument = dialogWindow.document;
      Assert.equal(dialogDocument.title, remoteContentTitle);
      Assert.equal(
        dialogDocument.getElementById("permissionsText").textContent,
        remoteContentDescription
      );
      const url = dialogDocument.getElementById("url");
      const permissionsTree = dialogDocument.getElementById("permissionsTree");

      for (const invalidOrigin of [
        "*.example.invalid",
        "https://*.example.invalid",
      ]) {
        url.value = invalidOrigin;
        url.dispatchEvent(new Event("input", { bubbles: true }));

        const alertPromise = BrowserTestUtils.promiseAlertDialog(
          "accept",
          "chrome://global/content/commonDialog.xhtml"
        );
        const addPermissionPromise =
          dialogWindow.gPermissionManager.addPermission(
            Ci.nsIPermissionManager.ALLOW_ACTION
          );
        await alertPromise;
        await addPermissionPromise;

        Assert.equal(
          permissionsTree.view.rowCount,
          0,
          `${invalidOrigin} should not be added to the list`
        );
      }

      await SimpleTest.promiseFocus(dialogWindow);
      url.value = "";
      url.dispatchEvent(new Event("input", { bubbles: true }));
      url.focus();

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
        2,
        "HTTP and HTTPS entries should be added to the list"
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
        4,
        "HTTP and HTTPS entries should be added to the list"
      );

      EventUtils.sendString("sender@example.invalid", dialogWindow);
      EventUtils.synthesizeMouseAtCenter(
        dialogDocument.getElementById("btnAllow"),
        {},
        dialogWindow
      );
      await new Promise(f => setTimeout(f));
      Assert.equal(url.value, "", "url input should be cleared");
      Assert.equal(
        permissionsTree.view.rowCount,
        5,
        "one email address entry should be added to the list"
      );
    },
    "btnApplyChanges"
  );

  assertPermission(
    // eslint-disable-next-line sdl/no-insecure-url
    "http://accept.invalid",
    "image",
    Ci.nsIPermissionManager.ALLOW_ACTION
  );
  assertPermission(
    // eslint-disable-next-line sdl/no-insecure-url
    "http://block.invalid",
    "image",
    Ci.nsIPermissionManager.DENY_ACTION
  );
  assertPermission(
    "https://accept.invalid",
    "image",
    Ci.nsIPermissionManager.ALLOW_ACTION
  );
  assertPermission(
    "https://block.invalid",
    "image",
    Ci.nsIPermissionManager.DENY_ACTION
  );
  assertPermission(
    "chrome://messenger/content/email=sender@example.invalid",
    "image",
    Ci.nsIPermissionManager.ALLOW_ACTION
  );

  await promiseSubDialog(
    remoteContentExceptions,
    "chrome://messenger/content/preferences/permissions.xhtml",
    async function (dialogWindow) {
      const dialogDocument = dialogWindow.document;
      const permissionsTree = dialogDocument.getElementById("permissionsTree");

      Assert.equal(
        permissionsTree.view.rowCount,
        5,
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
        4,
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

  for (const origin of [
    // eslint-disable-next-line sdl/no-insecure-url
    "http://accept.invalid",
    // eslint-disable-next-line sdl/no-insecure-url
    "http://block.invalid",
    "https://accept.invalid",
    "https://block.invalid",
    "chrome://messenger/content/email=sender@example.invalid",
  ]) {
    assertPermission(origin, "image", Ci.nsIPermissionManager.UNKNOWN_ACTION);
  }

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
  const [cookiePermissionsTitle, cookiePermissionsDescription] =
    await prefsDocument.l10n.formatValues([
      "cookie-permissions-title",
      "cookie-permissions-description",
    ]);
  await promiseSubDialog(
    cookieExceptions,
    "chrome://messenger/content/preferences/permissions.xhtml",
    async function (dialogWindow) {
      const dialogDocument = dialogWindow.document;
      Assert.equal(dialogDocument.title, cookiePermissionsTitle);
      Assert.equal(
        dialogDocument.getElementById("permissionsText").textContent,
        cookiePermissionsDescription
      );
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
        2,
        "HTTP and HTTPS entries should be added to the list"
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
        4,
        "HTTP and HTTPS entries should be added to the list"
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
        6,
        "HTTP and HTTPS entries should be added to the list"
      );
    },
    "btnApplyChanges"
  );

  assertPermission(
    // eslint-disable-next-line sdl/no-insecure-url
    "http://accept.invalid",
    "cookie",
    Ci.nsIPermissionManager.ALLOW_ACTION
  );
  assertPermission(
    // eslint-disable-next-line sdl/no-insecure-url
    "http://session.invalid",
    "cookie",
    Ci.nsICookiePermission.ACCESS_SESSION
  );
  assertPermission(
    // eslint-disable-next-line sdl/no-insecure-url
    "http://block.invalid",
    "cookie",
    Ci.nsIPermissionManager.DENY_ACTION
  );
  assertPermission(
    "https://accept.invalid",
    "cookie",
    Ci.nsIPermissionManager.ALLOW_ACTION
  );
  assertPermission(
    "https://session.invalid",
    "cookie",
    Ci.nsICookiePermission.ACCESS_SESSION
  );
  assertPermission(
    "https://block.invalid",
    "cookie",
    Ci.nsIPermissionManager.DENY_ACTION
  );

  await promiseSubDialog(
    cookieExceptions,
    "chrome://messenger/content/preferences/permissions.xhtml",
    async function (dialogWindow) {
      const dialogDocument = dialogWindow.document;
      const permissionsTree = dialogDocument.getElementById("permissionsTree");

      Assert.equal(
        permissionsTree.view.rowCount,
        6,
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
        5,
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

  for (const origin of [
    // eslint-disable-next-line sdl/no-insecure-url
    "http://accept.invalid",
    // eslint-disable-next-line sdl/no-insecure-url
    "http://session.invalid",
    // eslint-disable-next-line sdl/no-insecure-url
    "http://block.invalid",
    "https://accept.invalid",
    "https://session.invalid",
    "https://block.invalid",
  ]) {
    assertPermission(origin, "cookie", Ci.nsIPermissionManager.UNKNOWN_ACTION);
  }

  const cookieHost = "preferences-cookie-test.invalid";
  const hostCookieName = "host-cookie";
  const domainCookieName = "domain-session-cookie";
  Services.cookies.add(
    cookieHost,
    "/",
    hostCookieName,
    "host value",
    false,
    false,
    false,
    Date.now() + 60 * 60 * 1000,
    {},
    Ci.nsICookie.SAMESITE_UNSET,
    Ci.nsICookie.SCHEME_HTTP
  );
  Services.cookies.add(
    `.${cookieHost}`,
    "/",
    domainCookieName,
    "domain value",
    true,
    false,
    true,
    Date.now() + 60 * 60 * 1000,
    {},
    Ci.nsICookie.SAMESITE_NONE,
    Ci.nsICookie.SCHEME_HTTPS
  );
  let cookiesExist = true;
  const removeTestCookies = () => {
    if (!cookiesExist) {
      return;
    }
    Services.cookies.remove(cookieHost, hostCookieName, "/", {});
    Services.cookies.remove(`.${cookieHost}`, domainCookieName, "/", {});
    cookiesExist = false;
  };
  registerCleanupFunction(removeTestCookies);

  await promiseSubDialog(
    prefsDocument.getElementById("showCookiesButton"),
    "chrome://messenger/content/preferences/cookies.xhtml",
    async dialogWindow => {
      const dialogDocument = dialogWindow.document;
      const cookiesIntro = dialogDocument.getElementById("cookiesIntro");
      const cookiesWindow = dialogWindow.gCookiesWindow;
      const cookiesTree = dialogDocument.getElementById("cookiesList");
      const domainColumn = cookiesTree.columns.domainCol;
      const domainField = dialogDocument.getElementById("isDomain");
      const findRow = (column, value) => {
        for (let i = 0; i < cookiesTree.view.rowCount; i++) {
          if (cookiesTree.view.getCellText(i, column) == value) {
            return i;
          }
        }
        return -1;
      };

      const [
        secureOnly,
        anyConnection,
        sessionExpires,
        noneSelected,
        defaultUserContext,
      ] = await dialogDocument.l10n.formatValues([
        "cookie-secure-only",
        "cookie-any-connection",
        "cookie-expires-at-end-of-session",
        "cookie-none-selected",
        "cookie-default-user-context",
      ]);
      const [hostMessage, domainMessage] =
        await dialogDocument.l10n.formatMessages([
          { id: "props-host-label" },
          { id: "props-domain-label2" },
        ]);
      const hostLabel = hostMessage.attributes.find(
        attr => attr.name == "value"
      ).value;
      const domainLabel = domainMessage.attributes.find(
        attr => attr.name == "value"
      ).value;
      const fieldValue = id => dialogDocument.getElementById(id).value;
      const assertIntro = async id => {
        Assert.equal(
          dialogDocument.l10n.getAttributes(cookiesIntro).id,
          id,
          `the cookie intro should use ${id}`
        );
        await dialogDocument.l10n.translateFragment(cookiesIntro);
        const [message] = await dialogDocument.l10n.formatMessages([{ id }]);
        Assert.equal(
          cookiesIntro.value,
          message.attributes.find(attr => attr.name == "value").value,
          `the cookie intro should display the value of ${id}`
        );
        Assert.equal(
          cookiesIntro.textContent,
          "",
          `the cookie intro should have no extra text content (${id})`
        );
      };

      Assert.equal(
        dialogDocument.l10n.getAttributes(domainField).id,
        "props-host-label",
        "the cookie details should initially use the host label"
      );
      await dialogDocument.l10n.translateFragment(domainField);
      Assert.equal(
        domainField.value,
        hostLabel,
        "the cookie details should initially display the host label"
      );

      const hostRow = findRow(domainColumn, cookieHost);
      Assert.greaterOrEqual(
        hostRow,
        0,
        "the test cookie host should be listed"
      );
      cookiesTree.view.selection.select(hostRow);

      const hostCookie = cookiesWindow._hosts[cookieHost].cookies.find(
        item => item.name == hostCookieName
      );
      Assert.ok(
        hostCookie,
        `${hostCookieName} should be loaded into the cookie tree`
      );
      const domainCookie = cookiesWindow._hosts[cookieHost].cookies.find(
        item => item.name == domainCookieName
      );
      Assert.ok(
        domainCookie,
        `${domainCookieName} should be loaded into the cookie tree`
      );

      await cookiesWindow._updateCookieData(hostCookie);
      Assert.equal(
        fieldValue("name"),
        hostCookieName,
        "the host cookie name should be displayed"
      );
      Assert.equal(
        fieldValue("value"),
        "host value",
        "the host cookie value should be displayed"
      );
      Assert.equal(
        dialogDocument.l10n.getAttributes(domainField).id,
        "props-host-label",
        "a host cookie should use the host label"
      );
      await dialogDocument.l10n.translateFragment(domainField);
      Assert.equal(
        fieldValue("isDomain"),
        hostLabel,
        "a host cookie should be labelled Host:"
      );
      Assert.equal(
        fieldValue("host"),
        cookieHost,
        "the host cookie host should be displayed"
      );
      Assert.equal(
        fieldValue("path"),
        "/",
        "the host cookie path should be displayed"
      );
      Assert.equal(
        fieldValue("isSecure"),
        anyConnection,
        "a non-secure cookie should show the any-connection string"
      );
      Assert.ok(
        fieldValue("expires"),
        "the expiry date of a persistent cookie should be displayed"
      );
      Assert.notEqual(
        fieldValue("expires"),
        sessionExpires,
        "a persistent cookie should not show the end-of-session string"
      );
      Assert.equal(
        fieldValue("userContext"),
        defaultUserContext,
        "the default container should be displayed"
      );

      // Container cookies cannot be created through nsICookieManager in tests
      // (it rejects a non-default userContextId), so exercise the container
      // lookup with an item shaped like the ones the tree stores.
      await cookiesWindow._updateCookieData({
        name: "container-cookie",
        value: "container value",
        host: cookieHost,
        path: "/",
        isDomain: false,
        isSecure: false,
        expires: 0,
        originAttributes: { userContextId: 1 },
      });
      Assert.equal(
        fieldValue("userContext"),
        dialogWindow.ContextualIdentityService.getUserContextLabel(1),
        "the container name should be displayed"
      );

      await cookiesWindow._updateCookieData(domainCookie);
      Assert.equal(
        fieldValue("name"),
        domainCookieName,
        "the domain cookie name should be displayed"
      );
      Assert.equal(
        fieldValue("value"),
        "domain value",
        "the domain cookie value should be displayed"
      );
      Assert.equal(
        dialogDocument.l10n.getAttributes(domainField).id,
        "props-domain-label2",
        "a domain cookie should use the domain label"
      );
      await dialogDocument.l10n.translateFragment(domainField);
      Assert.equal(
        fieldValue("isDomain"),
        domainLabel,
        "a domain cookie should be labelled Domain:"
      );
      Assert.equal(
        fieldValue("host"),
        `.${cookieHost}`,
        "the domain cookie host should be displayed"
      );
      Assert.equal(
        fieldValue("isSecure"),
        secureOnly,
        "a secure cookie should show the encrypted-connections-only string"
      );
      Assert.equal(
        fieldValue("expires"),
        sessionExpires,
        "a session cookie should show the end-of-session string"
      );
      Assert.equal(
        fieldValue("userContext"),
        defaultUserContext,
        "the default container should be displayed"
      );

      await dialogDocument.l10n.translateRoots();
      Assert.equal(
        fieldValue("isDomain"),
        domainLabel,
        "the domain label should survive a retranslation"
      );

      cookiesTree.view.selection.clearSelection();
      await cookiesWindow.onCookieSelected();
      Assert.equal(
        dialogDocument.l10n.getAttributes(domainField).id,
        "props-domain-label2",
        "the domain label should remain when no cookie is selected"
      );
      for (const id of [
        "name",
        "value",
        "host",
        "path",
        "isSecure",
        "expires",
        "userContext",
      ]) {
        Assert.equal(
          fieldValue(id),
          noneSelected,
          `the ${id} field should show the no-cookie-selected string`
        );
      }

      await dialogDocument.l10n.translateRoots();
      Assert.equal(
        fieldValue("isDomain"),
        domainLabel,
        "the retained domain label should survive a retranslation"
      );

      cookiesTree.view.selection.select(hostRow);
      await cookiesWindow.onCookieSelected();
      Assert.equal(
        dialogDocument.l10n.getAttributes(domainField).id,
        "props-domain-label2",
        "selecting a site group should retain the previous domain label"
      );
      await cookiesWindow._updateCookieData(hostCookie);
      await dialogDocument.l10n.translateFragment(domainField);
      Assert.equal(
        domainField.value,
        hostLabel,
        "selecting a host cookie should replace the retained domain label"
      );
      Assert.equal(
        domainField.textContent,
        "",
        "the host/domain label should have no extra text content"
      );

      await assertIntro("cookies-stored-label2");

      const filter = dialogDocument.getElementById("filter");
      filter.focus();
      const filtered = BrowserTestUtils.waitForMutationCondition(
        cookiesIntro,
        { attributes: true, attributeFilter: ["data-l10n-id"] },
        () =>
          dialogDocument.l10n.getAttributes(cookiesIntro).id ==
          "cookies-filtered-label"
      );
      EventUtils.sendString("does-not-match-any-cookie", dialogWindow);
      await filtered;
      await assertIntro("cookies-filtered-label");

      const unfiltered = BrowserTestUtils.waitForMutationCondition(
        cookiesIntro,
        { attributes: true, attributeFilter: ["data-l10n-id"] },
        () =>
          dialogDocument.l10n.getAttributes(cookiesIntro).id ==
          "cookies-stored-label2"
      );
      EventUtils.synthesizeKey("a", { accelKey: true }, dialogWindow);
      EventUtils.synthesizeKey("KEY_Backspace", {}, dialogWindow);
      await unfiltered;
      await assertIntro("cookies-stored-label2");
    },
    "closeButton"
  );
  removeTestCookies();
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
      EventUtils.sendString("shouldprovidenoresults", dialogWindow);
      EventUtils.synthesizeKey("KEY_Enter", {}, dialogWindow);
      Assert.equal(
        tree.view.rowCount,
        0,
        "no logins should match the filter and be displayed"
      );
      Assert.ok(removeButton.disabled, "remove button should be disabled");
      Assert.ok(
        removeAllButton.disabled,
        "remove all button should be disabled"
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
      // The tree is updated before the deletion is committed to storage.
      await TestUtils.waitForCondition(
        async () => (await Services.logins.getAllLogins()).length == 5,
        "waiting for the login to be removed"
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
          LoginHelper.getOSAuthEnabled() &&
          OSKeyStore.canReauth() &&
          !primaryPassword
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
          LoginHelper.getOSAuthEnabled() &&
          OSKeyStore.canReauth() &&
          !primaryPassword
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
      // The tree is updated before the deletions are committed to storage.
      await TestUtils.waitForCondition(
        async () => !(await Services.logins.getAllLogins()).length,
        "waiting for all logins to be removed"
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
  const token = Cc["@mozilla.org/security/internalkeytoken;1"].createInstance(
    Ci.nsIPKCS11Token
  );
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
      passwordCheckbox.checked,
      "the primary password checkbox should be checked"
    );
  }

  // Set the primary password, then check it is used in the password manager.

  const passwordCheckbox = prefsDocument.getElementById("useMasterPassword");
  if (LoginHelper.getOSAuthEnabled() && OSKeyStore.canReauth()) {
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

/**
 * Tests the keyserver settings.
 */
add_task(async function testKeyServers() {
  const { prefsDocument, prefsWindow } = await openNewPrefsTab(
    "panePrivacy",
    "privacyPasswordsCategory"
  );

  prefsDocument
    .getElementById("emailE2eeKeyServers")
    .scrollIntoView({ block: "start", behavior: "instant" });
  const keyServerList = prefsDocument.getElementById("keyServerList");
  await BrowserTestUtils.waitForMutationCondition(
    keyServerList,
    {
      childList: true,
    },
    () => keyServerList.children.length == 3
  );

  // Initial state based on "mail.openpgp.keyserver_list".

  const keyServers = Services.prefs
    .getStringPref("mail.openpgp.keyserver_list")
    .split(/,\s*/);
  Assert.equal(keyServers.length, 2, "should start with 2 servers");

  // Toggle a checkbox (to remove server from pref).

  let prefChanged = TestUtils.waitForPrefChange(
    "mail.openpgp.keyserver_list",
    value => !value.split(/,\s*/).includes("vks://keys.openpgp.org"),
    "waiting for vks://keys.openpgp.org to get removed from pref"
  );
  EventUtils.synthesizeMouseAtCenter(
    keyServerList.querySelector("input[type=checkbox]"),
    {},
    prefsWindow
  );
  await prefChanged;
  await TestUtils.waitForTick();
  info("Uncheck server removed it from the list.");

  // Reset list.

  EventUtils.synthesizeMouseAtCenter(
    prefsDocument.getElementById("keyServerReset"),
    {},
    prefsWindow
  );
  await BrowserTestUtils.waitForMutationCondition(
    keyServerList,
    { childList: true },
    () => keyServerList.querySelectorAll("input[type=checkbox]:checked").length,
    "waiting for servers to all be checked, after reset"
  );
  await TestUtils.waitForTick();
  Assert.ok(
    Services.prefs.prefHasDefaultValue("mail.openpgp.keyserver_list"),
    "should have default servers after reset"
  );

  // Add a server.

  prefChanged = TestUtils.waitForPrefChange(
    "mail.openpgp.keyserver_list",
    value => value.split(/,\s*/).includes("vks://test1.example.com"),
    "waiting for mail.openpgp.keyserver_list pref to add vks://test1.example.com"
  );
  EventUtils.synthesizeMouseAtCenter(
    prefsDocument.getElementById("keyServerAdd"),
    {},
    prefsWindow
  );
  const addPromise = BrowserTestUtils.promiseAlertDialogOpen(
    "",
    "chrome://global/content/commonDialog.xhtml",
    {
      async callback(win) {
        const input = win.document.querySelector("input");
        input.value = "vks://test1.example.com";
        win.document.querySelector("dialog").acceptDialog();
      },
    }
  );
  await addPromise;
  await prefChanged;
  info("Server was added to prefs");

  await BrowserTestUtils.waitForMutationCondition(
    keyServerList,
    { childList: true },
    () => keyServerList.querySelectorAll(":scope > li").length == 3
  );
  Assert.equal(
    3,
    keyServerList.querySelectorAll(":scope > li").length,
    "should have correct servers listed after add"
  );
  Assert.equal(
    keyServerList
      .querySelector(`li:has(input[value="vks://test1.example.com"]:checked)`)
      .textContent.trim(),
    "vks://test1.example.com",
    "Should show the new server in the list"
  );
  await TestUtils.waitForTick();
  info("UI appears correct after addition.");

  // Test inputting invalid data.
  const addFailPromise = BrowserTestUtils.promiseAlertDialogOpen(
    "",
    "chrome://global/content/commonDialog.xhtml",
    {
      async callback(win) {
        const input = win.document.querySelector("input");
        input.value = "mjuschpush";
        const alertPromise = BrowserTestUtils.promiseAlertDialogOpen(
          "",
          "chrome://global/content/commonDialog.xhtml",
          {
            async callback(win2) {
              win2.document.querySelector("dialog").acceptDialog();
            },
          }
        );
        win.document.querySelector("dialog").acceptDialog();
        await alertPromise; // Got alerted about bad data.
        info("Got alerted about bad data.");
        await TestUtils.waitForTick();
      },
    }
  );
  EventUtils.synthesizeMouseAtCenter(
    prefsDocument.getElementById("keyServerAdd"),
    {},
    prefsWindow
  );
  await addFailPromise; // Input dialog closed;
  info("Tried adding junk");

  await TestUtils.waitForTick();

  // Reset list.

  EventUtils.synthesizeMouseAtCenter(
    prefsDocument.getElementById("keyServerReset"),
    {},
    prefsWindow
  );
  await BrowserTestUtils.waitForMutationCondition(
    keyServerList,
    { childList: true },
    () => keyServerList.querySelectorAll(":scope > li").length == 2
  );
  Assert.equal(
    2,
    keyServerList.querySelectorAll(":scope > li").length,
    "should have initial servers listed after reset"
  );
  await TestUtils.waitForTick();
  Assert.ok(
    Services.prefs.prefHasDefaultValue("mail.openpgp.keyserver_list"),
    "should have default servers after reset"
  );
  Assert.ok(
    !keyServerList.querySelector(`li input[value="vks://test1.example.com"]`),
    "Should no longer have the extra server in the DOM after the reset"
  );

  await closePrefsTab();
});
