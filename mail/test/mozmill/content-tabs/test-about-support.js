/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var MODULE_NAME = 'test-about-support';

var RELATIVE_ROOT = '../shared-modules';
var MODULE_REQUIRES = ['folder-display-helpers', 'content-tab-helpers',
                       'compose-helpers', 'window-helpers'];

Components.utils.import("resource://gre/modules/Services.jsm");

var warningText = new Map();

function setupModule(module) {
  for (let lib of MODULE_REQUIRES) {
    collector.getModule(lib).installInto(module);
  }

  // The wording of the warning message when private data is being exported
  // from the about:support page.
  let bundle = Services.strings.createBundle(
    "chrome://messenger/locale/aboutSupportMail.properties");
  // In HTML the warning label and text comprise the textContent of a single element.
  warningText.set("text/html", bundle.GetStringFromName("warningLabel") + " " +
                               bundle.GetStringFromName("warningText"));
  // In plain text the warning label may end up on a separate line so do not match it.
  warningText.set("text/unicode", bundle.GetStringFromName("warningText"));
}

// After every test we want to close the about:support tab so that failures
// don't cascade.
function teardownTest(module) {
  mc.tabmail.closeOtherTabs(mc.tabmail.tabInfo[0]);
}

/**
 * Strings found in the about:support HTML or text that should clearly mark the
 * data as being from about:support.
 */
const ABOUT_SUPPORT_STRINGS = ["Application Basics", "Mail and News Accounts",
                               "Extensions", "Important Modified Preferences",
                               "Graphics", "JavaScript", "Accessibility",
                               "Library Versions"];

/**
 * Strings that if found in the about:support text or HTML usually indicate an
 * error.
 */
const ABOUT_SUPPORT_ERROR_STRINGS = new Map([[ "text/html",["undefined", "null"] ],
                                             [ "text/unicode",["undefined"] ]]);


/*
 * Helpers
 */

/**
 * Opens about:support and waits for it to load.
 *
 * @returns the about:support tab.
 */
function open_about_support() {
  let tab = open_content_tab_with_click(mc.menus.helpMenu.aboutsupport_open,
                                        "about:support");
  // We have one variable that's asynchronously populated -- wait for it to be
  // populated.
  mc.waitFor(() => (tab.browser.contentWindow.gAccountDetails !== undefined),
             "Timeout waiting for about:support's gAccountDetails to populate.");

  return tab;
}

/**
 * Opens a compose window containing the troubleshooting information.
 *
 * @param aTab The about:support tab.
 */
function open_send_via_email(aTab) {
  let button = content_tab_eid(aTab, "send-via-email");
  plan_for_new_window("msgcompose");
  mc.click(button);
  let cwc = wait_for_compose_window();
  return cwc;
}

/**
 * Find some element marked as private data.
 */
function find_private_element(aTab) {
  // We use the identity name as an example of a private-only element.
  // It is currenly the second td element with class="data-private" in the table.
  // The content string must be something unique that is not found anywhere else.
  let elem = aTab.browser.contentDocument
                 .querySelector("#accounts-table td.data-private~td.data-private");
  assert_true(elem != null);
  assert_true(elem.textContent.length > 0);
  return elem;
}

/*
 * Tests
 */

/**
 * Test displaying the about:support page. Also perform a couple of basic tests
 * to check that no major errors have occurred. The basic tests are by no means
 * comprehensive.
 */
function test_display_about_support() {
  let tab = open_about_support();
  // Check that the document has a few strings that indicate that we've loaded
  // the right page.
  for (let str of ABOUT_SUPPORT_STRINGS) {
    assert_content_tab_text_present(tab, str);
  }

  // Check that error strings aren't present anywhere
  for (let str of ABOUT_SUPPORT_ERROR_STRINGS.get("text/html")) {
    assert_content_tab_text_absent(tab, str);
  }

  // Bug 1339436
  // Test that the tables in the page are all populated with at least one row
  // in the tbody element.
  // An exception in the code could cause some to be empty.
  let tables = tab.browser.contentDocument.querySelectorAll("tbody");
  let emptyTables = [ "graphics-failures-tbody", "graphics-tbody",
                      "locked-prefs-tbody", "sandbox-syscalls-tbody",
                      "crashes-tbody" ]; // some tables may be empty
  for (let table of tables) {
    if (!emptyTables.includes(table.id))
      assert_true(table.querySelectorAll("tr").length > 0,
                  "Troubleshooting table '" + table.id + "' is empty!");
  }

  close_tab(tab);
}

/**
 * Test that our accounts are displayed in order.
 */
function test_accounts_in_order() {
  let tab = open_about_support();
  // This is a really simple test and by no means comprehensive -- test that
  // "account1" appears before "account2" in the HTML content.
  assert_content_tab_text_present(tab, "account1");
  assert_content_tab_text_present(tab, "account2");
  let html = tab.browser.contentDocument.documentElement.innerHTML;
  if (html.indexOf("account1") > html.indexOf("account2")) {
    mark_failure(["account1 found after account2 in the HTML page"]);
  }
  close_tab(tab);
}

var UNIQUE_ID = "3a9e1694-7115-4237-8b1e-1cabe6e35073";

/**
 * Test that a modified preference on the whitelist but not on the blacklist
 * shows up.
 */
function test_modified_pref_on_whitelist() {
  const PREFIX = "accessibility.";
  let prefName = PREFIX + UNIQUE_ID;
  Services.prefs.setBoolPref(prefName, true);
  let tab = open_about_support();

  assert_content_tab_text_present(tab, prefName);
  close_tab(tab);
  Services.prefs.clearUserPref(prefName);
}

/**
 * Test that a modified preference not on the whitelist doesn't show up.
 */
function test_modified_pref_not_on_whitelist() {
  Services.prefs.setBoolPref(UNIQUE_ID, true);
  let tab = open_about_support();
  assert_content_tab_text_absent(tab, UNIQUE_ID);
  close_tab(tab);
  Services.prefs.clearUserPref(UNIQUE_ID);
}

/**
 * Test that a modified preference on the blacklist doesn't show up.
 */
function test_modified_pref_on_blacklist() {
  const PREFIX = "network.proxy.";
  let prefName = PREFIX + UNIQUE_ID;
  Services.prefs.setBoolPref(prefName, true);
  let tab = open_about_support();

  assert_content_tab_text_absent(tab, prefName);
  close_tab(tab);
  Services.prefs.clearUserPref(prefName);
}

/**
 * Test that private data isn't displayed by default, and that when it is
 * displayed, it actually shows up.
 */
function test_private_data() {
  let tab = open_about_support();
  let checkbox = content_tab_eid(tab, "check-show-private-data");

  // We use the profile path and some other element as an example
  // of a private-only element.
  let privateElem1 = find_private_element(tab);
  let privateElem2 = content_tab_e(tab, "profile-dir-path");;
  // We use the profile button as an example of a public element.
  let publicElem = content_tab_e(tab, "profile-dir-button");

  assert_true(!checkbox.checked,
              "Private data checkbox shouldn't be checked by default");
  assert_content_tab_element_visible(tab, publicElem);
  assert_content_tab_element_hidden(tab, privateElem1);
  assert_content_tab_element_hidden(tab, privateElem2);

  // Now check the checkbox and see what happens.
  mc.click(checkbox);
  wait_for_content_tab_element_display(tab, privateElem1);
  wait_for_content_tab_element_display(tab, privateElem2);
  close_tab(tab);
}

/**
 * Checks if text fragment exists in the document.
 * If it is a node tree, find the element whole contents is the searched text.
 * If it is plain text string, just check in text is anywhere in it.
 *
 * @param aDocument  A node tree or a string of plain text data.
 * @param aText      The text to find in the document.
 */
function check_text_in_body(aDocument, aText) {
  if (typeof(aDocument) == "object")
    return (get_element_by_text(aDocument, aText) != null);
  else
    return aDocument.includes(aText);
}

/**
 * Test (well, sort of) the copy to clipboard function with public data.
 */
function test_copy_to_clipboard_public() {
  let tab = open_about_support();
  let privateElem = find_private_element(tab);
  // To avoid destroying the current contents of the clipboard, instead of
  // actually copying to it, we just retrieve what would have been copied to it
  let transferable = tab.browser.contentWindow.getClipboardTransferable();
  for (let flavor of ["text/html", "text/unicode"]) {
    let data = {};
    transferable.getTransferData(flavor, data, {});
    let text = data.value.QueryInterface(Ci.nsISupportsString).data;
    let contentBody;
    if (flavor == "text/html") {
      let parser = Components.classes["@mozilla.org/xmlextras/domparser;1"]
                             .createInstance(Ci.nsIDOMParser);
      contentBody = parser.parseFromString(text, "text/html").body;
    } else {
      contentBody = text;
    }

    for (let str of ABOUT_SUPPORT_STRINGS) {
      if (!check_text_in_body(contentBody, str))
        mark_failure(["Unable to find \"" + str + "\" in flavor \"" + flavor + "\""]);
    }

    for (let str of ABOUT_SUPPORT_ERROR_STRINGS.get(flavor)) {
      if (check_text_in_body(contentBody, str))
        mark_failure(["Found \"" + str + "\" in flavor \"" + flavor + "\""]);
    }

    // Check that private data isn't in the output.
    if (check_text_in_body(contentBody, privateElem.textContent))
      mark_failure(["Found private data in flavor \"" + flavor + "\""]);
  }
  close_tab(tab);
}

/**
 * Test (well, sort of) the copy to clipboard function with private data.
 */
function test_copy_to_clipboard_private() {
  let tab = open_about_support();

  // Display private data.
  let privateElem = find_private_element(tab);
  mc.click(content_tab_eid(tab, "check-show-private-data"));
  wait_for_content_tab_element_display(tab, privateElem);

  // To avoid destroying the current contents of the clipboard, instead of
  // actually copying to it, we just retrieve what would have been copied to it
  let transferable = tab.browser.contentWindow.getClipboardTransferable();
  for (let flavor of ["text/html", "text/unicode"]) {
    let data = {};
    transferable.getTransferData(flavor, data, {});
    let text = data.value.QueryInterface(Ci.nsISupportsString).data;
    let contentBody;
    if (flavor == "text/html") {
      let parser = Components.classes["@mozilla.org/xmlextras/domparser;1"]
                             .createInstance(Ci.nsIDOMParser);
      contentBody = parser.parseFromString(text, "text/html").body;
    } else {
      contentBody = text;
    }

    for (let str of ABOUT_SUPPORT_STRINGS) {
      if (!check_text_in_body(contentBody, str))
        mark_failure(["Unable to find \"" + str + "\" in flavor \"" + flavor + "\""]);
    }

    for (let str of ABOUT_SUPPORT_ERROR_STRINGS.get(flavor)) {
      if (check_text_in_body(contentBody, str))
        mark_failure(["Found \"" + str + "\" in flavor \"" + flavor + "\""]);
    }

    // Check that private data is in the output.
    if (!check_text_in_body(contentBody, privateElem.textContent))
      mark_failure(["Unable to find private data in flavor \"" + flavor + "\""]);

    // Check that the warning text is in the output.
    if (!check_text_in_body(contentBody, warningText.get(flavor)))
      mark_failure(["Unable to find warning text in flavor \"" + flavor + "\""]);
  }
  close_tab(tab);
}

/**
 * Test opening the compose window with public data.
 */
function test_send_via_email_public() {
  let tab = open_about_support();
  let privateElem = find_private_element(tab);

  let cwc = open_send_via_email(tab);

  let contentBody = cwc.e("content-frame").contentDocument.body;

  for (let str of ABOUT_SUPPORT_STRINGS) {
    if (!check_text_in_body(contentBody, str))
      mark_failure(["Unable to find \"" + str + "\" in compose window"]);
  }

  for (let str of ABOUT_SUPPORT_ERROR_STRINGS.get("text/html")) {
    if (check_text_in_body(contentBody, str))
      mark_failure(["Found \"" + str + "\" in compose window"]);
  }

  // Check that private data isn't in the output.
  if (check_text_in_body(contentBody, privateElem.textContent))
    mark_failure(["Found private data in compose window"]);

  close_compose_window(cwc);
  close_tab(tab);
}

/**
 * Test opening the compose window with private data.
 */
function test_send_via_email_private() {
  let tab = open_about_support();

  // Display private data.
  let privateElem = find_private_element(tab);
  mc.click(content_tab_eid(tab, "check-show-private-data"));
  wait_for_content_tab_element_display(tab, privateElem);

  let cwc = open_send_via_email(tab);

  let contentBody = cwc.e("content-frame").contentDocument.body;

  for (let str of ABOUT_SUPPORT_STRINGS) {
    if (!check_text_in_body(contentBody, str))
      mark_failure(["Unable to find \"" + str + "\" in compose window"]);
  }

  for (let str of ABOUT_SUPPORT_ERROR_STRINGS.get("text/html")) {
    if (check_text_in_body(contentBody, str))
      mark_failure(["Found \"" + str + "\" in compose window"]);
  }

  // Check that private data is in the output.
  if (!check_text_in_body(contentBody, privateElem.textContent))
    mark_failure(["Unable to find private data in compose window"]);

  // Check that the warning text is in the output.
  if (!check_text_in_body(contentBody, warningText.get("text/html")))
    mark_failure(["Unable to find warning text in compose window"]);

  close_compose_window(cwc);
  close_tab(tab);
}
