/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for the "Expand List" mail pill context menu.
 */

"use strict";

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var { close_compose_window, open_compose_new_mail, setup_msg_contents } =
  ChromeUtils.import("resource://testing-common/mozmill/ComposeHelpers.jsm");
var { close_window } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
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
  let menu = win.document.getElementById("emailAddressPillPopup");
  let menuItem = win.document.getElementById("expandList");
  let shownPromise = BrowserTestUtils.waitForEvent(menu, "popupshown");
  let container = win.document.getElementById(target);
  let listPill = Array.from(
    container.querySelectorAll("mail-address-pill")
  ).find(pill => pill.isMailList);

  EventUtils.synthesizeMouseAtCenter(listPill, { type: "contextmenu" }, win);
  await shownPromise;

  let hiddenPromise = BrowserTestUtils.waitForEvent(menu, "popuphidden");
  menu.activateItem(menuItem);
  await hiddenPromise;

  let expected = [];
  for (let addr of addresses.split(",")) {
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
  let book = MailServices.ab.directories[0];
  let list = Cc["@mozilla.org/addressbook/directoryproperty;1"].createInstance(
    Ci.nsIAbDirectory
  );
  list.isMailList = true;
  list.dirName = "Test List";
  list = book.addMailList(list);

  for (let i = 0; i < 3; i++) {
    let card = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
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
  let cwc = open_compose_new_mail();
  let addresses = "start@example,Test List,end@example";

  setup_msg_contents(cwc, addresses, "Expand To Test", "");
  await testListExpansion(cwc.window, "toAddrContainer", addresses);
  close_compose_window(cwc);
});

/**
 * Tests the "Expand List" menu option works with the "To" list,
 * with invalid pills involved.
 */
add_task(async function testExpandListsInvalidPill() {
  let cwc = open_compose_new_mail();
  // We add one invalid pill in the middle so see that parsing out the
  // addresses still works correctly for that case.
  let addresses =
    "start@example,invalidpill,Test List,end@example,invalidpill2";

  setup_msg_contents(cwc, addresses, "Expand To Test Invalid Pill", "");
  await testListExpansion(cwc.window, "toAddrContainer", addresses);
  close_compose_window(cwc);
});

/**
 * Tests the "Expand List" menu option works with the "Cc" list.
 */
add_task(async function testExpandListsOnCc() {
  let cwc = open_compose_new_mail();
  let button = cwc.window.document.getElementById(
    "addr_ccShowAddressRowButton"
  );
  let addresses = "start@example,Test List,end@example";

  button.click();
  setup_msg_contents(cwc, addresses, "Expand Cc Test", "", "ccAddrInput");
  await testListExpansion(cwc.window, "ccAddrContainer", addresses);
  close_compose_window(cwc);
});

/**
 * Tests the "Expand List" menu option works with the "Bcc" list.
 */
add_task(async function testExpandListsOnBcc() {
  let cwc = open_compose_new_mail();
  let button = cwc.window.document.getElementById(
    "addr_bccShowAddressRowButton"
  );
  let addresses = "start@example,Test List,end@example";

  button.click();
  setup_msg_contents(cwc, addresses, "Expand Bcc Test", "", "bccAddrInput");
  await testListExpansion(cwc.window, "bccAddrContainer", addresses);
  close_compose_window(cwc);
});
