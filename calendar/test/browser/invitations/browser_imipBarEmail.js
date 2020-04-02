/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that the IMIP bar behaves properly for eml files.
 */

var { open_message_from_file } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { close_window } = ChromeUtils.import("resource://testing-common/mozmill/WindowHelpers.jsm");

function getFileFromChromeURL(leafName) {
  let ChromeRegistry = Cc["@mozilla.org/chrome/chrome-registry;1"].getService(Ci.nsIChromeRegistry);

  let url = Services.io.newURI(getRootDirectory(gTestPath) + leafName);
  info(url.spec);
  let fileURL = ChromeRegistry.convertChromeURL(url).QueryInterface(Ci.nsIFileURL);
  return fileURL.file;
}

/**
 * Test that when opening a message containing an event, the IMIP bar shows.
 */
add_task(function test_event_from_eml() {
  let file = getFileFromChromeURL("message-containing-event.eml");

  let msgc = open_message_from_file(file);

  msgc.waitFor(() => {
    let bar = msgc.window.document.getElementById("imip-bar");
    if (!bar) {
      throw new Error("Couldn't find imip-bar in DOM.");
    }
    return bar.collapsed === false;
  }, "Timed out waiting for IMIP bar to show");

  close_window(msgc);

  Assert.ok(true, "Test ran to completion");
});
