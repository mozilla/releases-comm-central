/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * The purpose of this test is to ensure that dns prefetch is turned off in
 * the message pane and compose windows. It also checks that dns prefetch is
 * currently turned off in content tabs, although when bug 545407 is fixed, it
 * should be turned back on again.
 */

"use strict";

var {
  close_compose_window,
  open_compose_new_mail,
  open_compose_with_forward,
  open_compose_with_reply,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/ComposeHelpers.sys.mjs"
);
var { open_content_tab_with_url } = ChromeUtils.importESModule(
  "resource://testing-common/mail/ContentTabHelpers.sys.mjs"
);
var {
  assert_nothing_selected,
  assert_selected_and_displayed,
  be_in_folder,
  create_folder,
  get_about_3pane,
  get_about_message,
  open_selected_message_in_new_window,
  select_click_row,
  select_shift_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);

var folder = null;
var gMsgNo = 0;
var gMsgHdr = null;

// These two constants are used to build the message body.
var msgBody =
  '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN">\n' +
  "<html>\n" +
  "<head>\n" +
  "\n" +
  '<meta http-equiv="content-type" content="text/html; charset=ISO-8859-1">\n' +
  "</head>\n" +
  '<body bgcolor="#ffffff" text="#000000">\n' +
  "dns prefetch test message\n" +
  "</body>\n</html>\n";

add_setup(async function () {
  folder = await create_folder("dnsPrefetch");
});

function addToFolder(aSubject, aBody, aFolder) {
  const msgId = Services.uuid.generateUUID() + "@mozillamessaging.invalid";

  const source =
    "X-Mozilla-Status: 0001\n" +
    "X-Mozilla-Status2: 00000000\n" +
    "Message-ID: <" +
    msgId +
    ">\n" +
    "Date: Wed, 11 Jun 2008 20:32:02 -0400\n" +
    "From: Tester <tests@mozillamessaging.invalid>\n" +
    "User-Agent: Thunderbird 3.0a2pre (Macintosh/2008052122)\n" +
    "MIME-Version: 1.0\n" +
    "To: recipient@mozillamessaging.invalid\n" +
    "Subject: " +
    aSubject +
    "\n" +
    "Content-Type: text/html; charset=ISO-8859-1\n" +
    "Content-Transfer-Encoding: 7bit\n" +
    "\n" +
    aBody +
    "\n";

  aFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  aFolder.gettingNewMessages = true;

  aFolder.addMessage(source);
  aFolder.gettingNewMessages = false;

  return aFolder.msgDatabase.getMsgHdrForMessageID(msgId);
}

async function addMsgToFolder(targetFolder) {
  const msgDbHdr = addToFolder(
    "exposed test message " + gMsgNo,
    msgBody,
    targetFolder
  );

  // select the newly created message
  gMsgHdr = await select_click_row(gMsgNo);

  Assert.equal(
    msgDbHdr,
    gMsgHdr,
    "Should have selected the same message header as the generated header"
  );

  await assert_selected_and_displayed(gMsgNo);

  return gMsgNo++;
}

/**
 * Check remote content in a compose window.
 *
 * @param test        The test from TESTS that is being performed.
 * @param replyType   The type of the compose window, 0 = normal compose,
 *                    1 = reply, 2 = forward.
 * @param loadAllowed Whether or not the load is expected to be allowed.
 */
async function checkComposeWindow(replyType) {
  let errMsg = "";
  let replyWindow = null;
  switch (replyType) {
    case 0:
      replyWindow = await open_compose_new_mail();
      errMsg = "new mail";
      break;
    case 1:
      replyWindow = await open_compose_with_reply();
      errMsg = "reply";
      break;
    case 2:
      replyWindow = await open_compose_with_forward();
      errMsg = "forward";
      break;
  }

  // Check the prefetch in the compose window.
  Assert.ok(
    !replyWindow.document.getElementById("messageEditor").docShell
      .allowDNSPrefetch,
    `Should have disabled DNS prefetch in the compose window (${errMsg})`
  );

  await close_compose_window(replyWindow);
}

add_task(async function test_dnsPrefetch_message() {
  // Now we have started up, simply check that DNS prefetch is disabled
  const aboutMessage = get_about_message();
  Assert.ok(
    !aboutMessage.document.getElementById("messagepane").docShell
      .allowDNSPrefetch,
    "messagepane should have disabled DNS prefetch at startup"
  );
  const about3Pane = get_about_3pane();
  Assert.ok(
    !about3Pane.document.getElementById("multiMessageBrowser").docShell
      .allowDNSPrefetch.allowDNSPrefetch,
    "multimessagepane should have disabled DNS prefetch at startup"
  );

  await be_in_folder(folder);

  await assert_nothing_selected();

  const firstMsg = await addMsgToFolder(folder);

  // Now we've got a message selected, check again.
  Assert.ok(
    !aboutMessage.document.getElementById("messagepane").docShell
      .allowDNSPrefetch,
    "Should keep DNS Prefetch disabled on messagepane after selecting message"
  );

  const secondMsg = await addMsgToFolder(folder);
  await select_shift_click_row(firstMsg);
  await assert_selected_and_displayed(firstMsg, secondMsg);

  Assert.ok(
    !about3Pane.document.getElementById("multiMessageBrowser").docShell
      .allowDNSPrefetch,
    "Should keep DNS Prefetch disabled on multimessage after selecting message"
  );

  await select_shift_click_row(secondMsg);
});

add_task(async function test_dnsPrefetch_standaloneMessage() {
  const msgc = await open_selected_message_in_new_window();
  await assert_selected_and_displayed(msgc, gMsgHdr);

  // Check the docshell.
  const aboutMessage = get_about_message(msgc);
  Assert.ok(
    !aboutMessage.document.getElementById("messagepane").docShell
      .allowDNSPrefetch,
    "Should disable DNS Prefetch on messagepane in standalone message window."
  );

  await BrowserTestUtils.closeWindow(msgc);
});

add_task(async function test_dnsPrefetch_compose() {
  await checkComposeWindow(0);
  await checkComposeWindow(1);
  await checkComposeWindow(2);
});

add_task(async function test_dnsPrefetch_contentTab() {
  // To open a tab we're going to have to cheat and use tabmail so we can load
  // in the data of what we want.
  const tabmail = document.getElementById("tabmail");
  const preCount = tabmail.tabContainer.allTabs.length;

  const dataurl =
    "data:text/html,<html><head><title>test dns prefetch</title>" +
    "</head><body>test dns prefetch</body></html>";

  const newTab = await open_content_tab_with_url(dataurl);

  await SpecialPowers.spawn(tabmail.getBrowserForSelectedTab(), [], () => {
    Assert.ok(docShell, "docShell should be available");
    Assert.ok(docShell.allowDNSPrefetch, "allowDNSPrefetch should be enabled");
  });

  tabmail.closeTab(newTab);

  if (tabmail.tabContainer.allTabs.length != preCount) {
    throw new Error("The content tab didn't close");
  }

  Assert.report(
    false,
    undefined,
    undefined,
    "Test ran to completion successfully"
  );
});
