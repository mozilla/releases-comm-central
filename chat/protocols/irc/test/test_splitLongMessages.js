/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

Components.utils.import("resource://gre/modules/Services.jsm");
var irc = {};
Services.scriptloader.loadSubScript("resource:///components/irc.js", irc);

var messages = {
  // Exactly 51 characters.
  "This is a test.": ["This is a test."],
  // Too long.
  "This is a message that is too long.":
    ["This is a", "message that is", "too long."],
  // Too short.
  "Short msg.": ["Short msg."],
  "Thismessagecan'tbecut.": ["Thismessagecan'", "tbecut."]
};

irc.GenericIRCConversation.name = "target";
irc.GenericIRCConversation._account = {
  __proto__: irc.ircAccount.prototype,
  _nickname: "sender",
  prefix: "!user@host",
  maxMessageLength: 51 // For convenience.
};

function run_test() {
  for (let message in messages) {
    let msg = {message: message};
    let generatedMsgs = irc.GenericIRCConversation.prepareForSending(msg, {});

    // The expected messages as defined above.
    let expectedMsgs = messages[message];
    // Ensure both arrays have the same length.
    do_check_eq(expectedMsgs.length, generatedMsgs.length);
    // Ensure the values in the arrays are equal.
    for (let i = 0; i < expectedMsgs.length; ++i)
      do_check_eq(generatedMsgs[i], expectedMsgs[i]);
  }
}
