/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { HttpServer } from "resource://testing-common/httpd.sys.mjs";

import {
  MockServer,
  RemoteFolder,
} from "resource://testing-common/mailnews/MockServer.sys.mjs";

/**
 * A mock server to mimic operations with Graph API.
 */
export class GraphServer extends MockServer {
  /**
   * The max number of folders to include in a single delta response.
   * Usually infinity, but can be lowered to test syncing that needs more than
   * one request.
   *
   * @type {number}
   */
  maxSyncItems = Infinity;

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
    super();
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
    this.setRemoteFolders(this.getWellKnownFolders());
  }

  /**
   * Create a list of `RemoteFolder`s, representing well-known folders typically
   * synchronised first from an EWS server.
   *
   * @returns {RemoteFolder[]} A list of well-known folders.
   */
  getWellKnownFolders() {
    return [
      new RemoteFolder("root", null, "Root", "msgfolderroot"),
      new RemoteFolder("inbox", "root", "Inbox", "inbox"),
      new RemoteFolder("deleteditems", "root", "Deleted Items", "deleteditems"),
      new RemoteFolder("drafts", "root", "Drafts", "drafts"),
      new RemoteFolder("outbox", "root", "Outbox", "outbox"),
      new RemoteFolder("sentitems", "root", "Sent", "sentitems"),
      new RemoteFolder("junkemail", "root", "Junk", "junkemail"),
      new RemoteFolder("archive", "root", "Archives", "archive"),
    ];
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
    const resourceQuery = request.queryString;

    let responseJsonObject = {};
    if (resourcePath === "/me") {
      responseJsonObject = this.#me();
    } else if (resourcePath === "/me/mailFolders/delta()") {
      responseJsonObject = this.#mailFoldersDelta(resourceQuery);
    } else if (resourcePath.startsWith("/me/mailFolders/")) {
      responseJsonObject = this.#mailFolder(resourcePath.substring(16));
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

  /**
   * Handle /me/mailFolders/{mailFolderId}.
   *
   * @param {string} folderId
   * @returns {object}
   */
  #mailFolder(folderId) {
    const decodedFolderId = decodeURIComponent(folderId);
    const folder =
      this.getDistinguishedFolder(decodedFolderId) ||
      this.getFolder(decodedFolderId);
    if (!folder) {
      throw new Error(`Unexpected folder id: ${decodedFolderId}`);
    }

    return {
      "@odata.context": `${this.#endpoint}/$metadata#users('me')/mailFolders/$entity`,
      id: folder.id,
      displayName: folder.displayName,
      parentFolderId: folder.parentId,
    };
  }

  /**
   * Handle /me/mailFolders/delta().
   *
   * @param {string} queryString
   * @returns {object}
   */
  #mailFoldersDelta(queryString) {
    const context = `${this.#endpoint}/$metadata#users('me')/mailFolders`;
    const fakeToken = `${this.#endpoint}/me/mailFolders/delta()?$deltatoken=fake-sync-token`;
    const folders = this.folders
      .filter(folder => folder.distinguishedId != "msgfolderroot")
      .map(folder => ({
        id: folder.id,
        displayName: folder.displayName,
        parentFolderId: folder.parentId,
      }));
    const skipMatch = queryString.match(/\$skiptoken=(\d+)/);
    const skipCount = skipMatch ? Number.parseInt(skipMatch[1], 10) : 0;

    if (!Number.isFinite(this.maxSyncItems) || this.maxSyncItems <= 0) {
      return {
        "@odata.context": context,
        value: folders,
        "@odata.deltaLink": fakeToken,
      };
    }

    const page = folders.slice(skipCount, skipCount + this.maxSyncItems);
    const nextSkipCount = skipCount + this.maxSyncItems;
    if (nextSkipCount < folders.length) {
      return {
        "@odata.context": context,
        value: page,
        "@odata.nextLink": `${this.#endpoint}/me/mailFolders/delta()?$skiptoken=${nextSkipCount}`,
      };
    }

    return {
      "@odata.context": context,
      value: page,
      "@odata.deltaLink": fakeToken,
    };
  }

  get #endpoint() {
    return `http://127.0.0.1:${this.port}`;
  }
}
