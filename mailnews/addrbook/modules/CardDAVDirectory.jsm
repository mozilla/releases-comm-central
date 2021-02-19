/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["CardDAVDirectory"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  AddrBookDirectory: "resource:///modules/AddrBookDirectory.jsm",
  clearInterval: "resource://gre/modules/Timer.jsm",
  fixIterator: "resource:///modules/iteratorUtils.jsm",
  OAuth2Module: "resource:///modules/OAuth2Module.jsm",
  OAuth2Providers: "resource:///modules/OAuth2Providers.jsm",
  Services: "resource://gre/modules/Services.jsm",
  setInterval: "resource://gre/modules/Timer.jsm",
  setTimeout: "resource://gre/modules/Timer.jsm",
  VCardUtils: "resource:///modules/VCardUtils.jsm",
});
XPCOMUtils.defineLazyServiceGetter(
  this,
  "nssErrorsService",
  "@mozilla.org/nss_errors_service;1",
  "nsINSSErrorsService"
);

const PREFIX_BINDINGS = {
  card: "urn:ietf:params:xml:ns:carddav",
  cs: "http://calendarserver.org/ns/",
  d: "DAV:",
};
const NAMESPACE_STRING = Object.entries(PREFIX_BINDINGS)
  .map(([prefix, url]) => `xmlns:${prefix}="${url}"`)
  .join(" ");

/**
 * @extends AddrBookDirectory
 * @implements nsIAbDirectory
 */
class CardDAVDirectory extends AddrBookDirectory {
  /** nsIAbDirectory */

  init(uri) {
    super.init(uri);

    // If this directory is configured, start sync'ing with the server in 30s.
    // Don't do this immediately, as this code runs at start-up and could
    // impact performance if there are lots of changes to process.
    if (this._serverURL && this.getIntValue("carddav.syncinterval", 30) > 0) {
      this._syncTimer = setTimeout(() => this.updateAllFromServer(), 30000);
    }
  }
  destroy() {
    if (this._syncTimer) {
      clearInterval(this._syncTimer);
      this._syncTimer = null;
    }
  }

  get propertiesChromeURI() {
    return "chrome://messenger/content/addressbook/abCardDAVProperties.xhtml";
  }
  get dirType() {
    return Ci.nsIAbManager.CARDDAV_DIRECTORY_TYPE;
  }
  get supportsMailingLists() {
    return false;
  }

  modifyCard(card) {
    // Well this is awkward. Because it's defined in nsIAbDirectory,
    // modifyCard must not be async, but we need to do async operations.

    if (this._readOnly) {
      throw new Components.Exception(
        "Directory is read-only",
        Cr.NS_ERROR_FAILURE
      );
    }

    // We've thrown the most likely exception synchronously, now do the rest.

    this._modifyCard(card);
  }
  async _modifyCard(card) {
    let oldProperties = this._loadCardProperties(card.UID);

    let newProperties = new Map();
    for (let { name, value } of fixIterator(card.properties, Ci.nsIProperty)) {
      newProperties.set(name, value);
    }

    let sendSucceeded = await this._sendCardToServer(card);
    if (!sendSucceeded) {
      // _etag and _vCard properties have now been updated. Work out what
      // properties changed on the server, and copy them to `card`, but only
      // if they haven't also changed on the client.
      let serverCard = VCardUtils.vCardToAbCard(card.getProperty("_vCard", ""));
      for (let { name, value } of fixIterator(
        serverCard.properties,
        Ci.nsIProperty
      )) {
        if (
          value != newProperties.get(name) &&
          newProperties.get(name) == oldProperties.get(name)
        ) {
          card.setProperty(name, value);
        }
      }

      // Send the card back to the server. This time, the ETag matches what's
      // on the server, so this should succeed.
      await this._sendCardToServer(card);
    }

    // Store in the database.
    super.modifyCard(card);
  }
  deleteCards(cards) {
    super.deleteCards(cards);
    for (let card of cards) {
      this._deleteCardFromServer(card);
    }
  }
  dropCard(card, needToCopyCard) {
    // Ideally, we'd not add the card until it was on the server, but we have
    // to return newCard synchronously.
    let newCard = super.dropCard(card, needToCopyCard);
    this._sendCardToServer(newCard).then(() => super.modifyCard(newCard));
    return newCard;
  }
  addMailList() {
    throw Components.Exception(
      "CardDAVDirectory does not implement addMailList",
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  }
  editMailListToDatabase() {
    throw Components.Exception(
      "CardDAVDirectory does not implement editMailListToDatabase",
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  }
  copyMailList() {
    throw Components.Exception(
      "CardDAVDirectory does not implement copyMailList",
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  }
  setIntValue(name, value) {
    super.setIntValue(name, value);

    // Capture changes to the sync interval from the UI.
    if (name == "carddav.syncinterval") {
      this._scheduleNextSync();
    }
  }

  /** CardDAV specific */
  _syncInProgress = false;
  _syncTimer = null;

  get _serverURL() {
    return this.getStringValue("carddav.url", "");
  }
  get _syncToken() {
    return this.getStringValue("carddav.token", "");
  }
  set _syncToken(value) {
    this.setStringValue("carddav.token", value);
  }

  /**
   * Wraps makeRequest, resolving path this directory's server URL, and
   * providing a mechanism to give a username and password specific to this
   * directory.
   *
   * @param {String} path - A path relative to the server URL.
   * @param {Object} details - See makeRequest.
   * @return {Promise<Object>} - See makeRequest.
   */
  async _makeRequest(path, details = {}) {
    let serverURI = Services.io.newURI(this._serverURL);
    let uri = serverURI.resolve(path);

    if (!("_oAuth" in this)) {
      let details = OAuth2Providers.getHostnameDetails(serverURI.host);
      if (details) {
        this._oAuth = new OAuth2Module();
        this._oAuth.initFromABDirectory(this, serverURI.host);
      } else {
        this._oAuth = null;
      }
    }
    details.oAuth = this._oAuth;

    details.username = this.getStringValue("carddav.username", "");
    details.privateBrowsingId = CardDAVDirectory._contextForUsername(
      details.username
    );

    let response = await CardDAVDirectory.makeRequest(uri, details);
    if (
      details.expectedStatuses &&
      !details.expectedStatuses.includes(response.status)
    ) {
      throw Components.Exception(
        `Incorrect response from server: ${response.status} ${response.statusText}`,
        Cr.NS_ERROR_FAILURE
      );
    }
    return response;
  }

  /**
   * Gets or creates the path for storing this card on the server. Cards that
   * already exist on the server have this value in the _href property.
   *
   * @param {nsIAbCard} card
   * @return {String}
   */
  _getCardHref(card) {
    let href = card.getProperty("_href", "");
    if (href) {
      return href;
    }
    href = Services.io.newURI(this._serverURL).resolve(`${card.UID}.vcf`);
    return new URL(href).pathname;
  }

  _multigetRequest(hrefsToFetch) {
    hrefsToFetch = hrefsToFetch.map(
      href => `      <d:href>${xmlEncode(href)}</d:href>`
    );
    let data = `<card:addressbook-multiget ${NAMESPACE_STRING}>
      <d:prop>
        <cs:getetag/>
        <card:address-data/>
      </d:prop>
      ${hrefsToFetch.join("\n")}
    </card:addressbook-multiget>`;

    return this._makeRequest("", {
      method: "REPORT",
      body: data,
      headers: {
        Depth: 1,
      },
      expectedStatuses: [207],
    });
  }

  /**
   * Performs a multiget request for the provided hrefs, and adds each response
   * to the directory, adding or modifying as necessary.
   *
   * @param {String[]} hrefsToFetch - The href of each card to be requested.
   */
  async _fetchAndStore(hrefsToFetch) {
    if (hrefsToFetch.length == 0) {
      return;
    }

    let response = await this._multigetRequest(hrefsToFetch);

    // If this directory is set to read-only, the following operations would
    // throw NS_ERROR_FAILURE, but sync operations are allowed on a read-only
    // directory, so set this._overrideReadOnly to avoid the exception.
    //
    // Do not use await while it is set, and use a try/finally block to ensure
    // it is cleared.

    try {
      this._overrideReadOnly = true;
      for (let { href, properties } of this._readResponse(response.dom)) {
        if (!properties) {
          continue;
        }

        let etag = properties.querySelector("getetag")?.textContent;
        let vCard = normalizeLineEndings(
          properties.querySelector("address-data")?.textContent
        );

        let abCard = VCardUtils.vCardToAbCard(vCard);
        abCard.setProperty("_etag", etag);
        abCard.setProperty("_href", href);
        abCard.setProperty("_vCard", vCard);

        if (!this._cards.has(abCard.UID)) {
          super.dropCard(abCard, false);
        } else if (this._loadCardProperties(abCard.UID).get("_etag") != etag) {
          super.modifyCard(abCard);
        }
      }
    } finally {
      this._overrideReadOnly = false;
    }
  }

  /**
   * Reads a multistatus response, yielding once for each response element.
   *
   * @param {Document} dom - as returned by makeRequest.
   * @yields {Object} - An object representing a single <response> element
   *     from the document:
   *     - href, the href of the object represented
   *     - notFound, if a 404 status applies to this response
   *     - properties, the <prop> element, if any, containing properties
   *         of the object represented
   */
  _readResponse = function*(dom) {
    if (!dom || dom.documentElement.localName != "multistatus") {
      throw Components.Exception(
        `Expected a multistatus response, but didn't get one`,
        Cr.NS_ERROR_FAILURE
      );
    }

    for (let r of dom.querySelectorAll("response")) {
      let response = {
        href: r.querySelector("href")?.textContent,
      };

      let responseStatus = r.querySelector("response > status");
      if (responseStatus?.textContent.startsWith("HTTP/1.1 404")) {
        response.notFound = true;
        yield response;
        continue;
      }

      for (let p of r.querySelectorAll("response > propstat")) {
        let status = p.querySelector("propstat > status").textContent;
        if (status == "HTTP/1.1 200 OK") {
          response.properties = p.querySelector("propstat > prop");
        }
      }

      yield response;
    }
  };

  /**
   * Converts the card to a vCard and performs a PUT request to store it on the
   * server. Then immediately performs a GET request ensuring the local copy
   * matches the server copy.
   *
   * @param {nsIAbCard} card
   * @returns {boolean} true if the PUT request succeeded without conflict,
   *     false if there was a conflict.
   * @throws if the server responded with anything other than a success or
   *     conflict status code.
   */
  async _sendCardToServer(card) {
    let href = this._getCardHref(card);
    let requestDetails = {
      method: "PUT",
      contentType: "text/vcard",
    };

    let existingVCard = card.getProperty("_vCard", "");
    if (existingVCard) {
      requestDetails.body = VCardUtils.modifyVCard(existingVCard, card);
      let existingETag = card.getProperty("_etag", "");
      if (existingETag) {
        requestDetails.headers = { "If-Match": existingETag };
      }
    } else {
      // TODO 3.0 is the default, should we be able to use other versions?
      requestDetails.body = VCardUtils.abCardToVCard(card, "3.0");
    }
    let response = await this._makeRequest(href, requestDetails);
    let conflictResponse = [409, 412].includes(response.status);
    if (response.status >= 400 && !conflictResponse) {
      throw Components.Exception(
        `Sending card to the server failed, response was ${response.status} ${response.statusText}`,
        Cr.NS_ERROR_FAILURE
      );
    }

    // At this point we *should* be able to make a simple GET request and
    // store the response. But Google moves the data (fair enough) without
    // telling us where it went (c'mon, really?). Fortunately a multiget
    // request at the original location works.

    response = await this._multigetRequest([href]);

    for (let { href, properties } of this._readResponse(response.dom)) {
      if (!properties) {
        continue;
      }

      let etag = properties.querySelector("getetag")?.textContent;
      let vCard = normalizeLineEndings(
        properties.querySelector("address-data")?.textContent
      );

      card.setProperty("_etag", etag);
      card.setProperty("_href", href);
      card.setProperty("_vCard", vCard);
    }

    return !conflictResponse;
  }

  /**
   * Deletes card from the server.
   *
   * @param {nsIAbCard} card
   */
  _deleteCardFromServer(card) {
    let href = card.getProperty("_href", "");
    if (!href) {
      return Promise.resolve();
    }

    return this._makeRequest(href, { method: "DELETE" });
  }

  /**
   * Set up a repeating timer for synchronisation with the server. The timer's
   * interval is defined by pref, set it to 0 to disable sync'ing altogether.
   */
  _scheduleNextSync() {
    if (this._syncTimer) {
      clearInterval(this._syncTimer);
      this._syncTimer = null;
    }

    let interval = this.getIntValue("carddav.syncinterval", 30);
    if (interval <= 0) {
      return;
    }

    this._syncTimer = setInterval(
      () => this.updateAllFromServer(false),
      interval * 60000
    );
  }

  /**
   * Get all cards on the server and add them to this directory. This should
   * be used for the initial population of a directory.
   */
  async fetchAllFromServer() {
    this._syncInProgress = true;

    let data = `<propfind xmlns="${PREFIX_BINDINGS.d}" ${NAMESPACE_STRING}>
      <prop>
        <resourcetype/>
        <cs:getetag/>
        <cs:getctag/>
      </prop>
    </propfind>`;

    let response = await this._makeRequest("", {
      method: "PROPFIND",
      body: data,
      headers: {
        Depth: 1,
      },
      expectedStatuses: [207],
    });

    let hrefsToFetch = [];
    for (let { href, properties } of this._readResponse(response.dom)) {
      if (properties && !properties.querySelector("resourcetype collection")) {
        hrefsToFetch.push(href);
      }
    }

    if (hrefsToFetch.length > 0) {
      response = await this._multigetRequest(hrefsToFetch);

      let abCards = [];

      for (let { href, properties } of this._readResponse(response.dom)) {
        if (!properties) {
          continue;
        }

        let etag = properties.querySelector("getetag")?.textContent;
        let vCard = normalizeLineEndings(
          properties.querySelector("address-data")?.textContent
        );

        try {
          let abCard = VCardUtils.vCardToAbCard(vCard);
          abCard.setProperty("_etag", etag);
          abCard.setProperty("_href", href);
          abCard.setProperty("_vCard", vCard);
          abCards.push(abCard);
        } catch (ex) {
          console.error(`Error parsing: ${vCard}`);
          Cu.reportError(ex);
        }
      }

      await this._bulkAddCards(abCards);
    }

    await this._getSyncToken();

    Services.obs.notifyObservers(this, "addrbook-directory-synced");

    this._scheduleNextSync();
    this._syncInProgress = false;
  }

  /**
   * Begin a sync operation. This function will decide which sync protocol to
   * use based on the directory's configuration. It will also (re)start the
   * timer for the next synchronisation unless told not to.
   *
   * @param {boolean} shouldResetTimer
   */
  async updateAllFromServer(shouldResetTimer = true) {
    if (this._syncInProgress || !this._serverURL) {
      return;
    }

    this._syncInProgress = true;

    if (this._syncToken) {
      await this.updateAllFromServerV2();
    } else {
      await this.updateAllFromServerV1();
    }

    if (shouldResetTimer) {
      this._scheduleNextSync();
    }
    this._syncInProgress = false;
  }

  /**
   * Compares cards in the directory with cards on the server, and updates the
   * directory to match what is on the server.
   */
  async updateAllFromServerV1() {
    let data = `<propfind xmlns="${PREFIX_BINDINGS.d}" ${NAMESPACE_STRING}>
      <prop>
        <resourcetype/>
        <cs:getetag/>
        <cs:getctag/>
      </prop>
    </propfind>`;

    let response = await this._makeRequest("", {
      method: "PROPFIND",
      body: data,
      headers: {
        Depth: 1,
      },
      expectedStatuses: [207],
    });

    let hrefMap = new Map();
    for (let { href, properties } of this._readResponse(response.dom)) {
      if (
        !properties ||
        !properties.querySelector("resourcetype") ||
        properties.querySelector("resourcetype collection")
      ) {
        continue;
      }

      let etag = properties.querySelector("getetag").textContent;
      hrefMap.set(href, etag);
    }

    let cardMap = new Map();
    let hrefsToFetch = [];
    let cardsToDelete = [];
    for (let card of this.childCards) {
      let href = card.getProperty("_href", "");
      let etag = card.getProperty("_etag", "");

      if (!href || !etag) {
        // Not sure how we got here. Ignore it.
        continue;
      }
      cardMap.set(href, card);
      if (hrefMap.has(href)) {
        if (hrefMap.get(href) != etag) {
          // The card was updated on server.
          hrefsToFetch.push(href);
        }
      } else {
        // The card doesn't exist on the server.
        cardsToDelete.push(card);
      }
    }

    for (let href of hrefMap.keys()) {
      if (!cardMap.has(href)) {
        // The card is new on the server.
        hrefsToFetch.push(href);
      }
    }

    // If this directory is set to read-only, the following operations would
    // throw NS_ERROR_FAILURE, but sync operations are allowed on a read-only
    // directory, so set this._overrideReadOnly to avoid the exception.
    //
    // Do not use await while it is set, and use a try/finally block to ensure
    // it is cleared.

    if (cardsToDelete.length > 0) {
      this._overrideReadOnly = true;
      try {
        super.deleteCards(cardsToDelete);
      } finally {
        this._overrideReadOnly = false;
      }
    }

    await this._fetchAndStore(hrefsToFetch);

    Services.obs.notifyObservers(this, "addrbook-directory-synced");
  }

  /**
   * Retrieves the current sync token from the server.
   *
   * @see RFC 6578
   */
  async _getSyncToken() {
    let data = `<propfind xmlns="${PREFIX_BINDINGS.d}" ${NAMESPACE_STRING}>
      <prop>
         <displayname/>
         <cs:getctag/>
         <sync-token/>
      </prop>
    </propfind>`;

    let response = await this._makeRequest("", {
      method: "PROPFIND",
      body: data,
      headers: {
        Depth: 0,
      },
    });

    if (response.status == 207) {
      for (let { properties } of this._readResponse(response.dom)) {
        let token = properties?.querySelector("prop sync-token");
        if (token) {
          this._syncToken = token.textContent;
          return;
        }
      }
    }

    this._syncToken = "";
  }

  /**
   * Gets a list of changes on the server since the last call to getSyncToken
   * or updateAllFromServerV2, and updates the directory to match what is on
   * the server.
   *
   * @see RFC 6578
   */
  async updateAllFromServerV2() {
    let syncToken = this._syncToken;
    if (!syncToken) {
      throw new Components.Exception("No sync token", Cr.NS_ERROR_UNEXPECTED);
    }

    let data = `<sync-collection xmlns="${
      PREFIX_BINDINGS.d
    }" ${NAMESPACE_STRING}>
      <sync-token>${xmlEncode(syncToken)}</sync-token>
      <sync-level>1</sync-level>
      <prop>
        <cs:getetag/>
        <card:address-data/>
      </prop>
    </sync-collection>`;

    let response = await this._makeRequest("", {
      method: "REPORT",
      body: data,
      headers: {
        Depth: 1, // Only Google seems to need this.
      },
      expectedStatuses: [207],
    });
    let dom = response.dom;

    // If this directory is set to read-only, the following operations would
    // throw NS_ERROR_FAILURE, but sync operations are allowed on a read-only
    // directory, so set this._overrideReadOnly to avoid the exception.
    //
    // Do not use await while it is set, and use a try/finally block to ensure
    // it is cleared.

    let hrefsToFetch = [];
    try {
      this._overrideReadOnly = true;
      let cardsToDelete = [];
      for (let { href, notFound, properties } of this._readResponse(dom)) {
        let card = this.getCardFromProperty("_href", href, true);
        if (notFound) {
          if (card) {
            cardsToDelete.push(card);
          }
          continue;
        }
        if (!properties) {
          continue;
        }

        let etag = properties.querySelector("getetag")?.textContent;
        if (!etag) {
          continue;
        }
        let vCard = properties.querySelector("address-data")?.textContent;
        if (!vCard) {
          hrefsToFetch.push(href);
          continue;
        }
        vCard = normalizeLineEndings(vCard);

        let abCard = VCardUtils.vCardToAbCard(vCard);
        abCard.setProperty("_etag", etag);
        abCard.setProperty("_href", href);
        abCard.setProperty("_vCard", vCard);

        if (card) {
          if (card.getProperty("_etag", "") != etag) {
            super.modifyCard(abCard);
          }
        } else {
          super.dropCard(abCard, false);
        }
      }

      if (cardsToDelete.length > 0) {
        super.deleteCards(cardsToDelete);
      }
    } finally {
      this._overrideReadOnly = false;
    }

    await this._fetchAndStore(hrefsToFetch);

    this._syncToken = dom.querySelector("sync-token").textContent;
    Services.obs.notifyObservers(this, "addrbook-directory-synced");
  }

  static forFile(fileName) {
    let directory = super.forFile(fileName);
    if (directory instanceof CardDAVDirectory) {
      return directory;
    }
    return undefined;
  }

  static _contextMap = new Map();
  /**
   * Returns the id of a unique private context for each username. When the
   * privateBrowsingId is set on a principal, this allows the use of multiple
   * usernames on the same server without the networking code causing issues.
   *
   * @param {String} username
   * @return {integer}
   */
  static _contextForUsername(username) {
    if (!username) {
      return Ci.nsIScriptSecurityManager.DEFAULT_PRIVATE_BROWSING_ID;
    }

    if (CardDAVDirectory._contextMap.has(username)) {
      return CardDAVDirectory._contextMap.get(username);
    }

    // This could be any 32-bit integer, as long as it isn't already in use.
    let nextId = 25000 + CardDAVDirectory._contextMap.size;
    CardDAVDirectory._contextMap.set(username, nextId);
    return nextId;
  }

  /**
   * Make an HTTP request. If the request needs a username and password, the
   * given authPrompt is called.
   *
   * @param {String}  uri
   * @param {Object}  details
   * @param {String}  [details.method]
   * @param {Object}  [details.headers]
   * @param {String}  [details.body]
   * @param {String}  [details.contentType]
   * @param {msgIOAuth2Module}  [details.oAuth] - If this is present the
   *     request will use OAuth2 authorization.
   * @param {String}  [details.username] - Used to pre-fill any auth dialogs.
   * @param {boolean} [details.shouldSaveAuth] - If false, defers saving
   *     username/password data to the password manager. Otherwise this
   *     happens immediately after a successful request, where applicable.
   * @param {integer} [details.privateBrowsingId] - See _contextForUsername.
   *
   * @return {Promise<Object>} - Resolves to an object with getters for:
   *    - status, the HTTP response code
   *    - statusText, the HTTP response message
   *    - text, the returned data as a String
   *    - dom, the returned data parsed into a Document
   */
  static async makeRequest(uri, details) {
    if (typeof uri == "string") {
      uri = Services.io.newURI(uri);
    }
    let {
      method = "GET",
      headers = {},
      body = null,
      contentType = "text/xml",
      oAuth = null,
      username = null,
      shouldSaveAuth = false,
      privateBrowsingId = Ci.nsIScriptSecurityManager
        .DEFAULT_PRIVATE_BROWSING_ID,
    } = details;
    headers["Content-Type"] = contentType;

    if (oAuth) {
      headers.Authorization = await new Promise((resolve, reject) => {
        oAuth.connect(true, {
          onSuccess(token) {
            resolve(
              // `token` is a base64-encoded string for SASL XOAUTH2. That is
              // not what we want, extract just the Bearer token part.
              // (See OAuth2Module.connect.)
              atob(token)
                .split("\x01")[1]
                .slice(5)
            );
          },
          onFailure: reject,
        });
      });
    }

    return new Promise((resolve, reject) => {
      let principal = Services.scriptSecurityManager.createContentPrincipal(
        uri,
        { privateBrowsingId }
      );

      let channel = Services.io.newChannelFromURI(
        uri,
        null,
        principal,
        null,
        Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
        Ci.nsIContentPolicy.TYPE_OTHER
      );
      channel.QueryInterface(Ci.nsIHttpChannel);
      for (let [name, value] of Object.entries(headers)) {
        channel.setRequestHeader(name, value, false);
      }
      if (body !== null) {
        let converter = Cc[
          "@mozilla.org/intl/scriptableunicodeconverter"
        ].createInstance(Ci.nsIScriptableUnicodeConverter);
        converter.charset = "UTF-8";
        let stream = converter.convertToInputStream(body.toString());

        channel.QueryInterface(Ci.nsIUploadChannel);
        channel.setUploadStream(stream, contentType, -1);
      }
      channel.requestMethod = method; // Must go after setUploadStream.

      let callbacks = new NotificationCallbacks(username);
      channel.notificationCallbacks = callbacks;

      let listener = Cc["@mozilla.org/network/stream-loader;1"].createInstance(
        Ci.nsIStreamLoader
      );
      listener.init({
        onStreamComplete(loader, context, status, resultLength, result) {
          let finalChannel = loader.request.QueryInterface(Ci.nsIHttpChannel);
          if (!Components.isSuccessCode(status)) {
            let isCertError = false;
            try {
              let errorType = nssErrorsService.getErrorClass(status);
              if (errorType == Ci.nsINSSErrorsService.ERROR_CLASS_BAD_CERT) {
                isCertError = true;
              }
            } catch (ex) {
              // nsINSSErrorsService.getErrorClass throws if given a non-TLS,
              // non-cert error, so ignore this.
            }

            if (isCertError && finalChannel.securityInfo) {
              let secInfo = finalChannel.securityInfo.QueryInterface(
                Ci.nsITransportSecurityInfo
              );
              let params = {
                exceptionAdded: false,
                securityInfo: secInfo,
                prefetchCert: true,
                location: finalChannel.originalURI.displayHost,
              };
              Services.wm
                .getMostRecentWindow("")
                .openDialog(
                  "chrome://pippki/content/exceptionDialog.xhtml",
                  "",
                  "chrome,centerscreen,modal",
                  params
                );

              if (params.exceptionAdded) {
                // Try again now that an exception has been added.
                CardDAVDirectory.makeRequest(uri, details).then(
                  resolve,
                  reject
                );
                return;
              }
            }

            reject(new Components.Exception("Connection failure", status));
            return;
          }
          if (finalChannel.responseStatus == 401) {
            // We tried to authenticate, but failed.
            reject(
              new Components.Exception(
                "Authorization failure",
                Cr.NS_ERROR_FAILURE
              )
            );
            return;
          }

          if (shouldSaveAuth) {
            callbacks.saveAuth();
          }

          resolve({
            get status() {
              return finalChannel.responseStatus;
            },
            get statusText() {
              return finalChannel.responseStatusText;
            },
            get text() {
              return new TextDecoder().decode(Uint8Array.from(result));
            },
            get dom() {
              if (this._dom === undefined) {
                try {
                  this._dom = new DOMParser().parseFromString(
                    this.text,
                    "text/xml"
                  );
                } catch (ex) {
                  this._dom = null;
                }
              }
              return this._dom;
            },
            get authInfo() {
              return {
                username: callbacks.authInfo?.username,
                save() {
                  callbacks.saveAuth();
                },
              };
            },
          });
        },
      });
      channel.asyncOpen(listener, channel);
    });
  }
}
CardDAVDirectory.prototype.classID = Components.ID(
  "{1fa9941a-07d5-4a6f-9673-15327fc2b9ab}"
);

/**
 * Ensure that `string` always has Windows line-endings. Some functions,
 * notably DOMParser.parseFromString, strip \r, but we want it because \r\n
 * is a part of the vCard specification.
 */
function normalizeLineEndings(string) {
  if (string.includes("\r\n")) {
    return string;
  }
  return string.replace(/\n/g, "\r\n");
}

/**
 * Encode special characters safely for XML.
 */
function xmlEncode(string) {
  return string
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

class NotificationCallbacks {
  constructor(username) {
    this.username = username;
  }
  QueryInterface = ChromeUtils.generateQI([
    "nsIInterfaceRequestor",
    "nsIAuthPrompt2",
    "nsIChannelEventSink",
  ]);
  getInterface = ChromeUtils.generateQI([
    "nsIAuthPrompt2",
    "nsIChannelEventSink",
  ]);
  promptAuth(channel, level, authInfo) {
    if (authInfo.flags & Ci.nsIAuthInformation.PREVIOUS_FAILED) {
      return false;
    }
    let logins = Services.logins.findLogins(channel.URI.prePath, null, "");
    for (let l of logins) {
      if (l.username == this.username) {
        authInfo.username = l.username;
        authInfo.password = l.password;
        return true;
      }
    }

    let savePasswordLabel = null;
    let savePassword = {};
    if (Services.prefs.getBoolPref("signon.rememberSignons", true)) {
      savePasswordLabel = Services.strings
        .createBundle("chrome://passwordmgr/locale/passwordmgr.properties")
        .GetStringFromName("rememberPassword");
      savePassword.value = true;
    }
    let returnValue = Services.prompt.promptAuth(
      Services.wm.getMostRecentWindow(""),
      channel,
      level,
      authInfo,
      savePasswordLabel,
      savePassword
    );
    if (returnValue) {
      this.shouldSaveAuth = savePassword.value;
      this.origin = channel.URI.prePath;
    }
    this.authInfo = authInfo;
    return returnValue;
  }
  saveAuth() {
    if (this.shouldSaveAuth) {
      let newLoginInfo = Cc[
        "@mozilla.org/login-manager/loginInfo;1"
      ].createInstance(Ci.nsILoginInfo);
      newLoginInfo.init(
        this.origin,
        null,
        this.authInfo.realm,
        this.authInfo.username,
        this.authInfo.password,
        "",
        ""
      );
      try {
        Services.logins.addLogin(newLoginInfo);
      } catch (ex) {
        Cu.reportError(ex);
      }
    }
  }
  asyncOnChannelRedirect(oldChannel, newChannel, flags, callback) {
    /**
     * Copy the given header from the old channel to the new one, ignoring missing headers
     *
     * @param {String} header - The header to copy
     */
    function copyHeader(header) {
      try {
        let headerValue = oldChannel.getRequestHeader(header);
        if (headerValue) {
          newChannel.setRequestHeader(header, headerValue, false);
        }
      } catch (e) {
        if (e.result != Cr.NS_ERROR_NOT_AVAILABLE) {
          // The header could possibly not be available, ignore that
          // case but throw otherwise
          throw e;
        }
      }
    }

    // Make sure we can get/set headers on both channels.
    newChannel.QueryInterface(Ci.nsIHttpChannel);
    oldChannel.QueryInterface(Ci.nsIHttpChannel);

    // If any other header is used, it should be added here. We might want
    // to just copy all headers over to the new channel.
    copyHeader("Authorization");
    copyHeader("Depth");
    copyHeader("Originator");
    copyHeader("Recipient");
    copyHeader("If-None-Match");
    copyHeader("If-Match");

    newChannel.requestMethod = oldChannel.requestMethod;
    callback.onRedirectVerifyCallback(Cr.NS_OK);
  }
}
