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
 * A simple class to hold the data associated with an HTTP response.
 */
class HttpResponseData {
  constructor(
    statusCode,
    statusMessage,
    bodyContent = "",
    httpVersion = "1.1"
  ) {
    this.httpVersion = httpVersion;
    this.statusCode = statusCode;
    this.statusMessage = statusMessage;
    this.bodyContent = bodyContent;
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

    if (resourcePath === "/$batch") {
      this.#handleBatchRequest(request, response);
    } else {
      this.#handleResourcePath(request, response, resourcePath);
    }
  }

  #handleResourcePath(request, response, resourcePath) {
    const method = request.method;
    const resourceQuery = request.queryString;
    const requestBody = CommonUtils.readBytesFromInputStream(
      request.bodyInputStream
    );
    const httpResponseData = this.#dispatchRequest(
      method,
      resourcePath,
      resourceQuery,
      requestBody
    );
    response.setStatusLine(
      httpResponseData.httpVersion,
      httpResponseData.statusCode,
      httpResponseData.statusMessage
    );
    response.bodyOutputStream.write(
      httpResponseData.bodyContent,
      httpResponseData.bodyContent.length
    );
  }

  #handleBatchRequest(request, response) {
    const batchRequest = JSON.parse(
      CommonUtils.readBytesFromInputStream(request.bodyInputStream)
    );

    const responseJsonObject = {
      responses: [],
    };

    for (const batchRequestItem of batchRequest.requests) {
      const id = batchRequestItem.id;
      const method = batchRequestItem.method;
      const path = batchRequestItem.url;
      const body = batchRequestItem.body;

      const itemResponseData = this.#dispatchRequest(
        method,
        path,
        null,
        JSON.stringify(body)
      );

      const itemResponseJson = JSON.parse(itemResponseData.bodyContent);

      const batchResponseItem = {
        id,
        status: itemResponseData.statusCode,
        headers: {
          "content-type": "application/json",
        },
        body: itemResponseJson,
      };

      responseJsonObject.responses.push(batchResponseItem);
    }

    response.setStatusLine("1.1", 200, "OK");
    const responseBody = JSON.stringify(responseJsonObject);
    response.bodyOutputStream.write(responseBody, responseBody.length);
  }

  /**
   * Dispatch a request to the appropriate handler.
   *
   * @param {string} requestMethod
   * @param {string} resourcePath
   * @param {string} resourceQuery
   * @param {string} requestBody
   * @returns {HttpResponseData} The response status code and content for the request.
   */
  #dispatchRequest(requestMethod, resourcePath, resourceQuery, requestBody) {
    // Try to find a handler that matches the method and path for the request.
    let responseJsonObject = {};
    let pathMatch;
    switch (requestMethod) {
      case "GET":
        if (resourcePath === "/me") {
          responseJsonObject = this.#me();
        } else if (
          (pathMatch = /\/me\/mailFolders\/([\w\-]+)\/messages\/delta/.exec(
            resourcePath
          ))
        ) {
          const folderName = pathMatch[1];
          responseJsonObject = this.#syncFolderMessages(
            folderName,
            resourceQuery
          );
        } else if (
          (pathMatch = /\/me\/mailFolders\('([\w\-]+)'\)\/messages\/delta/.exec(
            resourcePath
          ))
        ) {
          const folderName = pathMatch[1];
          responseJsonObject = this.#syncFolderMessages(
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
          // This endpoint does not return a JSON object, so we can return
          // the content directly here.
          return content;
        }
        break;

      case "POST":
        if (resourcePath === "/me/messages") {
          responseJsonObject = this.#createMessage(requestBody);
        } else if (
          resourcePath.startsWith("/me/messages") &&
          resourcePath.endsWith("/send")
        ) {
          // `#sendMessage()` takes care of setting the necessary properties on
          // the response, so we should skip the body serialization part here.
          return this.#sendMessage(resourcePath);
        } else if (
          resourcePath.startsWith("/me/mailFolders") &&
          resourcePath.endsWith("/move")
        ) {
          responseJsonObject = this.#moveFolders(resourcePath, requestBody);
        } else if (resourcePath.startsWith("/me/mailFolders/")) {
          return this.#createFolder(resourcePath.substring(16), requestBody);
        } else if (
          resourcePath.startsWith("/me/messages") &&
          resourcePath.endsWith("/move")
        ) {
          responseJsonObject = this.#moveMessages(resourcePath, requestBody);
        }
        break;

      case "PATCH":
        if (resourcePath.startsWith("/me/messages")) {
          responseJsonObject = this.#updateMessage(resourcePath, requestBody);
        } else if (resourcePath.startsWith("/me/mailFolders")) {
          responseJsonObject = this.#updateFolder(resourcePath, requestBody);
        }
    }

    // If we don't have a body to respond with, it likely means we've failed to
    // find a handler for our request.
    if (Object.keys(responseJsonObject).length === 0) {
      throw new Error(`Unexpected Graph resource: ${resourcePath}`);
    }

    return new HttpResponseData(200, "OK", JSON.stringify(responseJsonObject));
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
   * @param {string} requestBody
   * @param {nsIHttpResponse} response
   * @returns {object}
   */
  #createFolder(folderPath, requestBody, response) {
    if (
      folderPath.endsWith("/childFolders") &&
      folderPath.split("/").length == 2
    ) {
      return this.#createChildFolder(
        folderPath.substring(0, folderPath.indexOf("/")),
        requestBody,
        response
      );
    }

    throw new Error(`Unexpected folder create path: ${folderPath}`);
  }

  /**
   * Handle POST /me/mailFolders/{mailFolderId}/childFolders.
   *
   * @param {string} parentFolderId
   * @param {string} requestBody
   *
   * @returns {HttpResponseData}
   */
  #createChildFolder(parentFolderId, requestBody) {
    const decodedParentId = decodeURIComponent(parentFolderId);
    const parentFolder =
      this.getDistinguishedFolder(decodedParentId) ||
      this.getFolder(decodedParentId);
    if (!parentFolder) {
      throw new Error(`Unexpected parent folder id: ${decodedParentId}`);
    }

    const requestJson = JSON.parse(requestBody);
    const folderName = requestJson.displayName;
    const folderId = `created-folder-${this.folders.length}`;

    this.appendRemoteFolder(
      new RemoteFolder(folderId, parentFolder.id, folderName, null)
    );

    return new HttpResponseData(
      201,
      "Created",
      JSON.stringify({
        "@odata.context": `${this.#endpoint}/$metadata#users('me')/mailFolders/$entity`,
        id: folderId,
        displayName: folderName,
        parentFolderId: parentFolder.id,
      })
    );
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

    return new HttpResponseData(200, "OK", message.toMessageString());
  }

  /**
   * Handle POST /me/messages
   *
   * @param {string} requestBody
   * @returns {object}
   */
  #createMessage(requestBody) {
    // TODO: at some point we'll want to create messages in specific folders, in
    // which case we'll want to stop hardcoding the drafts folder here. This is
    // fine for now, since Graph defaults to that folder when none is provided.
    const draftFolder = this.folders.filter(
      folder => folder.distinguishedId == "drafts"
    )[0];

    const newItemId = "created-item-" + this.itemsCreated;
    this.addItemToFolder(newItemId, draftFolder.id);
    this.itemsCreated += 1;

    const message = new GraphMessage(newItemId, [], false, atob(requestBody));

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
   * @param {string} resourcePath
   * @param {string} requestBody
   */
  #updateMessage(resourcePath, requestBody) {
    const pathParts = resourcePath.split("/");
    const messageId = pathParts[pathParts.length - 1];

    const parsedReq = JSON.parse(requestBody);

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
   * Handle PATCH /me/mailFolders/{mailFolderId}
   *
   * @param {string} resourcePath
   * @param {string} requestBody
   */
  #updateFolder(resourcePath, requestBody) {
    const pathParts = resourcePath.split("/");
    const folderId = pathParts[pathParts.length - 1];

    const parsedReq = JSON.parse(requestBody);

    const newName = parsedReq.displayName;

    this.renameFolderById(folderId, newName);

    return {
      id: folderId,
      displayName: newName,
    };
  }

  /**
   * Handle POST /me/messages/{messageId}/send
   *
   * Note that, unlike other handlers, this one sets the necessary properties on
   * the response directly.
   *
   * @param {string} requestPath
   *
   * @returns {[string, number, string]} The resulting HTTP status [version, statusCode, message].
   */
  #sendMessage(requestPath) {
    const messageId = /\/me\/messages\/(.+)\/send/.exec(requestPath)[1];

    const message = this.#createdMessagesById.get(messageId);
    if (!message) {
      return new HttpResponseData(404, "Not Found");
    }

    this.lastSentMessage = message.content;
    this.#lastSentGraphMessage = message;
    return new HttpResponseData(202, "Accepted");
  }

  /**
   * Check if the query string requests the extended property with the given ID.
   *
   * @param {string} queryString
   * @param {string} propId
   * @returns {bool}
   */
  #requestsExtendedProperty(queryString, propId) {
    const params = new URLSearchParams(queryString);
    const expand = params.get("expand") ?? params.get("$expand");
    return (
      expand?.includes(
        `singleValueExtendedProperties($filter=id eq '${propId}')`
      ) ?? false
    );
  }

  /**
   * Adds any expanded single value extended properties from `itemId` requested
   * in `queryString` to `itemData`.
   *
   * Currently only supports size requests ("Integer 0x0E08").
   *
   * @param {object} itemData
   * @param {string} itemId
   * @param {string} queryString
   */
  #appendExpandedSingleValueExtendedProperties(itemData, itemId, queryString) {
    if (!this.#requestsExtendedProperty(queryString, "Integer 0x0E08")) {
      return;
    }

    const item = this.getItemInfo(itemId);
    let messageSize = null;
    messageSize = item.syntheticMessage.toMessageString().length;

    if (messageSize !== null) {
      itemData.singleValueExtendedProperties = [
        {
          id: "Integer 0xe08",
          value: `${messageSize}`,
        },
      ];
    }
  }

  /**
   * Handles GET /me/mailFolders/{folderId}/delta
   *
   * @param {string} folderName - The name of the folder to sync.
   * @param {string} queryString - The query parameters from the request.
   */
  #syncFolderMessages(folderName, queryString) {
    const params = new URLSearchParams(queryString);
    let offset;
    if (params.has("$skiptoken")) {
      offset = parseInt(params.get("$skiptoken"));
    } else if (params.has("$deltatoken")) {
      offset = parseInt(params.get("$deltatoken"));
    } else {
      offset = 0;
    }

    const context = `${this.#endpoint}/$metadata#Collection(message)`;

    const [changes, truncated] = this.getChangesSince(
      offset,
      folderName,
      this.maxSyncItems
    );

    const page = [];
    for (const [changeType, parentId, itemId] of changes) {
      // Graph doesn't differentiate between creation, update and read flag
      // updates, they all appear the same in delta responses.
      if (
        changeType == "create" ||
        changeType == "update" ||
        changeType == "readflag"
      ) {
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
          isRead: item.syntheticMessage.metaState.read,
          toRecipients: syntheticRecipientsToGraph(item.syntheticMessage.to),
          ccRecipients: syntheticRecipientsToGraph(item.syntheticMessage.cc),
        };
        this.#appendExpandedSingleValueExtendedProperties(
          itemData,
          itemId,
          queryString
        );
        page.push(itemData);
      } else if (changeType == "delete") {
        const itemData = {
          "@odata.type": "#microsoft.graph.message",
          id: itemId,
          "@removed": { reason: "deleted" },
        };
        page.push(itemData);
      }
    }

    const result = {
      "@odata.context": context,
      value: page,
    };

    if (truncated) {
      // We have at least one more page of data. Send a nextLink.
      const newToken = offset + this.maxSyncItems;
      const nextParams = new URLSearchParams(params);
      nextParams.delete("$skiptoken");
      nextParams.delete("$deltatoken");
      nextParams.delete("skiptoken");
      nextParams.delete("deltatoken");
      nextParams.set("$skiptoken", `${newToken}`);
      result["@odata.nextLink"] =
        `${this.#endpoint}/me/mailFolders('${folderName}')/messages/delta?${nextParams}`;
    } else {
      // We are up to date. Send a deltaLink.
      const newToken = this.itemChanges.length;
      const nextParams = new URLSearchParams(params);
      nextParams.delete("$skiptoken");
      nextParams.delete("$deltatoken");
      nextParams.delete("skiptoken");
      nextParams.delete("deltatoken");
      nextParams.set("$deltatoken", `${newToken}`);
      result["@odata.deltaLink"] =
        `${this.#endpoint}/me/mailFolders('${folderName}')/messages/delta?${nextParams}`;
    }

    return result;
  }

  /**
   * Handle POST /me/messages/{messageId}/move
   *
   * @param {string} resourcePath
   * @param {string} requestBody
   */
  #moveMessages(resourcePath, requestBody) {
    // Extract the message ID, i.e. the second-to-last section of the path.
    const pathParts = resourcePath.split("/");
    const messageId = pathParts[pathParts.length - 2];

    const parsedReq = JSON.parse(requestBody);

    const folderId = parsedReq.DestinationId;
    if (!folderId) {
      dump(`${requestBody}\n`);
      throw new Error("missing destination ID for move");
    }

    const newId = this.moveItemToFolder(messageId, folderId);

    // Note: returning only the ID should be fine for now because that's the
    // only bit of the message we actually use, but in the future we'll probably
    // want to expand this response with more fields.
    return {
      id: newId,
    };
  }

  /**
   * Handle POST /me/mailFolders/{folderId}/move
   *
   * @param {string} resourcePath
   * @param {string} requestBody
   */
  #moveFolders(resourcePath, requestBody) {
    // Extract the folder ID, i.e. the second-to-last section of the path.
    const pathParts = resourcePath.split("/");
    const folderId = pathParts[pathParts.length - 2];

    const parsedReq = JSON.parse(requestBody);

    const newParentFolderId = parsedReq.DestinationId;
    if (!folderId) {
      dump(`${requestBody}\n`);
      throw new Error("missing destination ID for move");
    }

    // Graph IDs are observed to not be stable during a move.
    const graphIsNotStable = false;
    const newId = this.reparentFolderById(
      folderId,
      newParentFolderId,
      graphIsNotStable
    );

    // Note: returning only the ID should be fine for now because that's the
    // only bit of the folder we actually use, but in the future we'll probably
    // want to expand this response with more fields.
    return {
      id: newId,
    };
  }

  get #endpoint() {
    return `http://127.0.0.1:${this.port}`;
  }
}

/**
 * Maps a list of recipients in a `SyntheticMessage` to an array with the
 * relevant structure from the Graph API. Each element of the resulting array is
 * an object, itself containing an `emailAddress` object, which has a `name` and
 * an `address`.
 *
 * @param {?string[][]} recipients - A single recipient (e.g. to or cc) from a
 *   `SyntheticMessage`, which is an array with the display name as the first
 *   element and the address as the second.
 * @returns {object[]} - The recipients formatted as expected in the Graph API.
 */
function syntheticRecipientsToGraph(recipients) {
  if (!recipients) {
    return [];
  }

  return recipients.map(recipient => {
    return {
      emailAddress: {
        name: recipient[0],
        address: recipient[1],
      },
    };
  });
}
