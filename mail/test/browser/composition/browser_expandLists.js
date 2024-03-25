/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for the "Expand List" mail pill context menu.
 */

"use strict";

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var { close_compose_window, open_compose_new_mail, setup_msg_contents } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/ComposeHelpers.sys.mjs"
  );

/**
 * Tests mailing list expansion works via the mail pill context menu.
 *
 * @param {Window} win The compose window.
 * @param {string} target The id of the mail pill container to test expansion on.
 * @param {string} addresses A comma separated string of addresses to put in
 *  the target field. Instances of "Test List" will be replaced to test that the
 *  expansion was successful.
 */
async function testListExpansion(win, target, addresses) {
  const menu = win.document.getElementById("emailAddressPillPopup");
  const menuItem = win.document.getElementById("expandList");
  const shownPromise = BrowserTestUtils.waitForEvent(menu, "popupshown");
  const container = win.document.getElementById(target);
  const listPill = Array.from(
    container.querySelectorAll("mail-address-pill")
  ).find(pill => pill.isMailList);

  EventUtils.synthesizeMouseAtCenter(listPill, { type: "contextmenu" }, win);
  await shownPromise;

  const hiddenPromise = BrowserTestUtils.waitForEvent(menu, "popuphidden");
  menu.activateItem(menuItem);
  await hiddenPromise;

  const expected = [];
  for (const addr of addresses.split(",")) {
    if (addr == "Test List") {
      expected.push("Member 0 <member0@example>");
      expected.push("Member 1 <member1@example>");
      expected.push("Member 2 <member2@example>");
    } else {
      expected.push(addr);
    }
  }

  let allPills = [];
  await TestUtils.waitForCondition(() => {
    allPills = Array.from(container.querySelectorAll("mail-address-pill"));
    return allPills.length == expected.length;
  }, "expanded list pills did not appear in time");

  Assert.equal(
    allPills.map(pill => pill.fullAddress).join(","),
    expected.join(","),
    "mail list pills were expanded correctly"
  );
}

/**
 * Creates the mailing list used during the tests.
 */
add_setup(async function () {
  const book = MailServices.ab.directories[0];
  let list = Cc["@mozilla.org/addressbook/directoryproperty;1"].createInstance(
    Ci.nsIAbDirectory
  );
  list.isMailList = true;
  list.dirName = "Test List";
  list = book.addMailList(list);

  for (let i = 0; i < 3; i++) {
    const card = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
      Ci.nsIAbCard
    );
    card.primaryEmail = `member${i}@example`;
    card.displayName = `Member ${i}`;
    list.addCard(card);
  }
  list.editMailListToDatabase(null);
});

/**
 * Tests the "Expand List" menu option works with the "To" list.
 */
add_task(async function testExpandListsOnTo() {
  const cwc = await open_compose_new_mail();
  const addresses = "start@example,Test List,end@example";

  await setup_msg_contents(cwc, addresses, "Expand To Test", "");
  await testListExpansion(cwc, "toAddrContainer", addresses);
  await close_compose_window(cwc);
});

/**
 * Tests the "Expand List" menu option works with the "To" list,
 * with invalid pills involved.
 */
add_task(async function testExpandListsInvalidPill() {
  const cwc = await open_compose_new_mail();
  // We add one invalid pill in the middle so see that parsing out the
  // addresses still works correctly for that case.
  const addresses =
    "start@example,invalidpill,Test List,end@example,invalidpill2";

  await setup_msg_contents(cwc, addresses, "Expand To Test Invalid Pill", "");
  await testListExpansion(cwc, "toAddrContainer", addresses);
  await close_compose_window(cwc);
});

/**
 * Tests the "Expand List" menu option works with the "Cc" list.
 */
add_task(async function testExpandListsOnCc() {
  const cwc = await open_compose_new_mail();
  const button = cwc.document.getElementById("addr_ccShowAddressRowButton");
  const addresses = "start@example,Test List,end@example";

  button.click();
  await setup_msg_contents(cwc, addresses, "Expand Cc Test", "", "ccAddrInput");
  await testListExpansion(cwc, "ccAddrContainer", addresses);
  await close_compose_window(cwc);
});

/**
 * Tests the "Expand List" menu option works with the "Bcc" list.
 */
add_task(async function testExpandListsOnBcc() {
  const cwc = await open_compose_new_mail();
  const button = cwc.document.getElementById("addr_bccShowAddressRowButton");
  const addresses = "start@example,Test List,end@example";

  button.click();
  await setup_msg_contents(
    cwc,
    addresses,
    "Expand Bcc Test",
    "",
    "bccAddrInput"
  );
  await testListExpansion(cwc, "bccAddrContainer", addresses);
  await close_compose_window(cwc);
});
