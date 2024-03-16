/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";

import { CalDavLegacySAXRequest } from "resource:///modules/caldav/CalDavRequest.sys.mjs";

/* exported CalDavEtagsHandler, CalDavWebDavSyncHandler, CalDavMultigetSyncHandler */

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8"?>\n';
const MIME_TEXT_XML = "text/xml; charset=utf-8";

/**
 * Accumulate all XML response, then parse with DOMParser. This class imitates
 * nsISAXXMLReader by calling startDocument/endDocument and startElement/endElement.
 */
class XMLResponseHandler {
  constructor() {
    this._inStream = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
      Ci.nsIScriptableInputStream
    );
    this._xmlString = "";
  }

  /**
   * @see nsIStreamListener
   */
  onDataAvailable(request, inputStream, offset, count) {
    this._inStream.init(inputStream);
    // What we get from inputStream is BinaryString, decode it to UTF-8.
    this._xmlString += new TextDecoder("UTF-8").decode(
      this._binaryStringToTypedArray(this._inStream.read(count))
    );
  }

  /**
   * Log the response code and body.
   *
   * @param {number} responseStatus
   */
  logResponse(responseStatus) {
    if (this.calendar.verboseLogging()) {
      cal.LOG(`CalDAV: recv (${responseStatus}): ${this._xmlString}`);
    }
  }

  /**
   * Parse this._xmlString with DOMParser, then create a TreeWalker and start
   * walking the node tree.
   */
  async handleResponse() {
    const parser = new DOMParser();
    let doc;
    try {
      doc = parser.parseFromString(this._xmlString, "application/xml");
    } catch (e) {
      cal.ERROR("CALDAV: DOMParser parse error: ", e);
      this.fatalError();
    }

    const treeWalker = doc.createTreeWalker(doc.documentElement, NodeFilter.SHOW_ELEMENT);
    this.startDocument();
    await this._walk(treeWalker);
    await this.endDocument();
  }

  /**
   * Reset this._xmlString.
   */
  resetXMLResponseHandler() {
    this._xmlString = "";
  }

  /**
   * Converts a binary string into a Uint8Array.
   *
   * @param {BinaryString} str - The string to convert.
   * @returns {Uint8Array}.
   */
  _binaryStringToTypedArray(str) {
    const arr = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      arr[i] = str.charCodeAt(i);
    }
    return arr;
  }

  /**
   * Walk the tree node by node, call startElement and endElement when appropriate.
   */
  async _walk(treeWalker) {
    const currentNode = treeWalker.currentNode;
    if (currentNode) {
      this.startElement("", currentNode.localName, currentNode.nodeName, "");

      // Traverse children first.
      const firstChild = treeWalker.firstChild();
      if (firstChild) {
        await this._walk(treeWalker);
        // TreeWalker has reached a leaf node, reset the cursor to continue the traversal.
        treeWalker.currentNode = firstChild;
      } else {
        this.characters(currentNode.textContent);
        await this.endElement("", currentNode.localName, currentNode.nodeName);
        return;
      }

      // Traverse siblings next.
      let nextSibling = treeWalker.nextSibling();
      while (nextSibling) {
        await this._walk(treeWalker);
        // TreeWalker has reached a leaf node, reset the cursor to continue the traversal.
        treeWalker.currentNode = nextSibling;
        nextSibling = treeWalker.nextSibling();
      }

      await this.endElement("", currentNode.localName, currentNode.nodeName);
    }
  }
}

/**
 * This is a handler for the etag request in calDavCalendar.js' getUpdatedItem.
 * It uses XMLResponseHandler to parse the items and compose the resulting
 * multiget.
 */
export class CalDavEtagsHandler extends XMLResponseHandler {
  /**
   * @param {calDavCalendar} aCalendar - The (unwrapped) calendar this request belongs to.
   * @param {nsIURI} aBaseUri - The URI requested (i.e inbox or collection).
   * @param {*=} aChangeLogListener - (optional) for cached calendars, the listener to notify.
   */
  constructor(aCalendar, aBaseUri, aChangeLogListener) {
    super();
    this.calendar = aCalendar;
    this.baseUri = aBaseUri;
    this.changeLogListener = aChangeLogListener;

    this.itemsReported = {};
    this.itemsNeedFetching = [];
  }

  skipIndex = -1;
  currentResponse = null;
  tag = null;
  calendar = null;
  baseUri = null;
  changeLogListener = null;
  logXML = "";

  itemsReported = null;
  itemsNeedFetching = null;

  QueryInterface = ChromeUtils.generateQI(["nsIRequestObserver", "nsIStreamListener"]);

  /**
   * @see nsIRequestObserver
   */
  onStartRequest(request) {
    const httpchannel = request.QueryInterface(Ci.nsIHttpChannel);

    let responseStatus;
    try {
      responseStatus = httpchannel.responseStatus;
    } catch (ex) {
      cal.WARN("CalDAV: No response status getting etags for calendar " + this.calendar.name);
    }

    if (responseStatus == 207) {
      // We only need to parse 207's, anything else is probably a
      // server error (i.e 50x).
      httpchannel.contentType = "application/xml";
    } else {
      cal.LOG("CalDAV: Error fetching item etags");
      this.calendar.reportDavError(Ci.calIErrors.DAV_REPORT_ERROR);
      if (this.calendar.isCached && this.changeLogListener) {
        this.changeLogListener.onResult({ status: Cr.NS_ERROR_FAILURE }, Cr.NS_ERROR_FAILURE);
      }
    }
  }

  async onStopRequest(request, statusCode) {
    const httpchannel = request.QueryInterface(Ci.nsIHttpChannel);

    let responseStatus;
    try {
      responseStatus = httpchannel.responseStatus;
    } catch (ex) {
      cal.WARN("CalDAV: No response status getting etags for calendar " + this.calendar.name);
    }

    this.logResponse(responseStatus);

    if (responseStatus != 207) {
      // Not a successful response, do nothing.
      if (this.calendar.isCached && this.changeLogListener) {
        this.changeLogListener.onResult({ status: Cr.NS_ERROR_FAILURE }, Cr.NS_ERROR_FAILURE);
      }
      return;
    }

    await this.handleResponse();

    // Now that we are done, check which items need fetching.
    this.calendar.superCalendar.startBatch();

    let needsRefresh = false;
    try {
      for (const path in this.calendar.mHrefIndex) {
        if (path in this.itemsReported || path.substr(0, this.baseUri.length) == this.baseUri) {
          // If the item is also on the server, check the next.
          continue;
        }
        // If an item has been deleted from the server, delete it here too.
        // Since the target calendar's operations are synchronous, we can
        // safely set variables from this function.
        const foundItem = await this.calendar.mOfflineStorage.getItem(
          this.calendar.mHrefIndex[path]
        );

        if (foundItem) {
          const wasInboxItem = this.calendar.mItemInfoCache[foundItem.id].isInboxItem;
          if (
            (wasInboxItem && this.calendar.isInbox(this.baseUri.spec)) ||
            (wasInboxItem === false && !this.calendar.isInbox(this.baseUri.spec))
          ) {
            cal.LOG("Deleting local href: " + path);
            delete this.calendar.mHrefIndex[path];
            await this.calendar.mOfflineStorage.deleteItem(foundItem);
            needsRefresh = true;
          }
        }
      }
    } finally {
      this.calendar.superCalendar.endBatch();
    }

    // Avoid sending empty multiget requests update views if something has
    // been deleted server-side.
    if (this.itemsNeedFetching.length) {
      const multiget = new CalDavMultigetSyncHandler(
        this.itemsNeedFetching,
        this.calendar,
        this.baseUri,
        null,
        false,
        null,
        this.changeLogListener
      );
      multiget.doMultiGet();
    } else {
      if (this.calendar.isCached && this.changeLogListener) {
        this.changeLogListener.onResult({ status: Cr.NS_OK }, Cr.NS_OK);
      }

      if (needsRefresh) {
        this.calendar.mObservers.notify("onLoad", [this.calendar]);
      }

      // but do poll the inbox
      if (this.calendar.mShouldPollInbox && !this.calendar.isInbox(this.baseUri.spec)) {
        this.calendar.pollInbox();
      }
    }
  }

  /**
   * @see XMLResponseHandler
   */
  fatalError() {
    cal.WARN("CalDAV: Fatal Error parsing etags for " + this.calendar.name);
  }

  /**
   * @see XMLResponseHandler
   */
  characters(aValue) {
    if (this.calendar.verboseLogging()) {
      this.logXML += aValue;
    }
    if (this.tag) {
      this.currentResponse[this.tag] += aValue;
    }
  }

  startDocument() {
    this.hrefMap = {};
    this.currentResponse = {};
    this.tag = null;
  }

  endDocument() {}

  startElement(aUri, aLocalName, aQName, aAttributes) {
    switch (aLocalName) {
      case "response":
        this.currentResponse = {};
        this.currentResponse.isCollection = false;
        this.tag = null;
        break;
      case "collection":
        this.currentResponse.isCollection = true;
      // falls through
      case "href":
      case "getetag":
      case "getcontenttype":
        this.tag = aLocalName;
        this.currentResponse[aLocalName] = "";
        break;
    }
    if (this.calendar.verboseLogging()) {
      this.logXML += "<" + aQName + ">";
    }
  }

  endElement(aUri, aLocalName, aQName) {
    switch (aLocalName) {
      case "response": {
        this.tag = null;
        const resp = this.currentResponse;
        if (
          resp.getetag &&
          resp.getetag.length &&
          resp.href &&
          resp.href.length &&
          resp.getcontenttype &&
          resp.getcontenttype.length &&
          !resp.isCollection
        ) {
          resp.href = this.calendar.ensureDecodedPath(resp.href);

          if (resp.getcontenttype.substr(0, 14) == "message/rfc822") {
            // workaround for a Scalix bug which causes incorrect
            // contenttype to be returned.
            resp.getcontenttype = "text/calendar";
          }
          if (resp.getcontenttype == "text/vtodo") {
            // workaround Kerio weirdness
            resp.getcontenttype = "text/calendar";
          }

          // Only handle calendar items
          if (resp.getcontenttype.substr(0, 13) == "text/calendar") {
            if (resp.href && resp.href.length) {
              this.itemsReported[resp.href] = resp.getetag;

              const itemUid = this.calendar.mHrefIndex[resp.href];
              if (!itemUid || resp.getetag != this.calendar.mItemInfoCache[itemUid].etag) {
                this.itemsNeedFetching.push(resp.href);
              }
            }
          }
        }
        break;
      }
      case "href":
      case "getetag":
      case "getcontenttype": {
        this.tag = null;
        break;
      }
    }
    if (this.calendar.verboseLogging()) {
      this.logXML += "</" + aQName + ">";
    }
  }

  processingInstruction(aTarget, aData) {}
}

/**
 * This is a handler for the webdav sync request in calDavCalendar.js'
 * getUpdatedItem. It uses XMLResponseHandler to parse the items and compose the
 * resulting multiget.
 */
export class CalDavWebDavSyncHandler extends XMLResponseHandler {
  /**
   * @param {calDavCalendar} aCalendar - The (unwrapped) calendar this request belongs to.
   * @param {nsIURI} aBaseUri - The URI requested (i.e inbox or collection).
   * @param {*=} aChangeLogListener - (optional) for cached calendars, the listener to notify.
   */
  constructor(aCalendar, aBaseUri, aChangeLogListener) {
    super();
    this.calendar = aCalendar;
    this.baseUri = aBaseUri;
    this.changeLogListener = aChangeLogListener;

    this.itemsReported = {};
    this.itemsNeedFetching = [];
  }

  currentResponse = null;
  tag = null;
  calendar = null;
  baseUri = null;
  newSyncToken = null;
  changeLogListener = null;
  logXML = "";
  isInPropStat = false;
  changeCount = 0;
  unhandledErrors = 0;
  itemsReported = null;
  itemsNeedFetching = null;
  additionalSyncNeeded = false;

  QueryInterface = ChromeUtils.generateQI(["nsIRequestObserver", "nsIStreamListener"]);

  async doWebDAVSync() {
    if (this.calendar.mDisabledByDavError) {
      // check if maybe our calendar has become available
      this.calendar.checkDavResourceType(this.changeLogListener);
      return;
    }

    let syncTokenString = "<sync-token/>";
    if (this.calendar.mWebdavSyncToken && this.calendar.mWebdavSyncToken.length > 0) {
      const syncToken = cal.xml.escapeString(this.calendar.mWebdavSyncToken);
      syncTokenString = "<sync-token>" + syncToken + "</sync-token>";
    }

    const queryXml =
      XML_HEADER +
      '<sync-collection xmlns="DAV:">' +
      syncTokenString +
      "<sync-level>1</sync-level>" +
      "<prop>" +
      "<getcontenttype/>" +
      "<getetag/>" +
      "</prop>" +
      "</sync-collection>";

    const requestUri = this.calendar.makeUri(null, this.baseUri);

    if (this.calendar.verboseLogging()) {
      cal.LOG(`CalDAV: send (REPORT ${requestUri.spec}): ${queryXml}`);
    }
    cal.LOG("CalDAV: webdav-sync Token: " + this.calendar.mWebdavSyncToken);

    const onSetupChannel = channel => {
      // The depth header adheres to an older version of the webdav-sync
      // spec and has been replaced by the <sync-level> tag above.
      // Unfortunately some servers still depend on the depth header,
      // therefore we send both (yuck).
      channel.setRequestHeader("Depth", "1", false);
      channel.requestMethod = "REPORT";
    };
    const request = new CalDavLegacySAXRequest(
      this.calendar.session,
      this.calendar,
      requestUri,
      queryXml,
      MIME_TEXT_XML,
      this,
      onSetupChannel
    );

    await request.commit().catch(() => {
      // Something went wrong with the OAuth token, notify failure
      if (this.calendar.isCached && this.changeLogListener) {
        this.changeLogListener.onResult(
          { status: Cr.NS_ERROR_NOT_AVAILABLE },
          Cr.NS_ERROR_NOT_AVAILABLE
        );
      }
    });
  }

  /**
   * @see nsIRequestObserver
   */
  onStartRequest(request) {
    const httpchannel = request.QueryInterface(Ci.nsIHttpChannel);

    let responseStatus;
    try {
      responseStatus = httpchannel.responseStatus;
    } catch (ex) {
      cal.WARN("CalDAV: No response status doing webdav sync for calendar " + this.calendar.name);
    }

    if (responseStatus == 207) {
      // We only need to parse 207's, anything else is probably a
      // server error (i.e 50x).
      httpchannel.contentType = "application/xml";
    }
  }

  async onStopRequest(request, statusCode) {
    const httpchannel = request.QueryInterface(Ci.nsIHttpChannel);

    let responseStatus;
    try {
      responseStatus = httpchannel.responseStatus;
    } catch (ex) {
      cal.WARN("CalDAV: No response status doing webdav sync for calendar " + this.calendar.name);
    }

    this.logResponse(responseStatus);

    if (responseStatus == 207) {
      await this.handleResponse();
    } else if (
      (responseStatus == 403 && this._xmlString.includes(`<D:error xmlns:D="DAV:"/>`)) ||
      responseStatus == 429
    ) {
      // We're hitting the rate limit. Don't attempt to refresh now.
      cal.WARN("CalDAV: rate limit reached, server returned status code: " + responseStatus);
      if (this.calendar.isCached && this.changeLogListener) {
        // Not really okay, but we have to return something and an error code puts us in a bad state.
        this.changeLogListener.onResult({ status: Cr.NS_ERROR_FAILURE }, Cr.NS_ERROR_FAILURE);
      }
    } else if (
      this.calendar.mWebdavSyncToken != null &&
      responseStatus >= 400 &&
      responseStatus <= 499
    ) {
      // Invalidate sync token with 4xx errors that could indicate the
      // sync token has become invalid and do a refresh.
      cal.LOG(
        "CalDAV: Resetting sync token because server returned status code: " + responseStatus
      );
      this.calendar.mWebdavSyncToken = null;
      this.calendar.saveCalendarProperties();
      this.calendar.safeRefresh(this.changeLogListener);
    } else {
      cal.WARN("CalDAV: Error doing webdav sync: " + responseStatus);
      this.calendar.reportDavError(Ci.calIErrors.DAV_REPORT_ERROR);
      if (this.calendar.isCached && this.changeLogListener) {
        this.changeLogListener.onResult({ status: Cr.NS_ERROR_FAILURE }, Cr.NS_ERROR_FAILURE);
      }
    }
  }

  /**
   * @see XMLResponseHandler
   */
  fatalError() {
    cal.WARN("CalDAV: Fatal Error doing webdav sync for " + this.calendar.name);
  }

  /**
   * @see XMLResponseHandler
   */
  characters(aValue) {
    if (this.calendar.verboseLogging()) {
      this.logXML += aValue;
    }
    this.currentResponse[this.tag] += aValue;
  }

  startDocument() {
    this.hrefMap = {};
    this.currentResponse = {};
    this.tag = null;
    this.calendar.superCalendar.startBatch();
  }

  async endDocument() {
    if (this.unhandledErrors) {
      this.calendar.superCalendar.endBatch();
      this.calendar.reportDavError(Ci.calIErrors.DAV_REPORT_ERROR);
      if (this.calendar.isCached && this.changeLogListener) {
        this.changeLogListener.onResult({ status: Cr.NS_ERROR_FAILURE }, Cr.NS_ERROR_FAILURE);
      }
      return;
    }

    if (this.calendar.mWebdavSyncToken == null && !this.additionalSyncNeeded) {
      // null token means reset or first refresh indicating we did
      // a full sync; remove local items that were not returned in this full
      // sync
      for (const path in this.calendar.mHrefIndex) {
        if (!this.itemsReported[path]) {
          await this.calendar.deleteTargetCalendarItem(path);
        }
      }
    }
    this.calendar.superCalendar.endBatch();

    if (this.itemsNeedFetching.length) {
      const multiget = new CalDavMultigetSyncHandler(
        this.itemsNeedFetching,
        this.calendar,
        this.baseUri,
        this.newSyncToken,
        this.additionalSyncNeeded,
        null,
        this.changeLogListener
      );
      multiget.doMultiGet();
    } else {
      if (this.newSyncToken) {
        this.calendar.mWebdavSyncToken = this.newSyncToken;
        this.calendar.saveCalendarProperties();
        cal.LOG("CalDAV: New webdav-sync Token: " + this.calendar.mWebdavSyncToken);

        if (this.additionalSyncNeeded) {
          const wds = new CalDavWebDavSyncHandler(
            this.calendar,
            this.baseUri,
            this.changeLogListener
          );
          wds.doWebDAVSync();
          return;
        }
      }
      this.calendar.finalizeUpdatedItems(this.changeLogListener, this.baseUri);
    }
  }

  startElement(aUri, aLocalName, aQName, aAttributes) {
    switch (aLocalName) {
      case "response": // WebDAV Sync draft 3
        this.currentResponse = {};
        this.tag = null;
        this.isInPropStat = false;
        break;
      case "propstat":
        this.isInPropStat = true;
        break;
      case "status":
        if (this.isInPropStat) {
          this.tag = "propstat_" + aLocalName;
        } else {
          this.tag = aLocalName;
        }
        this.currentResponse[this.tag] = "";
        break;
      case "href":
      case "getetag":
      case "getcontenttype":
      case "sync-token":
        this.tag = aLocalName.replace(/-/g, "");
        this.currentResponse[this.tag] = "";
        break;
    }
    if (this.calendar.verboseLogging()) {
      this.logXML += "<" + aQName + ">";
    }
  }

  async endElement(aUri, aLocalName, aQName) {
    switch (aLocalName) {
      case "response": // WebDAV Sync draft 3
      case "sync-response": {
        // WebDAV Sync draft 0,1,2
        const resp = this.currentResponse;
        if (resp.href && resp.href.length) {
          resp.href = this.calendar.ensureDecodedPath(resp.href);
        }

        if (
          (!resp.getcontenttype || resp.getcontenttype == "text/plain") &&
          resp.href &&
          resp.href.endsWith(".ics")
        ) {
          // If there is no content-type (iCloud) or text/plain was passed
          // (iCal Server) for the resource but its name ends with ".ics"
          // assume the content type to be text/calendar. Apple
          // iCloud/iCal Server interoperability fix.
          resp.getcontenttype = "text/calendar";
        }

        // Deleted item
        if (
          resp.href &&
          resp.href.length &&
          resp.status &&
          resp.status.length &&
          resp.status.indexOf(" 404") > 0
        ) {
          if (this.calendar.mHrefIndex[resp.href]) {
            this.changeCount++;
            await this.calendar.deleteTargetCalendarItem(resp.href);
          } else {
            cal.LOG("CalDAV: skipping unfound deleted item : " + resp.href);
          }
          // Only handle Created or Updated calendar items
        } else if (
          resp.getcontenttype &&
          resp.getcontenttype.substr(0, 13) == "text/calendar" &&
          resp.getetag &&
          resp.getetag.length &&
          resp.href &&
          resp.href.length &&
          (!resp.status || // Draft 3 does not require
            resp.status.length == 0 || // a status for created or updated items but
            resp.status.indexOf(" 204") || // draft 0, 1 and 2 needed it so treat no status
            resp.status.indexOf(" 200") || // Apple iCloud returns 200 status for each item
            resp.status.indexOf(" 201"))
        ) {
          // and status 201 and 204 the same
          this.itemsReported[resp.href] = resp.getetag;
          const itemId = this.calendar.mHrefIndex[resp.href];
          const oldEtag = itemId && this.calendar.mItemInfoCache[itemId].etag;

          if (!oldEtag || oldEtag != resp.getetag) {
            // Etag mismatch, getting new/updated item.
            this.itemsNeedFetching.push(resp.href);
          }
        } else if (resp.status && resp.status.includes(" 507")) {
          // webdav-sync says that if a 507 is encountered and the
          // url matches the request, the current token should be
          // saved and another request should be made. We don't
          // actually compare the URL, its too easy to get this
          // wrong.

          // The 507 doesn't mean the data received is invalid, so
          // continue processing.
          this.additionalSyncNeeded = true;
        } else if (
          resp.status &&
          resp.status.indexOf(" 200") &&
          resp.href &&
          resp.href.endsWith("/")
        ) {
          // iCloud returns status responses for directories too
          // so we just ignore them if they have status code 200. We
          // want to make sure these are not counted as unhandled
          // errors in the next block
        } else if (
          (resp.getcontenttype && resp.getcontenttype.startsWith("text/calendar")) ||
          (resp.status && !resp.status.includes(" 404"))
        ) {
          // If the response element is still not handled, log an
          // error only if the content-type is text/calendar or the
          // response status is different than 404 not found.  We
          // don't care about response elements on non-calendar
          // resources or whose status is not indicating a deleted
          // resource.
          cal.WARN("CalDAV: Unexpected response, status: " + resp.status + ", href: " + resp.href);
          this.unhandledErrors++;
        } else {
          cal.LOG(
            "CalDAV: Unhandled response element, status: " +
              resp.status +
              ", href: " +
              resp.href +
              " contenttype:" +
              resp.getcontenttype
          );
        }
        break;
      }
      case "sync-token": {
        this.newSyncToken = this.currentResponse[this.tag];
        break;
      }
      case "propstat": {
        this.isInPropStat = false;
        break;
      }
    }
    this.tag = null;
    if (this.calendar.verboseLogging()) {
      this.logXML += "</" + aQName + ">";
    }
  }

  processingInstruction(aTarget, aData) {}
}

/**
 * This is a handler for the multiget request. It uses XMLResponseHandler to
 * parse the items and compose the resulting multiget.
 */
export class CalDavMultigetSyncHandler extends XMLResponseHandler {
  /**
   * @param {string[]} aItemsNeedFetching - Array of items to fetch, an array of
   *                                        un-encoded paths.
   * @param {calDavCalendar} aCalendar - The (unwrapped) calendar this request belongs to.
   * @param {nsIURI} aBaseUri - The URI requested (i.e inbox or collection).
   * @param {*=} aNewSyncToken - (optional) New Sync token to set if operation successful.
   * @param {boolean=} aAdditionalSyncNeeded - (optional) If true, the passed sync token is not the
   *                                           latest, another webdav sync run should be
   *                                           done after completion.
   * @param {*=} aListener - (optional) The listener to notify.
   * @param {*=} aChangeLogListener - (optional) For cached calendars, the listener to
   *                                  notify.
   */
  constructor(
    aItemsNeedFetching,
    aCalendar,
    aBaseUri,
    aNewSyncToken,
    aAdditionalSyncNeeded,
    aListener,
    aChangeLogListener
  ) {
    super();
    this.calendar = aCalendar;
    this.baseUri = aBaseUri;
    this.listener = aListener;
    this.newSyncToken = aNewSyncToken;
    this.changeLogListener = aChangeLogListener;
    this.itemsNeedFetching = aItemsNeedFetching;
    this.additionalSyncNeeded = aAdditionalSyncNeeded;
  }

  currentResponse = null;
  tag = null;
  calendar = null;
  baseUri = null;
  newSyncToken = null;
  listener = null;
  changeLogListener = null;
  logXML = null;
  unhandledErrors = 0;
  itemsNeedFetching = null;
  additionalSyncNeeded = false;
  timer = null;

  QueryInterface = ChromeUtils.generateQI(["nsIRequestObserver", "nsIStreamListener"]);

  doMultiGet() {
    if (this.calendar.mDisabledByDavError) {
      // check if maybe our calendar has become available
      this.calendar.checkDavResourceType(this.changeLogListener);
      return;
    }

    let batchSize = Services.prefs.getIntPref("calendar.caldav.multigetBatchSize", 100);
    let hrefString = "";
    while (this.itemsNeedFetching.length && batchSize > 0) {
      batchSize--;
      // ensureEncodedPath extracts only the path component of the item and
      // encodes it before it is sent to the server
      const locpath = this.calendar.ensureEncodedPath(this.itemsNeedFetching.pop());
      hrefString += "<D:href>" + cal.xml.escapeString(locpath) + "</D:href>";
    }

    const queryXml =
      XML_HEADER +
      '<C:calendar-multiget xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">' +
      "<D:prop>" +
      "<D:getetag/>" +
      "<C:calendar-data/>" +
      "</D:prop>" +
      hrefString +
      "</C:calendar-multiget>";

    const requestUri = this.calendar.makeUri(null, this.baseUri);
    if (this.calendar.verboseLogging()) {
      cal.LOG(`CalDAV: send (REPORT ${requestUri.spec}): ${queryXml}`);
    }

    const onSetupChannel = channel => {
      channel.requestMethod = "REPORT";
      channel.setRequestHeader("Depth", "1", false);
    };
    const request = new CalDavLegacySAXRequest(
      this.calendar.session,
      this.calendar,
      requestUri,
      queryXml,
      MIME_TEXT_XML,
      this,
      onSetupChannel
    );

    request.commit().catch(() => {
      // Something went wrong with the OAuth token, notify failure
      if (this.calendar.isCached && this.changeLogListener) {
        this.changeLogListener.onResult(
          { status: Cr.NS_ERROR_NOT_AVAILABLE },
          Cr.NS_ERROR_NOT_AVAILABLE
        );
      }
    });
  }

  /**
   * @see nsIRequestObserver
   */
  onStartRequest(request) {
    const httpchannel = request.QueryInterface(Ci.nsIHttpChannel);

    let responseStatus;
    try {
      responseStatus = httpchannel.responseStatus;
    } catch (ex) {
      cal.WARN("CalDAV: No response status doing multiget for calendar " + this.calendar.name);
    }

    if (responseStatus == 207) {
      // We only need to parse 207's, anything else is probably a
      // server error (i.e 50x).
      httpchannel.contentType = "application/xml";
    } else {
      const errorMsg =
        "CalDAV: Error: got status " +
        responseStatus +
        " fetching calendar data for " +
        this.calendar.name +
        ", " +
        this.listener;
      this.calendar.notifyGetFailed(errorMsg, this.listener, this.changeLogListener);
    }
  }

  async onStopRequest(request, statusCode) {
    const httpchannel = request.QueryInterface(Ci.nsIHttpChannel);

    let responseStatus;
    try {
      responseStatus = httpchannel.responseStatus;
    } catch (ex) {
      cal.WARN("CalDAV: No response status doing multiget for calendar " + this.calendar.name);
    }

    this.logResponse(responseStatus);

    if (responseStatus != 207) {
      // Not a successful response, do nothing.
      if (this.calendar.isCached && this.changeLogListener) {
        this.changeLogListener.onResult({ status: Cr.NS_ERROR_FAILURE }, Cr.NS_ERROR_FAILURE);
      }
      return;
    }

    if (this.unhandledErrors) {
      this.calendar.superCalendar.endBatch();
      this.calendar.notifyGetFailed("multiget error", this.listener, this.changeLogListener);
      return;
    }
    if (this.itemsNeedFetching.length == 0) {
      if (this.newSyncToken) {
        this.calendar.mWebdavSyncToken = this.newSyncToken;
        this.calendar.saveCalendarProperties();
        cal.LOG("CalDAV: New webdav-sync Token: " + this.calendar.mWebdavSyncToken);
      }
    }
    await this.handleResponse();
    if (this.itemsNeedFetching.length > 0) {
      cal.LOG("CalDAV: Still need to fetch " + this.itemsNeedFetching.length + " elements.");
      this.resetXMLResponseHandler();
      const timerCallback = {
        requestHandler: this,
        notify(timer) {
          // Call multiget again to get another batch
          this.requestHandler.doMultiGet();
        },
      };
      this.timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
      this.timer.initWithCallback(timerCallback, 0, Ci.nsITimer.TYPE_ONE_SHOT);
    } else if (this.additionalSyncNeeded) {
      const wds = new CalDavWebDavSyncHandler(this.calendar, this.baseUri, this.changeLogListener);
      wds.doWebDAVSync();
    } else {
      this.calendar.finalizeUpdatedItems(this.changeLogListener, this.baseUri);
    }
  }

  /**
   * @see XMLResponseHandler
   */
  fatalError(error) {
    cal.WARN("CalDAV: Fatal Error doing multiget for " + this.calendar.name + ": " + error);
  }

  /**
   * @see XMLResponseHandler
   */
  characters(aValue) {
    if (this.calendar.verboseLogging()) {
      this.logXML += aValue;
    }
    if (this.tag) {
      this.currentResponse[this.tag] += aValue;
    }
  }

  startDocument() {
    this.hrefMap = {};
    this.currentResponse = {};
    this.tag = null;
    this.logXML = "";
    this.calendar.superCalendar.startBatch();
  }

  endDocument() {
    this.calendar.superCalendar.endBatch();
  }

  startElement(aUri, aLocalName, aQName, aAttributes) {
    switch (aLocalName) {
      case "response":
        this.currentResponse = {};
        this.tag = null;
        this.isInPropStat = false;
        break;
      case "propstat":
        this.isInPropStat = true;
        break;
      case "status":
        if (this.isInPropStat) {
          this.tag = "propstat_" + aLocalName;
        } else {
          this.tag = aLocalName;
        }
        this.currentResponse[this.tag] = "";
        break;
      case "calendar-data":
      case "href":
      case "getetag":
        this.tag = aLocalName.replace(/-/g, "");
        this.currentResponse[this.tag] = "";
        break;
    }
    if (this.calendar.verboseLogging()) {
      this.logXML += "<" + aQName + ">";
    }
  }

  async endElement(aUri, aLocalName, aQName) {
    switch (aLocalName) {
      case "response": {
        const resp = this.currentResponse;
        if (resp.href && resp.href.length) {
          resp.href = this.calendar.ensureDecodedPath(resp.href);
        }
        if (
          resp.href &&
          resp.href.length &&
          resp.status &&
          resp.status.length &&
          resp.status.indexOf(" 404") > 0
        ) {
          if (this.calendar.mHrefIndex[resp.href]) {
            await this.calendar.deleteTargetCalendarItem(resp.href);
          } else {
            cal.LOG("CalDAV: skipping unfound deleted item : " + resp.href);
          }
          // Created or Updated item
        } else if (
          resp.getetag &&
          resp.getetag.length &&
          resp.href &&
          resp.href.length &&
          resp.calendardata &&
          resp.calendardata.length
        ) {
          let oldEtag;
          const itemId = this.calendar.mHrefIndex[resp.href];
          if (itemId) {
            oldEtag = this.calendar.mItemInfoCache[itemId].etag;
          } else {
            oldEtag = null;
          }
          if (!oldEtag || oldEtag != resp.getetag || this.listener) {
            await this.calendar.addTargetCalendarItem(
              resp.href,
              resp.calendardata,
              this.baseUri,
              resp.getetag,
              this.listener
            );
          } else {
            cal.LOG("CalDAV: skipping item with unmodified etag : " + oldEtag);
          }
        } else {
          cal.WARN(
            "CalDAV: Unexpected response, status: " +
              resp.status +
              ", href: " +
              resp.href +
              " calendar-data:\n" +
              resp.calendardata
          );
          this.unhandledErrors++;
        }
        break;
      }
      case "propstat": {
        this.isInPropStat = false;
        break;
      }
    }
    this.tag = null;
    if (this.calendar.verboseLogging()) {
      this.logXML += "</" + aQName + ">";
    }
  }

  processingInstruction(aTarget, aData) {}
}
