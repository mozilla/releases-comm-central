/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";

import {
  CalDavTagsToXmlns,
  CalDavNsUnresolver,
} from "resource:///modules/caldav/CalDavUtils.sys.mjs";
import { CalDavSession } from "resource:///modules/caldav/CalDavSession.sys.mjs";

/* exported CalDavGenericRequest, CalDavLegacySAXRequest, CalDavItemRequest,
            CalDavDeleteItemRequest, CalDavPropfindRequest, CalDavHeaderRequest,
            CalDavPrincipalPropertySearchRequest, CalDavOutboxRequest, CalDavFreeBusyRequest */

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8"?>\n';
const MIME_TEXT_CALENDAR = "text/calendar; charset=utf-8";
const MIME_TEXT_XML = "text/xml; charset=utf-8";

/**
 * Base class for a caldav request.
 *
 * @implements {nsIChannelEventSink}
 * @implements {nsIInterfaceRequestor}
 */
class CalDavRequestBase {
  QueryInterface = ChromeUtils.generateQI(["nsIChannelEventSink", "nsIInterfaceRequestor"]);

  /**
   * Creates a new base response, this should mainly be done using the subclass constructor
   *
   * @param {CalDavSession} aSession - The session to use for this request
   * @param {?calICalendar} aCalendar - The calendar this request belongs to (can be null)
   * @param {nsIURI} aUri - The uri to request
   * @param {?string} aUploadData - The data to upload
   * @param {?string} aContentType - The MIME content type for the upload data
   * @param {?Function<nsIChannel>} aOnSetupChannel - The function to call to set up the channel
   */
  constructor(
    aSession,
    aCalendar,
    aUri,
    aUploadData = null,
    aContentType = null,
    aOnSetupChannel = null
  ) {
    if (typeof aUploadData == "function") {
      aOnSetupChannel = aUploadData;
      aUploadData = null;
      aContentType = null;
    }

    this.session = aSession;
    this.calendar = aCalendar;
    this.uri = aUri;
    this.uploadData = aUploadData;
    this.contentType = aContentType;
    this.onSetupChannel = aOnSetupChannel;
    this.response = null;
    this.reset();
  }

  /**
   * @returns {object} The class of the response for this request
   */
  get responseClass() {
    return CalDavSimpleResponse;
  }

  /**
   * Resets the channel for this request
   */
  reset() {
    this.channel = cal.provider.prepHttpChannel(
      this.uri,
      this.uploadData,
      this.contentType,
      this,
      null,
      this.session.isDetectionSession
    );
  }

  /**
   * Retrieves the given request header. Requires the request to be committed.
   *
   * @param {string} aHeader - The header to retrieve
   * @returns {?string} The requested header, or null if unavailable
   */
  getHeader(aHeader) {
    try {
      return this.response.nsirequest.getRequestHeader(aHeader);
    } catch (e) {
      return null;
    }
  }

  /**
   * Executes the request with the configuration set up in the constructor
   *
   * @returns {Promise} A promise that resolves with a subclass of CalDavResponseBase
   *                            which is based on |responseClass|.
   */
  async commit() {
    await this.session.prepareRequest(this.channel);

    if (this.onSetupChannel) {
      this.onSetupChannel(this.channel);
    }

    if (cal.verboseLogEnabled && this.uploadData) {
      const method = this.channel.requestMethod;
      cal.LOGverbose(`CalDAV: send (${method} ${this.uri.spec}): ${this.uploadData}`);
    }

    const ResponseClass = this.responseClass;
    this.response = new ResponseClass(this);
    this.response.lastRedirectStatus = null;
    this.channel.asyncOpen(this.response.listener, this.channel);

    await this.response.responded;

    const action = await this.session.completeRequest(this.response);
    if (action == CalDavSession.RESTART_REQUEST) {
      this.reset();
      return this.commit();
    }

    if (cal.verboseLogEnabled) {
      const text = this.response.text;
      if (text) {
        cal.LOGverbose("CalDAV: recv: " + text);
      }
    }

    return this.response;
  }

  /** Implement nsIInterfaceRequestor */
  getInterface(aIID) {
    /**
     * Attempt to call nsIInterfaceRequestor::getInterface on the given object, and return null
     * if it fails.
     *
     * @param {object} aObj - The object to call on.
     * @returns {?*} The requested interface object, or null.
     */
    function tryGetInterface(aObj) {
      try {
        const requestor = aObj.QueryInterface(Ci.nsIInterfaceRequestor);
        return requestor.getInterface(aIID);
      } catch (e) {
        return null;
      }
    }

    // Special case our nsIChannelEventSink, can't use tryGetInterface due to recursion errors
    if (aIID.equals(Ci.nsIChannelEventSink)) {
      return this.QueryInterface(Ci.nsIChannelEventSink);
    }

    // First check if the session has what we need. It may have an auth prompt implementation
    // that should go first. Ideally we should move the auth prompt to the session anyway, but
    // this is a task for another day (tm).
    const iface = tryGetInterface(this.session) || tryGetInterface(this.calendar);
    if (iface) {
      return iface;
    }
    throw Components.Exception("", Cr.NS_ERROR_NO_INTERFACE);
  }

  /** Implement nsIChannelEventSink */
  asyncOnChannelRedirect(aOldChannel, aNewChannel, aFlags, aCallback) {
    /**
     * Copy the given header from the old channel to the new one, ignoring missing headers
     *
     * @param {string} aHdr - The header to copy
     */
    function copyHeader(aHdr) {
      try {
        const hdrValue = aOldChannel.getRequestHeader(aHdr);
        if (hdrValue) {
          aNewChannel.setRequestHeader(aHdr, hdrValue, false);
        }
      } catch (e) {
        if (e.result != Cr.NS_ERROR_NOT_AVAILABLE) {
          // The header could possibly not be available, ignore that
          // case but throw otherwise
          throw e;
        }
      }
    }

    let uploadData, uploadContent;
    const oldUploadChannel = cal.wrapInstance(aOldChannel, Ci.nsIUploadChannel);
    const oldHttpChannel = cal.wrapInstance(aOldChannel, Ci.nsIHttpChannel);
    if (oldUploadChannel && oldHttpChannel && oldUploadChannel.uploadStream) {
      uploadData = oldUploadChannel.uploadStream;
      uploadContent = oldHttpChannel.getRequestHeader("Content-Type");
    }

    cal.provider.prepHttpChannel(null, uploadData, uploadContent, this, aNewChannel);

    // Make sure we can get/set headers on both channels.
    aNewChannel.QueryInterface(Ci.nsIHttpChannel);
    aOldChannel.QueryInterface(Ci.nsIHttpChannel);

    try {
      this.response.lastRedirectStatus = oldHttpChannel.responseStatus;
    } catch (e) {
      this.response.lastRedirectStatus = null;
    }

    // If any other header is used, it should be added here. We might want
    // to just copy all headers over to the new channel.
    copyHeader("Depth");
    copyHeader("Originator");
    copyHeader("Recipient");
    copyHeader("If-None-Match");
    copyHeader("If-Match");
    copyHeader("Accept");

    aNewChannel.requestMethod = oldHttpChannel.requestMethod;
    this.session.prepareRedirect(aOldChannel, aNewChannel).then(() => {
      aCallback.onRedirectVerifyCallback(Cr.NS_OK);
    });
  }
}

/**
 * The caldav response base class. Should be subclassed, and works with xpcom network code that uses
 * nsIRequest.
 */
class CalDavResponseBase {
  /**
   * Constructs a new caldav response
   *
   * @param {CalDavRequestBase} aRequest - The request that initiated the response
   */
  constructor(aRequest) {
    this.request = aRequest;

    this.responded = new Promise((resolve, reject) => {
      this._onresponded = resolve;
      this._onrespondederror = reject;
    });
    this.completed = new Promise((resolve, reject) => {
      this._oncompleted = resolve;
      this._oncompletederror = reject;
    });
  }

  /** The listener passed to the channel's asyncOpen */
  get listener() {
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  }

  /** @returns {nsIURI} The request URI */
  get uri() {
    return this.nsirequest.URI;
  }

  /** @returns {boolean} True, if the request was redirected */
  get redirected() {
    return this.uri.spec != this.nsirequest.originalURI.spec;
  }

  /** @returns {number} The http response status of the request */
  get status() {
    try {
      return this.nsirequest.responseStatus;
    } catch (e) {
      return -1;
    }
  }

  /** The http status category, i.e. the first digit */
  get statusCategory() {
    return (this.status / 100) | 0;
  }

  /** If the response has a success code */
  get ok() {
    return this.statusCategory == 2;
  }

  /** If the response has a client error (4xx) */
  get clientError() {
    return this.statusCategory == 4;
  }

  /** If the response had an auth error */
  get authError() {
    // 403 is technically "Forbidden", but for our terms it is the same
    return this.status == 401 || this.status == 403;
  }

  /** If the response has a conflict code */
  get conflict() {
    return this.status == 409 || this.status == 412;
  }

  /** If the response indicates the resource was not found */
  get notFound() {
    return this.status == 404;
  }

  /** If the response has a server error (5xx) */
  get serverError() {
    return this.statusCategory == 5;
  }

  /**
   * Raise an exception if one of the handled 4xx and 5xx occurred.
   */
  raiseForStatus() {
    if (this.authError) {
      throw new HttpUnauthorizedError(this);
    } else if (this.conflict) {
      throw new HttpConflictError(this);
    } else if (this.notFound) {
      throw new HttpNotFoundError(this);
    } else if (this.serverError) {
      throw new HttpServerError(this);
    }
  }

  /** The text response of the request */
  get text() {
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  }

  /** @returns {DOMDocument} A DOM document with the response xml */
  get xml() {
    if (this.text && !this._responseXml) {
      try {
        this._responseXml = cal.xml.parseString(this.text);
      } catch (e) {
        return null;
      }
    }

    return this._responseXml;
  }

  /**
   * Retrieve a request header
   *
   * @param {string} aHeader - The header to retrieve
   * @returns {string} The header value
   */
  getHeader(aHeader) {
    try {
      return this.nsirequest.getResponseHeader(aHeader);
    } catch (e) {
      return null;
    }
  }
}

/**
 * Thrown when the response had an authorization error (status 401 or 403).
 */
class HttpUnauthorizedError extends Error {
  constructor(message) {
    super(message);
    this.name = "HttpUnauthorizedError";
  }
}

/**
 * Thrown when the response has a conflict code (status 409 or 412).
 */
class HttpConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = "HttpConflictError";
  }
}

/**
 * Thrown when the response indicates the resource was not found (status 404).
 */
class HttpNotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = "HttpNotFoundError";
  }
}

/**
 * Thrown when the response has a server error (status 5xx).
 */
class HttpServerError extends Error {
  constructor(message) {
    super(message);
    this.name = "HttpServerError";
  }
}

/**
 * A simple caldav response using nsIStreamLoader
 */
class CalDavSimpleResponse extends CalDavResponseBase {
  QueryInterface = ChromeUtils.generateQI(["nsIStreamLoaderObserver"]);

  get listener() {
    if (!this._listener) {
      this._listener = cal.provider.createStreamLoader();
      this._listener.init(this);
    }
    return this._listener;
  }

  get text() {
    if (!this._responseText) {
      this._responseText = new TextDecoder().decode(Uint8Array.from(this.result)) || "";
    }
    return this._responseText;
  }

  /** Implement nsIStreamLoaderObserver */
  onStreamComplete(aLoader, aContext, aStatus, aResultLength, aResult) {
    this.resultLength = aResultLength;
    this.result = aResult;

    this.nsirequest = aLoader.request.QueryInterface(Ci.nsIHttpChannel);

    if (Components.isSuccessCode(aStatus)) {
      this._onresponded(this);
    } else {
      // Check for bad server certificates on SSL/TLS connections.
      // this.request is CalDavRequestBase instance and it contains calICalendar property
      // which is needed for checkBadCertStatus. CalDavRequestBase.calendar can be null,
      // this possibility is handled in BadCertHandler.
      cal.provider.checkBadCertStatus(aLoader.request, aStatus, this.request.calendar);
      this._onrespondederror(this);
    }
  }
}

/**
 * A generic request method that uses the CalDavRequest/CalDavResponse infrastructure
 */
export class CalDavGenericRequest extends CalDavRequestBase {
  /**
   * Constructs the generic caldav request
   *
   * @param {CalDavSession} aSession - The session to use for this request
   * @param {calICalendar} aCalendar - The calendar this request belongs to
   * @param {string} aMethod - The HTTP method to use
   * @param {nsIURI} aUri - The uri to request
   * @param {?object} aHeaders - An object with headers to set
   * @param {?string} aUploadData - Optional data to upload
   * @param {?string} aUploadType - Content type for upload data
   */
  constructor(
    aSession,
    aCalendar,
    aMethod,
    aUri,
    aHeaders = {},
    aUploadData = null,
    aUploadType = null
  ) {
    super(aSession, aCalendar, aUri, aUploadData, aUploadType, channel => {
      channel.requestMethod = aMethod;

      for (const [name, value] of Object.entries(aHeaders)) {
        channel.setRequestHeader(name, value, false);
      }
    });
  }
}

/**
 * Legacy request handlers request that uses an external request listener. Used for transitioning
 * because once I started refactoring calDavRequestHandlers.js I was on the verge of refactoring the
 * whole caldav provider. Too risky right now.
 */
export class CalDavLegacySAXRequest extends CalDavRequestBase {
  /**
   * Constructs the legacy caldav request
   *
   * @param {CalDavSession} aSession - The session to use for this request
   * @param {calICalendar} aCalendar - The calendar this request belongs to
   * @param {nsIURI} aUri - The uri to request
   * @param {?string} aUploadData - Optional data to upload
   * @param {?string} aUploadType - Content type for upload data
   * @param {?object} aHandler - The external request handler, e.g.
   *                                                    CalDavEtagsHandler,
   *                                                    CalDavMultigetSyncHandler,
   *                                                    CalDavWebDavSyncHandler.
   * @param {?Function<nsIChannel>} aOnSetupChannel - The function to call to set up the channel
   */
  constructor(
    aSession,
    aCalendar,
    aUri,
    aUploadData = null,
    aUploadType = null,
    aHandler = null,
    aOnSetupChannel = null
  ) {
    super(aSession, aCalendar, aUri, aUploadData, aUploadType, aOnSetupChannel);
    this._handler = aHandler;
  }

  /**
   * @returns {object} The class of the response for this request
   */
  get responseClass() {
    return LegacySAXResponse;
  }
}

/**
 * Response class for legacy requests. Contains a listener that proxies the
 * external request handler object (e.g. CalDavMultigetSyncHandler,
 * CalDavWebDavSyncHandler, CalDavEtagsHandler) in order to resolve or reject
 * the promises for the response's "responded" and "completed" status.
 */
class LegacySAXResponse extends CalDavResponseBase {
  /** @returns {nsIStreamListener} The listener passed to the channel's asyncOpen */
  get listener() {
    if (!this._listener) {
      this._listener = {
        QueryInterface: ChromeUtils.generateQI(["nsIRequestObserver", "nsIStreamListener"]),

        onStartRequest: aRequest => {
          try {
            const result = this.request._handler.onStartRequest(aRequest);
            this._onresponded();
            return result;
          } catch (e) {
            this._onrespondederror(e);
            return null;
          }
        },
        onStopRequest: (aRequest, aStatusCode) => {
          try {
            const result = this.request._handler.onStopRequest(aRequest, aStatusCode);
            this._onresponded();
            return result;
          } catch (e) {
            this._onrespondederror(e);
            return null;
          }
        },
        onDataAvailable: this.request._handler.onDataAvailable.bind(this.request._handler),
      };
    }
    return this._listener;
  }

  /** @returns {string} The text response of the request */
  get text() {
    return this.request._handler.logXML;
  }
}

/**
 * Upload an item to the caldav server
 */
export class CalDavItemRequest extends CalDavRequestBase {
  /**
   * Constructs an item request
   *
   * @param {CalDavSession} aSession - The session to use for this request
   * @param {calICalendar} aCalendar - The calendar this request belongs to
   * @param {nsIURI} aUri - The uri to request
   * @param {calIItemBase} aItem - The item to send
   * @param {?string} aEtag - The etag to check. The special value "*"
   *                                                    sets the If-None-Match header, otherwise
   *                                                    If-Match is set to the etag.
   */
  constructor(aSession, aCalendar, aUri, aItem, aEtag = null) {
    aItem = fixGoogleDescription(aItem, aUri);
    const serializer = Cc["@mozilla.org/calendar/ics-serializer;1"].createInstance(
      Ci.calIIcsSerializer
    );
    serializer.addItems([aItem], 1);
    const serializedItem = serializer.serializeToString();

    super(aSession, aCalendar, aUri, serializedItem, MIME_TEXT_CALENDAR, channel => {
      if (aEtag == "*") {
        channel.setRequestHeader("If-None-Match", "*", false);
      } else if (aEtag) {
        channel.setRequestHeader("If-Match", aEtag, false);
      }
    });
  }

  /**
   * @returns {object} The class of the response for this request
   */
  get responseClass() {
    return ItemResponse;
  }
}

/**
 * The response for uploading an item to the server
 */
class ItemResponse extends CalDavSimpleResponse {
  /** If the response has a success code */
  get ok() {
    // We should not accept a 201 status here indefinitely: it indicates a server error of some
    // kind that we want to know about. It's convenient to accept it for now since a number of
    // server impls don't get this right yet.
    return this.status == 204 || this.status == 201 || this.status == 200;
  }
}

/**
 * A request for deleting an item from the server
 */
export class CalDavDeleteItemRequest extends CalDavRequestBase {
  /**
   * Constructs an delete item request
   *
   * @param {CalDavSession} aSession - The session to use for this request
   * @param {calICalendar} aCalendar - The calendar this request belongs to
   * @param {nsIURI} aUri - The uri to request
   * @param {?string} aEtag - The etag to check, or null to
   *                                                    unconditionally delete
   */
  constructor(aSession, aCalendar, aUri, aEtag = null) {
    super(aSession, aCalendar, aUri, channel => {
      if (aEtag) {
        channel.setRequestHeader("If-Match", aEtag, false);
      }
      channel.requestMethod = "DELETE";
    });
  }

  /**
   * @returns {object} The class of the response for this request
   */
  get responseClass() {
    return DeleteItemResponse;
  }
}

/**
 * The response class to deleting an item
 */
class DeleteItemResponse extends ItemResponse {
  /** If the response has a success code */
  get ok() {
    // Accepting 404 as success because then the item is already deleted
    return this.status == 204 || this.status == 200 || this.status == 404;
  }
}

/**
 * A dav PROPFIND request to retrieve specific properties of a dav resource.
 */
export class CalDavPropfindRequest extends CalDavRequestBase {
  /**
   * Constructs a propfind request
   *
   * @param {CalDavSession} aSession - The session to use for this request
   * @param {calICalendar} aCalendar - The calendar this request belongs to
   * @param {nsIURI} aUri - The uri to request
   * @param {string[]} aProps - The properties to request, including
   *                                                    namespace prefix.
   * @param {number} aDepth - The depth for the request, defaults to 0
   */
  constructor(aSession, aCalendar, aUri, aProps, aDepth = 0) {
    const xml =
      XML_HEADER +
      `<D:propfind ${CalDavTagsToXmlns("D", ...aProps)}><D:prop>` +
      aProps.map(prop => `<${prop}/>`).join("") +
      "</D:prop></D:propfind>";

    super(aSession, aCalendar, aUri, xml, MIME_TEXT_XML, channel => {
      channel.setRequestHeader("Depth", aDepth, false);
      channel.requestMethod = "PROPFIND";
    });

    this.depth = aDepth;
  }

  /**
   * @returns {object} The class of the response for this request
   */
  get responseClass() {
    return PropfindResponse;
  }
}

/**
 * The response for a PROPFIND request
 */
class PropfindResponse extends CalDavSimpleResponse {
  get decorators() {
    /**
     * Retrieves the trimmed text content of the node, or null if empty
     *
     * @param {Element} node - The node to get the text content of
     * @returns {?string} The text content, or null if empty
     */
    function textContent(node) {
      const text = node.textContent;
      return text ? text.trim() : null;
    }

    /**
     * Returns an array of string with each href value within the node scope
     *
     * @param {Element} parent - The node to get the href values in
     * @returns {string[]} The array with trimmed text content values
     */
    function href(parent) {
      return [...parent.querySelectorAll(":scope > href")].map(node => node.textContent.trim());
    }

    /**
     * Returns the single href value within the node scope
     *
     * @param {Element} node - The node to get the href value in
     * @returns {?string} The trimmed text content
     */
    function singleHref(node) {
      const hrefval = node.querySelector(":scope > href");
      return hrefval ? hrefval.textContent.trim() : null;
    }

    /**
     * Returns a Set with the respective element local names in the path
     *
     * @param {string} path - The css path to search
     * @param {Element} parent - The parent element to search in
     * @returns {Set<string>} A set with the element names
     */
    function nodeNames(path, parent) {
      return new Set(
        [...parent.querySelectorAll(path)].map(node => {
          const prefix = CalDavNsUnresolver(node.namespaceURI) || node.prefix;
          return prefix + ":" + node.localName;
        })
      );
    }

    /**
     * Returns a Set for the "current-user-privilege-set" properties. If a 404
     * status is detected, null is returned indicating the server does not
     * support this directive.
     *
     * @param {string} path - The css path to search
     * @param {Element} parent - The parent element to search in
     * @param {string} status - The status of the enclosing <propstat>
     * @returns {Set<string>}
     */
    function privSet(path, parent, status = "") {
      return status.includes("404") ? null : nodeNames(path, parent);
    }

    /**
     * Returns a Set with the respective attribute values in the path
     *
     * @param {string} path - The css path to search
     * @param {string} attribute - The attribute name to retrieve for each node
     * @param {Element} parent - The parent element to search in
     * @returns {Set<string>} A set with the attribute values
     */
    function attributeValue(path, attribute, parent) {
      return new Set(
        [...parent.querySelectorAll(path)].map(node => {
          return node.getAttribute(attribute);
        })
      );
    }

    /**
     * Return the result of either function a or function b, passing the node
     *
     * @param {Function} a - The first function to call
     * @param {Function} b - The second function to call
     * @param {Element} node - The node to call the functions with
     * @returns {*} The return value of either a() or b()
     */
    function either(a, b, node) {
      return a(node) || b(node);
    }

    return {
      "D:principal-collection-set": href,
      "C:calendar-home-set": href,
      "C:calendar-user-address-set": href,
      "D:current-user-principal": singleHref,
      "D:current-user-privilege-set": privSet.bind(null, ":scope > privilege > *"),
      "D:owner": singleHref,
      "D:supported-report-set": nodeNames.bind(null, ":scope > supported-report > report > *"),
      "D:resourcetype": nodeNames.bind(null, ":scope > *"),
      "C:supported-calendar-component-set": attributeValue.bind(null, ":scope > comp", "name"),
      "C:schedule-inbox-URL": either.bind(null, singleHref, textContent),
      "C:schedule-outbox-URL": either.bind(null, singleHref, textContent),
    };
  }
  /**
   * Quick access to the properties of the PROPFIND request. Returns an object with the hrefs as
   * keys, and an object with the normalized properties as the value.
   *
   * @returns {object} The object
   */
  get data() {
    if (!this._data) {
      this._data = {};
      for (const response of this.xml.querySelectorAll(":scope > response")) {
        const href = response.querySelector(":scope > href").textContent;
        this._data[href] = {};

        // This will throw 200's and 400's in one pot, but since 400's are empty that is ok
        // for our needs.
        for (const propStat of response.querySelectorAll(":scope > propstat")) {
          const status = propStat.querySelector(":scope > status").textContent;
          for (const prop of propStat.querySelectorAll(":scope > prop > *")) {
            const prefix = CalDavNsUnresolver(prop.namespaceURI) || prop.prefix;
            const qname = prefix + ":" + prop.localName;
            if (qname in this.decorators) {
              this._data[href][qname] = this.decorators[qname](prop, status) || null;
            } else {
              this._data[href][qname] = prop.textContent.trim() || null;
            }
          }
        }
      }
    }
    return this._data;
  }

  /**
   * Shortcut for the properties of the first response, useful for depth=0
   */
  get firstProps() {
    return Object.values(this.data)[0];
  }

  /** If the response has a success code */
  get ok() {
    return this.status == 207 && this.xml;
  }
}

/**
 * An OPTIONS request for retrieving the DAV header
 */
export class CalDavHeaderRequest extends CalDavRequestBase {
  /**
   * Constructs the options request
   *
   * @param {CalDavSession} aSession - The session to use for this request
   * @param {calICalendar} aCalendar - The calendar this request belongs to
   * @param {nsIURI} aUri - The uri to request
   */
  constructor(aSession, aCalendar, aUri) {
    super(aSession, aCalendar, aUri, channel => {
      channel.requestMethod = "OPTIONS";
    });
  }

  /**
   * @returns {object} The class of the response for this request
   */
  get responseClass() {
    return DAVHeaderResponse;
  }
}

/**
 * The response class for the dav header request
 */
class DAVHeaderResponse extends CalDavSimpleResponse {
  /**
   * Returns a Set with the DAV features, not including the version
   */
  get features() {
    if (!this._features) {
      const dav = this.getHeader("dav") || "";
      const features = dav.split(/,\s*/);
      features.shift();
      this._features = new Set(features);
    }
    return this._features;
  }

  /**
   * The version from the DAV header
   */
  get version() {
    const dav = this.getHeader("dav");
    return parseInt(dav.substr(0, dav.indexOf(",")), 10);
  }
}

/**
 * Request class for principal-property-search queries
 */
export class CalDavPrincipalPropertySearchRequest extends CalDavRequestBase {
  /**
   * Constructs a principal-property-search query.
   *
   * @param {CalDavSession} aSession - The session to use for this request
   * @param {calICalendar} aCalendar - The calendar this request belongs to
   * @param {nsIURI} aUri - The uri to request
   * @param {string} aMatch - The href to search in
   * @param {string} aSearchProp - The property to search for
   * @param {string[]} aProps - The properties to retrieve
   * @param {number} aDepth - The depth of the query, defaults to 1
   */
  constructor(aSession, aCalendar, aUri, aMatch, aSearchProp, aProps, aDepth = 1) {
    const xml =
      XML_HEADER +
      `<D:principal-property-search ${CalDavTagsToXmlns("D", aSearchProp, ...aProps)}>` +
      "<D:property-search>" +
      "<D:prop>" +
      `<${aSearchProp}/>` +
      "</D:prop>" +
      `<D:match>${cal.xml.escapeString(aMatch)}</D:match>` +
      "</D:property-search>" +
      "<D:prop>" +
      aProps.map(prop => `<${prop}/>`).join("") +
      "</D:prop>" +
      "</D:principal-property-search>";

    super(aSession, aCalendar, aUri, xml, MIME_TEXT_XML, channel => {
      channel.setRequestHeader("Depth", aDepth, false);
      channel.requestMethod = "REPORT";
    });
  }

  /**
   * @returns {object} The class of the response for this request
   */
  get responseClass() {
    return PropfindResponse;
  }
}

/**
 * Request class for calendar outbox queries, to send or respond to invitations
 */
export class CalDavOutboxRequest extends CalDavRequestBase {
  /**
   * Constructs an outbox request
   *
   * @param {CalDavSession} aSession - The session to use for this request
   * @param {calICalendar} aCalendar - The calendar this request belongs to
   * @param {nsIURI} aUri - The uri to request
   * @param {string} aOrganizer - The organizer of the request
   * @param {string} aRecipients - The recipients of the request
   * @param {string} aResponseMethod - The itip response method, e.g. REQUEST,REPLY
   * @param {calIItemBase} aItem - The item to send
   */
  constructor(aSession, aCalendar, aUri, aOrganizer, aRecipients, aResponseMethod, aItem) {
    aItem = fixGoogleDescription(aItem, aUri);
    const serializer = Cc["@mozilla.org/calendar/ics-serializer;1"].createInstance(
      Ci.calIIcsSerializer
    );
    serializer.addItems([aItem], 1);

    const method = cal.icsService.createIcalProperty("METHOD");
    method.value = aResponseMethod;
    serializer.addProperty(method);

    super(
      aSession,
      aCalendar,
      aUri,
      serializer.serializeToString(),
      MIME_TEXT_CALENDAR,
      channel => {
        channel.requestMethod = "POST";
        channel.setRequestHeader("Originator", aOrganizer, false);
        for (const recipient of aRecipients) {
          channel.setRequestHeader("Recipient", recipient, true);
        }
      }
    );
  }

  /**
   * @returns {object} The class of the response for this request
   */
  get responseClass() {
    return OutboxResponse;
  }
}

/**
 * Response class for the caldav outbox request
 */
class OutboxResponse extends CalDavSimpleResponse {
  /**
   * An object with the recipients as keys, and the request status as values
   */
  get data() {
    if (!this._data) {
      this._data = {};
      // TODO The following queries are currently untested code, as I don't have
      // a caldav-sched server available. If you find someone who does, please test!
      for (const response of this.xml.querySelectorAll(":scope > response")) {
        const recipient = response.querySelector(":scope > recipient > href").textContent;
        const status = response.querySelector(":scope > request-status").textContent;
        this.data[recipient] = status;
      }
    }
    return this._data;
  }

  /** If the response has a success code */
  get ok() {
    return this.status == 200 && this.xml;
  }
}

/**
 * Request class for freebusy queries
 */
export class CalDavFreeBusyRequest extends CalDavRequestBase {
  /**
   * Creates a freebusy request, for the specified range
   *
   * @param {CalDavSession} aSession - The session to use for this request
   * @param {calICalendar} aCalendar - The calendar this request belongs to
   * @param {nsIURI} aUri - The uri to request
   * @param {string} aOrganizer - The organizer of the request
   * @param {string} aRecipient - The attendee to look up
   * @param {calIDateTime} aRangeStart - The start of the range
   * @param {calIDateTime} aRangeEnd - The end of the range
   */
  constructor(aSession, aCalendar, aUri, aOrganizer, aRecipient, aRangeStart, aRangeEnd) {
    const vcalendar = cal.icsService.createIcalComponent("VCALENDAR");
    cal.item.setStaticProps(vcalendar);

    const method = cal.icsService.createIcalProperty("METHOD");
    method.value = "REQUEST";
    vcalendar.addProperty(method);

    const freebusy = cal.icsService.createIcalComponent("VFREEBUSY");
    freebusy.uid = cal.getUUID();
    freebusy.stampTime = cal.dtz.now().getInTimezone(cal.dtz.UTC);
    freebusy.startTime = aRangeStart.getInTimezone(cal.dtz.UTC);
    freebusy.endTime = aRangeEnd.getInTimezone(cal.dtz.UTC);
    vcalendar.addSubcomponent(freebusy);

    const organizer = cal.icsService.createIcalProperty("ORGANIZER");
    organizer.value = aOrganizer;
    freebusy.addProperty(organizer);

    const attendee = cal.icsService.createIcalProperty("ATTENDEE");
    attendee.setParameter("PARTSTAT", "NEEDS-ACTION");
    attendee.setParameter("ROLE", "REQ-PARTICIPANT");
    attendee.setParameter("CUTYPE", "INDIVIDUAL");
    attendee.value = aRecipient;
    freebusy.addProperty(attendee);

    super(aSession, aCalendar, aUri, vcalendar.serializeToICS(), MIME_TEXT_CALENDAR, channel => {
      channel.requestMethod = "POST";
      channel.setRequestHeader("Originator", aOrganizer, false);
      channel.setRequestHeader("Recipient", aRecipient, false);
    });

    this._rangeStart = aRangeStart;
    this._rangeEnd = aRangeEnd;
  }

  /**
   * @returns {object} The class of the response for this request
   */
  get responseClass() {
    return FreeBusyResponse;
  }
}

/**
 * Response class for the freebusy request
 */
class FreeBusyResponse extends CalDavSimpleResponse {
  /**
   * Quick access to the freebusy response data. An object is returned with the keys being
   * recipients:
   *
   * {
   *   "mailto:user@example.com": {
   *     status: "HTTP/1.1 200 OK",
   *     intervals: [
   *       { type: "BUSY", begin: ({calIDateTime}), end: ({calIDateTime or calIDuration}) },
   *       { type: "FREE", begin: ({calIDateTime}), end: ({calIDateTime or calIDuration}) }
   *     ]
   *   }
   * }
   */
  get data() {
    /**
     * Helper to get the trimmed text content
     *
     * @param {Element} aParent - The parent node to search in
     * @param {string} aPath - The css query path to serch
     * @returns {string} The trimmed text content
     */
    function querySelectorText(aParent, aPath) {
      const node = aParent.querySelector(aPath);
      return node ? node.textContent.trim() : "";
    }

    if (!this._data) {
      this._data = {};
      for (const response of this.xml.querySelectorAll(":scope > response")) {
        const recipient = querySelectorText(response, ":scope > recipient > href");
        const status = querySelectorText(response, ":scope > request-status");
        const caldata = querySelectorText(response, ":scope > calendar-data");
        const intervals = [];
        if (caldata) {
          let component;
          try {
            component = cal.icsService.parseICS(caldata);
          } catch (e) {
            cal.LOG("CalDAV: Could not parse freebusy data: " + e);
            continue;
          }

          for (const fbcomp of cal.iterate.icalComponent(component, "VFREEBUSY")) {
            const fbstart = fbcomp.startTime;
            if (fbstart && this.request._rangeStart.compare(fbstart) < 0) {
              intervals.push({
                type: "UNKNOWN",
                begin: this.request._rangeStart,
                end: fbstart,
              });
            }

            for (const fbprop of cal.iterate.icalProperty(fbcomp, "FREEBUSY")) {
              const type = fbprop.getParameter("FBTYPE");

              const parts = fbprop.value.split("/");
              const begin = cal.createDateTime(parts[0]);
              let end;
              if (parts[1].startsWith("P")) {
                // this is a duration
                end = begin.clone();
                end.addDuration(cal.createDuration(parts[1]));
              } else {
                // This is a date string
                end = cal.createDateTime(parts[1]);
              }

              intervals.push({ type, begin, end });
            }

            const fbend = fbcomp.endTime;
            if (fbend && this.request._rangeEnd.compare(fbend) > 0) {
              intervals.push({
                type: "UNKNOWN",
                begin: fbend,
                end: this.request._rangeEnd,
              });
            }
          }
        }
        this._data[recipient] = { status, intervals };
      }
    }
    return this._data;
  }

  /**
   * The data for the first recipient, useful if just one recipient was requested
   */
  get firstRecipient() {
    return Object.values(this.data)[0];
  }
}

/**
 * Set item description to a format Google Calendar understands if the item
 * will be uploaded to Google Calendar.
 *
 * @param {calIItemBase} aItem - The item we may want to modify.
 * @param {nsIURI} aUri - The URI the item will be uploaded to.
 * @returns {calItemBase} - A calendar item with appropriately-set description.
 */
function fixGoogleDescription(aItem, aUri) {
  if (aUri.spec.startsWith("https://apidata.googleusercontent.com/caldav/")) {
    // Google expects item descriptions to be bare HTML in violation of spec,
    // rather than using the standard Alternate Text Representation.
    aItem = aItem.clone();
    aItem.descriptionText = aItem.descriptionHTML;

    // Mark items we've modified for Google compatibility for informational
    // purposes.
    aItem.setProperty("X-MOZ-GOOGLE-HTML-DESCRIPTION", true);
  }

  return aItem;
}
