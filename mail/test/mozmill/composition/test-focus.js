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
var { assert_equals, mc } = ChromeUtils.import(
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
  let addressingElement = controller.e("toAddrInput");
  let subjectElement = controller.e("msgSubject");
  let attachmentElement = controller.e("attachmentBucket");
  let contentElement = controller.window.content;
  let identityElement = controller.e("msgIdentity");

  let key = ctrlTab ? "VK_TAB" : "VK_F6";

  // We start on the addressing widget and go from there.

  controller.keypress(null, key, { ctrlKey: ctrlTab });
  assert_equals(subjectElement, controller.window.WhichElementHasFocus());
  if (attachmentsExpanded) {
    controller.keypress(null, key, { ctrlKey: ctrlTab });
    assert_equals(attachmentElement, controller.window.WhichElementHasFocus());
  }
  controller.keypress(null, key, { ctrlKey: ctrlTab });
  assert_equals(contentElement, controller.window.WhichElementHasFocus());
  controller.keypress(null, key, { ctrlKey: ctrlTab });
  assert_equals(identityElement, controller.window.WhichElementHasFocus());
  controller.keypress(null, key, { ctrlKey: ctrlTab });
  mc.sleep(0); // Focusing the addressing element happens in a timeout...
  assert_equals(addressingElement, controller.window.WhichElementHasFocus());

  controller.keypress(null, key, { ctrlKey: ctrlTab, shiftKey: true });
  assert_equals(identityElement, controller.window.WhichElementHasFocus());
  controller.keypress(null, key, { ctrlKey: ctrlTab, shiftKey: true });
  assert_equals(contentElement, controller.window.WhichElementHasFocus());
  if (attachmentsExpanded) {
    controller.keypress(null, key, { ctrlKey: ctrlTab, shiftKey: true });
    assert_equals(attachmentElement, controller.window.WhichElementHasFocus());
  }
  controller.keypress(null, key, { ctrlKey: ctrlTab, shiftKey: true });
  assert_equals(subjectElement, controller.window.WhichElementHasFocus());
  controller.keypress(null, key, { ctrlKey: ctrlTab, shiftKey: true });
  mc.sleep(0); // Focusing the addressing element happens in a timeout...
  assert_equals(addressingElement, controller.window.WhichElementHasFocus());
}

function test_f6_no_attachment() {
  let cwc = open_compose_new_mail();
  check_element_cycling(cwc, false, false);
  close_compose_window(cwc);
}

function test_f6_attachment() {
  let cwc = open_compose_new_mail();
  add_attachments(cwc, "http://www.mozilla.org/");
  check_element_cycling(cwc, true, false);
  close_compose_window(cwc);
}

function test_ctrl_tab_no_attachment() {
  let cwc = open_compose_new_mail();
  check_element_cycling(cwc, false, true);
  close_compose_window(cwc);
}

function test_ctrl_tab_attachment() {
  let cwc = open_compose_new_mail();
  add_attachments(cwc, "http://www.mozilla.org/");
  check_element_cycling(cwc, true, true);
  close_compose_window(cwc);
}
