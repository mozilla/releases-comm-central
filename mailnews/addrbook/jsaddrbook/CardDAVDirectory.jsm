/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["CardDAVDirectory"];

const { AddrBookDirectory } = ChromeUtils.import(
  "resource:///modules/AddrBookDirectory.jsm"
);
const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
const { VCardUtils } = ChromeUtils.import("resource:///modules/VCardUtils.jsm");

/**
 * @extends AddrBookDirectory
 * @implements nsIAbDirectory
 */
class CardDAVDirectory extends AddrBookDirectory {
  /** nsIAbDirectory */

  get supportsMailingLists() {
    return false;
  }

  modifyCard(card) {
    super.modifyCard(card);
    this._sendCardToServer(card);
  }
  deleteCards(cards) {
    super.deleteCards(cards);
    for (let card of cards) {
      this._deleteCardFromServer(card);
    }
  }
  dropCard(card, needToCopyCard) {
    let newCard = super.dropCard(card, needToCopyCard);
    this._sendCardToServer(newCard);
    return newCard;
  }

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
  _makeRequest(path, details = {}) {
    let serverURI = Services.io.newURI(this._serverURL);
    let uri = serverURI.resolve(path);

    return CardDAVDirectory.makeRequest(uri, details);
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

  /**
   * Converts the card to a vCard and performs a PUT request to store it on the
   * server. Then immediately performs a GET request ensuring the local copy
   * matches the server copy.
   *
   * @param {nsIAbCard} card
   */
  async _sendCardToServer(card) {
    if (this._syncInProgress) {
      return;
    }
    let href = this._getCardHref(card);

    let existing = card.getProperty("_vCard", "");
    let data;
    if (existing) {
      data = VCardUtils.modifyVCard(existing, card);
    } else {
      // TODO 3.0 is the default, should we be able to use other versions?
      data = VCardUtils.abCardToVCard(card, "3.0");
    }
    let response = await this._makeRequest(href, {
      method: "PUT",
      body: data,
      contentType: "text/vcard",
    });

    response = await this._makeRequest(href);

    card.setProperty("_etag", response.etag);
    card.setProperty("_href", href);
    card.setProperty("_vCard", response.text);

    this._syncInProgress = true;
    this.modifyCard(card);
    this._syncInProgress = false;
  }

  /**
   * Deletes card from the server.
   *
   * @param {nsIAbCard} card
   */
  _deleteCardFromServer(card) {
    if (this._syncInProgress) {
      return Promise.resolve();
    }
    let href = card.getProperty("_href", "");
    if (!href) {
      return Promise.resolve();
    }

    return this._makeRequest(href, { method: "DELETE" });
  }

  /**
   * Get all cards on the server and add them to this directory. This should
   * be used for the initial population of a directory.
   */
  async fetchAllFromServer() {
    let data = `<propfind xmlns="DAV:" xmlns:cs="http://calendarserver.org/ns/">
      <prop>
        <resourcetype/>
        <cs:getetag/>
      </prop>
    </propfind>`;

    let response = await this._makeRequest("", {
      method: "PROPFIND",
      body: data,
      headers: {
        Depth: 1,
      },
    });

    let hrefsToFetch = [];
    for (let r of response.dom.querySelectorAll("response")) {
      if (!r.querySelector("resourcetype collection")) {
        hrefsToFetch.push(r.querySelector("href").textContent);
      }
    }

    hrefsToFetch = hrefsToFetch.map(
      href => `<d:href>${xmlEncode(href)}</d:href>`
    );
    data = `<addressbook-multiget xmlns="urn:ietf:params:xml:ns:carddav" xmlns:d="DAV:">
      <d:prop>
        <d:getetag/>
        <address-data/>
      </d:prop>
      ${hrefsToFetch.join("\n")}
    </addressbook-multiget>`;

    response = await this._makeRequest("", {
      method: "REPORT",
      body: data,
      headers: {
        Depth: 1,
      },
    });

    let abCards = [];

    for (let r of response.dom.querySelectorAll("response")) {
      let etag = r.querySelector("getetag").textContent;
      let href = r.querySelector("href").textContent;
      let vCard = normalizeLineEndings(
        r.querySelector("address-data").textContent
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

  /**
   * Compares cards in the directory with cards on the server, and updates the
   * directory to match what is on the server.
   */
  async updateAllFromServer() {
    let data = `<addressbook-query xmlns="urn:ietf:params:xml:ns:carddav" xmlns:d="DAV:">
      <d:prop>
        <d:getetag/>
      </d:prop>
    </addressbook-query>`;

    let response = await this._makeRequest("", {
      method: "REPORT",
      body: data,
      headers: {
        Depth: 1,
      },
    });

    let hrefMap = new Map();
    for (let r of response.dom.querySelectorAll("response")) {
      let etag = r.querySelector("getetag").textContent;
      let href = r.querySelector("href").textContent;

      hrefMap.set(href, etag);
    }

    let cardMap = new Map();
    let hrefsToFetch = [];
    let cardsToAdd = [];
    let cardsToModify = [];
    let cardsToDelete = [];
    for (let card of this.childCards) {
      let href = card.getProperty("_href");
      let etag = card.getProperty("_etag");

      if (!href || !etag) {
        // Not sure how we got here. Ignore it.
        continue;
      }
      cardMap.set(href, card);
      if (hrefMap.has(href)) {
        if (hrefMap.get(href) != etag) {
          // The card was updated on server.
          hrefsToFetch.push(href);
          cardsToModify.push(href);
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
        cardsToAdd.push(href);
      }
    }

    if (cardsToDelete.length > 0) {
      this._syncInProgress = true;
      this.deleteCards(cardsToDelete);
      this._syncInProgress = false;
    }

    if (hrefsToFetch.length == 0) {
      return;
    }

    hrefsToFetch = hrefsToFetch.map(
      href => `<d:href>${xmlEncode(href)}</d:href>`
    );
    data = `<addressbook-multiget xmlns="urn:ietf:params:xml:ns:carddav" xmlns:d="DAV:">
      <d:prop>
        <d:getetag/>
        <address-data/>
      </d:prop>
      ${hrefsToFetch.join("\n")}
    </addressbook-multiget>`;

    response = await this._makeRequest("", {
      method: "REPORT",
      body: data,
      headers: {
        Depth: 1,
      },
    });

    this._syncInProgress = true;
    for (let r of response.dom.querySelectorAll("response")) {
      let etag = r.querySelector("getetag").textContent;
      let href = r.querySelector("href").textContent;
      let vCard = normalizeLineEndings(
        r.querySelector("address-data").textContent
      );

      let abCard = VCardUtils.vCardToAbCard(vCard);
      abCard.setProperty("_etag", etag);
      abCard.setProperty("_href", href);
      abCard.setProperty("_vCard", vCard);

      if (cardsToAdd.includes(href)) {
        this.addCard(abCard);
      } else {
        this.modifyCard(abCard);
      }
    }
    this._syncInProgress = false;
  }

  /**
   * Retrieves the current sync token from the server.
   *
   * @see RFC 6578
   */
  async getSyncToken() {
    let data = `<propfind xmlns="DAV:">
      <prop>
         <displayname/>
         <sync-token/>
      </prop>
    </propfind>`;

    let response = await this._makeRequest("", {
      method: "PROPFIND",
      body: data,
    });
    this._syncToken = response.dom.querySelector("sync-token").textContent;
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

    let data = `<sync-collection xmlns="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
      <sync-token>${xmlEncode(syncToken)}</sync-token>
      <sync-level>1</sync-level>
      <prop>
        <getetag/>
        <card:address-data/>
      </prop>
    </sync-collection>`;

    let response = await this._makeRequest("", {
      method: "REPORT",
      body: data,
    });
    let dom = response.dom;
    this._syncToken = dom.querySelector("sync-token").textContent;

    let cardsToDelete = [];
    for (let response of dom.querySelectorAll("response")) {
      let href = response.querySelector("href").textContent;
      let status = response.querySelector("response > status");

      let card = this.getCardFromProperty("_href", href, true);
      if (status && status.textContent == "HTTP/1.1 404 Not Found") {
        if (card) {
          cardsToDelete.push(card);
        }
        continue;
      }

      let etag = response.querySelector("getetag").textContent;
      let vCard = normalizeLineEndings(
        response.querySelector("address-data").textContent
      );

      let abCard = VCardUtils.vCardToAbCard(vCard);
      abCard.setProperty("_etag", etag);
      abCard.setProperty("_href", href);
      abCard.setProperty("_vCard", vCard);

      this._syncInProgress = true;
      if (card) {
        if (card.getProperty("_etag") != etag) {
          this.modifyCard(abCard);
        }
      } else {
        this.addCard(abCard);
      }
      this._syncInProgress = false;
    }

    if (cardsToDelete.length > 0) {
      this._syncInProgress = true;
      this.deleteCards(cardsToDelete);
      this._syncInProgress = false;
    }
  }

  static forFile(fileName) {
    let directory = super.forFile(fileName);
    if (directory instanceof CardDAVDirectory) {
      return directory;
    }
    return undefined;
  }

  /**
   * Make an HTTP request. If the request needs a username and password, the
   * given authPrompt is called.
   *
   * @param {String} uri
   * @param {Object} details
   * @param {String} details.method
   * @param {String} details.header
   * @param {nsIAuthPrompt2} details.authPrompt
   * @param {String} details.body
   * @param {String} details.contentType
   * @return {Promise<Object>} - Resolves to an object with three getters:
   *    - etag, the ETag header if any
   *    - text, the returned data as a String
   *    - dom, the returned data parsed into a Document
   */
  static async makeRequest(
    uri,
    { method = "GET", headers = {}, body = null, contentType = "text/xml" }
  ) {
    uri = Services.io.newURI(uri);

    return new Promise((resolve, reject) => {
      let principal = Services.scriptSecurityManager.createContentPrincipal(
        uri,
        {}
      );
      let channel = Services.io.newChannelFromURI(
        uri,
        null,
        principal,
        null,
        Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_DATA_IS_NULL,
        Ci.nsIContentPolicy.TYPE_OTHER
      );
      channel.QueryInterface(Ci.nsIHttpChannel);
      for (let [name, value] of Object.entries(headers)) {
        channel.setRequestHeader(name, value, false);
      }
      channel.notificationCallbacks = {
        getInterface(iid) {
          if (iid.equals(Ci.nsIAuthPrompt2)) {
            return {
              promptAuth(channel, level, authInfo) {
                let logins = Services.logins.findLogins(
                  channel.URI.prePath,
                  null,
                  ""
                );
                for (let l of logins) {
                  authInfo.username = l.username;
                  authInfo.password = l.password;
                  return true;
                }

                let savePasswordLabel = null;
                if (
                  Services.prefs.getBoolPref("signon.rememberSignons", true)
                ) {
                  savePasswordLabel = Services.strings
                    .createBundle(
                      "chrome://passwordmgr/locale/passwordmgr.properties"
                    )
                    .GetStringFromName("rememberPassword");
                }
                let savePassword = {};
                let returnValue = Services.prompt.promptAuth(
                  null,
                  channel,
                  level,
                  authInfo,
                  savePasswordLabel,
                  savePassword
                );
                if (savePassword.value) {
                  let newLoginInfo = Cc[
                    "@mozilla.org/login-manager/loginInfo;1"
                  ].createInstance(Ci.nsILoginInfo);
                  newLoginInfo.init(
                    channel.URI.prePath,
                    null,
                    authInfo.realm,
                    authInfo.username,
                    authInfo.password,
                    "",
                    ""
                  );
                  Services.logins.addLogin(newLoginInfo);
                }
                return returnValue;
              },
            };
          } else if (iid.equals(Ci.nsIChannelEventSink)) {
            return {
              asyncOnChannelRedirect(oldChannel, newChannel, flags, callback) {
                /**
                 * Copy the given header from the old channel to the new one, ignoring missing headers
                 *
                 * @param {String} aHdr         The header to copy
                 */
                function copyHeader(aHdr) {
                  try {
                    let hdrValue = oldChannel.getRequestHeader(aHdr);
                    if (hdrValue) {
                      newChannel.setRequestHeader(aHdr, hdrValue, false);
                    }
                  } catch (e) {
                    if (e.result != Cr.NS_ERROR_NOT_AVAILABLE) {
                      // The header could possibly not be availible, ignore that
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
                copyHeader("Depth");
                copyHeader("Originator");
                copyHeader("Recipient");
                copyHeader("If-None-Match");
                copyHeader("If-Match");

                newChannel.requestMethod = oldChannel.requestMethod;
                callback.onRedirectVerifyCallback(Cr.NS_OK);
              },
            };
          }
          return null;
        },
      };
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

      let listener = Cc["@mozilla.org/network/stream-loader;1"].createInstance(
        Ci.nsIStreamLoader
      );
      listener.init({
        onStreamComplete(loader, context, status, resultLength, result) {
          if (!Components.isSuccessCode(status)) {
            // TODO: Improve this exception.
            reject(new Components.Exception("Connection failure", status));
            return;
          }
          if (
            !channel.requestSucceeded &&
            Math.floor(channel.responseStatus / 100) != 3
          ) {
            // TODO: Improve this exception.
            reject(
              new Components.Exception(
                channel.responseStatusText,
                Cr.NS_ERROR_FAILURE
              )
            );
            return;
          }
          resolve({
            get etag() {
              try {
                return channel.getResponseHeader("etag");
              } catch (ex) {
                return null;
              }
            },
            get text() {
              return new TextDecoder().decode(Uint8Array.from(result));
            },
            get dom() {
              return new DOMParser().parseFromString(this.text, "text/xml");
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
