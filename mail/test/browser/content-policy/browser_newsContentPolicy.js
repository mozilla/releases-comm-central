/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that news: URLs embedded in messages can't be used to make the client
 * contact arbitrary news servers (Bug 278176), and that news articles don't
 * run JavaScript.
 */

"use strict";

var {
  be_in_folder,
  create_folder,
  get_about_3pane,
  get_about_message,
  select_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
var { open_content_tab_with_url } = ChromeUtils.importESModule(
  "resource://testing-common/mail/ContentTabHelpers.sys.mjs"
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
  newsServer.addMessages(GROUP, [targetMessage]);
  trackerServer.addGroup(GROUP);
  trackerServer.addMessages(GROUP, [targetMessage]);

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
  newsServer.addMessages(group, [message]);
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

/**
 * A news article opened in a content tab must not run JavaScript.
 *
 * Articles shown the normal way (message pane, or news: links via
 * MailUtils.handleNewsUri) are already sandboxed by displayMessage() in
 * aboutMessage.js. A raw news: URL loaded into a plain content browser only
 * gets the protection from nsMsgContentPolicy, which this checks.
 */
add_task(async function testNewsArticleInContentTab() {
  const message = generator.makeMessage({
    body: {
      body: `<html><body><script>window.jsIsTurnedOn = true;</script><noscript>noscript</noscript></body></html>`,
      contentType: "text/html",
    },
  });
  newsServer.addMessages(GROUP, [message]);

  const tab = await open_content_tab_with_url(
    `news://test.test:119/${encodeURIComponent(message.messageId)}`
  );
  const bc = tab.browser.browsingContext;
  Assert.ok(!bc.allowJavascript, "JavaScript should not be allowed");
  Assert.notEqual(bc.sandboxFlags, 0, "sandbox flags should be set");
  await SpecialPowers.spawn(tab.browser, [], () => {
    Assert.ok(
      !content.wrappedJSObject.jsIsTurnedOn,
      "JS should not be turned on in content"
    );
    const noscript = content.document.querySelector("noscript");
    Assert.ok(!!noscript, "noscript element should be found in doc");
    Assert.equal(
      content.getComputedStyle(noscript).display,
      "inline",
      "noscript display should be 'inline'"
    );
  });
  document.getElementById("tabmail").closeTab(tab);
});

/**
 * Clicking an image map or SVG news: link with a target in a mail message must
 * be handled like any other news: link, not open the URL in a content tab.
 */
add_task(async function testNewsLinkTargetsInMailMessage() {
  const href = `news://test.test:119/${encodeURIComponent(targetMessageId)}`;
  const folder = await create_folder("newsLinkTargets");
  folder.QueryInterface(Ci.nsIMsgLocalMailFolder).addMessage(
    generator
      .makeMessage({
        body: {
          body: `<html><body>
            <img id="area" src="data:image/png;base64,${PNG_BASE64}" width="100" height="100" usemap="#map">
            <map name="map"><area shape="rect" coords="0,0,100,100" href="${href}" target="_blank"></map>
            <svg width="100" height="100"><a href="${href}" target="_blank"><rect id="svg" width="100" height="100"/></a></svg>
          </body></html>`,
          contentType: "text/html",
        },
      })
      .toMessageString()
  );
  await be_in_folder(folder);
  await select_click_row(0);
  const messagePane = get_about_message().getMessagePaneBrowser();
  const tabmail = document.getElementById("tabmail");

  for (const selector of ["#area", "#svg"]) {
    const tabPromise = BrowserTestUtils.waitForEvent(window, "TabOpen");
    const loadedPromise = BrowserTestUtils.waitForEvent(window, "MsgLoaded");
    await BrowserTestUtils.synthesizeMouseAtCenter(selector, {}, messagePane);
    const {
      detail: { tabInfo },
    } = await tabPromise;
    Assert.equal(
      tabInfo.mode.name,
      "mailMessageTab",
      `${selector} link should open the article in a message tab`
    );
    if (tabInfo.mode.name == "mailMessageTab") {
      await loadedPromise;
    }
    tabmail.closeTab(tabInfo);
  }

  folder.deleteSelf(null);
});

/**
 * Clicking an nntp: link with a target in a mail message must open the
 * newsgroup, not open the URL in a content tab.
 */
add_task(async function testNntpLinkInMailMessage() {
  const newsFolder = await setupNewsFolder(
    `${GROUP}.nntp`,
    generator.makeMessage()
  );
  const folder = await create_folder("nntpLink");
  folder.QueryInterface(Ci.nsIMsgLocalMailFolder).addMessage(
    generator
      .makeMessage({
        body: {
          body: `<html><body><a id="nntp" href="nntp://test.test:119/${GROUP}.nntp/1" target="_blank" style="display:block;width:100px;height:100px">nntp</a></body></html>`,
          contentType: "text/html",
        },
      })
      .toMessageString()
  );
  await be_in_folder(folder);
  await select_click_row(0);

  await BrowserTestUtils.synthesizeMouseAtCenter(
    "#nntp",
    {},
    get_about_message().getMessagePaneBrowser()
  );
  await TestUtils.waitForCondition(
    () => get_about_3pane().gFolder == newsFolder,
    "the newsgroup should be displayed"
  );
  Assert.equal(
    document.getElementById("tabmail").tabInfo.length,
    1,
    "no tab should be opened"
  );

  folder.deleteSelf(null);
});
