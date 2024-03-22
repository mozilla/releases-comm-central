/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* eslint-env webextensions */

const { cloudFileAccounts } = ChromeUtils.importESModule(
  "resource:///modules/cloudFileAccounts.sys.mjs"
);
const { MockRegistrar } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistrar.sys.mjs"
);

function ManagementScript() {
  browser.test.onMessage.addListener((message, assertMessage, browserStyle) => {
    if (message !== "check-style") {
      return;
    }
    function verifyButton(buttonElement, expected) {
      const buttonStyle = window.getComputedStyle(buttonElement);
      const buttonBackgroundColor = buttonStyle.backgroundColor;
      if (browserStyle && expected.hasBrowserStyleClass) {
        browser.test.assertEq(
          "rgb(9, 150, 248)",
          buttonBackgroundColor,
          assertMessage
        );
      } else {
        browser.test.assertTrue(
          buttonBackgroundColor !== "rgb(9, 150, 248)",
          assertMessage
        );
      }
    }

    function verifyCheckboxOrRadio(element, expected) {
      const style = window.getComputedStyle(element);
      const styledBackground = element.checked
        ? "rgb(9, 150, 248)"
        : "rgb(255, 255, 255)";
      if (browserStyle && expected.hasBrowserStyleClass) {
        browser.test.assertEq(
          styledBackground,
          style.backgroundColor,
          assertMessage
        );
      } else {
        browser.test.assertTrue(
          style.backgroundColor != styledBackground,
          assertMessage
        );
      }
    }

    const normalButton = document.getElementById("normalButton");
    const browserStyleButton = document.getElementById("browserStyleButton");
    verifyButton(normalButton, { hasBrowserStyleClass: false });
    verifyButton(browserStyleButton, { hasBrowserStyleClass: true });

    const normalCheckbox1 = document.getElementById("normalCheckbox1");
    const normalCheckbox2 = document.getElementById("normalCheckbox2");
    const browserStyleCheckbox = document.getElementById(
      "browserStyleCheckbox"
    );
    verifyCheckboxOrRadio(normalCheckbox1, { hasBrowserStyleClass: false });
    verifyCheckboxOrRadio(normalCheckbox2, { hasBrowserStyleClass: false });
    verifyCheckboxOrRadio(browserStyleCheckbox, {
      hasBrowserStyleClass: true,
    });

    const normalRadio1 = document.getElementById("normalRadio1");
    const normalRadio2 = document.getElementById("normalRadio2");
    const browserStyleRadio = document.getElementById("browserStyleRadio");
    verifyCheckboxOrRadio(normalRadio1, { hasBrowserStyleClass: false });
    verifyCheckboxOrRadio(normalRadio2, { hasBrowserStyleClass: false });
    verifyCheckboxOrRadio(browserStyleRadio, { hasBrowserStyleClass: true });

    browser.test.notifyPass("management-ui-browser_style");
  });
  browser.test.sendMessage("management-ui-ready");
}

let extension;
async function startExtension(browser_style) {
  const cloud_file = {
    name: "Mochitest",
    management_url: "management.html",
  };

  switch (browser_style) {
    case "true":
      cloud_file.browser_style = true;
      break;
    case "false":
      cloud_file.browser_style = false;
      break;
  }

  extension = ExtensionTestUtils.loadExtension({
    async background() {
      browser.test.onMessage.addListener(async message => {
        if (message != "set-configured") {
          return;
        }
        const accounts = await browser.cloudFile.getAllAccounts();
        for (const account of accounts) {
          await browser.cloudFile.updateAccount(account.id, {
            configured: true,
          });
        }
        browser.test.sendMessage("ready");
      });
    },
    files: {
      "management.html": `<html>
        <body>
          <a id="a" href="https://www.example.com/">Click me!</a>
          <button id="normalButton" name="button" class="default">Default</button>
          <button id="browserStyleButton" name="button" class="browser-style default">Default</button>

          <input id="normalCheckbox1" type="checkbox"/>
          <input id="normalCheckbox2" type="checkbox"/><label>Checkbox</label>
          <div class="browser-style">
            <input id="browserStyleCheckbox" type="checkbox"><label for="browserStyleCheckbox">Checkbox</label>
          </div>

          <input id="normalRadio1" type="radio"/>
          <input id="normalRadio2" type="radio"/><label>Radio</label>
          <div class="browser-style">
            <input id="browserStyleRadio" checked="" type="radio"><label for="browserStyleRadio">Radio</label>
          </div>
        </body>
        <script src="management.js" type="text/javascript"></script>
      </html>`,
      "management.js": ManagementScript,
    },
    manifest: {
      cloud_file,
      applications: { gecko: { id: "cloudfile@mochitest" } },
    },
  });

  info("Starting extension");
  await extension.startup();

  if (accountIsConfigured) {
    extension.sendMessage("set-configured");
    await extension.awaitMessage("ready");
  }
}

add_task(async () => {
  // Register a fake provider representing a built-in provider. We don't
  // currently ship any built-in providers, but if we did, we should check
  // if they are present before doing this. Built-in providers can be
  // problematic for artifact builds.
  cloudFileAccounts.registerProvider("Fake-Test", {
    displayName: "XYZ Fake",
    type: "ext-fake@extensions.thunderbird.net",
  });
  registerCleanupFunction(() => {
    cloudFileAccounts.unregisterProvider("Fake-Test");
  });
});

let accountIsConfigured = false;

// Mock the prompt service. We're going to be asked if we're sure
// we want to remove an account, so let's say yes.

/** @implements {nsIPromptService} */
const mockPromptService = {
  confirmCount: 0,
  confirm() {
    this.confirmCount++;
    return true;
  },
  QueryInterface: ChromeUtils.generateQI(["nsIPromptService"]),
};
/** @implements {nsIExternalProtocolService} */
const mockExternalProtocolService = {
  _loadedURLs: [],
  externalProtocolHandlerExists() {},
  getApplicationDescription() {},
  getProtocolHandlerInfo() {},
  getProtocolHandlerInfoFromOS() {},
  isExposedProtocol() {},
  loadURI(aURI) {
    this._loadedURLs.push(aURI.spec);
  },
  setProtocolHandlerDefaults() {},
  urlLoaded(aURL) {
    return this._loadedURLs.includes(aURL);
  },
  QueryInterface: ChromeUtils.generateQI(["nsIExternalProtocolService"]),
};

const originalPromptService = Services.prompt;
Services.prompt = mockPromptService;

const mockExternalProtocolServiceCID = MockRegistrar.register(
  "@mozilla.org/uriloader/external-protocol-service;1",
  mockExternalProtocolService
);

registerCleanupFunction(() => {
  Services.prompt = originalPromptService;
  MockRegistrar.unregister(mockExternalProtocolServiceCID);
});

add_task(async function addRemoveAccounts() {
  is(cloudFileAccounts.providers.length, 1);
  is(cloudFileAccounts.accounts.length, 0);

  // Load the preferences tab.

  const { prefsDocument, prefsWindow } = await openNewPrefsTab(
    "paneCompose",
    "compositionAttachmentsCategory"
  );

  // Check everything is as it should be.

  const accountList = prefsDocument.getElementById("cloudFileView");
  is(accountList.itemCount, 0);

  const buttonList = prefsDocument.getElementById("addCloudFileAccountButtons");
  ok(!buttonList.hidden);
  is(buttonList.childElementCount, 1);
  is(
    buttonList.children[0].getAttribute("value"),
    "ext-fake@extensions.thunderbird.net"
  );

  const menuButton = prefsDocument.getElementById("addCloudFileAccount");
  ok(menuButton.hidden);
  is(menuButton.itemCount, 1);
  is(
    menuButton.getItemAtIndex(0).getAttribute("value"),
    "ext-fake@extensions.thunderbird.net"
  );

  const removeButton = prefsDocument.getElementById("removeCloudFileAccount");
  ok(removeButton.disabled);

  const cloudFileDefaultPanel = prefsDocument.getElementById(
    "cloudFileDefaultPanel"
  );
  ok(!cloudFileDefaultPanel.hidden);

  const browserWrapper = prefsDocument.getElementById(
    "cloudFileSettingsWrapper"
  );
  is(browserWrapper.childElementCount, 0);

  // Register our test provider.

  await startExtension();
  is(cloudFileAccounts.providers.length, 2);
  is(cloudFileAccounts.accounts.length, 0);

  await new Promise(resolve => prefsWindow.requestAnimationFrame(resolve));

  is(buttonList.childElementCount, 2);
  is(
    buttonList.children[0].getAttribute("value"),
    "ext-fake@extensions.thunderbird.net"
  );
  is(buttonList.children[1].getAttribute("value"), "ext-cloudfile@mochitest");
  is(
    buttonList.children[1].style.listStyleImage,
    `url("chrome://messenger/content/extension.svg")`
  );

  is(menuButton.itemCount, 2);
  is(
    menuButton.getItemAtIndex(0).getAttribute("value"),
    "ext-fake@extensions.thunderbird.net"
  );
  is(
    menuButton.getItemAtIndex(1).getAttribute("value"),
    "ext-cloudfile@mochitest"
  );
  is(
    menuButton.getItemAtIndex(1).getAttribute("image"),
    "chrome://messenger/content/extension.svg"
  );

  // Create a new account.

  EventUtils.synthesizeMouseAtCenter(
    buttonList.children[1],
    { clickCount: 1 },
    prefsWindow
  );
  is(cloudFileAccounts.accounts.length, 1);
  is(cloudFileAccounts.configuredAccounts.length, 0);

  const account = cloudFileAccounts.accounts[0];
  const accountKey = account.accountKey;
  is(cloudFileAccounts.accounts[0].type, "ext-cloudfile@mochitest");

  // Check prefs were updated.

  is(
    Services.prefs.getCharPref(
      `mail.cloud_files.accounts.${accountKey}.displayName`
    ),
    "Mochitest"
  );
  is(
    Services.prefs.getCharPref(`mail.cloud_files.accounts.${accountKey}.type`),
    "ext-cloudfile@mochitest"
  );

  // Check UI was updated.

  is(accountList.itemCount, 1);
  is(accountList.selectedIndex, 0);
  ok(!removeButton.disabled);

  let accountListItem = accountList.selectedItem;
  is(accountListItem.getAttribute("value"), accountKey);
  is(
    accountListItem.querySelector(".typeIcon:not(.configuredWarning)").src,
    "chrome://messenger/content/extension.svg"
  );
  is(accountListItem.querySelector("label").value, "Mochitest");
  is(accountListItem.querySelector(".configuredWarning").hidden, false);

  ok(cloudFileDefaultPanel.hidden);
  is(browserWrapper.childElementCount, 1);

  const browser = browserWrapper.firstElementChild;
  if (
    browser.webProgress?.isLoadingDocument ||
    browser.currentURI?.spec == "about:blank"
  ) {
    await BrowserTestUtils.browserLoaded(browser);
  }
  is(
    browser.currentURI.pathQueryRef,
    `/management.html?accountId=${accountKey}`
  );
  await extension.awaitMessage("management-ui-ready");

  const tabmail = document.getElementById("tabmail");
  const tabCount = tabmail.tabInfo.length;
  BrowserTestUtils.synthesizeMouseAtCenter("a", {}, browser);
  // It might take a moment to get to the external protocol service.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 500));
  ok(
    mockExternalProtocolService.urlLoaded("https://www.example.com/"),
    "Link click sent to external protocol service."
  );
  is(tabmail.tabInfo.length, tabCount, "No new tab opened");

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
  is(accountListItem.querySelector("input").value, "Mochitest");
  EventUtils.synthesizeKey("VK_RIGHT", undefined, prefsWindow);
  EventUtils.synthesizeKey("!", undefined, prefsWindow);
  EventUtils.synthesizeKey("VK_RETURN", undefined, prefsWindow);

  await new Promise(resolve => prefsWindow.requestAnimationFrame(resolve));

  is(prefsDocument.activeElement, accountList);
  ok(!accountListItem.querySelector("label").hidden);
  is(accountListItem.querySelector("label").value, "Mochitest!");
  ok(accountListItem.querySelector("input").hidden);
  is(
    Services.prefs.getCharPref(
      `mail.cloud_files.accounts.${accountKey}.displayName`
    ),
    "Mochitest!"
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
  is(accountListItem.querySelector("label").value, "Mochitest!");
  ok(accountListItem.querySelector("input").hidden);
  is(
    Services.prefs.getCharPref(
      `mail.cloud_files.accounts.${accountKey}.displayName`
    ),
    "Mochitest!"
  );

  // Configure the account.

  account.configured = true;
  accountIsConfigured = true;
  cloudFileAccounts.emit("accountConfigured", account);

  await new Promise(resolve => prefsWindow.requestAnimationFrame(resolve));

  is(accountListItem.querySelector(".configuredWarning").hidden, true);
  is(cloudFileAccounts.accounts.length, 1);
  is(cloudFileAccounts.configuredAccounts.length, 1);

  // Remove the test provider. The list item, button, and browser should disappear.

  info("Stopping extension");
  await extension.unload();
  is(cloudFileAccounts.providers.length, 1);
  is(cloudFileAccounts.accounts.length, 0);

  await new Promise(resolve => prefsWindow.requestAnimationFrame(resolve));

  is(buttonList.childElementCount, 1);
  is(
    buttonList.children[0].getAttribute("value"),
    "ext-fake@extensions.thunderbird.net"
  );
  is(menuButton.itemCount, 1);
  is(
    menuButton.getItemAtIndex(0).getAttribute("value"),
    "ext-fake@extensions.thunderbird.net"
  );
  is(accountList.itemCount, 0);
  ok(!cloudFileDefaultPanel.hidden);
  is(browserWrapper.childElementCount, 0);

  // Re-add the test provider.

  await startExtension();

  is(cloudFileAccounts.providers.length, 2);
  is(cloudFileAccounts.accounts.length, 1);
  is(cloudFileAccounts.configuredAccounts.length, 1);

  await new Promise(resolve => prefsWindow.requestAnimationFrame(resolve));

  is(buttonList.childElementCount, 2);
  is(
    buttonList.children[0].getAttribute("value"),
    "ext-fake@extensions.thunderbird.net"
  );
  is(buttonList.children[1].getAttribute("value"), "ext-cloudfile@mochitest");

  is(menuButton.itemCount, 2);
  is(
    menuButton.getItemAtIndex(0).getAttribute("value"),
    "ext-fake@extensions.thunderbird.net"
  );
  is(
    menuButton.getItemAtIndex(1).getAttribute("value"),
    "ext-cloudfile@mochitest"
  );

  is(accountList.itemCount, 1);
  is(accountList.selectedIndex, -1);
  ok(removeButton.disabled);

  accountListItem = accountList.getItemAtIndex(0);
  is(
    Services.prefs.getCharPref(
      `mail.cloud_files.accounts.${accountKey}.displayName`
    ),
    "Mochitest!"
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

  info("Stopping extension");
  await extension.unload();
  is(cloudFileAccounts.providers.length, 1);
  is(cloudFileAccounts.accounts.length, 0);

  // Close the preferences tab.

  await closePrefsTab();
});

async function subtestBrowserStyle(assertMessage, expected) {
  is(cloudFileAccounts.providers.length, 1);
  is(cloudFileAccounts.accounts.length, 0);

  // Load the preferences tab.

  const { prefsDocument, prefsWindow } = await openNewPrefsTab(
    "paneCompose",
    "compositionAttachmentsCategory"
  );

  // Minimal check everything is as it should be.

  const accountList = prefsDocument.getElementById("cloudFileView");
  is(accountList.itemCount, 0);

  const buttonList = prefsDocument.getElementById("addCloudFileAccountButtons");
  ok(!buttonList.hidden);

  const browserWrapper = prefsDocument.getElementById(
    "cloudFileSettingsWrapper"
  );
  is(browserWrapper.childElementCount, 0);

  // Register our test provider.

  await startExtension(expected.browser_style);
  is(cloudFileAccounts.providers.length, 2);
  is(cloudFileAccounts.accounts.length, 0);

  await new Promise(resolve => prefsWindow.requestAnimationFrame(resolve));

  is(buttonList.childElementCount, 2);
  is(buttonList.children[1].getAttribute("value"), "ext-cloudfile@mochitest");

  // Create a new account.

  EventUtils.synthesizeMouseAtCenter(
    buttonList.children[1],
    { clickCount: 1 },
    prefsWindow
  );
  is(cloudFileAccounts.accounts.length, 1);
  is(cloudFileAccounts.configuredAccounts.length, 0);

  const account = cloudFileAccounts.accounts[0];
  const accountKey = account.accountKey;
  is(cloudFileAccounts.accounts[0].type, "ext-cloudfile@mochitest");

  // Minimal check UI was updated.

  is(accountList.itemCount, 1);
  is(accountList.selectedIndex, 0);

  let accountListItem = accountList.selectedItem;
  is(accountListItem.getAttribute("value"), accountKey);

  is(browserWrapper.childElementCount, 1);
  const browser = browserWrapper.firstElementChild;
  if (
    browser.webProgress?.isLoadingDocument ||
    browser.currentURI?.spec == "about:blank"
  ) {
    await BrowserTestUtils.browserLoaded(browser);
  }
  is(
    browser.currentURI.pathQueryRef,
    `/management.html?accountId=${accountKey}`
  );
  await extension.awaitMessage("management-ui-ready");

  // Test browser_style

  extension.sendMessage(
    "check-style",
    assertMessage,
    expected.browser_style == "true"
  );
  await extension.awaitFinish("management-ui-browser_style");

  // Remove the account

  accountListItem = accountList.getItemAtIndex(0);
  EventUtils.synthesizeMouseAtCenter(
    accountList.getItemAtIndex(0),
    { clickCount: 1 },
    prefsWindow
  );

  const removeButton = prefsDocument.getElementById("removeCloudFileAccount");
  ok(!removeButton.disabled);
  EventUtils.synthesizeMouseAtCenter(
    removeButton,
    { clickCount: 1 },
    prefsWindow
  );
  is(mockPromptService.confirmCount, expected.confirmCount);

  is(cloudFileAccounts.providers.length, 2);
  is(cloudFileAccounts.accounts.length, 0);

  info("Stopping extension");
  await extension.unload();
  is(cloudFileAccounts.providers.length, 1);
  is(cloudFileAccounts.accounts.length, 0);

  // Close the preferences tab.

  await closePrefsTab();
}

add_task(async function test_without_setting_browser_style() {
  await subtestBrowserStyle(
    "Expected correct style when browser_style is excluded",
    {
      confirmCount: 2,
      browser_style: "default",
    }
  );
});

add_task(async function test_with_browser_style_set_to_true() {
  await subtestBrowserStyle(
    "Expected correct style when browser_style is set to `true`",
    {
      confirmCount: 3,
      browser_style: "true",
    }
  );
});

add_task(async function test_with_browser_style_set_to_false() {
  await subtestBrowserStyle(
    "Expected no style when browser_style is set to `false`",
    {
      confirmCount: 4,
      browser_style: "false",
    }
  );
});

add_task(async function accountListOverflow() {
  is(cloudFileAccounts.providers.length, 1);
  is(cloudFileAccounts.accounts.length, 0);

  // Register our test provider.

  await startExtension();

  is(cloudFileAccounts.providers.length, 2);
  is(cloudFileAccounts.accounts.length, 0);

  // Load the preferences tab.

  const { prefsDocument, prefsWindow } = await openNewPrefsTab(
    "paneCompose",
    "compositionAttachmentsCategory"
  );

  const accountList = prefsDocument.getElementById("cloudFileView");
  is(accountList.itemCount, 0);

  const buttonList = prefsDocument.getElementById("addCloudFileAccountButtons");
  ok(!buttonList.hidden);
  is(buttonList.childElementCount, 2);
  is(buttonList.children[0].getAttribute("value"), "ext-cloudfile@mochitest");

  const menuButton = prefsDocument.getElementById("addCloudFileAccount");
  ok(menuButton.hidden);

  // Add new accounts until the list overflows. The list of buttons should be hidden
  // and the button with the drop-down should appear.

  let count = 0;
  do {
    const readyPromise = extension.awaitMessage("management-ui-ready");
    EventUtils.synthesizeMouseAtCenter(
      buttonList.children[0],
      { clickCount: 1 },
      prefsWindow
    );
    await readyPromise;
    // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
    await new Promise(r => setTimeout(r, 500));
    if (buttonList.hidden) {
      break;
    }
  } while (++count < 25);

  Assert.less(count, 24); // If count reaches 25, we have a problem.
  ok(!menuButton.hidden);

  // Remove the added accounts. The list of buttons should not reappear and the
  // button with the drop-down should remain.

  const removeButton = prefsDocument.getElementById("removeCloudFileAccount");
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
  info("Stopping extension");
  await extension.unload();
  Services.prefs.deleteBranch("mail.cloud_files.accounts");
});

add_task(async function accountListOrder() {
  is(cloudFileAccounts.providers.length, 1);
  is(cloudFileAccounts.accounts.length, 0);

  for (const [key, displayName] of [
    ["someKey1", "carl's Account"],
    ["someKey2", "Amber's Account"],
    ["someKey3", "alice's Account"],
    ["someKey4", "Bob's Account"],
  ]) {
    Services.prefs.setCharPref(
      `mail.cloud_files.accounts.${key}.type`,
      "ext-cloudfile@mochitest"
    );
    Services.prefs.setCharPref(
      `mail.cloud_files.accounts.${key}.displayName`,
      displayName
    );
  }

  // Register our test provider.

  await startExtension();

  is(cloudFileAccounts.providers.length, 2);
  is(cloudFileAccounts.accounts.length, 4);

  const { prefsDocument } = await openNewPrefsTab(
    "paneCompose",
    "compositionAttachmentsCategory"
  );

  const accountList = prefsDocument.getElementById("cloudFileView");
  is(accountList.itemCount, 4);

  is(accountList.getItemAtIndex(0).value, "someKey3");
  is(accountList.getItemAtIndex(1).value, "someKey2");
  is(accountList.getItemAtIndex(2).value, "someKey4");
  is(accountList.getItemAtIndex(3).value, "someKey1");

  await closePrefsTab();
  info("Stopping extension");
  await extension.unload();
  Services.prefs.deleteBranch("mail.cloud_files.accounts");
});
