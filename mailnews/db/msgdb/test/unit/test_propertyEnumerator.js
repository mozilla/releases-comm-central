/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// tests properties in nsIMsgDBHdr;

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var gHdr;

function run_test() {
  localAccountUtils.loadLocalMailAccount();
  // Get a message into the local filestore.
  // Function continue_test() continues the testing after the copy.
  var bugmail1 = do_get_file("../../../../data/bugmail1");
  do_test_pending();
  MailServices.copy.copyFileMessage(
    bugmail1,
    localAccountUtils.inboxFolder,
    null,
    false,
    0,
    "",
    copyListener,
    null
  );
}

/** @implements {nsIMsgCopyServiceListener} */
var copyListener = {
  onStartCopy() {},
  onProgress() {},
  setMessageKey(aKey) {
    gHdr = localAccountUtils.inboxFolder.GetMessageHeader(aKey);
  },
  getMessageId() {
    return null;
  },
  onStopCopy() {
    continue_test();
  },
};

function continue_test() {
  // test some of the default properties
  let properties = gHdr.properties;
  Assert.ok(properties.includes("flags"));
  Assert.ok(properties.includes("size"));
  // this will be added in the next section, but does not exist yet
  Assert.ok(!properties.includes("iamnew"));

  // add a new property, and make sure that it appears
  gHdr.setStringProperty("iamnew", "somevalue");

  properties = [];
  for (const property of gHdr.properties) {
    // dump("\nProperty 2 is " + property);
    properties.push(property);
  }
  Assert.ok(properties.includes("flags"));
  Assert.ok(properties.includes("size"));
  Assert.ok(properties.includes("iamnew"));
  Assert.ok(!properties.includes("idonotexist"));

  gHdr = null;
  do_test_finished();
}
