/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const GlodaTestHelper = ChromeUtils.importESModule(
  "resource://testing-common/gloda/GlodaTestHelper.sys.mjs"
);
const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

const { FeedUtils } = ChromeUtils.importESModule(
  "resource:///modules/FeedUtils.sys.mjs"
);
const { GlodaIndexer } = ChromeUtils.importESModule(
  "resource:///modules/gloda/GlodaIndexer.sys.mjs"
);

const tabmail = document.getElementById("tabmail");
const about3Pane = tabmail.currentAbout3Pane;
let testFolder, rssFeedFolder;

add_setup(async () => {
  document.getElementById("toolbar-menubar").removeAttribute("autohide");
  const generator = new MessageGenerator();

  const account = MailServices.accounts.createLocalMailAccount();
  account.addIdentity(MailServices.accounts.createIdentity());
  const rootFolder = account.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );

  testFolder = rootFolder
    .createLocalSubfolder("messageBodyAs")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  testFolder.addMessageBatch(
    generator.makeMessages({}).map(message => message.toMessageString())
  );

  const feedAccount = FeedUtils.createRssAccount("rssBodyAs");
  const rssRootFolder = feedAccount.incomingServer.rootFolder;
  FeedUtils.subscribeToFeed(
    "https://example.org/browser/comm/mail/base/test/browser/files/rss.xml?messageBodyAs",
    rssRootFolder,
    null
  );
  await TestUtils.waitForCondition(() => rssRootFolder.subFolders.length == 2);
  rssFeedFolder = rssRootFolder.getChildNamed("Test Feed");

  // Fool Gloda into thinking the user is always idle. This makes it index
  // changes straight away and we don't have to wait ages for it.
  GlodaTestHelper.prepareIndexerForTesting();
  await TestUtils.waitForCondition(
    () => !GlodaIndexer.indexing,
    "waiting for Gloda to finish indexing"
  );

  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, false);
    MailServices.accounts.removeAccount(feedAccount, false);
    document.getElementById("toolbar-menubar").setAttribute("autohide", "true");
  });
});

async function displayMailMessage() {
  about3Pane.displayFolder(testFolder);
  about3Pane.threadTree.selectedIndex = 0;
  await messageLoadedIn(about3Pane.messageBrowser);
}

async function displayFeedMessage(websiteLoad = false) {
  about3Pane.displayFolder(rssFeedFolder);
  about3Pane.threadTree.selectedIndex = 0;
  if (websiteLoad) {
    const browser =
      about3Pane.messageBrowser.contentDocument.getElementById("messagepane");
    const url =
      "https://example.org/browser/comm/mail/base/test/browser/files/sampleContent.html";
    if (
      browser.contentDocument?.readyState != "complete" ||
      browser.currentURI?.spec != url
    ) {
      await BrowserTestUtils.browserLoaded(browser, false, url);
    }
  } else {
    await messageLoadedIn(about3Pane.messageBrowser);
  }
}

function assertAllowHTML() {
  info("Expecting full HTML formatting");
  Assert.ok(!Services.prefs.getBoolPref("mailnews.display.prefer_plaintext"));
  Assert.equal(Services.prefs.getIntPref("mailnews.display.html_as"), 0);
  Assert.equal(
    Services.prefs.getIntPref("mailnews.display.disallow_mime_handlers"),
    0
  );
}

function assertSanitized() {
  info("Expecting sanitized HTML");
  Assert.ok(!Services.prefs.getBoolPref("mailnews.display.prefer_plaintext"));
  Assert.equal(Services.prefs.getIntPref("mailnews.display.html_as"), 3);
  Assert.equal(
    Services.prefs.getIntPref("mailnews.display.disallow_mime_handlers"),
    window.gDisallow_classes_no_html
  );
}

function assertPlaintext() {
  info("Expecting plaintext");
  Assert.ok(Services.prefs.getBoolPref("mailnews.display.prefer_plaintext"));
  Assert.equal(Services.prefs.getIntPref("mailnews.display.html_as"), 1);
  Assert.equal(
    Services.prefs.getIntPref("mailnews.display.disallow_mime_handlers"),
    window.gDisallow_classes_no_html
  );
}

function assertAllParts() {
  info("Expecting all parts");
  Assert.ok(!Services.prefs.getBoolPref("mailnews.display.prefer_plaintext"));
  Assert.equal(Services.prefs.getIntPref("mailnews.display.html_as"), 4);
  Assert.equal(
    Services.prefs.getIntPref("mailnews.display.disallow_mime_handlers"),
    0
  );
}

async function openBodyDisplayModeMenu(
  entryId,
  mainPopupId,
  displayAsMenuId,
  doc = document
) {
  const entryNode = doc.getElementById(entryId);
  if (entryNode.openMenu) {
    entryNode.openMenu(true);
  } else {
    EventUtils.synthesizeMouseAtCenter(entryNode, {}, doc.defaultView);
  }

  await BrowserTestUtils.waitForPopupEvent(
    doc.getElementById(mainPopupId),
    "shown"
  );

  const messageBodyAsMenu = doc.getElementById(displayAsMenuId);
  Assert.ok(
    BrowserTestUtils.isVisible(messageBodyAsMenu),
    `Message body as menu #${displayAsMenuId} available`
  );

  messageBodyAsMenu.openMenu(true);

  await BrowserTestUtils.waitForPopupEvent(
    messageBodyAsMenu.menupopup,
    "shown"
  );
}

async function clickBodyDisplayMode(
  entryId,
  mainPopupId,
  displayAsMenuId,
  modeId,
  expectedModeId,
  doc = document
) {
  await openBodyDisplayModeMenu(entryId, mainPopupId, displayAsMenuId, doc);

  Assert.equal(
    doc.getElementById(expectedModeId).getAttribute("checked"),
    "true",
    `Previous mode ${expectedModeId} should be checked`
  );

  const messageBodyAsMenu = doc.getElementById(displayAsMenuId);
  messageBodyAsMenu.menupopup.activateItem(doc.getElementById(modeId));

  await BrowserTestUtils.waitForPopupEvent(
    messageBodyAsMenu.menupopup,
    "hidden"
  );
  await BrowserTestUtils.waitForPopupEvent(
    doc.getElementById(mainPopupId),
    "hidden"
  );
}

async function subtestCycleThroughMessageBodyAs(
  entryId,
  mainPopupId,
  displayAsMenuId,
  htmlModeId,
  sanitizedModeId,
  plaintextModeId,
  doc = document
) {
  assertAllowHTML();

  await clickBodyDisplayMode(
    entryId,
    mainPopupId,
    displayAsMenuId,
    sanitizedModeId,
    htmlModeId,
    doc
  );

  assertSanitized();

  await clickBodyDisplayMode(
    entryId,
    mainPopupId,
    displayAsMenuId,
    plaintextModeId,
    sanitizedModeId,
    doc
  );

  assertPlaintext();

  await clickBodyDisplayMode(
    entryId,
    mainPopupId,
    displayAsMenuId,
    htmlModeId,
    plaintextModeId,
    doc
  );

  assertAllowHTML();
}

async function subtestFeedBodyAsHiddenForWebsite(
  entryId,
  mainPopupId,
  displayAsMenuId,
  htmlModeId,
  sanitizedModeId,
  plaintextModeId,
  useMessageBrowserDocument = false
) {
  about3Pane.threadTree.selectedIndex = -1; // Clear the displayed message.
  window.FeedMessageHandler.onSelectPref = 0;

  await displayFeedMessage(true);

  const doc = useMessageBrowserDocument
    ? tabmail.currentAboutMessage.document
    : document;

  await openBodyDisplayModeMenu(entryId, mainPopupId, displayAsMenuId, doc);

  Assert.ok(
    BrowserTestUtils.isHidden(doc.getElementById(htmlModeId)),
    "HTML mode not available in webpage view"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(doc.getElementById(sanitizedModeId)),
    "Sanitize mode not available in webpage view"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(doc.getElementById(plaintextModeId)),
    "Plaintext mode not available in webpage view"
  );

  const messageBodyAsMenu = doc.getElementById(displayAsMenuId);
  messageBodyAsMenu.menupopup.hidePopup();
  await BrowserTestUtils.waitForPopupEvent(
    messageBodyAsMenu.menupopup,
    "hidden"
  );
  const mainPopup = doc.getElementById(mainPopupId);
  mainPopup.hidePopup();
  await BrowserTestUtils.waitForPopupEvent(mainPopup, "hidden");

  about3Pane.threadTree.selectedIndex = -1; // Clear the displayed message.
  window.FeedMessageHandler.onSelectPref = 1;
}

add_task(async function test_email_messageHeader() {
  await displayMailMessage();

  const doc = tabmail.currentAboutMessage.document;

  Assert.ok(
    !Services.prefs.getBoolPref("mailnews.display.show_all_body_parts_menu"),
    "Should not request all parts menu"
  );

  await subtestCycleThroughMessageBodyAs(
    "otherActionsButton",
    "otherActionsPopup",
    "otherActionsMessageBodyAs",
    "otherActionsMenu_bodyAllowHTML",
    "otherActionsMenu_bodySanitized",
    "otherActionsMenu_bodyAsPlaintext",
    doc
  );
});

add_task(async function test_email_menubar() {
  await displayMailMessage();

  Assert.ok(
    !Services.prefs.getBoolPref("mailnews.display.show_all_body_parts_menu"),
    "Should not request all parts menu"
  );

  await subtestCycleThroughMessageBodyAs(
    "menu_View",
    "menu_View_Popup",
    "viewBodyMenu",
    "bodyAllowHTML",
    "bodySanitized",
    "bodyAsPlaintext"
  );
}).skip(AppConstants.platform == "macosx"); // Can't click menu bar on Mac.

add_task(async function test_feed_messageHeader() {
  await displayFeedMessage();

  const doc = tabmail.currentAboutMessage.document;

  await subtestCycleThroughMessageBodyAs(
    "otherActionsButton",
    "otherActionsPopup",
    "otherActionsFeedBodyAs",
    "otherActionsMenu_bodyFeedSummaryAllowHTML",
    "otherActionsMenu_bodyFeedSummarySanitized",
    "otherActionsMenu_bodyFeedSummaryAsPlaintext",
    doc
  );
});

add_task(async function test_feed_menubar() {
  await displayFeedMessage();

  await subtestCycleThroughMessageBodyAs(
    "menu_View",
    "menu_View_Popup",
    "viewFeedSummary",
    "bodyFeedSummaryAllowHTML",
    "bodyFeedSummarySanitized",
    "bodyFeedSummaryAsPlaintext"
  );
}).skip(AppConstants.platform == "macosx"); // Can't click menu bar on Mac.

add_task(async function test_feed_webpageNoModeSelect_messageHeader() {
  await subtestFeedBodyAsHiddenForWebsite(
    "otherActionsButton",
    "otherActionsPopup",
    "otherActionsFeedBodyAs",
    "otherActionsMenu_bodyFeedSummaryAllowHTML",
    "otherActionsMenu_bodyFeedSummarySanitized",
    "otherActionsMenu_bodyFeedSummaryAsPlaintext",
    true
  );
});

add_task(async function test_feed_webpageNoModeSelect_menubar() {
  await subtestFeedBodyAsHiddenForWebsite(
    "menu_View",
    "menu_View_Popup",
    "viewFeedSummary",
    "bodyFeedSummaryAllowHTML",
    "bodyFeedSummarySanitized",
    "bodyFeedSummaryAsPlaintext"
  );
}).skip(AppConstants.platform == "macosx"); // Can't click menu bar on Mac.
