/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Checks if plugins are enabled in messages correctly or not.
 * As of bug 1508942, plugins are no longer enabled in any context.
 */

"use strict";

var { open_content_tab_with_url } = ChromeUtils.import(
  "resource://testing-common/mozmill/ContentTabHelpers.jsm"
);

var {
  assert_nothing_selected,
  assert_selected_and_displayed,
  be_in_folder,
  create_folder,
  get_about_message,
  open_selected_message,
  select_click_row,
  select_none,
  set_open_message_behavior,
  wait_for_message_display_completion,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { promise_new_window } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

var { MailE10SUtils } = ChromeUtils.import(
  "resource:///modules/MailE10SUtils.jsm"
);

var folder = null;
var gMsgNo = 0;

var url =
  "http://mochi.test:8888/browser/comm/mail/test/browser/content-policy/html/";

// These two constants are used to build the message body.
var msgBody =
  '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN">\n' +
  "<html>\n" +
  "<head>\n" +
  "\n" +
  '<meta http-equiv="content-type" content="text/html; charset=ISO-8859-1">\n' +
  "</head>\n" +
  '<body bgcolor="#ffffff" text="#000000">\n' +
  '<embed id="testelement" type="application/x-test" width="400" height="400" border="1"></embed>\n' +
  "</body>\n</html>\n";

add_setup(async function () {
  folder = await create_folder("pluginPolicy");
});

function addToFolder(aSubject, aBody, aFolder) {
  const msgId = Services.uuid.generateUUID() + "@mozillamessaging.invalid";

  const source =
    "From - Sat Nov  1 12:39:54 2008\n" +
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

function isPluginLoaded(browser) {
  return SpecialPowers.spawn(browser, [], () => {
    const element = content.document.getElementById("testelement");

    try {
      // if setColor throws, then the plugin isn't running
      element.setColor("FFFF0000");
      return true;
    } catch (ex) {
      // Any errors and we'll just return false below - they may be expected.
    }
    return false;
  });
}

async function addMsgToFolderAndCheckContent(loadAllowed) {
  const msgDbHdr = addToFolder(
    "Plugin test message " + gMsgNo,
    msgBody,
    folder
  );

  // select the newly created message
  const msgHdr = await select_click_row(gMsgNo);

  if (msgDbHdr != msgHdr) {
    throw new Error(
      "Selected Message Header is not the same as generated header"
    );
  }

  await assert_selected_and_displayed(gMsgNo);

  ++gMsgNo;

  // XXX It appears the assert_selected_and_displayed doesn't actually wait
  // long enough for plugin load. However, I also can't find a way to wait for
  // long enough in all situations, so this will have to do for now.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Now check that the content hasn't been loaded
  if (
    (await isPluginLoaded(
      get_about_message().document.getElementById("messagepane")
    )) != loadAllowed
  ) {
    throw new Error(
      loadAllowed
        ? "Plugin has been unexpectedly blocked in message content"
        : "Plugin has not been blocked in message as expected"
    );
  }
}

async function checkStandaloneMessageWindow(loadAllowed) {
  const newWindowPromise = promise_new_window("mail:messageWindow");
  // Open it
  set_open_message_behavior("NEW_WINDOW");

  open_selected_message();
  const msgc = await newWindowPromise;
  await wait_for_message_display_completion(msgc, true);

  // XXX It appears the wait_for_message_display_completion doesn't actually
  // wait long enough for plugin load. However, I also can't find a way to wait
  // for long enough in all situations, so this will have to do for now.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 1000));

  const aboutMessage = get_about_message(msgc);
  if (
    (await isPluginLoaded(
      aboutMessage.document.getElementById("messagepane")
    )) != loadAllowed
  ) {
    throw new Error(
      loadAllowed
        ? "Plugin has been unexpectedly blocked in standalone window"
        : "Plugin has not been blocked in standalone window as expected"
    );
  }

  // Clean up, close the window
  await BrowserTestUtils.closeWindow(msgc);
}

add_task(async function test_3paneWindowDenied() {
  await be_in_folder(folder);

  await assert_nothing_selected();

  await addMsgToFolderAndCheckContent(false);
});

add_task(async function test_checkPluginsInNonMessageContent() {
  // Deselect everything so we can load our content
  await select_none();

  // load something non-message-like in the message pane
  const browser = get_about_message().document.getElementById("messagepane");
  MailE10SUtils.loadURI(browser, url + "plugin.html");
  await BrowserTestUtils.browserLoaded(browser);

  if (await isPluginLoaded(browser)) {
    throw new Error(
      "Plugin is turned on in content in message pane - it should not be."
    );
  }
});

add_task(async function test_3paneWindowDeniedAgain() {
  await select_click_row(0);

  await assert_selected_and_displayed(0);

  const browser = get_about_message().document.getElementById("messagepane");
  // Now check that the content hasn't been loaded
  if (await isPluginLoaded(browser)) {
    throw new Error("Plugin has not been blocked in message as expected");
  }
});

add_task(async function test_checkStandaloneMessageWindowDenied() {
  await checkStandaloneMessageWindow(false);
});

add_task(async function test_checkContentTab() {
  // To open a tab we're going to have to cheat and use tabmail so we can load
  // in the data of what we want.
  const preCount =
    document.getElementById("tabmail").tabContainer.allTabs.length;

  const newTab = await open_content_tab_with_url(url + "plugin.html");

  if (await isPluginLoaded(newTab.browser)) {
    throw new Error("Plugin has been unexpectedly not blocked in content tab");
  }

  document.getElementById("tabmail").closeTab(newTab);

  if (
    document.getElementById("tabmail").tabContainer.allTabs.length != preCount
  ) {
    throw new Error("The content tab didn't close");
  }

  Assert.report(
    false,
    undefined,
    undefined,
    "Test ran to completion successfully"
  );
});
