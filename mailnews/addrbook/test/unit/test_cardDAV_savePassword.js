/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// Tests what a directory keeps of the credentials typed into the password
// prompt. The server accepting them is what counts, not what it then makes
// of the request.

const { HttpServer } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);
var { MockRegistrar } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistrar.sys.mjs"
);

const REALM = "test";
const USERNAME = "bob";
const PASSWORD = "bob's password";
const STALE_USERNAME = "robert";

let server;
let origin;

/** What the server answers once it has accepted the credentials. */
let acceptedResponse = { status: 207, statusText: "Multi-Status" };

/** How the password prompt is answered, and how often it was shown. */
let passwordPrompt = { username: USERNAME, password: PASSWORD, remember: true };

/** Answers the password prompt instead of opening a window. */
const windowWatcher = {
  QueryInterface: ChromeUtils.generateQI(["nsIWindowWatcher"]),
  activeWindow: null,
  openWindow(parent, url, name, features, args) {
    Assert.equal(
      url,
      "chrome://global/content/commonDialog.xhtml",
      "the password prompt should be the window that opens"
    );

    const bag = args.QueryInterface(Ci.nsIWritablePropertyBag);
    passwordPrompt.count++;
    passwordPrompt.checkLabel = bag.getProperty("checkLabel");
    bag.setProperty("user", passwordPrompt.username);
    bag.setProperty("pass", passwordPrompt.password);
    bag.setProperty("checked", passwordPrompt.remember);
    bag.setProperty("ok", true);
  },
};

/**
 * Demands the credentials, then answers with whatever `acceptedResponse` says.
 *
 * @param {nsIHttpRequest} request - The received HTTP request.
 * @param {nsIHttpResponse} response - The HTTP response to populate.
 */
function requestHandler(request, response) {
  const expected = `Basic ${btoa(`${USERNAME}:${PASSWORD}`)}`;
  if (
    !request.hasHeader("Authorization") ||
    request.getHeader("Authorization") != expected
  ) {
    response.setStatusLine("1.1", 401, "Unauthorized");
    response.setHeader("WWW-Authenticate", `Basic realm="${REALM}"`);
    return;
  }

  response.setStatusLine(
    "1.1",
    acceptedResponse.status,
    acceptedResponse.statusText
  );
  response.setHeader("Content-Type", "text/xml");
}

/**
 * Create a directory pointing at the server, with a username that is no
 * longer the right one.
 *
 * @param {string} dirPrefId - Pref ID of the new directory.
 * @returns {CardDAVDirectory}
 */
function createDirectory(dirPrefId) {
  const directory = new CardDAVDirectory();
  directory._dirPrefId = dirPrefId;
  directory._uid = dirPrefId;
  directory.__prefBranch = Services.prefs.getBranch(
    `ldap_2.servers.${dirPrefId}.`
  );
  directory.__prefBranch.setStringPref("carddav.url", `${origin}/`);
  directory.__prefBranch.setStringPref("carddav.username", STALE_USERNAME);
  return directory;
}

/**
 * Forget every saved login and reset what the server and the prompt do. The
 * credentials of an earlier task live on in the HTTP auth cache, which would
 * spare the next one the password prompt.
 */
async function reset() {
  await Services.logins.removeAllLoginsAsync();
  Cc["@mozilla.org/network/http-auth-manager;1"]
    .getService(Ci.nsIHttpAuthManager)
    .clearAll();
  acceptedResponse = { status: 207, statusText: "Multi-Status" };
  passwordPrompt = {
    username: USERNAME,
    password: PASSWORD,
    remember: true,
    count: 0,
  };
}

/**
 * Check the logins saved for the server.
 *
 * @param {object[]} expected - Zero or one {username, password} object.
 */
async function assertSavedLogins(expected) {
  const logins = await Services.logins.searchLoginsAsync({ origin });
  Assert.deepEqual(
    logins.map(login => ({
      username: login.username,
      password: login.password,
    })),
    expected,
    "the right credentials should be saved for the server"
  );
  for (const login of logins) {
    Assert.equal(
      login.httpRealm,
      REALM,
      "the login should be saved for the realm the server named"
    );
  }
}

add_setup(async function () {
  server = new HttpServer();
  server.registerPathHandler("/", requestHandler);
  server.start(-1);
  origin = `http://localhost:${server.identity.primaryPort}`;

  const cid = MockRegistrar.register(
    "@mozilla.org/embedcomp/window-watcher;1",
    windowWatcher
  );

  registerCleanupFunction(async function () {
    MockRegistrar.unregister(cid);
    await new Promise(resolve => server.stop(resolve));
  });
});

/** The server accepts the credentials and answers as expected. */
add_task(async function testExpectedStatus() {
  await reset();

  const directory = createDirectory("expectedStatus");
  const response = await directory._makeRequest("", {
    expectedStatuses: [207],
  });

  Assert.equal(response.status, 207, "the request should have succeeded");
  Assert.equal(
    passwordPrompt.count,
    1,
    "the user should have been prompted once"
  );
  Assert.ok(
    passwordPrompt.checkLabel,
    "the prompt should have offered to remember the password"
  );
  await assertSavedLogins([{ username: USERNAME, password: PASSWORD }]);
  Assert.equal(
    directory.getStringValue("carddav.username", ""),
    USERNAME,
    "the directory should have taken over the username that was typed"
  );
});

/**
 * The server accepts the credentials but refuses the request for some other
 * reason. The credentials are good and must be kept.
 */
add_task(async function testUnexpectedStatus() {
  await reset();
  acceptedResponse = { status: 412, statusText: "Precondition Failed" };

  const directory = createDirectory("unexpectedStatus");
  await Assert.rejects(
    directory._makeRequest("", { expectedStatuses: [207] }),
    /Incorrect response from server: 412 Precondition Failed/,
    "the request should have failed on the unexpected status"
  );

  Assert.equal(
    passwordPrompt.count,
    1,
    "the user should have been prompted once"
  );
  await assertSavedLogins([{ username: USERNAME, password: PASSWORD }]);
  Assert.equal(
    directory.getStringValue("carddav.username", ""),
    USERNAME,
    "the directory should have taken over the username that was typed"
  );
});

/** The server rejects the credentials. Nothing may be kept. */
add_task(async function testRejectedCredentials() {
  await reset();
  passwordPrompt.password = "not the password";

  const directory = createDirectory("rejectedCredentials");
  await Assert.rejects(
    directory._makeRequest("", { expectedStatuses: [207] }),
    /Authorization failure/,
    "the request should have failed on the credentials"
  );

  Assert.equal(
    passwordPrompt.count,
    1,
    "the user should have been prompted once"
  );
  await assertSavedLogins([]);
  Assert.equal(
    directory.getStringValue("carddav.username", ""),
    STALE_USERNAME,
    "the directory should have kept the username it had"
  );
});

/** The user doesn't want the password remembered. */
add_task(async function testPasswordNotRemembered() {
  await reset();
  acceptedResponse = { status: 412, statusText: "Precondition Failed" };
  passwordPrompt.remember = false;

  const directory = createDirectory("passwordNotRemembered");
  await Assert.rejects(
    directory._makeRequest("", { expectedStatuses: [207] }),
    /Incorrect response from server: 412 Precondition Failed/,
    "the request should have failed on the unexpected status"
  );

  await assertSavedLogins([]);
});
