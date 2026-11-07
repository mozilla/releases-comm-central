/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that the Message Security panel fits on screen and can be scrolled
 * when an OpenPGP message was encrypted to a large number of keys.
 */

"use strict";

const { get_about_message, open_message_from_file } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
  );
const { OpenPGPTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mail/OpenPGPTestUtils.sys.mjs"
);
const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["general.smoothScroll", false]],
  });

  const account = MailServices.accounts.createAccount();
  account.incomingServer = MailServices.accounts.createIncomingServer(
    "bob",
    "openpgp.example",
    "pop3"
  );
  const identity = MailServices.accounts.createIdentity();
  identity.email = "bob@openpgp.example";
  account.addIdentity(identity);

  const [id] = await OpenPGPTestUtils.importPrivateKey(
    window,
    new FileUtils.File(
      getTestFilePath(
        "data/keys/bob@openpgp.example-0xfbfcc82a015e7330-secret.asc"
      )
    )
  );
  identity.setUnicharAttribute("openpgp_key_id", id);

  registerCleanupFunction(async () => {
    await OpenPGPTestUtils.removeKeyById("0xFBFCC82A015E7330", true);
    MailServices.accounts.removeAccount(account, true);
  });
});

add_task(async function testSecurityPanelScrollsWithManyRecipientKeys() {
  const msgc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath("data/eml/encrypted-to-bob-and-100-others.eml")
    )
  );
  const aboutMessage = get_about_message(msgc);
  const doc = aboutMessage.document;

  await TestUtils.waitForCondition(
    () => OpenPGPTestUtils.hasEncryptedIconState(doc, "ok"),
    "message should be shown as decrypted"
  );

  const panel = doc.getElementById("messageSecurityPanel");
  const popupshown = BrowserTestUtils.waitForEvent(panel, "popupshown");
  EventUtils.synthesizeMouseAtCenter(
    doc.getElementById("encryptionTechBtn"),
    {},
    aboutMessage
  );
  await popupshown;

  const keyRows = doc.querySelectorAll(
    "#otherEncryptionKeysList .other-key-row"
  );
  Assert.equal(keyRows.length, 100, "should list all other recipient keys");

  const panelRect = panel.getOuterScreenRect();
  const screen = aboutMessage.screen;
  Assert.lessOrEqual(
    panelRect.bottom,
    screen.availTop + screen.availHeight + 1,
    "panel should not extend below the available screen area"
  );
  Assert.greaterOrEqual(
    panelRect.top,
    screen.availTop - 1,
    "panel should not extend above the available screen area"
  );

  const lastRow = keyRows[keyRows.length - 1];
  let scroller = lastRow.parentElement;
  while (
    scroller != panel &&
    !(
      ["auto", "scroll"].includes(
        aboutMessage.getComputedStyle(scroller).overflowY
      ) && scroller.scrollHeight > scroller.clientHeight
    )
  ) {
    scroller = scroller.parentElement;
  }
  Assert.notEqual(
    scroller,
    panel,
    "the key list should be inside a scrollable container"
  );
  Assert.equal(scroller.scrollTop, 0, "panel should start scrolled to top");

  const panelClientRect = panel.getBoundingClientRect();
  const isVisible = el => {
    const r = el.getBoundingClientRect();
    const s = scroller.getBoundingClientRect();
    return (
      r.top >= s.top - 1 &&
      r.bottom <= s.bottom + 1 &&
      r.bottom <= panelClientRect.bottom + 1
    );
  };
  Assert.ok(!isVisible(lastRow), "last key should not be visible yet");

  const maxScrollTop = scroller.scrollHeight - scroller.clientHeight;
  for (let i = 0; i < 100 && scroller.scrollTop < maxScrollTop - 1; i++) {
    const scrolled = BrowserTestUtils.waitForEvent(scroller, "scroll");
    const scrollerRect = scroller.getBoundingClientRect();
    EventUtils.synthesizeWheel(
      scroller,
      scrollerRect.width / 2,
      scrollerRect.height / 2,
      { deltaMode: WheelEvent.DOM_DELTA_PAGE, deltaY: 1 },
      aboutMessage
    );
    await scrolled;
  }

  Assert.greaterOrEqual(
    scroller.scrollTop,
    maxScrollTop - 1,
    "mouse wheel should scroll the panel to the bottom"
  );
  Assert.lessOrEqual(
    scroller.getBoundingClientRect().bottom,
    panelClientRect.bottom + 1,
    "scrollable container should not be clipped by the panel"
  );
  Assert.ok(isVisible(lastRow), "last key should be visible after scrolling");

  const popuphidden = BrowserTestUtils.waitForEvent(panel, "popuphidden");
  panel.hidePopup();
  await popuphidden;
  await BrowserTestUtils.closeWindow(msgc);
});
