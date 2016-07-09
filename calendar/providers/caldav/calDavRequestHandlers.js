/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://calendar/modules/calUtils.jsm");
Components.utils.import("resource://calendar/modules/calAsyncUtils.jsm");
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource://gre/modules/Timer.jsm");
Components.utils.import("resource://gre/modules/Preferences.jsm");
Components.utils.import("resource://gre/modules/Promise.jsm");
Components.utils.import("resource://gre/modules/Task.jsm");


/**
 * This is a handler for the etag request in calDavCalendar.js' getUpdatedItem.
 * It uses the SAX parser to incrementally parse the items and compose the
 * resulting multiget.
 *
 * @param aCalendar             The (unwrapped) calendar this request belongs to
 * @param aBaseUri              The URI requested (i.e inbox or collection)
 * @param aChangeLogListener    (optional) for cached calendars, the listener to
 *                                notify.
 */
function etagsHandler(aCalendar, aBaseUri, aChangeLogListener) {
    this.calendar = aCalendar;
    this.baseUri = aBaseUri;
    this.changeLogListener = aChangeLogListener;
    this._reader = Components.classes["@mozilla.org/saxparser/xmlreader;1"]
                             .createInstance(Components.interfaces.nsISAXXMLReader);
    this._reader.contentHandler = this;
    this._reader.errorHandler = this;
    this._reader.parseAsync(null);

    this.itemsReported = {};
    this.itemsNeedFetching = [];
}

etagsHandler.prototype = {
    skipIndex: -1,
    currentResponse: null,
    tag: null,
    calendar: null,
    baseUri: null,
    changeLogListener: null,
    logXML: "",

    itemsReported: null,
    itemsNeedFetching: null,

    QueryInterface: XPCOMUtils.generateQI([
        Components.interfaces.nsISAXContentHandler,
        Components.interfaces.nsISAXErrorHandler,
        Components.interfaces.nsIRequestObserver,
        Components.interfaces.nsIStreamListener
    ]),

    /**
     * @see nsIStreamListener
     */
    onStartRequest: function(request, context) {
        let httpchannel = request.QueryInterface(Components.interfaces.nsIHttpChannel);

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
            this._reader.onStartRequest(request, context);
        } else {
            cal.LOG("CalDAV: Error fetching item etags");
            this.calendar.reportDavError(Components.interfaces.calIErrors.DAV_REPORT_ERROR);
            if (this.calendar.isCached && this.changeLogListener) {
                this.changeLogListener.onResult({ status: Components.results.NS_ERROR_FAILURE },
                                                Components.results.NS_ERROR_FAILURE);
            }
            this._reader = null;
        }
    },

    onStopRequest: Task.async(function* (request, context, statusCode) {
        if (this.calendar.verboseLogging()) {
            cal.LOG("CalDAV: recv: " + this.logXML);
        }
        if (!this._reader) {
            // No reader means there was a request error
            return;
        }
        try {
            this._reader.onStopRequest(request, context, statusCode);
        } finally {
            this._reader = null;
        }

        // Now that we are done, check which items need fetching.
        if (this.calendar.isCached) {
            this.calendar.superCalendar.startBatch();
        }

        let needsRefresh = false;
        try {
            for (let path in this.calendar.mHrefIndex) {
                if (path in this.itemsReported ||
                    path.substr(0, this.baseUri.length) == this.baseUri) {
                    // If the item is also on the server, check the next.
                    continue;
                }
                // If an item has been deleted from the server, delete it here too.
                // Since the target calendar's operations are synchronous, we can
                // safely set variables from this function.
                let pcal = cal.async.promisifyCalendar(this.calendar.mOfflineStorage);
                let foundItem = (yield pcal.getItem(this.calendar.mHrefIndex[path]))[0];

                if (foundItem) {
                    let wasInboxItem = this.calendar.mItemInfoCache[foundItem.id].isInboxItem;
                    if ((wasInboxItem && this.calendar.isInbox(this.baseUri.spec)) ||
                        (wasInboxItem === false && !this.calendar.isInbox(this.baseUri.spec))) {
                        cal.LOG("Deleting local href: " + path);
                        delete this.calendar.mHrefIndex[path];
                        yield pcal.deleteItem(foundItem);
                        needsRefresh = true;
                    }
                }
            }
        } finally {
            if (this.calendar.isCached) {
                this.calendar.superCalendar.endBatch();
            }
        }

        // Avoid sending empty multiget requests update views if something has
        // been deleted server-side.
        if (this.itemsNeedFetching.length) {
            let multiget = new multigetSyncHandler(this.itemsNeedFetching,
                                       this.calendar,
                                       this.baseUri,
                                       null,
                                       false,
                                       null,
                                       this.changeLogListener);
            multiget.doMultiGet();
        } else {
            if (this.calendar.isCached && this.changeLogListener) {
                this.changeLogListener.onResult({ status: Components.results.NS_OK },
                                                Components.results.NS_OK);
            }

            if (needsRefresh) {
                this.calendar.mObservers.notify("onLoad", [this.calendar]);
            }

            // but do poll the inbox
            if (this.calendar.mShouldPollInbox &&
                !this.calendar.isInbox(this.baseUri.spec)) {
                this.calendar.pollInbox();
            }
        }
    }),

    onDataAvailable: function(request, context, inputStream, offset, count) {
        if (this._reader) {
            // No reader means request error
            this._reader.onDataAvailable(request, context, inputStream, offset, count);
        }
    },


    /**
     * @see nsISAXErrorHandler
     */
    fatalError: function() {
        cal.WARN("CalDAV: Fatal Error parsing etags for " + this.calendar.name);
    },


    /**
     * @see nsISAXContentHandler
     */
    characters: function(aValue) {
        if (this.calendar.verboseLogging()) {
            this.logXML += aValue;
        }
        this.currentResponse[this.tag] += aValue;
    },

    startDocument: function() {
        this.hrefMap = {};
        this.currentResponse = {};
        this.tag = null;
    },

    endDocument: function() { },

    startElement: function(aUri, aLocalName, aQName, aAttributes) {
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
    },

    endElement: function(aUri, aLocalName, aQName) {
        switch (aLocalName) {
            case "response": {
                this.tag = null;
                let resp = this.currentResponse;
                if (resp.getetag && resp.getetag.length &&
                    resp.href && resp.href.length &&
                    resp.getcontenttype && resp.getcontenttype.length &&
                    !resp.isCollection) {
                    resp.href = this.calendar.ensureDecodedPath(resp.href);

                    if (resp.getcontenttype.substr(0, 14) == "message/rfc822") {
                        // workaround for a Scalix bug which causes incorrect
                        // contenttype to be returned.
                        resp.getcontenttype = "text/calendar";
                    }
                    if (resp.getcontenttype == "text/vtodo") {
                        // workaround Kerio wierdness
                        resp.getcontenttype = "text/calendar";
                    }

                    // Only handle calendar items
                    if (resp.getcontenttype.substr(0, 13) == "text/calendar") {
                        if (resp.href && resp.href.length) {
                            this.itemsReported[resp.href] = resp.getetag;

                            let itemUid = this.calendar.mHrefIndex[resp.href];
                            if (!itemUid ||
                                resp.getetag != this.calendar.mItemInfoCache[itemUid].etag) {
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
    },

    startPrefixMapping: function(aPrefix, aUri) { },
    endPrefixMapping: function(aPrefix) { },
    ignorableWhitespace: function(aWhiteSpace) { },
    processingInstruction: function(aTarget, aData) { }
};

/**
 * This is a handler for the webdav sync request in calDavCalendar.js' getUpdatedItem.
 * It uses the SAX parser to incrementally parse the items and compose the
 * resulting multiget.
 *
 * @param aCalendar             The (unwrapped) calendar this request belongs to
 * @param aBaseUri              The URI requested (i.e inbox or collection)
 * @param aChangeLogListener    (optional) for cached calendars, the listener to
 *                                notify.
 */
function webDavSyncHandler(aCalendar, aBaseUri, aChangeLogListener) {
    this.calendar = aCalendar;
    this.baseUri = aBaseUri;
    this.changeLogListener = aChangeLogListener;
    this._reader = Components.classes["@mozilla.org/saxparser/xmlreader;1"]
                             .createInstance(Components.interfaces.nsISAXXMLReader);
    this._reader.contentHandler = this;
    this._reader.errorHandler = this;
    this._reader.parseAsync(null);

    this.itemsReported = {};
    this.itemsNeedFetching = [];
}

webDavSyncHandler.prototype = {
    currentResponse: null,
    tag: null,
    calendar: null,
    baseUri: null,
    newSyncToken: null,
    changeLogListener: null,
    logXML: "",
    isInPropStat: false,
    changeCount: 0,
    unhandledErrors: 0,
    itemsReported: null,
    itemsNeedFetching: null,
    additionalSyncNeeded: false,

    QueryInterface: XPCOMUtils.generateQI([
        Components.interfaces.nsISAXContentHandler,
        Components.interfaces.nsISAXErrorHandler,
        Components.interfaces.nsIRequestObserver,
        Components.interfaces.nsIStreamListener
    ]),

    doWebDAVSync: function() {
        if (this.calendar.mDisabled) {
            // check if maybe our calendar has become available
            this.calendar.setupAuthentication(this.changeLogListener);
            return;
        }


        let syncTokenString = "<sync-token/>";
        if (this.calendar.mWebdavSyncToken && this.calendar.mWebdavSyncToken.length > 0) {
            let syncToken = cal.xml.escapeString(this.calendar.mWebdavSyncToken);
            syncTokenString = "<sync-token>" + syncToken + "</sync-token>";
        }

        let queryXml =
          xmlHeader +
          '<sync-collection xmlns="DAV:">' +
            syncTokenString +
            "<sync-level>1</sync-level>" +
            "<prop>" +
              "<getcontenttype/>" +
              "<getetag/>" +
            "</prop>" +
          "</sync-collection>";

        let requestUri = this.calendar.makeUri(null, this.baseUri);

        if (this.calendar.verboseLogging()) {
            cal.LOG("CalDAV: send(" + requestUri.spec + "): " + queryXml);
        }
        cal.LOG("CalDAV: webdav-sync Token: " + this.calendar.mWebdavSyncToken);
        this.calendar.sendHttpRequest(requestUri, queryXml, MIME_TEXT_XML, null, (channel) => {
            // The depth header adheres to an older version of the webdav-sync
            // spec and has been replaced by the <sync-level> tag above.
            // Unfortunately some servers still depend on the depth header,
            // therefore we send both (yuck).
            channel.setRequestHeader("Depth", "1", false);

            channel.requestMethod = "REPORT";
            return this;
        }, () => {
            // Something went wrong with the OAuth token, notify failure
            if (this.calendar.isCached && this.changeLogListener) {
                this.changeLogListener.onResult({ status: Components.results.NS_ERROR_NOT_AVAILABLE },
                                                Components.results.NS_ERROR_NOT_AVAILABLE);
            }
        }, false);
    },

    /**
     * @see nsIStreamListener
     */
    onStartRequest: function(request, context) {
        let httpchannel = request.QueryInterface(Components.interfaces.nsIHttpChannel);

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
            this._reader.onStartRequest(request, context);
        } else if (this.calendar.mWebdavSyncToken != null &&
                   responseStatus >= 400 &&
                   responseStatus <= 499) {
            // Invalidate sync token with 4xx errors that could indicate the
            // sync token has become invalid and do a refresh
            cal.LOG("CalDAV: Reseting sync token because server returned status code: " + responseStatus);
            this._reader = null;
            this.calendar.mWebdavSyncToken = null;
            this.calendar.saveCalendarProperties();
            this.calendar.safeRefresh(this.changeLogListener);
        } else {
            cal.WARN("CalDAV: Error doing webdav sync: " + responseStatus);
            this.calendar.reportDavError(Components.interfaces.calIErrors.DAV_REPORT_ERROR);
            if (this.calendar.isCached && this.changeLogListener) {
                this.changeLogListener.onResult({ status: Components.results.NS_ERROR_FAILURE },
                                                Components.results.NS_ERROR_FAILURE);
            }
            this._reader = null;
        }
    },

    onStopRequest: function(request, context, statusCode) {
        if (this.calendar.verboseLogging()) {
            cal.LOG("CalDAV: recv: " + this.logXML);
        }
        if (!this._reader) {
            // No reader means there was a request error
            cal.LOG("CalDAV: onStopRequest: no reader");
            return;
        }
        try {
            this._reader.onStopRequest(request, context, statusCode);
        } finally {
            this._reader = null;
        }
    },

    onDataAvailable: function(request, context, inputStream, offset, count) {
        if (this._reader) {
            // No reader means request error
            this._reader.onDataAvailable(request, context, inputStream, offset, count);
        }
    },

    /**
     * @see nsISAXErrorHandler
     */
    fatalError: function() {
        cal.WARN("CalDAV: Fatal Error doing webdav sync for " + this.calendar.name);
    },

    /**
     * @see nsISAXContentHandler
     */
    characters: function(aValue) {
        if (this.calendar.verboseLogging()) {
            this.logXML += aValue;
        }
        this.currentResponse[this.tag] += aValue;
    },

    startDocument: function() {
        this.hrefMap = {};
        this.currentResponse = {};
        this.tag = null;
        if (this.calendar.isCached) {
            this.calendar.superCalendar.startBatch();
        }
    },

    endDocument: function() {
        if (this.unhandledErrors) {
            this.calendar.superCalendar.endBatch();
            this.calendar.reportDavError(Components.interfaces.calIErrors.DAV_REPORT_ERROR);
            if (this.calendar.isCached && this.changeLogListener) {
                this.changeLogListener.onResult({ status: Components.results.NS_ERROR_FAILURE },
                                                Components.results.NS_ERROR_FAILURE);
            }
            return;
        }

        if (this.calendar.mWebdavSyncToken == null) {
            // null token means reset or first refresh indicating we did
            // a full sync; remove local items that were not returned in this full
            // sync
            for (let path in this.calendar.mHrefIndex) {
                if (!this.itemsReported[path]) {
                    this.calendar.deleteTargetCalendarItem(path);
                }
            }
        }
        if (this.calendar.isCached) {
            this.calendar.superCalendar.endBatch();
        }

        if (this.itemsNeedFetching.length) {
            let multiget = new multigetSyncHandler(this.itemsNeedFetching,
                                                   this.calendar,
                                                   this.baseUri,
                                                   this.newSyncToken,
                                                   this.additionalSyncNeeded,
                                                   null,
                                                   this.changeLogListener);
            multiget.doMultiGet();
        } else {
            if (this.newSyncToken) {
                this.calendar.mWebdavSyncToken = this.newSyncToken;
                this.calendar.saveCalendarProperties();
                cal.LOG("CalDAV: New webdav-sync Token: " + this.calendar.mWebdavSyncToken);
            }
            this.calendar.finalizeUpdatedItems(this.changeLogListener,
                                               this.baseUri);
        }
    },

    startElement: function(aUri, aLocalName, aQName, aAttributes) {
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
    },

    endElement: function(aUri, aLocalName, aQName) {
        switch (aLocalName) {
            case "response": // WebDAV Sync draft 3
            case "sync-response": { // WebDAV Sync draft 0,1,2
                let resp = this.currentResponse;
                if (resp.href && resp.href.length) {
                    resp.href = this.calendar.ensureDecodedPath(resp.href);
                }

                if ((!resp.getcontenttype || resp.getcontenttype == "text/plain") &&
                    resp.href &&
                    resp.href.endsWith(".ics")) {
                    // If there is no content-type (iCloud) or text/plain was passed
                    // (iCal Server) for the resource but its name ends with ".ics"
                    // assume the content type to be text/calendar. Apple
                    // iCloud/iCal Server interoperability fix.
                    resp.getcontenttype = "text/calendar";
                }

                // Deleted item
                if (resp.href && resp.href.length &&
                    resp.status &&
                    resp.status.length &&
                    resp.status.indexOf(" 404") > 0) {
                    if (this.calendar.mHrefIndex[resp.href]) {
                        this.changeCount++;
                        this.calendar.deleteTargetCalendarItem(resp.href);
                    } else {
                        cal.LOG("CalDAV: skipping unfound deleted item : " + resp.href);
                    }
                // Only handle Created or Updated calendar items
                } else if (resp.getcontenttype &&
                           resp.getcontenttype.substr(0, 13) == "text/calendar" &&
                           resp.getetag && resp.getetag.length &&
                           resp.href && resp.href.length &&
                           (!resp.status ||                 // Draft 3 does not require
                            resp.status.length == 0 ||      // a status for created or updated items but
                            resp.status.indexOf(" 204") ||  // draft 0, 1 and 2 needed it so treat no status
                            resp.status.indexOf(" 200") ||  // Apple iCloud returns 200 status for each item
                            resp.status.indexOf(" 201"))) { // and status 201 and 204 the same
                    this.itemsReported[resp.href] = resp.getetag;
                    let itemId = this.calendar.mHrefIndex[resp.href];
                    let oldEtag = itemId && this.calendar.mItemInfoCache[itemId].etag;

                    if (!oldEtag || oldEtag != resp.getetag) {
                        // Etag mismatch, getting new/updated item.
                        this.itemsNeedFetching.push(resp.href);
                    }
                } else if (resp.status &&
                           resp.status.includes(" 507")) {
                    // webdav-sync says that if a 507 is encountered and the
                    // url matches the request, the current token should be
                    // saved and another request should be made. We don't
                    // actually compare the URL, its too easy to get this
                    // wrong.

                    // The 507 doesn't mean the data received is invalid, so
                    // continue processing.
                    this.additionalSyncNeeded = true;
                } else if (resp.status &&
                           resp.status.indexOf(" 200") &&
                           resp.href &&
                           resp.href.endsWith("/")) {
                    // iCloud returns status responses for directories too
                    // so we just ignore them if they have status code 200. We
                    // want to make sure these are not counted as unhandled
                    // errors in the next block
                } else if ((resp.getcontenttype &&
                            resp.getcontenttype.startsWith("text/calendar")) ||
                           (resp.status &&
                            !resp.status.includes(" 404"))) {
                    // If the response element is still not handled, log an
                    // error only if the content-type is text/calendar or the
                    // response status is different than 404 not found.  We
                    // don't care about response elements on non-calendar
                    // resources or whose status is not indicating a deleted
                    // resource.
                    cal.WARN("CalDAV: Unexpected response, status: " + resp.status + ", href: " + resp.href);
                    this.unhandledErrors++;
                } else {
                    cal.LOG("CalDAV: Unhandled response element, status: " + resp.status + ", href: " + resp.href + " contenttype:" + resp.getcontenttype);
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
    },

    startPrefixMapping: function(aPrefix, aUri) { },
    endPrefixMapping: function(aPrefix) { },
    ignorableWhitespace: function(aWhiteSpace) { },
    processingInstruction: function(aTarget, aData) { }
};

/**
 * This is a handler for the multiget request.
 * It uses the SAX parser to incrementally parse the items and compose the
 * resulting multiget.
 *
 * @param aItemsNeedFetching    The array of items to fetch, this must be an
 *                              array of un-encoded paths.
 * @param aCalendar             The (unwrapped) calendar this request belongs to
 * @param aBaseUri              The URI requested (i.e inbox or collection)
 * @param aAdditionalSyncNeeded (optional) If true, the passed sync token is not the
 *                                latest, another webdav sync run should be
 *                                done after completion.
 * @param aNewSyncToken         (optional) new Sync token to set if operation successful
 * @param aListener             (optional) The listener to notify
 * @param aChangeLogListener    (optional) for cached calendars, the listener to
 *                                notify.
 */
function multigetSyncHandler(aItemsNeedFetching, aCalendar, aBaseUri, aNewSyncToken, aAdditionalSyncNeeded, aListener, aChangeLogListener) {
    this.calendar = aCalendar;
    this.baseUri = aBaseUri;
    this.listener = aListener;
    this.newSyncToken = aNewSyncToken;
    this.changeLogListener = aChangeLogListener;
    this._reader = Components.classes["@mozilla.org/saxparser/xmlreader;1"]
                             .createInstance(Components.interfaces.nsISAXXMLReader);
    this._reader.contentHandler = this;
    this._reader.errorHandler = this;
    this._reader.parseAsync(null);
    this.itemsNeedFetching = aItemsNeedFetching;
    this.additionalSyncNeeded = aAdditionalSyncNeeded;
}
multigetSyncHandler.prototype = {
    currentResponse: null,
    tag: null,
    calendar: null,
    baseUri: null,
    newSyncToken: null,
    listener: null,
    changeLogListener: null,
    logXML: null,
    unhandledErrors: 0,
    itemsNeedFetching: null,
    additionalSyncNeeded: false,

    QueryInterface: XPCOMUtils.generateQI([
        Components.interfaces.nsISAXContentHandler,
        Components.interfaces.nsISAXErrorHandler,
        Components.interfaces.nsIRequestObserver,
        Components.interfaces.nsIStreamListener
    ]),

    doMultiGet: function() {
        if (this.calendar.mDisabled) {
            // check if maybe our calendar has become available
            this.calendar.setupAuthentication(this.changeLogListener);
            return;
        }

        let batchSize = Preferences.get("calendar.caldav.multigetBatchSize", 100);
        let hrefString = "";
        while (this.itemsNeedFetching.length && batchSize > 0) {
            batchSize--;
            // ensureEncodedPath extracts only the path component of the item and
            // encodes it before it is sent to the server
            let locpath = this.calendar.ensureEncodedPath(this.itemsNeedFetching.pop());
            hrefString += "<D:href>" + cal.xml.escapeString(locpath) + "</D:href>";
        }

        let queryXml =
          xmlHeader +
          '<C:calendar-multiget xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">' +
            "<D:prop>" +
              "<D:getetag/>" +
              "<C:calendar-data/>" +
            "</D:prop>" +
            hrefString +
          "</C:calendar-multiget>";

        let requestUri = this.calendar.makeUri(null, this.baseUri);
        if (this.calendar.verboseLogging()) {
            cal.LOG("CalDAV: send(" + requestUri.spec + "): " + queryXml);
        }
        this.calendar.sendHttpRequest(requestUri, queryXml, MIME_TEXT_XML, null, (channel) => {
            channel.requestMethod = "REPORT";
            channel.setRequestHeader("Depth", "1", false);
            return this;
        }, () => {
            // Something went wrong with the OAuth token, notify failure
            if (this.calendar.isCached && this.changeLogListener) {
                this.changeLogListener.onResult({ status: Components.results.NS_ERROR_NOT_AVAILABLE },
                                                Components.results.NS_ERROR_NOT_AVAILABLE);
            }
        }, false);
    },

    /**
     * @see nsIStreamListener
     */
    onStartRequest: function(request, context) {
        let httpchannel = request.QueryInterface(Components.interfaces.nsIHttpChannel);

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
            this._reader.onStartRequest(request, context);
        } else {
            let errorMsg = "CalDAV: Error: got status " + responseStatus +
                               " fetching calendar data for " + this.calendar.name + ", " + this.listener;
            this.calendar.notifyGetFailed(errorMsg, this.listener, this.changeLogListener);
            this._reader = null;
        }
    },

    onStopRequest: function(request, context, statusCode) {
        if (this.calendar.verboseLogging()) {
            cal.LOG("CalDAV: recv: " + this.logXML);
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

            if (this.additionalSyncNeeded) {
                setTimeout(() => {
                    let wds = new webDavSyncHandler(this.calendar,
                                                    this.baseUri,
                                                    this.changeLogListener);
                    wds.doWebDAVSync();
                }, 0);
            } else {
                this.calendar.finalizeUpdatedItems(this.changeLogListener,
                                                   this.baseUri);
            }
        }
        if (!this._reader) {
            // No reader means there was a request error. The error is already
            // notified in onStartRequest, so no need to do it here.
            cal.LOG("CalDAV: onStopRequest: no reader");
            return;
        }
        try {
            this._reader.onStopRequest(request, context, statusCode);
        } finally {
            this._reader = null;
        }
        if (this.itemsNeedFetching.length > 0) {
            cal.LOG("CalDAV: Still need to fetch " + this.itemsNeedFetching.length + " elements.");
            this._reader = Components.classes["@mozilla.org/saxparser/xmlreader;1"]
                                     .createInstance(Components.interfaces.nsISAXXMLReader);
            this._reader.contentHandler = this;
            this._reader.errorHandler = this;
            this._reader.parseAsync(null);
            let timerCallback = {
                requestHandler: this,
                notify: function(timer) {
                    // Call multiget again to get another batch
                    this.requestHandler.doMultiGet();
                }
            };
            let timer = Components.classes["@mozilla.org/timer;1"]
                        .createInstance(Components.interfaces.nsITimer);
            timer.initWithCallback(timerCallback,
                                   0,
                                   Components.interfaces.nsITimer.TYPE_ONE_SHOT);
        }
    },

    onDataAvailable: function(request, context, inputStream, offset, count) {
        if (this._reader) {
            // No reader means request error
            this._reader.onDataAvailable(request, context, inputStream, offset, count);
        }
    },

    /**
     * @see nsISAXErrorHandler
     */
    fatalError: function() {
        cal.WARN("CalDAV: Fatal Error doing multiget for " + this.calendar.name);
    },

    /**
     * @see nsISAXContentHandler
     */
    characters: function(aValue) {
        if (this.calendar.verboseLogging()) {
            this.logXML += aValue;
        }
        this.currentResponse[this.tag] += aValue;
    },

    startDocument: function() {
        this.hrefMap = {};
        this.currentResponse = {};
        this.tag = null;
        this.logXML = "";
        if (this.calendar.isCached) {
            this.calendar.superCalendar.startBatch();
        }
    },

    endDocument: function() {
        if (this.calendar.isCached) {
            this.calendar.superCalendar.endBatch();
        }
    },

    startElement: function(aUri, aLocalName, aQName, aAttributes) {
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
    },

    endElement: function(aUri, aLocalName, aQName) {
        switch (aLocalName) {
            case "response": {
                let resp = this.currentResponse;
                if (resp.href &&
                    resp.href.length) {
                    resp.href = this.calendar.ensureDecodedPath(resp.href);
                }
                if (resp.href && resp.href.length &&
                    resp.status &&
                    resp.status.length &&
                    resp.status.indexOf(" 404") > 0) {
                    if (this.calendar.mHrefIndex[resp.href]) {
                        this.changeCount++;
                        this.calendar.deleteTargetCalendarItem(resp.href);
                    } else {
                        cal.LOG("CalDAV: skipping unfound deleted item : " + resp.href);
                    }
                // Created or Updated item
                } else if (resp.getetag && resp.getetag.length &&
                           resp.href && resp.href.length &&
                           resp.calendardata && resp.calendardata.length) {
                    let oldEtag;
                    let itemId = this.calendar.mHrefIndex[resp.href];
                    if (itemId) {
                        oldEtag = this.calendar.mItemInfoCache[itemId].etag;
                    } else {
                        oldEtag = null;
                    }
                    if (!oldEtag || oldEtag != resp.getetag) {
                        this.changeCount++;
                        this.calendar.addTargetCalendarItem(resp.href,
                                                            resp.calendardata,
                                                            this.baseUri,
                                                            resp.getetag,
                                                            this.listener);
                    } else {
                        cal.LOG("CalDAV: skipping item with unmodified etag : " + oldEtag);
                    }
                } else {
                    cal.WARN("CalDAV: Unexpected response, status: " +
                             resp.status + ", href: " + resp.href + " calendar-data:\n" + resp.calendardata);
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
    },

    startPrefixMapping: function(aPrefix, aUri) { },
    endPrefixMapping: function(aPrefix) { },
    ignorableWhitespace: function(aWhiteSpace) { },
    processingInstruction: function(aTarget, aData) { }
};
