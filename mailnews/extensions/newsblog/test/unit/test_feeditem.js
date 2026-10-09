/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { FeedItem } = ChromeUtils.importESModule(
  "resource:///modules/FeedItem.sys.mjs"
);

const TAG_KEY = "rss-camera";
const TAG_NAME = "Cameras";

add_setup(function () {
  MailServices.tags.addTagForKey(TAG_KEY, TAG_NAME, "", FeedUtils.AUTOTAG);
  registerCleanupFunction(() => MailServices.tags.deleteKey(TAG_KEY));
});

/**
 * Create an RSS item and write it directly to a folder.
 *
 * @param {nsIMsgFolder} folder - Folder in which to create the item.
 * @param {string} id - Unique item identifier.
 */
function writeFeedItem(folder, id) {
  const item = new FeedItem();
  item.feed = {
    folder,
    name: folder.name,
    options: {
      category: {
        enabled: true,
        prefixEnabled: false,
        prefix: "",
      },
    },
  };
  item.id = id;
  item.title = `Feed item ${id}`;
  item.author = ["author@example.invalid"];
  item.keywords = [TAG_NAME];
  item.content = "\n<p>Feed item content</p>";
  item.url = `https://example.invalid/${id}`;
  item.writeToFolder();
}

/**
 * Add an incoming move filter to an RSS account.
 *
 * @param {nsIMsgIncomingServer} server - RSS incoming server.
 * @param {nsIMsgFolder} destination - Move destination.
 * @param {boolean} matchTag - Whether to match TAG_KEY instead of all items.
 */
function addMoveFilter(server, destination, matchTag) {
  const filterList = server.getFilterList(null);
  const filter = filterList.createFilter(
    matchTag ? "Move tagged feed item" : "Move all feed items"
  );
  const term = filter.createTerm();
  if (matchTag) {
    term.attrib = Ci.nsMsgSearchAttrib.Keywords;
    term.op = Ci.nsMsgSearchOp.Contains;
    const value = term.value;
    value.attrib = Ci.nsMsgSearchAttrib.Keywords;
    value.str = TAG_KEY;
    term.value = value;
  } else {
    term.matchAll = true;
  }
  filter.appendTerm(term);

  const action = filter.createAction();
  action.type = Ci.nsMsgFilterAction.MoveToFolder;
  action.targetFolderUri = destination.URI;
  filter.appendAction(action);
  filter.enabled = true;
  filter.filterType = Ci.nsMsgFilterType.InboxRule;
  filterList.insertFilterAt(0, filter);
}

/**
 * Check that an item was moved with its RSS metadata intact.
 *
 * @param {nsIMsgFolder} source - Original feed folder.
 * @param {nsIMsgFolder} destination - Move destination.
 */
function assertMovedAndTagged(source, destination) {
  Assert.equal([...source.messages].length, 0, "source folder should be empty");
  const messages = [...destination.messages];
  Assert.equal(messages.length, 1, "destination should contain the feed item");
  Assert.equal(
    messages[0].getStringProperty("keywords"),
    TAG_KEY,
    "moved item should retain its feed category tag"
  );
  Assert.ok(
    messages[0].flags & Ci.nsMsgMessageFlags.FeedMsg,
    "moved item should retain its feed flag"
  );
  const storedMessage = mailTestUtils.loadMessageToString(
    destination,
    messages[0]
  );
  Assert.ok(
    storedMessage.includes("X-Mozilla-Status: 0040"),
    "feed flag should be persisted in the message"
  );
  Assert.ok(
    storedMessage.includes(`X-Mozilla-Keys: ${TAG_KEY}`),
    "feed category tag should be persisted in the message"
  );
}

add_task(function test_feed_category_tag_available_to_incoming_filter() {
  const account = FeedUtils.createRssAccount("tag filter account");
  const rootFolder = account.incomingServer.rootMsgFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );
  const source = rootFolder.createLocalSubfolder("tag filter source");
  const destination = rootFolder.createLocalSubfolder("tag filter destination");
  addMoveFilter(account.incomingServer, destination, true);

  writeFeedItem(source, "tag-filter");

  assertMovedAndTagged(source, destination);
});

add_task(function test_feed_category_tag_survives_incoming_filter_move() {
  const account = FeedUtils.createRssAccount("move filter account");
  const rootFolder = account.incomingServer.rootMsgFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );
  const source = rootFolder.createLocalSubfolder("move filter source");
  const destination = rootFolder.createLocalSubfolder(
    "move filter destination"
  );
  addMoveFilter(account.incomingServer, destination, false);

  writeFeedItem(source, "move-filter");

  assertMovedAndTagged(source, destination);
});

add_task(function test_normalizeMessageID_escapes_meta_characters() {
  const item = new FeedItem();
  Assert.equal(
    item.normalizeMessageID(" victim-real-id@example.com> "),
    "<victim-real-id%40example.com%3E@localhost.localdomain>",
    "message ID meta characters should be escaped"
  );
  Assert.equal(
    item.normalizeMessageID("<a@b><c@d>"),
    "<%3Ca%40b%3E%3Cc%40d%3E@localhost.localdomain>",
    "all occurrences of message ID meta characters should be escaped"
  );
  Assert.equal(
    item.normalizeMessageID("foo bar\u00A0baz"),
    "<foo%20bar%C2%A0baz@localhost.localdomain>",
    "inner whitespace should be escaped"
  );
  Assert.notEqual(
    item.normalizeMessageID("a%40b"),
    item.normalizeMessageID("a@b"),
    "an already escaped id should not collide with the unescaped one"
  );
});

add_task(function test_message_id_header_escapes_item_id() {
  const account = FeedUtils.createRssAccount("message id account");
  const rootFolder = account.incomingServer.rootMsgFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );
  const folder = rootFolder.createLocalSubfolder("message id folder");

  writeFeedItem(folder, "victim-real-id@example.com>");

  const messages = [...folder.messages];
  Assert.equal(messages.length, 1, "folder should contain the feed item");
  Assert.equal(
    messages[0].messageId,
    "victim-real-id%40example.com%3E@localhost.localdomain",
    "stored message ID should be the escaped item id"
  );
  const storedMessage = mailTestUtils.loadMessageToString(folder, messages[0]);
  Assert.ok(
    storedMessage.includes(
      "Message-Id: <victim-real-id%40example.com%3E@localhost.localdomain>\n"
    ),
    "Message-Id header should contain the escaped item id"
  );
});
