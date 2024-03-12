/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test noun_mimetype.  Exists because I just changed its implementation and I'm
 * afraid I may have damaged it and it's hard to tell, so ironically a unit test
 * is the easiest solution.  (Don't you hate it when the right thing to do is
 * also the easy thing to do?)
 */

var { glodaTestHelperInitialize } = ChromeUtils.importESModule(
  "resource://testing-common/gloda/GlodaTestHelper.sys.mjs"
);
var { waitForGlodaDBFlush } = ChromeUtils.importESModule(
  "resource://testing-common/gloda/GlodaTestHelperFunctions.sys.mjs"
);
var { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
var { MessageInjection } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageInjection.sys.mjs"
);
var { MimeTypeNoun } = ChromeUtils.importESModule(
  "resource:///modules/gloda/NounMimetype.sys.mjs"
);

var passResults = [];
var curPassResults;

add_setup(async function () {
  const msgGen = new MessageGenerator();
  const messageInjection = new MessageInjection({ mode: "local" }, msgGen);
  glodaTestHelperInitialize(messageInjection);
});

add_task(async function test_new_pass_first_time() {
  await new_pass();
});

add_task(function test_basics_first_time() {
  test_basics();
});

/**
 * Do two passes of test_basics making sure that persisted values really
 *  persist.
 */
add_task(async function test_new_pass_second_time() {
  await new_pass();
});

add_task(function test_basics_second_time() {
  test_basics();
});

add_task(function verify_passes_are_the_same() {
  var firstPassResults = passResults[0];
  for (let iType = 0; iType < curPassResults.length; iType++) {
    for (let iPass = 1; iPass < passResults.length; iPass++) {
      Assert.equal(firstPassResults[iType].id, passResults[iPass][iType].id);
    }
  }
});

add_task(function test_parameters() {
  const plain = MimeTypeNoun.getMimeType("text/plain");
  Assert.equal(plain, MimeTypeNoun.getMimeType('text/plain; charset="UTF-8"'));
});

/**
 * Setup a new 'pass' by nuking the MimeTypeNoun's state if it has any.  The
 *  goal here is to verify that the database persistence is actually working,
 *  and we can only do that if we convince it to nuke its authoritative 'cache'
 *  and grab a new copy.
 */
async function new_pass() {
  // We have to nuke if it has already happened.
  if (passResults.length) {
    MimeTypeNoun._mimeTypes = {};
    MimeTypeNoun._mimeTypesByID = {};
    MimeTypeNoun._mimeTypeHighID = {};
    MimeTypeNoun._highID = 0;
    MimeTypeNoun._init();
  }
  curPassResults = [];
  passResults.push(curPassResults);

  // The mime type does some async stuff... make sure we don't advance until
  //  it is done with said stuff.
  await waitForGlodaDBFlush();
}

function test_basics() {
  let python;
  // If this is not the first pass, check for python before other things to
  //  make sure we're not just relying on consistent logic rather than actual
  //  persistence.
  if (passResults.length) {
    python = MimeTypeNoun.getMimeType("text/x-python");
  }

  const jpeg = MimeTypeNoun.getMimeType("image/jpeg");
  curPassResults.push(jpeg);

  const png = MimeTypeNoun.getMimeType("image/png");
  curPassResults.push(png);

  const html = MimeTypeNoun.getMimeType("text/html");
  curPassResults.push(html);

  const plain = MimeTypeNoun.getMimeType("text/plain");
  curPassResults.push(plain);

  // If this is for the first time, check for python now (see above).
  if (!passResults.length) {
    python = MimeTypeNoun.getMimeType("text/x-python");
  }
  // But always add it to the results now, as we need consistent ordering
  //  since we use a list.
  curPassResults.push(python);

  // Sanity-checking the parsing.
  Assert.equal(jpeg.type, "image");
  Assert.equal(jpeg.subType, "jpeg");

  // - Make sure the numeric trickiness for the block stuff is actually doing
  //  the right thing!
  const BLOCK_SIZE = MimeTypeNoun.TYPE_BLOCK_SIZE;
  // Same blocks.
  Assert.equal(
    Math.floor(jpeg.id / BLOCK_SIZE),
    Math.floor(png.id / BLOCK_SIZE)
  );
  Assert.equal(
    Math.floor(html.id / BLOCK_SIZE),
    Math.floor(plain.id / BLOCK_SIZE)
  );
  // Different blocks.
  Assert.notEqual(
    Math.floor(jpeg.id / BLOCK_SIZE),
    Math.floor(html.id / BLOCK_SIZE)
  );
}
