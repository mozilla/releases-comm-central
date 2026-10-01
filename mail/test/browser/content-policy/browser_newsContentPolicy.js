/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that news: URLs embedded in messages can't be used to make the client
 * contact arbitrary news servers (Bug 278176).
 */

"use strict";

var { be_in_folder, create_folder, get_about_message, select_click_row } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
  );
var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
var { NntpUtils } = ChromeUtils.importESModule(
  "resource:///modules/NntpUtils.sys.mjs"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);
var { ServerTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ServerTestUtils.sys.mjs"
);

const GROUP = "test.contentpolicy";
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const generator = new MessageGenerator();
let newsServer, trackerServer, newsAccount, mailFolder;
let targetMessageId;

/**
 * @param {string} host - The news server to fetch the image from.
 * @returns {string} A news: URL for the image attached to the target message.
 */
function imageURL(host) {
  return `news://${host}:119/${encodeURIComponent(targetMessageId)}?part=1.2&type=image/png&filename=pixel.png`;
}

/**
 * @param {string} src - The src of the image.
 * @returns {SyntheticMessage}
 */
function makeImageMessage(src) {
  return generator.makeMessage({
    body: {
      body: `<html><body><img id="testelement" src="${src}"></body></html>`,
      contentType: "text/html",
    },
  });
}

/**
 * The fake NNTP server doesn't end the article with a line break before the
 * terminating dot, so make sure the message text ends with one.
 *
 * @param {SyntheticMessage} message
 * @returns {object} An object that can be passed to NNTPServer.addMessages.
 */
function asArticle(message) {
  return { toMessageString: () => message.toMessageString() + "\r\n" };
}

/**
 * @param {NNTPServer} server
 * @returns {string[]} All commands the server has received.
 */
function receivedCommands(server) {
  return [server.server.playTransaction()].flat().flatMap(t => t.them);
}

/**
 * Displays the only message in `folder` and waits for its images to settle.
 *
 * @param {nsIMsgFolder} folder
 * @returns {HTMLImageElement}
 */
async function displayMessage(folder) {
  await be_in_folder(folder);
  await select_click_row(0);
  const doc = get_about_message().getMessagePaneBrowser().contentDocument;
  const img = doc.getElementById("testelement");
  await TestUtils.waitForCondition(() => img.complete, "image should settle");
  return img;
}

add_setup(async function () {
  [newsServer, trackerServer] = await ServerTestUtils.createServers([
    ServerTestUtils.serverDefs.nntp.plain,
    { type: "nntp", hostname: "tracker.test", port: 119 },
  ]);

  const targetMessage = generator.makeMessage({
    attachments: [
      {
        filename: "pixel.png",
        contentType: "image/png",
        encoding: "base64",
        charset: null,
        body: PNG_BASE64 + "\n",
        format: null,
      },
    ],
  });
  targetMessageId = targetMessage.messageId;
  newsServer.addGroup(GROUP);
  newsServer.addMessages(GROUP, [asArticle(targetMessage)]);
  trackerServer.addGroup(GROUP);
  trackerServer.addMessages(GROUP, [asArticle(targetMessage)]);

  newsAccount = MailServices.accounts.createAccount();
  newsAccount.incomingServer = MailServices.accounts.createIncomingServer(
    `${newsAccount.key}user`,
    "test.test",
    "nntp"
  );
  newsAccount.incomingServer.port = 119;

  mailFolder = await create_folder("newsContentPolicy");

  registerCleanupFunction(() => {
    mailFolder.deleteSelf(null);
    MailServices.accounts.removeAccount(newsAccount, false);
    const stray = NntpUtils.findServer("tracker.test");
    if (stray) {
      MailServices.accounts.removeIncomingServer(stray, false);
    }
  });
});

/**
 * Adds a newsgroup holding a single message and downloads its headers.
 *
 * @param {string} group
 * @param {SyntheticMessage} message
 * @returns {nsIMsgFolder}
 */
async function setupNewsFolder(group, message) {
  newsServer.addGroup(group);
  newsServer.addMessages(group, [asArticle(message)]);
  const rootFolder = newsAccount.incomingServer.rootFolder;
  rootFolder.createSubfolder(group, null);
  const folder = rootFolder.getChildNamed(group);
  const urlListener = new PromiseTestUtils.PromiseUrlListener();
  newsAccount.incomingServer.getNewMessages(
    folder,
    window.msgWindow,
    urlListener
  );
  await urlListener.promise;
  return folder;
}

/**
 * A news: image in a mail message must not contact the news server.
 */
add_task(async function testNewsImageInMailMessage() {
  mailFolder
    .QueryInterface(Ci.nsIMsgLocalMailFolder)
    .addMessage(makeImageMessage(imageURL("tracker.test")).toMessageString());

  const img = await displayMessage(mailFolder);
  Assert.equal(img.naturalWidth, 0, "image should not load");
  Assert.deepEqual(
    receivedCommands(trackerServer),
    [],
    "tracker server should not be contacted from a mail message"
  );
  Assert.equal(
    NntpUtils.findServer("tracker.test"),
    null,
    "no server should be created for tracker.test"
  );
});

/**
 * A news: image in a news message may load from the same news server.
 */
add_task(async function testSameServerNewsImageInNewsMessage() {
  const folder = await setupNewsFolder(
    `${GROUP}.same`,
    makeImageMessage(imageURL("test.test"))
  );

  const img = await displayMessage(folder);
  Assert.equal(img.naturalWidth, 1, "image should load");
  Assert.ok(
    receivedCommands(newsServer).includes(`ARTICLE <${targetMessageId}>`),
    "same-server news image should be fetched"
  );
});

/**
 * A news: image in a news message must not contact a different news server.
 */
add_task(async function testOtherServerNewsImageInNewsMessage() {
  const folder = await setupNewsFolder(
    `${GROUP}.other`,
    makeImageMessage(imageURL("tracker.test"))
  );

  const img = await displayMessage(folder);
  Assert.equal(img.naturalWidth, 0, "image should not load");
  Assert.deepEqual(
    receivedCommands(trackerServer),
    [],
    "tracker server should not be contacted from a news message"
  );
  Assert.equal(
    NntpUtils.findServer("tracker.test"),
    null,
    "no server should be created for tracker.test"
  );
});
