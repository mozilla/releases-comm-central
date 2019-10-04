/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async () => {
  // Mock the prompt service. We're going to be asked if we're sure
  // we want to remove an account, so let's say yes.

  let mockPromptService = {
    confirmCount: 0,
    confirm() {
      this.confirmCount++;
      return true;
    },
    QueryInterface: ChromeUtils.generateQI([Ci.nsIPromptService]),
  };

  let { MockRegistrar } = ChromeUtils.import(
    "resource://testing-common/MockRegistrar.jsm"
  );
  let mockPromptServiceCID = MockRegistrar.register(
    "@mozilla.org/embedcomp/prompt-service;1",
    mockPromptService
  );

  registerCleanupFunction(() => {
    MockRegistrar.unregister(mockPromptServiceCID);
  });

  let { cloudFileAccounts } = ChromeUtils.import(
    "resource:///modules/cloudFileAccounts.jsm"
  );
  is(cloudFileAccounts.providers.length, 1);
  is(cloudFileAccounts.accounts.length, 0);

  // Load the preferences tab.

  let { prefsDocument, prefsWindow } = await openNewPrefsTab(
    "paneCompose",
    "compositionAttachmentsCategory"
  );

  // Check everything is as it should be.

  let accountList = prefsDocument.getElementById("cloudFileView");
  is(accountList.itemCount, 0);

  let buttonList = prefsDocument.getElementById("addCloudFileAccountButtons");
  ok(!buttonList.hidden);
  is(buttonList.childElementCount, 1);
  is(
    buttonList.children[0].getAttribute("value"),
    "ext-wetransfer@extensions.thunderbird.net"
  );

  let menuButton = prefsDocument.getElementById("addCloudFileAccount");
  ok(menuButton.hidden);
  is(menuButton.itemCount, 1);
  is(
    menuButton.getItemAtIndex(0).getAttribute("value"),
    "ext-wetransfer@extensions.thunderbird.net"
  );

  let removeButton = prefsDocument.getElementById("removeCloudFileAccount");
  ok(removeButton.disabled);

  let settingsDeck = prefsDocument.getElementById("cloudFileSettingsDeck");
  is(settingsDeck.selectedPanel.id, "cloudFileDefaultPanel");

  let iframeWrapper = prefsDocument.getElementById("cloudFileSettingsWrapper");
  is(iframeWrapper.childElementCount, 0);

  // Register our test provider.

  const ICON_URL = getRootDirectory(gTestPath) + "files/icon.svg";
  const MANAGEMENT_URL = getRootDirectory(gTestPath) + "files/management.html";

  let accountIsConfigured = false;
  let provider = {
    type: "Mochitest",
    displayName: "Mochitest",
    iconURL: ICON_URL,
    initAccount(accountKey) {
      return {
        accountKey,
        type: "Mochitest",
        get displayName() {
          return Services.prefs.getCharPref(
            `mail.cloud_files.accounts.${this.accountKey}.displayName`,
            "Mochitest Account"
          );
        },
        iconURL: ICON_URL,
        configured: accountIsConfigured,
        managementURL: MANAGEMENT_URL,
      };
    },
  };
  cloudFileAccounts.registerProvider("Mochitest", provider);
  is(cloudFileAccounts.providers.length, 2);
  is(cloudFileAccounts.accounts.length, 0);

  await new Promise(resolve => prefsWindow.requestAnimationFrame(resolve));

  is(buttonList.childElementCount, 2);
  is(
    buttonList.children[0].getAttribute("value"),
    "ext-wetransfer@extensions.thunderbird.net"
  );
  is(buttonList.children[1].getAttribute("value"), "Mochitest");
  is(buttonList.children[1].style.listStyleImage, `url("${ICON_URL}")`);

  is(menuButton.itemCount, 2);
  is(
    menuButton.getItemAtIndex(0).getAttribute("value"),
    "ext-wetransfer@extensions.thunderbird.net"
  );
  is(menuButton.getItemAtIndex(1).getAttribute("value"), "Mochitest");
  is(menuButton.getItemAtIndex(1).getAttribute("image"), ICON_URL);

  // Create a new account.

  EventUtils.synthesizeMouseAtCenter(
    buttonList.children[1],
    { clickCount: 1 },
    prefsWindow
  );
  is(cloudFileAccounts.accounts.length, 1);
  is(cloudFileAccounts.configuredAccounts.length, 0);

  let account = cloudFileAccounts.accounts[0];
  let accountKey = account.accountKey;
  is(cloudFileAccounts.accounts[0].type, "Mochitest");

  // Check prefs were updated.

  is(
    Services.prefs.getCharPref(
      `mail.cloud_files.accounts.${accountKey}.displayName`
    ),
    "Mochitest Account"
  );
  is(
    Services.prefs.getCharPref(`mail.cloud_files.accounts.${accountKey}.type`),
    "Mochitest"
  );

  // Check UI was updated.

  is(accountList.itemCount, 1);
  is(accountList.selectedIndex, 0);
  ok(!removeButton.disabled);

  let accountListItem = accountList.selectedItem;
  is(accountListItem.getAttribute("value"), accountKey);
  is(accountListItem.style.listStyleImage, `url("${ICON_URL}")`);
  is(accountListItem.querySelector("label").value, "Mochitest Account");
  is(accountListItem.querySelector("image.configuredWarning").hidden, false);

  is(settingsDeck.selectedPanel.id, "cloudFileSettingsWrapper");
  is(iframeWrapper.childElementCount, 1);

  let iframe = iframeWrapper.firstElementChild;
  is(iframe.src, `${MANAGEMENT_URL}?accountId=${accountKey}`);

  // Rename the account.

  EventUtils.synthesizeMouseAtCenter(
    accountListItem,
    { clickCount: 1 },
    prefsWindow
  );

  await new Promise(resolve => prefsWindow.requestAnimationFrame(resolve));

  is(
    prefsDocument.activeElement.closest("input"),
    accountListItem.querySelector("input")
  );
  ok(accountListItem.querySelector("label").hidden);
  ok(!accountListItem.querySelector("input").hidden);
  is(accountListItem.querySelector("input").value, "Mochitest Account");
  EventUtils.synthesizeKey("VK_RIGHT", undefined, prefsWindow);
  EventUtils.synthesizeKey("!", undefined, prefsWindow);
  EventUtils.synthesizeKey("VK_RETURN", undefined, prefsWindow);

  await new Promise(resolve => prefsWindow.requestAnimationFrame(resolve));

  is(prefsDocument.activeElement, accountList);
  ok(!accountListItem.querySelector("label").hidden);
  is(accountListItem.querySelector("label").value, "Mochitest Account!");
  ok(accountListItem.querySelector("input").hidden);
  is(
    Services.prefs.getCharPref(
      `mail.cloud_files.accounts.${accountKey}.displayName`
    ),
    "Mochitest Account!"
  );

  // Start to rename the account, but bail out.

  EventUtils.synthesizeMouseAtCenter(
    accountListItem,
    { clickCount: 1 },
    prefsWindow
  );

  await new Promise(resolve => prefsWindow.requestAnimationFrame(resolve));

  is(
    prefsDocument.activeElement.closest("input"),
    accountListItem.querySelector("input")
  );
  EventUtils.synthesizeKey("O", undefined, prefsWindow);
  EventUtils.synthesizeKey("o", undefined, prefsWindow);
  EventUtils.synthesizeKey("p", undefined, prefsWindow);
  EventUtils.synthesizeKey("s", undefined, prefsWindow);
  EventUtils.synthesizeKey("VK_ESCAPE", undefined, prefsWindow);

  await new Promise(resolve => prefsWindow.requestAnimationFrame(resolve));

  is(prefsDocument.activeElement, accountList);
  ok(!accountListItem.querySelector("label").hidden);
  is(accountListItem.querySelector("label").value, "Mochitest Account!");
  ok(accountListItem.querySelector("input").hidden);
  is(
    Services.prefs.getCharPref(
      `mail.cloud_files.accounts.${accountKey}.displayName`
    ),
    "Mochitest Account!"
  );

  // Configure the account.

  account.configured = true;
  accountIsConfigured = true;
  cloudFileAccounts.emit("accountConfigured", account);

  await new Promise(resolve => prefsWindow.requestAnimationFrame(resolve));

  is(accountListItem.querySelector("image.configuredWarning").hidden, true);
  is(cloudFileAccounts.accounts.length, 1);
  is(cloudFileAccounts.configuredAccounts.length, 1);

  // Remove the test provider. The list item, button, and iframe should disappear.

  cloudFileAccounts.unregisterProvider("Mochitest");
  is(cloudFileAccounts.providers.length, 1);
  is(cloudFileAccounts.accounts.length, 0);

  await new Promise(resolve => prefsWindow.requestAnimationFrame(resolve));

  is(buttonList.childElementCount, 1);
  is(
    buttonList.children[0].getAttribute("value"),
    "ext-wetransfer@extensions.thunderbird.net"
  );
  is(menuButton.itemCount, 1);
  is(
    menuButton.getItemAtIndex(0).getAttribute("value"),
    "ext-wetransfer@extensions.thunderbird.net"
  );
  is(accountList.itemCount, 0);
  is(settingsDeck.selectedPanel.id, "cloudFileDefaultPanel");
  is(iframeWrapper.childElementCount, 0);

  // Re-add the test provider.

  cloudFileAccounts.registerProvider("Mochitest", provider);
  is(cloudFileAccounts.providers.length, 2);
  is(cloudFileAccounts.accounts.length, 1);
  is(cloudFileAccounts.configuredAccounts.length, 1);

  await new Promise(resolve => prefsWindow.requestAnimationFrame(resolve));

  is(buttonList.childElementCount, 2);
  is(
    buttonList.children[0].getAttribute("value"),
    "ext-wetransfer@extensions.thunderbird.net"
  );
  is(buttonList.children[1].getAttribute("value"), "Mochitest");

  is(menuButton.itemCount, 2);
  is(
    menuButton.getItemAtIndex(0).getAttribute("value"),
    "ext-wetransfer@extensions.thunderbird.net"
  );
  is(menuButton.getItemAtIndex(1).getAttribute("value"), "Mochitest");

  is(accountList.itemCount, 1);
  is(accountList.selectedIndex, -1);
  ok(removeButton.disabled);

  accountListItem = accountList.getItemAtIndex(0);
  is(
    Services.prefs.getCharPref(
      `mail.cloud_files.accounts.${accountKey}.displayName`
    ),
    "Mochitest Account!"
  );

  EventUtils.synthesizeMouseAtCenter(
    accountList.getItemAtIndex(0),
    { clickCount: 1 },
    prefsWindow
  );
  ok(!removeButton.disabled);
  EventUtils.synthesizeMouseAtCenter(
    removeButton,
    { clickCount: 1 },
    prefsWindow
  );
  is(mockPromptService.confirmCount, 1);

  ok(
    !Services.prefs.prefHasUserValue(
      `mail.cloud_files.accounts.${accountKey}.displayName`
    )
  );
  ok(
    !Services.prefs.prefHasUserValue(
      `mail.cloud_files.accounts.${accountKey}.type`
    )
  );

  is(cloudFileAccounts.providers.length, 2);
  is(cloudFileAccounts.accounts.length, 0);

  cloudFileAccounts.unregisterProvider("Mochitest", provider);
  is(cloudFileAccounts.providers.length, 1);
  is(cloudFileAccounts.accounts.length, 0);

  // Close the preferences tab.

  await closePrefsTab();
});

add_task(async () => {
  let { cloudFileAccounts } = ChromeUtils.import(
    "resource:///modules/cloudFileAccounts.jsm"
  );

  // Register our test provider.

  const ICON_URL = getRootDirectory(gTestPath) + "files/icon.svg";
  const MANAGEMENT_URL = getRootDirectory(gTestPath) + "files/management.html";

  let accountIsConfigured = false;
  let provider = {
    type: "Mochitest",
    displayName: "Mochitest",
    iconURL: ICON_URL,
    initAccount(accountKey) {
      return {
        accountKey,
        type: "Mochitest",
        get displayName() {
          return Services.prefs.getCharPref(
            `mail.cloud_files.accounts.${this.accountKey}.displayName`,
            "Mochitest Account"
          );
        },
        iconURL: ICON_URL,
        configured: accountIsConfigured,
        managementURL: MANAGEMENT_URL,
      };
    },
  };
  cloudFileAccounts.registerProvider("Mochitest", provider);
  is(cloudFileAccounts.providers.length, 2);
  is(cloudFileAccounts.accounts.length, 0);

  // Load the preferences tab.

  let { prefsDocument, prefsWindow } = await openNewPrefsTab(
    "paneCompose",
    "compositionAttachmentsCategory"
  );

  let accountList = prefsDocument.getElementById("cloudFileView");
  is(accountList.itemCount, 0);

  let buttonList = prefsDocument.getElementById("addCloudFileAccountButtons");
  ok(!buttonList.hidden);
  is(buttonList.childElementCount, 2);
  is(buttonList.children[0].getAttribute("value"), "Mochitest");

  let menuButton = prefsDocument.getElementById("addCloudFileAccount");
  ok(menuButton.hidden);

  // Add new accounts until the list overflows. The list of buttons should be hidden
  // and the button with the drop-down should appear.

  let count = 0;
  do {
    EventUtils.synthesizeMouseAtCenter(
      buttonList.children[0],
      { clickCount: 1 },
      prefsWindow
    );
    await new Promise(resolve => setTimeout(resolve));
    if (buttonList.hidden) {
      break;
    }
  } while (++count < 25);

  ok(count < 24); // If count reaches 25, we have a problem.
  ok(!menuButton.hidden);

  // Remove the added accounts. The list of buttons should not reappear and the
  // button with the drop-down should remain.

  let removeButton = prefsDocument.getElementById("removeCloudFileAccount");
  do {
    EventUtils.synthesizeMouseAtCenter(
      accountList.getItemAtIndex(0),
      { clickCount: 1 },
      prefsWindow
    );
    EventUtils.synthesizeMouseAtCenter(
      removeButton,
      { clickCount: 1 },
      prefsWindow
    );
    await new Promise(resolve => setTimeout(resolve));
  } while (--count > 0);

  ok(buttonList.hidden);
  ok(!menuButton.hidden);

  // Close the preferences tab.

  await closePrefsTab();
});
