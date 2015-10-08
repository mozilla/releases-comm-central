/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

Components.utils.import("resource://gre/modules/Services.jsm");
var yahoo = {};
Services.scriptloader.loadSubScript("resource:///components/yahoo.js", yahoo);

function run_test()
{
  add_test(test_cleanUsername);
  add_test(test_fixFontSize);
  run_next_test();
}

// Test the stripping of @yahoo.* domains from usernames.
function test_cleanUsername()
{
  // These are just a few of the many possible domains.
  let domains = ["yahoo.com.ar", "yahoo.com.au", "yahoo.com", "yahoo.co.jp",
                 "yahoo.it", "yahoo.cn", "yahoo.co.in"];
  let userId = "user";

  // We must provide a mimimal fake implementation of a protocol object, to keep
  // the YahooAccount constructor happy.
  let fakeProtocol = {
    id: "fake-proto",
    options: {
      local_charset: "UTF-8"
    },
    _getOptionDefault: function(aOption) { return this.options[aOption]; }
  };
  let fakeImAccount = {};

  for each(let domain in domains) {
    fakeImAccount.name = userId + "@" + domain;
    let yahooAccount = new yahoo.YahooAccount(fakeProtocol, fakeImAccount);
    do_check_eq(userId, yahooAccount.cleanUsername);
  }
  run_next_test();
}

// Test the _fixFontSize() method and ensure that it correctly fixes font sizes
// in <font> tags while keeping any mention of size= in conversation untouched.
function test_fixFontSize()
{
  // This is an array of two-element arrays. Each inner two-element array
  // contains a message with a badly formed font size as the first element,
  // and a message with a well-formed font size as the second element. We test
  // to ensure that the badly formed message is converted to the well-formed
  // one.
  let testMessages = [
    // Single font tag.
    ["<font face=\"Arial\" size=\"12\">Test message 1",
     "<font face=\"Arial\" size=\"3\">Test message 1"],
    // Single font tag with size="<digit>" in innner message.
    ["<font face=\"Arial\" size=\"9\">size=\"30\" is a big size.</font>",
     "<font face=\"Arial\" size=\"2\">size=\"30\" is a big size.</font>"],
    // Single font tag with no face attribute.
    ["<font size=\"12\">This message has no font face attribute.",
     "<font size=\"3\">This message has no font face attribute."],
    // Single font tag with no size attribute.
    ["<font face=\"Arial\">This message has no font size attribute.",
     "<font face=\"Arial\">This message has no font size attribute."],
    // Single font tag with rearranged attribute order.
    ["<font size=\"9\" face=\"Arial\">size=\"30\" is a big size.</font>",
     "<font size=\"2\" face=\"Arial\">size=\"30\" is a big size.</font>"],
    // Multiple font tags.
    ["<font face=\"Arial\" size=\"12\">Hello. <font face=\"Consolas\" size=\"40\">World",
     "<font face=\"Arial\" size=\"3\">Hello. <font face=\"Consolas\" size=\"7\">World"]
  ];

  let fakeProtocol = {
    id: "fake-proto",
    options: {
      local_charset: "UTF-8"
    },
    _getOptionDefault: function(aOption) { return this.options[aOption]; }
  };
  let fakeImAccount = {name: "test-user"};
  // We create a fake conversation object so we can obtain the cleaned up
  // message from the conv.writeMessage() call.
  let messagePair;
  let fakeConversation = {
    writeMessage: function(aName, aMessage, aProperties) {
      do_check_eq(aMessage, messagePair[1]); // Compare to the good message.
    },
    updateTyping: function(aStatus, aName) { }
  };

  let yahooAccount = new yahoo.YahooAccount(fakeProtocol, fakeImAccount);
  yahooAccount._conversations.set("test-user", fakeConversation);
  for each(let pair in testMessages) {
    messagePair = pair;
    // Send in the badly formed message.
    yahooAccount.receiveMessage("test-user", messagePair[0]);
  }
  run_next_test();
}
