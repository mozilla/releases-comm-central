/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the get an account (account provisioning) workflow.
 */

"use strict";

var { HttpServer } = ChromeUtils.import("resource://testing-common/httpd.js");

var {
  gMockExtProtSvc,
  gMockExtProtSvcReg,
  open_content_tab_with_click,
  plan_for_content_tab_load,
  wait_for_content_tab_load,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/ContentTabHelpers.jsm"
);
var {
  assert_element_visible,
  wait_for_element_enabled,
  wait_for_element_invisible,
  wait_for_element_visible,
} = ChromeUtils.import("resource://testing-common/mozmill/DOMHelpers.jsm");
var { assert_selected_tab, mc } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var {
  assert_links_not_shown,
  assert_links_shown,
  gConsoleListener,
  open_provisioner_window,
  remove_email_account,
  type_in_search_name,
  wait_for_provider_list_loaded,
  wait_for_search_ready,
  wait_for_search_results,
  wait_for_the_wizard_to_be_closed,
  wait_to_be_offline,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/NewMailAccountHelpers.jsm"
);
var {
  close_window,
  plan_for_modal_dialog,
  plan_for_new_window,
  plan_for_window_close,
  wait_for_browser_load,
  wait_for_modal_dialog,
  wait_for_new_window,
  wait_for_window_close,
} = ChromeUtils.import("resource://testing-common/mozmill/WindowHelpers.jsm");
var { openAccountSetup } = ChromeUtils.import(
  "resource://testing-common/mozmill/AccountManagerHelpers.jsm"
);

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { MockRegistrar } = ChromeUtils.import(
  "resource://testing-common/MockRegistrar.jsm"
);
var { SearchTestUtils } = ChromeUtils.import(
  "resource://testing-common/SearchTestUtils.jsm"
);

SearchTestUtils.init(this);

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

// Here's a name that we'll type in later on.  It's a global const because
// we'll be using it in several distinct modal dialog event loops.
var NAME = "Leonard Shelby";

// Record what the original value of the mail.provider.enabled pref is so
// that we can put it back once the tests are done.
var gProvisionerEnabled = Services.prefs.getBoolPref(kProvisionerEnabledPref);
var gOldAcceptLangs = Services.locale.requestedLocales;
var gNumAccounts;

var originalAlertsServiceCID;
// We need a mock alerts service to capture notification events when loading the
// UI after a successful account configuration in order to catch the alert
// triggered when trying to connect to a fake IMAP server.
class MockAlertsService {
  QueryInterface = ChromeUtils.generateQI(["nsIAlertsService"]);
  showAlert() {}
}

add_task(async function setupModule(module) {
  requestLongerTimeout(2);

  originalAlertsServiceCID = MockRegistrar.register(
    "@mozilla.org/alerts-service;1",
    MockAlertsService
  );

  // Make sure we enable the Account Provisioner.
  Services.prefs.setBoolPref(kProvisionerEnabledPref, true);
  // Restrict the user's language to just en-US
  Services.locale.requestedLocales = ["en-US"];

  await Services.search.init();
  gDefaultEngine = Services.search.defaultEngine;

  // Add a "bar" search engine that we can switch to be the default.
  await SearchTestUtils.installSearchExtension({
    name: "bar",
    template: "http://www.example.com/search?q={searchTerms}",
  });
});

registerCleanupFunction(async function teardownModule(module) {
  // Put the mail.provider.enabled pref back the way it was.
  Services.prefs.setBoolPref(kProvisionerEnabledPref, gProvisionerEnabled);
  // And same with the user languages
  Services.locale.requestedLocales = gOldAcceptLangs;
  // Delete the search engine.
  let engine = Services.search.getEngineByName("bar");
  if (engine) {
    await Services.search.removeEngine(engine);
  }
  // Restore the original search engine.
  Services.search.defaultEngine = gDefaultEngine;

  MockRegistrar.unregister(originalAlertsServiceCID);

  // Some tests that open new windows don't return focus to the main window
  // in a way that satisfies mochitest, and the test times out.
  Services.focus.focusedWindow = window;
  window.gFolderDisplay.tree.focus();
});

/* Helper function that returns the number of accounts associated with the
 * current profile.
 */
function nAccounts() {
  return MailServices.accounts.accounts.length;
}

/**
 * This tests the basic workflow for Account Provisioner - it spawns the
 * Provisioner window, fills in the search input, gets the results, clicks
 * on an address, completes a dummy form in a new tab for getting the account,
 * and then sets the provider as the default search engine.
 *
 * It gets a little complicated, since the modal dialog for the provisioner
 * spins it's own event loop, so we have to have subtest functions.  Therefore,
 * this test is split over 3 functions, and uses a global gNumAccounts.  The
 * three functions are "test_get_an_account", "subtest_get_an_account",
 * and "subtest_get_an_account_part_2".
 *
 * @param aCloseAndRestore a boolean for whether or not we should close and
 *                         restore the Account Provisioner tab before filling
 *                         in the form. Defaults to false.
 */
async function test_get_an_account(aCloseAndRestore) {
  // Open the provisioner - once opened, let subtest_get_an_account run.
  plan_for_modal_dialog("AccountCreation", subtest_get_an_account);
  open_provisioner_window();
  wait_for_modal_dialog("AccountCreation");

  // Once we're here, subtest_get_an_account has completed, and we're waiting
  // for a content tab to load for the account order form.

  // Make sure the page is loaded.
  wait_for_content_tab_load(undefined, function(aURL) {
    return aURL.host == "mochi.test";
  });

  let tab = mc.tabmail.currentTabInfo;

  if (aCloseAndRestore) {
    // Close the account provisioner tab, and then restore it...
    mc.tabmail.closeTab(mc.tabmail.currentTabInfo);
    mc.tabmail.undoCloseTab();
    // Wait for the page to be loaded again...
    wait_for_content_tab_load(undefined, function(aURL) {
      return aURL.host == "mochi.test";
    });
    tab = mc.tabmail.currentTabInfo;
  }

  // Record how many accounts we start with.
  gNumAccounts = nAccounts();

  // Plan for the account provisioner window to re-open, and then run the
  // controller through subtest_get_an_account_part_2. Since the Account
  // Provisioner dialog is non-modal in the event of success, we use our
  // normal window handlers.
  plan_for_new_window("AccountCreation");

  // Click the OK button to order the account.
  await BrowserTestUtils.synthesizeMouseAtCenter(
    "input[value=Send]",
    {},
    tab.browser
  );

  let ac = wait_for_new_window("AccountCreation");

  plan_for_window_close(ac);
  subtest_get_an_account_part_2(ac);
  wait_for_window_close();

  // Make sure we set the default search engine
  let engine = Services.search.getEngineByName("bar");
  Assert.equal(engine, Services.search.defaultEngine);

  // Restore the original search engine.
  Services.search.defaultEngine = gDefaultEngine;
  remove_email_account("green@example.com");
}
add_task(test_get_an_account);

/**
 * This is a subtest for test_get_an_account, and runs the first time the
 * account provisioner window is opened.
 */
function subtest_get_an_account(w) {
  // Make sure we don't have bar as the default engine yet.
  let engine = Services.search.getEngineByName("bar");
  Assert.notEqual(engine, Services.search.defaultEngine);

  wait_for_provider_list_loaded(w);
  wait_for_search_ready(w);

  // Fill in some data
  type_in_search_name(w, "Green Llama");

  w.click(w.e("searchSubmit"));
  wait_for_search_results(w);

  // Click on the first address. This reveals the button with the price.
  let address = w.window.document.querySelector(".address:first-child");
  w.click(address);
  w.waitFor(
    () =>
      w.window.document.querySelectorAll('button.create:not([disabled="true"])')
        .length > 0
  );

  // Pick the email address green@example.com
  plan_for_content_tab_load();

  // Clicking this button should close the modal dialog.
  let button = w.window.document.querySelector(
    'button.create[address="green@example.com"]'
  );
  w.click(button);
}

/**
 * This is a subtest for test_get_an_account, and runs the second time the
 * account provisioner window is opened.
 */
function subtest_get_an_account_part_2(w) {
  // An account should have been added.
  Assert.equal(nAccounts(), gNumAccounts + 1);

  // We want this provider to be our default search engine.
  wait_for_element_invisible(w, "window");
  wait_for_element_visible(w, "successful_account");

  // Make sure the search engine is checked
  Assert.ok(w.e("search_engine_check").checked);

  // Then click "Finish"
  mc.click(w.e("closeWindow"));
}

/**
 * Runs test_get_an_account again, but this time, closes and restores the
 * order form tab before submitting it.
 */
add_task(function test_restored_ap_tab_works() {
  return test_get_an_account(true);
});

/**
 * Test that clicking on the "I think I'll configure my account later"
 * button dismisses the Account Provisioner window.
 */
add_task(function test_can_dismiss_account_provisioner() {
  plan_for_modal_dialog(
    "AccountCreation",
    subtest_can_dismiss_account_provisioner
  );
  open_provisioner_window();
  wait_for_modal_dialog("AccountCreation");
});

/**
 * Subtest for test_can_dismiss_account_provisioner, that runs
 * once the modal dialog has opened.  This function just clicks the
 * "I think I'll configure my account later" button, and then waits
 * for itself to close.
 */
function subtest_can_dismiss_account_provisioner(w) {
  plan_for_window_close(w);
  // Click on the "I think I'll configure my account later" button.
  mc.click(w.window.document.querySelector(".close"));

  // Ensure that the window has closed.
  wait_for_window_close();
}

/**
 * Test that clicking on the "Skip this and use my existing email" button
 * sends us to the existing email account wizard.
 */
add_task(function test_can_switch_to_existing_email_account_wizard() {
  plan_for_modal_dialog(
    "AccountCreation",
    subtest_can_switch_to_existing_email_account_wizard
  );
  open_provisioner_window();
  wait_for_modal_dialog("AccountCreation");
  // Ensure that the Account Hub is opened.
  wait_for_content_tab_load(
    mc.tabmail.currentTabInfo,
    "about:accountsetup",
    10000
  );
});

/**
 * Subtest for test_can_switch_to_existing_email_account_wizard.  This
 * function simply clicks on the "Skip this and use my existing email"
 * button, and then waits for itself to close.
 */
function subtest_can_switch_to_existing_email_account_wizard(w) {
  plan_for_window_close(w);

  // Click on the "Skip this and use my existing email" button
  mc.click(w.window.document.querySelector(".existing"));

  // Ensure that the Account Provisioner window closed
  wait_for_window_close();
}

/**
 * Test that clicking on the "Other languages" div causes account
 * providers with other languages to be displayed.
 */
add_task(function test_can_display_providers_in_other_languages() {
  plan_for_modal_dialog(
    "AccountCreation",
    subtest_can_display_providers_in_other_languages
  );
  open_provisioner_window();
  wait_for_modal_dialog("AccountCreation");
});

/**
 * Subtest for test_can_display_providers_in_other_languages. This function
 * simply clicks on the div for displaying account providers in other
 * languages, and ensures that those other providers become visible.
 */
function subtest_can_display_providers_in_other_languages(w) {
  wait_for_provider_list_loaded(w);

  // Check that the "Other languages" div is hidden
  wait_for_element_visible(w, "otherLangDesc");
  let otherLanguages = w.window.document.querySelectorAll(".otherLanguage");
  for (let element of otherLanguages) {
    assert_element_visible(element);
  }
  // Click on the "Other languages" div
  mc.click(w.e("otherLangDesc"));

  wait_for_element_invisible(w, "otherLangDesc");
}

/**
 * Spawn the provisioner window by clicking on the menuitem,
 * then flip back and forth between that and the existing email
 * wizard, and then test to see if we can dismiss the provisioner.
 */
add_task(async function test_flip_flop_from_provisioner_menuitem() {
  // Close all existing tabs except the first mail tab to avoid errors.
  mc.tabmail.closeOtherTabs(mc.tabmail.tabInfo[0]);

  // Prepare the callback to handle the opening of the account provisioner.
  let dialogWindowPromise = BrowserTestUtils.promiseAlertDialog(
    null,
    kProvisionerUrl,
    {
      async callback(win) {
        await subtest_flip_flop_from_provisioner_menuitem(win);
      },
    }
  );
  // Open the account provisioner from a menu item.
  open_provisioner_window();
  await dialogWindowPromise;

  // Ensure that the Account Hub was opened when the click on using an existing
  // email account was triggered.
  wait_for_content_tab_load(
    mc.tabmail.currentTabInfo,
    "about:accountsetup",
    10000
  );

  let tabWindow = mc.tabmail.currentTabInfo.browser.contentWindow;

  // Let's do it a second time.
  let dialogWindowPromise2 = BrowserTestUtils.promiseAlertDialog(
    null,
    kProvisionerUrl,
    {
      async callback(win) {
        await subtest_flip_flop_from_provisioner_menuitem(win);
      },
    }
  );
  // Open the account provisioner from the Account hub.
  EventUtils.synthesizeMouseAtCenter(
    tabWindow.document.getElementById("provisionerButton"),
    {},
    tabWindow
  );
  await dialogWindowPromise2;

  // Let's do it a third time.
  let dialogWindowPromise3 = BrowserTestUtils.promiseAlertDialog(
    null,
    kProvisionerUrl,
    {
      async callback(win) {
        await subtest_flip_flop_from_provisioner_menuitem(win);
      },
    }
  );
  // Open the account provisioner from the Account hub.
  EventUtils.synthesizeMouseAtCenter(
    tabWindow.document.activeElement,
    {},
    tabWindow
  );
  await dialogWindowPromise3;

  // Let's do it one last time but this time we will close the dialog.
  let dialogWindowPromise4 = BrowserTestUtils.promiseAlertDialog(
    null,
    kProvisionerUrl,
    {
      async callback(win) {
        await subtest_close_provisioner(win);
      },
    }
  );
  // Open the account provisioner from the Account hub.
  EventUtils.synthesizeMouseAtCenter(
    tabWindow.document.getElementById("provisionerButton"),
    {},
    tabWindow
  );
  await dialogWindowPromise4;
}).__skipMe = AppConstants.platform == "macosx";
// The provisioner window appears modally in macOS, you cannot switch back to
// the opening window.

/**
 * This function is used by test_flip_flop_from_provisioner_menuitem to switch
 * back from the account provisioner to the wizard.
 */
async function subtest_flip_flop_from_provisioner_menuitem(dialogWindow) {
  let existingButton = dialogWindow.document.querySelector(".existing");
  // Be sure the button is visible in the viewport.
  existingButton.scrollIntoView(false);
  EventUtils.synthesizeMouseAtCenter(existingButton, {}, dialogWindow);
}

/**
 * This function is used by test_flip_flop_from_provisioner_menuitem to close
 * the provisioner.
 */
async function subtest_close_provisioner(dialogWindow) {
  let closeButton = dialogWindow.document.querySelector(".close");
  // Be sure the button is visible in the viewport.
  closeButton.scrollIntoView(false);
  EventUtils.synthesizeMouseAtCenter(closeButton, {}, dialogWindow);
}

/**
 * Test that the name typed into the search field gets persisted after
 * doing a search, or choosing to go to the email setup wizard.
 */
add_task(function test_persist_name_in_search_field() {
  plan_for_modal_dialog(
    "AccountCreation",
    subtest_persist_name_in_search_field
  );
  open_provisioner_window();
  wait_for_modal_dialog("AccountCreation");
  plan_for_modal_dialog(
    "AccountCreation",
    subtest_persist_name_in_search_field_part_2
  );
  open_provisioner_window();
  wait_for_modal_dialog("AccountCreation");
});

/**
 * Subtest used by test_persist_name_in_search_field.  This function simply
 * puts a name into the search field, starts a search, and then dismisses
 * the window.
 */
function subtest_persist_name_in_search_field(w) {
  wait_for_provider_list_loaded(w);
  wait_for_search_ready(w);

  // Type a name into the search field
  type_in_search_name(w, NAME);

  // Do a search
  w.click(w.e("searchSubmit"));
  wait_for_search_results(w);

  plan_for_window_close(w);
  // Click on the "I think I'll configure my account later" button.
  mc.click(w.window.document.querySelector(".close"));
  wait_for_window_close();
}

/**
 * Subtest used by test_persist_name_in_search_field, the second time that
 * the account provisioner window is opened.  This function simply checks to
 * ensure that the name inserted in subtest_persist_name_in_search_field has
 * indeed persisted.
 */
function subtest_persist_name_in_search_field_part_2(w) {
  mc.waitFor(() => w.e("name").value == NAME);
}

/**
 * Test that names with HTML characters are escaped properly when displayed
 * back to the user.
 */
add_task(function test_html_characters_and_ampersands() {
  plan_for_modal_dialog(
    "AccountCreation",
    subtest_html_characters_and_ampersands
  );
  open_provisioner_window();
  wait_for_modal_dialog("AccountCreation");
});

/**
 * Subtest used by test_html_characters_and_ampersands.  This function puts
 * a name with HTML tags into the search input, does a search, and ensures
 * that the rendered name has escaped the HTML tags properly.
 */
function subtest_html_characters_and_ampersands(w) {
  wait_for_provider_list_loaded(w);
  wait_for_search_ready(w);

  // Type a name with some HTML tags and an ampersand in there
  // to see if we can trip up account provisioner.
  const CLEVER_STRING =
    "<i>Hey, I'm ''clever &\"\" smart!<!-- Ain't I a stinkah? --></i>";
  type_in_search_name(w, CLEVER_STRING);

  // Do the search.
  w.click(w.e("searchSubmit"));

  wait_for_search_results(w);

  let displayedName = w.e("FirstAndLastName").textContent;

  Assert.notEqual(CLEVER_STRING, displayedName);
  // & should have been replaced with &amp;, and the
  // greater than / less than characters with &gt; and
  // &lt; respectively.
  Assert.ok(
    displayedName.includes("&amp;"),
    "Should have eliminated ampersands"
  );
  Assert.ok(
    displayedName.includes("&gt;"),
    "Should have eliminated greater-than signs"
  );
  Assert.ok(
    displayedName.includes("&lt;"),
    "Should have eliminated less-than signs"
  );
}

/**
 * Test that only the terms of service and privacy links for selected
 * providers are shown in the disclaimer.
 */
add_task(function test_show_tos_privacy_links_for_selected_providers() {
  plan_for_modal_dialog(
    "AccountCreation",
    subtest_show_tos_privacy_links_for_selected_providers
  );
  open_provisioner_window();
  wait_for_modal_dialog("AccountCreation");
});

/**
 * Subtest used by test_show_tos_privacy_links_for_selected_providers.  This
 * function selects and deselects a series of providers, and ensures that the
 * appropriate terms of service and privacy links are shown.
 */
function subtest_show_tos_privacy_links_for_selected_providers(w) {
  wait_for_provider_list_loaded(w);

  // We should be showing the TOS and Privacy links for the selected
  // providers immediately after the providers have been loaded.
  // Those providers should be "foo" and "bar".
  assert_links_shown(w, [
    "http://www.example.com/foo-tos",
    "http://www.example.com/foo-privacy",
    "http://www.example.com/bar-tos",
    "http://www.example.com/bar-privacy",
  ]);

  assert_links_not_shown(w, [
    "http://www.example.com/French-tos",
    "http://www.example.com/French-privacy",
  ]);

  // Now click off one of those providers - we shouldn't be displaying
  // and links for that one now.
  let input = w.window.document.querySelector(
    'input[type="checkbox"][value="foo"]'
  );
  w.click(input);

  assert_links_not_shown(w, [
    "http://www.example.com/foo-tos",
    "http://www.example.com/foo-privacy",
  ]);

  // Ensure that the "Other languages" div is visible
  wait_for_element_visible(w, "otherLangDesc");
  // Now show the providers from different locales...
  w.click(w.e("otherLangDesc"));
  wait_for_element_invisible(w, "otherLangDesc");

  // And click on one of those providers...
  input = w.window.document.querySelector(
    'input[type="checkbox"][value="French"]'
  );
  w.click(input);
  // We should be showing the French TOS / Privacy links, along
  // with those from the bar provider.
  assert_links_shown(w, [
    "http://www.example.com/French-tos",
    "http://www.example.com/French-privacy",
    "http://www.example.com/bar-tos",
    "http://www.example.com/bar-privacy",
  ]);

  // The foo provider should still have it's links hidden.
  assert_links_not_shown(w, [
    "http://www.example.com/foo-tos",
    "http://www.example.com/foo-privacy",
  ]);

  // Click on the German provider.  It's links should now be
  // shown, along with the French and bar providers.
  input = w.window.document.querySelector(
    'input[type="checkbox"][value="German"]'
  );
  w.click(input);
  assert_links_shown(w, [
    "http://www.example.com/French-tos",
    "http://www.example.com/French-privacy",
    "http://www.example.com/bar-tos",
    "http://www.example.com/bar-privacy",
    "http://www.example.com/German-tos",
    "http://www.example.com/German-privacy",
  ]);

  // And the foo links should still be hidden.
  assert_links_not_shown(w, [
    "http://www.example.com/foo-tos",
    "http://www.example.com/foo-privacy",
  ]);
}

/**
 * Test that if the search goes bad on the server-side, that we show an
 * error.
 */
add_task(function test_shows_error_on_bad_suggest_from_name() {
  let original = Services.prefs.getCharPref(kSuggestFromNamePref);
  Services.prefs.setCharPref(kSuggestFromNamePref, url + "badSuggestFromName");
  plan_for_modal_dialog(
    "AccountCreation",
    subtest_shows_error_on_bad_suggest_from_name
  );
  open_provisioner_window();
  wait_for_modal_dialog("AccountCreation");
  Services.prefs.setCharPref(kSuggestFromNamePref, original);
});

/**
 * Subtest for test_shows_error_on_bad_suggest_from_name.  This function does
 * a search, and then ensures that an error is displayed, since we got back
 * garbage from the server.
 */
function subtest_shows_error_on_bad_suggest_from_name(w) {
  wait_for_provider_list_loaded(w);
  wait_for_search_ready(w);

  type_in_search_name(w, "Boston Low");

  // Do the search.
  w.click(w.e("searchSubmit"));

  mc.waitFor(
    () => !w.window.document.querySelector("#notifications > .error").hidden
  );
}

/**
 * Test that if we get an empty result from the server after a search, that
 * we show an error message.
 */
add_task(function test_shows_error_on_empty_suggest_from_name() {
  let original = Services.prefs.getCharPref(kSuggestFromNamePref);
  Services.prefs.setCharPref(
    kSuggestFromNamePref,
    url + "emptySuggestFromName"
  );
  plan_for_modal_dialog(
    "AccountCreation",
    subtest_shows_error_on_empty_suggest_from_name
  );
  open_provisioner_window();
  wait_for_modal_dialog("AccountCreation");
  Services.prefs.setCharPref(kSuggestFromNamePref, original);
});

/**
 * Subtest for test_shows_error_on_empty_suggest_from_name. This function does
 * a search, and then ensures that an error is displayed, since we got back
 * an empty result from the server.
 */
function subtest_shows_error_on_empty_suggest_from_name(w) {
  wait_for_provider_list_loaded(w);
  wait_for_search_ready(w);

  type_in_search_name(w, "Maggie Robbins");

  // Do the search.
  w.click(w.e("searchSubmit"));

  mc.waitFor(
    () => !w.window.document.querySelector("#notifications > .error").hidden
  );
}

/**
 * Tests that if a provider returns broken or erroneous XML back
 * to the user after account registration, that we log the error
 * in the error console.
 */
add_task(function test_throws_console_error_on_corrupt_XML() {
  // Open the provisioner - once opened, let subtest_get_an_account run.
  get_to_order_form("corrupt@corrupt.invalid");
  let tab = mc.tabmail.currentTabInfo;

  // Record how many accounts we start with.
  gNumAccounts = nAccounts();

  gConsoleListener.reset();
  gConsoleListener.listenFor("Problem interpreting provider XML:");

  Services.console.registerListener(gConsoleListener);

  // Click the OK button to order the account.
  plan_for_modal_dialog("AccountCreation", close_dialog_immediately);
  BrowserTestUtils.synthesizeMouseAtCenter(
    "input[value=Send]",
    {},
    tab.browser
  );
  wait_for_modal_dialog("AccountCreation");

  gConsoleListener.wait();

  Services.console.unregisterListener(gConsoleListener);
});

/**
 * Test that if the providerList is invalid or broken JSON, that
 * we "go offline" and display an error message.
 */
add_task(function test_broken_provider_list_goes_offline() {
  let original = Services.prefs.getCharPref(kProviderListPref);
  Services.prefs.setCharPref(kProviderListPref, url + "providerListBad");

  plan_for_modal_dialog(
    "AccountCreation",
    subtest_broken_provider_list_goes_offline
  );
  open_provisioner_window();
  wait_for_modal_dialog("AccountCreation");
  Services.prefs.setCharPref(kProviderListPref, original);
});

/**
 * Subtest for test_broken_provider_list_goes_offline. This function just
 * waits for the offline message to appear.
 */
function subtest_broken_provider_list_goes_offline(w) {
  wait_to_be_offline(w);
}

/**
 * Test that if a provider has not included some of the required fields,
 * then they're not included as a potential provider for the user.
 */
add_task(function test_incomplete_provider_not_displayed() {
  let original = Services.prefs.getCharPref(kProviderListPref);
  Services.prefs.setCharPref(kProviderListPref, url + "providerListIncomplete");

  plan_for_modal_dialog(
    "AccountCreation",
    subtest_incomplete_provider_not_displayed
  );
  open_provisioner_window();
  wait_for_modal_dialog("AccountCreation");
  Services.prefs.setCharPref(kProviderListPref, original);
});

/**
 * Subtest for test_incomplete_provider_not_displayed. This function just
 * ensures that the provider that didn't include all of the required fields
 * is not displayed.
 */
function subtest_incomplete_provider_not_displayed(w) {
  wait_for_provider_list_loaded(w);
  // Make sure that the provider that didn't include the required fields
  // is not displayed.
  let input = w.window.document.querySelectorAll(
    'input[type="checkbox"][value="corrupt"]'
  );
  Assert.equal(
    0,
    input.length,
    "The Corrupt provider should not have been displayed"
  );

  // And check to ensure that at least one other provider is displayed
  input = w.window.document.querySelectorAll(
    'input[type="checkbox"][value="foo"]'
  );
  Assert.equal(1, input.length, "The foo provider should have been displayed");
}

/**
 * Test that if the search text input is empty, or if no providers are selected,
 * that the search submit button is disabled.
 */
add_task(function test_search_button_disabled_cases() {
  plan_for_modal_dialog(
    "AccountCreation",
    subtest_search_button_disabled_cases
  );
  open_provisioner_window();
  wait_for_modal_dialog("AccountCreation");
});

/**
 * Subtest for test_search_button_disabled_cases.  This function ensures that
 * if the search input is empty, or if no providers are selected, then the
 * search submit button is disabled.  If, on the other hand some providers
 * are selected AND some text is in the search input, then the search submit
 * button should be enabled.
 */
function subtest_search_button_disabled_cases(w) {
  wait_for_provider_list_loaded(w);
  let searchInput = w.e("name");
  // Case 1:  Search input empty, some providers selected.

  // Empty any strings in the search input.  Select all of the input with
  // Ctrl-A, and then hit backspace.
  searchInput.focus();
  EventUtils.synthesizeKey("a", { accelKey: true }, w.window);
  EventUtils.synthesizeKey("VK_BACK_SPACE", {}, w.window);

  // Make sure at least one provider is checked
  let input = w.window.document.querySelector('input[type="checkbox"]:checked');
  w.click(input);
  input = w.window.document.querySelector(
    'input[type="checkbox"][value="foo"]'
  );
  w.click(input);

  // The search submit button should become disabled
  wait_for_element_enabled(w, w.e("searchSubmit"), false);

  // Case 2:  Search input has text, some providers selected

  // Put something into the search input
  type_in_search_name(w, "Dexter Morgan");

  // We already have at least one provider checked from the last case, so
  // the search submit button should become enabled
  wait_for_element_enabled(w, w.e("searchSubmit"), true);

  // Case 3:  Search input has text, no providers selected
  // Make sure no provider checkboxes are checked.
  let inputs = w.window.document.querySelectorAll(
    'input[type="checkbox"]:checked'
  );
  for (input of inputs) {
    mc.click(input);
  }

  // The search submit button should now be disabled
  wait_for_element_enabled(w, w.e("searchSubmit"), false);

  // We'll turn on a single provider now to enable the search button,
  // so we can ensure that it actually *becomes* disabled for the next
  // case.
  input = w.window.document.querySelector(
    'input[type="checkbox"][value="foo"]'
  );
  w.click(input);
  wait_for_element_enabled(w, w.e("searchSubmit"), true);

  // Case 4:  Search input has no text, and no providers are
  // selected.

  // Clear out the search input
  EventUtils.synthesizeKey("a", { accelKey: true }, w.window);
  EventUtils.synthesizeKey("VK_BACK_SPACE", {}, w.window);
  input = w.window.document.querySelector('input[type="checkbox"]:checked');
  w.click(input);

  wait_for_element_enabled(w, w.e("searchSubmit"), false);
}

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

  // And then call open on the menu.  This doesn't actually open the menu
  // on screen, but it simulates the act, and dynamically generated or
  // modified menuitems react accordingly.  Simulating this helps us sidestep
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
}).__skipMe = AppConstants.platform == "macosx";
// We cannot control menus via Mozmill in OSX, so we'll skip this test.

/**
 * Tests that if we load a provider list that does not include providers in
 * other languages, then the "show me providers in other languages" link is
 * hidden.
 */
add_task(function test_other_lang_link_hides() {
  let original = Services.prefs.getCharPref(kProviderListPref);
  Services.prefs.setCharPref(
    kProviderListPref,
    url + "providerListNoOtherLangs"
  );

  plan_for_modal_dialog("AccountCreation", subtest_other_lang_link_hides);
  open_provisioner_window();
  wait_for_modal_dialog("AccountCreation");
  Services.prefs.setCharPref(kProviderListPref, original);
});

/**
 * Subtest for test_other_lang_link_hides that just waits for the provider
 * list to be loaded, and then ensures that the "show me providers in other
 * languages" link is not visible.
 */
function subtest_other_lang_link_hides(w) {
  wait_for_provider_list_loaded(w);
  wait_for_element_invisible(w, "otherLangDesc");
}

/**
 * Quickly get us to the default order form (registration.html) and return
 * when we're there.
 */
function get_to_order_form(aAddress) {
  if (!aAddress) {
    aAddress = "green@example.com";
  }

  plan_for_modal_dialog("AccountCreation", function(aController) {
    sub_get_to_order_form(aController, aAddress);
  });
  open_provisioner_window();
  wait_for_modal_dialog("AccountCreation");

  // Once we're here, subtest_get_an_account has completed, and we're waiting
  // for a content tab to load for the account order form.

  // Make sure the page is loaded.
  wait_for_content_tab_load(undefined, function(aURL) {
    return aURL.host == "mochi.test";
  });
}

/**
 * Fills in the Account Provisioner dialog to get us to the order form.
 */
function sub_get_to_order_form(aController, aAddress) {
  wait_for_provider_list_loaded(aController);
  wait_for_search_ready(aController);

  // Fill in some data
  type_in_search_name(aController, "Joe Nobody");

  aController.click(aController.e("searchSubmit"));
  wait_for_search_results(aController);

  // Click on the requested address. This reveals the button with the price.
  let addressElts = [
    ...aController.window.document.querySelectorAll(".address"),
  ];
  let address = addressElts.filter(a => a.textContent == aAddress).shift();
  Assert.ok(!!address, "Couldn't find the requested address " + aAddress);
  aController.click(address);
  aController.waitFor(
    () =>
      aController.window.document.querySelectorAll(
        'button.create:not([disabled="true"])'
      ).length > 0
  );

  // Pick the email address.
  plan_for_content_tab_load();

  // Clicking this button should close the modal dialog.
  let button = aController.window.document.querySelector(
    'button.create[address="' + aAddress + '"]'
  );
  // mc.click() causes a failure here so click() is used for now.
  button.click();
}

/**
 * Helper function to be passed to plan_for_modal_dialog that closes the
 * Account Provisioner dialog immediately.
 */
function close_dialog_immediately(aController) {
  plan_for_window_close(aController);
  mc.click(aController.window.document.querySelector(".close"));
  wait_for_window_close();
}

/**
 * Test that clicking on links in the order form open in the same account
 * provisioner tab.
 */
add_task(function test_internal_link_opening_behaviour() {
  get_to_order_form();

  // Open the provisioner - once opened, let subtest_get_an_account run...
  let tab = mc.tabmail.currentTabInfo;

  // Click on the internal link.
  BrowserTestUtils.synthesizeMouseAtCenter("#internal", {}, tab.browser);

  // We should load the target page in the current tab browser.
  wait_for_browser_load(tab.browser, function(aURL) {
    return (
      aURL.host == "mochi.test" && aURL.pathQueryRef.endsWith("/target.html")
    );
  });
  // Now close the tab.
  mc.tabmail.closeTab(tab);
});

/**
 * Test that links with target="_blank" open in new content tabs.
 */
add_task(function test_window_open_link_opening_behaviour() {
  get_to_order_form();

  let tab = mc.tabmail.currentTabInfo;

  // First, click on the Javascript link - this should open in a new content
  // tab and be focused.
  open_content_tab_with_click(
    () =>
      BrowserTestUtils.synthesizeMouseAtCenter("#external", {}, tab.browser),
    function(aURL) {
      return (
        aURL.host == "mochi.test" && aURL.pathQueryRef.endsWith("/target.html")
      );
    }
  );

  // Close the new tab.
  let newTab = mc.tabmail.currentTabInfo;
  mc.tabmail.closeTab(newTab);
  mc.tabmail.closeTab(tab);
});

/**
 * Test that if the final provider sends ok account settings back in config.xml
 * then the account is created and we're done.
 */
add_task(async function test_provisioner_ok_account_setup() {
  get_to_order_form("green@example.com");

  let accounts0 = MailServices.accounts.accounts;

  let tab = mc.tabmail.currentTabInfo;

  plan_for_modal_dialog("AccountCreation", function(aController) {
    aController.window.close();
  });

  // Click the OK button to order the account.
  BrowserTestUtils.synthesizeMouseAtCenter(
    "input[value=Send]",
    {},
    tab.browser
  );

  // Submitting will generate a response with a config.xml configuration for
  // the account. That will be intercepted and the account set up automatically.

  // The "Congratulations" dialog will be shown.
  wait_for_modal_dialog("AccountCreation");

  let accounts2 = MailServices.accounts.accounts;
  Assert.equal(
    accounts2.length,
    accounts0.length + 1,
    "Should have added an account"
  );

  let account = accounts2[accounts2.length - 2];
  Assert.equal(account.incomingServer.type, "imap");
  Assert.equal(account.incomingServer.hostName, "imap-provisioned.example.com");

  let inURL = "imap://imap-provisioned.example.com";
  let imapLogins = Services.logins.findLogins(inURL, null, inURL);
  Assert.equal(imapLogins.length, 1, "should have incoming login");
  Assert.equal(
    imapLogins[0].username,
    "green@example.com",
    "imap username should be correct"
  );
  Assert.equal(
    imapLogins[0].password,
    "Håhå",
    "imap password should be correct"
  );

  let outURL = "smtp://smtp-provisioned.example.com";
  let smtpLogins = Services.logins.findLogins(outURL, null, outURL);
  Assert.equal(smtpLogins.length, 1, "should have outgoing login");
  Assert.equal(
    smtpLogins[0].username,
    "green@example.com",
    "smtp username should be correct"
  );
  Assert.equal(
    smtpLogins[0].password,
    "Östad3",
    "smtp password should be correct"
  );

  Services.logins.removeAllLogins();

  // Wait for the folder pane to be visible.
  await TestUtils.waitForCondition(
    () => !mc.e("folderPaneBox").collapsed,
    "The folder pane is not visible"
  );
});

/**
 * Test that if the provider returns XML that we can't turn into an account,
 * then we error out and go back to the Account Provisioner dialog.
 */
add_task(function test_return_to_provisioner_on_error_XML() {
  const kOriginalTabNum = mc.tabmail.tabContainer.allTabs.length;

  get_to_order_form("error@error.invalid");

  let tab = mc.tabmail.currentTabInfo;

  plan_for_modal_dialog("AccountCreation", close_dialog_immediately);

  // Click the OK button to order the account.
  BrowserTestUtils.synthesizeMouseAtCenter(
    "input[value=Send]",
    {},
    tab.browser
  );

  wait_for_modal_dialog("AccountCreation");

  // We should be done executing the function defined in plan_for_modal_dialog
  // now, so the Account Provisioner dialog should be closed, and the order
  // form tab should have been closed.
  Assert.equal(
    kOriginalTabNum,
    mc.tabmail.tabContainer.allTabs.length,
    "Timed out waiting for the order form tab to close."
  );
});

/**
 * Test that if we initiate a search, then the search input, the search button,
 * and all checkboxes should be disabled. The ability to close the window should
 * still be enabled though.
 */
add_task(function test_disabled_fields_when_searching() {
  plan_for_modal_dialog(
    "AccountCreation",
    subtest_disabled_fields_when_searching
  );
  open_provisioner_window();
  wait_for_modal_dialog("AccountCreation");
});

/**
 * Subtest for test_disabled_fields_when_searching. Sets up a fake HTTP server
 * that slowly returns a search suggestion, and then checks to ensure all the
 * right fields are disabled (search input, search button, all check boxes).
 * We also make sure those fields are re-enabled once the test is completed.
 */
function subtest_disabled_fields_when_searching(aController) {
  const kSuggestPath = "/slowSuggest";
  const kSearchMSeconds = 2000;
  let timer;

  function slow_results(aRequest, aResponse) {
    aResponse.processAsync();
    timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    let result = [
      {
        product: "personalized_email",
        addresses: ["green@example.com", "green_llama@example.com"],
        succeeded: true,
        quote: "b28acb3c0a474d33af22",
        price: 0,
        provider: "bar",
      },
    ];
    let timerEvent = {
      notify(aTimer) {
        aResponse.setStatusLine(null, 200, "OK");
        aResponse.setHeader("Content-Type", "application/json");
        aResponse.write(JSON.stringify(result));
        aResponse.finish();
      },
    };
    timer.initWithCallback(
      timerEvent,
      kSearchMSeconds,
      Ci.nsITimer.TYPE_ONE_SHOT
    );
  }

  // Set up a mock HTTP server to serve up a super slow search...
  let server = new HttpServer();
  server.registerPathHandler(kSuggestPath, slow_results);
  server.start(kDefaultServerPort);

  // Now point our suggestFromName pref at that slow server.
  let originalSuggest = Services.prefs.getCharPref(kSuggestFromNamePref);
  Services.prefs.setCharPref(
    kSuggestFromNamePref,
    kDefaultServerRoot + kSuggestPath
  );

  wait_for_provider_list_loaded(aController);
  wait_for_search_ready(aController);

  let doc = aController.window.document;
  type_in_search_name(aController, "Fone Bone");

  aController.click(aController.e("searchSubmit"));

  // Our slow search has started. We have kSearchMSeconds milliseconds before
  // the search completes. Plenty of time to check that the right things are
  // disabled.
  wait_for_element_enabled(aController, aController.e("searchSubmit"), false);
  wait_for_element_enabled(aController, aController.e("name"), false);
  let providerCheckboxes = doc.querySelectorAll(".providerCheckbox");

  for (let checkbox of providerCheckboxes) {
    wait_for_element_enabled(aController, checkbox, false);
  }

  // Check to ensure that the buttons for switching to the wizard and closing
  // the wizard are still enabled.
  wait_for_element_enabled(aController, doc.querySelector(".close"), true);
  wait_for_element_enabled(aController, doc.querySelector(".existing"), true);

  // Ok, wait for the results to come through...
  wait_for_search_results(aController);

  wait_for_element_enabled(aController, aController.e("searchSubmit"), true);
  wait_for_element_enabled(aController, aController.e("name"), true);

  for (let checkbox of providerCheckboxes) {
    wait_for_element_enabled(aController, checkbox, true);
  }

  // Ok, cleanup time. Put the old suggest URL back.
  Services.prefs.setCharPref(kSuggestFromNamePref, originalSuggest);

  // The fake HTTP server stops asynchronously, so let's kick off the stop
  // and wait for it to complete.
  let serverStopped = false;
  server.stop(function() {
    serverStopped = true;
  });
  aController.waitFor(
    () => serverStopped,
    "Timed out waiting for the fake server to stop."
  );

  close_dialog_immediately(aController);
}

/**
 * Tests that the search button is disabled if there is no initially
 * supported language for the user.
 */
add_task(function test_search_button_disabled_if_no_lang_support() {
  // Set the user's supported language to something ridiculous (caching the
  // old one so we can put it back later).
  let originalReqLocales = Services.locale.requestedLocales;
  Services.locale.requestedLocales = ["foo"];

  plan_for_modal_dialog("AccountCreation", function(aController) {
    wait_for_provider_list_loaded(aController);
    // The search button should be disabled.
    wait_for_element_enabled(aController, aController.e("searchSubmit"), false);
    close_dialog_immediately(aController);
  });

  open_provisioner_window();
  wait_for_modal_dialog("AccountCreation");

  Services.locale.requestedLocales = originalReqLocales;
});

/**
 * Subtest used by several functions that checks to make sure that the
 * search button is disabled when the Account Provisioner dialog is opened,
 * in case there's no search input yet.
 */
function subtest_search_button_enabled_state_on_init(aController) {
  wait_for_provider_list_loaded(aController);

  let enabled = !!aController.e("name").value;

  // The search button should be disabled if there's not search input.
  wait_for_element_enabled(aController, aController.e("searchSubmit"), enabled);

  close_dialog_immediately(aController);
}

/**
 * Test that if the providerList contains entries with supported languages
 * including "*", they are always displayed, even if the users locale pref
 * is not set to "*".
 */
add_task(function test_provider_language_wildcard() {
  let originalReqLocales = Services.locale.requestedLocales;
  Services.locale.requestedLocales = ["foo-ba"];

  let original = Services.prefs.getCharPref(kProviderListPref);
  Services.prefs.setCharPref(kProviderListPref, url + "providerListWildcard");

  plan_for_modal_dialog("AccountCreation", subtest_provider_language_wildcard);
  open_provisioner_window();
  wait_for_modal_dialog("AccountCreation");
  Services.prefs.setCharPref(kProviderListPref, original);
  Services.locale.requestedLocales = originalReqLocales;
});

/**
 * Subtest used by test_provider_language_wildcard, ensures that the
 * "Universal" and "OtherUniversal" providers are displayed, but the French
 * and German ones are not.
 */
function subtest_provider_language_wildcard(aController) {
  wait_for_provider_list_loaded(aController);
  // Check that the two universal providers are visible.
  wait_for_element_visible(aController, "universal-check");
  wait_for_element_visible(aController, "otherUniversal-check");
  // The French and German providers should not be visible.
  wait_for_element_invisible(aController, "french-check");
  wait_for_element_invisible(aController, "german-check");
  close_dialog_immediately(aController);
}

/**
 * Tests that the search button is disabled if we start up the Account
 * Provisioner, and we have no search in the input.
 */
add_task(function test_search_button_disabled_if_no_query_on_init() {
  Services.prefs.setStringPref("mail.provider.realname", "");
  plan_for_modal_dialog(
    "AccountCreation",
    subtest_search_button_enabled_state_on_init
  );
  open_provisioner_window();
  wait_for_modal_dialog("AccountCreation");
});

/**
 * Test that if we try to open the Account Provisioner dialog when an
 * Account Provisioner tab is opened, that we focus the tab instead of opening
 * the dialog.
 */
add_task(async function test_get_new_account_focuses_existing_ap_tab() {
  // If we're running this test on macOS we need to first close all the tabs
  // since we skipped `test_can_pref_off_account_provisioner`.
  if (AppConstants.platform == "macosx") {
    // Close all existing tabs except the first mail tab to avoid errors.
    mc.tabmail.closeOtherTabs(mc.tabmail.tabInfo[0]);
  }

  get_to_order_form("green@example.com");
  let apTab = mc.tabmail.getTabInfoForCurrentOrFirstModeInstance(
    mc.tabmail.tabModes.accountProvisionerTab
  );

  // Switch back to the inbox tab.
  mc.tabmail.switchToTab(0);

  // Try to re-open the provisioner dialog
  open_provisioner_window();

  // If we got here, that means that we weren't blocked by a dialog
  // being opened, which is good.
  assert_selected_tab(apTab);

  // Now open up the Account Hub, and try opening the Account Provisioner from
  // there.
  let tab = await openAccountSetup();
  // Click on the "Get a new Account" button in the wizard.
  EventUtils.synthesizeMouseAtCenter(
    tab.browser.contentWindow.document.getElementById("provisionerButton"),
    {},
    tab.browser.contentWindow
  );

  // If we got here, that means that we weren't blocked by a dialog
  // being opened, which is what we wanted.
  assert_selected_tab(apTab);
  mc.tabmail.closeOtherTabs(mc.tabmail.tabInfo[0]);
});

/**
 * Test that some prices can be per-address, instead of per-provider.
 */
add_task(function test_per_address_prices() {
  plan_for_modal_dialog("AccountCreation", subtest_per_address_prices);
  open_provisioner_window();
  wait_for_modal_dialog("AccountCreation");
});

/**
 * Subtest used by test_html_characters_and_ampersands.  This function puts
 * a name with HTML tags into the search input, does a search, and ensures
 * that the rendered name has escaped the HTML tags properly.
 */
function subtest_per_address_prices(w) {
  wait_for_provider_list_loaded(w);
  wait_for_search_ready(w);

  // Type a name with some HTML tags and an ampersand in there
  // to see if we can trip up account provisioner.
  type_in_search_name(w, "Joanna Finkelstein");

  // Do the search.
  mc.click(w.e("searchSubmit"));

  wait_for_search_results(w);

  let prices = ["$20-$0 a year", "Free", "$20.00 a year"];

  // Check that the multi-provider has the default price.
  let providers = w.window.document.querySelectorAll(".provider");
  let price;
  let multi;
  for (let provider of providers) {
    if (provider.innerHTML == "multi") {
      multi = provider;
      price = provider.parentNode.querySelector(".price");
      break;
    }
  }
  Assert.equal(price.innerHTML, prices[0].slice(0, 6));

  // Click on the multi provider. This reveals the buttons with the prices.
  mc.click(multi);
  mc.waitFor(
    () =>
      w.window.document.querySelectorAll('button.create:not([disabled="true"])')
        .length > 0
  );

  // For each button, make sure it has the correct price.
  let buttons = w.window.document.querySelectorAll(
    'button.create:not([disabled="true"])'
  );
  let index = 0;
  for (let button of buttons) {
    // Emulate jquery's :visible selector
    if (button.offsetWidth == 0 && button.offsetHeight == 0) {
      continue;
    }
    Assert.equal(button.innerHTML, prices[index]);
    index++;
  }
}
