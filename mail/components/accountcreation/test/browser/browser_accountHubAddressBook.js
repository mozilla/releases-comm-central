/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

const tabmail = document.getElementById("tabmail");
let browser;
let abView;
let testAccount;

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/accountcreation/test/browser/files/accountHubAddressBook.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();
  browser = tab.browser;
  abView = tab.browser.contentWindow.document.querySelector(
    "account-hub-address-book"
  );

  testAccount = {
    account: { incomingServer: {}, defaultIdentity: {} },
    addressBooks: [
      {
        name: "Book A",
        existing: false,
        url: { href: "test@test.com/BookA" },
      },
      {
        name: "Book B",
        existing: false,
        url: { href: "test@test.com/BookB" },
      },
    ],
    existingAddressBookCount: 0,
  };
  testAccount.account.incomingServer.username = "test@test.com";
  testAccount.account.defaultIdentity.fullName = "Test User";

  registerCleanupFunction(async () => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  });
});

add_task(async function test_initialization() {
  const optionSelectSubview = abView.querySelector(
    "#addressBookOptionSelectSubview"
  );
  // The first subview of the address book view should be visible.
  Assert.ok(
    BrowserTestUtils.isVisible(optionSelectSubview),
    "The option select subview should be visible"
  );

  Assert.ok(
    BrowserTestUtils.isHidden(
      abView.querySelector("#addressBookAccountSelectSubview")
    ),
    "The account select subview should be hidden"
  );

  // Making the address book view visible, the init function should run.
  const spy = sinon.spy(abView, "init");
  abView.hidden = true;

  // Check that init() isn't called when the view is hidden.
  Assert.equal(
    spy.callCount,
    0,
    "Address book view should not have called init() once"
  );

  abView.hidden = false;

  // Check that init has been called when the view is visible.
  Assert.equal(spy.callCount, 1, "Address book view should have called init()");
});

add_task(async function test_reset() {
  // Change the subview and footer buttons manually.
  abView.querySelector("#addressBookOptionSelectSubview").hidden = true;
  abView.querySelector("#addressBookAccountSelectSubview").hidden = false;
  const footer = abView.querySelector("#addressBookFooter");
  footer.canBack(true);
  footer.canForward(true);

  // Create a test state and add a resetState stub to a subview object.
  const testState = {
    subview: { resetState: sinon.stub() },
  };
  testState.subview.resetState.returns(true);

  // Insert the state into the address book state.
  abView.insertTestState("resetState", testState);

  // Call reset on the address book view, making the address book option select
  // subview visible, and reseting the footer buttons (this subview has both
  // hidden).
  await abView.reset();
  Assert.ok(
    BrowserTestUtils.isVisible(
      abView.querySelector("#addressBookOptionSelectSubview")
    ),
    "The option select subview should be visible"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(
      abView.querySelector("#addressBookAccountSelectSubview")
    ),
    "The account select subview should be hidden"
  );

  Assert.ok(
    BrowserTestUtils.isHidden(footer.querySelector("#forward")),
    "The footer forward button should be hidden"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(footer.querySelector("#back")),
    "The footer back button should be hidden"
  );

  // Check if resetState has been called on the test state subview object.
  Assert.equal(
    testState.subview.resetState.callCount,
    1,
    "Test state subview should have called resetState"
  );
});

add_task(async function test_optionAndAccountSelectFormSubmission() {
  abView.insertTestAccount(testAccount);
  const optionSelectSubview = abView.querySelector(
    "address-book-option-select"
  );

  // To spy on the setState function of account select, we need to first load
  // it by viewing it, and then go back to option select to see if setState is
  // called when the form is submitted again.
  const accountSelectSubview = await subtest_viewAccountOptions();
  let setStateSpy = sinon.spy(accountSelectSubview, "setState");
  const backButton = abView.querySelector("account-hub-footer #back");

  let subviewHiddenPromise = BrowserTestUtils.waitForAttribute(
    "hidden",
    accountSelectSubview
  );
  EventUtils.synthesizeMouseAtCenter(backButton, {}, abView.ownerGlobal);
  await subviewHiddenPromise;
  await BrowserTestUtils.waitForAttributeRemoval("hidden", optionSelectSubview);
  Assert.ok(
    BrowserTestUtils.isHidden(accountSelectSubview),
    "The account select subview should be hidden"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(optionSelectSubview),
    "The option select subview should be visible"
  );

  EventUtils.synthesizeMouseAtCenter(
    optionSelectSubview.querySelector("#syncExistingAccounts"),
    {},
    abView.ownerGlobal
  );
  await TestUtils.waitForCondition(
    () => accountSelectSubview.querySelector('button[value="test@test.com"]'),
    "The account-select subview should show an account button"
  );
  Assert.equal(
    setStateSpy.callCount,
    1,
    "Account select subview should have called setState"
  );

  // To spy on the setState function of the syncSubview, we need to first load
  // it by viewing it, and then go back to account select to see if setState is
  // called when the form is submitted again.
  const syncSubview = await subtest_viewSyncAddressBooks(accountSelectSubview);
  setStateSpy = sinon.spy(syncSubview, "setState");

  subviewHiddenPromise = BrowserTestUtils.waitForAttribute(
    "hidden",
    syncSubview
  );
  EventUtils.synthesizeMouseAtCenter(backButton, {}, abView.ownerGlobal);
  await subviewHiddenPromise;
  await BrowserTestUtils.waitForAttributeRemoval(
    "hidden",
    accountSelectSubview
  );
  Assert.ok(
    BrowserTestUtils.isHidden(syncSubview),
    "The sync subview should be hidden"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(accountSelectSubview),
    "The account select subview should be visible"
  );

  subviewHiddenPromise = BrowserTestUtils.waitForAttribute(
    "hidden",
    accountSelectSubview
  );
  const accountButton = accountSelectSubview.querySelector(
    'button[value="test@test.com"]'
  );
  EventUtils.synthesizeMouseAtCenter(accountButton, {}, abView.ownerGlobal);
  await subviewHiddenPromise;
  await BrowserTestUtils.waitForAttributeRemoval("hidden", syncSubview);
  Assert.ok(
    BrowserTestUtils.isHidden(accountSelectSubview),
    "The account select subview should be hidden"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(syncSubview),
    "The sync subview should be visible"
  );

  Assert.equal(
    setStateSpy.callCount,
    1,
    "Address book sync subview should have called setState"
  );

  abView.removeTestAccount(testAccount);
  await abView.reset();
});

add_task(async function test_configUpdatedEvent() {
  await TestUtils.waitForCondition(
    () => abView.hasConnected,
    "The address book subview should be connected"
  );
  const viewSubmit = BrowserTestUtils.waitForEvent(abView, "submit");
  EventUtils.synthesizeMouseAtCenter(
    abView.querySelector("#addRemoteAddressBook"),
    {},
    abView.ownerGlobal
  );
  await viewSubmit;

  const forwardButton = abView.querySelector("#forward");

  const incompleteEvent = new CustomEvent("config-updated", {
    bubbles: true,
    detail: { completed: false },
  });
  abView.dispatchEvent(incompleteEvent);

  Assert.ok(
    forwardButton.disabled,
    "Forward should be disabled with incomplete config"
  );

  const completeEvent = new CustomEvent("config-updated", {
    bubbles: true,
    detail: { completed: true },
  });
  abView.dispatchEvent(completeEvent);

  Assert.ok(
    !forwardButton.disabled,
    "Should enable forward button with complete config"
  );

  await abView.reset();
});

add_task(async function test_syncAllAddressBooks() {
  setTestAccountWithAddressBookStubs();
  const accountSelectSubview = await subtest_viewAccountOptions();
  const syncSubview = await subtest_viewSyncAddressBooks(accountSelectSubview);
  const selectAllInput = syncSubview.querySelector("#selectAllAddressBooks");

  Assert.ok(selectAllInput.checked, "Select all input should be checked");
  Assert.ok(
    !selectAllInput.indeterminate,
    "Select all input should not be indeterminate"
  );

  await subtest_clickContinue();

  // Check if create() was called for each address book.
  Assert.equal(
    testAccount.addressBooks[0].create.callCount,
    1,
    "First address book should have called create"
  );
  Assert.equal(
    testAccount.addressBooks[1].create.callCount,
    1,
    "Second address book should have called create"
  );

  abView.removeTestAccount(testAccount);
  await abView.reset();
});

add_task(async function test_syncOneAddressBook() {
  setTestAccountWithAddressBookStubs();
  const accountSelectSubview = await subtest_viewAccountOptions();
  const syncSubview = await subtest_viewSyncAddressBooks(accountSelectSubview);
  const selectAllInput = syncSubview.querySelector("#selectAllAddressBooks");

  Assert.ok(selectAllInput.checked, "Select all input should be checked");
  Assert.ok(
    !selectAllInput.indeterminate,
    "Select all input should not be indeterminate"
  );

  // Uncheck the first address book.
  EventUtils.synthesizeMouseAtCenter(
    syncSubview.querySelector("#addressBookAccountsContainer input"),
    {},
    abView.ownerGlobal
  );

  Assert.ok(!selectAllInput.checked, "Select all input should not be checked");
  Assert.ok(
    selectAllInput.indeterminate,
    "Select all input should be indeterminate"
  );

  await subtest_clickContinue();

  // Check if create() was called for the second address book.
  Assert.equal(
    testAccount.addressBooks[0].create.callCount,
    0,
    "First address book should have called create"
  );
  Assert.equal(
    testAccount.addressBooks[1].create.callCount,
    1,
    "Second address book should have called create"
  );

  abView.removeTestAccount(testAccount);
  await abView.reset();
});

add_task(async function test_syncNoAddressBooks() {
  setTestAccountWithAddressBookStubs();
  const accountSelectSubview = await subtest_viewAccountOptions();
  const syncSubview = await subtest_viewSyncAddressBooks(accountSelectSubview);
  const selectAllInput = syncSubview.querySelector("#selectAllAddressBooks");

  Assert.ok(selectAllInput.checked, "Select all input should be checked");
  Assert.ok(
    !selectAllInput.indeterminate,
    "Select all input should not be indeterminate"
  );

  // Uncheck the first address book.
  EventUtils.synthesizeMouseAtCenter(selectAllInput, {}, abView.ownerGlobal);

  Assert.ok(!selectAllInput.checked, "Select all input should not be checked");
  Assert.ok(
    !selectAllInput.indeterminate,
    "Select all input should not be indeterminate"
  );

  await subtest_clickContinue();

  // Check if create() wasn't called for either address book.
  Assert.equal(
    testAccount.addressBooks[0].create.callCount,
    0,
    "First address book should have called create"
  );
  Assert.equal(
    testAccount.addressBooks[1].create.callCount,
    0,
    "Second address book should have called create"
  );

  abView.removeTestAccount(testAccount);
  await abView.reset();
});

add_task(async function test_localAddressBookForwardEventAndCreation() {
  const optionSelect = await TestUtils.waitForCondition(
    () => abView.querySelector("address-book-option-select"),
    `Address book option select should connected`
  );

  const button = optionSelect.querySelector("#newLocalAddressBook");

  EventUtils.synthesizeMouseAtCenter(button, {}, abView.ownerGlobal);

  let localForm;

  await TestUtils.waitForCondition(async () => {
    localForm = abView.querySelector("address-book-local-form form");
    return localForm?.getBoundingClientRect().width;
  }, `New local address book subview should be visible`);

  const input = localForm.querySelector("input");

  EventUtils.synthesizeMouseAtCenter(input, {}, abView.ownerGlobal);

  EventUtils.sendString("test");

  const { promise, resolve } = Promise.withResolvers();

  abView.querySelector("#addressBookFooter").addEventListener(
    "forward",
    () => {
      Assert.ok(true, "Forward event emmited");
      resolve();
    },
    { once: true }
  );

  const click = new PointerEvent("click", {
    view: window,
    bubbles: true,
    cancelable: true,
  });

  EventUtils.sendMouseEvent(click, abView.querySelector("#forward"), window);

  await promise;

  Assert.ok(
    MailServices.ab.directoryNameExists("test"),
    "Address book should exist"
  );

  await abView.reset();
});

/**
 * Subtest to view the account select books subview.
 *
 * @returns {HTMLElement}
 */
async function subtest_viewAccountOptions() {
  // Add a test account to the address-book #accounts variable
  const optionSelectSubview = abView.querySelector(
    "address-book-option-select"
  );

  // Enable the sync accounts option and select it.
  const syncAccountsButton = optionSelectSubview.querySelector(
    "#syncExistingAccounts"
  );
  syncAccountsButton.disabled = false;
  const formSubmissionPromise = BrowserTestUtils.waitForEvent(
    optionSelectSubview,
    "submit"
  );
  EventUtils.synthesizeMouseAtCenter(
    syncAccountsButton,
    {},
    abView.ownerGlobal
  );
  await formSubmissionPromise;

  const accountSelectSubview = abView.querySelector(
    "address-book-account-select"
  );
  await TestUtils.waitForCondition(
    () => accountSelectSubview.hasConnected,
    "The account-select subview should be connected"
  );

  return accountSelectSubview;
}

/**
 * Subtest to view the sync address books subview from the account select
 * subview.
 *
 * @param {HTMLElement} accountSelectSubview - The account select step.
 * @returns {HTMLElement}
 */
async function subtest_viewSyncAddressBooks(accountSelectSubview) {
  const accountButton = accountSelectSubview.querySelector(
    'button[value="test@test.com"]'
  );
  const formSubmissionPromise = BrowserTestUtils.waitForEvent(
    accountSelectSubview,
    "submit"
  );
  EventUtils.synthesizeMouseAtCenter(accountButton, {}, abView.ownerGlobal);
  await formSubmissionPromise;

  const syncSubview = abView.querySelector("address-book-sync");
  await TestUtils.waitForCondition(
    () => syncSubview.hasConnected,
    "The sync subview should be connected"
  );

  return syncSubview;
}

/**
 * Adds function stubs to the create property of each address book in the test
 * account.
 */
function setTestAccountWithAddressBookStubs() {
  testAccount.addressBooks[0].create = sinon.stub();
  testAccount.addressBooks[1].create = sinon.stub();
  testAccount.addressBooks[0].create.returns(true);
  testAccount.addressBooks[1].create.returns(true);
  abView.insertTestAccount(testAccount);
}

/**
 * Subtest to click the continue button in the account hub footer.
 */
async function subtest_clickContinue() {
  const forwardButton = abView.querySelector("account-hub-footer #forward");

  const formSubmissionPromise = BrowserTestUtils.waitForEvent(
    abView.querySelector("account-hub-footer"),
    "forward"
  );
  EventUtils.synthesizeMouseAtCenter(forwardButton, {}, abView.ownerGlobal);
  await formSubmissionPromise;
}
