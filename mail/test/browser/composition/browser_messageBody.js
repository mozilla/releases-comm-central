/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests related to message body.
 */

var {
  get_msg_source,
  open_compose_new_mail,
  setup_msg_contents,
} = ChromeUtils.import("resource://testing-common/mozmill/ComposeHelpers.jsm");
var {
  be_in_folder,
  get_special_folder,
  press_delete,
  select_click_row,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { plan_for_window_close, wait_for_window_close } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var gOutboxFolder = get_special_folder(Ci.nsMsgFolderFlags.Queue);

/**
 * Tests that sending link with invalid data uri works.
 */
add_task(async function test_invalid_data_uri() {
  let cwc = open_compose_new_mail();
  setup_msg_contents(
    cwc,
    "someone@example.com",
    "Test sending link with invalid data uri",
    ""
  );

  cwc.window
    .GetCurrentEditor()
    .insertHTML("<a href=data:1>invalid data uri</a>");
  plan_for_window_close(cwc);
  cwc.window.goDoCommand("cmd_sendLater");
  wait_for_window_close();

  be_in_folder(gOutboxFolder);
  let outMsg = select_click_row(0);
  let outMsgContent = get_msg_source(outMsg);

  ok(
    outMsgContent.includes("invalid data uri"),
    "message containing invalid data uri should be sent"
  );

  press_delete(); // Delete the msg from Outbox.
});
