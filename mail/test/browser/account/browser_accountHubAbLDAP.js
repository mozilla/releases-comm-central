/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

add_task(async function test_simpleLDAPDirectoryCreation() {
  const dialog = await subtest_open_account_hub_dialog("ADDRESS_BOOK");

  await fillSimpleLDAPConfigDetails(dialog);

  const addressBookDirectory = await createDirectory(dialog);

  subtest_checkSimpleLDAPDirectoryData(addressBookDirectory);
  Assert.equal(
    addressBookDirectory.lDAPURL.spec,
    "ldap://localhost:24/dc=localhost???(objectclass=*)",
    "The directory should have the correct URL spec from the info inputted"
  );

  // Delete address book and close the address book tab.
  await deleteDirectory(addressBookDirectory);
});

add_task(async function test_advancedLDAPDirectoryCreation() {
  const dialog = await subtest_open_account_hub_dialog("ADDRESS_BOOK");
  await fillSimpleLDAPConfigDetails(dialog);
  const ldapFormSubview = dialog.querySelector(
    "address-book-ldap-account-form"
  );

  // Click the advanced config button and fill in the advanced config details.
  EventUtils.synthesizeMouseAtCenter(
    ldapFormSubview.querySelector("#advancedConfigurationLdap"),
    {}
  );

  const formBody = ldapFormSubview.querySelector("#ldapFormBody");
  await BrowserTestUtils.waitForMutationCondition(
    formBody,
    {
      attributes: true,
      attributeFilter: ["class"],
    },
    () => formBody.classList.contains("advanced")
  );

  const simpleConfigButton = ldapFormSubview.querySelector(
    "#simpleConfigurationLdap"
  );
  simpleConfigButton.scrollIntoView({
    behavior: "instant",
  });

  EventUtils.synthesizeMouseAtCenter(
    ldapFormSubview.querySelector("#maxResults"),
    {}
  );
  EventUtils.sendString("50");

  EventUtils.synthesizeMouseAtCenter(
    ldapFormSubview.querySelector("#search"),
    {}
  );
  EventUtils.sendString("(objectclass=*)");

  const scopeDropdown = ldapFormSubview.querySelector("#scope");
  const loginMethodDropdown = ldapFormSubview.querySelector("#loginMethod");

  // Select scope level one from the dropdown.
  const selectPromise = BrowserTestUtils.waitForSelectPopupShown(window);

  await EventUtils.synthesizeMouseAtCenter(scopeDropdown, {});

  const popup = await selectPromise;

  const items = popup.querySelectorAll("menuitem");

  // #scopeOne
  popup.activateItem(items[0]);

  await BrowserTestUtils.waitForPopupEvent(popup, "hidden");

  // Select GSSAPI login method from the dropdown.
  const loginMethodPromise = BrowserTestUtils.waitForSelectPopupShown(window);

  await EventUtils.synthesizeMouseAtCenter(loginMethodDropdown, {});

  const loginMethodPopup = await loginMethodPromise;

  const loginMethodItems = loginMethodPopup.querySelectorAll("menuitem");

  // #loginGSSAPI
  loginMethodPopup.activateItem(loginMethodItems[1]);

  await BrowserTestUtils.waitForPopupEvent(loginMethodPopup, "hidden");

  const addressBookDirectory = await createDirectory(dialog);
  subtest_checkSimpleLDAPDirectoryData(addressBookDirectory);

  // Check the advanced data inputted matches what's in the directory.
  Assert.equal(
    addressBookDirectory.lDAPURL.spec,
    "ldap://localhost:24/dc=localhost??one?(objectclass=*)",
    "The directory should have the correct URL spec from the info inputted"
  );
  Assert.equal(
    addressBookDirectory.saslMechanism,
    "GSSAPI",
    "The saslMechanism should match what was selected"
  );
  Assert.equal(
    addressBookDirectory.lDAPURL.filter,
    "(objectclass=*)",
    "The directory filter should match what was inputted"
  );
  Assert.equal(
    addressBookDirectory.maxHits,
    50,
    "The directory max results should match what was inputted"
  );
  Assert.equal(
    addressBookDirectory.lDAPURL.scope,
    Ci.nsILDAPURL.SCOPE_ONELEVEL,
    "The directory filter scope match what was inputted"
  );

  // Delete address book and close the address book tab.
  await deleteDirectory(addressBookDirectory);
});

add_task(async function test_duplicateDirectoryNameError() {
  let dialog = await subtest_open_account_hub_dialog("ADDRESS_BOOK");
  await fillSimpleLDAPConfigDetails(dialog);
  const addressBookDirectory = await createDirectory(dialog);

  // Open account hub again and use the same details.
  dialog = await subtest_open_account_hub_dialog("ADDRESS_BOOK");
  await fillSimpleLDAPConfigDetails(dialog);
  const ldapFormSubview = dialog.querySelector(
    "address-book-ldap-account-form"
  );

  // Click continue to show error notification.
  EventUtils.synthesizeMouseAtCenter(
    dialog.querySelector("#addressBookFooter #forward"),
    {}
  );

  const header = ldapFormSubview.shadowRoot.querySelector("account-hub-header");
  const errorTitle = header.shadowRoot.querySelector(
    "#emailFormNotificationTitle"
  );

  await BrowserTestUtils.waitForMutationCondition(
    header.shadowRoot.querySelector("#emailFormNotification"),
    {
      attributes: true,
      attributeFilter: ["hidden"],
    },
    () => BrowserTestUtils.isVisible(errorTitle)
  );
  await TestUtils.waitForTick();

  Assert.equal(
    document.l10n.getAttributes(errorTitle.querySelector(".localized-title"))
      .id,
    "address-book-ldap-duplicate-error",
    "Should display duplicate name error"
  );

  await subtest_close_account_hub_dialog(dialog, ldapFormSubview);

  // Delete address book and close the address book tab.
  await deleteDirectory(addressBookDirectory);
});

/**
 * Fills in the simple config information in the LDAP creation form.
 *
 * @param {HTMLDialogElement} dialog - The account hub dialog.
 */
async function fillSimpleLDAPConfigDetails(dialog) {
  const ldapFormSubview = dialog.querySelector(
    "address-book-ldap-account-form"
  );

  EventUtils.synthesizeMouseAtCenter(
    dialog.querySelector("address-book-option-select #newLdapAddressBook"),
    {},
    window
  );
  await BrowserTestUtils.waitForAttributeRemoval("hidden", ldapFormSubview);
  Assert.ok(
    BrowserTestUtils.isVisible(ldapFormSubview),
    "LDAP directory form subview should be visible"
  );

  // Add directory name.
  EventUtils.sendString("Test Directory");
  EventUtils.synthesizeKey("KEY_Tab", {}, window);

  // Add hostname.
  EventUtils.sendString("localhost");
  EventUtils.synthesizeKey("KEY_Tab", {}, window);

  // Add port.
  EventUtils.sendString("24");
  EventUtils.synthesizeKey("KEY_Tab", {}, window);

  // Skip SSL switch input and set set baseDN.
  EventUtils.synthesizeKey("KEY_Tab", {}, window);
  EventUtils.sendString("dc=localhost");
  EventUtils.synthesizeKey("KEY_Tab", {}, window);

  // Set bindDN.
  EventUtils.sendString("cn=username");
}

/**
 * Clicks continue on the form to create LDAP directory and close account hub,
 * showing the created LDAP directory in the address book tab.
 *
 * @param {HTMLDialogElement} dialog - The account hub dialog.
 * @returns {Ci.nsIAbDirectory}
 */
async function createDirectory(dialog) {
  const dialogClosePromise = BrowserTestUtils.waitForEvent(dialog, "close");
  const addressBookDirectoryPromise = TestUtils.topicObserved(
    "addrbook-directory-created"
  );
  EventUtils.synthesizeMouseAtCenter(
    dialog.querySelector("#addressBookFooter #forward"),
    {}
  );

  info("Opening address book tab...");
  const tabmail = document.getElementById("tabmail");
  const addressBookTabOpen = BrowserTestUtils.waitForEvent(
    tabmail.tabContainer,
    "TabOpen",
    false,
    event => event.detail.tabInfo.mode.type == "addressBookTab"
  );

  const {
    detail: { tabInfo: addressBookTab },
  } = await addressBookTabOpen;

  info("Waiting for address book to be ready...");
  await BrowserTestUtils.waitForEvent(
    addressBookTab.browser,
    "about-addressbook-ready",
    true
  );

  info("Waiting for account hub to close...");
  await dialogClosePromise;

  // Check existence of address book.
  const [addressBookDirectory] = await addressBookDirectoryPromise;
  return addressBookDirectory;
}

/**
 * Subtest to check if the inputted data matches the provided LDAP directory.
 *
 * @param {nsIAbDirectory} directory - The LDAP Directory.
 */
function subtest_checkSimpleLDAPDirectoryData(directory) {
  Assert.equal(
    directory.dirName,
    "Test Directory",
    "The name should match what was inputted"
  );
  Assert.equal(
    directory.dirType,
    Ci.nsIAbManager.LDAP_DIRECTORY_TYPE,
    "The directory type should be LDAP"
  );
  Assert.equal(
    directory.authDn,
    "cn=username",
    "The bind DN should match what was inputted"
  );
  Assert.equal(
    directory.lDAPURL.dn,
    "dc=localhost",
    "The base DN should match what was inputted"
  );
}

/**
 * Deletes the provided LDAP directory and closes the address book tab.
 *
 * @param {nsIAbDirectory} directory - The LDAP Directory.
 */
async function deleteDirectory(directory) {
  const removePromise = TestUtils.topicObserved(
    "addrbook-directory-deleted",
    subject => subject == directory
  );
  MailServices.ab.deleteAddressBook(directory.URI);
  await removePromise;

  const tabmail = document.getElementById("tabmail");
  tabmail.closeOtherTabs(0);
}
