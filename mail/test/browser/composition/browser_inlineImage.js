/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test sending message with inline image.
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
var { wait_for_notification_to_show } = ChromeUtils.import(
  "resource://testing-common/mozmill/NotificationBoxHelpers.jsm"
);
var { plan_for_window_close, wait_for_window_close } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var gOutboxFolder = get_special_folder(Ci.nsMsgFolderFlags.Queue);

var kBoxId = "compose-notification-bottom";
var kNotificationId = "blockedContent";

function typedArrayToString(buffer) {
  var string = "";
  for (let i = 0; i < buffer.length; i += 100) {
    string += String.fromCharCode.apply(undefined, buffer.subarray(i, i + 100));
  }
  return string;
}

function putHTMLOnClipboard(html) {
  let trans = Cc["@mozilla.org/widget/transferable;1"].createInstance(
    Ci.nsITransferable
  );

  // Register supported data flavors
  trans.init(null);
  trans.addDataFlavor("text/html");

  let wapper = Cc["@mozilla.org/supports-string;1"].createInstance(
    Ci.nsISupportsString
  );
  wapper.data = html;
  trans.setTransferData("text/html", wapper);

  Services.clipboard.setData(trans, null, Ci.nsIClipboard.kGlobalClipboard);
}

/**
 * Tests that sending message with inline image works, and we pick a file name
 * for data uri if needed.
 */
add_task(async function test_send_inline_image() {
  let cwc = open_compose_new_mail();
  setup_msg_contents(
    cwc,
    "someone@example.com",
    "Test sending inline image",
    "The image doesn't display because we changed the data URI\n"
  );

  let fileBuf = await IOUtils.read(getTestFilePath("data/nest.png"));
  let fileContent = btoa(typedArrayToString(fileBuf));
  let dataURI = `data:image/png;base64,${fileContent}`;

  putHTMLOnClipboard(`<img id="inline-img" src="${dataURI}">`);
  cwc.e("content-frame").focus();
  // Ctrl+V = Paste
  EventUtils.synthesizeKey(
    "v",
    { shiftKey: false, accelKey: true },
    cwc.window
  );

  plan_for_window_close(cwc);
  cwc.window.goDoCommand("cmd_sendLater");
  wait_for_window_close();

  be_in_folder(gOutboxFolder);
  let msgLoaded = BrowserTestUtils.waitForEvent(window, "MsgLoaded");
  let outMsg = select_click_row(0);
  await msgLoaded;
  let outMsgContent = get_msg_source(outMsg);

  ok(
    outMsgContent.includes('id="inline-img" src="cid:'),
    "inline-img should be cid after send"
  );
  ok(
    /Content-Type: image\/png;\s* name="\w{16}.png"/.test(outMsgContent),
    "file name should have 16 characters"
  );

  press_delete(); // Delete the msg from Outbox.
});
