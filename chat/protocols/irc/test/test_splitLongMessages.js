/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

var { GenericIRCConversation, ircAccount } = ChromeUtils.importESModule(
  "resource:///modules/ircAccount.sys.mjs"
);

var messages = {
  // Exactly 51 characters.
  "This is a test.": ["This is a test."],
  // Too long.
  "This is a message that is too long.": [
    "This is a",
    "message that is",
    "too long.",
  ],
  // Too short.
  "Short msg.": ["Short msg."],
  "Thismessagecan'tbecut.": ["Thismessagecan'", "tbecut."],
};

function run_test() {
  for (let message in messages) {
    let msg = { message };
    let generatedMsgs = GenericIRCConversation.prepareForSending.call(
      {
        __proto__: GenericIRCConversation,
        name: "target",
        _account: {
          __proto__: ircAccount.prototype,
          _nickname: "sender",
          prefix: "!user@host",
          maxMessageLength: 51, // For convenience.
        },
      },
      msg
    );

    // The expected messages as defined above.
    let expectedMsgs = messages[message];
    // Ensure the arrays are equal.
    deepEqual(generatedMsgs, expectedMsgs);
  }
}
