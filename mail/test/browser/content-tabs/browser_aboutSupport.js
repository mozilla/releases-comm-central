/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { close_compose_window, compose_window_ready } = ChromeUtils.importESModule(
  "resource://testing-common/mail/ComposeHelpers.sys.mjs"
);
var {
  assert_content_tab_element_hidden,
  assert_content_tab_element_visible,
  assert_content_tab_text_absent,
  assert_content_tab_text_present,
  content_tab_e,
  get_content_tab_element_display,
  get_element_by_text,
  open_content_tab_with_click,
  promise_content_tab_element_display,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/ContentTabHelpers.sys.mjs"
);

var { close_tab } = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
var { click_menus_in_sequence, promise_new_window } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/WindowHelpers.sys.mjs"
  );

var warningText = new Map();

add_setup(function () {
  // The wording of the warning message when private data is being exported
  // from the about:support page.
  const bundle = Services.strings.createBundle(
    "chrome://messenger/locale/aboutSupportMail.properties"
  );
  // In HTML the warning label and text comprise the textContent of a single element.
  warningText.set(
    "text/html",
    bundle.GetStringFromName("warningLabel") +
      " " +
      bundle.GetStringFromName("warningText")
  );
  // In plain text the warning label may end up on a separate line so do not match it.
  warningText.set("text/plain", bundle.GetStringFromName("warningText"));
});

/**
 * Strings found in the about:support HTML or text that should clearly mark the
 * data as being from about:support.
 */
const ABOUT_SUPPORT_STRINGS = [
  "Application Basics",
  "Mail and News Accounts",
  "Add-ons",
  "Important Modified Preferences",
  "Graphics",
  "Accessibility",
  "Library Versions",
];

/**
 * Strings that if found in the about:support text or HTML usually indicate an
 * error.
 */
const ABOUT_SUPPORT_ERROR_STRINGS = new Map([
  ["text/html", ["undefined", "null"]],
  ["text/plain", ["undefined"]],
]);

/*
 * Helpers
 */

/**
 * Opens about:support and waits for it to load.
 *
 * @returns the about:support tab.
 */
async function open_about_support() {
  const openAboutSupport = async function () {
    if (AppConstants.platform == "macosx") {
      document.getElementById("aboutsupport_open").click();
    } else {
      // Show menubar so we can click it.
      document.getElementById("toolbar-menubar").removeAttribute("autohide");
      const helpMenu = document.getElementById("helpMenu");
      EventUtils.synthesizeMouseAtCenter(helpMenu, {}, helpMenu.ownerGlobal);
      await click_menus_in_sequence(document.getElementById("menu_HelpPopup"), [
        { id: "aboutsupport_open" },
      ]);
    }
  };
  const tab = await open_content_tab_with_click(
    openAboutSupport,
    "about:support"
  );

  // Make sure L10n is done.
  let l10nDone = false;
  tab.browser.contentDocument.l10n.ready.then(
    () => (l10nDone = true),
    console.error
  );
  await TestUtils.waitForCondition(
    () => l10nDone,
    "Timeout waiting for L10n to complete."
  );

  // We have one variable that's asynchronously populated -- wait for it to be
  // populated.
  await TestUtils.waitForCondition(
    () => tab.browser.contentWindow.gAccountDetails !== undefined,
    "Timeout waiting for about:support's gAccountDetails to populate."
  );

  await TestUtils.waitForCondition(
    () => content_tab_e(tab, "accounts-tbody").children.length > 1,
    "Accounts sections didn't load."
  );
  // The population of the info fields is async, so we must wait until
  // the last one is done.
  await TestUtils.waitForCondition(
    () =>
      content_tab_e(tab, "intl-osprefs-regionalprefs").textContent.trim() != "",
    "Regional prefs section didn't load."
  );

  // Wait an additional half-second for some more localisation caused by
  // runtime changes to the page.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 500));
  return tab;
}

/**
 * Opens a compose window containing the troubleshooting information.
 *
 * @param aTab The about:support tab.
 */
async function open_send_via_email(aTab) {
  const button = content_tab_e(aTab, "send-via-email");
  const composePromise = promise_new_window("msgcompose");
  EventUtils.synthesizeMouseAtCenter(
    button,
    { clickCount: 1 },
    button.ownerGlobal
  );
  const cwc = await compose_window_ready(composePromise);
  return cwc;
}

/**
 * Find some element marked as private data.
 */
function find_private_element(aTab) {
  // We use the identity name as an example of a private-only element.
  // It is currently the second td element with class="data-private" in the table.
  // The content string must be something unique that is not found anywhere else.
  const elem = aTab.browser.contentDocument.querySelector(
    "#accounts-table td.data-private~td.data-private"
  );
  Assert.ok(elem != null);
  Assert.ok(elem.textContent.length > 0);
  Assert.equal(get_content_tab_element_display(aTab, elem), "none");
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
add_task(async function test_display_about_support() {
  const tab = await open_about_support();
  // Check that the document has a few strings that indicate that we've loaded
  // the right page.
  for (const str of ABOUT_SUPPORT_STRINGS) {
    assert_content_tab_text_present(tab, str);
  }

  // Check that error strings aren't present anywhere
  for (const str of ABOUT_SUPPORT_ERROR_STRINGS.get("text/html")) {
    assert_content_tab_text_absent(tab, str);
  }

  // Bug 1339436
  // Test that the tables in the page are all populated with at least one row
  // in the tbody element.
  // An exception in the code could cause some to be empty.
  const tables = tab.browser.contentDocument.querySelectorAll("tbody");
  const emptyTables = [
    "graphics-failures-tbody",
    "graphics-tbody",
    "locked-prefs-tbody",
    "sandbox-syscalls-tbody",
    "crashes-tbody",
    "processes-tbody",
    "support-printing-prefs-tbody",
    "chat-tbody",
  ]; // some tables may be empty
  for (const table of tables) {
    if (!emptyTables.includes(table.id)) {
      Assert.ok(
        table.querySelectorAll("tr").length > 0,
        "Troubleshooting table '" + table.id + "' is empty!"
      );
    }
  }

  // Mozmill uses a user.js file in the profile, so the warning about the file
  // should be visible here.
  const userjsElem = tab.browser.contentDocument.getElementById(
    "prefs-user-js-section"
  );
  Assert.ok(userjsElem.hasChildNodes);
  Assert.ok(
    tab.browser.contentDocument.defaultView.getComputedStyle(userjsElem)
      .display == "block"
  );
  Assert.ok(
    tab.browser.contentDocument.defaultView.getComputedStyle(userjsElem)
      .visibility == "visible"
  );

  close_tab(tab);
});

/**
 * Test that our accounts are displayed in order.
 */
add_task(async function test_accounts_in_order() {
  const tab = await open_about_support();
  // This is a really simple test and by no means comprehensive -- test that
  // "account1" appears before "account2" in the HTML content.
  assert_content_tab_text_present(tab, "account1");
  assert_content_tab_text_present(tab, "account2");
  const html = tab.browser.contentDocument.documentElement.innerHTML;
  if (html.indexOf("account1") > html.indexOf("account2")) {
    Assert.report(
      true,
      undefined,
      undefined,
      "account1 found after account2 in the HTML page"
    );
  }
  close_tab(tab);
});

var UNIQUE_ID = "3a9e1694-7115-4237-8b1e-1cabe6e35073";

/**
 * Test that a modified preference on the whitelist but not on the blacklist
 * shows up.
 */
add_task(async function test_modified_pref_on_whitelist() {
  const PREFIX = "accessibility.";
  const prefName = PREFIX + UNIQUE_ID;
  Services.prefs.setBoolPref(prefName, true);
  const tab = await open_about_support();

  assert_content_tab_text_present(tab, prefName);
  close_tab(tab);
  Services.prefs.clearUserPref(prefName);
});

/**
 * Test that a modified preference not on the whitelist doesn't show up.
 */
add_task(async function test_modified_pref_not_on_whitelist() {
  Services.prefs.setBoolPref(UNIQUE_ID, true);
  const tab = await open_about_support();
  assert_content_tab_text_absent(tab, UNIQUE_ID);
  close_tab(tab);
  Services.prefs.clearUserPref(UNIQUE_ID);
});

/**
 * Test that a modified preference on the blacklist doesn't show up.
 */
add_task(async function test_modified_pref_on_blacklist() {
  const PREFIX = "network.proxy.";
  const prefName = PREFIX + UNIQUE_ID;
  Services.prefs.setBoolPref(prefName, true);
  const tab = await open_about_support();

  assert_content_tab_text_absent(tab, prefName);
  close_tab(tab);
  Services.prefs.clearUserPref(prefName);
});

/**
 * Test that private data isn't displayed by default, and that when it is
 * displayed, it actually shows up.
 */
add_task(async function test_private_data() {
  const tab = await open_about_support();
  const checkbox = content_tab_e(tab, "check-show-private-data");

  // We use the profile path and some other element as an example
  // of a private-only element.
  const privateElem1 = find_private_element(tab);
  const privateElem2 = content_tab_e(tab, "profile-dir-box");
  // We use the profile button as an example of a public element.
  const publicElem = content_tab_e(tab, "profile-dir-button");

  Assert.ok(
    !checkbox.checked,
    "Private data checkbox shouldn't be checked by default"
  );
  assert_content_tab_element_visible(tab, publicElem);
  assert_content_tab_element_hidden(tab, privateElem1);
  assert_content_tab_element_hidden(tab, privateElem2);

  // Now check the checkbox and see what happens.
  EventUtils.synthesizeMouseAtCenter(
    checkbox,
    { clickCount: 1 },
    checkbox.ownerGlobal
  );
  await promise_content_tab_element_display(tab, privateElem1);
  await promise_content_tab_element_display(tab, privateElem2);
  close_tab(tab);
});

/**
 * Checks if text fragment exists in the document.
 * If it is a node tree, find the element whole contents is the searched text.
 * If it is plain text string, just check in text is anywhere in it.
 *
 * @param aDocument  A node tree or a string of plain text data.
 * @param aText      The text to find in the document.
 */
function check_text_in_body(aDocument, aText) {
  if (typeof aDocument == "object") {
    return get_element_by_text(aDocument, aText) != null;
  }
  return aDocument.includes(aText);
}

/**
 * Test (well, sort of) the copy to clipboard function with public data.
 */
add_task(async function test_copy_to_clipboard_public() {
  const tab = await open_about_support();
  const privateElem = find_private_element(tab);
  // To avoid destroying the current contents of the clipboard, instead of
  // actually copying to it, we just retrieve what would have been copied to it
  const transferable = tab.browser.contentWindow.getClipboardTransferable();
  for (const flavor of ["text/html", "text/plain"]) {
    const data = {};
    transferable.getTransferData(flavor, data);
    const text = data.value.QueryInterface(Ci.nsISupportsString).data;
    let contentBody;
    if (flavor == "text/html") {
      const parser = new DOMParser();
      contentBody = parser.parseFromString(text, "text/html").body;
    } else {
      contentBody = text;
    }

    for (const str of ABOUT_SUPPORT_STRINGS) {
      if (!check_text_in_body(contentBody, str)) {
        Assert.report(
          true,
          undefined,
          undefined,
          `Unable to find "${str}" in flavor "${flavor}"`
        );
      }
    }

    for (const str of ABOUT_SUPPORT_ERROR_STRINGS.get(flavor)) {
      if (check_text_in_body(contentBody, str)) {
        Assert.report(
          true,
          undefined,
          undefined,
          `Found "${str}" in flavor "${flavor}"`
        );
      }
    }

    // Check that private data isn't in the output.
    if (check_text_in_body(contentBody, privateElem.textContent)) {
      Assert.report(
        true,
        undefined,
        undefined,
        `Found private data in flavor "${flavor}"`
      );
    }
  }
  close_tab(tab);
});

/**
 * Test (well, sort of) the copy to clipboard function with private data.
 */
add_task(async function test_copy_to_clipboard_private() {
  const tab = await open_about_support();

  // Display private data.
  const privateElem = find_private_element(tab);
  const show = content_tab_e(tab, "check-show-private-data");
  EventUtils.synthesizeMouseAtCenter(show, { clickCount: 1 }, show.ownerGlobal);
  await promise_content_tab_element_display(tab, privateElem);

  // To avoid destroying the current contents of the clipboard, instead of
  // actually copying to it, we just retrieve what would have been copied to it
  const transferable = tab.browser.contentWindow.getClipboardTransferable();
  for (const flavor of ["text/html", "text/plain"]) {
    const data = {};
    transferable.getTransferData(flavor, data);
    const text = data.value.QueryInterface(Ci.nsISupportsString).data;
    let contentBody;
    if (flavor == "text/html") {
      const parser = new DOMParser();
      contentBody = parser.parseFromString(text, "text/html").body;
    } else {
      contentBody = text;
    }

    for (const str of ABOUT_SUPPORT_STRINGS) {
      if (!check_text_in_body(contentBody, str)) {
        Assert.report(
          true,
          undefined,
          undefined,
          `Unable to find "${str}" in flavor "${flavor}"`
        );
      }
    }

    for (const str of ABOUT_SUPPORT_ERROR_STRINGS.get(flavor)) {
      if (check_text_in_body(contentBody, str)) {
        Assert.report(
          true,
          undefined,
          undefined,
          `Found "${str}" in flavor "${flavor}"`
        );
      }
    }

    // Check that private data is in the output.
    if (!check_text_in_body(contentBody, privateElem.textContent)) {
      Assert.report(
        true,
        undefined,
        undefined,
        `Unable to find private data in flavor "${flavor}"`
      );
    }

    // Check that the warning text is in the output.
    if (!check_text_in_body(contentBody, warningText.get(flavor))) {
      Assert.report(
        true,
        undefined,
        undefined,
        `Unable to find warning text in flavor "${flavor}"`
      );
    }
  }
  close_tab(tab);
});

/**
 * Test opening the compose window with public data.
 */
add_task(async function test_send_via_email_public() {
  const tab = await open_about_support();
  const privateElem = find_private_element(tab);

  const cwc = await open_send_via_email(tab);

  const contentBody =
    cwc.document.getElementById("messageEditor").contentDocument.body;

  for (const str of ABOUT_SUPPORT_STRINGS) {
    if (!check_text_in_body(contentBody, str)) {
      Assert.report(
        true,
        undefined,
        undefined,
        `Unable to find "${str}" in compose window`
      );
    }
  }

  for (const str of ABOUT_SUPPORT_ERROR_STRINGS.get("text/html")) {
    if (check_text_in_body(contentBody, str)) {
      Assert.report(
        true,
        undefined,
        undefined,
        `Found "${str}" in compose window`
      );
    }
  }

  // Check that private data isn't in the output.
  if (check_text_in_body(contentBody, privateElem.textContent)) {
    Assert.report(
      true,
      undefined,
      undefined,
      `Found private data in compose window`
    );
  }

  await close_compose_window(cwc);
  close_tab(tab);
});

/**
 * Test opening the compose window with private data.
 */
add_task(async function test_send_via_email_private() {
  const tab = await open_about_support();

  // Display private data.
  const privateElem = find_private_element(tab);
  const show = content_tab_e(tab, "check-show-private-data");
  EventUtils.synthesizeMouseAtCenter(show, { clickCount: 1 }, show.ownerGlobal);
  await promise_content_tab_element_display(tab, privateElem);

  const cwc = await open_send_via_email(tab);

  const contentBody =
    cwc.document.getElementById("messageEditor").contentDocument.body;

  for (const str of ABOUT_SUPPORT_STRINGS) {
    if (!check_text_in_body(contentBody, str)) {
      Assert.report(
        true,
        undefined,
        undefined,
        `Unable to find "${str}" in compose window`
      );
    }
  }

  for (const str of ABOUT_SUPPORT_ERROR_STRINGS.get("text/html")) {
    if (check_text_in_body(contentBody, str)) {
      Assert.report(
        true,
        undefined,
        undefined,
        `Found "${str}" in compose window`
      );
    }
  }

  // Check that private data is in the output.
  if (!check_text_in_body(contentBody, privateElem.textContent)) {
    Assert.report(
      true,
      undefined,
      undefined,
      "Unable to find private data in compose window"
    );
  }

  // Check that the warning text is in the output.
  if (!check_text_in_body(contentBody, warningText.get("text/html"))) {
    Assert.report(
      true,
      undefined,
      undefined,
      "Unable to find warning text in compose window"
    );
  }

  await close_compose_window(cwc);
  close_tab(tab);
});

/**
 * Ensure that opening links in about:support doesn't crash the process
 * See: bug 1843741
 */
add_task(async function test_open_links_in_about_support() {
  const tab = await open_about_support();
  const elem = tab.browser.contentDocument.querySelector(
    "[href='about:buildconfig']"
  );
  await promise_content_tab_element_display(tab, elem);

  const tabmail = document.getElementById("tabmail");
  const eventPromise = BrowserTestUtils.waitForEvent(
    tabmail.tabContainer,
    "TabOpen"
  );
  EventUtils.synthesizeMouseAtCenter(elem, { clickCount: 1 }, elem.ownerGlobal);
  const event = await eventPromise;

  const browser = event.detail.tabInfo.linkedBrowser;
  Assert.ok(!browser.hasAttribute("remote"));
  close_tab(event.detail.tabInfo);
  close_tab(tab);
});
