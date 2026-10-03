/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// Tests which credentials a directory uses when a password is saved for the
// server and an OAuth2 refresh token could be used as well. Some providers
// accept both mechanisms, and the saved password must win. Also tests that an
// OAuth2 token, or a password given by the user, is not sent to other servers
// during address book discovery.

const { CardDAVUtils } = ChromeUtils.importESModule(
  "resource:///modules/CardDAVUtils.sys.mjs"
);
const { HttpServer } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);
const { NotificationCallbacks } = ChromeUtils.importESModule(
  "resource:///modules/CardDAVUtils.sys.mjs"
);
const { MsgAuthPrompt } = ChromeUtils.importESModule(
  "resource:///modules/MsgAsyncPrompter.sys.mjs"
);
const { NetworkTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/NetworkTestUtils.sys.mjs"
);
const { OAuth2TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/OAuth2TestUtils.sys.mjs"
);

const LoginInfo = Components.Constructor(
  "@mozilla.org/login-manager/loginInfo;1",
  Ci.nsILoginInfo,
  "init"
);

const HOSTNAME = "test.test";
// Hosts with no OAuth2 issuer, for testing passwords.
const BASIC_HOSTNAME = "example.org";
const BASIC_ORIGIN = `http://${BASIC_HOSTNAME}`;
const SAME_SITE_HOSTNAME = "dav.example.org";
const ORIGIN = `http://${HOSTNAME}`;
const REALM = "test";
const OAUTH_ORIGIN = "oauth://test.test";
// OAuth2Providers has an issuer for HOSTNAME, with this scope for address books.
const SCOPE = "test_addressbook";
const USERNAME = "user";
const PASSWORD = "password";
const VALID_TOKEN = "refresh_token";

let server;
let otherServer;
const discoveryRequests = [];

add_setup(async function () {
  server = new HttpServer();
  server.registerPathHandler("/auth_headers", authHeadersHandler);
  server.registerPathHandler("/dav/", (request, response) =>
    discoveryHandler(
      request,
      response,
      `<current-user-principal>
        <href>http://localhost:${otherServer.identity.primaryPort}/principals/</href>
      </current-user-principal>`
    )
  );
  server.registerPathHandler("/basic-same-site/", (request, response) =>
    basicDiscoveryHandler(
      request,
      response,
      `<current-user-principal>
        <href>http://${SAME_SITE_HOSTNAME}/basic-principals/</href>
      </current-user-principal>`
    )
  );
  server.registerPathHandler("/basic-other-site/", (request, response) =>
    basicDiscoveryHandler(
      request,
      response,
      `<current-user-principal>
        <href>http://localhost:${otherServer.identity.primaryPort}/basic-principals/</href>
      </current-user-principal>`
    )
  );
  server.start(-1);
  otherServer = new HttpServer();
  otherServer.registerPathHandler("/principals/", (request, response) =>
    discoveryHandler(
      request,
      response,
      `<card:addressbook-home-set><href>/books/</href></card:addressbook-home-set>`
    )
  );
  otherServer.registerPathHandler("/books/", (request, response) =>
    discoveryHandler(
      request,
      response,
      `<resourcetype><collection/><card:addressbook/></resourcetype>
      <displayname>Other</displayname>`,
      "/books/other/"
    )
  );
  for (const s of [server, otherServer]) {
    s.registerPathHandler("/basic-principals/", (request, response) =>
      basicDiscoveryHandler(
        request,
        response,
        `<card:addressbook-home-set>
          <href>/basic-books/</href>
        </card:addressbook-home-set>`
      )
    );
    s.registerPathHandler("/basic-books/", (request, response) =>
      basicDiscoveryHandler(
        request,
        response,
        `<resourcetype><collection/><card:addressbook/></resourcetype>
        <displayname>Basic</displayname>`,
        "/basic-books/basic/"
      )
    );
  }
  otherServer.start(-1);
  server.identity.add("http", HOSTNAME, 80);
  NetworkTestUtils.configureProxy(HOSTNAME, 80, server.identity.primaryPort);
  for (const hostname of [BASIC_HOSTNAME, SAME_SITE_HOSTNAME]) {
    server.identity.add("http", hostname, 80);
    NetworkTestUtils.configureProxy(hostname, 80, server.identity.primaryPort);
  }
  await OAuth2TestUtils.startServer();

  registerCleanupFunction(async function () {
    NetworkTestUtils.unconfigureProxy(HOSTNAME, 80);
    NetworkTestUtils.unconfigureProxy(BASIC_HOSTNAME, 80);
    NetworkTestUtils.unconfigureProxy(SAME_SITE_HOSTNAME, 80);
    OAuth2TestUtils.stopServer();
    await new Promise(resolve => server.stop(resolve));
    await new Promise(resolve => otherServer.stop(resolve));
  });
});

/**
 * Echoes the authorization header the request was made with.
 *
 * @param {nsIHttpRequest} request - The received HTTP request.
 * @param {nsIHttpResponse} response - The HTTP response to populate.
 */
function authHeadersHandler(request, response) {
  if (!request.hasHeader("Authorization")) {
    response.setStatusLine("1.1", 401, "Unauthorized");
    response.setHeader("WWW-Authenticate", `Basic realm="${REALM}"`);
    return;
  }

  response.setHeader("Content-Type", "application/json", false);
  response.write(
    JSON.stringify({ authorization: request.getHeader("Authorization") })
  );
}

/**
 * Records the authorization header of a discovery request, and responds with
 * the given properties.
 *
 * @param {nsIHttpRequest} request - The received HTTP request.
 * @param {nsIHttpResponse} response - The HTTP response to populate.
 * @param {string} props - The contents of the <prop> element to respond with.
 * @param {string} [href] - The href to respond with, if not the request path.
 */
function discoveryHandler(request, response, props, href = request.path) {
  discoveryRequests.push({
    host: request.host,
    path: request.path,
    authorization: request.hasHeader("Authorization")
      ? request.getHeader("Authorization")
      : null,
  });

  response.setStatusLine("1.1", 207, "Multi-Status");
  response.setHeader("Content-Type", "text/xml");
  response.write(
    `<multistatus xmlns="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
      <response>
        <href>${href}</href>
        <propstat>
          <prop>${props}</prop>
          <status>HTTP/1.1 200 OK</status>
        </propstat>
      </response>
    </multistatus>`
  );
}

/**
 * Like discoveryHandler, but requires the user's password.
 *
 * @param {nsIHttpRequest} request - The received HTTP request.
 * @param {nsIHttpResponse} response - The HTTP response to populate.
 * @param {string} props - The contents of the <prop> element to respond with.
 * @param {string} [href] - The href to respond with, if not the request path.
 */
function basicDiscoveryHandler(request, response, props, href) {
  if (
    !request.hasHeader("Authorization") ||
    request.getHeader("Authorization") !=
      `Basic ${btoa(`${USERNAME}:${PASSWORD}`)}`
  ) {
    response.setStatusLine("1.1", 401, "Unauthorized");
    response.setHeader("WWW-Authenticate", `Basic realm="${REALM}"`);
    return;
  }
  discoveryHandler(request, response, props, href);
}

/**
 * Clear any existing saved logins and add the given ones.
 *
 * @param {object[]} logins - Zero or more login data objects. The `realm` of
 *   an OAuth2 login is its scope.
 */
async function setLogins(logins) {
  await Services.logins.removeAllLoginsAsync();
  for (const { origin, realm, username, password } of logins) {
    await Services.logins.addLoginAsync(
      new LoginInfo(origin, null, realm, username, password, "", "")
    );
  }
}

/**
 * Create a directory with the given id, make a request, and return the
 * authorization header the request was made with.
 *
 * @param {string} dirPrefId - Pref ID of the new directory.
 * @returns {Promise<string>}
 */
async function requestAuthorization(dirPrefId) {
  const directory = new CardDAVDirectory();
  directory._dirPrefId = dirPrefId;
  directory._uid = dirPrefId;
  directory.__prefBranch = Services.prefs.getBranch(
    `ldap_2.servers.${dirPrefId}.`
  );
  directory.__prefBranch.setStringPref("carddav.url", `${ORIGIN}/`);
  directory.__prefBranch.setStringPref("carddav.username", USERNAME);

  const response = await directory._makeRequest("auth_headers");
  Assert.equal(response.status, 200, "the request should have succeeded");
  return JSON.parse(response.text).authorization;
}

/** Password saved for the server, and a token that could have been used. */
add_task(async function testSavedPassword() {
  await setLogins([
    { origin: ORIGIN, realm: REALM, username: USERNAME, password: PASSWORD },
    {
      origin: OAUTH_ORIGIN,
      realm: SCOPE,
      username: USERNAME,
      password: VALID_TOKEN,
    },
  ]);

  Assert.equal(
    await requestAuthorization("savedPassword"),
    `Basic ${btoa(`${USERNAME}:${PASSWORD}`)}`,
    "the saved password should be used instead of an OAuth2 token"
  );

  OAuth2TestUtils.forgetObjects();
});

/** Password saved for the server, but belonging to a different user. */
add_task(async function testSavedPasswordOtherUser() {
  await setLogins([
    {
      origin: ORIGIN,
      realm: REALM,
      username: "someone.else@foo.invalid",
      password: PASSWORD,
    },
    {
      origin: OAUTH_ORIGIN,
      realm: SCOPE,
      username: USERNAME,
      password: VALID_TOKEN,
    },
  ]);

  Assert.equal(
    await requestAuthorization("savedPasswordOtherUser"),
    "Bearer access_token",
    "a password saved for another user should not be used"
  );

  OAuth2TestUtils.forgetObjects();
});

/** Discovery leads to a different server than the token was obtained for. */
add_task(async function testDiscoveryOnOtherServer() {
  await setLogins([
    {
      origin: OAUTH_ORIGIN,
      realm: SCOPE,
      username: USERNAME,
      password: VALID_TOKEN,
    },
  ]);

  const books = await CardDAVUtils.detectAddressBooks(
    USERNAME,
    null,
    `${ORIGIN}/dav/`
  );
  Assert.deepEqual(
    books.map(book => book.url.href),
    [`http://localhost:${otherServer.identity.primaryPort}/books/other/`],
    "the address book on the other server should be found"
  );

  Assert.deepEqual(
    discoveryRequests,
    [
      {
        host: HOSTNAME,
        path: "/dav/",
        authorization: "Bearer access_token",
      },
      { host: "localhost", path: "/principals/", authorization: null },
      { host: "localhost", path: "/books/", authorization: null },
    ],
    "the token should only be sent to the server it was obtained for"
  );

  OAuth2TestUtils.forgetObjects();
});

/** Discovery leads to a server on the same site the password was given for. */
add_task(async function testDiscoveryPasswordOnSameSite() {
  await setLogins([]);
  discoveryRequests.length = 0;

  const books = await CardDAVUtils.detectAddressBooks(
    USERNAME,
    PASSWORD,
    `${BASIC_ORIGIN}/basic-same-site/`
  );
  Assert.deepEqual(
    books.map(book => book.url.href),
    [`http://${SAME_SITE_HOSTNAME}/basic-books/basic/`],
    "the address book on the same site should be found"
  );
  Assert.deepEqual(
    discoveryRequests.map(r => `${r.host}${r.path}`),
    [
      `${BASIC_HOSTNAME}/basic-same-site/`,
      `${SAME_SITE_HOSTNAME}/basic-principals/`,
      `${SAME_SITE_HOSTNAME}/basic-books/`,
    ],
    "the password should be sent to servers on the same site"
  );
});

/** Discovery leads to a different site than the password was given for. */
add_task(async function testDiscoveryPasswordOnOtherSite() {
  await setLogins([]);
  discoveryRequests.length = 0;

  const prompts = [];
  const originalPromptAuth = MsgAuthPrompt.prototype.promptAuth;
  MsgAuthPrompt.prototype.promptAuth = function (channel, level, authInfo) {
    prompts.push({
      host: channel.URI.host,
      username: authInfo.username,
      hasPassword: !!authInfo.password,
    });
    return false;
  };
  registerCleanupFunction(() => {
    MsgAuthPrompt.prototype.promptAuth = originalPromptAuth;
  });

  await Assert.rejects(
    CardDAVUtils.detectAddressBooks(
      USERNAME,
      PASSWORD,
      `${BASIC_ORIGIN}/basic-other-site/`
    ),
    /Authorization failure/,
    "discovery should fail when the user does not give a password"
  );
  MsgAuthPrompt.prototype.promptAuth = originalPromptAuth;

  Assert.deepEqual(
    prompts,
    [{ host: "localhost", username: USERNAME, hasPassword: false }],
    "the user should be asked, without the password filled in"
  );
  Assert.deepEqual(
    discoveryRequests.map(r => `${r.host}${r.path}`),
    [`${BASIC_HOSTNAME}/basic-other-site/`],
    "the password should not be sent to a server on another site"
  );
});

/** A server on the same site, but with or without TLS, asks for the password. */
add_task(async function testPasswordSiteScheme() {
  await setLogins([]);

  const prompts = [];
  const originalPromptAuth = MsgAuthPrompt.prototype.promptAuth;
  MsgAuthPrompt.prototype.promptAuth = function (channel, level, authInfo) {
    prompts.push({
      host: channel.URI.host,
      hasPassword: !!authInfo.password,
    });
    return false;
  };
  registerCleanupFunction(() => {
    MsgAuthPrompt.prototype.promptAuth = originalPromptAuth;
  });

  const callbacks = new NotificationCallbacks(USERNAME, PASSWORD);
  callbacks.passwordSite = `https://${BASIC_HOSTNAME}`;
  const promptAuth = uri => {
    const authInfo = { flags: 0, username: "", password: "", realm: REALM };
    const ok = callbacks.promptAuth(
      { URI: Services.io.newURI(uri) },
      Ci.nsIAuthPrompt2.LEVEL_NONE,
      authInfo
    );
    return ok ? authInfo.password : null;
  };

  Assert.equal(
    promptAuth(`https://${SAME_SITE_HOSTNAME}:8443/`),
    PASSWORD,
    "the password should be used for the same site"
  );
  Assert.equal(
    promptAuth(`http://${SAME_SITE_HOSTNAME}/`),
    null,
    "the password should not be used without TLS"
  );

  callbacks.passwordSite = `http://${BASIC_HOSTNAME}`;
  Assert.equal(
    promptAuth(`http://${SAME_SITE_HOSTNAME}/`),
    PASSWORD,
    "the password should be used for a site given without TLS"
  );
  Assert.equal(
    promptAuth(`https://${SAME_SITE_HOSTNAME}/`),
    PASSWORD,
    "the password should be used with TLS on a site given without TLS"
  );
  MsgAuthPrompt.prototype.promptAuth = originalPromptAuth;

  Assert.deepEqual(
    prompts,
    [{ host: SAME_SITE_HOSTNAME, hasPassword: false }],
    "the user should only be asked, without the password filled in, for the server without TLS"
  );
});
