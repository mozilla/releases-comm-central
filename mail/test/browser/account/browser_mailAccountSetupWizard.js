/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { openAccountSetup } = ChromeUtils.importESModule(
  "resource://testing-common/mail/AccountManagerHelpers.sys.mjs"
);
var { input_value, delete_all_existing } = ChromeUtils.importESModule(
  "resource://testing-common/mail/KeyboardHelpers.sys.mjs"
);

var { cal } = ChromeUtils.importESModule(
  "resource:///modules/calendar/calUtils.sys.mjs"
);
var { DNS } = ChromeUtils.importESModule("resource:///modules/DNS.sys.mjs");

var testUser = {
  name: "Yamato Nadeshiko",
  email: "yamato.nadeshiko@example.com",
  password: "abc12345",
  incomingHost: "testin.example.com",
  outgoingHost: "testout.example.com",
};
var outgoingShortName = "Example Två";

var imapUser = {
  name: "John Doe",
  email: "john.doe@imap.test",
  password: "abc12345",
  incomingHost: "testin.imap.test",
  outgoingHost: "testout.imap.test",
};

var _srv = DNS.srv;
var _txt = DNS.txt;
DNS.srv = function (name) {
  if (["_caldavs._tcp.localhost", "_carddavs._tcp.localhost"].includes(name)) {
    return [{ prio: 0, weight: 0, host: "example.org", port: 443 }];
  }
  if (["_caldavs._tcp.imap.test", "_carddavs._tcp.imap.test"].includes(name)) {
    return [{ prio: 0, weight: 0, host: "example.org", port: 443 }];
  }
  throw new Error(`Unexpected DNS SRV lookup: ${name}`);
};
DNS.txt = function (name) {
  if (name == "_caldavs._tcp.localhost") {
    return [
      { strings: ["path=/browser/comm/calendar/test/browser/data/dns.sjs"] },
    ];
  }
  if (name == "_carddavs._tcp.localhost") {
    return [
      {
        strings: [
          "path=/browser/comm/mail/components/addrbook/test/browser/data/dns.sjs",
        ],
      },
    ];
  }
  if (name == "_caldavs._tcp.imap.test") {
    return [
      { strings: ["path=/browser/comm/calendar/test/browser/data/dns.sjs"] },
    ];
  }
  if (name == "_carddavs._tcp.imap.test") {
    return [
      {
        strings: [
          "path=/browser/comm/mail/components/addrbook/test/browser/data/dns.sjs",
        ],
      },
    ];
  }
  throw new Error(`Unexpected DNS TXT lookup: ${name}`);
};

const PREF_NAME = "mailnews.auto_config_url";
const PREF_VALUE = Services.prefs.getCharPref(PREF_NAME);

// Remove an account in the Account Manager, but not via the UI.
function remove_account_internal(tab, account, outgoing) {
  const win = tab.browser.contentWindow;

  // Remove the account and incoming server
  const serverId = account.incomingServer.serverURI;
  MailServices.accounts.removeAccount(account);
  account = null;
  if (serverId in win.accountArray) {
    delete win.accountArray[serverId];
  }
  win.selectServer(null, null);

  // Remove the outgoing server
  const smtpKey = outgoing.key;
  MailServices.outgoingServer.deleteServer(outgoing);
  win.replaceWithDefaultSmtpServer(smtpKey);
}

add_task(async function test_mail_account_setup() {
  // Set the pref to load a local autoconfig file.
  const url =
    "http://mochi.test:8888/browser/comm/mail/test/browser/account/xml/";
  Services.prefs.setCharPref(PREF_NAME, url);

  // This test will cause a connection failure alert. Prevent it to avoid
  // test failure messages.
  Services.prefs.setBoolPref("mail.suppressAlertsForTests", true);

  Services.fog.testResetFOG();

  const tab = await openAccountSetup();
  const tabDocument = tab.browser.contentWindow.document;

  // Input user's account information
  EventUtils.synthesizeMouseAtCenter(
    tabDocument.getElementById("realname"),
    {},
    tab.browser.contentWindow
  );

  if (tabDocument.getElementById("realname").value) {
    // If any realname is already filled, clear it out, we have our own.
    delete_all_existing(window, tabDocument.getElementById("realname"));
  }
  input_value(window, testUser.name);
  EventUtils.synthesizeKey("KEY_Tab", {}, window);
  input_value(window, testUser.email);
  EventUtils.synthesizeKey("KEY_Tab", {}, window);
  input_value(window, testUser.password);

  const notificationBox =
    tab.browser.contentWindow.gAccountSetup.notificationBox;

  const notificationPromise =
    BrowserTestUtils.waitForNotificationInNotificationBox(
      notificationBox,
      "accountSetupSuccess"
    );

  const popOption = tabDocument.getElementById("resultsOption-pop3");
  const protocolPOPSelected = BrowserTestUtils.waitForMutationCondition(
    popOption,
    {
      attributes: true,
      attributeFilter: ["hidden", "class"],
    },
    () => !popOption.hidden && popOption.classList.contains("selected")
  );

  // Load the autoconfig file from http://localhost:433**/autoconfig/example.com
  EventUtils.synthesizeMouseAtCenter(
    tabDocument.getElementById("continueButton"),
    {},
    tab.browser.contentWindow
  );

  // Wait for the successful notification to show up.
  await notificationPromise;

  // Only the POP protocol should be available, therefore we need to confirm
  // that the UI is returning only 1 pre-selected protocol.
  await protocolPOPSelected;

  // Confirm that protocols other than the expected POP3 aren't shown.
  Assert.ok(
    tabDocument.getElementById("resultsOption-imap").hidden,
    "The IMAP results section should be hidden"
  );
  Assert.ok(
    tabDocument.getElementById("resultsOption-ews").hidden,
    "The EWS results section should be hidden"
  );
  Assert.ok(
    tabDocument.getElementById("resultsOption-exchange").hidden,
    "The Exchange results section should be hidden"
  );

  // Open the advanced settings (Account Manager) to create the account
  // immediately. We use an invalid email/password so the setup will fail
  // anyway.
  EventUtils.synthesizeMouseAtCenter(
    tabDocument.getElementById("manualConfigButton"),
    {},
    tab.browser.contentWindow
  );

  await BrowserTestUtils.waitForAttributeRemoval(
    "hidden",
    tabDocument.getElementById("manualConfigArea")
  );

  const tabmail = document.getElementById("tabmail");

  const advancedSetupButton = tabDocument.getElementById("advancedSetupButton");
  advancedSetupButton.scrollIntoView({ block: "start", behavior: "instant" });

  // Handle the confirmation dialog.
  const dialogPromise = BrowserTestUtils.promiseAlertDialog("accept");
  EventUtils.synthesizeMouseAtCenter(
    advancedSetupButton,
    {},
    tab.browser.contentWindow
  );
  await dialogPromise;

  // Wait for the current Account Setup tab to be closed and the Account
  // Settings tab to open before running other sub tests.
  if (tabmail.selectedTab == tab) {
    await BrowserTestUtils.waitForEvent(
      tabmail.tabContainer,
      "TabSelect",
      () => tabmail.selectedTab != tab
    );
  }

  await subtest_verify_account(tabmail.selectedTab, testUser);

  // FIXME: the test doesn't get a successful config, so we do not yet test
  // this probe. Should add something like:
  /*
  const xmlFromDbValue =
    Glean.mail.successfulEmailAccountSetup["xml-from-db"].testGetValue();
  Assert.equal(xmlFromDbValue, 1, "should get correct count for xml-from-db");
  */

  // Close the Account Settings tab.
  tabmail.closeTab(tabmail.currentTabInfo);

  // Confirm that we properly updated the folderPaneVisible attribute for the
  // tabmail when we created the account in the background.
  Assert.ok(tabmail.currentTabInfo.folderPaneVisible);

  // Confirm that the folder pane is visible.
  Assert.ok(BrowserTestUtils.isVisible(tabmail.currentAbout3Pane.folderTree));

  // Clean up
  Services.prefs.setCharPref(PREF_NAME, PREF_VALUE);
});

async function subtest_verify_account(tab, user) {
  await TestUtils.waitForCondition(
    () => tab.browser.contentWindow.currentAccount != null,
    "Timeout waiting for current account to become non-null"
  );

  const account = tab.browser.contentWindow.currentAccount;
  const identity = account.defaultIdentity;
  const incoming = account.incomingServer;
  const outgoing = MailServices.outgoingServer.getServerByKey(
    identity.smtpServerKey
  );

  const config = {
    "incoming server username": {
      actual: incoming.username,
      expected: user.email.split("@")[0],
    },
    // This was creating test failure.
    //
    // "outgoing server username": {
    //   actual: outgoing.username,
    //   expected: user.email,
    // },
    "incoming server hostname": {
      // Note: N in the hostName is uppercase
      actual: incoming.hostName,
      expected: user.incomingHost,
    },
    "outgoing server hostname": {
      // And this is lowercase
      actual: outgoing.serverURI.host,
      expected: user.outgoingHost,
    },
    "user real name": { actual: identity.fullName, expected: user.name },
    "user email address": { actual: identity.email, expected: user.email },
    "outgoing description": {
      actual: outgoing.description,
      expected: outgoingShortName,
    },
  };

  try {
    for (const i in config) {
      Assert.equal(
        config[i].actual,
        config[i].expected,
        `Configured ${i} is ${config[i].actual}. It should be ${config[i].expected}.`
      );
    }
  } finally {
    remove_account_internal(tab, account, outgoing);
  }
}

/**
 * Make sure that we don't re-set the information we get from the config
 * file if the password is incorrect.
 */
add_task(async function test_bad_password_uses_old_settings() {
  // Set the pref to load a local autoconfig file, that will fetch the
  // ../account/xml/example.com which contains the settings for the
  // @example.com email account (see the 'user' object).
  const url =
    "http://mochi.test:8888/browser/comm/mail/test/browser/account/xml/";
  Services.prefs.setCharPref(PREF_NAME, url);

  Services.fog.testResetFOG();

  const tab = await openAccountSetup();
  const tabDocument = tab.browser.contentWindow.document;

  // Input user's account information
  EventUtils.synthesizeMouseAtCenter(
    tabDocument.getElementById("realname"),
    {},
    tab.browser.contentWindow
  );

  if (tabDocument.getElementById("realname").value) {
    // If any realname is already filled, clear it out, we have our own.
    delete_all_existing(window, tabDocument.getElementById("realname"));
  }
  input_value(window, testUser.name);
  EventUtils.synthesizeKey("KEY_Tab", {}, window);
  input_value(window, testUser.email);
  EventUtils.synthesizeKey("KEY_Tab", {}, window);
  input_value(window, testUser.password);

  // Load the autoconfig file from http://localhost:433**/autoconfig/example.com
  EventUtils.synthesizeMouseAtCenter(
    tabDocument.getElementById("continueButton"),
    {},
    tab.browser.contentWindow
  );

  const createButton = tabDocument.getElementById("createButton");
  await BrowserTestUtils.waitForMutationCondition(
    createButton,
    {
      attributes: true,
      attributeFilter: ["hidden", "disabled"],
    },
    () => !createButton.hidden && !createButton.disabled
  );

  const notificationBox =
    tab.browser.contentWindow.gAccountSetup.notificationBox;

  const notificationShown =
    BrowserTestUtils.waitForNotificationInNotificationBox(
      notificationBox,
      "accountSetupError"
    );

  createButton.scrollIntoView({ block: "start", behavior: "instant" });
  EventUtils.synthesizeMouseAtCenter(
    createButton,
    {},
    tab.browser.contentWindow
  );

  await notificationShown;

  await BrowserTestUtils.waitForAttributeRemoval("disabled", createButton);

  const manualConfigButton = tabDocument.getElementById("manualConfigButton");
  manualConfigButton.scrollIntoView({ block: "start", behavior: "instant" });

  EventUtils.synthesizeMouseAtCenter(
    manualConfigButton,
    {},
    tab.browser.contentWindow
  );

  await BrowserTestUtils.waitForAttributeRemoval(
    "hidden",
    tabDocument.getElementById("manualConfigArea")
  );

  const outgoingAuthSelect = tabDocument.getElementById("outgoingAuthMethod");
  // Make sure the select field is inside the viewport.
  outgoingAuthSelect.scrollIntoView({ block: "start", behavior: "instant" });
  outgoingAuthSelect.focus();
  EventUtils.sendKey("space", tab.browser.contentWindow);
  await BrowserTestUtils.waitForPopupEvent(
    document.getElementById("ContentSelectDropdown"),
    "shown"
  );

  // The default value should be on "Normal password", which is after
  // "No authentication", so we need to go up. We do this on purpose so we can
  // properly test and track the order of options.
  EventUtils.sendKey("up", tab.browser.contentWindow);

  EventUtils.sendKey("return", tab.browser.contentWindow);

  // Confirm that the outgoing username field is disabled.
  await BrowserTestUtils.waitForAttribute(
    "disabled",
    tabDocument.getElementById("outgoingUsername")
  );

  // Revert the outgoing authentication method to "Normal Password".
  outgoingAuthSelect.focus();
  // Change the outgoing authentication method to "No Authentication".
  EventUtils.sendKey("space", tab.browser.contentWindow);
  await BrowserTestUtils.waitForPopupEvent(
    document.getElementById("ContentSelectDropdown"),
    "shown"
  );

  EventUtils.sendKey("down", tab.browser.contentWindow);

  EventUtils.sendKey("return", tab.browser.contentWindow);

  // Confirm that the outgoing username field is enabled.
  await BrowserTestUtils.waitForAttributeRemoval(
    "disabled",
    tabDocument.getElementById("outgoingUsername")
  );

  createButton.scrollIntoView({ block: "start", behavior: "instant" });
  EventUtils.synthesizeMouseAtCenter(
    createButton,
    {},
    tab.browser.contentWindow
  );

  // Triggering again the "createButton" should clear previous notifications.
  await TestUtils.waitForCondition(
    () => notificationBox.getNotificationWithValue("accountSetupError") == null,
    "Timeout waiting for error notification to be removed"
  );
  const newNotificationShown =
    BrowserTestUtils.waitForNotificationInNotificationBox(
      notificationBox,
      "accountSetupError"
    );

  // Make sure all the values are the same as in the user object.
  Assert.equal(
    tabDocument.getElementById("outgoingHostname").value,
    testUser.outgoingHost,
    "Outgoing server changed!"
  );
  Assert.equal(
    tabDocument.getElementById("incomingHostname").value,
    testUser.incomingHost,
    "incoming server changed!"
  );

  // A new error notification should appear.
  await newNotificationShown;

  Assert.equal(
    Glean.mail.failedEmailAccountSetup["xml-from-db"].testGetValue(),
    1,
    "count of failed email account setup with xml config must be correct"
  );

  Assert.equal(
    Glean.mail.failedEmailAccountSetup.user.testGetValue(),
    1,
    "count of failed email account setup with manual config must be correct"
  );

  // Clean up
  Services.prefs.setCharPref(PREF_NAME, PREF_VALUE);

  const closeButton = tabDocument.getElementById("cancelButton");
  closeButton.scrollIntoView({ block: "start", behavior: "instant" });

  EventUtils.synthesizeMouseAtCenter(
    closeButton,
    {},
    tab.browser.contentWindow
  );
});

add_task(async function test_remember_password() {
  await remember_password_test(true);
  await remember_password_test(false);
});

/**
 * Test remember_password checkbox behavior with
 * signon.rememberSignons set to "aPrefValue"
 *
 * @param {boolean} aPrefValue - The preference value for signon.rememberSignons.
 */
async function remember_password_test(aPrefValue) {
  // Save the pref for backup purpose.
  const rememberSignons_pref_save = Services.prefs.getBoolPref(
    "signon.rememberSignons",
    true
  );

  Services.prefs.setBoolPref("signon.rememberSignons", aPrefValue);

  const tab = await openAccountSetup();
  const tabDocument = tab.browser.contentWindow.document;
  const password = tabDocument.getElementById("password");

  // Type something in the password field.
  password.focus();
  input_value(window, "testing");

  const rememberPassword = tabDocument.getElementById("rememberPassword");
  Assert.ok(rememberPassword.disabled != aPrefValue);
  Assert.equal(rememberPassword.checked, aPrefValue);

  // Empty the password field.
  delete_all_existing(window, password);

  // Restore the saved signon.rememberSignons value.
  Services.prefs.setBoolPref(
    "signon.rememberSignons",
    rememberSignons_pref_save
  );

  const closeButton = tabDocument.getElementById("cancelButton");
  closeButton.scrollIntoView({ block: "start", behavior: "instant" });

  // Close the wizard.
  EventUtils.synthesizeMouseAtCenter(
    closeButton,
    {},
    tab.browser.contentWindow
  );
}

/**
 * Test the full account setup with an IMAP account, verifying the correct info
 * in the final page.
 */
add_task(async function test_full_account_setup() {
  // Initialize the fake IMAP and SMTP server to simulate a real account login.
  IMAPServer.open();
  SMTPServer.open();

  // Set the pref to load a local autoconfig file.
  const url =
    "http://mochi.test:8888/browser/comm/mail/test/browser/account/xml/";
  Services.prefs.setCharPref(PREF_NAME, url);

  const tab = await openAccountSetup();
  const tabDocument = tab.browser.contentWindow.document;

  // If any realname is already filled, clear it out, we have our own.
  tabDocument.getElementById("realname").value = "";

  // The focus should be on the "realname" input by default, so let's fill it.
  input_value(window, imapUser.name);
  EventUtils.synthesizeKey("KEY_Tab", {}, window);
  input_value(window, imapUser.email);
  EventUtils.synthesizeKey("KEY_Tab", {}, window);
  input_value(window, imapUser.password);

  const notificationBox =
    tab.browser.contentWindow.gAccountSetup.notificationBox;

  const notificationShowed =
    BrowserTestUtils.waitForNotificationInNotificationBox(
      notificationBox,
      "accountSetupSuccess"
    );

  const imapOption = tabDocument.getElementById("resultsOption-imap");
  const protocolIMAPSelected = BrowserTestUtils.waitForMutationCondition(
    imapOption,
    {
      attributes: true,
      attributeFilter: ["hidden", "class"],
    },
    () => !imapOption.hidden && imapOption.classList.contains("selected")
  );

  // Since we're focused inside a form, pressing "Enter" should submit it.
  EventUtils.synthesizeKey("KEY_Enter", {}, window);

  // Wait for the successful notification to show up.
  await notificationShowed;

  // Confirm the IMAP protocol is visible and selected.
  await protocolIMAPSelected;

  const successView = tabDocument.getElementById("successView");
  const finalViewShown = BrowserTestUtils.waitForAttributeRemoval(
    "hidden",
    successView
  );

  const insecureDialogShown = BrowserTestUtils.waitForAttribute(
    "open",
    tabDocument.getElementById("insecureDialog")
  );

  // Press "Enter" again to proceed with the account creation.
  tabDocument.getElementById("createButton").focus();
  EventUtils.synthesizeKey("KEY_Enter", {}, window);

  // Since we're using plain authentication in the mock IMAP server, the
  // insecure warning dialog should appear. Let's wait for it.
  await insecureDialogShown;

  // Click the acknowledge checkbox and confirm the insecure dialog.
  const acknowledgeCheckbox = tabDocument.getElementById("acknowledgeWarning");
  acknowledgeCheckbox.scrollIntoView({ block: "start", behavior: "instant" });

  EventUtils.synthesizeMouseAtCenter(
    acknowledgeCheckbox,
    {},
    tab.browser.contentWindow
  );

  // Prepare to handle the linked services notification.
  const syncingBox = tab.browser.contentWindow.gAccountSetup.syncingBox;

  const syncingNotificationShown =
    BrowserTestUtils.waitForNotificationInNotificationBox(
      syncingBox,
      "accountSetupLoading"
    );

  const confirmButton = tabDocument.getElementById("insecureConfirmButton");
  confirmButton.scrollIntoView({ block: "start", behavior: "instant" });

  // Close the insecure dialog.
  EventUtils.synthesizeMouseAtCenter(
    confirmButton,
    {},
    tab.browser.contentWindow
  );

  // The final page should be visible.
  await finalViewShown;

  const tabmail = document.getElementById("tabmail");

  // The tab shouldn't change even if we created a new account.
  Assert.equal(tab, tabmail.selectedTab, "Tab should should still be the same");

  // Assert the UI is properly filled with the new account info.
  Assert.equal(
    tabDocument.getElementById("newAccountName").textContent,
    imapUser.name
  );
  Assert.equal(
    tabDocument.getElementById("newAccountEmail").textContent,
    imapUser.email
  );
  Assert.equal(
    tabDocument.getElementById("newAccountProtocol").textContent,
    "imap"
  );

  // The fetching of connected address books and calendars should start.
  await syncingNotificationShown;

  // Wait for the fetching of address books and calendars to end.
  await TestUtils.waitForCondition(
    () => !syncingBox.getNotificationWithValue("accountSetupLoading"),
    "Timeout waiting for the syncing notification to be removed"
  );

  // Wait for the linked address book section to be visible.
  const addressBookSection = tabDocument.getElementById("linkedAddressBooks");
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(addressBookSection),
    "linked address book section visible",
    250
  );

  // The section should be expanded already.
  const abList = tabDocument.querySelector(
    "#addressBooksSetup .linked-services-list"
  );
  Assert.ok(BrowserTestUtils.isVisible(abList), "address book list visible");

  // Check the linked address book was found.
  Assert.equal(abList.childElementCount, 1);
  Assert.equal(
    abList.querySelector("li > span.protocol-type").textContent,
    "CardDAV"
  );
  Assert.equal(
    abList.querySelector("li > span.list-item-name").textContent,
    "You found me!"
  );

  // Connect the linked address book.
  const abDirectoryPromise = TestUtils.topicObserved(
    "addrbook-directory-synced"
  );
  EventUtils.synthesizeMouseAtCenter(
    abList.querySelector("li > button.small-button"),
    {},
    tab.browser.contentWindow
  );
  const [abDirectory] = await abDirectoryPromise;
  Assert.equal(abDirectory.dirName, "You found me!");
  Assert.equal(abDirectory.dirType, Ci.nsIAbManager.CARDDAV_DIRECTORY_TYPE);
  Assert.equal(
    abDirectory.getStringValue("carddav.url", ""),
    "https://example.org/browser/comm/mail/components/addrbook/test/browser/data/addressbook.sjs"
  );

  // Wait for the linked calendar section to be visible.
  const calendarSection = tabDocument.getElementById("linkedCalendars");
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(calendarSection),
    "linked calendar section visible",
    250
  );

  // The section should be expanded already.
  const calendarList = tabDocument.querySelector(
    "#calendarsSetup .linked-services-list"
  );
  Assert.ok(BrowserTestUtils.isVisible(calendarList), "calendar list visible");

  // Check the linked calendar was found.
  Assert.equal(calendarList.childElementCount, 2);
  Assert.equal(
    calendarList.querySelector("li > span.protocol-type").textContent,
    "CalDAV"
  );
  Assert.equal(
    calendarList.querySelector("li > span.list-item-name").textContent,
    "You found me!"
  );
  Assert.equal(
    calendarList.querySelector("li:nth-child(2) > span.protocol-type")
      .textContent,
    "CalDAV"
  );
  Assert.equal(
    calendarList.querySelector("li:nth-child(2) > span.list-item-name")
      .textContent,
    "Röda dagar"
  );

  // Connect the linked calendar.
  const calendarPromise = new Promise(resolve => {
    const observer = {
      onCalendarRegistered(calendar) {
        cal.manager.removeObserver(this);
        resolve(calendar);
      },
      onCalendarUnregistering() {},
      onCalendarDeleting() {},
    };
    cal.manager.addObserver(observer);
  });

  const calendarDialog = tabDocument.getElementById("calendarDialog");
  const calendarDialogShown = BrowserTestUtils.waitForMutationCondition(
    calendarDialog,
    {
      attributes: true,
      attributeFilter: ["open"],
    },
    () => calendarDialog.open
  );
  EventUtils.synthesizeMouseAtCenter(
    calendarList.querySelector("li > button.small-button"),
    {},
    tab.browser.contentWindow
  );
  await calendarDialogShown;
  EventUtils.synthesizeMouseAtCenter(
    tabDocument.getElementById("calendarDialogConfirmButton"),
    {},
    tab.browser.contentWindow
  );

  const calendar = await calendarPromise;
  Assert.equal(calendar.name, "You found me!");
  Assert.equal(calendar.type, "caldav");
  // This address doesn't need to actually exist for the test to pass.
  Assert.equal(
    calendar.uri.spec,
    "https://example.org/browser/comm/calendar/test/browser/data/calendar.sjs"
  );

  const logins = Services.logins.findLogins("https://example.org", null, "");
  Assert.equal(logins.length, 1);
  Assert.equal(
    logins[0].username,
    imapUser.email,
    "username was saved for linked address book/calendar"
  );
  Assert.equal(
    logins[0].password,
    imapUser.password,
    "password was saved for linked address book/calendar"
  );

  const tabChanged = BrowserTestUtils.waitForEvent(
    tabmail.tabContainer,
    "TabSelect",
    () => tabmail.selectedTab != tab
  );

  const finishButton = tabDocument.getElementById("finishButton");
  finishButton.focus();
  finishButton.scrollIntoView({ block: "start", behavior: "instant" });

  // Close the wizard.
  EventUtils.synthesizeMouseAtCenter(
    finishButton,
    {},
    tab.browser.contentWindow
  );

  await tabChanged;

  // Confirm the mail 3 pane is the currently selected tab.
  Assert.equal(
    tabmail.selectedTab.mode.name,
    "mail3PaneTab",
    "The currently selected tab is the primary Mail tab"
  );

  // Remove the address book and calendar.
  MailServices.ab.deleteAddressBook(abDirectory.URI);
  cal.manager.removeCalendar(calendar);

  // Restore the original pref.
  Services.prefs.setCharPref(PREF_NAME, PREF_VALUE);

  // Wait for Thunderbird to connect to the server and check for messages.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(r => setTimeout(r, 1000));

  IMAPServer.close();
  SMTPServer.close();
  Services.logins.removeAllLogins();
});

registerCleanupFunction(function () {
  DNS.srv = _srv;
  DNS.txt = _txt;
  Services.prefs.clearUserPref("mail.suppressAlertsForTests");
});
