/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that the plain text part of multipart/alternative messages can be correctly viewed.
 */

// mozmake SOLO_TEST=message-window/test-view-plaintext.js mozmill-one

var MODULE_NAME = "test-view-plaintext";

var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["folder-display-helpers", "window-helpers"];

Cu.import("resource://gre/modules/Services.jsm");
var os = {};
Cu.import('resource://mozmill/stdlib/os.js', os);

function setupModule(module) {
  for (let lib of MODULE_REQUIRES) {
    collector.getModule(lib).installInto(module);
  }
}

/**
 * Retrieve the textual content of the message and compare it.
 *
 * @param aWindow         Message window.
 * @param aExpected       Expected content.
 * @param aDontWantToSee  Content of other MIME parts we don't want to see.
 */
function check_content(aWindow, aExpected, aDontWantToSee) {
  let messagePane = aWindow.document.getElementById("messagepane");
  let messageContent = messagePane.contentDocument.firstChild.textContent;

  if (aExpected != aDontWantToSee) {
    assert_true(messageContent.includes(aExpected), "Didn't find expected content");
    assert_false(messageContent.includes(aDontWantToSee),
                 "Found content that shouldn't be there");
  } else {
    let ind = messageContent.indexOf(aExpected);
    assert_true (ind >= 0, "Didn't find expected content");
    if (ind >= 0)
      assert_false(messageContent.substr(ind+aExpected.length).includes(aExpected),
                   "Found content a second time");
  }
}

/**
 * Load a message from a file and display it as plain text and HTML. Check that the
 * correct MIME part is displayed.
 *
 * @param aFilePath            Path to the file containing the message to load and display.
 * @param aExpectedPlainText   Expected content when viewed as plain text.
 * @param aExpectedHTML        Expected content when viewed as HTML.
 */
function checkSingleMessage(aFilePath, aExpectedPlainText, aExpectedHTML) {
  let file = os.getFileForPath(os.abspath(aFilePath,
                               os.getFileForPath(__file__)));

  // Load and display as plain text.
  Services.prefs.setBoolPref("mailnews.display.prefer_plaintext", true);
  Services.prefs.setIntPref("mailnews.display.html_as", 1);
  let msgc = open_message_from_file(file);
  check_content(msgc.window, aExpectedPlainText, aExpectedHTML);
  close_window(msgc);

  // Load and display as HTML.
  Services.prefs.setBoolPref("mailnews.display.prefer_plaintext", false);
  Services.prefs.setIntPref("mailnews.display.html_as", 0);
  msgc = open_message_from_file(file);
  check_content(msgc.window, aExpectedHTML, aExpectedPlainText);
  close_window(msgc);
}

/**
 * Tests that messages with various MIME parts are shown correctly when displayed
 * as plain text or HTML.
 */
function test_view() {
  // First the straight forward tests:
  // 1) multipart/alternative
  // 2) multipart/alternative with embedded multipart/related
  // 3) multipart/alternative with embedded multipart/related embedded in multipart/mixed
  checkSingleMessage("./test-alt.eml",                     "Plain Text", "HTML Body");
  checkSingleMessage("./test-alt-rel.eml",                 "Plain Text", "HTML Body");
  checkSingleMessage("./test-alt-rel-with-attach.eml",     "Plain Text", "HTML Body");

  // 4) HTML part missing
  // 5) Plain part missing
  checkSingleMessage("./test-alt-HTML-missing.eml",        "Plain Text", "Plain Text");
  checkSingleMessage("./test-alt-plain-missing.eml",       "HTML Body",  "HTML Body");

  // 6) plain and HTML parts reversed in order
  checkSingleMessage("./test-alt-plain-HTML-reversed.eml", "Plain Text", "HTML Body");

  // 7) 3 alt. parts with 2 plain and 1 HTML part
  checkSingleMessage("./test-triple-alt.eml",              "Plain Text", "HTML Body");

  // 8) 3 alt. parts with 2 plain and 1 multipart/related
  checkSingleMessage("./test-alt-rel-text.eml",            "Plain Text", "HTML Body");

  // Now some cases that don't work yet.
  // 9) multipart/related with embedded multipart/alternative
  checkSingleMessage("./test-rel-alt.eml",                 "HTML Body",  "HTML Body");

  // Bug 1367156: Rogue message which has an image as the last part.
  checkSingleMessage("./test-alt-rogue.eml",               "Plain Text", "HTML Body");
  checkSingleMessage("./test-alt-rogue2.eml",              "Plain Text", "HTML Body");
}

function teardownModule() {
  Services.prefs.clearUserPref("mailnews.display.prefer_plaintext");
  Services.prefs.clearUserPref("mailnews.display.html_as");
}
