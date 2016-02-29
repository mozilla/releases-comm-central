/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that UTF-8 messages are correctly forwarded.
 */

// mozmake SOLO_TEST=composition/test-forward-utf8.js mozmill-one

var MODULE_NAME = "test-forward-utf8";

var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["folder-display-helpers", "compose-helpers", "window-helpers"];

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource:///modules/mailServices.js");
var elib = {};
Cu.import('resource://mozmill/modules/elementslib.js', elib);
var os = {};
Cu.import('resource://mozmill/stdlib/os.js', os);

var folderToSendFrom;

function setupModule(module) {
  for (let lib of MODULE_REQUIRES) {
    collector.getModule(lib).installInto(module);
  }

  folderToSendFrom = create_folder("FolderWithUTF8");
}

function check_content(window) {
  let mailBody = get_compose_body(window);

  let node = mailBody.firstChild;
  while (node) {
    if (node.classList.contains("moz-forward-container")) {
      // We found the forward container. Let's look for our text.
      node = node.firstChild;
      while (node) {
        // We won't find the exact text in the DOM but we'll find our string.
        if (node.nodeName == "#text" && node.nodeValue.includes("áóúäöüß")) {
          return;
        }
        node = node.nextSibling;
      }
      // Text not found in the forward container.
      assert_true(false, "Failed to find forwarded text");
      return;
    }
    node = node.nextSibling;
  }

  assert_true(false, "Failed to find forward container");
}

function forwardDirect(aFilePath) {
  let file = os.getFileForPath(os.abspath(aFilePath,
                               os.getFileForPath(__file__)));
  let msgc = open_message_from_file(file);

  let cwc = open_compose_with_forward(msgc);

  check_content(cwc);

  close_compose_window(cwc);
  close_window(msgc);
}

function forwardViaFolder(aFilePath) {
  be_in_folder(folderToSendFrom);

  let file = os.getFileForPath(os.abspath(aFilePath,
                               os.getFileForPath(__file__)));
  let msgc = open_message_from_file(file);

  // Copy the message to a folder.
  let documentChild = msgc.e("messagepane").contentDocument.firstChild;
  msgc.rightClick(new elib.Elem(documentChild));
  msgc.click_menus_in_sequence(msgc.e("mailContext"), [
    {id: "mailContext-copyMenu"},
    {label: "Local Folders"},
    {label: "FolderWithUTF8"},
  ]);
  close_window(msgc);

  let msg = select_click_row(0);
  assert_selected_and_displayed(mc, msg);

  let fwdWin = open_compose_with_forward();

  check_content(fwdWin);

  close_compose_window(fwdWin);

  press_delete(mc);
}

function test_utf8_forwarding_from_opened_file() {
  forwardDirect("./content-utf8-rel-only.eml");
  forwardDirect("./content-utf8-rel-alt.eml");
  forwardDirect("./content-utf8-alt-rel.eml");
}

function test_utf8_forwarding_from_via_folder() {
  forwardViaFolder("./content-utf8-rel-only.eml");
  forwardViaFolder("./content-utf8-rel-alt.eml");
  forwardViaFolder("./content-utf8-alt-rel.eml");
}

function teardownModule() {
}
