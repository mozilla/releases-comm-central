/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests whether JavaScript in a local/remote message works.
 *
 * @note This assumes an existing local account, and will cause the Trash
 * folder of that account to be emptied multiple times.
 */

// make SOLO_TEST=content-policy/test-js-content-policy.js mozmill-one

var MODULE_NAME = 'test-js-content-policy';

var RELATIVE_ROOT = '../shared-modules';
var MODULE_REQUIRES = ['folder-display-helpers', 'window-helpers'];

var folder = null;

// RELATIVE_ROOT messes with the collector, so we have to bring the path back
// so we get the right path for the resources.
var url = collector.addHttpResource('../content-policy/html', 'content');

function setupModule(module) {
  for (let lib of MODULE_REQUIRES) {
    collector.getModule(lib).installInto(module);
  }

  folder = create_folder("jsContentPolicy");
  Services.prefs.setBoolPref("javascript.enabled", true);
};

function teardownModule(module) {
  Services.prefs.clearUserPref("javascript.enabled");
}

function addToFolder(aSubject, aBody, aFolder) {

  let msgId = Components.classes["@mozilla.org/uuid-generator;1"]
                          .getService(Components.interfaces.nsIUUIDGenerator)
                          .generateUUID() +"@mozillamessaging.invalid";

  let source = "From - Sat Nov  1 12:39:54 2008\n" +
               "X-Mozilla-Status: 0001\n" +
               "X-Mozilla-Status2: 00000000\n" +
               "Message-ID: <" + msgId + ">\n" +
               "Date: Wed, 11 Jun 2008 20:32:02 -0400\n" +
               "From: Tester <tests@mozillamessaging.invalid>\n" +
               "User-Agent: Thunderbird 3.0a2pre (Macintosh/2008052122)\n" +
               "MIME-Version: 1.0\n" +
               "To: recipient@mozillamessaging.invalid\n" +
               "Subject: " + aSubject + "\n" +
               "Content-Type: text/html; charset=ISO-8859-1\n" +
               "Content-Transfer-Encoding: 7bit\n" +
               "Content-Base: " + url + "remote-noscript.html\n" +
               "\n" + aBody + "\n";

  aFolder.QueryInterface(Components.interfaces.nsIMsgLocalMailFolder);
  aFolder.gettingNewMessages = true;

  aFolder.addMessage(source);
  aFolder.gettingNewMessages = false;

  return aFolder.msgDatabase.getMsgHdrForMessageID(msgId);
}

var jsMsgBody = '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN">\n' +
'<html>\n' +
'<head>\n' +
'\n' +
'<meta http-equiv="content-type" content="text/html; charset=ISO-8859-1">\n' +
'</head>\n' +
'<body bgcolor="#ffffff" text="#000000">\n' +
'this is a test<big><big><big> stuff\n' +
'<br><br>\n' +
'</big></big></big>\n' +
'<noscript>\n'+
'hello, this content is noscript!\n' +
'</noscript>\n' +
'<script>\n'+
'var jsIsTurnedOn = true;\n' +
'</script>\n' +
'\n' +
'</body>\n' +
'</html>\n';

var gMsgNo = 0;

function checkJsInMail() {
  let msgDbHdr = addToFolder("JS test message " + gMsgNo, jsMsgBody, folder);

  // select the newly created message
  let msgHdr = select_click_row(gMsgNo);

  if (msgDbHdr != msgHdr)
    throw new Error("Selected Message Header is not the same as generated header");

  assert_selected_and_displayed(gMsgNo);

  let mc = mozmill.getMail3PaneController();
  // This works because messagepane is type=content-primary in these tests.
  if (typeof mc.window.content.wrappedJSObject.jsIsTurnedOn != 'undefined')
    throw new Error("JS is turned on in mail - it shouldn't be.");

  let noscript = mc.window.content.wrappedJSObject.document
                   .getElementsByTagName("noscript")[0];
  let display = mc.window.getComputedStyle(noscript).getPropertyValue("display");
  if (display != "inline")
    throw new Error("noscript display should be 'inline'; display=" + display);

  ++gMsgNo;
}

function checkJsInNonMessageContent() {
  // Deselect everything so we can load our content
  select_none();

  let mc = mozmill.getMail3PaneController();

  // load something non-message-like in the message pane
  mc.window.GetMessagePaneFrame().location.href =
    "data:text/html;charset=utf-8,<script>var jsIsTurnedOn%3Dtrue%3B<%2Fscript>bar"+
                                  "<noscript><p id='noscript-p'>hey this is noscript</p>";

  wait_for_message_display_completion();

  if (!mc.window.content.wrappedJSObject.jsIsTurnedOn)
    throw new Error("JS is not turned on in content - it should be.");

  let noscript = mc.window.content.wrappedJSObject.document
                   .getElementsByTagName("noscript")[0];
  let display = mc.window.getComputedStyle(noscript).getPropertyValue("display");
  if (display != "none")
    throw new Error("noscript display should be 'none'; display=" + display);
}

/**
 * Check JavaScript for a feed message, when the "View as Web Page" pref is set.
 */
function checkJsInFeedContent() {
  let msgDbHdr = addToFolder("JS test message " + gMsgNo + " (feed!)", jsMsgBody, folder);
  msgDbHdr.OrFlags(Ci.nsMsgMessageFlags.FeedMsg);

  // Set to "View as Web Page" so we get the Content-Base page shown.
  Services.prefs.setIntPref("rss.show.summary", 0);

  // select the newly created message
  let msgHdr = select_click_row(gMsgNo);
  assert_equals(msgDbHdr, msgHdr,
                "Selected Message Header is not the same as generated header");

  wait_for_message_display_completion();

  // The above just ensures local "inline" content have loaded. We need to wait
  // for the remote content to load too before we check anything.
  let mc = mozmill.getMail3PaneController();
  let feedUrl = url + "remote-noscript.html";
  mc.waitFor(() => mc.window.content.wrappedJSObject.location.href == feedUrl &&
                   mc.window.content.wrappedJSObject.document &&
                   mc.window.content.wrappedJSObject.document.querySelector("body") != null,
             "Timeout waiting for remote feed doc to load; url=" + mc.window.content.wrappedJSObject.location);

  if (!mc.window.content.wrappedJSObject.jsIsTurnedOn)
    throw new Error("JS is turned off for remote feed content - it should be on.");

  let noscript = mc.window.content.wrappedJSObject.document
                   .getElementsByTagName("noscript")[0];
  let display = mc.window.getComputedStyle(noscript).getPropertyValue("display");
  if (display != "none")
    throw new Error("noscript display should be 'none'; display=" + display);

  ++gMsgNo;

  Services.prefs.clearUserPref("rss.show.summary");
}

/**
 * Check JavaScript for a feed message viewed in a tab, when the
 * "View as Web Page" pref is set.
 */
function checkJsInFeedTab() {
  let msgDbHdr = addToFolder("JS test message " + gMsgNo + " (feed!)",
                             jsMsgBody, folder);
  msgDbHdr.OrFlags(Ci.nsMsgMessageFlags.FeedMsg);

  // Set to "View as Web Page" so we get the Content-Base page shown.
  Services.prefs.setIntPref("rss.show.summary", 0);

  // Select the newly created message.
  let msgHdr = select_click_row(gMsgNo);
  assert_equals(msgDbHdr, msgHdr,
                "Selected Message Header is not the same as generated header");

  wait_for_message_display_completion();

  let feedUrl = url + "remote-noscript.html";

  open_selected_message_in_new_tab();

  // The above just ensures local "inline" content have loaded. We need to wait
  // for the remote content to load too before we check anything.
  mc.waitFor(() => mc.window.content.wrappedJSObject.location.href == feedUrl &&
                   mc.window.content.wrappedJSObject.document &&
                   mc.window.content.wrappedJSObject.document.querySelector("body") != null,
             "Timeout waiting for remote feed doc to load; url=" +
              mc.window.content.wrappedJSObject.location);

  if (!mc.window.content.wrappedJSObject.jsIsTurnedOn)
    throw new Error("JS is turned off for remote feed content - it should be on.");

  let noscript = mc.window.content.wrappedJSObject.document
                   .getElementsByTagName("noscript")[0];
  let display = mc.window.getComputedStyle(noscript).getPropertyValue("display");
  if (display != "none")
    throw new Error("noscript display should be 'none'; display=" + display);

  ++gMsgNo;

  Services.prefs.clearUserPref("rss.show.summary");
  close_tab();
}

/**
 * Check JavaScript when loading remote content in the message pane.
 */
function checkJsInRemoteContent() {
  // Deselect everything so we can load our content
  select_none();

  let mc = mozmill.getMail3PaneController();
  // load something non-message-like in the message pane
  mc.window.GetMessagePaneFrame().location.href = url + "remote-noscript.html";
  wait_for_message_display_completion();

  if (!mc.window.content.wrappedJSObject.jsIsTurnedOn)
    throw new Error("JS is not turned on in content - it should be.");

  let noscript = mc.window.content.wrappedJSObject.document
                   .getElementsByTagName("noscript")[0];
  let display = mc.window.getComputedStyle(noscript).getPropertyValue("display");
  if (display != "none")
    throw new Error("noscript display should be 'none'; display=" + display);
}

function test_jsContentPolicy() {
  let folderTab = mc.tabmail.currentTabInfo;
  be_in_folder(folder);

  assert_nothing_selected();

  // run each test twice to ensure that there aren't any weird side effects,
  // given that these loads all happen in the same docshell

  checkJsInMail();
  checkJsInNonMessageContent();

  checkJsInMail();
  checkJsInNonMessageContent();

  checkJsInFeedContent();
  checkJsInRemoteContent();
  checkJsInFeedTab();

}
