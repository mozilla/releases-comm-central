/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that we do the right thing wrt. blocked resources during composition.
 */

// make mozmill-one SOLO_TEST=composition/test-blocked-content.js

var MODULE_NAME = "blocked-content";

var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = [
  "folder-display-helpers",
   "window-helpers",
   "compose-helpers",
   "notificationbox-helpers"
];

var os = {};
Cu.import("resource://mozmill/stdlib/os.js", os);
Cu.import('resource://gre/modules/Services.jsm');
Cu.import("resource:///modules/mailServices.js");
Cu.import("resource://gre/modules/osfile.jsm");

var gOutboxFolder;

var kBoxId = "attachmentNotificationBox";
var kNotificationId = "blockedContent";

function setupModule(module) {
  for (let req of MODULE_REQUIRES) {
    collector.getModule(req).installInto(module);
  }
  gOutboxFolder = get_special_folder(Ci.nsMsgFolderFlags.Queue);
}

function putHTMLOnClipboard(html) {
  let trans = Components.classes["@mozilla.org/widget/transferable;1"]
                        .createInstance(Components.interfaces.nsITransferable);

  // Register supported data flavors
  trans.init(null);
  trans.addDataFlavor("text/html");

  let wapper = Components.classes["@mozilla.org/supports-string;1"]
   .createInstance(Components.interfaces.nsISupportsString);
  wapper.data = html;
  trans.setTransferData("text/html", wapper, wapper.data.length * 2);

  Services.clipboard.setData(trans, null,
    Components.interfaces.nsIClipboard.kGlobalClipboard);
}

/**
 * Test that accessing file: URLs will block when appropriate, and load
 * the content when appropriate.
 */
function test_paste_file_urls() {
  let cwc = open_compose_new_mail();
  setup_msg_contents(cwc,
                     "someone@example.com",
                     "testing html paste",
                     "See these images- one broken one not\n");

  const fname = "./tb-logo.png";
  let file = os.getFileForPath(os.abspath(fname, os.getFileForPath(__file__)));
  let fileHandler = Services.io.getProtocolHandler("file")
    .QueryInterface(Ci.nsIFileProtocolHandler);

  let dest = OS.Path.join(OS.Constants.Path.tmpDir, file.leafName);
  let tmpFile;
  let tmpFileURL;
  OS.File.remove(dest, {"ignoreAbsent": true })
  .then(function() {
    return OS.File.copy(file.path, dest);
  })
  .then(function() {
    return OS.File.setDates(dest, null, null);
  }).then(function() {
    tmpFile = os.getFileForPath(dest);
    assert_true(tmpFile.exists(), "tmpFile's not there at " + dest);

    tmpFileURL = fileHandler.getURLSpecFromFile(tmpFile);
    putHTMLOnClipboard(
      "<img id='bad-img' src='file://foo/non-existant' alt='bad' /> and " +
      "<img id='tmp-img' src='" + tmpFileURL + "' alt='tmp' />"
    );

    cwc.e("content-frame").focus();
    // Ctrl+V = Paste
    cwc.keypress(null, "v", {shiftKey: false, accelKey: true});
  }).catch(function(err) {
    throw new Error("Setting up img file FAILED: " + err);
  });

  // Now wait for the paste, and for the file: based image to get converted
  // to data:.
  cwc.waitFor(function() {
    let img = cwc.e("content-frame").contentDocument.getElementById("tmp-img");
    return img && img.naturalHeight == 84 && img.src.startsWith("data:");
  }, "Timeout waiting for pasted tmp image to be loaded ok");

  // For the non-existent (non-accessible!) image we should get a notification.
  wait_for_notification_to_show(cwc, kBoxId, kNotificationId);

  plan_for_window_close(cwc);
  cwc.window.goDoCommand("cmd_sendLater");
  wait_for_window_close();

  be_in_folder(gOutboxFolder);
  let outMsg = select_click_row(0);
  let outMsgContent = get_msg_source(outMsg, true);

  assert_true(outMsgContent.includes("file://foo/non-existant"),
    "non-existant file not in content=" + outMsgContent);

  assert_false(outMsgContent.includes(tmpFileURL),
    "tmp file url still in content=" + outMsgContent);

  assert_true(outMsgContent.includes('id="tmp-img" src="cid:'),
    "tmp-img should be cid after send; content=" + outMsgContent);

  press_delete(); // Delete the msg from Outbox.
}


function teardownModule(module) {
}
