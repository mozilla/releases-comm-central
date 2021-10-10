/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the new account provisioner workflow.
 */

"use strict";

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { gMockPromptService } = ChromeUtils.import(
  "resource://testing-common/mozmill/PromptHelpers.jsm"
);
var { wait_for_content_tab_load } = ChromeUtils.import(
  "resource://testing-common/mozmill/ContentTabHelpers.jsm"
);
var { mc } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { remove_email_account } = ChromeUtils.import(
  "resource://testing-common/mozmill/NewMailAccountHelpers.jsm"
);
var { openAccountProvisioner, openAccountSetup } = ChromeUtils.import(
  "resource://testing-common/mozmill/AccountManagerHelpers.jsm"
);
var { input_value } = ChromeUtils.import(
  "resource://testing-common/mozmill/KeyboardHelpers.jsm"
);

// RELATIVE_ROOT messes with the collector, so we have to bring the path back
// so we get the right path for the resources.
var url =
  "http://mochi.test:8888/browser/comm/mail/test/browser/newmailaccount/html/";
var kProvisionerUrl =
  "chrome://messenger/content/newmailaccount/accountProvisioner.xhtml";
var kProvisionerEnabledPref = "mail.provider.enabled";
var kSuggestFromNamePref = "mail.provider.suggestFromName";
var kProviderListPref = "mail.provider.providerList";
var kDefaultServerPort = 4444;
var kDefaultServerRoot = "http://localhost:" + kDefaultServerPort;
var gDefaultEngine;

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

add_task(async function setupModule(module) {
  requestLongerTimeout(2);

  // Make sure we enable the Account Provisioner.
  Services.prefs.setBoolPref(kProvisionerEnabledPref, true);
  // Restrict the user's language to just en-US
  Services.locale.requestedLocales = ["en-US"];
});

registerCleanupFunction(async function teardownModule(module) {
  // Put the mail.provider.enabled pref back the way it was.
  Services.prefs.setBoolPref(kProvisionerEnabledPref, gProvisionerEnabled);
  // And same with the user languages
  Services.locale.requestedLocales = gOldAcceptLangs;

  // Some tests that open new windows don't return focus to the main window
  // in a way that satisfies mochitest, and the test times out.
  Services.focus.focusedWindow = window;
  window.gFolderDisplay.tree.focus();
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
 * @param {Object} tab - The opened account provisioner tab.
 */
async function waitForLoadedProviders(tab) {
  let gProvisioner = tab.browser.contentWindow.gAccountProvisioner;

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
  let tab = await openAccountProvisioner();
  let tabDocument = tab.browser.contentWindow.document;

  // The focus is on the email input.
  await BrowserTestUtils.waitForCondition(
    () => tabDocument.activeElement == tabDocument.getElementById("mailName"),
    "The mailForm input field has the focus"
  );

  await waitForLoadedProviders(tab);

  // Fill the email input.
  input_value(mc, NAME);
  // Since we're focused inside a form, pressing "Enter" should submit it.
  EventUtils.synthesizeKey("VK_RETURN", {}, mc.window);

  let mailResults = tabDocument.getElementById("mailResultsArea");

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
  let backButton = tabDocument.getElementById("backButton");
  backButton.scrollIntoView();
  EventUtils.synthesizeMouseAtCenter(backButton, {}, tab.browser.contentWindow);

  Assert.ok(tabDocument.getElementById("mailSearchResults").hidden);

  tabDocument.getElementById("domainName").focus();
  // Fill the domain input.
  input_value(mc, NAME);
  // Since we're focused inside a form, pressing "Enter" should submit it.
  EventUtils.synthesizeKey("VK_RETURN", {}, mc.window);

  let domainResults = tabDocument.getElementById("domainResultsArea");
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
  EventUtils.synthesizeKey("VK_RETURN", {}, mc.window);

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
  EventUtils.synthesizeKey("VK_TAB", {}, mc.window);
  EventUtils.synthesizeKey("VK_TAB", {}, mc.window);
  await BrowserTestUtils.waitForCondition(
    () =>
      tabDocument.activeElement == mailResults.querySelector(".result-price"),
    "The first price button was focused"
  );
  EventUtils.synthesizeKey("VK_RETURN", {}, mc.window);

  // A special tab with the provisioner's API url should be loaded.
  wait_for_content_tab_load(undefined, function(aURL) {
    return aURL.host == "mochi.test";
  });
  // Close the account provisioner tab, and then restore it.
  mc.tabmail.closeTab(mc.tabmail.currentTabInfo);
  mc.tabmail.undoCloseTab();
  // Wait for the page to be loaded again...
  wait_for_content_tab_load(undefined, function(aURL) {
    return aURL.host == "mochi.test";
  });
  tab = mc.tabmail.currentTabInfo;

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
      mc.tabmail.selectedTab.browser.currentURI?.spec == "about:accountsetup",
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
      mc.tabmail.selectedTab.browser.contentWindow.gAccountSetup
        ?._currentModename == "success",
    "The success view was shown"
  );

  // Clean it up.
  remove_email_account("green@example.com");
  // Close the account setup tab.
  mc.tabmail.closeTab(mc.tabmail.currentTabInfo);
});

/**
 * Test the opening and closing workflow between account setup and provisioner.
 */
add_task(async function test_switch_between_account_provisioner_and_setup() {
  let tab = await openAccountProvisioner();
  let tabDocument = tab.browser.contentWindow.document;

  // Close the tab.
  let closeButton = tabDocument.getElementById("cancelButton");
  closeButton.scrollIntoView();
  EventUtils.synthesizeMouseAtCenter(
    closeButton,
    {},
    tab.browser.contentWindow
  );

  // The account setup tab should NOT be opened.
  await BrowserTestUtils.waitForCondition(
    () =>
      mc.tabmail.selectedTab.browser.currentURI?.spec != "about:accountsetup",
    "The Account Setup Tab was not opened"
  );

  tab = await openAccountProvisioner();
  tabDocument = tab.browser.contentWindow.document;

  // Click on the "Use existing account" button.
  let existingAccountButton = tabDocument.getElementById("existingButton");
  existingAccountButton.scrollIntoView();
  EventUtils.synthesizeMouseAtCenter(
    existingAccountButton,
    {},
    tab.browser.contentWindow
  );

  // The account setup tab should be open and selected.
  await BrowserTestUtils.waitForCondition(
    () =>
      mc.tabmail.selectedTab.browser.currentURI?.spec == "about:accountsetup",
    "The Account Setup Tab was opened"
  );

  // Close the account setup tab.
  mc.tabmail.closeTab(mc.tabmail.currentTabInfo);
});

/**
 * Test opening the account provisioner from the menu bar.
 */
add_task(async function open_provisioner_from_menu_bar() {
  mc.menus.menu_File.menu_New.newCreateEmailAccountMenuItem.click();

  // The account Provisioner tab should be open and selected.
  await BrowserTestUtils.waitForCondition(
    () =>
      mc.tabmail.selectedTab.browser.currentURI?.spec ==
      "about:accountprovisioner",
    "The Account Provisioner Tab was opened"
  );

  // Close the account provisioner tab.
  mc.tabmail.closeTab(mc.tabmail.currentTabInfo);
}).__skipMe = AppConstants.platform == "macosx"; // Can't click menu bar on Mac.

/**
 * Test opening the account provisioner from the main app menu.
 */
add_task(async function open_provisioner_from_app_menu() {
  EventUtils.synthesizeMouseAtCenter(
    mc.window.document.getElementById("button-appmenu"),
    {},
    mc.window
  );
  mc.click_through_appmenu([{ id: "appmenu_new" }], {
    id: "appmenu_newCreateEmailAccountMenuItem",
  });

  // The account Provisioner tab should be open and selected.
  await BrowserTestUtils.waitForCondition(
    () =>
      mc.tabmail.selectedTab.browser.currentURI?.spec ==
      "about:accountprovisioner",
    "The Account Provisioner Tab was opened"
  );

  // Close the account provisioner tab.
  mc.tabmail.closeTab(mc.tabmail.currentTabInfo);
});

/**
 * Test that names with HTML characters are escaped properly when displayed back
 * to the user.
 */
add_task(async function test_html_characters_and_ampersands() {
  let tab = await openAccountProvisioner();
  let tabDocument = tab.browser.contentWindow.document;

  await waitForLoadedProviders(tab);

  // Type a name with some HTML tags and an ampersand in there to see if we can
  // trip up account provisioner.
  const CLEVER_STRING =
    "<i>Hey, I'm ''clever &\"\" smart!<!-- Ain't I a stinkah? --></i>";

  // Fill the email input.
  input_value(mc, CLEVER_STRING);
  // Since we're focused inside a form, pressing "Enter" should submit it.
  EventUtils.synthesizeKey("VK_RETURN", {}, mc.window);

  let mailResults = tabDocument.getElementById("mailResultsArea");

  // Wait for the results to be loaded.
  await BrowserTestUtils.waitForCondition(
    () => mailResults.hasChildNodes(),
    "Mail results loaded"
  );

  let searchedTerms = tabDocument.getElementById("mailResultsTitle")
    .textContent;
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
  mc.tabmail.closeTab(mc.tabmail.currentTabInfo);
});

/**
 * Test that if the search goes bad on the server-side we show an error.
 */
add_task(async function test_shows_error_on_bad_suggest_from_name() {
  let original = Services.prefs.getCharPref(kSuggestFromNamePref);
  Services.prefs.setCharPref(kSuggestFromNamePref, url + "badSuggestFromName");

  let tab = await openAccountProvisioner();

  await waitForLoadedProviders(tab);

  let notificationBox =
    tab.browser.contentWindow.gAccountProvisioner.notificationBox;

  let notificationShowed = BrowserTestUtils.waitForCondition(
    () =>
      notificationBox.getNotificationWithValue("accountProvisionerError") !=
      null,
    "Timeout waiting for error notification to be showed"
  );

  // Fill the email input.
  input_value(mc, "Boston Low");
  // Since we're focused inside a form, pressing "Enter" should submit it.
  EventUtils.synthesizeKey("VK_RETURN", {}, mc.window);

  // Wait for the error notification.
  await notificationShowed;

  // Close the account provisioner tab.
  mc.tabmail.closeTab(mc.tabmail.currentTabInfo);
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
  let tabDocument = tab.browser.contentWindow.document;

  // Record how many accounts we start with.
  gNumAccounts = nAccounts();

  await waitForLoadedProviders(tab);

  // Fill the email input.
  input_value(mc, "corrupt@corrupt.invalid");
  // Since we're focused inside a form, pressing "Enter" should submit it.
  EventUtils.synthesizeKey("VK_RETURN", {}, mc.window);

  let mailResults = tabDocument.getElementById("mailResultsArea");

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

  let priceButton = tabDocument.querySelector(
    `.result-item[data-label="corrupt@corrupt.invalid"] .result-price`
  );
  priceButton.scrollIntoView();

  EventUtils.synthesizeMouseAtCenter(
    priceButton,
    {},
    tab.browser.contentWindow
  );

  // A special tab with the provisioner's API url should be loaded.
  wait_for_content_tab_load(undefined, function(aURL) {
    return aURL.host == "mochi.test";
  });
  tab = mc.tabmail.currentTabInfo;

  gMockPromptService.returnValue = true;

  // Simulate the purchase of an email account.
  BrowserTestUtils.synthesizeMouseAtCenter(
    "input[value=Send]",
    {},
    tab.browser
  );
  await BrowserTestUtils.waitForCondition(
    () =>
      mc.tabmail.selectedTab.browser.currentURI?.spec ==
      "about:accountprovisioner",
    "The Account Provisioner Tab was opened"
  );

  let promptState = gMockPromptService.promptState;
  Assert.equal("alert", promptState.method, "An alert was showed");

  Assert.equal(gNumAccounts, nAccounts(), "No new accounts have been created");

  // Clean up
  gMockPromptService.unregister();

  // Close the account setup tab.
  mc.tabmail.closeTab(mc.tabmail.currentTabInfo);
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

  // We'll use the Mozmill Menu API to grab the main menu...
  let mailMenuBar = mc.getMenu("#mail-menubar");
  let newMenuPopup = mc.e("menu_NewPopup");

  // First, we do some hackery to allow the "New" menupopup to respond to
  // events...
  let oldAllowEvents = newMenuPopup.getAttribute("allowevents") === "true";
  newMenuPopup.setAttribute("allowevents", "true");

  // And then call open on the menu. This doesn't actually open the menu
  // on screen, but it simulates the act, and dynamically generated or
  // modified menuitems react accordingly. Simulating this helps us sidestep
  // weird platform issues.
  mailMenuBar.open();

  // Next, we'll ensure that the "Get a new mail account"
  // menuitem is no longer available.
  await BrowserTestUtils.waitForCondition(
    () => mc.e("newCreateEmailAccountMenuItem").hidden,
    "Timed out waiting for the Account Provisioner menuitem to be hidden"
  );

  // Close all existing tabs except the first mail tab to avoid errors.
  mc.tabmail.closeOtherTabs(mc.tabmail.tabInfo[0]);

  // Open up the Account Hub.
  let tab = await openAccountSetup();
  // And make sure the Get a New Account button is hidden.
  Assert.ok(
    tab.browser.contentWindow.document.getElementById("provisionerButton")
      .hidden
  );
  // Close the Account Hub tab.
  mc.tabmail.closeTab(tab);

  // Ok, now pref the Account Provisioner back on
  Services.prefs.setBoolPref("mail.provider.enabled", true);

  // Re-open the menu to repopulate it.
  mailMenuBar.open();

  // Make sure that the "Get a new mail account" menuitem is NOT hidden.
  await BrowserTestUtils.waitForCondition(
    () => !mc.e("newCreateEmailAccountMenuItem").hidden,
    "Timed out waiting for the Account Provisioner menuitem to appear"
  );

  // Open up the Account Hub.
  tab = await openAccountSetup();
  // And make sure the Get a New Account button is hidden.
  Assert.ok(
    !tab.browser.contentWindow.document.getElementById("provisionerButton")
      .hidden
  );
  // Close the Account Hub tab.
  mc.tabmail.closeTab(tab);

  // And finally restore the menu to the way it was.
  if (oldAllowEvents) {
    newMenuPopup.setAttribute("allowevents", "true");
  } else {
    newMenuPopup.removeAttribute("allowevents");
  }
}).__skipMe = AppConstants.platform == "macosx"; // Can't click menu bar on Mac.
