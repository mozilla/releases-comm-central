/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test that cycling through the focus of the 3pane's panes works correctly.
 */

"use strict";

var {
  add_attachments,
  close_compose_window,
  open_compose_new_mail,
} = ChromeUtils.import("resource://testing-common/mozmill/ComposeHelpers.jsm");
var { mc } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

/**
 * Check that it's possible to cycle through the compose window's important
 * elements forward and backward.
 *
 * @param controller the compose window controller
 * @param attachmentsExpanded true if the attachment pane is expanded
 * @param ctrlTab true if we should use Ctrl+Tab to cycle, false if we should
 *                use F6
 */
function check_element_cycling(controller, attachmentsExpanded, ctrlTab) {
  // Make sure the accessibility tabfocus is set to 7 to enable normal Tab
  // focus on non-input field elements. This is necessary only for macOS as
  // the default value is 2 instead of the default 7 used on Windows and Linux.
  Services.prefs.setIntPref("accessibility.tabfocus", 7);

  let addressingElement = controller.e("toAddrInput");
  let subjectElement = controller.e("msgSubject");
  let attachmentElement = controller.e("attachmentBucket");
  let editorElement = controller.e("content-frame");
  let identityElement = controller.e("msgIdentity");
  let extraRecipientsLabel = controller.e("extraRecipientsLabel");
  let bccLabel = controller.e("addr_bcc");
  let ccLabel = controller.e("addr_cc");

  let key = ctrlTab ? "VK_TAB" : "VK_F6";

  // We start on the addressing widget and go from there.

  // From To to Subject.
  EventUtils.synthesizeKey(key, { ctrlKey: ctrlTab }, controller.window);
  Assert.equal(subjectElement, controller.window.WhichElementHasFocus());

  // From Subject to Message Body.
  EventUtils.synthesizeKey(key, { ctrlKey: ctrlTab }, controller.window);
  Assert.equal(editorElement, controller.window.WhichElementHasFocus());

  // From Message Body to Attachment bucket if visible.
  if (attachmentsExpanded) {
    EventUtils.synthesizeKey(key, { ctrlKey: ctrlTab }, controller.window);
    Assert.equal(attachmentElement, controller.window.WhichElementHasFocus());
  }

  // From Message Body (or Attachment bucket) to From.
  EventUtils.synthesizeKey(key, { ctrlKey: ctrlTab }, controller.window);
  Assert.equal(identityElement, controller.window.WhichElementHasFocus());

  // From From to the first available Addressing field.
  EventUtils.synthesizeKey(key, { ctrlKey: ctrlTab }, controller.window);
  Assert.equal(addressingElement, controller.window.WhichElementHasFocus());

  EventUtils.synthesizeKey(
    key,
    { ctrlKey: ctrlTab, shiftKey: true },
    controller.window
  );

  // Handle possible interaction with the Extra Recipients labels.
  if (ctrlTab) {
    Assert.equal(
      extraRecipientsLabel,
      controller.window.WhichElementHasFocus()
    );

    // From Extra Recipients to Bcc.
    EventUtils.synthesizeKey(key, { shiftKey: true }, controller.window);
    Assert.equal(bccLabel, controller.window.WhichElementHasFocus());

    // From Bcc to Cc.
    EventUtils.synthesizeKey(key, { shiftKey: true }, controller.window);
    Assert.equal(ccLabel, controller.window.WhichElementHasFocus());

    EventUtils.synthesizeKey(key, { shiftKey: true }, controller.window);
  }

  // From a visible Addressing field (or extra recipient label) to From.
  Assert.equal(identityElement, controller.window.WhichElementHasFocus());

  // From From to Attachment bucket if visible.
  if (attachmentsExpanded) {
    EventUtils.synthesizeKey(
      key,
      { ctrlKey: ctrlTab, shiftKey: true },
      controller.window
    );
    Assert.equal(attachmentElement, controller.window.WhichElementHasFocus());
  }

  // From From (or Attachment bucket) to Message Body.
  EventUtils.synthesizeKey(
    key,
    { ctrlKey: ctrlTab, shiftKey: true },
    controller.window
  );
  Assert.equal(editorElement, controller.window.WhichElementHasFocus());

  // From Message Body to Subject.
  EventUtils.synthesizeKey(
    key,
    { ctrlKey: ctrlTab, shiftKey: true },
    controller.window
  );
  Assert.equal(subjectElement, controller.window.WhichElementHasFocus());

  // From Subject to the first available Addressing field.
  EventUtils.synthesizeKey(
    key,
    { ctrlKey: ctrlTab, shiftKey: true },
    controller.window
  );
  Assert.equal(addressingElement, controller.window.WhichElementHasFocus());

  // Reset the preferences.
  Services.prefs.clearUserPref("accessibility.tabfocus");
}

add_task(function test_f6_no_attachment() {
  let cwc = open_compose_new_mail();
  check_element_cycling(cwc, false, false);
  close_compose_window(cwc);
});

add_task(function test_f6_attachment() {
  let cwc = open_compose_new_mail();
  add_attachments(cwc, "http://www.mozilla.org/");
  // Move the initial focus back to the To input.
  cwc.e("toAddrInput").focus();
  check_element_cycling(cwc, true, false);
  close_compose_window(cwc);
});

add_task(function test_ctrl_tab_no_attachment() {
  let cwc = open_compose_new_mail();
  check_element_cycling(cwc, false, true);
  close_compose_window(cwc);
});

add_task(function test_ctrl_tab_attachment() {
  let cwc = open_compose_new_mail();
  add_attachments(cwc, "http://www.mozilla.org/");
  // Move the initial focus back to the To input.
  cwc.e("toAddrInput").focus();
  check_element_cycling(cwc, true, true);
  close_compose_window(cwc);
});
