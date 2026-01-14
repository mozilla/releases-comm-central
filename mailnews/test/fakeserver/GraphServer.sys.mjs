/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { HttpServer } from "resource://testing-common/httpd.sys.mjs";

/**
 * A mock server to mimic operations with Graph API.
 */
export class GraphServer {
  /**
   * The mock HTTP server to use to handle Graph requests.
   *
   * @type {HttpServer}
   * @name GraphServer.httpServer
   */
  #httpServer;

  /**
   * The username that must be supplied on requests to this server if HTTP
   * basic authentication is used.
   *
   * @type {string}
   * @name GraphServer.username
   * @private
   */
  #username;

  /**
   * The password that must be supplied on requests to this server if HTTP
   * basic authentication is used.
   *
   * @type {string}
   * @name GraphServer.password
   * @private
   */
  #password;

  /**
   * The port for the server to listen on.
   *
   * @type {number}
   * @name GraphServer.listenPort
   * @private
   */
  #listenPort;

  constructor(username = "user", password = "password", listenPort = -1) {
    this.#httpServer = new HttpServer();
    this.#httpServer.registerPrefixHandler("/", (request, response) => {
      try {
        this.#dispatchResource(request, response);
      } catch (e) {
        console.error("Error when processing request:", e);
        throw e;
      }
    });

    this.#username = username;
    this.#password = password;
    this.#listenPort = listenPort;
  }

  /**
   * Start listening for requests.
   */
  start() {
    this.#httpServer.start(this.#listenPort);
  }

  /**
   * Stop listening for requests.
   */
  stop() {
    this.#httpServer.stop();
  }

  /**
   * Return the port the server is listening on. This might not match the value
   * passed to the class constructor.
   */
  get port() {
    return this.#httpServer.identity.primaryPort;
  }

  /**
   * Dispatch a request to the appropriate resource handler based on the
   * request API path and method.
   *
   * @param {nsIHttpRequest} request
   * @param {nsIHttpResponse} response
   */
  #dispatchResource(request, response) {
    // Try to read the value of the `Authorization` header.
    if (request.hasHeader("Authorization")) {
      const authorizationValue = request.getHeader("Authorization");

      if (authorizationValue.startsWith("Basic ")) {
        const [username, password] = atob(
          authorizationValue.substring(6)
        ).split(":");
        if (username != this.#username || password != this.#password) {
          response.setStatusLine("1.1", 401, "Unauthorized");
          response.setHeader("WWW-Authenticate", `Basic realm="test"`);
          return;
        }
      }
    }

    const resourcePath = request.path;

    let responseJsonObject = {};
    if (resourcePath === "/me") {
      responseJsonObject = this.#me();
    } else {
      throw new Error(`Unexpected Graph resource: ${resourcePath}`);
    }

    // Send the response.
    const responseBody = JSON.stringify(responseJsonObject);
    response.bodyOutputStream.write(responseBody, responseBody.length);
  }

  /**
   * Handle the /me resource.
   *
   * @returns {object}
   */
  #me() {
    return {
      businessPhones: ["+1 425 555 0109"],
      displayName: "Adele Vance",
      givenName: "Adele",
      jobTitle: "Retail Manager",
      mail: "AdeleV@contoso.com",
      mobilePhone: "+1 425 555 0109",
      officeLocation: "18/2111",
      preferredLanguage: "en-US",
      surname: "Vance",
      userPrincipalName: "AdeleV@contoso.com",
      id: "87d349ed-44d7-43e1-9a83-5f2406dee5bd",
    };
  }
}
