/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { FeedUtils } = ChromeUtils.importESModule(
  "resource:///modules/FeedUtils.sys.mjs"
);
var { VirtualFolderHelper } = ChromeUtils.importESModule(
  "resource:///modules/VirtualFolderWrapper.sys.mjs"
);

const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
let rootFolder;
const folders = {};

const FOLDER_PREFIX = "mailbox://nobody@smart%20mailboxes/tags/";
const DEFAULT_TAGS = new Map([
  ["$label1", { label: "Important", color: "#FF0000" }],
  ["$label2", { label: "Work", color: "#FF9900" }],
  ["$label3", { label: "Personal", color: "#009900" }],
  ["$label4", { label: "To Do", color: "#3333FF" }],
  ["$label5", { label: "Later", color: "#993399" }],
]);

add_setup(async function () {
  const allTags = MailServices.tags.getAllTags();
  Assert.deepEqual(
    allTags.map(t => t.key),
    [...DEFAULT_TAGS.keys()],
    "sanity check tag keys"
  );
  Assert.deepEqual(
    allTags.map(t => ({ label: t.tag, color: t.color })),
    [...DEFAULT_TAGS.values()],
    "sanity check tag labels"
  );

  about3Pane.folderPane.activeModes = ["all"];
  resetSmartMailboxes();

  const account = MailServices.accounts.createAccount();
  account.incomingServer = MailServices.accounts.createIncomingServer(
    `${account.key}user`,
    "localhost",
    "pop3"
  );
  account.addIdentity(MailServices.accounts.createIdentity());
  rootFolder = account.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );

  for (const flag of [
    "Inbox",
    "Drafts",
    "Templates",
    "SentMail",
    "Archive",
    "Junk",
    "Trash",
    "Queue",
    "Virtual",
  ]) {
    let folder = rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags[flag]);
    if (!folder) {
      folder = rootFolder.createLocalSubfolder(`tagsMode${flag}`);
      folder.setFlag(Ci.nsMsgFolderFlags[flag]);
    }
    folders[flag] = folder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  }
  folders.Plain = rootFolder.createLocalSubfolder("tagsModePlain");

  const msgDatabase = folders.Virtual.msgDatabase;
  const folderInfo = msgDatabase.dBFolderInfo;
  folderInfo.setCharProperty("searchStr", "ALL");
  folderInfo.setCharProperty("searchFolderUri", folders.Inbox.URI);

  registerCleanupFunction(function () {
    MailServices.accounts.removeAccount(account, false);
    about3Pane.folderPane.activeModes = ["all"];
  });
});

async function checkFolderTree(expectedTags) {
  const tagsList = about3Pane.folderTree.querySelector(
    `li[data-mode="tags"] ul`
  );
  await TestUtils.waitForCondition(
    () => tagsList.childElementCount == expectedTags.size,
    "waiting for folder tree to update"
  );
  const keys = expectedTags.keys();
  const values = expectedTags.values();
  for (const row of tagsList.children) {
    const key = keys.next().value;
    const { label, color } = values.next().value;
    // Don't use encodeURIComponent, folder URLs escape more characters.
    Assert.equal(
      row.uri,
      FOLDER_PREFIX +
        Services.io.escapeString(key, Ci.nsINetUtil.ESCAPE_URL_PATH)
    );
    Assert.equal(row.name, label);
    Assert.equal(row.icon.style.getPropertyValue("--icon-color"), color);
  }
  Assert.ok(keys.next().done, "all tags should have a row in the tree");
}

add_task(async function testFolderTree() {
  // Check the default tags are shown initially.
  const expectedTags = new Map(DEFAULT_TAGS);
  about3Pane.folderPane.activeModes = ["all", "tags"];
  await checkFolderTree(DEFAULT_TAGS);

  // Add two custom tags and check they are shown.
  MailServices.tags.addTagForKey("testkey", "testLabel", "#000000", "");
  await TestUtils.waitForCondition(
    () => MailServices.tags.getAllTags().length == 6,
    "waiting for tag to be created"
  );
  expectedTags.set("testkey", { label: "testLabel", color: "#000000" });
  await checkFolderTree(expectedTags);

  MailServices.tags.addTagForKey("anotherkey!", "anotherLabel", "#333333", "");
  await TestUtils.waitForCondition(
    () => MailServices.tags.getAllTags().length == 7,
    "waiting for tag to be created"
  );
  expectedTags.set("anotherkey!", { label: "anotherLabel", color: "#333333" });
  await checkFolderTree(expectedTags);

  // Delete the first custom tag and check it is removed.
  MailServices.tags.deleteKey("testkey");
  await TestUtils.waitForCondition(
    () => MailServices.tags.getAllTags().length == 6,
    "waiting for tag to be removed"
  );
  expectedTags.delete("testkey");
  await checkFolderTree(expectedTags);

  // Hide and reinitialise the Tags mode and check the list is the same.
  about3Pane.folderPane.activeModes = ["all"];
  about3Pane.folderPane.activeModes = ["all", "tags"];
  await checkFolderTree(expectedTags);

  // Delete the second custom tag.
  MailServices.tags.deleteKey("anotherkey!");
  await TestUtils.waitForCondition(
    () => MailServices.tags.getAllTags().length == 5,
    "waiting for tag to be removed"
  );
  expectedTags.delete("anotherkey!");
  await checkFolderTree(expectedTags);
});

function checkVirtualFolder(tagKey, tagLabel, expectedFolderURIs) {
  const folder = MailServices.folderLookup.getFolderForURL(
    FOLDER_PREFIX + encodeURIComponent(tagKey)
  );
  Assert.ok(folder);
  const wrappedFolder = VirtualFolderHelper.wrapVirtualFolder(folder);
  Assert.equal(folder.prettyName, tagLabel);
  Assert.equal(wrappedFolder.searchString, `AND (tag,contains,${tagKey})`);
  Assert.equal(wrappedFolder.searchFolderURIs, "*");

  about3Pane.displayFolder(folder);
  Assert.deepEqual(
    about3Pane.gViewWrapper._underlyingFolders.map(f => f.URI).sort(),
    expectedFolderURIs.sort()
  );
}

add_task(async function testFolderSelection() {
  const expectedFolderURIs = [
    folders.Inbox.URI,
    folders.Drafts.URI,
    folders.Templates.URI,
    folders.SentMail.URI,
    folders.Archive.URI,
    folders.Plain.URI,
  ];

  for (const [key, { label }] of DEFAULT_TAGS) {
    checkVirtualFolder(key, label, expectedFolderURIs);
  }

  // Add another plain folder. It should be added to the searched folders.
  const newPlainFolder = rootFolder.createLocalSubfolder("tagsModePlain2");
  expectedFolderURIs.push(newPlainFolder.URI);
  checkVirtualFolder("$label1", "Important", expectedFolderURIs);

  // Add a subfolder to the inbox. It should be added to the searched folders.
  const newInboxFolder = folders.Inbox.createLocalSubfolder("tagsModeInbox2");
  expectedFolderURIs.push(newInboxFolder.URI);
  checkVirtualFolder("$label2", "Work", expectedFolderURIs);

  // Add a subfolder to the trash. It should NOT be added to the searched folders.
  folders.Trash.createLocalSubfolder("tagsModeTrash2");
  checkVirtualFolder("$label1", "Important", expectedFolderURIs);

  const rssAccount = FeedUtils.createRssAccount("rss");
  const rssRootFolder = rssAccount.incomingServer.rootFolder;
  FeedUtils.subscribeToFeed(
    "https://example.org/browser/comm/mail/base/test/browser/files/rss.xml?tagsMode",
    rssRootFolder,
    null
  );
  await TestUtils.waitForCondition(() => rssRootFolder.subFolders.length == 2);
  const rssFeedFolder = rssRootFolder.getChildNamed("Test Feed");

  expectedFolderURIs.push(rssFeedFolder.URI);
  checkVirtualFolder("$label2", "Work", expectedFolderURIs);

  // Delete the smart mailboxes server and check it is correctly recreated.
  about3Pane.folderPane.activeModes = ["all"];
  resetSmartMailboxes();
  about3Pane.folderPane.activeModes = ["all", "tags"];

  for (const [key, { label }] of DEFAULT_TAGS) {
    checkVirtualFolder(key, label, expectedFolderURIs);
  }

  MailServices.accounts.removeAccount(rssAccount, false);
});
