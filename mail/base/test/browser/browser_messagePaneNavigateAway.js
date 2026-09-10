/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that loading a web page into the message pane, around the time a
 * message there has finished loading, doesn't leave the post-load work holding
 * a document which has gone. The switch to a web page swaps the pane's content
 * process, so the message's window global and its MailMessage actor disappear
 * abruptly.
 */

"use strict";

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
const { MailE10SUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailE10SUtils.sys.mjs"
);

const WEB_PAGE = "https://example.org/";

const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
let testFolder;

add_setup(async () => {
  const generator = new MessageGenerator();
  const account = MailServices.accounts.createLocalMailAccount();
  account.addIdentity(MailServices.accounts.createIdentity());
  const rootFolder = account.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );
  testFolder = rootFolder
    .createLocalSubfolder("navigateAway")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  testFolder.addMessageBatch(
    generator
      .makeMessages({ count: 2 })
      .map(message => message.toMessageString())
  );

  about3Pane.restoreState({
    folderPaneVisible: true,
    folderURI: testFolder.URI,
    messagePaneVisible: true,
  });

  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, false);
  });
});

/**
 * Loads a web page into the message pane from a "MsgLoaded" listener, which
 * runs before the post-load work (phishing analysis, link and image fixups)
 * starts. By the time that work runs the pane has already switched process.
 */
add_task(async function testLoadWebPageDuringMsgLoaded() {
  const aboutMessage = about3Pane.messageBrowser.contentWindow;
  const browser = aboutMessage.getMessagePaneBrowser();
  aboutMessage.addEventListener(
    "MsgLoaded",
    () => MailE10SUtils.loadURI(browser, WEB_PAGE),
    { once: true }
  );

  about3Pane.threadTree.selectedIndex = 0;
  await BrowserTestUtils.browserLoaded(browser, false, WEB_PAGE);
  await TestUtils.waitForTick();

  Assert.equal(
    browser.currentURI.spec,
    WEB_PAGE,
    "the web page should be displayed in the message pane"
  );
});

/**
 * Loads a web page into the message pane after "MsgLoaded", by which time the
 * post-load work is already waiting on the phishing analysis.
 */
add_task(async function testLoadWebPageAfterMsgLoaded() {
  about3Pane.threadTree.selectedIndex = 1;
  await BrowserTestUtils.waitForEvent(
    about3Pane.messageBrowser.contentWindow,
    "MsgLoaded"
  );

  const browser =
    about3Pane.messageBrowser.contentWindow.getMessagePaneBrowser();
  MailE10SUtils.loadURI(browser, WEB_PAGE);
  await BrowserTestUtils.browserLoaded(browser, false, WEB_PAGE);
  await TestUtils.waitForTick();

  Assert.equal(
    browser.currentURI.spec,
    WEB_PAGE,
    "the web page should be displayed in the message pane"
  );
});
