/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Tests corpus management functions using nsIMsgCorpus

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var msgCorpus = MailServices.junk.QueryInterface(Ci.nsIMsgCorpus);

// tokens found in the test corpus file. trait 1001 was trained with
// 2 messages, and trait 1003 with 1.

var tokenData = [
  // [traitid, count, token]
  [1001, 0, "iDoNotExist"],
  [1001, 1, "linecount"],
  [1001, 2, "envelope-to:kenttest@caspia.com"],
  [1003, 0, "iAlsoDoNotExist"],
  [1003, 0, "isjunk"], // in 1001 but not 1003
  [1003, 1, "linecount"],
  [1003, 1, "subject:test"],
  [1003, 1, "envelope-to:kenttest@caspia.com"],
];

// list of tests

var gTests = [
  // train two different combinations of messages
  function checkLoadOnce() {
    const fileName = "msgCorpus.dat";
    const file = do_get_file("resources/" + fileName);
    msgCorpus.updateData(file, true);

    // check message counts
    const messageCount = {};
    msgCorpus.corpusCounts(1001, messageCount);
    Assert.equal(2, messageCount.value);
    msgCorpus.corpusCounts(1003, messageCount);
    Assert.equal(1, messageCount.value);

    for (let i = 0; i < tokenData.length; i++) {
      const id = tokenData[i][0];
      const count = tokenData[i][1];
      const word = tokenData[i][2];
      Assert.equal(count, msgCorpus.getTokenCount(word, id));
    }
  },
  function checkLoadTwice() {
    const fileName = "msgCorpus.dat";
    const file = do_get_file("resources/" + fileName);
    msgCorpus.updateData(file, true);

    // check message counts
    const messageCount = {};
    msgCorpus.corpusCounts(1001, messageCount);
    Assert.equal(4, messageCount.value);
    msgCorpus.corpusCounts(1003, messageCount);
    Assert.equal(2, messageCount.value);

    for (let i = 0; i < tokenData.length; i++) {
      const id = tokenData[i][0];
      const count = 2 * tokenData[i][1];
      const word = tokenData[i][2];
      Assert.equal(count, msgCorpus.getTokenCount(word, id));
    }
  },
  // remap the ids in the file to different local ids
  function loadWithRemap() {
    const fileName = "msgCorpus.dat";
    const file = do_get_file("resources/" + fileName);
    msgCorpus.updateData(file, true, [1001, 1003], [1, 3]);

    for (let i = 0; i < tokenData.length; i++) {
      const id = tokenData[i][0] - 1000;
      const count = tokenData[i][1];
      const word = tokenData[i][2];
      Assert.equal(count, msgCorpus.getTokenCount(word, id));
    }
  },
  // test removing data
  function checkRemove() {
    const fileName = "msgCorpus.dat";
    const file = do_get_file("resources/" + fileName);
    msgCorpus.updateData(file, false);

    // check message counts
    const messageCount = {};
    msgCorpus.corpusCounts(1001, messageCount);
    Assert.equal(2, messageCount.value);
    msgCorpus.corpusCounts(1003, messageCount);
    Assert.equal(1, messageCount.value);

    for (let i = 0; i < tokenData.length; i++) {
      const id = tokenData[i][0];
      const count = tokenData[i][1];
      const word = tokenData[i][2];
      Assert.equal(count, msgCorpus.getTokenCount(word, id));
    }
  },
  // test clearing a trait
  function checkClear() {
    const messageCountObject = {};
    /*
    msgCorpus.corpusCounts(1001, messageCountObject);
    let v1001 = messageCountObject.value;
    msgCorpus.corpusCounts(1003, messageCountObject);
    let v1003 = messageCountObject.value;
    dump("pre-clear value " + v1001 + " " + v1003 + "\n");
    /**/
    msgCorpus.clearTrait(1001);
    // check that the message count is zero
    msgCorpus.corpusCounts(1001, messageCountObject);
    Assert.equal(0, messageCountObject.value);
    // but the other trait should still have counts
    msgCorpus.corpusCounts(1003, messageCountObject);
    Assert.equal(1, messageCountObject.value);
    // check that token count was cleared
    for (let i = 0; i < tokenData.length; i++) {
      const id = tokenData[i][0];
      const count = tokenData[i][1];
      const word = tokenData[i][2];
      Assert.equal(id == 1001 ? 0 : count, msgCorpus.getTokenCount(word, id));
    }
  },
];

// main test
function run_test() {
  do_test_pending();
  // @see https://github.com/eslint/eslint/issues/17807
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (!gTests.length) {
      // Do we have more commands?
      // no, all done
      do_test_finished();
      return;
    }

    const test = gTests.shift();
    test();
  }
}
