/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

var { ircAccount } = ChromeUtils.importESModule(
  "resource:///modules/ircAccount.sys.mjs"
);

function joinChat(
  desc,
  channelName,
  channelPassword,
  expectedChannelName,
  expectedDefaultFields
) {
  const conversation = {};
  const mockAccount = {
    channelPrefixes: ircAccount.prototype.channelPrefixes,
    // Note that joinChat doesn't modify conversations directly, instead getConversation
    // would normally add the new conversation to it, but that's mocked out below.
    // This essentially just needs a has(...) method on it.
    conversations: new Map(),

    ERROR(msg) {
      ok(false, `Unexpected ERROR: ${msg}`);
    },

    sendBufferedCommand(command, param, key) {
      this.command = command;
      this.param = param;
      this.key = key;
    },
    getConversation(name) {
      this.convName = name;
      return conversation;
    },
    getChatRoomDefaultFieldValues(value) {
      this.defaultFieldValues = value;
    },
  };
  const components = {
    getValue(key) {
      if (key === "channel") {
        return channelName;
      } else if (key === "password") {
        return channelPassword;
      }
      ok(false, `Unknown chat room field "${key}"`);
      return null;
    },
  };

  const conv = ircAccount.prototype.joinChat.call(mockAccount, components);

  // Check the generated command.
  equal(mockAccount.command, "JOIN", `${desc}: Invalid JOIN command`);
  equal(
    mockAccount.param,
    expectedChannelName,
    `${desc}: Unexpected channel name in JOIN command`
  );
  equal(
    mockAccount.key,
    channelPassword,
    `${desc}: Unexpected password in JOIN command`
  );

  // Check the generated conversation name.
  equal(
    mockAccount.convName,
    expectedChannelName,
    `${desc}: Unexpected channel name`
  );

  equal(
    mockAccount.defaultFieldValues,
    expectedDefaultFields,
    `${desc}: Unexpected default field values`
  );

  // The conv
  strictEqual(conv, conversation);
}

add_task(function test_joinChat() {
  // Basic tests.
  joinChat("Basic", "#foo", "", "#foo", "#foo");
  joinChat("Password", "#foo", "pass", "#foo", "#foo pass");
  joinChat("No prefix", "foo", "pass", "#foo", "#foo pass");

  // Other prefixes.
  joinChat("Prefix(&)", "&foo", "", "&foo", "&foo");
  joinChat("Prefix(+)", "+foo", "", "+foo", "+foo");
  joinChat("Prefix(!)", "!foo", "", "!foo", "!foo");

  // Test input with spaces.
  joinChat("Spaces", " #foo", "", "#foo", "#foo");

  // Test input with commas.
  joinChat("Commas", "#foo bar,", "", "#foo", "#foo");
});
