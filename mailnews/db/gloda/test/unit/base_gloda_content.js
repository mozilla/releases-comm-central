/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Tests the operation of the GlodaContent (in GlodaContent.sys.mjs) and its exposure
 * via Gloda.getMessageContent.  This may also be implicitly tested by indexing
 * and fulltext query tests (on messages), but the buck stops here for the
 * content stuff.
 *
 * Currently, we just test quoting removal and that the content turns out right.
 * We do not actually verify that the quoted blocks are correct (aka we might
 * screw up eating the greater-than signs).  (We have no known consumers who
 * care about the quoted blocks.)
 */

var { Gloda } = ChromeUtils.importESModule(
  "resource:///modules/gloda/GlodaPublic.sys.mjs"
);
var { assertExpectedMessagesIndexed, waitForGlodaIndexer } =
  ChromeUtils.importESModule(
    "resource://testing-common/gloda/GlodaTestHelper.sys.mjs"
  );
// We need to be able to get at GlodaFundAttr to check the number of whittler
//   invocations.
var { GlodaFundAttr } = ChromeUtils.importESModule(
  "resource:///modules/gloda/GlodaFundAttr.sys.mjs"
);
var { MsgHdrToMimeMessage } = ChromeUtils.importESModule(
  "resource:///modules/gloda/MimeMessage.sys.mjs"
);
var { SyntheticMessageSet } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

var msgGen;
var messageInjection;

/* ===== Data ===== */
var messageInfos = [
  {
    name: "no quoting",
    bode: [
      [true, "I like hats"],
      [true, "yes I do!"],
      [true, "I like hats!"],
      [true, "How bout you?"],
    ],
  },
  {
    name: "no quoting, whitespace removal",
    bode: [
      [true, "robots are nice..."],
      [true, ""],
      [true, "except for the bloodlust"],
    ],
  },
  {
    name: "bottom posting",
    bode: [
      [false, "John wrote:"],
      [false, "> I like hats"],
      [false, ">"], // This quoted blank line is significant! no lose!
      [false, "> yes I do!"],
      [false, ""],
      [true, "I do enjoy them as well."],
      [true, ""],
      [true, "Bob"],
    ],
  },
  {
    name: "top posting",
    bode: [
      [true, "Hats are where it's at."],
      [false, ""],
      [false, "John wrote:"],
      [false, "> I like hats"],
      [false, "> yes I do!"],
    ],
  },
  {
    name: "top posting with trailing whitespace, no intro",
    bode: [
      [true, "Hats are where it's at."],
      [false, ""],
      [false, "> I like hats"],
      [false, "> yes I do!"],
      [false, ""],
      [false, ""],
    ],
  },
  {
    name: "interspersed quoting",
    bode: [
      [false, "John wrote:"],
      [false, "> I like hats"],
      [true, "I concur with this point."],
      [false, "> yes I do!"],
      [false, ""],
      [true, "this point also resonates with me."],
      [false, ""],
      [false, "> I like hats!"],
      [false, "> How bout you?"],
      [false, ""],
      [true, "Verily!"],
    ],
  },
  {
    name: "german style",
    bode: [
      [false, "Mark Banner <bugzilla@standard8.plus.invalid> wrote:"],
      [false, "\xa0"],
      [
        false,
        "> We haven't nailed anything down in detail yet, depending on how we are ",
      ],
      [
        true,
        "That sounds great and would definitely be appreciated by localizers.",
      ],
      [false, ""],
    ],
  },
  {
    name: "tortuous interference",
    bode: [
      [false, "> wrote"],
      [true, "running all the time"],
      [false, "> wrote"],
      [true, "cheese"],
      [false, ""],
    ],
  },
];

function setup_create_message(info) {
  info.body = { body: info.bode.map(tupe => tupe[1]).join("\r\n") };
  info.expected = info.bode
    .filter(tupe => tupe[0])
    .map(tupe => tupe[1])
    .join("\n");

  info._synMsg = msgGen.makeMessage(info);
}

/**
 * To save ourselves some lookup trouble, pretend to be a verification
 *  function so we get easy access to the gloda translations of the messages so
 *  we can cram this in various places.
 */
function glodaInfoStasher(aSynthMessage, aGlodaMessage) {
  // Let's not assume an ordering.
  for (let iMsg = 0; iMsg < messageInfos.length; iMsg++) {
    if (messageInfos[iMsg]._synMsg == aSynthMessage) {
      messageInfos[iMsg]._glodaMsg = aGlodaMessage;
    }
  }
}

/**
 * Actually inject all the messages we created above.
 */
async function setup_inject_messages() {
  // Create the messages from messageInfo.
  messageInfos.forEach(info => {
    setup_create_message(info);
  });
  const msgSet = new SyntheticMessageSet(
    messageInfos.map(info => info._synMsg)
  );
  const folder = await messageInjection.makeEmptyFolder();
  await messageInjection.addSetsToFolders([folder], [msgSet]);
  await waitForGlodaIndexer();
  Assert.ok(
    ...assertExpectedMessagesIndexed([msgSet], { verifier: glodaInfoStasher })
  );
}

function test_stream_message(info) {
  // Currying the function for simpler usage with `base_gloda_content_tests`.
  return () => {
    const msgHdr = info._glodaMsg.folderMessage;

    MsgHdrToMimeMessage(msgHdr, null, function (aMsgHdr, aMimeMsg) {
      verify_message_content(
        info,
        info._synMsg,
        info._glodaMsg,
        aMsgHdr,
        aMimeMsg
      );
    });
  };
}

// Instrument GlodaFundAttr so we can check the count.
var originalWhittler = GlodaFundAttr.contentWhittle;
var whittleCount = 0;
GlodaFundAttr.contentWhittle = function (...aArgs) {
  whittleCount++;
  return originalWhittler.apply(this, aArgs);
};

function verify_message_content(aInfo, aSynMsg, aGlodaMsg, aMsgHdr, aMimeMsg) {
  if (aMimeMsg == null) {
    throw new Error(
      "Message streaming should work; check test_mime_emitter.js first"
    );
  }

  whittleCount = 0;
  const content = Gloda.getMessageContent(aGlodaMsg, aMimeMsg);
  if (whittleCount != 1) {
    throw new Error("Whittle count is " + whittleCount + " but should be 1!");
  }

  Assert.equal(content.getContentString(), aInfo.expected, "Message streamed");
}

function test_sanity_test_environment() {
  Assert.ok(msgGen, "Sanity that msgGen is set.");
  Assert.ok(messageInjection, "Sanity that messageInjection is set.");
}

var base_gloda_content_tests = [
  test_sanity_test_environment,
  setup_inject_messages,
  ...messageInfos.map(e => {
    return test_stream_message(e);
  }),
];
