/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const tabmail = document.getElementById("tabmail");
let browser;
let abSyncSubview;
let addressBooks;

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/accountcreation/test/browser/files/accountHubAddressBookSync.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();
  browser = tab.browser;
  abSyncSubview =
    tab.browser.contentWindow.document.querySelector("address-book-sync");
  addressBooks = [
    {
      name: "Book A",
      existing: false,
      url: { href: "test@test.com/BookA" },
    },
    {
      name: "Book B",
      existing: true,
      url: { href: "test@test.com/BookB" },
    },
    {
      name: "Book C",
      existing: false,
      url: { href: "test@test.com/BookC" },
    },
  ];
  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  });
});

add_task(function test_setState() {
  abSyncSubview.setState(addressBooks);

  Assert.equal(
    abSyncSubview.counter.addressBooks,
    addressBooks.length,
    "The sync subview counter should match the number of address book set"
  );
  Assert.equal(
    abSyncSubview.querySelectorAll("#addressBooks input:checked").length,
    3,
    "The number of checked inputs should be the length of the address books"
  );
  Assert.equal(
    abSyncSubview.querySelectorAll("#addressBooks input:checked:enabled")
      .length,
    2,
    "The number of enabled checked inputs should be 2"
  );

  const addressBookInputs = abSyncSubview.querySelectorAll(
    "#addressBooks input"
  );
  Assert.ok(
    addressBookInputs[0].id,
    "The address book input should have an ID"
  );
  Assert.equal(
    abSyncSubview.querySelector("#addressBooks input + span").textContent,
    addressBooks[0].name,
    "The address book name should match"
  );
  Assert.ok(
    !addressBookInputs[0].disabled,
    "The address book input should be enabled"
  );
  Assert.equal(
    addressBookInputs[0].dataset.url,
    addressBooks[0].url.href,
    "The address book dataset URL should match"
  );

  Assert.ok(
    addressBookInputs[1].disabled,
    "The address book input should be disabled"
  );

  Assert.ok(
    !addressBookInputs[2].disabled,
    "The address book input should be enabled"
  );

  abSyncSubview.resetState();
});

add_task(function test_resetState() {
  abSyncSubview.setState(addressBooks);
  Assert.equal(
    abSyncSubview.querySelectorAll("#addressBooks input").length,
    addressBooks.length,
    "The number of inputs should be the length of the address books"
  );

  abSyncSubview.resetState();
  Assert.equal(
    abSyncSubview.querySelectorAll("#addressBooks input").length,
    0,
    "There should be no inputs in the address book sync form"
  );
});

add_task(async function test_captureState() {
  abSyncSubview.setState(addressBooks);

  // One of the inputs is disabled because that address book exists, so
  // we should only get the non existing address books from captureState()
  let capturedState = abSyncSubview.captureState();
  const addressBookAvailable = addressBooks.filter(book => !book.existing);
  Assert.equal(
    capturedState.length,
    addressBookAvailable.length,
    "The address book captured should be the enabled address books"
  );

  Assert.deepEqual(
    addressBookAvailable,
    capturedState,
    "The captured state should match all of an array of the non existing address books."
  );

  // Unchecking the first input, which is enabled, should make captureState()
  // only return the one enabled address book.
  abSyncSubview.querySelector("input").checked = false;
  capturedState = abSyncSubview.captureState();
  Assert.equal(
    capturedState.length,
    addressBookAvailable.length - 1,
    "The address book captured should be the enabled address books"
  );
  abSyncSubview.resetState();
});

add_task(function test_observeAddressBookCounter() {
  // Updating the subview counter property makes the obvserveAddressBookCounter
  // function run, which should update the count string and the select/deselect
  // button string.

  // All address books should be selected when the state is set.
  abSyncSubview.setState(addressBooks);
  Assert.equal(
    abSyncSubview.l10n.getAttributes(
      abSyncSubview.querySelector("#selectedAddressBooks")
    ).args.count,
    addressBooks.length,
    "The count string should be updated"
  );
  Assert.equal(
    abSyncSubview.l10n.getAttributes(
      abSyncSubview.querySelector("#selectAllAddressBooks")
    ).id,
    "account-hub-deselect-all",
    "The toggle button should show the deselect-all string"
  );

  // Removing one from the counterObserver should decrease the count string
  // and make the deselect all button show select all.
  abSyncSubview.counterObserver.addressBooks = addressBooks.length - 1;
  Assert.equal(
    abSyncSubview.l10n.getAttributes(
      abSyncSubview.querySelector("#selectedAddressBooks")
    ).args.count,
    addressBooks.length - 1,
    "The count string should be updated"
  );
  Assert.equal(
    abSyncSubview.l10n.getAttributes(
      abSyncSubview.querySelector("#selectAllAddressBooks")
    ).id,
    "account-hub-select-all",
    "The toggle button should show the select-all string"
  );
  abSyncSubview.resetState();
});

add_task(async function test_inputChangeAndToggleAll() {
  abSyncSubview.setState(addressBooks);
  await BrowserTestUtils.waitForMutationCondition(
    abSyncSubview.querySelector("#addressBooks"),
    {
      subtree: true,
      childList: true,
    },
    () => abSyncSubview.querySelectorAll("#addressBooks input").length === 3
  );

  const addressBookInput = abSyncSubview.querySelector("#addressBooks input");
  const checkEvent = BrowserTestUtils.waitForEvent(
    addressBookInput,
    "change",
    true,
    event => !event.target.checked
  );
  EventUtils.synthesizeMouseAtCenter(
    addressBookInput,
    {},
    abSyncSubview.ownerGlobal
  );
  await checkEvent;

  const selectAllAddressBooks = abSyncSubview.querySelector(
    "#selectAllAddressBooks"
  );
  Assert.equal(
    abSyncSubview.l10n.getAttributes(selectAllAddressBooks).id,
    "account-hub-select-all",
    "Address book select toggle should be select all"
  );
  Assert.equal(
    abSyncSubview.l10n.getAttributes(
      abSyncSubview.querySelector("#selectedAddressBooks")
    ).args.count,
    addressBooks.length - 1,
    "Address books count should update"
  );

  const selectToggleEvent = BrowserTestUtils.waitForEvent(
    selectAllAddressBooks,
    "click"
  );
  EventUtils.synthesizeMouseAtCenter(
    selectAllAddressBooks,
    {},
    abSyncSubview.ownerGlobal
  );
  await selectToggleEvent;

  Assert.equal(
    abSyncSubview.l10n.getAttributes(selectAllAddressBooks).id,
    "account-hub-deselect-all",
    "Address book select toggle should be select all"
  );
  Assert.equal(
    abSyncSubview.l10n.getAttributes(
      abSyncSubview.querySelector("#selectedAddressBooks")
    ).args.count,
    addressBooks.length,
    "Address books count should update"
  );

  abSyncSubview.resetState();
});
