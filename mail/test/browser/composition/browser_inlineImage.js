/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test sending message with inline image.
 */

var { get_msg_source, open_compose_new_mail, setup_msg_contents } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/ComposeHelpers.sys.mjs"
  );
var {
  be_in_folder,
  get_special_folder,
  get_about_message,
  press_delete,
  select_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);

var gOutboxFolder;

function typedArrayToString(buffer) {
  var string = "";
  for (let i = 0; i < buffer.length; i += 100) {
    string += String.fromCharCode.apply(undefined, buffer.subarray(i, i + 100));
  }
  return string;
}

function putHTMLOnClipboard(html) {
  const trans = Cc["@mozilla.org/widget/transferable;1"].createInstance(
    Ci.nsITransferable
  );

  // Register supported data flavors
  trans.init(null);
  trans.addDataFlavor("text/html");

  const wapper = Cc["@mozilla.org/supports-string;1"].createInstance(
    Ci.nsISupportsString
  );
  wapper.data = html;
  trans.setTransferData("text/html", wapper);

  Services.clipboard.setData(trans, null, Ci.nsIClipboard.kGlobalClipboard);
}

add_setup(async function () {
  gOutboxFolder = await get_special_folder(Ci.nsMsgFolderFlags.Queue);
});

/**
 * Tests that sending message with inline image works, and we pick a file name
 * for data uri if needed.
 */
add_task(async function test_send_inline_image() {
  const cwc = await open_compose_new_mail();
  await setup_msg_contents(
    cwc,
    "someone@example.com",
    "Test sending inline image",
    "The image doesn't display because we changed the data URI\n"
  );

  const fileBuf = await IOUtils.read(getTestFilePath("data/nest.png"));
  const fileContent = btoa(typedArrayToString(fileBuf));
  const dataURI = `data:image/png;base64,${fileContent}`;

  putHTMLOnClipboard(`<img id="inline-img" src="${dataURI}">`);
  cwc.document.getElementById("messageEditor").focus();
  // Ctrl+V = Paste
  EventUtils.synthesizeKey("v", { shiftKey: false, accelKey: true }, cwc);

  const closePromise = BrowserTestUtils.domWindowClosed(cwc);
  cwc.goDoCommand("cmd_sendLater");
  await closePromise;
  await SimpleTest.promiseFocus(window);

  await be_in_folder(gOutboxFolder);
  const msgLoaded = BrowserTestUtils.waitForEvent(
    get_about_message(),
    "MsgLoaded"
  );
  const outMsg = await select_click_row(0);
  await msgLoaded;
  const outMsgContent = await get_msg_source(outMsg);

  ok(
    outMsgContent.includes('id="inline-img" src="cid:'),
    "inline-img should be cid after send"
  );
  ok(
    /Content-Type: image\/png;\s* name="\w{16}.png"/.test(outMsgContent),
    `file name should have 16 characters: ${outMsgContent}`
  );

  await press_delete(); // Delete the msg from Outbox.
});
