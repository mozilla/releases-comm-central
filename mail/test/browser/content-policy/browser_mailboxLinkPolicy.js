/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that mailbox: and imap: links to message parts only open parts of the
 * message being displayed.
 */

"use strict";

var {
  be_in_folder,
  create_folder,
  get_about_message,
  open_message_from_file,
  select_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { ServerTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ServerTestUtils.sys.mjs"
);

const mimeService = Cc["@mozilla.org/mime;1"].getService(Ci.nsIMIMEService);
const handlerService = Cc[
  "@mozilla.org/uriloader/handler-service;1"
].getService(Ci.nsIHandlerService);
const tabmail = document.getElementById("tabmail");
let localFolder, imapServer, imapFolder, pdfBody;

/**
 * @param {string} subject
 * @param {string} html - The HTML body, which can link to the attached PDF
 *   with "cid:attached".
 * @returns {string} The raw message.
 */
function makeMessage(subject, html) {
  return `From: Sender <sender@example.com>
To: Recipient <recipient@example.com>
Subject: ${subject}
Date: Tue, 13 Oct 2026 12:00:00 +0000
Message-ID: <${subject.replace(/\W/g, "")}@example.com>
MIME-Version: 1.0
Content-Type: multipart/related; boundary="REL"

--REL
Content-Type: text/html; charset=UTF-8

<html><body>${html}</body></html>
--REL
Content-Type: application/pdf; name="attached.pdf"
Content-Disposition: attachment; filename="attached.pdf"
Content-Transfer-Encoding: base64
Content-ID: <attached>

${pdfBody}
--REL--
`;
}

/**
 * @param {string} id
 * @param {string} href
 * @returns {string} A clickable link.
 */
function link(id, href) {
  return `<a id="${id}" href="${href}" style="display:block;width:100px;height:100px">${id}</a>`;
}

add_setup(async function () {
  const handlerInfo = mimeService.getFromTypeAndExtension(
    "application/pdf",
    "pdf"
  );
  const previousHandler = {
    alwaysAskBeforeHandling: handlerInfo.alwaysAskBeforeHandling,
    preferredAction: handlerInfo.preferredAction,
  };
  handlerInfo.alwaysAskBeforeHandling = false;
  handlerInfo.preferredAction = Ci.nsIHandlerInfo.handleInternally;
  handlerService.store(handlerInfo);

  const pdfBytes = await IOUtils.read(
    getTestFilePath(
      "../../../components/compose/test/browser/data/attachment.pdf"
    )
  );
  pdfBody = btoa(String.fromCharCode(...pdfBytes));

  localFolder = await create_folder("mailboxLinkPolicy");

  // Fetch messages from the server when displaying them.
  await SpecialPowers.pushPrefEnv({
    set: [["mail.server.default.offline_download", false]],
  });
  imapServer = await ServerTestUtils.createServer(
    ServerTestUtils.serverDefs.imap.plain
  );
  const imapAccount = MailServices.accounts.createAccount();
  imapAccount.addIdentity(MailServices.accounts.createIdentity());
  imapAccount.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "localhost",
    "imap"
  );
  imapAccount.incomingServer.port = imapServer.port;
  imapAccount.incomingServer.password = "password";
  imapFolder = imapAccount.incomingServer.rootFolder.getFolderWithFlags(
    Ci.nsMsgFolderFlags.Inbox
  );

  registerCleanupFunction(() => {
    const currentHandler = mimeService.getFromTypeAndExtension(
      "application/pdf",
      "pdf"
    );
    currentHandler.alwaysAskBeforeHandling =
      previousHandler.alwaysAskBeforeHandling;
    currentHandler.preferredAction = previousHandler.preferredAction;
    handlerService.store(currentHandler);
    localFolder.deleteSelf(null);
    MailServices.accounts.removeAccount(imapAccount, false);
  });
});

/**
 * Clicks a link in a message and checks the linked part opens.
 *
 * @param {MozBrowser} browser
 * @param {string} selector
 * @param {string} messageURL - The URL of the message the part belongs to.
 */
async function clickAndCheckOpened(browser, selector, messageURL) {
  const tabPromise = BrowserTestUtils.waitForEvent(
    tabmail.tabContainer,
    "TabOpen",
    false,
    event => event.detail.tabInfo.mode.name == "contentTab"
  );
  await BrowserTestUtils.synthesizeMouseAtCenter(selector, {}, browser);
  const {
    detail: { tabInfo },
  } = await tabPromise;
  await TestUtils.waitForCondition(
    () => tabInfo.browser.currentURI.spec != "about:blank",
    "the part should load"
  );
  const url = new URL(tabInfo.browser.currentURI.spec);
  const expectedURL = new URL(messageURL);
  Assert.equal(
    url.pathname,
    expectedURL.pathname,
    `${selector} should open a part of the displayed message`
  );
  Assert.equal(
    url.searchParams.get("number"),
    expectedURL.searchParams.get("number"),
    `${selector} should open a part of the displayed message number`
  );
  Assert.equal(
    url.searchParams.get("part"),
    "1.2",
    `${selector} should open the linked part`
  );
  // Closing the tab while the PDF viewer is still loading makes its pending
  // queries to the parent fail.
  await SpecialPowers.spawn(tabInfo.browser, [], () =>
    ContentTaskUtils.waitForCondition(
      () => !!content.wrappedJSObject.PDFViewerApplication?.pdfDocument,
      "the PDF should load"
    )
  );
  tabmail.closeTab(tabInfo);
}

/**
 * Clicks a link in a message and checks it isn't opened.
 *
 * @param {MozBrowser} browser
 * @param {string} selector
 */
async function clickAndCheckBlocked(browser, selector) {
  const warningPromise = TestUtils.consoleMessageObserved(msg =>
    msg.wrappedJSObject.arguments?.[0]?.startsWith?.(
      "Not opening link to another message"
    )
  );
  await BrowserTestUtils.synthesizeMouseAtCenter(selector, {}, browser);
  await warningPromise;
  Assert.equal(tabmail.tabInfo.length, 1, `${selector} should not open a tab`);
}

/**
 * Checks clicking links to parts of the displayed message and of another
 * message in a folder.
 *
 * @param {nsIMsgFolder} folder
 * @param {Function} addMessage - Async function adding a raw message to the
 *   folder.
 */
async function subtestLinksInFolder(folder, addMessage) {
  await addMessage(makeMessage("Other message", "Other message body"));
  const otherURI = folder.getUriForMsg([...folder.messages][0]);
  const otherURL = new URL(
    MailServices.messageServiceFromURI(otherURI).getUrlForUri(otherURI).spec
  );
  otherURL.searchParams.set("part", "1.2");
  otherURL.searchParams.set("filename", "attached.pdf");

  await addMessage(
    makeMessage(
      "Links message",
      [
        link("own", "cid:attached"),
        link("other", otherURL.href),
        link(
          "unc",
          "mailbox://///%3F/UNC/192.0.2.1/share/msg.eml?number=0&part=1.2&filename=invoice.rfc822"
        ),
      ].join("")
    )
  );

  await be_in_folder(folder);
  const msgHdr = await select_click_row(-1);
  Assert.equal(
    msgHdr.subject,
    "Links message",
    "the links message should be selected"
  );
  const messageURI = folder.getUriForMsg(msgHdr);
  const messageURL =
    MailServices.messageServiceFromURI(messageURI).getUrlForUri(
      messageURI
    ).spec;
  const messagePane = get_about_message().getMessagePaneBrowser();

  await clickAndCheckBlocked(messagePane, "#other");
  await clickAndCheckBlocked(messagePane, "#unc");
  await clickAndCheckOpened(messagePane, "#own", messageURL);
}

add_task(async function testLinksInLocalMessage() {
  await subtestLinksInFolder(localFolder, async raw =>
    localFolder.QueryInterface(Ci.nsIMsgLocalMailFolder).addMessage(raw)
  );
});

add_task(async function testLinksInIMAPMessage() {
  await subtestLinksInFolder(imapFolder, raw =>
    imapServer.addMessages(imapFolder, [raw])
  );
});

add_task(async function testLinksInEMLFile() {
  const file = await IOUtils.getFile(PathUtils.tempDir, "mailboxLinks.eml");
  registerCleanupFunction(() => IOUtils.remove(file.path));
  await IOUtils.writeUTF8(
    file.path,
    makeMessage(
      "EML links message",
      [
        link("own", "cid:attached"),
        link(
          "unc",
          "mailbox://///%3F/UNC/192.0.2.1/share/msg.eml?number=0&part=1.2&filename=invoice.rfc822"
        ),
      ].join("")
    )
  );
  const win = await open_message_from_file(file);
  registerCleanupFunction(async () => {
    if (!win.closed) {
      await BrowserTestUtils.closeWindow(win);
    }
  });
  const messagePane = get_about_message(win).getMessagePaneBrowser();

  await clickAndCheckBlocked(messagePane, "#unc");
  await clickAndCheckOpened(
    messagePane,
    "#own",
    messagePane.contentDocument.documentURI
  );

  await BrowserTestUtils.closeWindow(win);
});
