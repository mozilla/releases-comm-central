/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// tests propertyEnumerator in nsIMsgDBHdr;

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var gHdr;

function run_test() {
  localAccountUtils.loadLocalMailAccount();
  // Get a message into the local filestore.
  // Function continue_test() continues the testing after the copy.
  var bugmail1 = do_get_file("../../../../data/bugmail1");
  do_test_pending();
  MailServices.copy.CopyFileMessage(
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

var copyListener = {
  OnStartCopy() {},
  OnProgress(aProgress, aProgressMax) {},
  SetMessageKey(aKey) {
    gHdr = localAccountUtils.inboxFolder.GetMessageHeader(aKey);
  },
  SetMessageId(aMessageId) {},
  OnStopCopy(aStatus) {
    continue_test();
  },
};

function continue_test() {
  // test some of the default properties
  var enumerator = gHdr.propertyEnumerator;
  var properties = [];
  while (enumerator.hasMore()) {
    var property = enumerator.getNext();
    // dump("\nProperty is " + property);
    properties.push(property);
  }
  Assert.ok(properties.includes("flags"));
  Assert.ok(properties.includes("size"));
  // this will be added in the next section, but does not exist yet
  Assert.ok(!properties.includes("iamnew"));

  // add a new property, and make sure that it appears
  gHdr.setStringProperty("iamnew", "somevalue");

  enumerator = gHdr.propertyEnumerator;
  properties = [];
  while (enumerator.hasMore()) {
    property = enumerator.getNext();
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
