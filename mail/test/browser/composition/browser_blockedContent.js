/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that we do the right thing wrt. blocked resources during composition.
 */

"use strict";

var { get_msg_source, open_compose_new_mail, setup_msg_contents } =
  ChromeUtils.importESModule(
    "resource://testing-common/mozmill/ComposeHelpers.sys.mjs"
  );
var { be_in_folder, get_special_folder, press_delete, select_click_row } =
  ChromeUtils.importESModule(
    "resource://testing-common/mozmill/FolderDisplayHelpers.sys.mjs"
  );
var { wait_for_notification_to_show } = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/NotificationBoxHelpers.sys.mjs"
);

var gOutboxFolder;

var kBoxId = "compose-notification-bottom";
var kNotificationId = "blockedContent";

add_setup(async function () {
  gOutboxFolder = await get_special_folder(Ci.nsMsgFolderFlags.Queue);
});

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

/**
 * Test that accessing file: URLs will block when appropriate, and load
 * the content when appropriate.
 */
add_task(async function test_paste_file_urls() {
  const cwc = await open_compose_new_mail();
  await setup_msg_contents(
    cwc,
    "someone@example.com",
    "testing html paste",
    "See these images- one broken one not\n"
  );

  const fname = "data/tb-logo.png";
  const file = new FileUtils.File(getTestFilePath(fname));
  const fileHandler = Services.io
    .getProtocolHandler("file")
    .QueryInterface(Ci.nsIFileProtocolHandler);

  const dest = PathUtils.join(
    Services.dirsvc.get("TmpD", Ci.nsIFile).path,
    file.leafName
  );
  let tmpFile;
  let tmpFileURL;
  IOUtils.remove(dest, { ignoreAbsent: true })
    .then(function () {
      return IOUtils.copy(file.path, dest);
    })
    .then(function () {
      return IOUtils.setModificationTime(dest);
    })
    .then(function () {
      tmpFile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
      tmpFile.initWithPath(dest);
      Assert.ok(tmpFile.exists(), "tmpFile's not there at " + dest);

      tmpFileURL = fileHandler.getURLSpecFromActualFile(tmpFile);
      putHTMLOnClipboard(
        "<img id='bad-img' src='file://foo/non-existent' alt='bad' /> and " +
          "<img id='tmp-img' src='" +
          tmpFileURL +
          "' alt='tmp' />"
      );

      cwc.document.getElementById("messageEditor").focus();
      // Ctrl+V = Paste
      EventUtils.synthesizeKey("v", { shiftKey: false, accelKey: true }, cwc);
    })
    .catch(function (err) {
      throw new Error("Setting up img file FAILED: " + err);
    });

  // Now wait for the paste, and for the file: based image to get converted
  // to data:.
  await TestUtils.waitForCondition(function () {
    const img = cwc.document
      .getElementById("messageEditor")
      .contentDocument.getElementById("tmp-img");
    return img && img.naturalHeight == 84 && img.src.startsWith("data:");
  }, "Timeout waiting for pasted tmp image to be loaded ok");

  // For the non-existent (non-accessible!) image we should get a notification.
  await wait_for_notification_to_show(cwc, kBoxId, kNotificationId);

  const closePromise = BrowserTestUtils.domWindowClosed(cwc);
  cwc.goDoCommand("cmd_sendLater");
  await closePromise;

  await be_in_folder(gOutboxFolder);
  const outMsg = await select_click_row(0);
  const outMsgContent = await get_msg_source(outMsg);

  Assert.ok(
    outMsgContent.includes("file://foo/non-existent"),
    "non-existent file not in content=" + outMsgContent
  );

  Assert.ok(
    !outMsgContent.includes(tmpFileURL),
    "tmp file url still in content=" + outMsgContent
  );

  Assert.ok(
    outMsgContent.includes('id="tmp-img" src="cid:'),
    "tmp-img should be cid after send; content=" + outMsgContent
  );

  await press_delete(); // Delete the msg from Outbox.
});
