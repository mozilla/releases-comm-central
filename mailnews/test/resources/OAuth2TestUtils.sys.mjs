/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Utils for testing interactions with OAuth2 authentication servers.
 */

import { BrowserTestUtils } from "resource://testing-common/BrowserTestUtils.sys.mjs";
import { CommonUtils } from "resource://services-common/utils.sys.mjs";
import { HttpServer, HTTP_405 } from "resource://testing-common/httpd.sys.mjs";
import { NetworkTestUtils } from "resource://testing-common/mailnews/NetworkTestUtils.sys.mjs";

const { OAuth2Module } = ChromeUtils.import(
  "resource:///modules/OAuth2Module.jsm"
);

const validCodes = new Set();

export const OAuth2TestUtils = {
  /**
   * Start an OAuth2 server and add it to the proxy at oauth.test.test:80.
   *
   * @param {object} testScope - The JS scope for the current test, so
   *   `registerCleanupFunction` can be used.
   */
  startServer(testScope) {
    const oAuth2Server = new OAuth2Server(testScope);
    oAuth2Server.httpServer.identity.add("http", "oauth.test.test", 80);
    NetworkTestUtils.configureProxy(
      "oauth.test.test",
      80,
      oAuth2Server.httpServer.identity.primaryPort
    );
    testScope.registerCleanupFunction(() => {
      NetworkTestUtils.clearProxy();
    });
    return oAuth2Server;
  },

  /**
   * Forget any `OAuth2` objects remembered by OAuth2Module.jsm
   */
  forgetObjects() {
    OAuth2Module._forgetObjects();
  },

  /**
   * Waits for a login prompt window to appear and load.
   *
   * @returns {Window}
   */
  async promiseOAuthWindow() {
    const oAuthWindow = await BrowserTestUtils.domWindowOpenedAndLoaded(
      undefined,
      win =>
        win.document.documentURI ==
        "chrome://messenger/content/browserRequest.xhtml"
    );
    const oAuthBrowser = oAuthWindow.getBrowser();
    if (
      oAuthBrowser.webProgress?.isLoadingDocument ||
      oAuthBrowser.currentURI.spec == "about:blank"
    ) {
      await BrowserTestUtils.browserLoaded(oAuthBrowser);
    }
    return oAuthWindow;
  },

  /**
   * Callback function to run in a login prompt window. Note: This function is
   * serialized by SpecialPowers, so it can't use function shorthand.
   *
   * @param {object} options
   * @param {string} [options.expectedHint] - If given, the login_hint URL parameter
   *   will be checked.
   * @param {string} options.username - The username to use to log in.
   * @param {string} options.password - The password to use to log in.
   */
  submitOAuthLogin: ({ expectedHint, username, password }) => {
    /* globals content, EventUtils */
    const searchParams = new URL(content.location).searchParams;
    Assert.equal(
      searchParams.get("response_type"),
      "code",
      "request response_type"
    );
    Assert.equal(
      searchParams.get("client_id"),
      "test_client_id",
      "request client_id"
    );
    Assert.equal(
      searchParams.get("redirect_uri"),
      "https://localhost",
      "request redirect_uri"
    );
    Assert.equal(searchParams.get("scope"), "test_scope", "request scope");
    if (expectedHint) {
      Assert.equal(
        searchParams.get("login_hint"),
        expectedHint,
        "request login_hint"
      );
    }

    EventUtils.synthesizeMouseAtCenter(
      content.document.querySelector(`input[name="username"]`),
      {},
      content
    );
    EventUtils.sendString(username, content);
    EventUtils.synthesizeMouseAtCenter(
      content.document.querySelector(`input[name="password"]`),
      {},
      content
    );
    EventUtils.sendString(password, content);
    EventUtils.synthesizeMouseAtCenter(
      content.document.querySelector(`input[type="submit"]`),
      {},
      content
    );
  },
};

class OAuth2Server {
  username = "user";
  password = "password";
  accessToken = "access_token";
  refreshToken = "refresh_token";
  expiry = null;

  constructor(testScope) {
    this.httpServer = new HttpServer();
    this.httpServer.registerPathHandler("/form", this.formHandler.bind(this));
    this.httpServer.registerPathHandler(
      "/authorize",
      this.authorizeHandler.bind(this)
    );
    this.httpServer.registerPathHandler("/token", this.tokenHandler.bind(this));
    this.httpServer.start(-1);

    const port = this.httpServer.identity.primaryPort;
    dump(`OAuth2 server at localhost:${port} opened\n`);

    testScope.registerCleanupFunction(() => {
      this.httpServer.stop();
      dump(`OAuth2 server at localhost:${port} closed\n`);
    });
  }

  formHandler(request, response) {
    if (request.method != "GET") {
      throw HTTP_405;
    }
    const params = new URLSearchParams(request.queryString);
    this._formHandler(response, params.get("redirect_uri"));
  }

  _formHandler(response, redirectUri) {
    response.setHeader("Content-Type", "text/html", false);
    response.write(`<!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Log in to test.test</title>
      </head>
      <body>
        <form action="/authorize" method="post">
          <input type="text" name="redirect_uri" readonly="readonly" value="${redirectUri}" />
          <input type="text" name="username" />
          <input type="password" name="password" />
          <input type="submit" />
        </form>
      </body>
      </html>
    `);
  }

  authorizeHandler(request, response) {
    if (request.method != "POST") {
      throw HTTP_405;
    }

    const input = CommonUtils.readBytesFromInputStream(request.bodyInputStream);
    const params = new URLSearchParams(input);

    if (
      params.get("username") != this.username ||
      params.get("password") != this.password
    ) {
      this._formHandler(response, params.get("redirect_uri"));
      return;
    }

    // Create a unique code. It will become invalid after the first use.
    const bytes = new Uint8Array(12);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 255);
    }
    const code = ChromeUtils.base64URLEncode(bytes, { pad: false });
    validCodes.add(code);

    const url = new URL(params.get("redirect_uri"));
    url.searchParams.set("code", code);

    response.setStatusLine(request.httpVersion, 303, "Redirected");
    response.setHeader("Location", url.href);
  }

  tokenHandler(request, response) {
    if (request.method != "POST") {
      throw HTTP_405;
    }

    const stream = Cc["@mozilla.org/binaryinputstream;1"].createInstance(
      Ci.nsIBinaryInputStream
    );
    stream.setInputStream(request.bodyInputStream);
    const input = stream.readBytes(request.bodyInputStream.available());
    const params = new URLSearchParams(input);

    const goodRequest =
      params.get("client_id") == "test_client_id" &&
      params.get("client_secret") == "test_secret";
    const grantType = params.get("grant_type");
    const code = params.get("code");
    const data = {};

    if (
      goodRequest &&
      grantType == "authorization_code" &&
      code &&
      validCodes.has(code)
    ) {
      // Authorisation just happened.
      validCodes.delete(code);
      data.access_token = this.accessToken;
      data.refresh_token = this.refreshToken;
    } else if (
      goodRequest &&
      grantType == "refresh_token" &&
      params.get("refresh_token") == this.refreshToken
    ) {
      // Client provided a valid refresh token.
      data.access_token = this.accessToken;
    } else {
      response.setStatusLine("1.1", 400, "Bad Request");
      data.error = "invalid_grant";
    }

    if (data.accessToken && this.expiry !== null) {
      data.expires_in = this.expiry;
    }

    response.setHeader("Content-Type", "application/json", false);
    response.write(JSON.stringify(data));
  }
}
