/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals gFolderTreeView */

"use strict";

var EventUtils = ChromeUtils.import(
  "resource://testing-common/mozmill/EventUtils.jsm"
);

var {
  assert_content_tab_has_favicon,
  open_content_tab_with_url,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/ContentTabHelpers.jsm"
);
var { assert_element_visible, assert_element_not_visible } = ChromeUtils.import(
  "resource://testing-common/mozmill/DOMHelpers.jsm"
);

var { be_in_folder, inboxFolder } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

var {
  assert_tab_has_title,
  close_popup,
  mc,
  wait_for_popup_to_open,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var url =
  "http://mochi.test:8888/browser/comm/mail/test/browser/content-tabs/html/";
var whatsUrl = url + "whatsnew.html";

add_task(function test_content_tab_open() {
  // Need to open the thread pane to load the appropriate context menus.
  be_in_folder(inboxFolder);
  let tab = open_content_tab_with_url(whatsUrl);

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
  // Test a few random items
  BrowserTestUtils.synthesizeMouseAtCenter(
    "textarea",
    {},
    mc.tabmail.selectedTab.browser
  );
  // Bug 364914 causes textareas to not be spell checked until they have been
  // focused at last once, so give the event loop a chance to spin.
  // Since bug 1370754 the inline spell checker waits 1 second, so let's
  // wait 2 seconds to be on the safe side.
  mc.sleep(2000);
  BrowserTestUtils.synthesizeMouseAtCenter(
    "textarea",
    { type: "contextmenu" },
    mc.tabmail.selectedTab.browser
  );
  let mailContext = mc.e("mailContext");
  await wait_for_popup_to_open(mailContext);
  assert_element_visible("mailContext-spell-dictionaries");
  assert_element_visible("mailContext-spell-check-enabled");
  assert_element_not_visible("mailContext-replySender"); // we're in a content tab!
  await close_popup(mc, mailContext);

  // Different test
  BrowserTestUtils.synthesizeMouseAtCenter(
    "body > :first-child",
    { type: "contextmenu" },
    mc.tabmail.selectedTab.browser
  );
  mailContext = mc.e("mailContext");
  await wait_for_popup_to_open(mailContext);
  assert_element_not_visible("mailContext-spell-dictionaries");
  assert_element_not_visible("mailContext-spell-check-enabled");
  await close_popup(mc, mailContext);

  // Right-click on "zombocom" and add to dictionary
  BrowserTestUtils.synthesizeMouse(
    "textarea",
    5,
    5,
    { type: "contextmenu", button: 2 },
    mc.tabmail.selectedTab.browser
  );
  mailContext = mc.e("mailContext");
  await wait_for_popup_to_open(mailContext);
  let suggestions = mc.window.document.getElementsByClassName(
    "spell-suggestion"
  );
  Assert.ok(suggestions.length > 0, "What, is zombocom a registered word now?");
  mc.click(mc.e("mailContext-spell-add-to-dictionary"));
  await close_popup(mc, mailContext);

  // Now check we don't have any suggestionss
  BrowserTestUtils.synthesizeMouse(
    "textarea",
    5,
    5,
    { type: "contextmenu", button: 2 },
    mc.tabmail.selectedTab.browser
  );
  mailContext = mc.e("mailContext");
  await wait_for_popup_to_open(mailContext);
  suggestions = mc.window.document.getElementsByClassName("spell-suggestion");
  Assert.ok(suggestions.length == 0, "But I just taught you this word!");
  await close_popup(mc, mailContext);
});

/*
 // We don't have an UI to test opening content tabs twice anymore.
add_task(function test_content_tab_open_same() {
  let preCount = mc.tabmail.tabContainer.allTabs.length;

  mc.click(mc.menus.helpMenu.whatsNew);

  controller.sleep(0);

  if (mc.tabmail.tabContainer.allTabs.length != preCount)
    throw new Error("A new content tab was opened when it shouldn't have been");

  // Double-check browser is still the same.
  if (mc.window.content.location != whatsUrl)
    throw new Error("window.content is not set to the url loaded, incorrect type=\"...\"?");
});
*/

add_task(function test_content_tab_default_favicon() {
  const whatsUrl2 = url + "whatsnew1.html";
  let tab = open_content_tab_with_url(whatsUrl2);

  assert_tab_has_title(tab, "What's New Content Test 1");
  // Check the location of the favicon, this should be the site favicon in this
  // test.
  assert_content_tab_has_favicon(tab, "http://mochi.test:8888/favicon.ico");
});

add_task(async function test_content_tab_onbeforeunload() {
  let count = mc.tabmail.tabContainer.allTabs.length;
  let tab = mc.tabmail.tabInfo[count - 1];
  await SpecialPowers.spawn(tab.browser, [], () => {
    content.addEventListener("beforeunload", function(event) {
      event.returnValue = "Green llama in your car";
    });
  });

  const interactionPref = "dom.require_user_interaction_for_beforeunload";
  Services.prefs.setBoolPref(interactionPref, false);

  let dialogPromise = BrowserTestUtils.promiseAlertDialog("accept");
  mc.tabmail.closeTab(tab);
  await dialogPromise;

  Services.prefs.clearUserPref(interactionPref);
});

// XXX todo
// - test find bar
// - window.close within tab
// - zoom?

registerCleanupFunction(function teardownModule() {
  while (mc.tabmail.tabInfo.length > 1) {
    mc.tabmail.closeTab(1);
  }

  gFolderTreeView._tree.focus();
});
