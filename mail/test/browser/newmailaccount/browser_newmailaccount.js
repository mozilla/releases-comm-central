/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the new account provisioner workflow.
 */

"use strict";

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { gMockPromptService } = ChromeUtils.importESModule(
  "resource://testing-common/mail/PromptHelpers.sys.mjs"
);
var { promise_content_tab_load } = ChromeUtils.importESModule(
  "resource://testing-common/mail/ContentTabHelpers.sys.mjs"
);
var { remove_email_account } = ChromeUtils.importESModule(
  "resource://testing-common/mail/NewMailAccountHelpers.sys.mjs"
);
var { openAccountProvisioner, openAccountSetup } = ChromeUtils.importESModule(
  "resource://testing-common/mail/AccountManagerHelpers.sys.mjs"
);
var { input_value } = ChromeUtils.importESModule(
  "resource://testing-common/mail/KeyboardHelpers.sys.mjs"
);
const { TelemetryTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TelemetryTestUtils.sys.mjs"
);
var { click_through_appmenu, click_menus_in_sequence } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/WindowHelpers.sys.mjs"
  );

// RELATIVE_ROOT messes with the collector, so we have to bring the path back
// so we get the right path for the resources.
var url =
  "http://mochi.test:8888/browser/comm/mail/test/browser/newmailaccount/html/";
var kProvisionerEnabledPref = "mail.provider.enabled";
var kSuggestFromNamePref = "mail.provider.suggestFromName";
var kProviderListPref = "mail.provider.providerList";

Services.prefs.setCharPref(kProviderListPref, url + "providerList");
Services.prefs.setCharPref(kSuggestFromNamePref, url + "suggestFromName");

// Here's a name that we'll type in later on. It's a global const because
// we'll be using it in several distinct modal dialog event loops.
var NAME = "Green Llama";

// Record what the original value of the mail.provider.enabled pref is so
// that we can put it back once the tests are done.
var gProvisionerEnabled = Services.prefs.getBoolPref(kProvisionerEnabledPref);
var gOldAcceptLangs = Services.locale.requestedLocales;
var gNumAccounts;

add_setup(async function () {
  requestLongerTimeout(2);

  // Make sure we enable the Account Provisioner.
  Services.prefs.setBoolPref(kProvisionerEnabledPref, true);
  // Restrict the user's language to just en-US
  Services.locale.requestedLocales = ["en-US"];
});

registerCleanupFunction(async function () {
  // Put the mail.provider.enabled pref back the way it was.
  Services.prefs.setBoolPref(kProvisionerEnabledPref, gProvisionerEnabled);
  // And same with the user languages
  Services.locale.requestedLocales = gOldAcceptLangs;

  // Some tests that open new windows don't return focus to the main window
  // in a way that satisfies mochitest, and the test times out.
  Services.focus.focusedWindow = window;
});

/**
 * Helper function that returns the number of accounts associated with the
 * current profile.
 */
function nAccounts() {
  return MailServices.accounts.accounts.length;
}

/**
 * Helper function to wait for the load of the account providers.
 *
 * @param {object} tab - The opened account provisioner tab.
 */
async function waitForLoadedProviders(tab) {
  const gProvisioner = await TestUtils.waitForCondition(
    () => tab.browser.contentWindow.gAccountProvisioner
  );

  // We got the correct amount of email and domain providers.
  await BrowserTestUtils.waitForCondition(
    () => gProvisioner.mailProviders.length == 4,
    "Correctly loaded 4 email providers"
  );
  await BrowserTestUtils.waitForCondition(
    () => gProvisioner.domainProviders.length == 3,
    "Correctly loaded 3 domain providers"
  );
}

/**
 * Test a full account creation with an email provider.
 */
add_task(async function test_account_creation_from_provisioner() {
  Services.telemetry.clearScalars();

  let tab = await openAccountProvisioner();
  const tabDocument = tab.browser.contentWindow.document;

  const mailInput = tabDocument.getElementById("mailName");
  // The focus is on the email input.
  await BrowserTestUtils.waitForCondition(
    () => tabDocument.activeElement == mailInput,
    "The mailForm input field has the focus"
  );

  await waitForLoadedProviders(tab);

  let scalars = TelemetryTestUtils.getProcessScalars("parent");
  Assert.equal(
    scalars["tb.account.opened_account_provisioner"],
    1,
    "Count of opened account provisioner must be correct"
  );

  // The application will prefill these fields with the account name, if present
  // so we need to select it before typing the new name to avoid mismatch in the
  // expected strings during testing.
  mailInput.select();
  // Fill the email input.
  input_value(window, NAME);
  // Since we're focused inside a form, pressing "Enter" should submit it.
  EventUtils.synthesizeKey("VK_RETURN", {}, window);

  const mailResults = tabDocument.getElementById("mailResultsArea");

  // Wait for the results to be loaded.
  await BrowserTestUtils.waitForCondition(
    () => mailResults.hasChildNodes(),
    "Mail results loaded"
  );
  // We should have a total of 15 addresses.
  await BrowserTestUtils.waitForCondition(
    () => mailResults.querySelectorAll(".result-item").length == 14,
    "All suggested emails were correctly loaded"
  );

  // The domain section should be hidden and the buttons should be updated.
  Assert.ok(
    tabDocument.getElementById("domainSearch").hidden &&
      !tabDocument.getElementById("mailSearchResults").hidden &&
      tabDocument.getElementById("cancelButton").hidden &&
      tabDocument.getElementById("existingButton").hidden &&
      !tabDocument.getElementById("backButton").hidden
  );

  // Go back and fill the domain input.
  const backButton = tabDocument.getElementById("backButton");
  backButton.scrollIntoView();
  EventUtils.synthesizeMouseAtCenter(backButton, {}, tab.browser.contentWindow);

  Assert.ok(tabDocument.getElementById("mailSearchResults").hidden);

  const domainName = tabDocument.getElementById("domainName");
  domainName.focus();
  domainName.select();
  // Fill the domain input.
  input_value(window, NAME);
  // Since we're focused inside a form, pressing "Enter" should submit it.
  EventUtils.synthesizeKey("VK_RETURN", {}, window);

  const domainResults = tabDocument.getElementById("domainResultsArea");
  // Wait for the results to be loaded.
  await BrowserTestUtils.waitForCondition(
    () => domainResults.hasChildNodes(),
    "Domain results loaded"
  );
  // We should have a total of 15 addresses.
  await BrowserTestUtils.waitForCondition(
    () => domainResults.querySelectorAll(".result-item").length == 14,
    "All suggested emails and domains were correctly loaded"
  );

  // The domain section should be hidden and the buttons should be updated.
  Assert.ok(
    !tabDocument.getElementById("domainSearch").hidden &&
      tabDocument.getElementById("mailSearchResults").hidden &&
      tabDocument.getElementById("cancelButton").hidden &&
      tabDocument.getElementById("existingButton").hidden &&
      !tabDocument.getElementById("backButton").hidden
  );

  // Go back and confirm both input fields maintained their values.
  backButton.scrollIntoView();
  EventUtils.synthesizeMouseAtCenter(backButton, {}, tab.browser.contentWindow);

  Assert.ok(
    tabDocument.getElementById("domainSearchResults").hidden &&
      tabDocument.getElementById("mailName").value == NAME &&
      tabDocument.getElementById("domainName").value == NAME
  );

  // Continue with the email form.
  tabDocument.getElementById("mailName").focus();
  EventUtils.synthesizeKey("VK_RETURN", {}, window);

  // Wait for the results to be loaded.
  await BrowserTestUtils.waitForCondition(
    () => mailResults.hasChildNodes(),
    "Mail results loaded"
  );
  // We should have a total of 15 addresses.
  await BrowserTestUtils.waitForCondition(
    () => mailResults.querySelectorAll(".result-item").length == 14,
    "All suggested emails were correctly loaded"
  );

  // Select the first button with a price from the results list by pressing Tab
  // twice to move the focus on the first available price button.
  EventUtils.synthesizeKey("VK_TAB", {}, window);
  EventUtils.synthesizeKey("VK_TAB", {}, window);
  await BrowserTestUtils.waitForCondition(
    () =>
      tabDocument.activeElement ==
      mailResults.querySelector(".result-item > button"),
    "The first result button was focused"
  );
  EventUtils.synthesizeKey("VK_RETURN", {}, window);

  // A special tab with the provisioner's API url should be loaded.
  await promise_content_tab_load(undefined, function (aURL) {
    return aURL.schemeIs("http") && aURL.host == "mochi.test";
  });

  scalars = TelemetryTestUtils.getProcessScalars("parent", true);
  Assert.equal(
    scalars["tb.account.selected_account_from_provisioner"]["mochi.test"],
    1,
    "Count of selected email addresses from provisioner must be correct"
  );

  // Close the account provisioner tab, and then restore it.
  document
    .getElementById("tabmail")
    .closeTab(document.getElementById("tabmail").currentTabInfo);
  document.getElementById("tabmail").undoCloseTab();
  // Wait for the page to be loaded again...
  await promise_content_tab_load(undefined, function (aURL) {
    return aURL.schemeIs("http") && aURL.host == "mochi.test";
  });
  tab = document.getElementById("tabmail").currentTabInfo;

  // Record how many accounts we start with.
  gNumAccounts = MailServices.accounts.accounts.length;

  // Simulate the purchase of an email account.
  BrowserTestUtils.synthesizeMouseAtCenter(
    "input[value=Send]",
    {},
    tab.browser
  );

  // The account setup tab should be open and selected.
  await BrowserTestUtils.waitForCondition(
    () =>
      document.getElementById("tabmail").selectedTab.browser?.currentURI
        ?.spec == "about:accountsetup",
    "The Account Setup Tab was opened"
  );
  // A new account should have been created.
  Assert.equal(
    gNumAccounts + 1,
    MailServices.accounts.accounts.length,
    "New account successfully created"
  );

  await BrowserTestUtils.waitForCondition(
    () =>
      document.getElementById("tabmail").selectedTab.browser?.contentWindow
        .gAccountSetup?._currentModename == "success",
    "The success view was shown"
  );

  scalars = TelemetryTestUtils.getProcessScalars("parent", true);
  Assert.equal(
    scalars["tb.account.new_account_from_provisioner"]["mochi.test"],
    1,
    "Count of created accounts from provisioner must be correct"
  );

  // Clean it up.
  remove_email_account("green@example.com");
  // Close the account setup tab.
  document
    .getElementById("tabmail")
    .closeTab(document.getElementById("tabmail").currentTabInfo);
});

/**
 * Test the opening and closing workflow between account setup and provisioner.
 */
add_task(async function test_switch_between_account_provisioner_and_setup() {
  let tab = await openAccountProvisioner();
  let tabDocument = tab.browser.contentWindow.document;

  await waitForLoadedProviders(tab);

  // Close the tab.
  const closeButton = tabDocument.getElementById("cancelButton");
  closeButton.scrollIntoView();
  EventUtils.synthesizeMouseAtCenter(
    closeButton,
    {},
    tab.browser.contentWindow
  );

  // The account setup tab should NOT be opened.
  await BrowserTestUtils.waitForCondition(
    () =>
      document.getElementById("tabmail").selectedTab.browser?.currentURI
        ?.spec != "about:accountsetup",
    "The Account Setup Tab was not opened"
  );

  tab = await openAccountProvisioner();
  tabDocument = tab.browser.contentWindow.document;

  await waitForLoadedProviders(
    document.getElementById("tabmail").currentTabInfo
  );

  // Click on the "Use existing account" button.
  const existingAccountButton = tabDocument.getElementById("existingButton");
  existingAccountButton.scrollIntoView();
  EventUtils.synthesizeMouseAtCenter(
    existingAccountButton,
    {},
    tab.browser.contentWindow
  );

  // The account setup tab should be open and selected.
  await BrowserTestUtils.waitForCondition(
    () =>
      document.getElementById("tabmail").selectedTab.browser?.currentURI
        ?.spec == "about:accountsetup",
    "The Account Setup Tab was opened"
  );

  // Close the account setup tab.
  document
    .getElementById("tabmail")
    .closeTab(document.getElementById("tabmail").currentTabInfo);
});

/**
 * Test opening the account provisioner from the menu bar.
 */
add_task(async function open_provisioner_from_menu_bar() {
  // Show menubar so we can click it.
  document.getElementById("toolbar-menubar").removeAttribute("autohide");

  EventUtils.synthesizeMouseAtCenter(
    document.getElementById("menu_File"),
    {},
    window
  );
  await click_menus_in_sequence(document.getElementById("menu_FilePopup"), [
    { id: "menu_New" },
    { id: "newCreateEmailAccountMenuItem" },
  ]);

  // The account Provisioner tab should be open and selected.
  await BrowserTestUtils.waitForCondition(
    () =>
      document.getElementById("tabmail").selectedTab.browser?.currentURI
        ?.spec == "about:accountprovisioner",
    "The Account Provisioner Tab was opened"
  );
  await waitForLoadedProviders(
    document.getElementById("tabmail").currentTabInfo
  );

  // Close the account provisioner tab.
  document
    .getElementById("tabmail")
    .closeTab(document.getElementById("tabmail").currentTabInfo);
}).__skipMe = AppConstants.platform == "macosx"; // Can't click menu bar on Mac.

/**
 * Test opening the account provisioner from the main app menu.
 */
add_task(async function open_provisioner_from_app_menu() {
  EventUtils.synthesizeMouseAtCenter(
    document.getElementById("button-appmenu"),
    {},
    window
  );
  await click_through_appmenu(
    [{ id: "appmenu_new" }],
    {
      id: "appmenu_newCreateEmailAccountMenuItem",
    },
    window
  );

  // The account Provisioner tab should be open and selected.
  await BrowserTestUtils.waitForCondition(
    () =>
      document.getElementById("tabmail").selectedTab.browser?.currentURI
        ?.spec == "about:accountprovisioner",
    "The Account Provisioner Tab was opened"
  );
  await waitForLoadedProviders(
    document.getElementById("tabmail").currentTabInfo
  );

  // Close the account provisioner tab.
  document
    .getElementById("tabmail")
    .closeTab(document.getElementById("tabmail").currentTabInfo);
}).skip();

/**
 * Test that names with HTML characters are escaped properly when displayed back
 * to the user.
 */
add_task(async function test_html_characters_and_ampersands() {
  const tab = await openAccountProvisioner();
  const tabDocument = tab.browser.contentWindow.document;

  await waitForLoadedProviders(tab);

  // Type a name with some HTML tags and an ampersand in there to see if we can
  // trip up account provisioner.
  const CLEVER_STRING =
    "<i>Hey, I'm ''clever &\"\" smart!<!-- Ain't I a stinkah? --></i>";

  // Fill the email input.
  input_value(window, CLEVER_STRING);
  // Since we're focused inside a form, pressing "Enter" should submit it.
  EventUtils.synthesizeKey("VK_RETURN", {}, window);

  const mailResults = tabDocument.getElementById("mailResultsArea");

  // Wait for the results to be loaded.
  await BrowserTestUtils.waitForCondition(
    () => mailResults.hasChildNodes(),
    "Mail results loaded"
  );

  const searchedTerms =
    tabDocument.getElementById("mailResultsTitle").textContent;
  Assert.notEqual(
    `One available address found for: "${CLEVER_STRING}"`,
    searchedTerms
  );

  // & should have been replaced with &amp;, and the greater than / less than
  // characters with &gt; and &lt; respectively.
  Assert.ok(
    searchedTerms.includes("&amp;"),
    "Should have eliminated ampersands"
  );
  Assert.ok(
    searchedTerms.includes("&gt;"),
    "Should have eliminated greater-than signs"
  );
  Assert.ok(
    searchedTerms.includes("&lt;"),
    "Should have eliminated less-than signs"
  );

  // Close the account provisioner tab.
  document
    .getElementById("tabmail")
    .closeTab(document.getElementById("tabmail").currentTabInfo);
});

/**
 * Test that if the search goes bad on the server-side we show an error.
 */
add_task(async function test_shows_error_on_bad_suggest_from_name() {
  const original = Services.prefs.getCharPref(kSuggestFromNamePref);
  Services.prefs.setCharPref(kSuggestFromNamePref, url + "badSuggestFromName");

  const tab = await openAccountProvisioner();

  await waitForLoadedProviders(tab);

  const notificationBox =
    tab.browser.contentWindow.gAccountProvisioner.notificationBox;

  const notificationShowed = BrowserTestUtils.waitForCondition(
    () =>
      notificationBox.getNotificationWithValue("accountProvisionerError") !=
      null,
    "Timeout waiting for error notification to be showed"
  );

  // Fill the email input.
  input_value(window, "Boston Low");
  // Since we're focused inside a form, pressing "Enter" should submit it.
  EventUtils.synthesizeKey("VK_RETURN", {}, window);

  // Wait for the error notification.
  await notificationShowed;

  // Close the account provisioner tab.
  document
    .getElementById("tabmail")
    .closeTab(document.getElementById("tabmail").currentTabInfo);
  Services.prefs.setCharPref(kSuggestFromNamePref, original);
});

/**
 * Tests that if a provider returns broken or erroneous XML back to the user
 * after account registration, we show an alert dialog.
 */
add_task(async function test_error_on_corrupt_XML() {
  // Register the prompt service to handle the alert() dialog.
  gMockPromptService.register();

  let tab = await openAccountProvisioner();
  const tabDocument = tab.browser.contentWindow.document;

  // Record how many accounts we start with.
  gNumAccounts = nAccounts();

  await waitForLoadedProviders(tab);

  // Fill the email input.
  input_value(window, "corrupt@corrupt.invalid");
  // Since we're focused inside a form, pressing "Enter" should submit it.
  EventUtils.synthesizeKey("VK_RETURN", {}, window);

  const mailResults = tabDocument.getElementById("mailResultsArea");

  // Wait for the results to be loaded.
  await BrowserTestUtils.waitForCondition(
    () => mailResults.hasChildNodes(),
    "Mail results loaded"
  );
  // We should have a total of 15 addresses.
  await BrowserTestUtils.waitForCondition(
    () => mailResults.querySelectorAll(".result-item").length == 14,
    "All suggested emails were correctly loaded"
  );

  const priceButton = tabDocument.querySelector(
    `.result-item[data-label="corrupt@corrupt.invalid"] .result-price`
  );
  priceButton.scrollIntoView();

  EventUtils.synthesizeMouseAtCenter(
    priceButton,
    {},
    tab.browser.contentWindow
  );

  // A special tab with the provisioner's API url should be loaded.
  await promise_content_tab_load(undefined, function (aURL) {
    return aURL.schemeIs("http") && aURL.host == "mochi.test";
  });
  tab = document.getElementById("tabmail").currentTabInfo;

  gMockPromptService.returnValue = true;

  // Simulate the purchase of an email account.
  BrowserTestUtils.synthesizeMouseAtCenter(
    "input[value=Send]",
    {},
    tab.browser
  );
  await BrowserTestUtils.waitForCondition(
    () =>
      document.getElementById("tabmail").selectedTab.browser?.currentURI
        ?.spec == "about:accountprovisioner",
    "The Account Provisioner Tab was opened"
  );

  const promptState = gMockPromptService.promptState;
  Assert.equal("alert", promptState.method, "An alert was showed");

  Assert.equal(gNumAccounts, nAccounts(), "No new accounts have been created");

  // Clean up
  gMockPromptService.unregister();

  // Close the account setup tab.
  document.getElementById("tabmail").closeTab(tab);
  document
    .getElementById("tabmail")
    .closeTab(document.getElementById("tabmail").currentTabInfo);
});

/**
 * Tests that when we pref off the Account Provisioner, the menuitem for it
 * becomes hidden, and the button to switch to it from the Existing Account
 * wizard also becomes hidden.  Note that this doesn't test explicitly
 * whether or not the Account Provisioner spawns when there are no accounts.
 * The tests in this file will fail if the Account Provisioner does not spawn
 * with no accounts, and when preffed off, if the Account Provisioner does
 * spawn (which it shouldn't), the instrumentation Mozmill test should fail.
 */
add_task(async function test_can_pref_off_account_provisioner() {
  // First, we'll disable the account provisioner.
  Services.prefs.setBoolPref("mail.provider.enabled", false);

  // Show menubar so we can click it.
  document.getElementById("toolbar-menubar").removeAttribute("autohide");

  EventUtils.synthesizeMouseAtCenter(
    document.getElementById("menu_File"),
    {},
    window
  );
  await click_menus_in_sequence(document.getElementById("menu_FilePopup"), [
    { id: "menu_New" },
  ]);

  // Ensure that the "Get a new mail account" menuitem is no longer available.
  Assert.ok(
    document.getElementById("newCreateEmailAccountMenuItem").hidden,
    "new account menu should be hidden"
  );

  // Close all existing tabs except the first mail tab to avoid errors.
  document
    .getElementById("tabmail")
    .closeOtherTabs(document.getElementById("tabmail").tabInfo[0]);

  // Open up the Account Hub.
  let tab = await openAccountSetup();
  // And make sure the Get a New Account button is hidden.
  Assert.ok(
    tab.browser.contentWindow.document.getElementById("provisionerButton")
      .hidden
  );
  // Close the Account Hub tab.
  document.getElementById("tabmail").closeTab(tab);

  // Ok, now pref the Account Provisioner back on
  Services.prefs.setBoolPref("mail.provider.enabled", true);

  EventUtils.synthesizeMouseAtCenter(
    document.getElementById("menu_File"),
    {},
    window
  );
  await click_menus_in_sequence(document.getElementById("menu_FilePopup"), [
    { id: "menu_New" },
  ]);
  Assert.ok(
    !document.getElementById("newCreateEmailAccountMenuItem").hidden,
    "new account menu should show"
  );

  // Open up the Account Hub.
  tab = await openAccountSetup();
  // And make sure the Get a New Account button is hidden.
  Assert.ok(
    !tab.browser.contentWindow.document.getElementById("provisionerButton")
      .hidden
  );
  // Close the Account Hub tab.
  document.getElementById("tabmail").closeTab(tab);
}).__skipMe = AppConstants.platform == "macosx"; // Can't click menu bar on Mac.
