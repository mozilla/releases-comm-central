/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { assert_content_tab_has_favicon, open_content_tab_with_url } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/ContentTabHelpers.sys.mjs"
  );
var { assert_element_visible, assert_element_not_visible } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/DOMHelpers.sys.mjs"
  );

var { be_in_folder, inboxFolder } = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);

var { assert_tab_has_title, close_popup, wait_for_popup_to_open } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
  );

var url =
  "http://mochi.test:8888/browser/comm/mail/test/browser/content-tabs/html/";
var whatsUrl = url + "whatsnew.html";

add_task(async function test_content_tab_open() {
  // Need to open the thread pane to load the appropriate context menus.
  await be_in_folder(inboxFolder);
  const tab = await open_content_tab_with_url(whatsUrl);

  assert_tab_has_title(tab, "What's New Content Test");
  // Check the location of the what's new image, this is via the link element
  // and therefore should be set and not favicon.png.
  // assert_content_tab_has_favicon(tab, url + "whatsnew.png");

  // Check that window.content is set up correctly wrt content-primary and
  // content-targetable.
  if (tab.browser.currentURI.spec != whatsUrl) {
    throw new Error(
      'window.content is not set to the url loaded, incorrect type="..."?'
    );
  }

  tab.browser.focus();
});

/**
 * Just make sure that the context menu does what we expect in content tabs wrt.
 * spell checking options.
 */
add_task(async function test_spellcheck_in_content_tabs() {
  const tabmail = document.getElementById("tabmail");

  // Test a few random items
  BrowserTestUtils.synthesizeMouseAtCenter(
    "textarea",
    {},
    tabmail.selectedTab.browser
  );
  // Bug 364914 causes textareas to not be spell checked until they have been
  // focused at last once, so give the event loop a chance to spin.
  // Since bug 1370754 the inline spell checker waits 1 second, so let's
  // wait 2 seconds to be on the safe side.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 2000));
  BrowserTestUtils.synthesizeMouseAtCenter(
    "textarea",
    { type: "contextmenu" },
    tabmail.selectedTab.browser
  );
  const browserContext = document.getElementById("browserContext");
  await wait_for_popup_to_open(browserContext);
  assert_element_visible("browserContext-spell-dictionaries");
  assert_element_visible("browserContext-spell-check-enabled");
  await close_popup(window, browserContext);

  // Different test
  BrowserTestUtils.synthesizeMouseAtCenter(
    "body > :first-child",
    { type: "contextmenu" },
    tabmail.selectedTab.browser
  );
  await wait_for_popup_to_open(browserContext);
  assert_element_not_visible("browserContext-spell-dictionaries");
  assert_element_not_visible("browserContext-spell-check-enabled");
  await close_popup(window, browserContext);

  // Right-click on "zombocom" and add to dictionary
  BrowserTestUtils.synthesizeMouse(
    "textarea",
    5,
    5,
    { type: "contextmenu", button: 2 },
    tabmail.selectedTab.browser
  );
  await wait_for_popup_to_open(browserContext);
  let suggestions = document.getElementsByClassName("spell-suggestion");
  Assert.ok(suggestions.length > 0, "What, is zombocom a registered word now?");
  const addToDict = document.getElementById(
    "browserContext-spell-add-to-dictionary"
  );
  if (AppConstants.platform == "macosx") {
    // We need to use click() since the synthesizeMouseAtCenter doesn't work for
    // context menu items on macos.
    addToDict.click();
  } else {
    EventUtils.synthesizeMouseAtCenter(addToDict, {}, addToDict.ownerGlobal);
  }
  await close_popup(window, browserContext);

  // Now check we don't have any suggestionss
  BrowserTestUtils.synthesizeMouse(
    "textarea",
    5,
    5,
    { type: "contextmenu", button: 2 },
    tabmail.selectedTab.browser
  );
  await wait_for_popup_to_open(browserContext);
  suggestions = document.getElementsByClassName("spell-suggestion");
  Assert.ok(suggestions.length == 0, "But I just taught you this word!");
  await close_popup(window, browserContext);
});

add_task(async function test_content_tab_default_favicon() {
  const whatsUrl2 = url + "whatsnew1.html";
  const tab = await open_content_tab_with_url(whatsUrl2);

  assert_tab_has_title(tab, "What's New Content Test 1");
  // Check the location of the favicon, this should be the site favicon in this
  // test.
  assert_content_tab_has_favicon(tab, "http://mochi.test:8888/favicon.ico");
});

add_task(async function test_content_tab_onbeforeunload() {
  const tabmail = document.getElementById("tabmail");
  const count = tabmail.tabContainer.allTabs.length;
  const tab = tabmail.tabInfo[count - 1];
  await SpecialPowers.spawn(tab.browser, [], () => {
    content.addEventListener("beforeunload", function (event) {
      event.returnValue = "Green llama in your car";
    });
  });

  const interactionPref = "dom.require_user_interaction_for_beforeunload";
  Services.prefs.setBoolPref(interactionPref, false);

  // Deny closing the tab.
  const denyTabCloseDialogPromise =
    BrowserTestUtils.promiseAlertDialog("cancel");
  tabmail.closeTab(tab);
  await denyTabCloseDialogPromise;

  // The tab should still be open.
  Assert.equal(
    count,
    tabmail.tabContainer.allTabs.length,
    "Number of open tabs should be correct"
  );

  // Accept closing the tab.
  const acceptTabCloseDialogPromise =
    BrowserTestUtils.promiseAlertDialog("accept");
  tabmail.closeTab(tab);
  await acceptTabCloseDialogPromise;

  // The tab should have been closed.
  Assert.equal(
    count - 1,
    tabmail.tabContainer.allTabs.length,
    "Number of open tabs should be correct after tab was closed"
  );

  Services.prefs.clearUserPref(interactionPref);
});

// XXX todo
// - test find bar
// - window.close within tab
// - zoom?

registerCleanupFunction(function () {
  const tabmail = document.getElementById("tabmail");
  while (tabmail.tabInfo.length > 1) {
    tabmail.closeTab(1);
  }
});
