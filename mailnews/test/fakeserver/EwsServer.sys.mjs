/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { HttpServer } from "resource://testing-common/httpd.sys.mjs";

import { CommonUtils } from "resource://services-common/utils.sys.mjs";

import { SyntheticMessage } from "resource://testing-common/mailnews/MessageGenerator.sys.mjs";

/**
 * This file provides a mock/fake EWS (Exchange Web Services) server to run our
 * unit tests against.
 */

/**
 * Templates to use as bases to build EWS responses. These are stripped down
 * versions of actual responses received from the Exchange server handling
 * Exchange Online (e.g. O365) accounts.
 */

// The header for all EWS SOAP requests.
const EWS_SOAP_HEAD = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope
  xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Header>
    <h:ServerVersionInfo MajorVersion="15" MinorVersion="20" MajorBuildNumber="7452" MinorBuildNumber="50"
      xmlns:h="http://schemas.microsoft.com/exchange/services/2006/types"
      xmlns:xsd="http://www.w3.org/2001/XMLSchema"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"/>
    </s:Header>
    <s:Body>`;

// The footer for all EWS SOAP requests.
const EWS_SOAP_FOOT = `</s:Body>
</s:Envelope>`;

// The base for a response to a GetFolder operation request. Before sending, the
// server will populate `m:ResponseMessages`, with one message per requested
// folder.
const GET_FOLDER_RESPONSE_BASE = `${EWS_SOAP_HEAD}
    <m:GetFolderResponse xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"
                          xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                          xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types">
      <m:ResponseMessages>
      </m:ResponseMessages>
    </m:GetFolderResponse>
  ${EWS_SOAP_FOOT}`;

// The base for a response to a SyncFolderHierarchy operation request. Before
// sending, the server will populate `m:Changes`, as well as add and populate a
// `m:SyncState` element.
const SYNC_FOLDER_HIERARCHY_RESPONSE_BASE = `${EWS_SOAP_HEAD}
    <m:SyncFolderHierarchyResponse xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"
                                    xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                                    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                                    xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types">
      <m:ResponseMessages>
        <m:SyncFolderHierarchyResponseMessage ResponseClass="Success">
          <m:ResponseCode>NoError</m:ResponseCode>
          <m:IncludesLastFolderInRange>true</m:IncludesLastFolderInRange>
          <m:Changes>
          </m:Changes>
        </m:SyncFolderHierarchyResponseMessage>
      </m:ResponseMessages>
    </m:SyncFolderHierarchyResponse>
  ${EWS_SOAP_FOOT}`;

// The base for a response to a SyncFolderItems operation request. Before
// sending, the server will populate `m:Changes`, as well as add and populate a
// `m:SyncState` element.
const SYNC_FOLDER_ITEMS_RESPONSE_BASE = `${EWS_SOAP_HEAD}
    <m:SyncFolderItemsResponse xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"
                                xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                                xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                                xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types">
      <m:ResponseMessages>
        <m:SyncFolderItemsResponseMessage ResponseClass="Success">
          <m:ResponseCode>NoError</m:ResponseCode>
          <m:IncludesLastItemInRange>true</m:IncludesLastItemInRange>
            <m:Changes>
            </m:Changes>
        </m:SyncFolderItemsResponseMessage>
      </m:ResponseMessages>
    </m:SyncFolderItemsResponse>
${EWS_SOAP_FOOT}`;

// The base for a response to a CreateItem operation request.
const CREATE_ITEM_RESPONSE_BASE = `${EWS_SOAP_HEAD}
    <m:CreateItemResponse xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"
                          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                          xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                          xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types">
      <m:ResponseMessages>
        <m:CreateItemResponseMessage ResponseClass="Success">
          <m:ResponseCode>NoError</m:ResponseCode>
          <m:Items />
        </m:CreateItemResponseMessage>
      </m:ResponseMessages>
    </m:CreateItemResponse>
${EWS_SOAP_FOOT}`;

// The base for a response to a CreateFolder operation request. Before sending,
// the server will populate `m:Folders` with the server-side IDs of the newly
// created folders.
const CREATE_FOLDER_RESPONSE_BASE = `${EWS_SOAP_HEAD}
    <m:CreateFolderResponse xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"
                            xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                            xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                            xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types">
      <m:ResponseMessages>
        <m:CreateFolderResponseMessage ResponseClass="Success">
          <m:ResponseCode>NoError</m:ResponseCode>
          <m:Folders>
          </m:Folders>
        </m:CreateFolderResponseMessage>
      </m:ResponseMessages>
    </m:CreateFolderResponse>
${EWS_SOAP_FOOT}`;

const MOVE_ITEM_RESPONSE_BASE = `${EWS_SOAP_HEAD}
    <m:MoveItemResponse xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"
                        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                        xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                        xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types">
      <m:ResponseMessages>
      </m:ResponseMessages>
    </m:MoveItemResponse>
${EWS_SOAP_FOOT}`;

const COPY_ITEM_RESPONSE_BASE = `${EWS_SOAP_HEAD}
    <m:CopyItemResponse xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"
                        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                        xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                        xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types">
      <m:ResponseMessages>
      </m:ResponseMessages>
    </m:CopyItemResponse>
${EWS_SOAP_FOOT}`;

const MOVE_FOLDER_RESPONSE_BASE = `${EWS_SOAP_HEAD}
    <m:MoveFolderResponse xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"
                        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                        xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                        xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types">
      <m:ResponseMessages>
      </m:ResponseMessages>
    </m:MoveFolderResponse>
${EWS_SOAP_FOOT}`;

const COPY_FOLDER_RESPONSE_BASE = `${EWS_SOAP_HEAD}
    <m:CopyFolderResponse xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"
                        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                        xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                        xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types">
      <m:ResponseMessages>
      </m:ResponseMessages>
    </m:CopyFolderResponse>
${EWS_SOAP_FOOT}`;

const GET_ITEM_RESPONSE_BASE = `${EWS_SOAP_HEAD}
  <m:GetItemResponse xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"
                     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                     xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                     xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types">
    <m:ResponseMessages>
      <m:GetItemResponseMessage ResponseClass="Success">
        <m:ResponseCode>NoError</m:ResponseCode>
        <m:Items>
        </m:Items>
      </m:GetItemResponseMessage>
    </m:ResponseMessages>
  </m:GetItemResponse>
  ${EWS_SOAP_FOOT}`;

const UPDATE_ITEM_RESPONSE_BASE = `${EWS_SOAP_HEAD}
  <m:UpdateItemResponse xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"
                        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                        xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                        xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types">
    <m:ResponseMessages>
      <m:UpdateItemResponseMessage ResponseClass="Success">
        <m:ResponseCode>NoError</m:ResponseCode>
        <m:Items>
        </m:Items>
        <m:ConflictResults>
          <t:Count>0</t:Count>
        </m:ConflictResults>
      </m:UpdateItemResponseMessage>
    </m:ResponseMessages>
  </m:UpdateItemResponse>
  ${EWS_SOAP_FOOT}`;

const DELETE_ITEM_RESPONSE_BASE = `${EWS_SOAP_HEAD}
  <DeleteItemResponse xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"
                   xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                   xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                   xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types">
    <m:ResponseMessages>
    </m:ResponseMessages>
  </DeleteItemResponse>
  ${EWS_SOAP_FOOT}`;

const MARK_AS_JUNK_RESPONSE_BASE = `${EWS_SOAP_HEAD}
  <MarkAsJunkResponse xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"
                   xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                   xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                   xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types">
    <m:ResponseMessages>
    </m:ResponseMessages>
  </MarkAsJunkResponse>
  ${EWS_SOAP_FOOT}`;

const DELETE_FOLDER_RESPONSE_BASE = `${EWS_SOAP_HEAD}
  <DeleteFolderResponse xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"
                   xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                   xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                   xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types">
    <m:ResponseMessages>
    </m:ResponseMessages>
  </DeleteFolderResponse>
  ${EWS_SOAP_FOOT}`;

/**
 * A remote folder to sync from the EWS server. While initiating a test, an
 * array of folders is given to the EWS server, which will use it to populate
 * the contents of responses to EWS operations.
 */
export class RemoteFolder {
  /**
   * The unique EWS identifier for this folder.
   *
   * @type {string}
   */
  id;

  /**
   * An optional distinguished ID if this is a special folder (e.g. Inbox, root
   * folder, etc.).
   *
   * @type {?string}
   */
  distinguishedId;

  /**
   * The display name for the folder. Defaults to its ID.
   *
   * @type {string}
   */
  displayName;

  /**
   * The EWS identifier for the parent of this folder. Only the root folder
   * should be allowed to not have a parent.
   *
   * @type {?string}
   */
  parentId;

  constructor(
    folderId,
    parentId = null,
    displayName = null,
    distinguishedFolderId = null
  ) {
    this.id = folderId;
    this.parentId = parentId;
    this.displayName = displayName || folderId;
    this.distinguishedId = distinguishedFolderId;
  }
}

/**
 * Information about an item (Message, Meeting, etc.)
 */
export class ItemInfo {
  /**
   * @type {string}
   */
  parentId;

  /**
   * @type {SyntheticMessage}
   */
  syntheticMessage;

  /**
   * Construct a new item within the given parent.
   *
   * @param {string} parentId
   * @param {SyntheticMessage} [syntheticMessage] - Message data from
   *   MessageGenerator, if this item is a message.
   */
  constructor(parentId, syntheticMessage) {
    this.parentId = parentId;
    this.syntheticMessage = syntheticMessage;
  }
}

/**
 * A mock EWS server; an HTTP server capable of responding to EWS requests in a
 * limited capacity.
 */
export class EwsServer {
  /**
   * The maximum number of items this server will return in any sync request.
   * Usually infinity, but can be lowered to test syncing that needs more than
   * one request.
   *
   * @type {integer}
   */
  maxSyncItems = Infinity;

  /**
   * The folders registered on this EWS server.
   *
   * @type {RemoteFolder[]}
   */
  folders = [];

  /**
   * The folders flagged to be deleted on this EWS server.
   *
   * @type {RemoteFolder[]}
   */
  deletedFolders = [];

  /**
   * The ids of folders that have had updates applied.
   *
   * @type {string[]}
   */
  updatedFolderIds = [];

  /**
   * A list of all changes that happened to folders.
   *
   * @type {Array<string, string>} - Each item in this array is two strings.
   *   The first is "create" or "update" or "delete". The second is the id of
   *   the folder that changed.
   */
  folderChanges = [];

  /**
   * The version identifier to use in responses.
   *
   * `null` means no `Version` attribute in the `ServerVersionInfo` header.
   *
   * @type {?string}
   */
  version = null;

  /**
   * The mock HTTP server to use for handling EWS traffic.
   *
   * @type {HttpServer}
   */
  #httpServer;

  /**
   * A mapping from EWS identifier to folder specification.
   *
   * @type {Map<string, RemoteFolder>}
   */
  #idToFolder = new Map();

  /**
   * A mapping from EWS distinguished identifier to folder specification. This
   * only includes folders for which a distinguished identifier is specified.
   *
   * @type {Map<string, RemoteFolder>}
   */
  #distinguishedIdToFolder = new Map();

  /**
   * A mapping from EWS item id to its containing folder id.
   *
   * @type {Map<string, ItemInfo>}
   */
  #itemIdToItemInfo = new Map();

  /**
   * A list of all changes that happened to items.
   *
   * @type {Array<string, string, string>} - Each item is three elements:
   *   - "create" or "delete".
   *   - The id of the folder where the change occurred.
   *   - The id of the item that changed.
   */
  itemChanges = [];

  /**
   * The total number of items created by this server.
   *
   * @type {number}
   */
  #itemsCreated = 0;

  /**
   * The parser to use for parsing XML documents.
   *
   * @type {DOMParser}
   */
  #parser;

  /**
   * The serializer to use for generating XML documents.
   *
   * @type {XMLSerializer}
   */
  #serializer;

  /**
   * The value of the `Authorization` value as read from the latest request.
   *
   * If no such header was found in the latest request, this is an empty string.
   *
   * @type {string}
   * @name EwsServer.lastAuthorizationValue
   * @private
   */
  #lastAuthorizationValue;

  /**
   * The value of the `RequestServerVersion` SOAP header from the latest
   * request.
   *
   * If no such header was found in the latest request, this is `null`
   *
   * @type {?string}
   * @name EwsServer.lastRequestedVersion
   * @private
   */
  #lastRequestedVersion;

  /**
   * The content of the last outgoing message sent to this server.
   *
   * @type {?string}
   * @name EwsServer.lastSentMessage
   * @private
   */
  #lastSentMessage;

  /**
   * The username that must be supplied on requests to this server if HTTP
   * basic authentication is used.
   *
   * @type {string}
   * @name EwsServer.username
   * @private
   */
  #username;

  /**
   * The password that must be supplied on requests to this server if HTTP
   * basic authentication is used.
   *
   * @type {string}
   * @name EwsServer.password
   * @private
   */
  #password;

  /**
   * A network proxy to turn this HTTP server into an HTTPS server.
   *
   * @type {HttpsProxy}
   * @name EwsServer.httpsProxy
   * @private
   */
  #httpsProxy;

  /**
   * Certificate to use for HTTPS requests. See ServerTestUtils.getCertificate.
   *
   * @type {nsIX509Cert}
   * @name EwsServer.tlsCert
   * @private
   */
  #tlsCert;

  /**
   * The port to use when starting the HTTP server. -1 means to let the mock
   * HTTP server set a random port.
   *
   * @type {number}
   * @name EwsServer.port
   * @private
   */
  #listenPort;

  /**
   * @param {object} options - The parameters to use to configure the mock EWS
   *   server and its underlying HTTP(S) server.
   * @param {string} [options.hostname] - The hostname used by ServerTestUtils
   *   to make the server appear as listening on this host. This doesn't mean
   *   the HTTP server is listening on that host.
   * @param {integer} [options.port] - The port used by ServerTestUtils to make
   *   the server appear as listening on this port. This doesn't mean the HTTP
   *   server is listening on that port, use `listenPort` to control which port
   *   the HTTP server is actually listening on.
   * @param {nsIX509Cert} [options.tlsCert] - The certificate to use for HTTPS
   *   requests. `null` means HTTPS is not available.
   * @param {string} [options.version="Exchange2013"] - The Exchange Server
   *   version to advertise.
   * @param {string} [options.username="user"] - The username for the account
   *   used for testing.
   * @param {string} [options.password="password"] - The password for the
   *   account used for testing.
   * @param {integer} [options.listenPort=-1] - The port to listen to. -1 means
   *   to let the mock HTTP server set a random port.
   */
  constructor({
    hostname,
    port,
    tlsCert,
    version = "Exchange2013",
    username = "user",
    password = "password",
    listenPort = -1,
  } = {}) {
    this.version = version;
    this.#httpServer = new HttpServer();
    this.#httpServer.registerPathHandler(
      "/EWS/Exchange.asmx",
      (request, response) => {
        try {
          this.#requestHandler(request, response);
        } catch (e) {
          // The error handling of the HTTP server is a bit lacking, in that all
          // it does when any error is thrown is respond with a generic 500. To
          // makes writing tests with this server a bit easier, we want to log
          // the error before responding.
          console.error("Error when processing request:", e);
          throw e;
        }
      }
    );
    if (hostname && port) {
      // Used by ServerTestUtils to make this server appear at hostname:port.
      // This doesn't mean the HTTP server is listening on that host and port.
      this.#httpServer.identity.add(
        port == 443 ? "https" : "http",
        hostname,
        port
      );
    }
    this.#tlsCert = tlsCert;
    this.#username = username;
    this.#password = password;
    this.#listenPort = listenPort;

    this.#parser = new DOMParser();
    this.#serializer = new XMLSerializer();
    // Set up the well know folders by default.
    this.setRemoteFolders(this.getWellKnownFolders());
  }

  /**
   * Start listening for requests.
   */
  start() {
    this.#httpServer.start(this.#listenPort);
    if (this.#tlsCert) {
      const { HttpsProxy } = ChromeUtils.importESModule(
        "resource://testing-common/mailnews/HttpsProxy.sys.mjs"
      );
      this.#httpsProxy = new HttpsProxy(
        this.#httpServer.identity.primaryPort,
        this.#tlsCert
      );
    }
  }

  /**
   * Stop listening for requests.
   */
  stop() {
    this.#httpServer.stop();
    this.#httpsProxy?.destroy();
  }

  /**
   * The port this server is listening for new requests on. This might not
   * reflect the value passed for the `port` argument to the class's
   * constructor.
   *
   * @type {number}
   */
  get port() {
    return this.#httpsProxy?.port ?? this.#httpServer.identity.primaryPort;
  }

  /**
   * The value of the `Authorization` value as read from the latest request.
   *
   * If no such header was found in the latest request, this is an empty string.
   *
   * @type {string}
   */
  get lastAuthorizationValue() {
    return this.#lastAuthorizationValue;
  }

  /**
   * The value of the `RequestServerVersion` SOAP header from the latest
   * request.
   *
   * If no such header was found in the latest request, this is `null`.
   *
   * @type {?string}
   */
  get lastRequestedVersion() {
    return this.#lastRequestedVersion;
  }

  /**
   * The content of the last outgoing message sent to this server.
   *
   * @type {?string}
   */
  get lastSentMessage() {
    return this.#lastSentMessage;
  }

  /**
   * Set the exclusive list of folders this server should use to generate
   * responses. If this method is called more than once, the previous list of
   * folders is replaced by the new one.
   *
   * @param {RemoteFolder[]} folders
   */
  setRemoteFolders(folders) {
    this.folders = [];
    this.folderChanges = [];
    this.#idToFolder.clear();
    this.#distinguishedIdToFolder.clear();

    folders.forEach(folder => {
      this.appendRemoteFolder(folder);
    });
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
   * Parse an XML request and write the appropriate response. Throws if no
   * supported EWS operation could be found.
   *
   * @param {nsIHttpRequest} request
   * @param {nsIHttpResponse} response
   * @throws Throws if no supported EWS operation could be found.
   */
  #requestHandler(request, response) {
    // Try to read the value of the `Authorization` header.
    if (request.hasHeader("Authorization")) {
      this.#lastAuthorizationValue = request.getHeader("Authorization");

      if (this.#lastAuthorizationValue.startsWith("Basic ")) {
        const [username, password] = atob(
          this.#lastAuthorizationValue.substring(6)
        ).split(":");
        if (username != this.#username || password != this.#password) {
          response.setStatusLine("1.1", 401, "Unauthorized");
          response.setHeader("WWW-Authenticate", `Basic realm="test"`);
          return;
        }
      } else if (this.#lastAuthorizationValue.startsWith("Bearer ")) {
        const token = this.#lastAuthorizationValue.substring(7);
        const { OAuth2TestUtils } = ChromeUtils.importESModule(
          "resource://testing-common/mailnews/OAuth2TestUtils.sys.mjs"
        );
        if (!OAuth2TestUtils.validateToken(token, "test_mail")) {
          response.setStatusLine("1.1", 401, "Unauthorized");
          response.setHeader("WWW-Authenticate", `Basic realm="test"`);
          return;
        }
      }
    } else {
      response.setStatusLine("1.1", 401, "Unauthorized");
      response.setHeader("WWW-Authenticate", `Basic realm="test"`);
      return;
    }

    // Read the request content and parse it as XML.
    const reqBytes = CommonUtils.readBytesFromInputStream(
      request.bodyInputStream
    );
    const reqDoc = this.#parser.parseFromString(reqBytes, "text/xml");

    // Try to extract the `RequestServerVersion` SOAP header.
    const requestVersionHeaders = reqDoc.getElementsByTagName(
      "t:RequestServerVersion"
    );
    if (requestVersionHeaders.length > 0) {
      const versionHeader = requestVersionHeaders[0];
      this.#lastRequestedVersion = versionHeader.getAttribute("Version");
    }

    // Generate a response based on the operation found in the request.
    let resBytes = "";
    if (reqDoc.getElementsByTagName("SyncFolderHierarchy").length) {
      resBytes = this.#generateSyncFolderHierarchyResponse(reqDoc);
    } else if (reqDoc.getElementsByTagName("GetFolder").length) {
      resBytes = this.#generateGetFolderResponse(reqDoc);
    } else if (reqDoc.getElementsByTagName("SyncFolderItems").length) {
      resBytes = this.#generateSyncFolderItemsResponse(reqDoc);
    } else if (reqDoc.getElementsByTagName("CreateItem").length) {
      resBytes = this.#generateCreateItemResponse(reqDoc);
    } else if (reqDoc.getElementsByTagName("CreateFolder").length) {
      resBytes = this.#generateCreateFolderResponse(reqDoc);
    } else if (reqDoc.getElementsByTagName("MoveItem").length) {
      resBytes = this.#generateMoveItemResponse(reqDoc);
    } else if (reqDoc.getElementsByTagName("CopyItem").length) {
      resBytes = this.#generateCopyItemResponse(reqDoc);
    } else if (reqDoc.getElementsByTagName("MoveFolder").length) {
      resBytes = this.#generateMoveFolderResponse(reqDoc);
    } else if (reqDoc.getElementsByTagName("CopyFolder").length) {
      resBytes = this.#generateCopyFolderResponse(reqDoc);
    } else if (reqDoc.getElementsByTagName("UpdateItem").length) {
      resBytes = this.#generateUpdateItemResponse(reqDoc);
    } else if (reqDoc.getElementsByTagName("GetItem").length) {
      resBytes = this.#generateGetItemResponse(reqDoc);
    } else if (reqDoc.getElementsByTagName("DeleteItem").length) {
      resBytes = this.#generateDeleteItemResponse(reqDoc);
    } else if (reqDoc.getElementsByTagName("MarkAsJunk").length) {
      resBytes = this.#generateMarkAsJunkResponse(reqDoc);
    } else if (reqDoc.getElementsByTagName("DeleteFolder").length) {
      resBytes = this.#generateDeleteFolderResponse(reqDoc);
    } else {
      throw new Error("Unexpected EWS operation");
    }
    // Send the response.
    response.bodyOutputStream.write(resBytes, resBytes.length);
  }

  /**
   * Generate a response to a CreateFolder operation.
   *
   * @see {@link https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/createfolder-operation#createfolder-error-response}
   * @param {XMLDocument} reqDoc - The parsed document for the request to respond to.
   * @returns {string} A serialized XML document.
   */
  #generateCreateFolderResponse(reqDoc) {
    // Retrieve the parent's folder ID. At some point we might want to match it
    // with an existing folder in `this.folders`, but this is not a requirement
    // right now.
    // TODO: Support referring to the parent with its distinguished folder ID
    // (when relevant). It's not necessary currently because the EWS client will
    // always use `FolderId`.
    const parentFolderId = reqDoc
      .getElementsByTagName("ParentFolderId")[0]
      .getElementsByTagName("t:FolderId")[0]
      .getAttribute("Id");

    // TODO: Support batch creation of multiple folders. This is not much of an
    // issue currently because the EWS client never creates more than one folder
    // at a time.
    const folderEl = reqDoc
      .getElementsByTagName("Folders")[0]
      .getElementsByTagName("t:Folder")[0];

    // Retrieve the desired display name for this folder.
    const folderName =
      folderEl.getElementsByTagName("t:DisplayName")[0].innerText;

    // Generate a random ID for the folder.
    const folderId = (Math.random() + 1).toString(36).substring(2);

    // Add the folder to the list of folders the server knows about.
    this.appendRemoteFolder(
      new RemoteFolder(folderId, parentFolderId, folderName, null)
    );

    const resDoc = this.#parser.parseFromString(
      CREATE_FOLDER_RESPONSE_BASE,
      "text/xml"
    );

    // Add the server-side ID of the new folder to the response.
    const foldersEl = resDoc.getElementsByTagName("m:Folders")[0];
    const newFolderEl = resDoc.createElement("t:Folder");
    const folderIdEl = resDoc.createElement("t:FolderId");
    folderIdEl.setAttribute("Id", folderId);
    newFolderEl.appendChild(folderIdEl);
    foldersEl.appendChild(newFolderEl);

    return this.#serializer.serializeToString(resDoc);
  }

  /**
   * Set the SOAP header to indicate the Exchange version used by this server.
   *
   * @param {XMLDocument} resDoc
   */
  #setVersion(resDoc) {
    if (!this.version) {
      return;
    }

    const serverVersionHeader = resDoc.getElementsByTagName(
      "h:ServerVersionInfo"
    )[0];
    serverVersionHeader.setAttribute("Version", this.version);
  }

  /**
   * Generate a response to a SyncFolderItems operation.
   *
   * Currently, generated responses will not include any item.
   *
   * @see
   * {@link https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/syncfolderitems-operation#successful-syncfolderitems-response}
   * @param {XMLDocument} reqDoc - The parsed document for the request to
   * respond to.
   * @returns {string} A serialized XML document.
   */
  #generateSyncFolderItemsResponse(reqDoc) {
    const resDoc = this.#parser.parseFromString(
      SYNC_FOLDER_ITEMS_RESPONSE_BASE,
      "text/xml"
    );

    this.#setVersion(resDoc);

    const syncFolderId = reqDoc
      .getElementsByTagName("SyncFolderId")[0]
      .getElementsByTagName("t:FolderId")[0]
      .getAttribute("Id");

    let offset = 0;
    const reqSyncStateEl = reqDoc.getElementsByTagName("SyncState")[0];
    if (reqSyncStateEl) {
      offset = parseInt(reqSyncStateEl.textContent, 10);
    }

    const responseMessageEl = resDoc.getElementsByTagName(
      "m:SyncFolderItemsResponseMessage"
    )[0];

    let changes = this.itemChanges
      .slice(offset)
      .filter(([, parentId]) => parentId === syncFolderId);
    if (changes.length > this.maxSyncItems) {
      responseMessageEl.getElementsByTagName(
        "m:IncludesLastItemInRange"
      )[0].textContent = "false";
      changes = changes.slice(0, this.maxSyncItems);
    }

    const resSyncStateEl = resDoc.createElement("m:SyncState");
    resSyncStateEl.textContent = this.itemChanges.indexOf(changes.at(-1)) + 1;
    responseMessageEl.appendChild(resSyncStateEl);

    const changesEl = resDoc.getElementsByTagName("m:Changes")[0];
    changes.forEach(([changeType, parentId, itemId]) => {
      if (changeType == "create") {
        const messageEl = changesEl
          .appendChild(resDoc.createElement("t:Create"))
          .appendChild(resDoc.createElement("t:Message"));
        messageEl
          .appendChild(resDoc.createElement("t:ItemId"))
          .setAttribute("Id", itemId);
        messageEl
          .appendChild(resDoc.createElement("t:ParentFolderId"))
          .setAttribute("Id", parentId);
      } else if (changeType == "readflag") {
        const item = this.#itemIdToItemInfo.get(itemId);
        const changeEl = changesEl.appendChild(
          resDoc.createElement("t:ReadFlagChange")
        );
        const itemEl = changeEl.appendChild(resDoc.createElement("t:ItemId"));
        itemEl.setAttribute("Id", itemId);
        itemEl.setAttribute("ChangeKey", "abc12345");
        changeEl.appendChild(resDoc.createElement("t:IsRead")).textContent =
          item.syntheticMessage.metaState.read;
      } else if (changeType == "update") {
        changesEl
          .appendChild(resDoc.createElement("t:Update"))
          .appendChild(resDoc.createElement("t:Message"))
          .appendChild(resDoc.createElement("t:ItemId"))
          .setAttribute("Id", itemId);
      } else if (changeType == "delete") {
        changesEl
          .appendChild(resDoc.createElement("t:Delete"))
          .appendChild(resDoc.createElement("t:ItemId"))
          .setAttribute("Id", itemId);
      }
    });

    return this.#serializer.serializeToString(resDoc);
  }

  /**
   * Generate a response to a SyncFolderHierarchy operation.
   *
   * @see {@link https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/syncfolderhierarchy-operation#successful-syncfolderhierarchy-response}
   * @param {XMLDocument} reqDoc - The parsed document for the request to respond to.
   * @returns {string} A serialized XML document.
   */
  #generateSyncFolderHierarchyResponse(reqDoc) {
    const resDoc = this.#parser.parseFromString(
      SYNC_FOLDER_HIERARCHY_RESPONSE_BASE,
      "text/xml"
    );

    this.#setVersion(resDoc);

    let offset = 0;
    const reqSyncStateEl = reqDoc.getElementsByTagName("SyncState")[0];
    if (reqSyncStateEl) {
      offset = parseInt(reqSyncStateEl.textContent, 10);
    }

    const responseMessageEl = resDoc.getElementsByTagName(
      "m:SyncFolderHierarchyResponseMessage"
    )[0];

    let changes = this.folderChanges.slice(offset);
    if (changes.length > this.maxSyncItems) {
      responseMessageEl.getElementsByTagName(
        "m:IncludesLastFolderInRange"
      )[0].textContent = "false";
      changes = changes.slice(0, this.maxSyncItems);
    }
    const resSyncStateEl = resDoc.createElement("m:SyncState");
    resSyncStateEl.textContent = offset + changes.length;
    responseMessageEl.appendChild(resSyncStateEl);

    const changesEl = resDoc.getElementsByTagName("m:Changes")[0];
    changes.forEach(([changeType, folderId]) => {
      if (changeType == "create") {
        changesEl
          .appendChild(resDoc.createElement("t:Create"))
          .appendChild(resDoc.createElement("t:Folder"))
          .appendChild(resDoc.createElement("t:FolderId"))
          .setAttribute("Id", folderId);
      } else if (changeType == "update") {
        changesEl
          .appendChild(resDoc.createElement("t:Update"))
          .appendChild(resDoc.createElement("t:Folder"))
          .appendChild(resDoc.createElement("t:FolderId"))
          .setAttribute("Id", folderId);
      } else if (changeType == "delete") {
        changesEl
          .appendChild(resDoc.createElement("t:Delete"))
          .appendChild(resDoc.createElement("t:FolderId"))
          .setAttribute("Id", folderId);
      }
    });

    return this.#serializer.serializeToString(resDoc);
  }

  /**
   * Generate a response to a GetFolder operation.
   *
   * @see {@link https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/getfolder-operation#getfolder-response-example}
   * @param {XMLDocument} reqDoc - The parsed document for the request to respond to.
   * @returns {string} A serialized XML document.
   */
  #generateGetFolderResponse(reqDoc) {
    // Figure out which folder IDs (or distinguished IDs have been requested).
    const requestedFolderIds = [
      ...reqDoc.getElementsByTagName("FolderIds")[0].children,
    ].map(c => c.getAttribute("Id"));

    // Map the requested IDs to actual folders if we have them. A `null` folder
    // in the resulting array means the folder couldn't be found on the server,
    // and the relevant response message should reflect this.
    const responseFolders = requestedFolderIds.map(id => {
      // Try to match against a known distinguished ID.
      if (this.#distinguishedIdToFolder.has(id)) {
        return this.#distinguishedIdToFolder.get(id);
      }

      // If that failed, try to match against a known folder ID.=
      if (this.#idToFolder.has(id)) {
        return this.#idToFolder.get(id);
      }

      return null;
    });

    // Generate a base document for the response.
    const resDoc = this.#parser.parseFromString(
      GET_FOLDER_RESPONSE_BASE,
      "text/xml"
    );

    this.#setVersion(resDoc);

    const resMsgsEl = resDoc.getElementsByTagName("m:ResponseMessages")[0];

    // Add each folder to the response document.
    responseFolders.forEach(folder => {
      if (folder) {
        const folderEl = resDoc.createElement("t:Folder");
        // Add folder class.
        const folderClassEl = resDoc.createElement("t:FolderClass");
        // TODO: Allow the value to be configured, to test we correctly filter out
        // unsupported classes.
        folderClassEl.appendChild(resDoc.createTextNode("IPF.Note"));
        folderEl.appendChild(folderClassEl);

        // Add parent if available.
        if (folder.parentId) {
          const parentIdEl = resDoc.createElement("t:ParentFolderId");
          parentIdEl.setAttribute("Id", folder.parentId);
          folderEl.appendChild(parentIdEl);
        }

        // Add folder ID.
        const folderIdEl = resDoc.createElement("t:FolderId");
        folderIdEl.setAttribute("Id", folder.id);
        folderEl.appendChild(folderIdEl);

        // Add display name (defaults to the folder ID in folder constructor).
        const folderNameEl = resDoc.createElement("t:DisplayName");
        folderNameEl.appendChild(resDoc.createTextNode(folder.displayName));
        folderEl.appendChild(folderNameEl);

        // Add the folder element to t:Folders. Note that, in GetFolders
        // responses, each t:Folders element only contains one folder.
        const foldersEl = resDoc.createElement("t:Folders");
        foldersEl.appendChild(folderEl);

        // Indicate that no error happened when retrieving this message.
        const resCodeEl = resDoc.createElement("m:ResponseCode");
        resCodeEl.appendChild(resDoc.createTextNode("NoError"));

        // Build the m:GetFolderResponseMessage element, which is parent to both
        // t:Folders and m:ResponseCode.
        const messageEl = resDoc.createElement("m:GetFolderResponseMessage");
        messageEl.setAttribute("ResponseClass", "Success");
        messageEl.appendChild(resCodeEl);
        messageEl.appendChild(foldersEl);

        // Add the message to the document.
        resMsgsEl.appendChild(messageEl);
      } else {
        // We couldn't find a folder with this ID, so format the response
        // message as an `ErrorFolderNotFound` error.
        const messageEl = resDoc.createElement("m:GetFolderResponseMessage");
        messageEl.setAttribute("ResponseClass", "Error");

        // Add the response code to the response message.
        const resCodeEl = resDoc.createElement("m:ResponseCode");
        resCodeEl.appendChild(resDoc.createTextNode("ErrorFolderNotFound"));
        messageEl.appendChild(resCodeEl);

        // Add a human-readable representation of the error to the response
        // message.
        const errMessageEl = resDoc.createElement("m:MessageText");
        errMessageEl.appendChild(resDoc.createTextNode("Folder not found"));
        messageEl.appendChild(errMessageEl);

        // Append the message to the document.
        resMsgsEl.appendChild(messageEl);
      }
    });

    // Serialize the response to a string that the consumer can return in a response.
    return this.#serializer.serializeToString(resDoc);
  }

  /**
   * Generate a response to a SyncFolderItems operation.
   *
   * Currently, generated responses will always serve a static success report.
   *
   * @see
   * {@link https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/createitem-operation-email-message#successful-createitem-response}
   * @param {XMLDocument} reqDoc - The parsed document for the request to
   * respond to.
   * @returns {string} A serialized XML document.
   */
  #generateCreateItemResponse(reqDoc) {
    const resDoc = this.#parser.parseFromString(
      CREATE_ITEM_RESPONSE_BASE,
      "text/xml"
    );

    this.#setVersion(resDoc);

    const message =
      reqDoc.getElementsByTagName("t:MimeContent")[0].firstChild.nodeValue;
    this.#lastSentMessage = atob(message);

    // Check if the created item is being saved to a folder.
    const savedItemFolderId = reqDoc.getElementsByTagName("SavedItemFolderId");

    if (savedItemFolderId.length) {
      const folderId = savedItemFolderId[0]
        .getElementsByTagName("t:FolderId")[0]
        .getAttribute("Id");

      const newItemId = "created-item-" + this.#itemsCreated;
      this.addNewItemOrMoveItemToFolder(newItemId, folderId);
      this.#itemsCreated += 1;

      const itemsEl = resDoc.getElementsByTagName("m:Items")[0];
      const messageEl = resDoc.createElement("t:Message");
      const itemIdEl = resDoc.createElement("t:ItemId");
      itemIdEl.setAttribute("Id", newItemId);
      messageEl.appendChild(itemIdEl);
      itemsEl.appendChild(messageEl);
    }

    return this.#serializer.serializeToString(resDoc);
  }

  /**
   * Generate a response to a MoveItem operation.
   *
   * @param {XMLDocument} reqDoc - The parsed document for the request to
   * respond to.
   * @returns {string} A serialized XML document.
   */
  #generateMoveItemResponse(reqDoc) {
    const [destinationFolderId, itemIds] = extractMoveObjects(
      reqDoc,
      "ItemIds",
      "t:ItemId"
    );

    itemIds.forEach(id => {
      this.addNewItemOrMoveItemToFolder(id, destinationFolderId);
    });

    const resDoc = this.#buildGenericMoveResponse(
      MOVE_ITEM_RESPONSE_BASE,
      "m:MoveItemResponseMessage",
      "m:Items",
      "t:Message",
      "t:ItemId",
      itemIds
    );

    return this.#serializer.serializeToString(resDoc);
  }

  /**
   * Generate a response to a CopyItem operation.
   *
   * @param {XMLDocument} reqDoc - The parsed document for the request to
   * respond to.
   * @returns {string} A serialized XML document.
   */
  #generateCopyItemResponse(reqDoc) {
    const [destinationFolderId, itemIds] = extractMoveObjects(
      reqDoc,
      "ItemIds",
      "t:ItemId"
    );

    itemIds.forEach(id => {
      this.addNewItemOrMoveItemToFolder(`${id}_copy`, destinationFolderId);
    });

    const resDoc = this.#buildGenericMoveResponse(
      COPY_ITEM_RESPONSE_BASE,
      "m:CopyItemResponseMessage",
      "m:Items",
      "t:Message",
      "t:ItemId",
      itemIds
    );

    return this.#serializer.serializeToString(resDoc);
  }

  /**
   * Return a response to a `MoveFolder` request.
   *
   * @param {XMLDocument} reqDoc - The parsed document for the request to
   * respond to.
   * @returns {string} A serialized XML document.
   */
  #generateMoveFolderResponse(reqDoc) {
    const [destinationFolderId, folderIds] = extractMoveObjects(
      reqDoc,
      "FolderIds",
      "t:FolderId"
    );

    folderIds.forEach(id => this.reparentFolderById(id, destinationFolderId));

    const resDoc = this.#buildGenericMoveResponse(
      MOVE_FOLDER_RESPONSE_BASE,
      "m:MoveFolderResponseMessage",
      "m:Folders",
      "t:Folder",
      "t:FolderId",
      folderIds
    );

    return this.#serializer.serializeToString(resDoc);
  }

  /**
   * Return a response to a `CopyFolder` request.
   *
   * @param {XMLDocument} reqDoc - The parsed document for the request to
   * respond to.
   * @returns {string} A serialized XML document.
   */
  #generateCopyFolderResponse(reqDoc) {
    const [destinationFolderId, folderIds] = extractMoveObjects(
      reqDoc,
      "FolderIds",
      "t:FolderId"
    );

    folderIds.forEach(sourceFolderId => {
      const sourceFolder = this.#idToFolder.get(sourceFolderId);
      if (sourceFolder) {
        const newFolderId = `${sourceFolderId}_copy`;
        const folderCopy = new RemoteFolder(
          newFolderId,
          destinationFolderId,
          sourceFolder.displayName,
          newFolderId
        );
        this.appendRemoteFolder(folderCopy);
        // Make copies of the items that belong to the source folder
        // and place them in the destination folder.
        for (const [itemId, itemInfo] of this.#itemIdToItemInfo) {
          if (itemInfo.parentId === sourceFolderId) {
            const newItemId = `${itemId}_copy`;
            this.addNewItemOrMoveItemToFolder(
              newItemId,
              newFolderId,
              itemInfo.syntheticMessage
                ? new SyntheticMessage(
                    itemInfo.syntheticMessage.headers,
                    itemInfo.syntheticMessage.bodyPart,
                    itemInfo.syntheticMessage.metaState
                  )
                : null
            );
          }
        }
      }
    });

    const resDoc = this.#buildGenericMoveResponse(
      COPY_FOLDER_RESPONSE_BASE,
      "m:CopyFolderResponseMessage",
      "m:Folders",
      "t:Folder",
      "t:FolderId",
      folderIds
    );

    return this.#serializer.serializeToString(resDoc);
  }

  /**
   * Return a response to an `UpdateItem` request.
   *
   * @param {XMLDocument} reqDoc - The parsed document for the request to
   * respond to.
   * @returns {string} A serialized XML document.
   */
  #generateUpdateItemResponse(reqDoc) {
    const resDoc = this.#parser.parseFromString(
      UPDATE_ITEM_RESPONSE_BASE,
      "text/xml"
    );

    this.#setVersion(resDoc);

    const itemsEl = resDoc.getElementsByTagName("m:Items")[0];
    for (const itemChange of reqDoc.getElementsByTagName("t:ItemChange")) {
      const itemId = itemChange
        .getElementsByTagName("t:ItemId")[0]
        .getAttribute("Id");
      const item = this.#itemIdToItemInfo.get(itemId);
      const isReadEl = itemChange.getElementsByTagName("t:IsRead")[0];
      if (isReadEl) {
        item.syntheticMessage.metaState.read = isReadEl.textContent == "true";
        this.itemChanges.push(["readflag", item.parentId, itemId]);
      }

      const itemEl = itemsEl
        .appendChild(resDoc.createElement("t:Message"))
        .appendChild(resDoc.createElement("t:ItemId"));
      itemEl.setAttribute("Id", itemId);
      itemEl.setAttribute("ChangeKey", "abc12345");
    }

    return this.#serializer.serializeToString(resDoc);
  }

  /**
   * Return a response to a `GetItem` request.
   *
   * @param {XMLDocument} reqDoc - The parsed document for the request to
   * respond to.
   * @returns {string} A serialized XML document.
   */
  #generateGetItemResponse(reqDoc) {
    const resDoc = this.#parser.parseFromString(
      GET_ITEM_RESPONSE_BASE,
      "text/xml"
    );

    this.#setVersion(resDoc);

    // Assume we are asking for only one item.
    const reqItemIds = [...reqDoc.getElementsByTagName("t:ItemId")].map(id =>
      id.getAttribute("Id")
    );
    const includeContent =
      reqDoc.getElementsByTagName("t:IncludeMimeContent")[0]?.textContent ==
      "true";

    const itemsEl = resDoc.getElementsByTagName("m:Items")[0];
    reqItemIds.forEach(reqItemId => {
      const item = this.#itemIdToItemInfo.get(reqItemId);
      const messageEl = resDoc.createElement("t:Message");
      const itemIdEl = resDoc.createElement("t:ItemId");
      itemIdEl.setAttribute("Id", reqItemId);
      const parentFolderIdEl = resDoc.createElement("t:ParentFolderId");
      parentFolderIdEl.setAttribute("Id", item.parentId);
      messageEl.appendChild(itemIdEl);
      messageEl.appendChild(parentFolderIdEl);

      if (item.syntheticMessage) {
        const messageIdEl = resDoc.createElement("t:InternetMessageId");
        messageIdEl.textContent = item.syntheticMessage.messageId;
        messageEl.appendChild(messageIdEl);

        const dateEl = resDoc.createElement("t:DateTimeSent");
        dateEl.textContent = item.syntheticMessage.date.toISOString();
        messageEl.appendChild(dateEl);

        const senderEl = resDoc.createElement("t:Sender");
        const mailboxEl = resDoc.createElement("t:Mailbox");
        const nameEl = resDoc.createElement("t:Name");
        nameEl.textContent = item.syntheticMessage.fromName;
        mailboxEl.appendChild(nameEl);
        const emailAddressEl = resDoc.createElement("t:EmailAddress");
        emailAddressEl.textContent = item.syntheticMessage.fromAddress;
        mailboxEl.appendChild(emailAddressEl);
        senderEl.appendChild(mailboxEl);
        messageEl.appendChild(senderEl);

        const toEl = resDoc.createElement("t:DisplayTo");
        toEl.textContent = item.syntheticMessage.toName;
        messageEl.appendChild(toEl);

        const subjectEl = resDoc.createElement("t:Subject");
        subjectEl.textContent = item.syntheticMessage.subject;
        messageEl.appendChild(subjectEl);

        const isReadEl = resDoc.createElement("t:IsRead");
        isReadEl.textContent = item.syntheticMessage.metaState.read;
        messageEl.appendChild(isReadEl);

        const sizeEl = resDoc.createElement("t:Size");
        sizeEl.textContent = item.syntheticMessage.toMessageString().length;
        messageEl.appendChild(sizeEl);

        if (includeContent) {
          const contentEl = resDoc.createElement("t:MimeContent");
          contentEl.textContent = btoa(item.syntheticMessage.toMessageString());
          messageEl.appendChild(contentEl);
        }
      }

      itemsEl.appendChild(messageEl);
    });

    return this.#serializer.serializeToString(resDoc);
  }

  /**
   * Return a response to a `DeleteItem` request.
   *
   * @param {XMLDocument} reqDoc
   */
  #generateDeleteItemResponse(reqDoc) {
    const resDoc = this.#parser.parseFromString(
      DELETE_ITEM_RESPONSE_BASE,
      "text/xml"
    );

    this.#setVersion(resDoc);

    const reqItemIds = [...reqDoc.getElementsByTagName("t:ItemId")].map(id =>
      id.getAttribute("Id")
    );

    const responseMessagesEl =
      resDoc.getElementsByTagName("m:ResponseMessages")[0];
    for (const id of reqItemIds) {
      this.deleteItem(id);
      const responseMessageEl = responseMessagesEl.appendChild(
        resDoc.createElement("m:DeleteItemResponseMessage")
      );
      responseMessageEl.setAttribute("ResponseClass", "Success");
      responseMessageEl.appendChild(
        resDoc.createElement("m:ResponseCode")
      ).textContent = "NoError";
    }

    return this.#serializer.serializeToString(resDoc);
  }

  /**
   * Return a response to a `MarkAsJunk` request.
   *
   * @param {XMLDocument} reqDoc
   */
  #generateMarkAsJunkResponse(reqDoc) {
    const resDoc = this.#parser.parseFromString(
      MARK_AS_JUNK_RESPONSE_BASE,
      "text/xml"
    );

    this.#setVersion(resDoc);

    const markAsJunkEl = reqDoc.getElementsByTagName("MarkAsJunk")[0];
    const isJunk = markAsJunkEl.getAttribute("IsJunk") === "true";

    const itemIds = [...reqDoc.getElementsByTagName("t:ItemId")].map(id =>
      id.getAttribute("Id")
    );

    const responseMessagesEl =
      resDoc.getElementsByTagName("m:ResponseMessages")[0];
    for (const id of itemIds) {
      if (isJunk) {
        this.addNewItemOrMoveItemToFolder(id, "junkemail");
      } else {
        this.addNewItemOrMoveItemToFolder(id, "inbox");
      }
      const responseMessageEl = resDoc.createElement(
        "m:MarkAsJunkResponseMessage"
      );
      responseMessageEl.setAttribute("ResponseClass", "Success");
      const responseCodeEl = resDoc.createElement("m:ResponseCode");
      responseCodeEl.textContent = "NoError";
      const movedItemIdEl = resDoc.createElement("m:MovedItemId");
      movedItemIdEl.setAttribute("Id", id);
      responseMessageEl.appendChild(responseCodeEl);
      responseMessageEl.appendChild(movedItemIdEl);
      responseMessagesEl.appendChild(responseMessageEl);
    }

    return this.#serializer.serializeToString(resDoc);
  }

  /**
   * Generate a response to a DeleteFolder operation.
   *
   * @see {@link https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/deletefolder-operation#successful-deletefolder-response}
   * @param {XMLDocument} reqDoc - The parsed document for the request to respond to.
   * @returns {string} A serialized XML document.
   */
  #generateDeleteFolderResponse(reqDoc) {
    // Figure out which folder IDs (or distinguished IDs have been requested).
    const requestedFolderIds = [
      ...reqDoc.getElementsByTagName("FolderIds")[0].children,
    ].map(c => c.getAttribute("Id"));

    // Map the requested IDs to actual folders if we have them. A `null` folder
    // in the resulting array means the folder couldn't be found on the server,
    // and the relevant response message should reflect this.
    const responseFolders = requestedFolderIds.map(id => {
      // Try to match against a known distinguished ID.
      if (this.#distinguishedIdToFolder.has(id)) {
        return this.#distinguishedIdToFolder.get(id);
      }

      // If that failed, try to match against a known folder ID.=
      if (this.#idToFolder.has(id)) {
        return this.#idToFolder.get(id);
      }

      return null;
    });

    // Generate a base document for the response.
    const resDoc = this.#parser.parseFromString(
      DELETE_FOLDER_RESPONSE_BASE,
      "text/xml"
    );

    this.#setVersion(resDoc);

    const resMsgsEl = resDoc.getElementsByTagName("m:ResponseMessages")[0];

    // Add each folder to the response document.
    responseFolders.forEach(folder => {
      if (folder) {
        // Mark the remote folder as deleted, so that this is represented in the
        // next sync.
        this.deleteRemoteFolderById(folder.id);

        // Indicate that no error happened when retrieving this message.
        const resCodeEl = resDoc.createElement("m:ResponseCode");
        resCodeEl.appendChild(resDoc.createTextNode("NoError"));

        // Build the m:DeleteFolderResponseMessage element, which is parent to
        // m:ResponseCode.
        const messageEl = resDoc.createElement("m:DeleteFolderResponseMessage");
        messageEl.setAttribute("ResponseClass", "Success");
        messageEl.appendChild(resCodeEl);

        // Add the message to the document.
        resMsgsEl.appendChild(messageEl);
      } else {
        // We couldn't find a folder with this ID, so format the response
        // message as an `ErrorFolderNotFound` error.
        const messageEl = resDoc.createElement("m:DeleteFolderResponseMessage");
        messageEl.setAttribute("ResponseClass", "Error");

        // Add the response code to the response message.
        const resCodeEl = resDoc.createElement("m:ResponseCode");
        resCodeEl.appendChild(resDoc.createTextNode("ErrorItemNotFound"));
        messageEl.appendChild(resCodeEl);

        // Add a human-readable representation of the error to the response
        // message.
        const errMessageEl = resDoc.createElement("m:MessageText");
        errMessageEl.appendChild(resDoc.createTextNode("Folder not found"));
        messageEl.appendChild(errMessageEl);

        // Append the message to the document.
        resMsgsEl.appendChild(messageEl);
      }
    });

    // Serialize the response to a string that the consumer can return in a response.
    return this.#serializer.serializeToString(resDoc);
  }

  /**
   * Add a new remote folder to the server to include in future responses.
   *
   * @param {RemoteFolder} folder
   */
  appendRemoteFolder(folder) {
    this.folders.push(folder);
    this.#idToFolder.set(folder.id, folder);
    if (folder.distinguishedId) {
      this.#distinguishedIdToFolder.set(folder.distinguishedId, folder);
    }
    if (folder.distinguishedId != "msgfolderroot") {
      this.folderChanges.push(["create", folder.id]);
    }
  }

  /**
   * Delete a remote folder given its id.
   *
   * @param {string} id
   */
  deleteRemoteFolderById(id) {
    const folderToDelete = this.folders.find(value => value.id == id);
    if (folderToDelete) {
      const indexOfDeletedFolder = this.folders.indexOf(folderToDelete);
      this.folders.splice(indexOfDeletedFolder, 1);
      this.#idToFolder.delete(folderToDelete.id);
      if (folderToDelete.distinguishedId) {
        this.#distinguishedIdToFolder.delete(folderToDelete.distinguishedId);
      }
      this.deletedFolders.push(folderToDelete);
      this.folderChanges.push(["delete", id]);
    }
  }

  /**
   * Rename a folder given its id and a new name.
   *
   * @param {string} id
   * @param {string} newName
   */
  renameFolderById(id, newName) {
    const folder = this.#idToFolder.get(id);
    if (folder) {
      folder.displayName = newName;
      this.updatedFolderIds.push(id);
      this.folderChanges.push(["update", id]);
    }
  }

  /**
   * Change the parent folder of a folder.
   *
   * @param {string} id - The id of the folder to change the parent of.
   * @param {string} newParentId - The id of the new parent folder.
   */
  reparentFolderById(id, newParentId) {
    const childFolder = this.#idToFolder.get(id);
    if (!!childFolder && this.#idToFolder.has(newParentId)) {
      childFolder.parentId = newParentId;
      this.updatedFolderIds.push(id);
      this.folderChanges.push(["update", id]);
    }
  }

  /**
   * Removes all items from the server.
   */
  clearItems() {
    this.#itemIdToItemInfo.clear();
    this.itemChanges = [];
  }

  /**
   * Add a new item to a folder or move an existing item to a new folder.
   *
   * If the given  `itemId` is already on the server, then it is moved
   * from its current location to the newly specified `folderId`. If the
   * given `itemId` does not yet exist on the server, it is added to the
   * specified `folderId`.
   *
   * @param {string} itemId
   * @param {string} folderId
   * @param {SyntheticMessage} [syntheticMessage] - Message data from
   *   MessageGenerator, if this item is a message.
   */
  addNewItemOrMoveItemToFolder(itemId, folderId, syntheticMessage) {
    let itemInfo = this.#itemIdToItemInfo.get(itemId);
    if (itemInfo) {
      this.itemChanges.push(["delete", itemInfo.parentId, itemId]);
      itemInfo.parentId = folderId;
      this.itemChanges.push(["create", folderId, itemId]);
    } else {
      itemInfo = new ItemInfo(folderId, syntheticMessage);
      this.itemChanges.push(["create", folderId, itemId]);
    }
    this.#itemIdToItemInfo.set(itemId, itemInfo);
  }

  /**
   * Add messages to a folder. To be used with MessageGenerator.
   *
   * @param {string} folderId
   * @param {SyntheticMessage[]} messages
   */
  addMessages(folderId, messages) {
    for (const message of messages) {
      this.addNewItemOrMoveItemToFolder(
        btoa(message.messageId),
        folderId,
        message
      );
    }
  }

  /**
   * Deletes an item from the server.
   *
   * @param {string} itemId
   */
  deleteItem(itemId) {
    const itemInfo = this.#itemIdToItemInfo.get(itemId);
    if (itemInfo) {
      this.itemChanges.push(["delete", itemInfo.parentId, itemId]);
      this.#itemIdToItemInfo.delete(itemId);
    }
  }

  /**
   * Get the item with the given id.
   *
   * @param {string} itemId
   * @returns {ItemInfo}
   */
  getItem(itemId) {
    return this.#itemIdToItemInfo.get(itemId);
  }

  /**
   * Get the id of the folder containing the item with the given id.
   *
   * @param {string} itemId
   */
  getContainingFolderId(itemId) {
    return this.#itemIdToItemInfo.get(itemId).parentId;
  }

  /**
   * Get all of the items in a folder.
   *
   * @param {string} folderId
   * @returns {ItemInfo[]}
   */
  getItemsInFolder(folderId) {
    const items = [];
    for (const item of this.#itemIdToItemInfo.values()) {
      if (item.parentId === folderId) {
        items.push(item);
      }
    }
    return items;
  }

  /**
   * Construct a response for the EWS Move[Item,Folder] operations.
   *
   * @param {string} responseBase The response document base XML.
   * @param {string} responseMessageElementName The name of the top level response message element.
   * @param {string} collectionElementName The name of the element containing the collection of response objects.
   * @param {string} objectElementName The name of the element containing individual response objects.
   * @param {string} idElementName The name of the element containing response object ids.
   * @param {[string]} ids The EWS IDs to place in the document.
   * @returns {XMLDocument} The response document for the request.
   */
  #buildGenericMoveResponse(
    responseBase,
    responseMessageElementName,
    collectionElementName,
    objectElementName,
    idElementName,
    ids
  ) {
    const resDoc = this.#parser.parseFromString(responseBase, "text/xml");

    this.#setVersion(resDoc);

    const responseMessagesEl =
      resDoc.getElementsByTagName("m:ResponseMessages")[0];

    // Response Message XML Structure:
    //    <[responseMessageElementName] ResponseClass="Success">
    //      <m:ResponseCode>NoError</m:ResponseCode>
    //      <[collectionElementName]>
    //        <[objectElementName]>
    //          <[idElementName] Id="asdf"/>
    //        </[objectElementName]>
    //      </[collectionElementName]>
    //    </[responseMessageElementName]>

    ids.forEach(id => {
      const responseMessageEl = resDoc.createElement(
        responseMessageElementName
      );
      responseMessageEl.setAttribute("ResponseClass", "Success");

      const responseCodeEl = resDoc.createElement("m:ResponseCode");
      responseCodeEl.textContent = "NoError";
      responseMessageEl.appendChild(responseCodeEl);

      const itemsEl = resDoc.createElement(collectionElementName);
      const messageEl = resDoc.createElement(objectElementName);
      const itemIdEl = resDoc.createElement(idElementName);
      itemIdEl.setAttribute("Id", id);
      messageEl.appendChild(itemIdEl);
      itemsEl.appendChild(messageEl);
      responseMessageEl.appendChild(itemsEl);

      responseMessagesEl.appendChild(responseMessageEl);
    });

    return resDoc;
  }
}

/**
 * Extract the ids for objects (items or folders) to move from a request.
 *
 * @param {XMLDocument} reqDoc The XML request document.
 * @param {string} collectionElementName The name of the XML element that contains the id collection.
 * @param {string} objectElementName The name of the XML element that contains each individual object.
 *
 * @returns {[string, string[]]} a pair containing the destination folder id in
 *                               the first element and the list of object IDs to
 *                               move in the second element.
 */
function extractMoveObjects(reqDoc, collectionElementName, objectElementName) {
  const destinationFolderId = reqDoc
    .getElementsByTagName("ToFolderId")[0]
    .getElementsByTagName("t:FolderId")[0]
    .getAttribute("Id");

  const objectIds = [
    ...reqDoc
      .getElementsByTagName(collectionElementName)[0]
      .getElementsByTagName(objectElementName),
  ].map(e => e.getAttribute("Id"));

  return [destinationFolderId, objectIds];
}
