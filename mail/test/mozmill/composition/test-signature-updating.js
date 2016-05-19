/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that the signature updates properly when switching identities.
 */

// make SOLO_TEST=composition/test-signature-updating.js mozmill-one

// mail.identity.id1.htmlSigFormat = false
// mail.identity.id1.htmlSigText   = "Tinderbox is soo 90ies"

// mail.identity.id2.htmlSigFormat = true
// mail.identity.id2.htmlSigText   = "Tinderboxpushlog is the new <b>hotness!</b>"

var MODULE_NAME = "test-signature-updating";

var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["folder-display-helpers", "compose-helpers", "window-helpers"];
var elib = {};
Components.utils.import("resource://mozmill/modules/elementslib.js", elib);
Components.utils.import("resource://gre/modules/Services.jsm");

var cwc = null; // compose window controller

var setupModule = function (module) {
  for (let lib of MODULE_REQUIRES) {
    collector.getModule(lib).installInto(module);
  }

  // Ensure we're in the tinderbox account as that has the right identities set
  // up for this test.
  let server = MailServices.accounts.FindServer("tinderbox", FAKE_SERVER_HOSTNAME, "pop3");
  let inbox = server.rootFolder.getChildNamed("Inbox");
  be_in_folder(inbox);
};

function teardownModule(module) {
  Services.prefs.clearUserPref("mail.compose.default_to_paragraph");
  Services.prefs.clearUserPref("mail.identity.id1.compose_html");
  Services.prefs.clearUserPref("mail.identity.id1.suppress_signature_separator");
  Services.prefs.clearUserPref("mail.identity.id2.suppress_signature_separator");
}

/**
 * Test that the plaintext compose window has a signature initially,
 * and has the correct signature after switching to another identity.
 */
function plaintextComposeWindowSwitchSignatures(suppressSigSep) {
  Services.prefs.setBoolPref("mail.identity.id1.compose_html", false);
  Services.prefs.setBoolPref("mail.identity.id1.suppress_signature_separator",
                             suppressSigSep);
  Services.prefs.setBoolPref("mail.identity.id2.suppress_signature_separator",
                             suppressSigSep);
  cwc = open_compose_new_mail();

  let contentFrame = cwc.e("content-frame");
  let mailBody = contentFrame.contentDocument.body;

  // The first node in the body should be a BR node, which allows the user
  // to insert text before / outside of the signature.
  assert_equals(mailBody.firstChild.localName, "br");

  setup_msg_contents(cwc, "", "Plaintext compose window", "Body, first line.");

  let node = mailBody.lastChild;

  // The last node is a BR - this allows users to put text after the
  // signature without it being styled like the signature.
  assert_equals(node.localName, "br");
  node = node.previousSibling;

  // Now we should have the DIV node that contains the signature, with
  // the class moz-signature.
  assert_equals(node.localName, "div");

  const kSeparator = "-- ";
  const kSigClass = "moz-signature";
  assert_equals(node.className, kSigClass);

  let sigNode = node.firstChild;

  if (!suppressSigSep) {
    assert_equals(sigNode.textContent, kSeparator);
    let brNode = sigNode.nextSibling;
    assert_equals(brNode.localName, "br");
    sigNode = brNode.nextSibling;
  }

  let expectedText = "Tinderbox is soo 90ies";
  assert_equals(sigNode.textContent, expectedText);

  // Now switch identities!
  cwc.click_menus_in_sequence(cwc.e("msgIdentityPopup"), [ { identitykey: "id2" } ]);

  node = contentFrame.contentDocument.body.lastChild;

  // The last node is a BR - this allows users to put text after the
  // signature without it being styled like the signature.
  assert_equals(node.localName, "br");
  node = node.previousSibling;

  assert_equals(node.localName, "div");
  assert_equals(node.className, kSigClass);

  sigNode = node.firstChild;

  if (!suppressSigSep) {
    expectedText = "-- ";
    assert_equals(sigNode.textContent, kSeparator);
    let brNode = sigNode.nextSibling;
    assert_equals(brNode.localName, "br");
    sigNode = brNode.nextSibling;
  }

  expectedText = "Tinderboxpushlog is the new *hotness!*";
  assert_equals(sigNode.textContent, expectedText);

  // Now check that the original signature has been removed by ensuring
  // that there's only one node with class moz-signature.
  let sigs = contentFrame.contentDocument.querySelectorAll("." + kSigClass);
  assert_equals(sigs.length, 1);

  // And ensure that the text we wrote wasn't altered
  let bodyFirstChild =  contentFrame.contentDocument.body.firstChild;

  while (node != bodyFirstChild)
    node = node.previousSibling;

  assert_equals(node.nodeValue, "Body, first line.");

  close_compose_window(cwc);
}

function testPlaintextComposeWindowSwitchSignatures() {
  plaintextComposeWindowSwitchSignatures(false);
}

function testPlaintextComposeWindowSwitchSignaturesWithSuppressedSeparator() {
  plaintextComposeWindowSwitchSignatures(true);
}

/**
 * Same test, but with an HTML compose window
 */
function HTMLComposeWindowSwitchSignatures(suppressSigSep, paragraphFormat) {
  Services.prefs.setBoolPref("mail.compose.default_to_paragraph", paragraphFormat);

  Services.prefs.setBoolPref("mail.identity.id1.compose_html", true);
  Services.prefs.setBoolPref("mail.identity.id1.suppress_signature_separator",
                             suppressSigSep);
  Services.prefs.setBoolPref("mail.identity.id2.suppress_signature_separator",
                             suppressSigSep);
  cwc = open_compose_new_mail();

  setup_msg_contents(cwc, "", "HTML compose window", "Body, first line.");

  let contentFrame = cwc.e("content-frame");
  let node = contentFrame.contentDocument.body.lastChild;

  // In html compose, the signature is inside the last node, which has a
  // class="moz-signature".
  assert_equals(node.className, "moz-signature");
  node = node.firstChild; // text node containing the signature divider
  if (suppressSigSep)
    assert_equals(node.nodeValue, "Tinderbox is soo 90ies");
  else
    assert_equals(node.nodeValue, "-- \nTinderbox is soo 90ies");

  // Now switch identities!
  cwc.click_menus_in_sequence(cwc.e("msgIdentityPopup"), [ { identitykey: "id2" } ]);

  node = contentFrame.contentDocument.body.lastChild;

  // In html compose, the signature is inside the last node
  // with class="moz-signature".
  assert_equals(node.className, "moz-signature");
  node = node.firstChild; // text node containing the signature divider
  if (!suppressSigSep) {
    assert_equals(node.nodeValue, "-- ");
    node = node.nextSibling;
    assert_equals(node.localName, "br");
    node = node.nextSibling;
  }
  assert_equals(node.nodeValue, "Tinderboxpushlog is the new ");
  node = node.nextSibling;
  assert_equals(node.localName, "b");
  node = node.firstChild;
  assert_equals(node.nodeValue, "hotness!");

  // Now check that the original signature has been removed,
  // and no blank lines got added!
  node = contentFrame.contentDocument.body.firstChild;
  let textNode;
  if (paragraphFormat) {
    textNode = node.firstChild;
  } else {
    textNode = node;
  }
  assert_equals(textNode.nodeValue, "Body, first line.");
  node = node.nextSibling;
  assert_equals(node.localName, "br");
  node = node.nextSibling;
  // check that the signature is immediately after the message text.
  assert_equals(node.className, "moz-signature");
  // check that that the signature is the last node.
  assert_equals(node, contentFrame.contentDocument.body.lastChild);

  close_compose_window(cwc);
}

function testHTMLComposeWindowSwitchSignatures() {
  HTMLComposeWindowSwitchSignatures(false, false);
}

function testHTMLComposeWindowSwitchSignaturesWithSuppressedSeparator() {
  HTMLComposeWindowSwitchSignatures(true, false);
}

function testHTMLComposeWindowSwitchSignaturesParagraphFormat() {
  HTMLComposeWindowSwitchSignatures(false, true);
}

function testHTMLComposeWindowSwitchSignaturesWithSuppressedSeparatorParagraphFormat() {
  HTMLComposeWindowSwitchSignatures(true, true);
}
