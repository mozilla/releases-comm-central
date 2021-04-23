/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that phishing notifications behave properly.
 */

"use strict";

var { gMockExtProtSvcReg } = ChromeUtils.import(
  "resource://testing-common/mozmill/ContentTabHelpers.jsm"
);
var {
  add_message_to_folder,
  be_in_folder,
  create_folder,
  create_message,
  inboxFolder,
  mc,
  open_message_from_file,
  select_click_row,
  wait_for_message_display_completion,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var {
  assert_notification_displayed,
  get_notification_button,
  wait_for_notification_to_show,
  wait_for_notification_to_stop,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/NotificationBoxHelpers.jsm"
);
var {
  async_plan_for_new_window,
  close_window,
  plan_for_modal_dialog,
  plan_for_new_window,
  wait_for_new_window,
} = ChromeUtils.import("resource://testing-common/mozmill/WindowHelpers.jsm");

var folder;

var kBoxId = "mail-notification-top";
var kNotificationValue = "maybeScam";

add_task(function setupModule(module) {
  gMockExtProtSvcReg.register();

  folder = create_folder("PhishingBarA");
  add_message_to_folder(
    folder,
    create_message({
      body: {
        body: '<form action="http://localhost/download-me"><input></form>.',
        contentType: "text/html",
      },
    })
  );
  add_message_to_folder(folder, create_message());
  add_message_to_folder(
    folder,
    create_message({
      body: {
        body: "check out http://130.128.4.1. and http://130.128.4.2/.",
        contentType: "text/plain",
      },
    })
  );
  add_message_to_folder(
    folder,
    create_message({
      body: {
        body:
          '<a href="http://subdomain.google.com/">http://www.google.com</a>.',
        contentType: "text/html",
      },
    })
  );
  add_message_to_folder(
    folder,
    create_message({
      body: {
        body: '<a href="http://subdomain.google.com/">http://google.com</a>.',
        contentType: "text/html",
      },
    })
  );
  add_message_to_folder(
    folder,
    create_message({
      body: {
        body: '<a href="http://evilhost">http://localhost</a>.',
        contentType: "text/html",
      },
    })
  );
  add_message_to_folder(
    folder,
    create_message({
      body: {
        body: '<form action="http://localhost/download-me"><input></form>.',
        contentType: "text/html",
      },
    })
  );
});

registerCleanupFunction(() => {
  gMockExtProtSvcReg.unregister();
});

function teardownModule() {
  gMockExtProtSvcReg.unregister();
}

/**
 * Make sure the notification shows, and goes away once the Ignore menuitem
 * is clicked.
 */
async function assert_ignore_works(aController) {
  wait_for_notification_to_show(aController, kBoxId, kNotificationValue);
  let prefButton = get_notification_button(
    aController,
    kBoxId,
    kNotificationValue,
    { popup: "phishingOptions" }
  );
  aController.click(prefButton);
  await aController.click_menus_in_sequence(aController.e("phishingOptions"), [
    { id: "phishingOptionIgnore" },
  ]);
  wait_for_notification_to_stop(aController, kBoxId, kNotificationValue);
}

/**
 * Helper function to click the first link in a message if one is available.
 */
function click_link_if_available() {
  let msgBody = mc.e("messagepane").contentDocument.body;
  if (msgBody.getElementsByTagName("a").length > 0) {
    msgBody.getElementsByTagName("a")[0].click();
  }
}

/**
 * Test that when viewing a message, choosing ignore hides the the phishing
 * notification.
 */
add_task(async function test_ignore_phishing_warning_from_message() {
  be_in_folder(folder);
  select_click_row(0);
  await assert_ignore_works(mc);

  select_click_row(1);
  // msg 1 is normal -> no phishing warning
  assert_notification_displayed(mc, kBoxId, kNotificationValue, false);
  select_click_row(0);
  // msg 0 is a potential phishing attempt, but we ignored it so that should
  // be remembered
  assert_notification_displayed(mc, kBoxId, kNotificationValue, false);
});

/**
 * Test that when viewing en eml file, choosing ignore hides the phishing
 * notification.
 */
add_task(async function test_ignore_phishing_warning_from_eml() {
  let file = new FileUtils.File(getTestFilePath("data/evil.eml"));

  let msgc = await open_message_from_file(file);
  await assert_ignore_works(msgc);
  close_window(msgc);
});

/**
 * Test that when viewing an attached eml file, the phishing notification works.
 */
add_task(async function test_ignore_phishing_warning_from_eml_attachment() {
  let file = new FileUtils.File(getTestFilePath("data/evil-attached.eml"));

  let msgc = await open_message_from_file(file);

  // Make sure the root message shows the phishing bar.
  wait_for_notification_to_show(msgc, kBoxId, kNotificationValue);

  // Open the attached message.
  let newWindowPromise = async_plan_for_new_window("mail:messageWindow");
  msgc
    .e("attachmentList")
    .getItemAtIndex(0)
    .attachment.open();
  let msgc2 = await newWindowPromise;
  wait_for_message_display_completion(msgc2, true);

  // Now make sure the attached message shows the phishing bar.
  wait_for_notification_to_show(msgc2, kBoxId, kNotificationValue);

  close_window(msgc2);
  close_window(msgc);
});

/**
 * Test that when viewing a message with an auto-linked ip address, we don't
 * get a warning when clicking the link.
 * We'll have http://130.128.4.1 vs. http://130.128.4.1/
 */
function test_no_phishing_warning_for_ip_sameish_text() {
  be_in_folder(folder);
  select_click_row(2); // Mail with Public IP address.
  click_link_if_available();
  assert_notification_displayed(mc, kBoxId, kNotificationValue, false); // not shown
}
add_task(test_no_phishing_warning_for_ip_sameish_text);

/**
 * Test that when viewing a message with a link whose base domain matches but
 * has a different subdomain (e.g. http://subdomain.google.com/ vs
 * http://google.com/), we don't get a warning if the link is pressed.
 */
function test_no_phishing_warning_for_subdomain() {
  be_in_folder(folder);
  select_click_row(3);
  click_link_if_available();
  assert_notification_displayed(mc, kBoxId, kNotificationValue, false); // not shown

  select_click_row(4);
  click_link_if_available();
  assert_notification_displayed(mc, kBoxId, kNotificationValue, false); // not shown
}
add_task(test_no_phishing_warning_for_subdomain);

/**
 * Test that when clicking a link where the text and/or href
 * has no TLD, we still warn as appropriate.
 */
function test_phishing_warning_for_local_domain() {
  be_in_folder(folder);
  select_click_row(5);

  let dialogAppeared = false;

  plan_for_modal_dialog("commonDialogWindow", function(ctrler) {
    dialogAppeared = true;
  });

  click_link_if_available();

  Assert.ok(dialogAppeared);
}
add_task(test_phishing_warning_for_local_domain);

/**
 * Test that we warn about emails which contain <form>s with action attributes.
 */
add_task(function test_phishing_warning_for_action_form() {
  be_in_folder(folder);
  select_click_row(6);
  assert_notification_displayed(mc, kBoxId, kNotificationValue, true); // shown

  Assert.report(
    false,
    undefined,
    undefined,
    "Test ran to completion successfully"
  );
});

registerCleanupFunction(function teardown() {
  be_in_folder(inboxFolder);
  folder.deleteSelf(null);
});
