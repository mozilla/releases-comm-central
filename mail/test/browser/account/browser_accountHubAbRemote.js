/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { CardDAVDirectory } = ChromeUtils.importESModule(
  "resource:///modules/CardDAVDirectory.sys.mjs"
);
const { CardDAVServer } = ChromeUtils.importESModule(
  "resource://testing-common/CardDAVServer.sys.mjs"
);
const { DNS } = ChromeUtils.importESModule("resource:///modules/DNS.sys.mjs");
const { HttpsProxy } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/HttpsProxy.sys.mjs"
);
const { OAuth2TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/OAuth2TestUtils.sys.mjs"
);
const { RemoteAddressBookUtils } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/RemoteAddressBookUtils.sys.mjs"
);

add_setup(async () => {
  CardDAVServer.open("test@example.com", "hunter2");
  const proxy = await HttpsProxy.create(
    CardDAVServer.port,
    "dav",
    "carddav.test"
  );
  Services.fog.testResetFOG();
  // Replace method for discovering address books for existing accounts with a
  // mock so that search doesn't influence the tests in this file.
  const gABFEA = RemoteAddressBookUtils.getAddressBooksForExistingAccounts;
  RemoteAddressBookUtils.getAddressBooksForExistingAccounts = async () => [];

  registerCleanupFunction(async () => {
    CardDAVServer.reset();
    await CardDAVServer.close();
    proxy.destroy();

    const dialog = document.querySelector("account-hub-container").modal;
    if (dialog?.open) {
      const subview = dialog.querySelector(
        "account-hub-address-book > :not([hidden], #addressBookFooter)"
      );
      await subtest_close_account_hub_dialog(dialog, subview);
    }
    Assert.ok(!dialog?.open, "Account hub dialog should be closed");

    const logins = await Services.logins.getAllLogins();
    Assert.equal(logins.length, 0, "no faulty logins were saved");
    Services.logins.removeAllLogins();
    RemoteAddressBookUtils.getAddressBooksForExistingAccounts = gABFEA;
  });
});

add_task(async function test_remoteAddressBookPassword() {
  const dialog = await subtest_open_account_hub_dialog("ADDRESS_BOOK");
  await goToRemoteForm(dialog);
  await fillInForm(dialog, "https://carddav.test/");

  const passwordStep = dialog.querySelector("#addressBookPasswordSubview");
  await BrowserTestUtils.waitForAttributeRemoval("hidden", passwordStep);

  Assert.ok(
    BrowserTestUtils.isVisible(passwordStep),
    "Should show password entry step"
  );

  EventUtils.sendString(CardDAVServer.password);

  const forward = dialog.querySelector("#addressBookFooter #forward");
  EventUtils.synthesizeMouseAtCenter(forward, {}, window);

  await checkSyncSubview(dialog);

  await dialog.querySelector("account-hub-address-book").reset();
});

add_task(async function test_remoteAddressBookFormPwFromStorage() {
  const login = await createLogin("https://carddav.test");
  const dialog = await subtest_open_account_hub_dialog("ADDRESS_BOOK");
  await goToRemoteForm(dialog);
  await fillInForm(dialog, "https://carddav.test/", false);

  Assert.ok(
    BrowserTestUtils.isHidden(
      dialog.querySelector("#addressBookPasswordSubview")
    ),
    "Should not get password entry step"
  );

  await checkSyncSubview(dialog);

  Services.logins.removeLogin(login);

  await dialog.querySelector("account-hub-address-book").reset();
});

add_task(
  async function test_remoteAddressBookFormInferHostFromUsernamePwFromStorage() {
    const login = await createLogin("https://example.com");
    const _srv = DNS.srv;
    DNS.srv = name => {
      if (name != "_carddavs._tcp.example.com") {
        return [];
      }
      return [{ prio: 0, weight: 0, host: "carddav.test", port: 443 }];
    };

    const dialog = await subtest_open_account_hub_dialog("ADDRESS_BOOK");
    await goToRemoteForm(dialog);
    await fillInForm(dialog, "", false);

    Assert.ok(
      BrowserTestUtils.isHidden(
        dialog.querySelector("#addressBookPasswordSubview")
      ),
      "Should not get password entry step"
    );

    await checkSyncSubview(dialog);

    Services.logins.removeLogin(login);
    const logins = await Services.logins.searchLoginsAsync({
      origin: "https://carddav.test",
    });
    Assert.equal(
      logins.length,
      1,
      "Login should be duplicated to redirected origin"
    );
    Services.logins.removeLogin(logins[0]);
    DNS.srv = _srv;
    await dialog.querySelector("account-hub-address-book").reset();
  }
);

add_task(async function test_remoteAddressBookFormOauth() {
  await OAuth2TestUtils.startServer({
    username: CardDAVServer.username,
    password: "oat",
  });
  CardDAVServer.password = "access_token";
  const proxy = await HttpsProxy.create(
    CardDAVServer.port,
    "valid",
    "test.test"
  );
  const dialog = await subtest_open_account_hub_dialog("ADDRESS_BOOK");
  await goToRemoteForm(dialog);
  await fillInForm(dialog, "https://test.test/", false);

  Assert.ok(
    BrowserTestUtils.isHidden(
      dialog.querySelector("#addressBookPasswordSubview")
    ),
    "Should not get password entry step"
  );

  const oauthWindowOpen = OAuth2TestUtils.promiseOAuthWindow();
  const synced = checkSyncSubview(dialog, "https://test.test");
  const oAuthWindow = await oauthWindowOpen;
  await SpecialPowers.spawn(
    oAuthWindow.getBrowser(),
    [{ username: CardDAVServer.username, password: "oat" }],
    OAuth2TestUtils.submitOAuthLogin
  );
  await synced;

  const logins = await Services.logins.searchLoginsAsync({
    origin: "oauth://test.test",
  });
  Assert.equal(logins.length, 1, "Should have one oauth credential");
  Assert.equal(
    logins[0].httpRealm,
    "test_mail test_addressbook test_calendar",
    "Oauth credential should have correct scopes"
  );
  Assert.equal(
    logins[0].username,
    "test@example.com",
    "OAuth credential should have expected username"
  );
  Assert.equal(
    logins[0].password,
    "refresh_token",
    "OAuth credential should have refresh token as password"
  );

  await dialog.querySelector("account-hub-address-book").reset();
  Services.logins.removeLogin(logins[0]);
  proxy.destroy();
  OAuth2TestUtils.stopServer();
  OAuth2TestUtils.checkTelemetry([
    {
      issuer: "test.test",
      reason: "no refresh token",
      result: "succeeded",
    },
  ]);
  CardDAVServer.password = "hunter2";
});

add_task(async function test_notACardDAVServer() {
  CardDAVServer.server.registerPathHandler("/", null);
  CardDAVServer.server.registerPathHandler("/.well-known/carddav", null);
  const login = await createLogin("https://carddav.test");

  const dialog = await subtest_open_account_hub_dialog("ADDRESS_BOOK");
  await goToRemoteForm(dialog);
  const loading = waitDuringBusy(dialog);
  await fillInForm(dialog, "https://carddav.test/", false);

  await loading;
  await showingError(
    dialog,
    "addressBookRemoteAccountFormSubview",
    "address-book-carddav-connection-error"
  );

  Services.logins.removeLogin(login);
  CardDAVServer.resetHandlers();
  await dialog.querySelector("account-hub-address-book").reset();
});

add_task(async function test_noCardDAVWellKnown() {
  CardDAVServer.server.registerPathHandler("/.well-known/carddav", null);
  const login = await createLogin("https://carddav.test");

  const dialog = await subtest_open_account_hub_dialog("ADDRESS_BOOK");
  await goToRemoteForm(dialog);
  await fillInForm(dialog, "https://carddav.test");
  await checkSyncSubview(dialog);

  Services.logins.removeLogin(login);
  CardDAVServer.resetHandlers();
  await dialog.querySelector("account-hub-address-book").reset();
});

add_task(async function test_appleCardDAVServer() {
  CardDAVServer.server.registerPathHandler(
    "/.well-known/carddav",
    (request, response) => {
      response.setStatusLine("1.1", 207, "Multi-Status");
      response.setHeader("Content-Type", "text/xml");
      response.write(
        `<multistatus xmlns="DAV:">
        <response>
          <href>/.well-known/carddav/</href>
          <propstat>
            <prop>
              <current-user-principal/>
            </prop>
            <status>HTTP/1.1 404 Not Found</status>
          </propstat>
        </response>
      </multistatus>`.replace(/>\s+</g, "><")
      );
    }
  );
  const login = await createLogin("https://carddav.test");

  const dialog = await subtest_open_account_hub_dialog("ADDRESS_BOOK");
  await goToRemoteForm(dialog);
  await fillInForm(dialog, "https://carddav.test");
  await checkSyncSubview(dialog);

  Services.logins.removeLogin(login);
  CardDAVServer.resetHandlers();
  await dialog.querySelector("account-hub-address-book").reset();
});

add_task(async function test_wrongPassword() {
  const dialog = await subtest_open_account_hub_dialog("ADDRESS_BOOK");
  await goToRemoteForm(dialog);
  await fillInForm(dialog, "https://carddav.test/");

  const passwordStep = dialog.querySelector("#addressBookPasswordSubview");
  await BrowserTestUtils.waitForAttributeRemoval("hidden", passwordStep);

  Assert.ok(
    BrowserTestUtils.isVisible(passwordStep),
    "Should show password entry step"
  );

  info("Entering incorrect password");
  EventUtils.sendString("*******");

  const loading = waitDuringBusy(dialog);
  const forward = dialog.querySelector("#addressBookFooter #forward");
  EventUtils.synthesizeMouseAtCenter(forward, {}, window);

  await loading;
  await showingError(
    dialog,
    "addressBookPasswordSubview",
    "address-book-carddav-connection-error"
  );

  info("Clearing password field");
  EventUtils.synthesizeMouseAtCenter(
    passwordStep.querySelector("#password"),
    {}
  );
  EventUtils.synthesizeKey("KEY_Backspace", { repeat: 7 });
  info("Entering correct password");
  const passwordOk = BrowserTestUtils.waitForEvent(
    passwordStep,
    "config-updated",
    true,
    event =>
      event.detail.completed &&
      passwordStep.querySelector("#password").value === CardDAVServer.password
  );
  EventUtils.sendString(CardDAVServer.password);
  await passwordOk;
  EventUtils.synthesizeMouseAtCenter(forward, {}, window);

  await checkSyncSubview(dialog);

  await dialog.querySelector("account-hub-address-book").reset();
});

add_task(async function test_emailWithoutServer() {
  const login = await createLogin("https://test.invalid", "alice@test.invalid");

  const dialog = await subtest_open_account_hub_dialog("ADDRESS_BOOK");
  await goToRemoteForm(dialog);
  const loading = waitDuringBusy(dialog);
  await fillInForm(
    dialog,
    "https://test.invalid/",
    false,
    "alice@test.invalid"
  );

  await loading;
  await showingError(
    dialog,
    "addressBookRemoteAccountFormSubview",
    "address-book-carddav-connection-error"
  );

  Services.logins.removeLogin(login);
  await dialog.querySelector("account-hub-address-book").reset();
});

add_task(async function test_dnsWithTXT() {
  const login = await createLogin("https://example.com");
  const _srv = DNS.srv;
  const _txt = DNS.txt;
  DNS.srv = name => {
    if (name != "_carddavs._tcp.example.com") {
      return [];
    }
    return [{ prio: 0, weight: 0, host: "example.org", port: 443 }];
  };
  DNS.txt = name => {
    if (name != "_carddavs._tcp.example.com") {
      return [];
    }
    return [
      {
        strings: [
          "path=/browser/comm/mail/components/addrbook/test/browser/data/dns.sjs",
        ],
      },
    ];
  };

  const dialog = await subtest_open_account_hub_dialog("ADDRESS_BOOK");
  await goToRemoteForm(dialog);
  await fillInForm(dialog, "", false);

  Assert.ok(
    BrowserTestUtils.isHidden(
      dialog.querySelector("#addressBookPasswordSubview")
    ),
    "Should not get password entry step"
  );

  const syncSubview = dialog.querySelector("#addressBookSyncSubview");

  await BrowserTestUtils.waitForAttributeRemoval("hidden", syncSubview);

  const addressBooks = syncSubview.querySelectorAll(
    "#addressBookAccountsContainer input"
  );
  Assert.equal(addressBooks.length, 1, "Should find one remote address books");

  const foundAb = syncSubview.querySelector(
    `#addressBookAccountsContainer input[data-url="https://example.org/browser/comm/mail/components/addrbook/test/browser/data/addressbook.sjs"]`
  );
  Assert.ok(foundAb, "Should find entry for the address book");

  Services.logins.removeLogin(login);
  DNS.srv = _srv;
  DNS.txt = _txt;
  await dialog.querySelector("account-hub-address-book").reset();
});

add_task(async function test_directoryWithNoName() {
  const books = CardDAVServer.books;
  CardDAVServer.books = { "/addressbooks/me/noname/": undefined };
  CardDAVServer.resetHandlers();
  const login = await createLogin("https://carddav.test");

  const dialog = await subtest_open_account_hub_dialog("ADDRESS_BOOK");
  await goToRemoteForm(dialog);
  await fillInForm(dialog, "https://carddav.test");

  const forward = dialog.querySelector("#addressBookFooter #forward");
  const syncSubview = dialog.querySelector("#addressBookSyncSubview");

  await BrowserTestUtils.waitForAttributeRemoval("hidden", syncSubview);

  const addressBooks = syncSubview.querySelectorAll(
    "#addressBookAccountsContainer input"
  );
  Assert.equal(addressBooks.length, 1, "Should find one remote address books");

  const abEntry = syncSubview.querySelector(
    '#addressBookAccountsContainer input[data-url="https://carddav.test/addressbooks/me/noname/"]'
  );
  Assert.ok(abEntry, "Should display the unnamed address book");

  const syncPromise = TestUtils.topicObserved("addrbook-directory-synced");
  EventUtils.synthesizeMouseAtCenter(forward, {}, window);

  Assert.equal(
    MailServices.ab.directories.length,
    3,
    "Should now have one more address book"
  );

  const [directory] = await syncPromise;
  Assert.equal(
    directory.getStringValue("carddav.url", ""),
    "https://carddav.test/addressbooks/me/noname/",
    "Synced directory should be from our server"
  );
  Assert.equal(
    directory.dirName,
    "noname",
    "Directory should have expected name"
  );
  const davDirectory = CardDAVDirectory.forFile(directory.fileName);
  Assert.notEqual(
    davDirectory._syncTimer,
    null,
    "Should have scheduled a sync"
  );

  const removePromise = TestUtils.topicObserved(
    "addrbook-directory-deleted",
    subject => subject == directory
  );
  MailServices.ab.deleteAddressBook(directory.URI);
  await removePromise;

  Assert.equal(
    MailServices.ab.directories.length,
    2,
    "Should be back to the initial directory count"
  );

  Services.logins.removeLogin(login);
  CardDAVServer.books = books;
  CardDAVServer.resetHandlers();
  await dialog.querySelector("account-hub-address-book").reset();
});

add_task(async function test_invalidCertificate() {
  const login = await createLogin("https://expired.example.com");

  const dialog = await subtest_open_account_hub_dialog("ADDRESS_BOOK");
  await goToRemoteForm(dialog);
  const certErrorPromise = BrowserTestUtils.promiseAlertDialog(
    "cancel",
    "chrome://pippki/content/exceptionDialog.xhtml"
  );
  const loading = waitDuringBusy(dialog);
  await fillInForm(dialog, "https://expired.example.com/", false);
  info("Waiting for cert override dialog...");
  await certErrorPromise;
  info("Waiting for loading to stop...");
  await loading;
  await showingError(
    dialog,
    "addressBookRemoteAccountFormSubview",
    "address-book-carddav-connection-error"
  );

  Services.logins.removeLogin(login);
  CardDAVServer.resetHandlers();
  await dialog.querySelector("account-hub-address-book").reset();
});

add_task(async function test_remoteAddressBookRememberPassword() {
  // Enable password remembering.
  await SpecialPowers.pushPrefEnv({
    set: [["signon.rememberSignons", true]],
  });

  const dialog = await subtest_open_account_hub_dialog("ADDRESS_BOOK");
  await goToRemoteForm(dialog);
  await fillInForm(dialog, "https://carddav.test/");

  const passwordStep = dialog.querySelector("#addressBookPasswordSubview");
  await BrowserTestUtils.waitForAttributeRemoval("hidden", passwordStep);

  Assert.ok(
    BrowserTestUtils.isVisible(passwordStep),
    "Should show password entry step"
  );

  EventUtils.sendString(CardDAVServer.password);

  const forward = dialog.querySelector("#addressBookFooter #forward");
  EventUtils.synthesizeMouseAtCenter(forward, {}, window);

  await checkSyncSubview(dialog);

  const logins = await Services.logins.searchLoginsAsync({
    origin: "https://carddav.test",
  });
  Assert.equal(logins.length, 1, "Should have one login stored for the origin");
  Assert.equal(
    logins[0].username,
    CardDAVServer.username,
    "Should store the expected username"
  );
  Assert.equal(
    logins[0].password,
    CardDAVServer.password,
    "Should store the expected password"
  );
  Services.logins.removeLogin(logins[0]);

  await dialog.querySelector("account-hub-address-book").reset();
  await SpecialPowers.popPrefEnv();
});

/**
 * Open the remote address book form in the account hub dialog.
 *
 * @param {HTMLDialogElement} dialog - The account hub dialog.
 */
async function goToRemoteForm(dialog) {
  const remoteAccountFormSubview = dialog.querySelector(
    "#addressBookRemoteAccountFormSubview"
  );

  EventUtils.synthesizeMouseAtCenter(
    dialog.querySelector("address-book-option-select #addRemoteAddressBook"),
    {},
    window
  );
  await BrowserTestUtils.waitForAttributeRemoval(
    "hidden",
    remoteAccountFormSubview
  );
  Assert.ok(
    BrowserTestUtils.isVisible(remoteAccountFormSubview),
    "Remote account form subview should be visible"
  );
}

/**
 * Fill in the remote address book form and submit it.
 *
 * @param {HTMLDialogElement} dialog - The account hub dialog.
 * @param {string} [server] - The server URL, can be omitted for auto detection.
 * @param {boolean} [shouldContinue=true] - If we're expecting form submission
 *   to advance.
 * @param {string} [username=CardDAVServer.username] - The username to enter,
 *   defaults to the username the CardDAVServer expects.
 */
async function fillInForm(
  dialog,
  server,
  shouldContinue = true,
  username = CardDAVServer.username
) {
  const remoteAccountFormSubview = dialog.querySelector(
    "#addressBookRemoteAccountFormSubview"
  );
  const forward = dialog.querySelector("#addressBookFooter #forward");

  EventUtils.sendString(username);
  if (server) {
    EventUtils.synthesizeKey("KEY_Tab", {}, window);
    EventUtils.sendString(server);
  }

  await BrowserTestUtils.waitForAttributeRemoval("disabled", forward);

  EventUtils.synthesizeMouseAtCenter(forward, {}, window);

  if (!shouldContinue) {
    return;
  }
  await BrowserTestUtils.waitForMutationCondition(
    remoteAccountFormSubview,
    {
      attributes: true,
      attributeFilter: ["hidden"],
    },
    () => BrowserTestUtils.isHidden(remoteAccountFormSubview)
  );
}

/**
 * Handle the address book sync subview and add all available address books.
 * Then verify they're added and remove them again.
 *
 * @param {HTMLDialogElement} dialog - Reference to the account hub dialog.
 * @param {string} [origin="https://carddav.test"] - The origin for the CardDAV
 *   server. Should match the origin of the proxy we discover the books on.
 */
async function checkSyncSubview(dialog, origin = "https://carddav.test") {
  const forward = dialog.querySelector("#addressBookFooter #forward");
  const syncSubview = dialog.querySelector("#addressBookSyncSubview");

  await BrowserTestUtils.waitForAttributeRemoval("hidden", syncSubview);

  const addressBooks = syncSubview.querySelectorAll(
    "#addressBookAccountsContainer input"
  );
  Assert.equal(addressBooks.length, 2, "Should find two remote address books");

  const otherAb = syncSubview.querySelector(
    `#addressBookAccountsContainer input[data-url="${origin}${CardDAVServer.altPath}"]`
  );
  EventUtils.synthesizeMouseAtCenter(otherAb, {}, window);

  const syncPromise = TestUtils.topicObserved("addrbook-directory-synced");
  EventUtils.synthesizeMouseAtCenter(forward, {}, window);

  Assert.equal(
    MailServices.ab.directories.length,
    3,
    "Should now have one more address books"
  );

  const [directory] = await syncPromise;
  Assert.equal(
    directory.getStringValue("carddav.url", ""),
    `${origin}${CardDAVServer.path}`,
    "Synced directory should be from our server"
  );
  Assert.equal(
    directory.dirName,
    "CardDAV Test",
    "Directory should have expected name"
  );
  const davDirectory = CardDAVDirectory.forFile(directory.fileName);
  Assert.notEqual(
    davDirectory._syncTimer,
    null,
    "Should have scheduled a sync"
  );

  const removePromise = TestUtils.topicObserved(
    "addrbook-directory-deleted",
    subject => subject == directory
  );
  MailServices.ab.deleteAddressBook(directory.URI);
  await removePromise;

  Assert.equal(
    MailServices.ab.directories.length,
    2,
    "Should be back to the initial directory count"
  );
}

/**
 * Wait while the address book flow is fetching address books.
 *
 * @param {HTMLDialogElement} dialog - Reference to the account hub dialog.
 */
async function waitDuringBusy(dialog) {
  const abView = dialog.querySelector("account-hub-address-book");
  await BrowserTestUtils.waitForMutationCondition(
    abView,
    {
      attributes: true,
      attributeFilter: ["class"],
    },
    () => abView.classList.contains("busy")
  );
  info("Account hub busy...");
  await BrowserTestUtils.waitForMutationCondition(
    abView,
    {
      attributes: true,
      attributeFilter: ["class"],
    },
    () => !abView.classList.contains("busy")
  );
}

/**
 * Check that an error is being displayed.
 *
 * @param {HTMLDialogElement} dialog - Reference to the account hub dialog.
 * @param {string} stepId - ID of the step the error should be shown in.
 * @param {string} errorStringId - The fluent ID of the error to expect.
 */
async function showingError(dialog, stepId, errorStringId) {
  const step = dialog.querySelector(`#${stepId}`);
  const header = step.shadowRoot.querySelector("account-hub-header");
  const errorTitle = header.shadowRoot.querySelector(
    "#emailFormNotificationTitle"
  );
  info(`Waiting for ${errorStringId} in #${stepId}...`);
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
    errorStringId,
    "Should display error"
  );
}

/**
 * Create and store a new login. All parameters default to the values from the
 * CardDAVServer config.
 *
 * @param {string} [origin] - Origin for the login.
 * @param {string} [username] - Username in the login.
 * @param {string} [password] - Password of the login.
 * @returns {Promise<nsILoginInfo>} - Resolves to the stored login instance.
 */
function createLogin(
  origin = CardDAVServer.origin,
  username = CardDAVServer.username,
  password = CardDAVServer.password
) {
  const login = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(
    Ci.nsILoginInfo
  );
  login.init(origin, null, "test", username, password, "", "");
  return Services.logins.addLoginAsync(login);
}
