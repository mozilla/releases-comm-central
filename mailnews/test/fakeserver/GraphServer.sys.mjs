/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { HttpServer } from "resource://testing-common/httpd.sys.mjs";

import {
  MockServer,
  RemoteFolder,
} from "resource://testing-common/mailnews/MockServer.sys.mjs";

import { CommonUtils } from "resource://services-common/utils.sys.mjs";

/**
 * A recipient to a `GraphMessage`. Note that the structure of this class does
 * *not* match the structure of the `recipient` type from the Graph API.
 */
export class Recipient {
  /**
   * The recipient's name.
   *
   * @type {string}
   */
  name;

  /**
   * The recipient's email address.
   *
   * @type {string}
   */
  address;

  constructor(name, address) {
    this.name = name;
    this.address = address;
  }
}

/**
 * A message created on a Graph server. Note that the structure of this class
 * does *not* match the structure of the `message` type from the Graph API.
 */
export class GraphMessage {
  /**
   * The unique identifier for this message.
   *
   * @type {string}
   */
  id;

  /**
   * The message's Bcc recipients.
   *
   * @type {Array<Recipient>}
   */
  bccRecipients = [];

  /**
   * Whether the user has requested DSN (Delivery Status Notification) for this
   * message.
   *
   * @type {bool}
   */
  dsnRequested = false;

  /**
   * The raw RFC822 content for this message.
   *
   * @type {string}
   */
  content;

  constructor(id, bccRecipients, dsnRequested, content) {
    this.id = id;
    this.bccRecipients = bccRecipients;
    this.dsnRequested = dsnRequested;
    this.content = content;
  }
}

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

  /**
   * A map from message IDs to RFC822 message payloads.
   *
   * @type {Map<string, GraphMessage>}
   * @private
   */
  #createdMessagesById = new Map();

  /**
   * The latest `GraphMessage` sent. Similar to `lastSentMessage` except this
   * also includes metadata such as Bcc recipients, DSN, etc.
   *
   * @type {GraphMessage}
   * @name GraphServer.lastSentGraphMessage
   * @private
   */
  #lastSentGraphMessage = null;

  constructor({
    hostname,
    port,
    username = "user",
    password = "password",
    listenPort = -1,
  } = {}) {
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
    if (hostname && port) {
      // Used by ServerTestUtils to make this server appear at hostname:port.
      // This doesn't mean the HTTP server is listening on that host and port.
      this.#httpServer.identity.add(
        port == 443 ? "https" : "http",
        hostname,
        port
      );
    }

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

  get lastSentGraphMessage() {
    return this.#lastSentGraphMessage;
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

    const resourcePath = request.path.startsWith("/v1.0")
      ? request.path.substring(5)
      : request.path;
    const resourceQuery = request.queryString;

    // Try to find a handler that matches the method and path for the request.
    let responseJsonObject = {};
    let pathMatch;
    switch (request.method) {
      case "GET":
        if (resourcePath === "/me") {
          responseJsonObject = this.#me();
        } else if (
          (pathMatch = /\/me\/mailFolders\/(\w+)\/messages\/delta/.exec(
            resourcePath
          ))
        ) {
          const folderName = pathMatch[1];
          responseJsonObject = this.#mailFolderMessages(
            folderName,
            resourceQuery
          );
        } else if (
          (pathMatch = /\/me\/mailFolders\('(\w+)'\)\/messages\/delta/.exec(
            resourcePath
          ))
        ) {
          const folderName = pathMatch[1];
          responseJsonObject = this.#mailFolderMessages(
            folderName,
            resourceQuery
          );
        } else if (resourcePath === "/me/mailFolders/delta()") {
          responseJsonObject = this.#mailFoldersDelta(resourceQuery);
        } else if (resourcePath.startsWith("/me/mailFolders/")) {
          responseJsonObject = this.#mailFolder(resourcePath.substring(16));
        } else if (
          (pathMatch = /\/me\/messages\/([0-9a-zA-Z_-]+)\/\$value/.exec(
            resourcePath
          ))
        ) {
          const content = this.#messageMediaResource(pathMatch[1]);
          // This endpoint does not return a JSON object, so we can write the
          // response directly to the output stream and return here.
          response.bodyOutputStream.write(content, content.length);
          return;
        }
        break;

      case "POST":
        if (resourcePath === "/me/messages") {
          responseJsonObject = this.#createMessage(request);
        } else if (
          resourcePath.startsWith("/me/messages") &&
          resourcePath.endsWith("/send")
        ) {
          // `#sendMessage()` takes care of setting the necessary properties on
          // the response, so we should skip the body serialization part here.
          this.#sendMessage(resourcePath, response);
          return;
        } else if (resourcePath.startsWith("/me/mailFolders/")) {
          responseJsonObject = this.#createFolder(
            resourcePath.substring(16),
            request,
            response
          );
        }
        break;
      case "PATCH":
        if (resourcePath.startsWith("/me/messages")) {
          responseJsonObject = this.#updateMessage(request);
        }
    }

    // If we don't have a body to respond with, it likely means we've failed to
    // find a handler for our request.
    if (Object.keys(responseJsonObject).length === 0) {
      throw new Error(`Unexpected Graph resource: ${resourcePath}`);
    }

    // Send the response.
    const responseBody = JSON.stringify(responseJsonObject);
    response.bodyOutputStream.write(responseBody, responseBody.length);
  }

  /**
   * Handle the GET /me resource.
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
   * Handle GET /me/mailFolders/{mailFolderId}.
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
   * Handle POST /me/mailFolders/...
   *
   * @param {string} folderPath
   * @param {nsIHttpRequest} request
   * @param {nsIHttpResponse} response
   * @returns {object}
   */
  #createFolder(folderPath, request, response) {
    if (
      folderPath.endsWith("/childFolders") &&
      folderPath.split("/").length == 2
    ) {
      return this.#createChildFolder(
        folderPath.substring(0, folderPath.indexOf("/")),
        request,
        response
      );
    }

    throw new Error(`Unexpected folder create path: ${folderPath}`);
  }

  /**
   * Handle POST /me/mailFolders/{mailFolderId}/childFolders.
   *
   * @param {string} parentFolderId
   * @param {nsIHttpRequest} request
   * @param {nsIHttpResponse} response
   * @returns {object}
   */
  #createChildFolder(parentFolderId, request, response) {
    const decodedParentId = decodeURIComponent(parentFolderId);
    const parentFolder =
      this.getDistinguishedFolder(decodedParentId) ||
      this.getFolder(decodedParentId);
    if (!parentFolder) {
      throw new Error(`Unexpected parent folder id: ${decodedParentId}`);
    }

    const requestBody = JSON.parse(
      CommonUtils.readBytesFromInputStream(request.bodyInputStream)
    );
    const folderName = requestBody.displayName;
    const folderId = `created-folder-${this.folders.length}`;

    this.appendRemoteFolder(
      new RemoteFolder(folderId, parentFolder.id, folderName, null)
    );
    response.setStatusLine("1.1", 201, "Created");

    return {
      "@odata.context": `${this.#endpoint}/$metadata#users('me')/mailFolders/$entity`,
      id: folderId,
      displayName: folderName,
      parentFolderId: parentFolder.id,
    };
  }

  /**
   * Handle GET /me/mailFolders/delta().
   *
   * @param {string} queryString
   * @returns {object}
   */
  #mailFoldersDelta(queryString) {
    const params = new URLSearchParams(queryString);
    const context = `${this.#endpoint}/$metadata#users('me')/mailFolders`;
    const nextDelta = `${this.#endpoint}/me/mailFolders/delta()?$deltatoken=${this.deletedFolders.length}`;
    const deletedOffset = Number.parseInt(params.get("$deltatoken") ?? "0", 10);
    const liveFolders = this.folders
      .filter(folder => folder.distinguishedId != "msgfolderroot")
      .map(folder => ({
        id: folder.id,
        displayName: folder.displayName,
        parentFolderId: folder.parentId,
      }));
    const removedItems = this.deletedFolders
      .slice(deletedOffset)
      .map(folder => ({
        id: folder.id,
        "@removed": { reason: "changed" },
      }));
    const folders = removedItems.concat(liveFolders);
    const skipCount = Number.parseInt(params.get("$skiptoken") ?? "0", 10);

    if (!Number.isFinite(this.maxSyncItems) || this.maxSyncItems <= 0) {
      return {
        "@odata.context": context,
        value: folders,
        "@odata.deltaLink": nextDelta,
      };
    }

    const page = folders.slice(skipCount, skipCount + this.maxSyncItems);
    const nextSkipCount = skipCount + this.maxSyncItems;
    if (nextSkipCount < folders.length) {
      const nextParams = new URLSearchParams();
      nextParams.set("$skiptoken", `${nextSkipCount}`);
      if (params.has("$deltatoken")) {
        nextParams.set("$deltatoken", `${deletedOffset}`);
      }
      return {
        "@odata.context": context,
        value: page,
        "@odata.nextLink": `${this.#endpoint}/me/mailFolders/delta()?${nextParams}`,
      };
    }

    return {
      "@odata.context": context,
      value: page,
      "@odata.deltaLink": nextDelta,
    };
  }

  /**
   * Handle GET /me/messages/{id}/$value
   *
   * @param {string} messageId The ID of the message.
   * @returns {string?} The message content.
   */
  #messageMediaResource(messageId) {
    const itemInfo = this.getItemInfo(messageId);
    if (!itemInfo) {
      return null;
    }

    const message = itemInfo.syntheticMessage;
    if (!message) {
      return null;
    }

    return message.toMessageString();
  }

  /**
   * Handle POST /me/messages
   *
   * @param {nsIHttpRequest} request
   * @returns {object}
   */
  #createMessage(request) {
    // TODO: at some point we'll want to create messages in specific folders, in
    // which case we'll want to stop hardcoding the drafts folder here. This is
    // fine for now, since Graph defaults to that folder when none is provided.
    const draftFolder = this.folders.filter(
      folder => folder.distinguishedId == "drafts"
    )[0];

    const newItemId = "created-item-" + this.itemsCreated;
    this.addNewItemOrMoveItemToFolder(newItemId, draftFolder.id);
    this.itemsCreated += 1;

    const reqBody = CommonUtils.readBytesFromInputStream(
      request.bodyInputStream
    );
    const message = new GraphMessage(newItemId, [], false, atob(reqBody));

    this.#createdMessagesById.set(newItemId, message);

    // Note: returning only the ID should be fine for now because that's the
    // only bit of the message we actually use, but in the future we'll probably
    // want to expand this response with more fields.
    return {
      id: newItemId,
    };
  }

  /**
   * Handle PATCH /me/messages/{messageId}
   *
   * @param {nsIHttpRequest} request
   */
  #updateMessage(request) {
    const pathParts = request.path.split("/");
    const messageId = pathParts[pathParts.length - 1];

    const reqBody = CommonUtils.readBytesFromInputStream(
      request.bodyInputStream
    );
    const parsedReq = JSON.parse(reqBody);

    // Fetch the corresponding message and update its metadata.
    const message = this.#createdMessagesById.get(messageId);

    // `GraphMessage.bccRecipients` defaults to an empty array, so we should
    // only update it if the request contains a non-empty array.
    if (parsedReq.bccRecipients) {
      for (const recipient of parsedReq.bccRecipients) {
        const bccRecipient = new Recipient(
          recipient.emailAddress.name,
          recipient.emailAddress.address
        );
        message.bccRecipients.push(bccRecipient);
      }
    }

    // `GraphMessage.dsnRequested` defaults to `false`, so we should only update
    // it if the request sets it to `true`.
    if (parsedReq.isDeliveryReceiptRequested) {
      message.dsnRequested = parsedReq.isDeliveryReceiptRequested;
    }

    // Note: returning only the ID should be fine for now because we don't
    // actually look at the response from this request (beyond basic things like
    // the HTTP status code), but in the future we'll probably want to expand
    // this response with more fields.
    return {
      id: messageId,
    };
  }

  /**
   * Handle POST /me/messages/{messageId}/send
   *
   * Note that, unlike other handlers, this one sets the necessary properties on
   * the response directly.
   *
   * @param {string} requestPath
   * @param {nsIHttpResponse} response
   */
  #sendMessage(requestPath, response) {
    const messageId = /\/me\/messages\/(.+)\/send/.exec(requestPath)[1];

    const message = this.#createdMessagesById.get(messageId);
    if (!message) {
      response.setStatusLine("1.1", 404, "Not Found");
    } else {
      response.setStatusLine("1.1", 202, "Accepted");
      this.lastSentMessage = message.content;
      this.#lastSentGraphMessage = message;
    }
  }

  #mailFolderMessages(folderName, queryString) {
    const params = new URLSearchParams(queryString);
    let offset;
    if (params.has("$skiptoken")) {
      offset = params.get("$skiptoken");
    } else if (params.has("$deltatoken")) {
      offset = params.get("$deltatoken");
    } else {
      offset = 0;
    }

    const context = `${this.#endpoint}/$metadata#Collection(message)`;

    const allChangesForFolder = this.itemChanges
      .slice(offset)
      .filter(([, parentId]) => parentId === folderName);
    const currentChanges = allChangesForFolder.slice(0, this.maxSyncItems);

    const page = [];
    for (const [changeType, parentId, itemId] of currentChanges) {
      if (changeType == "create") {
        const item = this.getItemInfo(itemId);
        const itemData = {
          "@odata.type": "#microsoft.graph.message",
          id: itemId,
          parentFolderId: parentId,
          internetMessageId: item.syntheticMessage.messageId,
          subject: item.syntheticMessage.subject,
          bodyPreview: item.syntheticMessage.bodyPart
            .toMessageString()
            .slice(0, 10),
        };
        page.push(itemData);
      } else if (changeType == "delete") {
        const itemData = {
          "@odata.type": "#microsoft.graph.message",
          id: itemId,
          "@removed": { reason: "deleted" },
        };
        page.push(itemData);
      }
      // TODO (https://bugzilla.mozilla.org/show_bug.cgi?id=2025009) Handle
      // message updates.
    }

    const result = {
      "@odata.context": context,
      value: page,
    };

    if (currentChanges.length < allChangesForFolder.length) {
      // We have at least one more page of data. Send a nextLink.
      const newToken = this.itemChanges.indexOf(currentChanges.at(-1)) + 1;
      result["@odata.nextLink"] =
        `${this.#endpoint}/me/mailFolders('${folderName}')/messages/delta?$skiptoken=${newToken}`;
    } else {
      // We are up to date. Send a deltaLink.
      const newToken = currentChanges
        ? this.itemChanges.indexOf(currentChanges.at(-1)) + 1
        : 0;
      result["@odata.deltaLink"] =
        `${this.#endpoint}/me/mailFolders('${folderName}')/messages/delta?$deltatoken=${newToken}`;
    }

    return result;
  }

  get #endpoint() {
    return `http://127.0.0.1:${this.port}`;
  }
}
