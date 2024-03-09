/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that the signature updates properly when switching identities.
 */

// mail.identity.id1.htmlSigFormat = false
// mail.identity.id1.htmlSigText   = "Tinderbox is soo 90ies"

// mail.identity.id2.htmlSigFormat = true
// mail.identity.id2.htmlSigText   = "Tinderboxpushlog is the new <b>hotness!</b>"

"use strict";

var { close_compose_window, open_compose_new_mail, setup_msg_contents } =
  ChromeUtils.importESModule(
    "resource://testing-common/mozmill/ComposeHelpers.sys.mjs"
  );
var { be_in_folder, FAKE_SERVER_HOSTNAME, get_special_folder } =
  ChromeUtils.importESModule(
    "resource://testing-common/mozmill/FolderDisplayHelpers.sys.mjs"
  );

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

add_setup(async function () {
  requestLongerTimeout(2);

  // These prefs can't be set in the manifest as they contain white-space.
  Services.prefs.setStringPref(
    "mail.identity.id1.htmlSigText",
    "Tinderbox is soo 90ies"
  );
  Services.prefs.setStringPref(
    "mail.identity.id2.htmlSigText",
    "Tinderboxpushlog is the new <b>hotness!</b>"
  );

  // Ensure we're in the tinderbox account as that has the right identities set
  // up for this test.
  const server = MailServices.accounts.findServer(
    "tinderbox",
    FAKE_SERVER_HOSTNAME,
    "pop3"
  );
  const inbox = await get_special_folder(
    Ci.nsMsgFolderFlags.Inbox,
    false,
    server
  );
  await be_in_folder(inbox);
});

registerCleanupFunction(function () {
  Services.prefs.clearUserPref("mail.compose.default_to_paragraph");
  Services.prefs.clearUserPref("mail.identity.id1.compose_html");
  Services.prefs.clearUserPref("mail.identity.id1.htmlSigText");
  Services.prefs.clearUserPref("mail.identity.id2.htmlSigText");
  Services.prefs.clearUserPref(
    "mail.identity.id1.suppress_signature_separator"
  );
  Services.prefs.clearUserPref(
    "mail.identity.id2.suppress_signature_separator"
  );
});

/**
 * Test that the plaintext compose window has a signature initially,
 * and has the correct signature after switching to another identity.
 */
async function plaintextComposeWindowSwitchSignatures(suppressSigSep) {
  Services.prefs.setBoolPref("mail.identity.id1.compose_html", false);
  Services.prefs.setBoolPref(
    "mail.identity.id1.suppress_signature_separator",
    suppressSigSep
  );
  Services.prefs.setBoolPref(
    "mail.identity.id2.suppress_signature_separator",
    suppressSigSep
  );
  const cwc = await open_compose_new_mail();

  const contentFrame = cwc.document.getElementById("messageEditor");
  const mailBody = contentFrame.contentDocument.body;

  // The first node in the body should be a BR node, which allows the user
  // to insert text before / outside of the signature.
  Assert.equal(mailBody.firstChild.localName, "br");

  await setup_msg_contents(
    cwc,
    "",
    "Plaintext compose window",
    "Body, first line."
  );

  let node = mailBody.lastChild;

  // The last node is a BR - this allows users to put text after the
  // signature without it being styled like the signature.
  Assert.equal(node.localName, "br");
  node = node.previousSibling;

  // Now we should have the DIV node that contains the signature, with
  // the class moz-signature.
  Assert.equal(node.localName, "div");

  const kSeparator = "-- ";
  const kSigClass = "moz-signature";
  Assert.equal(node.className, kSigClass);

  let sigNode = node.firstChild;

  if (!suppressSigSep) {
    Assert.equal(sigNode.textContent, kSeparator);
    const brNode = sigNode.nextSibling;
    Assert.equal(brNode.localName, "br");
    sigNode = brNode.nextSibling;
  }

  let expectedText = "Tinderbox is soo 90ies";
  Assert.equal(sigNode.textContent, expectedText);

  // Now switch identities!
  await chooseIdentity(cwc, "id2");

  node = contentFrame.contentDocument.body.lastChild;

  // The last node is a BR - this allows users to put text after the
  // signature without it being styled like the signature.
  Assert.equal(node.localName, "br");
  node = node.previousSibling;

  Assert.equal(node.localName, "div");
  Assert.equal(node.className, kSigClass);

  sigNode = node.firstChild;

  if (!suppressSigSep) {
    expectedText = "-- ";
    Assert.equal(sigNode.textContent, kSeparator);
    const brNode = sigNode.nextSibling;
    Assert.equal(brNode.localName, "br");
    sigNode = brNode.nextSibling;
  }

  expectedText = "Tinderboxpushlog is the new *hotness!*";
  Assert.equal(sigNode.textContent, expectedText);

  // Now check that the original signature has been removed by ensuring
  // that there's only one node with class moz-signature.
  const sigs = contentFrame.contentDocument.querySelectorAll("." + kSigClass);
  Assert.equal(sigs.length, 1);

  // And ensure that the text we wrote wasn't altered
  const bodyFirstChild = contentFrame.contentDocument.body.firstChild;

  while (node != bodyFirstChild) {
    node = node.previousSibling;
  }

  Assert.equal(node.nodeValue, "Body, first line.");

  await close_compose_window(cwc);
}

add_task(async function testPlaintextComposeWindowSwitchSignatures() {
  await plaintextComposeWindowSwitchSignatures(false);
});

add_task(
  async function testPlaintextComposeWindowSwitchSignaturesWithSuppressedSeparator() {
    await plaintextComposeWindowSwitchSignatures(true);
  }
);

/**
 * Same test, but with an HTML compose window
 */
async function HTMLComposeWindowSwitchSignatures(
  suppressSigSep,
  paragraphFormat
) {
  Services.prefs.setBoolPref(
    "mail.compose.default_to_paragraph",
    paragraphFormat
  );

  Services.prefs.setBoolPref("mail.identity.id1.compose_html", true);
  Services.prefs.setBoolPref(
    "mail.identity.id1.suppress_signature_separator",
    suppressSigSep
  );
  Services.prefs.setBoolPref(
    "mail.identity.id2.suppress_signature_separator",
    suppressSigSep
  );
  const cwc = await open_compose_new_mail();

  await setup_msg_contents(cwc, "", "HTML compose window", "Body, first line.");

  const contentFrame = cwc.document.getElementById("messageEditor");
  let node = contentFrame.contentDocument.body.lastChild;

  // In html compose, the signature is inside the last node, which has a
  // class="moz-signature".
  Assert.equal(node.className, "moz-signature");
  node = node.firstChild; // text node containing the signature divider
  if (suppressSigSep) {
    Assert.equal(node.nodeValue, "Tinderbox is soo 90ies");
  } else {
    Assert.equal(node.nodeValue, "-- \nTinderbox is soo 90ies");
  }

  // Now switch identities!
  await chooseIdentity(cwc, "id2");

  node = contentFrame.contentDocument.body.lastChild;

  // In html compose, the signature is inside the last node
  // with class="moz-signature".
  Assert.equal(node.className, "moz-signature");
  node = node.firstChild; // text node containing the signature divider
  if (!suppressSigSep) {
    Assert.equal(node.nodeValue, "-- ");
    node = node.nextSibling;
    Assert.equal(node.localName, "br");
    node = node.nextSibling;
  }
  Assert.equal(node.nodeValue, "Tinderboxpushlog is the new ");
  node = node.nextSibling;
  Assert.equal(node.localName, "b");
  node = node.firstChild;
  Assert.equal(node.nodeValue, "hotness!");

  // Now check that the original signature has been removed,
  // and no blank lines got added!
  node = contentFrame.contentDocument.body.firstChild;
  let textNode;
  if (paragraphFormat) {
    textNode = node.firstChild;
  } else {
    textNode = node;
  }
  Assert.equal(textNode.nodeValue, "Body, first line.");
  if (!paragraphFormat) {
    node = node.nextSibling;
    Assert.equal(node.localName, "br");
  }
  node = node.nextSibling;
  // check that the signature is immediately after the message text.
  Assert.equal(node.className, "moz-signature");
  // check that that the signature is the last node.
  Assert.equal(node, contentFrame.contentDocument.body.lastChild);

  await close_compose_window(cwc);
}

add_task(async function testHTMLComposeWindowSwitchSignatures() {
  await HTMLComposeWindowSwitchSignatures(false, false);
});

add_task(
  async function testHTMLComposeWindowSwitchSignaturesWithSuppressedSeparator() {
    await HTMLComposeWindowSwitchSignatures(true, false);
  }
);

add_task(async function testHTMLComposeWindowSwitchSignaturesParagraphFormat() {
  await HTMLComposeWindowSwitchSignatures(false, true);
});

add_task(
  async function testHTMLComposeWindowSwitchSignaturesWithSuppressedSeparatorParagraphFormat() {
    await HTMLComposeWindowSwitchSignatures(true, true);
  }
);
