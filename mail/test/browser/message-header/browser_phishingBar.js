/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that phishing notifications behave properly.
 */

"use strict";

var {
  add_message_to_folder,
  be_in_folder,
  create_folder,
  create_message,
  get_about_message,
  inboxFolder,
  open_message_from_file,
  select_click_row,
  wait_for_message_display_completion,
} = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/FolderDisplayHelpers.sys.mjs"
);
var {
  assert_notification_displayed,
  get_notification_button,
  wait_for_notification_to_show,
  wait_for_notification_to_stop,
} = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/NotificationBoxHelpers.sys.mjs"
);
var { click_menus_in_sequence, promise_new_window } =
  ChromeUtils.importESModule(
    "resource://testing-common/mozmill/WindowHelpers.sys.mjs"
  );
var { MockRegistrar } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistrar.sys.mjs"
);

var folder;
var kBoxId = "mail-notification-top";
var kNotificationValue = "maybeScam";

/**
 * gMockExtProtocolSvc allows us to capture (most if not all) attempts to
 * open links in the default browser.
 */
var gMockExtProtocolSvc = {
  QueryInterface: ChromeUtils.generateQI(["nsIExternalProtocolService"]),

  _loadedURLs: [],
  externalProtocolHandlerExists(aProtocolScheme) {},
  getApplicationDescription(aScheme) {},
  getProtocolHandlerInfo(aProtocolScheme) {},
  getProtocolHandlerInfoFromOS(aProtocolScheme, aFound) {},
  isExposedProtocol(aProtocolScheme) {},
  loadURI(aURI, aWindowContext) {
    this._loadedURLs.push(aURI.spec);
  },
  setProtocolHandlerDefaults(aHandlerInfo, aOSHandlerExists) {},
  urlLoaded(aURL) {
    return this._loadedURLs.includes(aURL);
  },
};

add_setup(async function () {
  gMockExtProtocolSvc._classID = MockRegistrar.register(
    "@mozilla.org/uriloader/external-protocol-service;1",
    gMockExtProtocolSvc
  );

  folder = await create_folder("PhishingBarA");
  // msg #0
  await add_message_to_folder(
    [folder],
    create_message({
      body: {
        body: '<form action="http://localhost/download-me"><input></form>.',
        contentType: "text/html",
      },
    })
  );
  // msg #1
  await add_message_to_folder([folder], create_message());
  // msg #2
  await add_message_to_folder(
    [folder],
    create_message({
      body: {
        body: "check out http://130.128.4.1. and http://130.128.4.2/.",
        contentType: "text/plain",
      },
    })
  );
  // msg #3
  await add_message_to_folder(
    [folder],
    create_message({
      body: {
        body: '<a href="http://subdomain.google.com/">http://www.google.com</a>.',
        contentType: "text/html",
      },
    })
  );
  // msg #4
  await add_message_to_folder(
    [folder],
    create_message({
      body: {
        body: '<a href="http://subdomain.google.com/">http://google.com</a>.',
        contentType: "text/html",
      },
    })
  );
  // msg #5
  await add_message_to_folder(
    [folder],
    create_message({
      body: {
        body: '<a href="http://evilhost">http://localhost</a>.',
        contentType: "text/html",
      },
    })
  );
  // msg #6
  await add_message_to_folder(
    [folder],
    create_message({
      body: {
        body: '<form action="http://localhost/download-me"><input></form>.',
        contentType: "text/html",
      },
    })
  );
  // msg #7
  await add_message_to_folder(
    [folder],
    create_message({
      body: {
        body: '<a href="http://216.58.211.228/bla">http://216.58.211.228/</a>',
        contentType: "text/html",
      },
    })
  );
});

registerCleanupFunction(() => {
  MockRegistrar.unregister(gMockExtProtocolSvc._classID);
});

/**
 * Make sure the notification shows, and goes away once the Ignore menuitem
 * is clicked.
 */
async function assert_ignore_works(aWin) {
  const aboutMessage = get_about_message(aWin);
  await wait_for_notification_to_show(aboutMessage, kBoxId, kNotificationValue);
  const prefButton = get_notification_button(
    aboutMessage,
    kBoxId,
    kNotificationValue,
    { popup: "phishingOptions" }
  );
  EventUtils.synthesizeMouseAtCenter(prefButton, {}, prefButton.ownerGlobal);
  await click_menus_in_sequence(
    aboutMessage.document.getElementById("phishingOptions"),
    [{ id: "phishingOptionIgnore" }]
  );
  await wait_for_notification_to_stop(aboutMessage, kBoxId, kNotificationValue);
}

/**
 * Helper function to click the first link in a message if one is available.
 */
function click_link_if_available() {
  const msgBody =
    get_about_message().getMessagePaneBrowser().contentDocument.body;
  if (msgBody.getElementsByTagName("a").length > 0) {
    msgBody.getElementsByTagName("a")[0].click();
  }
}

/**
 * Test that when viewing a message, choosing ignore hides the the phishing
 * notification.
 */
add_task(async function test_ignore_phishing_warning_from_message() {
  const aboutMessage = get_about_message();

  await be_in_folder(folder);
  await select_click_row(-1);
  await assert_ignore_works(window);

  await select_click_row(-2);
  // msg 1 is normal -> no phishing warning
  assert_notification_displayed(
    aboutMessage,
    kBoxId,
    kNotificationValue,
    false
  );
  await select_click_row(-1);
  // msg 0 is a potential phishing attempt, but we ignored it so that should
  // be remembered
  assert_notification_displayed(
    aboutMessage,
    kBoxId,
    kNotificationValue,
    false
  );
});

/**
 * Test that when viewing en eml file, choosing ignore hides the phishing
 * notification.
 */
add_task(async function test_ignore_phishing_warning_from_eml() {
  const file = new FileUtils.File(getTestFilePath("data/evil.eml"));

  const msgc = await open_message_from_file(file);
  await assert_ignore_works(msgc);

  await BrowserTestUtils.closeWindow(msgc);
}).skip(); // TODO: fix broken feature. Disabled in bug 1787094

/**
 * Test that when viewing an attached eml file, the phishing notification works.
 */
add_task(async function test_ignore_phishing_warning_from_eml_attachment() {
  const file = new FileUtils.File(getTestFilePath("data/evil-attached.eml"));

  const msgc = await open_message_from_file(file);
  const aboutMessage = get_about_message(msgc);

  // Make sure the root message shows the phishing bar.
  await wait_for_notification_to_show(aboutMessage, kBoxId, kNotificationValue);

  // Open the attached message.
  const newWindowPromise = promise_new_window("mail:messageWindow");
  aboutMessage.document
    .getElementById("attachmentList")
    .getItemAtIndex(0)
    .attachment.open();
  const msgc2 = await newWindowPromise;
  await wait_for_message_display_completion(msgc2, true);

  // Now make sure the attached message shows the phishing bar.
  await wait_for_notification_to_show(
    get_about_message(msgc2),
    kBoxId,
    kNotificationValue
  );

  await BrowserTestUtils.closeWindow(msgc2);
  await BrowserTestUtils.closeWindow(msgc);
}).skip(); // TODO: fix broken feature. Disabled in bug 1787094

/**
 * Test that when viewing a message with an auto-linked ip address, we don't
 * get a warning when clicking the link.
 * We'll have http://130.128.4.1 vs. http://130.128.4.1/
 */
add_task(async function test_no_phishing_warning_for_ip_sameish_text() {
  await be_in_folder(folder);
  await select_click_row(-3); // Mail with Public IP address.
  click_link_if_available();
  assert_notification_displayed(
    get_about_message(),
    kBoxId,
    kNotificationValue,
    false
  ); // not shown
});

/**
 * Test that when viewing a message with a link whose base domain matches but
 * has a different subdomain (e.g. http://subdomain.google.com/ vs
 * http://google.com/), we don't get a warning if the link is pressed.
 */
add_task(async function test_no_phishing_warning_for_subdomain() {
  const aboutMessage = get_about_message();
  await be_in_folder(folder);
  await select_click_row(-4);
  click_link_if_available();
  assert_notification_displayed(
    aboutMessage,
    kBoxId,
    kNotificationValue,
    false
  ); // not shown

  await select_click_row(-5);
  click_link_if_available();
  assert_notification_displayed(
    aboutMessage,
    kBoxId,
    kNotificationValue,
    false
  ); // not shown
});

/**
 * Test that when clicking a link where the text and/or href
 * has no TLD, we still warn as appropriate.
 */
add_task(async function test_phishing_warning_for_local_domain() {
  await be_in_folder(folder);
  await select_click_row(-6);

  const dialogPromise = BrowserTestUtils.promiseAlertDialog("cancel");
  click_link_if_available();
  await dialogPromise;
});

/**
 * Test that when clicking a link to an IP, and the text is not quite the same
 * but the hostname (IP) is still the same - should not pop up any dialog.
 */
add_task(async function test_phishing_warning_for_non_local_IP() {
  await be_in_folder(folder);
  await select_click_row(-8);

  click_link_if_available();
  await new Promise(resolve => setTimeout(resolve));
  // A modal would be shown if not working correctly.
});

/**
 * Test that we warn about emails which contain <form>s with action attributes.
 */
add_task(async function test_phishing_warning_for_action_form() {
  await be_in_folder(folder);
  await select_click_row(-7);
  assert_notification_displayed(
    get_about_message(),
    kBoxId,
    kNotificationValue,
    true
  ); // shown

  Assert.report(
    false,
    undefined,
    undefined,
    "Test ran to completion successfully"
  );
});

registerCleanupFunction(async function teardown() {
  await be_in_folder(inboxFolder);
  folder.deleteSelf(null);
});
