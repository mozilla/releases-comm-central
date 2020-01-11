/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from calDavRequestHandlers.js */
/* globals OAUTH_BASE_URI, OAUTH_SCOPE, OAUTH_CLIENT_ID, OAUTH_HASH */

var { XPCOMUtils } = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { setTimeout } = ChromeUtils.import("resource://gre/modules/Timer.jsm");

var { OAuth2 } = ChromeUtils.import("resource:///modules/OAuth2.jsm");

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

//
// calDavCalendar.js
//

var xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>\n';

var davNS = "DAV:";
var caldavNS = "urn:ietf:params:xml:ns:caldav";
var calservNS = "http://calendarserver.org/ns/";
var MIME_TEXT_CALENDAR = "text/calendar; charset=utf-8";
var MIME_TEXT_XML = "text/xml; charset=utf-8";

var cIOL = Ci.calIOperationListener;

function caldavNSResolver(prefix) {
  /* eslint-disable id-length */
  const namespaces = {
    D: davNS,
    C: caldavNS,
    CS: calservNS,
  };
  /* eslint-enable id-length */

  return namespaces[prefix] || null;
}

function caldavXPath(aNode, aExpr, aType) {
  return cal.xml.evalXPath(aNode, aExpr, caldavNSResolver, aType);
}
function caldavXPathFirst(aNode, aExpr, aType) {
  return cal.xml.evalXPathFirst(aNode, aExpr, caldavNSResolver, aType);
}

function calDavCalendar() {
  this.initProviderBase();
  this.unmappedProperties = [];
  this.mUriParams = null;
  this.mItemInfoCache = {};
  this.mDisabled = false;
  this.mCalHomeSet = null;
  this.mInboxUrl = null;
  this.mOutboxUrl = null;
  this.mCalendarUserAddress = null;
  this.mPrincipalUrl = null;
  this.mSenderAddress = null;
  this.mHrefIndex = {};
  this.mAuthScheme = null;
  this.mAuthRealm = null;
  this.mObserver = null;
  this.mFirstRefreshDone = false;
  this.mOfflineStorage = null;
  this.mQueuedQueries = [];
  this.mCtag = null;
  this.mProposedCtag = null;

  // By default, support both events and todos.
  this.mGenerallySupportedItemTypes = ["VEVENT", "VTODO"];
  this.mSupportedItemTypes = this.mGenerallySupportedItemTypes.slice(0);
  this.mACLProperties = {};
}

// used in checking calendar URI for (Cal)DAV-ness
var kDavResourceTypeNone = 0;
var kDavResourceTypeCollection = 1;
var kDavResourceTypeCalendar = 2;

// used for etag checking
var CALDAV_MODIFY_ITEM = "modify";
var CALDAV_DELETE_ITEM = "delete";

var calDavCalendarClassID = Components.ID("{a35fc6ea-3d92-11d9-89f9-00045ace3b8d}");
var calDavCalendarInterfaces = [
  Ci.calICalendarProvider,
  Ci.nsIInterfaceRequestor,
  Ci.calIFreeBusyProvider,
  Ci.nsIChannelEventSink,
  Ci.calIItipTransport,
  Ci.calISchedulingSupport,
  Ci.calICalendar,
  Ci.calIChangeLog,
  Ci.calICalDavCalendar,
];
calDavCalendar.prototype = {
  __proto__: cal.provider.BaseClass.prototype,
  classID: calDavCalendarClassID,
  QueryInterface: cal.generateQI(calDavCalendarInterfaces),
  classInfo: cal.generateCI({
    classID: calDavCalendarClassID,
    contractID: "@mozilla.org/calendar/calendar;1?type=caldav",
    classDescription: "Calendar CalDAV back-end",
    interfaces: calDavCalendarInterfaces,
  }),

  // An array of components that are supported by the server. The default is
  // to support VEVENT and VTODO, if queries for these components return a 4xx
  // error, then they will be removed from this array.
  mGenerallySupportedItemTypes: null,
  mSupportedItemTypes: null,
  suportedItemTypes: null,
  get supportedItemTypes() {
    return this.mSupportedItemTypes;
  },

  get isCached() {
    return this != this.superCalendar;
  },

  mLastRedirectStatus: null,

  ensureTargetCalendar: function() {
    if (!this.isCached && !this.mOfflineStorage) {
      // If this is a cached calendar, the actual cache is taken care of
      // by the calCachedCalendar facade. In any other case, we use a
      // memory calendar to cache things.
      this.mOfflineStorage = Cc["@mozilla.org/calendar/calendar;1?type=memory"].createInstance(
        Ci.calISyncWriteCalendar
      );

      this.mOfflineStorage.superCalendar = this;
      this.mObserver = new calDavObserver(this);
      this.mOfflineStorage.addObserver(this.mObserver);
      this.mOfflineStorage.setProperty("relaxedMode", true);
    }
  },

  //
  // calICalendarProvider interface
  //
  get prefChromeOverlay() {
    return null;
  },

  get displayName() {
    return cal.l10n.getCalString("caldavName");
  },

  createCalendar: function() {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },

  deleteCalendar: function(_cal, listener) {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },

  // calIChangeLog interface
  get offlineStorage() {
    return this.mOfflineStorage;
  },

  set offlineStorage(storage) {
    this.mOfflineStorage = storage;
    this.fetchCachedMetaData();
  },

  resetLog: function() {
    if (this.isCached && this.mOfflineStorage) {
      this.mOfflineStorage.startBatch();
      try {
        for (let itemId in this.mItemInfoCache) {
          this.mOfflineStorage.deleteMetaData(itemId);
          delete this.mItemInfoCache[itemId];
        }
      } finally {
        this.mOfflineStorage.endBatch();
      }
    }
  },

  get offlineCachedProperties() {
    return [
      "mAuthScheme",
      "mAuthRealm",
      "mHasWebdavSyncSupport",
      "mCtag",
      "mWebdavSyncToken",
      "mSupportedItemTypes",
      "mPrincipalUrl",
      "mCalHomeSet",
      "mShouldPollInbox",
      "mHasAutoScheduling",
      "mHaveScheduling",
      "mCalendarUserAddress",
      "mOutboxUrl",
      "hasFreeBusy",
    ];
  },

  get checkedServerInfo() {
    if (Services.io.offline) {
      return true;
    } else {
      return this.mCheckedServerInfo;
    }
  },

  set checkedServerInfo(val) {
    return (this.mCheckedServerInfo = val);
  },

  saveCalendarProperties: function() {
    let properties = {};
    for (let property of this.offlineCachedProperties) {
      if (this[property] !== undefined) {
        properties[property] = this[property];
      }
    }
    this.mOfflineStorage.setMetaData("calendar-properties", JSON.stringify(properties));
  },
  restoreCalendarProperties: function(data) {
    let properties = JSON.parse(data);
    for (let property of this.offlineCachedProperties) {
      if (properties[property] !== undefined) {
        this[property] = properties[property];
      }
    }
    // migration code from bug 1299610
    if ("hasAutoScheduling" in properties && properties.hasAutoScheduling !== undefined) {
      this.mHasAutoScheduling = properties.hasAutoScheduling;
    }
  },

  // in calIGenericOperationListener aListener
  replayChangesOn: function(aChangeLogListener) {
    if (this.checkedServerInfo) {
      this.safeRefresh(aChangeLogListener);
    } else {
      // If we haven't refreshed yet, then we should check the resource
      // type first. This will call refresh() again afterwards.
      this.setupAuthentication(aChangeLogListener);
    }
  },
  setMetaData: function(id, path, etag, isInboxItem) {
    if (this.mOfflineStorage.setMetaData) {
      if (id) {
        let dataString = [etag, path, isInboxItem ? "true" : "false"].join("\u001A");
        this.mOfflineStorage.setMetaData(id, dataString);
      } else {
        cal.LOG("CalDAV: cannot store meta data without an id");
      }
    } else {
      cal.ERROR("CalDAV: calendar storage does not support meta data");
    }
  },

  /**
   * Ensure that cached items have associated meta data, otherwise server side
   * changes may not be reflected
   */
  ensureMetaData: function() {
    let self = this;
    let refreshNeeded = false;
    let getMetaListener = {
      QueryInterface: ChromeUtils.generateQI([Ci.calIOperationListener]),
      onGetResult: function(aCalendar, aStatus, aItemType, aDetail, aItems) {
        for (let item of aItems) {
          if (!(item.id in self.mItemInfoCache)) {
            let path = self.getItemLocationPath(item);
            cal.LOG("Adding meta-data for cached item " + item.id);
            self.mItemInfoCache[item.id] = {
              etag: null,
              isNew: false,
              locationPath: path,
              isInboxItem: false,
            };
            self.mHrefIndex[self.mLocationPath + path] = item.id;
            refreshNeeded = true;
          }
        }
      },
      onOperationComplete: function(aCalendar, aStatus, aOpType, aId, aDetail) {
        if (refreshNeeded) {
          // resetting the cached ctag forces an item refresh when
          // safeRefresh is called later
          self.mCtag = null;
          self.mProposedCtag = null;
        }
      },
    };
    this.mOfflineStorage.getItems(
      Ci.calICalendar.ITEM_FILTER_ALL_ITEMS,
      0,
      null,
      null,
      getMetaListener
    );
  },

  fetchCachedMetaData: function() {
    cal.LOG("CalDAV: Retrieving server info from cache for " + this.name);
    let cacheIds = this.mOfflineStorage.getAllMetaDataIds();
    let cacheValues = this.mOfflineStorage.getAllMetaDataValues();

    for (let count = 0; count < cacheIds.length; count++) {
      let itemId = cacheIds[count];
      let itemData = cacheValues[count];
      if (itemId == "ctag") {
        this.mCtag = itemData;
        this.mProposedCtag = null;
        this.mOfflineStorage.deleteMetaData("ctag");
      } else if (itemId == "webdav-sync-token") {
        this.mWebdavSyncToken = itemData;
        this.mOfflineStorage.deleteMetaData("sync-token");
      } else if (itemId == "calendar-properties") {
        this.restoreCalendarProperties(itemData);
        this.setProperty("currentStatus", Cr.NS_OK);
        if (this.mHaveScheduling || this.hasAutoScheduling || this.hasFreeBusy) {
          cal.getFreeBusyService().addProvider(this);
        }
      } else {
        let itemDataArray = itemData.split("\u001A");
        let etag = itemDataArray[0];
        let resourcePath = itemDataArray[1];
        let isInboxItem = itemDataArray[2];
        if (itemDataArray.length == 3) {
          this.mHrefIndex[resourcePath] = itemId;
          let locationPath = resourcePath.substr(this.mLocationPath.length);
          let item = {
            etag: etag,
            isNew: false,
            locationPath: locationPath,
            isInboxItem: isInboxItem == "true",
          };
          this.mItemInfoCache[itemId] = item;
        }
      }
    }

    this.ensureMetaData();
  },

  sendHttpRequest: function(
    aUri,
    aUploadData,
    aContentType,
    aExisting,
    aSetupChannelFunc,
    aFailureFunc,
    aUseStreamLoader = true
  ) {
    function oauthCheck(
      nextMethod,
      loaderOrRequest /* either the nsIStreamLoader or nsIRequestObserver parameters */
    ) {
      let request = (loaderOrRequest.request || loaderOrRequest).QueryInterface(Ci.nsIHttpChannel);
      let error = false;
      try {
        let wwwauth = request.getResponseHeader("WWW-Authenticate");
        if (wwwauth.startsWith("Bearer") && wwwauth.includes("error=")) {
          // An OAuth error occurred, we need to reauthenticate.
          error = true;
        }
      } catch (e) {
        // This happens in case the response header is missing, that's fine.
      }

      if (self.oauth && error) {
        self.oauth.accessToken = null;
        self.sendHttpRequest(...origArgs);
      } else {
        let nextArguments = Array.from(arguments).slice(1);
        nextMethod(...nextArguments);
      }
    }

    function authSuccess() {
      let channel = cal.provider.prepHttpChannel(aUri, aUploadData, aContentType, self, aExisting);
      if (usesGoogleOAuth) {
        let hdr = "Bearer " + self.oauth.accessToken;
        channel.setRequestHeader("Authorization", hdr, false);
      }
      let listener = aSetupChannelFunc(channel);
      if (aUseStreamLoader) {
        let loader = cal.provider.createStreamLoader();
        listener.onStreamComplete = oauthCheck.bind(null, listener.onStreamComplete.bind(listener));
        loader.init(listener);
        listener = loader;
      } else {
        listener.onStartRequest = oauthCheck.bind(null, listener.onStartRequest.bind(listener));
      }

      self.mLastRedirectStatus = null;
      channel.asyncOpen(listener);
    }

    const OAUTH_GRACE_TIME = 30 * 1000;

    let usesGoogleOAuth = aUri && aUri.host == "apidata.googleusercontent.com" && this.oauth;
    let origArgs = arguments;
    let self = this;

    if (
      usesGoogleOAuth &&
      (!this.oauth.accessToken || this.oauth.tokenExpires - OAUTH_GRACE_TIME < new Date().getTime())
    ) {
      // The token has expired, we need to reauthenticate first
      cal.LOG("CalDAV: OAuth token expired or empty, refreshing");
      this.oauthConnect(authSuccess, aFailureFunc, true);
    } else {
      // Either not Google OAuth, or the token is still valid.
      authSuccess();
    }
  },

  //
  // calICalendar interface
  //

  // readonly attribute AUTF8String type;
  get type() {
    return "caldav";
  },

  mDisabled: true,

  mCalendarUserAddress: null,
  get calendarUserAddress() {
    return this.mCalendarUserAddress;
  },

  mPrincipalUrl: null,
  get principalUrl() {
    return this.mPrincipalUrl;
  },

  get canRefresh() {
    // A cached calendar doesn't need to be refreshed.
    return !this.isCached;
  },

  // mUriParams stores trailing ?parameters from the
  // supplied calendar URI. Needed for (at least) Cosmo
  // tickets
  mUriParams: null,

  get uri() {
    return this.mUri;
  },

  set uri(aUri) {
    this.mUri = aUri;

    return aUri;
  },

  get calendarUri() {
    let calSpec = this.mUri.spec;
    let parts = calSpec.split("?");
    if (parts.length > 1) {
      calSpec = parts.shift();
      this.mUriParams = "?" + parts.join("?");
    }
    if (!calSpec.endsWith("/")) {
      calSpec += "/";
    }
    return Services.io.newURI(calSpec);
  },

  setCalHomeSet: function(removeLastPathSegment) {
    if (removeLastPathSegment) {
      let split1 = this.mUri.spec.split("?");
      let baseUrl = split1[0];
      if (baseUrl.charAt(baseUrl.length - 1) == "/") {
        baseUrl = baseUrl.substring(0, baseUrl.length - 2);
      }
      let split2 = baseUrl.split("/");
      split2.pop();
      this.mCalHomeSet = Services.io.newURI(split2.join("/") + "/");
    } else {
      this.mCalHomeSet = this.calendarUri;
    }
  },

  mOutboxUrl: null,
  get outboxUrl() {
    return this.mOutboxUrl;
  },

  mInboxUrl: null,
  get inboxUrl() {
    return this.mInboxUrl;
  },

  mHaveScheduling: false,
  mShouldPollInbox: true,
  get hasScheduling() {
    // Whether to use inbox/outbox scheduling
    return this.mHaveScheduling;
  },
  set hasScheduling(value) {
    return (this.mHaveScheduling =
      Services.prefs.getBoolPref("calendar.caldav.sched.enabled", false) && value);
  },
  mHasAutoScheduling: false, // Whether server automatically takes care of scheduling
  get hasAutoScheduling() {
    return this.mHasAutoScheduling;
  },

  hasFreebusy: false,

  mAuthScheme: null,

  mAuthRealm: null,

  mFirstRefreshDone: false,

  mQueuedQueries: null,

  mCtag: null,
  mProposedCtag: null,

  mOfflineStorage: null,
  // Contains the last valid synctoken returned
  // from the server with Webdav Sync enabled servers
  mWebdavSyncToken: null,
  // Indicates that the server supports Webdav Sync
  // see: http://tools.ietf.org/html/draft-daboo-webdav-sync
  mHasWebdavSyncSupport: false,

  get authRealm() {
    return this.mAuthRealm;
  },

  /**
   * Builds a correctly encoded nsIURI based on the baseUri and the insert
   * string. The returned uri is basically the baseURI + aInsertString
   *
   * @param aInsertString  String to append to the base uri, for example,
   *                       when creating an event this would be the
   *                       event file name (event.ics), if null, an empty
   *                       string is used.
   * @param aBaseUri       base uri (nsIURI object), if null, this.calendarUri
   *                       will be used.
   */
  makeUri: function(aInsertString, aBaseUri) {
    let baseUri = aBaseUri || this.calendarUri;
    // Build a string containing the full path, decoded, so it looks like
    // this:
    // /some path/insert string.ics
    let decodedPath = this.ensureDecodedPath(baseUri.pathQueryRef) + (aInsertString || "");

    // Build the nsIURI by specifying a string with a fully encoded path
    // the end result will be something like this:
    // http://caldav.example.com:8080/some%20path/insert%20string.ics
    return Services.io.newURI(
      baseUri.prePath + this.ensureEncodedPath(decodedPath) + (this.mUriParams || "")
    );
  },

  get mLocationPath() {
    return this.ensureDecodedPath(this.calendarUri.pathQueryRef);
  },

  getItemLocationPath: function(aItem) {
    if (aItem.id && aItem.id in this.mItemInfoCache && this.mItemInfoCache[aItem.id].locationPath) {
      // modifying items use the cached location path
      return this.mItemInfoCache[aItem.id].locationPath;
    } else {
      // New items just use id.ics
      return aItem.id + ".ics";
    }
  },

  getProperty: function(aName) {
    if (aName in this.mACLProperties && this.mACLProperties[aName]) {
      return this.mACLProperties[aName];
    }

    switch (aName) {
      case "organizerId":
        if (this.calendarUserAddress) {
          return this.calendarUserAddress;
        } // else use configured email identity
        break;
      case "organizerCN":
        return null; // xxx todo
      case "itip.transport":
        if (this.hasAutoScheduling || this.hasScheduling) {
          return this.QueryInterface(Ci.calIItipTransport);
        } // else use outbound email-based iTIP (from cal.provider.BaseClass)
        break;
      case "capabilities.tasks.supported":
        return this.supportedItemTypes.includes("VTODO");
      case "capabilities.events.supported":
        return this.supportedItemTypes.includes("VEVENT");
      case "capabilities.autoschedule.supported":
        return this.hasAutoScheduling;
      case "capabilities.username.supported":
        return true;
    }
    return this.__proto__.__proto__.getProperty.apply(this, arguments);
  },

  promptOverwrite: function(aMethod, aItem, aListener, aOldItem) {
    let overwrite = cal.provider.promptOverwrite(aMethod, aItem, aListener, aOldItem);
    if (overwrite) {
      if (aMethod == CALDAV_MODIFY_ITEM) {
        this.doModifyItem(aItem, aOldItem, aListener, true);
      } else {
        this.doDeleteItem(aItem, aListener, true, false, null);
      }
    } else {
      this.getUpdatedItem(aItem, aListener);
    }
  },

  mItemInfoCache: null,

  mHrefIndex: null,

  /**
   * addItem()
   * we actually use doAdoptItem()
   *
   * @param aItem       item to add
   * @param aListener   listener for method completion
   */
  addItem: function(aItem, aListener) {
    return this.doAdoptItem(aItem.clone(), aListener);
  },

  /**
   * adoptItem()
   * we actually use doAdoptItem()
   *
   * @param aItem       item to check
   * @param aListener   listener for method completion
   */
  adoptItem: function(aItem, aListener) {
    return this.doAdoptItem(aItem, aListener);
  },

  /**
   * Performs the actual addition of the item to CalDAV store
   *
   * @param aItem       item to add
   * @param aListener   listener for method completion
   * @param aIgnoreEtag flag to indicate ignoring of Etag
   */
  doAdoptItem: function(aItem, aListener, aIgnoreEtag) {
    let notifyListener = (status, detail, pure = false) => {
      let method = pure ? "notifyPureOperationComplete" : "notifyOperationComplete";
      this[method](aListener, status, cIOL.ADD, aItem.id, detail);
    };
    if (aItem.id == null && aItem.isMutable) {
      aItem.id = cal.getUUID();
    }

    if (aItem.id == null) {
      notifyListener(Cr.NS_ERROR_FAILURE, "Can't set ID on non-mutable item to addItem");
      return;
    }

    if (!cal.item.isItemSupported(aItem, this)) {
      notifyListener(Cr.NS_ERROR_FAILURE, "Server does not support item type");
      return;
    }

    let parentItem = aItem.parentItem;
    parentItem.calendar = this.superCalendar;

    let locationPath = this.getItemLocationPath(parentItem);
    let itemUri = this.makeUri(locationPath);
    cal.LOG("CalDAV: itemUri.spec = " + itemUri.spec);

    let self = this;
    let serializedItem = this.getSerializedItem(aItem);
    let addListener = {
      onStreamComplete: function(aLoader, aContext, aStatus, aResultLength, aResult) {
        let request = aLoader.request.QueryInterface(Ci.nsIHttpChannel);
        let listenerStatus = Cr.NS_OK;
        let listenerDetail = parentItem;
        let responseStatus;
        try {
          responseStatus = request.responseStatus;

          if (self.verboseLogging()) {
            let str = new TextDecoder().decode(Uint8Array.from(aResult));
            cal.LOG("CalDAV: recv: " + (str || ""));
          }
        } catch (ex) {
          listenerStatus = ex.result;
          listenerDetail = "Request Failed: " + ex.message;
          cal.LOG("CalDAV: Request error during add: " + ex);
        }

        // Translate the HTTP status code to a status and message for the listener
        if (responseStatus == 201 || responseStatus == 204) {
          // 201 = HTTP "Created"
          // 204 = HTTP "No Content"
          cal.LOG("CalDAV: Item added to " + self.name + " successfully");

          let uriComponentParts = self
            .makeUri()
            .pathQueryRef.replace(/\/{2,}/g, "/")
            .split("/").length;
          let targetParts = request.URI.pathQueryRef.split("/");
          targetParts.splice(0, uriComponentParts - 1);

          self.mItemInfoCache[parentItem.id] = { locationPath: targetParts.join("/") };
          // TODO: onOpComplete adds the item to the cache, probably after getUpdatedItem!

          // Some CalDAV servers will modify items on PUT (add X-props,
          // for instance) so we'd best re-fetch in order to know
          // the current state of the item
          // Observers will be notified in getUpdatedItem()
          self.getUpdatedItem(parentItem, aListener);
          return;
        } else if (responseStatus >= 500 && responseStatus <= 510) {
          listenerStatus = Cr.NS_ERROR_NOT_AVAILABLE;
          listenerDetail = "Server Replied with " + responseStatus;
        } else if (responseStatus) {
          // There is a response status, but we haven't handled it yet. Any
          // error occurring here should consider being handled!
          cal.ERROR(
            "CalDAV: Unexpected status adding item to " +
              self.name +
              ": " +
              responseStatus +
              "\n" +
              serializedItem
          );

          listenerStatus = Cr.NS_ERROR_FAILURE;
          listenerDetail = "Server Replied with " + responseStatus;
        }

        // Still need to visually notify for uncached calendars.
        if (!self.isCached && !Components.isSuccessCode(listenerStatus)) {
          self.reportDavError(Ci.calIErrors.DAV_PUT_ERROR, listenerStatus, listenerDetail);
        }

        // Finally, notify listener.
        notifyListener(listenerStatus, listenerDetail, true);
      },
    };

    this.sendHttpRequest(
      itemUri,
      serializedItem,
      MIME_TEXT_CALENDAR,
      null,
      channel => {
        if (!aIgnoreEtag) {
          channel.setRequestHeader("If-None-Match", "*", false);
        }
        return addListener;
      },
      () => {
        notifyListener(Cr.NS_ERROR_NOT_AVAILABLE, "Error preparing http channel");
      }
    );
  },

  /**
   * modifyItem(); required by calICalendar.idl
   * we actually use doModifyItem()
   *
   * @param aItem       item to check
   * @param aListener   listener for method completion
   */
  modifyItem: function(aNewItem, aOldItem, aListener) {
    return this.doModifyItem(aNewItem, aOldItem, aListener, false);
  },

  /**
   * Modifies existing item in CalDAV store.
   *
   * @param aItem       item to check
   * @param aOldItem    previous version of item to be modified
   * @param aListener   listener from original request
   * @param aIgnoreEtag ignore item etag
   */
  doModifyItem: function(aNewItem, aOldItem, aListener, aIgnoreEtag) {
    let notifyListener = (status, detail, pure = false) => {
      let method = pure ? "notifyPureOperationComplete" : "notifyOperationComplete";
      this[method](aListener, status, cIOL.MODIFY, aNewItem.id, detail);
    };
    if (aNewItem.id == null) {
      notifyListener(Cr.NS_ERROR_FAILURE, "ID for modifyItem doesn't exist or is null");
      return;
    }

    let wasInboxItem = this.mItemInfoCache[aNewItem.id].isInboxItem;

    let newItem_ = aNewItem;
    aNewItem = aNewItem.parentItem.clone();
    if (newItem_.parentItem != newItem_) {
      aNewItem.recurrenceInfo.modifyException(newItem_, false);
    }
    aNewItem.generation += 1;

    let eventUri = this.makeUri(this.mItemInfoCache[aNewItem.id].locationPath);

    let self = this;

    let modifiedItemICS = this.getSerializedItem(aNewItem);

    let modListener = {
      onStreamComplete: function(aLoader, aContext, aStatus, aResultLength, aResult) {
        let request = aLoader.request.QueryInterface(Ci.nsIHttpChannel);
        let listenerStatus = Cr.NS_OK;
        let listenerDetail = aNewItem;
        let responseStatus;
        try {
          responseStatus = request.responseStatus;

          if (self.verboseLogging()) {
            let str = new TextDecoder().decode(Uint8Array.from(aResult));
            cal.LOG("CalDAV: recv: " + (str || ""));
          }
        } catch (ex) {
          listenerStatus = ex.result;
          listenerDetail = "Request Failed: " + ex.message;
          cal.LOG("CalDAV: Request error during add: " + ex);
        }

        if (responseStatus == 204 || responseStatus == 201 || responseStatus == 200) {
          // We should not accept a 201 status here indefinitely: it indicates a server error
          // of some kind that we want to know about. It's convenient to accept it for now
          // since a number of server impls don't get this right yet.
          cal.LOG("CalDAV: Item modified successfully on " + self.name);

          // Some CalDAV servers will modify items on PUT (add X-props,
          // for instance) so we'd best re-fetch in order to know
          // the current state of the item
          // Observers will be notified in getUpdatedItem()
          self.getUpdatedItem(aNewItem, aListener);

          // SOGo has calendarUri == inboxUri so we need to be careful
          // about deletions
          if (wasInboxItem && self.mShouldPollInbox) {
            self.doDeleteItem(aNewItem, null, true, true, null);
          }
          return;
        } else if (responseStatus == 412 || responseStatus == 409) {
          // promptOverwrite will ask the user and then re-request
          self.promptOverwrite(CALDAV_MODIFY_ITEM, aNewItem, aListener, aOldItem);
          return;
        } else if (responseStatus >= 500 && responseStatus <= 510) {
          listenerStatus = Cr.NS_ERROR_NOT_AVAILABLE;
          listenerDetail = "Server Replied with " + responseStatus;
        } else if (responseStatus) {
          // There is a response status, but we haven't handled it yet. Any
          // error occurring here should consider being handled!
          cal.ERROR(
            "CalDAV: Unexpected status modifying item to " +
              self.name +
              ": " +
              responseStatus +
              "\n" +
              modifiedItemICS
          );

          listenerStatus = Cr.NS_ERROR_FAILURE;
          listenerDetail = "Server Replied with " + responseStatus;
        }

        // Still need to visually notify for uncached calendars.
        if (!self.isCached && !Components.isSuccessCode(listenerStatus)) {
          self.reportDavError(Ci.calIErrors.DAV_PUT_ERROR, listenerStatus, listenerDetail);
        }

        notifyListener(listenerStatus, listenerDetail, true);
      },
    };

    this.sendHttpRequest(
      eventUri,
      modifiedItemICS,
      MIME_TEXT_CALENDAR,
      null,
      channel => {
        if (!aIgnoreEtag) {
          channel.setRequestHeader("If-Match", this.mItemInfoCache[aNewItem.id].etag, false);
        }
        return modListener;
      },
      () => {
        notifyListener(Cr.NS_ERROR_NOT_AVAILABLE, "Error preparing http channel");
      }
    );
  },

  /**
   * deleteItem(); required by calICalendar.idl
   * the actual deletion is done in doDeleteItem()
   *
   * @param aItem       item to delete
   * @param aListener   listener for method completion
   */
  deleteItem: function(aItem, aListener) {
    return this.doDeleteItem(aItem, aListener, false, null, null);
  },

  /**
   * Deletes item from CalDAV store.
   *
   * @param aItem       item to delete
   * @param aListener   listener for method completion
   * @param aIgnoreEtag ignore item etag
   * @param aFromInbox  delete from inbox rather than calendar
   * @param aUri        uri of item to delete
   * */
  doDeleteItem: function(aItem, aListener, aIgnoreEtag, aFromInbox, aUri) {
    let notifyListener = (status, detail, pure = false) => {
      let method = pure ? "notifyPureOperationComplete" : "notifyOperationComplete";
      this[method](aListener, status, cIOL.DELETE, aItem.id, detail);
    };

    if (aItem.id == null) {
      notifyListener(Cr.NS_ERROR_FAILURE, "ID doesn't exist for deleteItem");
      return;
    }

    let eventUri;
    if (aUri) {
      eventUri = aUri;
    } else if (aFromInbox || this.mItemInfoCache[aItem.id].isInboxItem) {
      eventUri = this.makeUri(this.mItemInfoCache[aItem.id].locationPath, this.mInboxUrl);
    } else {
      eventUri = this.makeUri(this.mItemInfoCache[aItem.id].locationPath);
    }

    if (eventUri.pathQueryRef == this.calendarUri.pathQueryRef) {
      notifyListener(
        Cr.NS_ERROR_FAILURE,
        "eventUri and calendarUri paths are the same, will not go on to delete entire calendar"
      );
      return;
    }

    let self = this;

    let delListener = {
      onStreamComplete: function(aLoader, aContext, aStatus, aResultLength, aResult) {
        let request = aLoader.request.QueryInterface(Ci.nsIHttpChannel);
        let listenerStatus = Cr.NS_OK;
        let listenerDetail = aItem;
        let responseStatus;
        try {
          responseStatus = request.responseStatus;

          if (self.verboseLogging()) {
            let str = new TextDecoder().decode(Uint8Array.from(aResult));
            cal.LOG("CalDAV: recv: " + (str || ""));
          }
        } catch (ex) {
          listenerStatus = ex.result;
          listenerDetail = "Request Failed: " + ex.message;
          cal.LOG("CalDAV: Request error during delete: " + ex);
        }

        // 204 = HTTP "No content"
        // 404 = Not Found - This is kind of a success, since the item is already deleted.
        //
        if (responseStatus == 204 || responseStatus == 200 || responseStatus == 404) {
          if (!aFromInbox) {
            let decodedPath = self.ensureDecodedPath(eventUri.pathQueryRef);
            delete self.mHrefIndex[decodedPath];
            delete self.mItemInfoCache[aItem.id];
            cal.LOG("CalDAV: Item deleted successfully from calendar " + self.name);

            if (!self.isCached) {
              // If the calendar is not cached, we need to remove
              // the item from our memory calendar now. The
              // listeners will be notified there.
              self.mOfflineStorage.deleteItem(aItem, aListener);
              return;
            }
          }
        } else if (responseStatus == 412 || responseStatus == 409) {
          // item has either been modified or deleted by someone else check to see which
          cal.LOG("CalDAV: Item has been modified on server, checking if it has been deleted");
          self.sendHttpRequest(
            eventUri,
            null,
            null,
            null,
            channel => {
              channel.requestMethod = "HEAD";
              return delListener2;
            },
            () => {
              notifyListener(Cr.NS_ERROR_NOT_AVAILABLE, "Error preparing http channel");
            }
          );
          return;
        } else if (responseStatus >= 500 && responseStatus <= 510) {
          listenerStatus = Cr.NS_ERROR_NOT_AVAILABLE;
          listenerDetail = "Server Replied with " + responseStatus;
        } else if (responseStatus) {
          cal.ERROR(
            "CalDAV: Unexpected status deleting item from " +
              self.name +
              ": " +
              responseStatus +
              "\n" +
              "uri: " +
              eventUri.spec
          );

          listenerStatus = Cr.NS_ERROR_FAILURE;
          listenerDetail = "Server Replied with " + responseStatus;
        }

        // Still need to visually notify for uncached calendars.
        if (!self.isCached && !Components.isSuccessCode(listenerStatus)) {
          self.reportDavError(Ci.calIErrors.DAV_REMOVE_ERROR, listenerStatus, listenerDetail);
        }

        // Finally, notify listener.
        notifyListener(listenerStatus, listenerDetail);
      },
    };

    let delListener2 = {
      onStreamComplete: function(aLoader, aContext, aStatus, aResultLength, aResult) {
        let request = aLoader.request.QueryInterface(Ci.nsIHttpChannel);
        let listenerStatus = Cr.NS_OK;
        let listenerDetail = aItem;
        let responseStatus;
        try {
          responseStatus = request.responseStatus;

          if (self.verboseLogging()) {
            let str = new TextDecoder().decode(Uint8Array.from(aResult));
            cal.LOG("CalDAV: recv: " + (str || ""));
          }
        } catch (ex) {
          listenerStatus = ex.result;
          listenerDetail = "Request Failed: " + ex.message;
          cal.LOG("CalDAV: Request error during add: " + ex);
        }

        if (responseStatus == 404) {
          // Nothing to do (except notify the listener below)
          // Someone else has already deleted it
        } else if (responseStatus >= 500 && responseStatus <= 510) {
          listenerStatus = Cr.NS_ERROR_NOT_AVAILABLE;
          listenerDetail = "Server Replied with " + responseStatus;
        } else if (responseStatus) {
          // The item still exists. We need to ask the user if he
          // really wants to delete the item. Remember, we only
          // made this request since the actual delete gave 409/412
          self.promptOverwrite(CALDAV_DELETE_ITEM, aItem, aListener, null);
          return;
        }

        // Finally, notify listener.
        notifyListener(listenerStatus, listenerDetail, true);
      },
    };

    if (this.verboseLogging()) {
      cal.LOG("CalDAV: Deleting " + eventUri.spec);
    }

    this.sendHttpRequest(
      eventUri,
      null,
      null,
      null,
      channel => {
        if (!aIgnoreEtag) {
          let etag = this.mItemInfoCache[aItem.id].etag;
          cal.LOG("CalDAV: Will only delete if matches etag " + etag);
          channel.setRequestHeader("If-Match", etag, false);
        }
        channel.requestMethod = "DELETE";
        return delListener;
      },
      () => {
        notifyListener(Cr.NS_ERROR_NOT_AVAILABLE, "Error preparing http channel");
      }
    );
  },

  /**
   * Add an item to the target calendar
   *
   * @param path      Item path MUST NOT BE ENCODED
   * @param calData   iCalendar string representation of the item
   * @param aUri      Base URI of the request
   * @param aListener Listener
   */
  addTargetCalendarItem: function(path, calData, aUri, etag, aListener) {
    let parser = Cc["@mozilla.org/calendar/ics-parser;1"].createInstance(Ci.calIIcsParser);
    // aUri.pathQueryRef may contain double slashes whereas path does not
    // this confuses our counting, so remove multiple successive slashes
    let strippedUriPath = aUri.pathQueryRef.replace(/\/{2,}/g, "/");
    let uriPathComponentLength = strippedUriPath.split("/").length;
    try {
      parser.parseString(calData);
    } catch (e) {
      // Warn and continue.
      // TODO As soon as we have activity manager integration,
      // this should be replace with logic to notify that a
      // certain event failed.
      cal.WARN("Failed to parse item: " + calData + "\n\nException:" + e);
      return;
    }
    // with CalDAV there really should only be one item here
    let items = parser.getItems();
    let propertiesList = parser.getProperties();
    let method;
    for (let prop of propertiesList) {
      if (prop.propertyName == "METHOD") {
        method = prop.value;
        break;
      }
    }
    let isReply = method == "REPLY";
    let item = items[0];
    if (!item) {
      cal.WARN("Failed to parse item: " + calData);
      return;
    }

    item.calendar = this.superCalendar;
    if (isReply && this.isInbox(aUri.spec)) {
      if (this.hasScheduling) {
        this.processItipReply(item, path);
      }
      cal.WARN("REPLY method but calendar does not support scheduling");
      return;
    }

    // Strip of the same number of components as the request
    // uri's path has. This way we make sure to handle servers
    // that pass paths like /dav/user/Calendar while
    // the request uri is like /dav/user@example.org/Calendar.
    let resPathComponents = path.split("/");
    resPathComponents.splice(0, uriPathComponentLength - 1);
    let locationPath = resPathComponents.join("/");
    let isInboxItem = this.isInbox(aUri.spec);

    if (this.mHrefIndex[path] && !this.mItemInfoCache[item.id]) {
      // If we get here it means a meeting has kept the same filename
      // but changed its uid, which can happen server side.
      // Delete the meeting before re-adding it
      this.deleteTargetCalendarItem(path);
    }

    if (this.mItemInfoCache[item.id]) {
      this.mItemInfoCache[item.id].isNew = false;
    } else {
      this.mItemInfoCache[item.id] = { isNew: true };
    }
    this.mItemInfoCache[item.id].locationPath = locationPath;
    this.mItemInfoCache[item.id].isInboxItem = isInboxItem;

    this.mHrefIndex[path] = item.id;
    this.mItemInfoCache[item.id].etag = etag;

    let needsAddModify = false;
    if (this.isCached) {
      this.setMetaData(item.id, path, etag, isInboxItem);

      // If we have a listener, then the caller will take care of adding the item
      // Otherwise, we have to do it ourself
      // XXX This is quite fragile, but saves us a double modify/add

      if (aListener) {
        // In the cached case, notifying operation complete will add the item to the cache
        if (this.mItemInfoCache[item.id].isNew) {
          this.notifyOperationComplete(aListener, Cr.NS_OK, cIOL.ADD, item.id, item);
        } else {
          this.notifyOperationComplete(aListener, Cr.NS_OK, cIOL.MODIFY, item.id, item);
        }
      } else {
        // No listener, we'll have to add it ourselves
        needsAddModify = true;
      }
    } else {
      // In the uncached case, we need to do so ourselves
      needsAddModify = true;
    }

    // Now take care of the add/modify if needed.
    if (needsAddModify) {
      if (this.mItemInfoCache[item.id].isNew) {
        this.mOfflineStorage.adoptItem(item, aListener);
      } else {
        this.mOfflineStorage.modifyItem(item, null, aListener);
      }
    }
  },

  /**
   * Deletes an item from the target calendar
   *
   * @param path Path of the item to delete, must not be encoded
   */
  deleteTargetCalendarItem: async function(path) {
    let pcal = cal.async.promisifyCalendar(this.mOfflineStorage);

    let foundItem = (await pcal.getItem(this.mHrefIndex[path]))[0];
    let wasInboxItem = this.mItemInfoCache[foundItem.id].isInboxItem;
    if ((wasInboxItem && this.isInbox(path)) || (wasInboxItem === false && !this.isInbox(path))) {
      cal.LOG("CalDAV: deleting item: " + path + ", uid: " + foundItem.id);
      delete this.mHrefIndex[path];
      delete this.mItemInfoCache[foundItem.id];
      if (this.isCached) {
        this.mOfflineStorage.deleteMetaData(foundItem.id);
      }
      await pcal.deleteItem(foundItem);
    }
  },

  /**
   * Perform tasks required after updating items in the calendar such as
   * notifying the observers and listeners
   *
   * @param aChangeLogListener    Change log listener
   * @param calendarURI           URI of the calendar whose items just got
   *                              changed
   */
  finalizeUpdatedItems: function(aChangeLogListener, calendarURI) {
    cal.LOG(
      "aChangeLogListener=" +
        aChangeLogListener +
        "\n" +
        "calendarURI=" +
        (calendarURI ? calendarURI.spec : "undefined") +
        " \n" +
        "iscached=" +
        this.isCached +
        "\n" +
        "this.mQueuedQueries.length=" +
        this.mQueuedQueries.length
    );
    if (this.isCached) {
      if (aChangeLogListener) {
        aChangeLogListener.onResult({ status: Cr.NS_OK }, Cr.NS_OK);
      }
    } else {
      this.mObservers.notify("onLoad", [this]);
    }

    if (this.mProposedCtag) {
      this.mCtag = this.mProposedCtag;
      this.mProposedCtag = null;
    }

    this.mFirstRefreshDone = true;
    while (this.mQueuedQueries.length) {
      let query = this.mQueuedQueries.pop();
      this.mOfflineStorage.getItems(...query);
    }
    if (this.hasScheduling && !this.isInbox(calendarURI.spec)) {
      this.pollInbox();
    }
  },

  /**
   * Notifies the caller that a get request has failed.
   *
   * @param errorMsg           Error message
   * @param aListener          (optional) Listener of the request
   * @param aChangeLogListener (optional)Listener for cached calendars
   */
  notifyGetFailed: function(errorMsg, aListener, aChangeLogListener) {
    cal.WARN("CalDAV: Get failed: " + errorMsg);

    // Notify changelog listener
    if (this.isCached && aChangeLogListener) {
      aChangeLogListener.onResult({ status: Cr.NS_ERROR_FAILURE }, Cr.NS_ERROR_FAILURE);
    }

    // Notify operation listener
    this.notifyOperationComplete(aListener, Cr.NS_ERROR_FAILURE, cIOL.GET, null, errorMsg);
    // If an error occurs here, we also need to unqueue the
    // requests previously queued.
    while (this.mQueuedQueries.length) {
      let [, , , , listener] = this.mQueuedQueries.pop();
      try {
        listener.onOperationComplete(
          this.superCalendar,
          Cr.NS_ERROR_FAILURE,
          cIOL.GET,
          null,
          errorMsg
        );
      } catch (e) {
        cal.ERROR(e);
      }
    }
  },

  /**
   * Retrieves a specific item from the CalDAV store.
   * Use when an outdated copy of the item is in hand.
   *
   * @param aItem       item to fetch
   * @param aListener   listener for method completion
   */
  getUpdatedItem: function(aItem, aListener, aChangeLogListener) {
    if (aItem == null) {
      this.notifyOperationComplete(
        aListener,
        Cr.NS_ERROR_FAILURE,
        cIOL.GET,
        null,
        "passed in null item"
      );
      return;
    }

    let locationPath = this.getItemLocationPath(aItem);
    let itemUri = this.makeUri(locationPath);

    let multiget = new multigetSyncHandler(
      [this.ensureDecodedPath(itemUri.pathQueryRef)],
      this,
      this.makeUri(),
      null,
      false,
      aListener,
      aChangeLogListener
    );
    multiget.doMultiGet();
  },

  // void getItem( in string id, in calIOperationListener aListener );
  getItem: function(aId, aListener) {
    this.mOfflineStorage.getItem(aId, aListener);
  },

  // void getItems( in unsigned long aItemFilter, in unsigned long aCount,
  //                in calIDateTime aRangeStart, in calIDateTime aRangeEnd,
  //                in calIOperationListener aListener );
  getItems: function(aItemFilter, aCount, aRangeStart, aRangeEnd, aListener) {
    if (this.isCached) {
      if (this.mOfflineStorage) {
        this.mOfflineStorage.getItems(...arguments);
      } else {
        this.notifyOperationComplete(aListener, Cr.NS_OK, cIOL.GET, null, null);
      }
    } else if (
      this.checkedServerInfo ||
      this.getProperty("currentStatus") == Ci.calIErrors.READ_FAILED
    ) {
      this.mOfflineStorage.getItems(...arguments);
    } else {
      this.mQueuedQueries.push(Array.from(arguments));
    }
  },

  fillACLProperties: function() {
    let orgId = this.calendarUserAddress;
    if (orgId) {
      this.mACLProperties.organizerId = orgId;
    }

    if (this.mACLEntry && this.mACLEntry.hasAccessControl) {
      let ownerIdentities = this.mACLEntry.getOwnerIdentities();
      if (ownerIdentities.length > 0) {
        let identity = ownerIdentities[0];
        this.mACLProperties.organizerId = identity.email;
        this.mACLProperties.organizerCN = identity.fullName;
        this.mACLProperties["imip.identity"] = identity;
      }
    }
  },

  safeRefresh: function(aChangeLogListener) {
    let notifyListener = status => {
      if (this.isCached && aChangeLogListener) {
        aChangeLogListener.onResult({ status: status }, status);
      }
    };

    if (!this.mACLEntry) {
      let self = this;
      let opListener = {
        QueryInterface: ChromeUtils.generateQI([Ci.calIOperationListener]),
        onGetResult: function(calendar, status, itemType, detail, items) {
          cal.ASSERT(false, "unexpected!");
        },
        onOperationComplete: function(opCalendar, opStatus, opType, opId, opDetail) {
          self.mACLEntry = opDetail;
          self.fillACLProperties();
          self.safeRefresh(aChangeLogListener);
        },
      };

      this.aclManager.getCalendarEntry(this, opListener);
      return;
    }

    this.ensureTargetCalendar();

    if (this.mAuthScheme == "Digest") {
      // the auth could have timed out and be in need of renegotiation
      // we can't risk several calendars doing this simultaneously so
      // we'll force the renegotiation in a sync query, using OPTIONS to keep
      // it quick
      let headchannel = cal.provider.prepHttpChannel(this.makeUri(), null, null, this);
      headchannel.requestMethod = "OPTIONS";
      headchannel.open();
      headchannel.QueryInterface(Ci.nsIHttpChannel);
      try {
        if (headchannel.responseStatus != 200) {
          throw new Error("OPTIONS returned unexpected status code: " + headchannel.responseStatus);
        }
      } catch (e) {
        cal.WARN("CalDAV: Exception: " + e);
        notifyListener(Cr.NS_ERROR_FAILURE);
      }
    }

    // Call getUpdatedItems right away if its the first refresh
    // *OR* if webdav Sync is enabled (It is redundant to send a request
    // to get the collection tag (getctag) on a calendar if it supports
    // webdav sync, the sync request will only return data if something
    // changed).
    if (!this.mCtag || !this.mFirstRefreshDone || this.mHasWebdavSyncSupport) {
      this.getUpdatedItems(this.calendarUri, aChangeLogListener);
      return;
    }
    let self = this;
    let queryXml =
      xmlHeader +
      '<D:propfind xmlns:D="DAV:" xmlns:CS="http://calendarserver.org/ns/">' +
      "<D:prop>" +
      "<CS:getctag/>" +
      "</D:prop>" +
      "</D:propfind>";

    if (this.verboseLogging()) {
      cal.LOG("CalDAV: send(" + this.makeUri().spec + "): " + queryXml);
    }

    let streamListener = {};
    streamListener.onStreamComplete = function(aLoader, aContext, aStatus, aResultLength, aResult) {
      let request = aLoader.request.QueryInterface(Ci.nsIHttpChannel);
      try {
        cal.LOG(
          "CalDAV: Status " + request.responseStatus + " checking ctag for calendar " + self.name
        );
      } catch (ex) {
        cal.LOG("CalDAV: Error without status on checking ctag for calendar " + self.name);
        notifyListener(Cr.NS_OK);
        return;
      }

      if (request.responseStatus == 404) {
        cal.LOG("CalDAV: Disabling calendar " + self.name + " due to 404");
        notifyListener(Cr.NS_ERROR_FAILURE);
        return;
      } else if (request.responseStatus == 207 && self.mDisabled) {
        // Looks like the calendar is there again, check its resource
        // type first.
        self.setupAuthentication(aChangeLogListener);
        return;
      }

      let str = new TextDecoder().decode(Uint8Array.from(aResult));
      if (!str) {
        cal.LOG("CalDAV: Failed to get ctag from server for calendar " + self.name);
      } else if (self.verboseLogging()) {
        cal.LOG("CalDAV: recv: " + str);
      }

      let multistatus;
      try {
        multistatus = cal.xml.parseString(str);
      } catch (ex) {
        cal.LOG("CalDAV: Failed to get ctag from server for calendar " + self.name);
        notifyListener(Cr.NS_OK);
        return;
      }

      let ctag = caldavXPathFirst(
        multistatus,
        "/D:multistatus/D:response/D:propstat/D:prop/CS:getctag/text()"
      );
      if (!ctag || ctag != self.mCtag) {
        // ctag mismatch, need to fetch calendar-data
        self.mProposedCtag = ctag;
        self.getUpdatedItems(self.calendarUri, aChangeLogListener);
        if (self.verboseLogging()) {
          cal.LOG("CalDAV: ctag mismatch on refresh, fetching data for calendar " + self.name);
        }
      } else {
        if (self.verboseLogging()) {
          cal.LOG("CalDAV: ctag matches, no need to fetch data for calendar " + self.name);
        }

        // Notify the listener, but don't return just yet...
        notifyListener(Cr.NS_OK);

        // ...we may still need to poll the inbox
        if (self.firstInRealm()) {
          self.pollInbox();
        }
      }
    };

    this.sendHttpRequest(
      this.makeUri(),
      queryXml,
      MIME_TEXT_XML,
      null,
      channel => {
        channel.setRequestHeader("Depth", "0", false);
        channel.requestMethod = "PROPFIND";
        return streamListener;
      },
      () => {
        notifyListener(Cr.NS_ERROR_NOT_AVAILABLE);
      }
    );
  },

  refresh: function() {
    this.replayChangesOn(null);
  },

  firstInRealm: function() {
    let calendars = cal.getCalendarManager().getCalendars();
    for (let i = 0; i < calendars.length; i++) {
      if (calendars[i].type != "caldav" || calendars[i].getProperty("disabled")) {
        continue;
      }
      // XXX We should probably expose the inner calendar via an
      // interface, but for now use wrappedJSObject.
      let calendar = calendars[i].wrappedJSObject;
      if (calendar.mUncachedCalendar) {
        calendar = calendar.mUncachedCalendar;
      }
      if (calendar.uri.prePath == this.uri.prePath && calendar.authRealm == this.mAuthRealm) {
        if (calendar.id == this.id) {
          return true;
        }
        break;
      }
    }
    return false;
  },

  /**
   * Get updated items
   *
   * @param aUri                  The uri to request the items from.
   *                                NOTE: This must be the uri without any uri
   *                                     params. They will be appended in this
   *                                     function.
   * @param aChangeLogListener    (optional) The listener to notify for cached
   *                                         calendars.
   */
  getUpdatedItems: function(aUri, aChangeLogListener) {
    if (this.mDisabled) {
      // check if maybe our calendar has become available
      this.setupAuthentication(aChangeLogListener);
      return;
    }

    if (this.mHasWebdavSyncSupport) {
      let webDavSync = new webDavSyncHandler(this, aUri, aChangeLogListener);
      webDavSync.doWebDAVSync();
      return;
    }

    let queryXml =
      xmlHeader +
      '<D:propfind xmlns:D="DAV:">' +
      "<D:prop>" +
      "<D:getcontenttype/>" +
      "<D:resourcetype/>" +
      "<D:getetag/>" +
      "</D:prop>" +
      "</D:propfind>";

    let requestUri = this.makeUri(null, aUri);
    if (this.verboseLogging()) {
      cal.LOG("CalDAV: send(" + requestUri.spec + "): " + queryXml);
    }

    this.sendHttpRequest(
      requestUri,
      queryXml,
      MIME_TEXT_XML,
      null,
      channel => {
        channel.requestMethod = "PROPFIND";
        channel.setRequestHeader("Depth", "1", false);
        return new etagsHandler(this, aUri, aChangeLogListener);
      },
      () => {
        if (aChangeLogListener && this.isCached) {
          aChangeLogListener.onResult(
            { status: Cr.NS_ERROR_NOT_AVAILABLE },
            Cr.NS_ERROR_NOT_AVAILABLE
          );
        }
      },
      false
    );
  },

  /**
   * @see nsIInterfaceRequestor
   * @see calProviderUtils.jsm
   */
  getInterface: cal.provider.InterfaceRequestor_getInterface,

  //
  // Helper functions
  //

  oauthConnect: function(authSuccessCb, authFailureCb, aRefresh = false) {
    // Use the async prompter to avoid multiple master password prompts
    let self = this;
    let promptlistener = {
      onPromptStartAsync: function(callback) {
        this.onPromptAuthAvailable(callback);
      },
      onPromptAuthAvailable: function(callback) {
        self.oauth.connect(
          () => {
            authSuccessCb();
            if (callback) {
              callback.onAuthResult(true);
            }
          },
          () => {
            authFailureCb();
            if (callback) {
              callback.onAuthResult(false);
            }
          },
          true,
          aRefresh
        );
      },
      onPromptCanceled: authFailureCb,
      onPromptStart: function() {},
    };
    let asyncprompter = Cc["@mozilla.org/messenger/msgAsyncPrompter;1"].getService(
      Ci.nsIMsgAsyncPrompter
    );
    asyncprompter.queueAsyncAuthPrompt(self.uri.spec, false, promptlistener);
  },

  /**
   * Sets up any needed prerequisites regarding authentication. This is the
   * beginning of a chain of asynchronous calls. This function will, when
   * done, call the next function related to checking resource type, server
   * capabilities, etc.
   *
   * setupAuthentication                         * You are here
   * checkDavResourceType
   * checkServerCaps
   * findPrincipalNS
   * checkPrincipalsNameSpace
   * completeCheckServerInfo
   */
  setupAuthentication: function(aChangeLogListener) {
    let self = this;
    function authSuccess() {
      self.checkDavResourceType(aChangeLogListener);
    }
    function authFailed() {
      self.setProperty("disabled", "true");
      self.setProperty("auto-enabled", "true");
      self.completeCheckServerInfo(aChangeLogListener, Cr.NS_ERROR_FAILURE);
    }
    if (this.mUri.host == "apidata.googleusercontent.com") {
      if (!this.oauth) {
        let sessionId = this.id;
        let pwMgrId = "Google CalDAV v2";
        let authTitle = cal.l10n.getAnyString("global", "commonDialogs", "EnterUserPasswordFor2", [
          this.name,
        ]);
        this.oauth = new OAuth2(OAUTH_BASE_URI, OAUTH_SCOPE, OAUTH_CLIENT_ID, OAUTH_HASH);
        this.oauth.requestWindowTitle = authTitle;
        this.oauth.requestWindowFeatures = "chrome,private,centerscreen,width=430,height=750";

        Object.defineProperty(this.oauth, "refreshToken", {
          get: function() {
            if (!this.mRefreshToken) {
              let pass = { value: null };
              try {
                let origin = "oauth:" + sessionId;
                cal.auth.passwordManagerGet(sessionId, pass, origin, pwMgrId);
              } catch (e) {
                // User might have cancelled the master password prompt, that's ok
                if (e.result != Cr.NS_ERROR_ABORT) {
                  throw e;
                }
              }
              this.mRefreshToken = pass.value;
            }
            return this.mRefreshToken;
          },
          set: function(val) {
            try {
              let origin = "oauth:" + sessionId;
              if (val) {
                cal.auth.passwordManagerSave(sessionId, val, origin, pwMgrId);
              } else {
                cal.auth.passwordManagerRemove(sessionId, origin, pwMgrId);
              }
            } catch (e) {
              // User might have cancelled the master password prompt, or password saving
              // could be disabled. That is ok, throw for everything else.
              if (e.result != Cr.NS_ERROR_ABORT && e.result != Cr.NS_ERROR_NOT_AVAILABLE) {
                throw e;
              }
            }
            return (this.mRefreshToken = val);
          },
          enumerable: true,
        });
      }

      if (this.oauth.accessToken) {
        authSuccess();
      } else {
        // bug 901329: If the calendar window isn't loaded yet the
        // master password prompt will show just the buttons and
        // possibly hang. If we postpone until the window is loaded,
        // all is well.
        setTimeout(function postpone() {
          // eslint-disable-line func-names
          let win = cal.window.getCalendarWindow();
          if (!win || win.document.readyState != "complete") {
            setTimeout(postpone, 0);
          } else {
            self.oauthConnect(authSuccess, authFailed);
          }
        }, 0);
      }
    } else {
      authSuccess();
    }
  },

  /**
   * Checks that the calendar URI exists and is a CalDAV calendar.
   *
   * setupAuthentication
   * checkDavResourceType                        * You are here
   * checkServerCaps
   * findPrincipalNS
   * checkPrincipalsNameSpace
   * completeCheckServerInfo
   */
  checkDavResourceType: function(aChangeLogListener) {
    this.ensureTargetCalendar();

    let resourceType = kDavResourceTypeNone;
    let self = this;

    let queryXml =
      xmlHeader +
      '<D:propfind xmlns:D="DAV:" xmlns:CS="http://calendarserver.org/ns/" xmlns:C="urn:ietf:params:xml:ns:caldav">' +
      "<D:prop>" +
      "<D:resourcetype/>" +
      "<D:owner/>" +
      "<D:current-user-principal/>" +
      "<D:supported-report-set/>" +
      "<C:supported-calendar-component-set/>" +
      "<CS:getctag/>" +
      "</D:prop>" +
      "</D:propfind>";

    if (this.verboseLogging()) {
      cal.LOG("CalDAV: send: " + queryXml);
    }
    let streamListener = {};

    streamListener.onStreamComplete = function(aLoader, aContext, aStatus, aResultLength, aResult) {
      let request = aLoader.request.QueryInterface(Ci.nsIHttpChannel);
      try {
        cal.LOG(
          "CalDAV: Status " +
            request.responseStatus +
            " on initial PROPFIND for calendar " +
            self.name
        );
      } catch (ex) {
        cal.LOG("CalDAV: Error without status on initial PROPFIND for calendar " + self.name);
        self.completeCheckServerInfo(aChangeLogListener, Ci.calIErrors.DAV_NOT_DAV);
        return;
      }

      let isText = true;

      if (
        (isText || request.URI.spec != request.originalURI.spec) &&
        self.mLastRedirectStatus == 301
      ) {
        // The initial PROPFIND essentially goes against the calendar
        // collection url. If a 301 Moved Permanently redirect occurred
        // here, we want to modify the url we use in the future.
        let nIPS = Ci.nsIPromptService;

        let promptTitle = cal.l10n.getCalString("caldavRedirectTitle", [self.name]);
        let promptText =
          cal.l10n.getCalString("caldavRedirectText", [self.name]) + "\n\n" + request.URI.spec;
        let button1Title = cal.l10n.getCalString("caldavRedirectDisableCalendar");
        let flags =
          nIPS.BUTTON_TITLE_YES * nIPS.BUTTON_POS_0 +
          nIPS.BUTTON_TITLE_IS_STRING * nIPS.BUTTON_POS_1;

        let res = Services.prompt.confirmEx(
          cal.window.getCalendarWindow(),
          promptTitle,
          promptText,
          flags,
          null,
          button1Title,
          null,
          null,
          {}
        );

        if (res == 0) {
          // YES
          let newUri = request.URI;
          cal.LOG(
            "CalDAV: Migrating url due to redirect: " + self.mUri.spec + " -> " + newUri.spec
          );
          self.mUri = newUri;
          self.setProperty("uri", newUri.spec);
        } else if (res == 1) {
          // DISABLE CALENDAR
          self.setProperty("disabled", "true");
          self.completeCheckServerInfo(aChangeLogListener, Cr.NS_ERROR_ABORT);
          return;
        }
      }

      let responseStatusCategory = Math.floor(request.responseStatus / 100);

      // 4xx codes, which is either an authentication failure or
      // something like method not allowed. This is a failure worth
      // disabling the calendar.
      if (responseStatusCategory == 4) {
        self.setProperty("disabled", "true");
        self.setProperty("auto-enabled", "true");
        self.completeCheckServerInfo(aChangeLogListener, Cr.NS_ERROR_ABORT);
        return;
      }

      // 5xx codes, a server error. This could be a temporary failure,
      // i.e a backend server being disabled.
      if (responseStatusCategory == 5) {
        cal.LOG(
          "CalDAV: Server not available " +
            request.responseStatus +
            ", abort sync for calendar " +
            self.name
        );
        self.completeCheckServerInfo(aChangeLogListener, Cr.NS_ERROR_ABORT);
        return;
      }

      let wwwauth;
      try {
        wwwauth = request.getRequestHeader("Authorization");
        self.mAuthScheme = wwwauth.split(" ")[0];
      } catch (ex) {
        // no auth header could mean a public calendar
        self.mAuthScheme = "none";
      }

      if (self.mUriParams) {
        self.mAuthScheme = "Ticket";
      }
      cal.LOG("CalDAV: Authentication scheme for " + self.name + " is " + self.mAuthScheme);
      // we only really need the authrealm for Digest auth
      // since only Digest is going to time out on us
      if (self.mAuthScheme == "Digest") {
        let realmChop = wwwauth.split('realm="')[1];
        self.mAuthRealm = realmChop.split('", ')[0];
        cal.LOG("CalDAV: realm " + self.mAuthRealm);
      }

      let str = new TextDecoder().decode(Uint8Array.from(aResult));
      if (!str || request.responseStatus == 404) {
        // No response, or the calendar no longer exists.
        cal.LOG("CalDAV: Failed to determine resource type for" + self.name);
        self.completeCheckServerInfo(aChangeLogListener, Ci.calIErrors.DAV_NOT_DAV);
        return;
      } else if (self.verboseLogging()) {
        cal.LOG("CalDAV: recv: " + str);
      }

      let multistatus;
      try {
        multistatus = cal.xml.parseString(str);
      } catch (ex) {
        cal.LOG("CalDAV: Failed to determine resource type for" + self.name + ": " + ex);
        self.completeCheckServerInfo(aChangeLogListener, Ci.calIErrors.DAV_NOT_DAV);
        return;
      }

      // check for webdav-sync capability
      // http://tools.ietf.org/html/draft-daboo-webdav-sync
      if (
        caldavXPath(
          multistatus,
          "/D:multistatus/D:response/D:propstat/D:prop" +
            "/D:supported-report-set/D:supported-report/D:report/D:sync-collection"
        )
      ) {
        cal.LOG("CalDAV: Collection has webdav sync support");
        self.mHasWebdavSyncSupport = true;
      }

      // check for server-side ctag support only if webdav sync is not available
      let ctag = caldavXPathFirst(
        multistatus,
        "/D:multistatus/D:response/D:propstat/D:prop/CS:getctag/text()"
      );
      if (!self.mHasWebdavSyncSupport && ctag) {
        // We compare the stored ctag with the one we just got, if
        // they don't match, we update the items in safeRefresh.
        if (ctag == self.mCtag) {
          self.mFirstRefreshDone = true;
        }

        self.mProposedCtag = ctag;
        if (self.verboseLogging()) {
          cal.LOG("CalDAV: initial ctag " + ctag + " for calendar " + self.name);
        }
      }

      // Use supported-calendar-component-set if the server supports it; some do not
      // Accept name attribute from all namespaces to workaround Cosmo bug see bug 605378 comment 6
      let supportedComponents = caldavXPath(
        multistatus,
        "/D:multistatus/D:response/D:propstat/D:prop/C:supported-calendar-component-set/C:comp/@*[local-name()='name']"
      );
      if (supportedComponents && supportedComponents.length) {
        self.mSupportedItemTypes = [];
        for (let compName of supportedComponents) {
          if (self.mGenerallySupportedItemTypes.includes(compName)) {
            self.mSupportedItemTypes.push(compName);
          }
        }
        cal.LOG(
          "Adding supported items: " +
            self.mSupportedItemTypes.join(",") +
            " for calendar: " +
            self.name
        );
      }

      // check if owner is specified; might save some work
      let owner = caldavXPathFirst(
        multistatus,
        "/D:multistatus/D:response/D:propstat/D:prop/D:owner/D:href/text()"
      );
      let cuprincipal = caldavXPathFirst(
        multistatus,
        "/D:multistatus/D:response/D:propstat/D:prop/D:current-user-principal/D:href/text()"
      );
      if (cuprincipal) {
        self.mPrincipalUrl = cuprincipal;
        cal.LOG(
          "CalDAV: Found principal url from DAV:current-user-principal " + self.mPrincipalUrl
        );
      } else if (owner) {
        self.mPrincipalUrl = owner;
        cal.LOG("CalDAV: Found principal url from DAV:owner " + self.mPrincipalUrl);
      }

      let resourceTypeXml = caldavXPath(
        multistatus,
        "/D:multistatus/D:response/D:propstat/D:prop/D:resourcetype"
      );
      if (!resourceTypeXml) {
        resourceType = kDavResourceTypeNone;
      } else if (caldavXPath(resourceTypeXml[0], "C:calendar")) {
        resourceType = kDavResourceTypeCalendar;
      } else if (caldavXPath(resourceTypeXml[0], "D:collection")) {
        resourceType = kDavResourceTypeCollection;
      }

      if (resourceType == kDavResourceTypeNone) {
        cal.LOG(
          "CalDAV: No resource type received, " +
            self.name +
            " doesn't seem to point to a DAV resource"
        );
        self.completeCheckServerInfo(aChangeLogListener, Ci.calIErrors.DAV_NOT_DAV);
        return;
      }

      if (resourceType == kDavResourceTypeCollection) {
        cal.LOG("CalDAV: " + self.name + " points to a DAV resource, but not a CalDAV calendar");
        self.completeCheckServerInfo(aChangeLogListener, Ci.calIErrors.DAV_DAV_NOT_CALDAV);
        return;
      }

      if (resourceType == kDavResourceTypeCalendar) {
        // If this calendar was previously offline we want to recover
        if (self.mDisabled) {
          self.mDisabled = false;
          self.mReadOnly = false;
        }
        self.setCalHomeSet(true);
        self.checkServerCaps(aChangeLogListener);
        return;
      }

      // If we get here something must have gone wrong. Abort with a
      // general error to avoid an endless loop.
      self.completeCheckServerInfo(aChangeLogListener, Cr.NS_ERROR_FAILURE);
    };

    this.sendHttpRequest(
      this.makeUri(),
      queryXml,
      MIME_TEXT_XML,
      null,
      channel => {
        channel.setRequestHeader("Depth", "0", false);
        channel.requestMethod = "PROPFIND";
        return streamListener;
      },
      () => {
        this.completeCheckServerInfo(aChangeLogListener, Cr.NS_ERROR_NOT_AVAILABLE);
      }
    );
  },

  /**
   * Checks server capabilities.
   *
   * setupAuthentication
   * checkDavResourceType
   * checkServerCaps                              * You are here
   * findPrincipalNS
   * checkPrincipalsNameSpace
   * completeCheckServerInfo
   */
  checkServerCaps: function(aChangeLogListener, calHomeSetUrlRetry) {
    let homeSet = this.makeUri(null, this.mCalHomeSet);
    let self = this;

    if (this.verboseLogging()) {
      cal.LOG("CalDAV: send: OPTIONS " + homeSet.spec);
    }

    let streamListener = {};
    streamListener.onStreamComplete = function(aLoader, aContext, aStatus, aResultLength, aResult) {
      let request = aLoader.request.QueryInterface(Ci.nsIHttpChannel);
      if (request.responseStatus != 200 && request.responseStatus != 204) {
        if (!calHomeSetUrlRetry && request.responseStatus == 404) {
          // try again with calendar URL, see https://bugzilla.mozilla.org/show_bug.cgi?id=588799
          cal.LOG(
            "CalDAV: Calendar homeset was not found at parent url of calendar URL" +
              " while querying options " +
              self.name +
              ", will try calendar URL itself now"
          );
          self.setCalHomeSet(false);
          self.checkServerCaps(aChangeLogListener, true);
        } else {
          cal.LOG(
            "CalDAV: Unexpected status " +
              request.responseStatus +
              " while querying options " +
              self.name
          );
          self.completeCheckServerInfo(aChangeLogListener, Cr.NS_ERROR_FAILURE);
        }

        // No further processing needed, we have called subsequent (async) functions above.
        return;
      }

      let dav = null;
      try {
        dav = request.getResponseHeader("DAV");
        if (self.verboseLogging()) {
          cal.LOG("CalDAV: DAV header: " + dav);
        }
      } catch (ex) {
        cal.LOG(
          "CalDAV: Error getting DAV header for " +
            self.name +
            ", status " +
            request.responseStatus +
            ", data: " +
            new TextDecoder().decode(Uint8Array.from(aResult))
        );
      }
      // Google does not yet support OPTIONS but does support scheduling
      // so we'll spoof the DAV header until Google gets fixed
      if (self.calendarUri.host == "www.google.com") {
        dav = "calendar-schedule";
        // Google also reports an inbox URL distinct from the calendar
        // URL but a) doesn't use it and b) 405s on etag queries to it
        self.mShouldPollInbox = false;
      }
      if (dav && dav.includes("calendar-auto-schedule")) {
        if (self.verboseLogging()) {
          cal.LOG("CalDAV: Calendar " + self.name + " supports calendar-auto-schedule");
        }
        self.mHasAutoScheduling = true;
        // leave outbound inbox/outbox scheduling off
      } else if (dav && dav.includes("calendar-schedule")) {
        if (self.verboseLogging()) {
          cal.LOG("CalDAV: Calendar " + self.name + " generally supports calendar-schedule");
        }
        self.hasScheduling = true;
      }

      if (self.hasAutoScheduling || (dav && dav.includes("calendar-schedule"))) {
        // XXX - we really shouldn't register with the fb service
        // if another calendar with the same principal-URL has already
        // done so. We also shouldn't register with the fb service if we
        // don't have an outbox.
        if (!self.hasFreeBusy) {
          // This may have already been set by fetchCachedMetaData,
          // we only want to add the freebusy provider once.
          self.hasFreeBusy = true;
          cal.getFreeBusyService().addProvider(self);
        }
        self.findPrincipalNS(aChangeLogListener);
      } else {
        cal.LOG("CalDAV: Server does not support CalDAV scheduling.");
        self.completeCheckServerInfo(aChangeLogListener);
      }
    };

    this.sendHttpRequest(
      homeSet,
      null,
      null,
      null,
      channel => {
        channel.requestMethod = "OPTIONS";
        return streamListener;
      },
      () => {
        this.completeCheckServerInfo(aChangeLogListener, Cr.NS_ERROR_NOT_AVAILABLE);
      }
    );
  },

  /**
   * Locates the principal namespace. This function should soely be called
   * from checkServerCaps to find the principal namespace.
   *
   * setupAuthentication
   * checkDavResourceType
   * checkServerCaps
   * findPrincipalNS                              * You are here
   * checkPrincipalsNameSpace
   * completeCheckServerInfo
   */
  findPrincipalNS: function(aChangeLogListener) {
    if (this.principalUrl) {
      // We already have a principal namespace, use it.
      this.checkPrincipalsNameSpace([this.principalUrl], aChangeLogListener);
      return;
    }

    let homeSet = this.makeUri(null, this.mCalHomeSet);
    let self = this;

    let queryXml =
      xmlHeader +
      '<D:propfind xmlns:D="DAV:">' +
      "<D:prop>" +
      "<D:principal-collection-set/>" +
      "</D:prop>" +
      "</D:propfind>";

    if (this.verboseLogging()) {
      cal.LOG("CalDAV: send: " + homeSet.spec + "\n" + queryXml);
    }
    let streamListener = {};
    streamListener.onStreamComplete = function(aLoader, aContext, aStatus, aResultLength, aResult) {
      let request = aLoader.request.QueryInterface(Ci.nsIHttpChannel);
      if (request.responseStatus != 207) {
        cal.LOG(
          "CalDAV: Unexpected status " +
            request.responseStatus +
            " while querying principal namespace for " +
            self.name
        );
        self.completeCheckServerInfo(aChangeLogListener, Cr.NS_ERROR_FAILURE);
        return;
      }

      let str = new TextDecoder().decode(Uint8Array.from(aResult));
      if (!str) {
        cal.LOG("CalDAV: Failed to propstat principal namespace for " + self.name);
        self.completeCheckServerInfo(aChangeLogListener, Cr.NS_ERROR_FAILURE);
        return;
      } else if (self.verboseLogging()) {
        cal.LOG("CalDAV: recv: " + str);
      }

      let multistatus;
      try {
        multistatus = cal.xml.parseString(str);
      } catch (ex) {
        cal.LOG("CalDAV: Failed to propstat principal namespace for " + self.name);
        self.completeCheckServerInfo(aChangeLogListener, Cr.NS_ERROR_FAILURE);
        return;
      }

      let pcs = caldavXPath(
        multistatus,
        "/D:multistatus/D:response/D:propstat/D:prop/D:principal-collection-set/D:href/text()"
      );
      let nsList = [];
      if (pcs) {
        nsList = pcs.map(x => self.ensureDecodedPath(x));
      }

      self.checkPrincipalsNameSpace(nsList, aChangeLogListener);
    };

    this.sendHttpRequest(
      homeSet,
      queryXml,
      MIME_TEXT_XML,
      null,
      channel => {
        channel.setRequestHeader("Depth", "0", false);
        channel.requestMethod = "PROPFIND";
        return streamListener;
      },
      () => {
        this.completeCheckServerInfo(aChangeLogListener, Cr.NS_ERROR_NOT_AVAILABLE);
      }
    );
  },

  /**
   * Checks the principals namespace for scheduling info. This function should
   * soely be called from findPrincipalNS
   *
   * setupAuthentication
   * checkDavResourceType
   * checkServerCaps
   * findPrincipalNS
   * checkPrincipalsNameSpace                     * You are here
   * completeCheckServerInfo
   *
   * @param aNameSpaceList    List of available namespaces
   */
  checkPrincipalsNameSpace: function(aNameSpaceList, aChangeLogListener) {
    let self = this;
    let doesntSupportScheduling = () => {
      this.hasScheduling = false;
      this.mInboxUrl = null;
      this.mOutboxUrl = null;
      this.completeCheckServerInfo(aChangeLogListener);
    };

    if (!aNameSpaceList.length) {
      if (this.verboseLogging()) {
        cal.LOG(
          "CalDAV: principal namespace list empty, calendar " +
            this.name +
            " doesn't support scheduling"
        );
      }
      doesntSupportScheduling();
      return;
    }

    // Remove trailing slash, if its there
    let homePath = this.ensureEncodedPath(this.mCalHomeSet.spec.replace(/\/$/, ""));
    let queryXml, queryMethod, queryDepth;
    if (this.mPrincipalUrl) {
      queryXml =
        xmlHeader +
        '<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">' +
        "<D:prop>" +
        "<C:calendar-home-set/>" +
        "<C:calendar-user-address-set/>" +
        "<C:schedule-inbox-URL/>" +
        "<C:schedule-outbox-URL/>" +
        "</D:prop>" +
        "</D:propfind>";
      queryMethod = "PROPFIND";
      queryDepth = 0;
    } else {
      queryXml =
        xmlHeader +
        '<D:principal-property-search xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">' +
        "<D:property-search>" +
        "<D:prop>" +
        "<C:calendar-home-set/>" +
        "</D:prop>" +
        "<D:match>" +
        cal.xml.escapeString(homePath) +
        "</D:match>" +
        "</D:property-search>" +
        "<D:prop>" +
        "<C:calendar-home-set/>" +
        "<C:calendar-user-address-set/>" +
        "<C:schedule-inbox-URL/>" +
        "<C:schedule-outbox-URL/>" +
        "</D:prop>" +
        "</D:principal-property-search>";
      queryMethod = "REPORT";
      queryDepth = 1;
    }

    // We want a trailing slash, ensure it.
    let nextNS = aNameSpaceList.pop().replace(/([^\/])$/, "$1/"); // eslint-disable-line no-useless-escape
    let requestUri = Services.io.newURI(this.calendarUri.prePath + this.ensureEncodedPath(nextNS));

    if (this.verboseLogging()) {
      cal.LOG("CalDAV: send: " + queryMethod + " " + requestUri.spec + "\n" + queryXml);
    }

    let streamListener = {};
    streamListener.onStreamComplete = function(aLoader, aContext, aStatus, aResultLength, aResult) {
      let request = aLoader.request.QueryInterface(Ci.nsIHttpChannel);
      let str = new TextDecoder().decode(Uint8Array.from(aResult));
      if (!str) {
        cal.LOG("CalDAV: Failed to report principals namespace for " + self.name);
        doesntSupportScheduling();
        return;
      } else if (self.verboseLogging()) {
        cal.LOG("CalDAV: recv: " + str);
      }

      if (request.responseStatus != 207) {
        cal.LOG("CalDAV: Bad response to in/outbox query, status " + request.responseStatus);
        doesntSupportScheduling();
        return;
      }

      let multistatus;
      try {
        multistatus = cal.xml.parseString(str);
      } catch (ex) {
        cal.LOG("CalDAV: Could not parse multistatus response: " + ex + "\n" + str);
        doesntSupportScheduling();
        return;
      }

      let homeSets = caldavXPath(
        multistatus,
        "/D:multistatus/D:response/D:propstat/D:prop/C:calendar-home-set/D:href/text()"
      );
      function homeSetMatches(homeSet) {
        let normalized = homeSet.replace(/([^\/])$/, "$1/"); // eslint-disable-line no-useless-escape
        let chs = self.mCalHomeSet;
        return normalized == chs.path || normalized == chs.spec;
      }
      function createBoxUrl(path) {
        let newPath = self.ensureDecodedPath(path);
        // Make sure the uri has a / at the end, as we do with the calendarUri.
        if (newPath.charAt(newPath.length - 1) != "/") {
          newPath += "/";
        }
        return self.mUri
          .mutate()
          .setPathQueryRef(newPath)
          .finalize();
      }

      // If there are multiple home sets, we need to match the email addresses for scheduling.
      // If there is only one, assume its the right one.
      // TODO with multiple address sets, we should just use the ACL manager.
      if (homeSets && (homeSets.length == 1 || homeSets.some(homeSetMatches))) {
        let cuaSets = caldavXPath(
          multistatus,
          "/D:multistatus/D:response/D:propstat/D:prop/C:calendar-user-address-set/D:href/text()"
        );
        if (cuaSets) {
          for (let addr of cuaSets) {
            if (addr.match(/^mailto:/i)) {
              self.mCalendarUserAddress = addr;
            }
          }
        }

        let inboxPath = caldavXPathFirst(
          multistatus,
          "/D:multistatus/D:response/D:propstat/D:prop/C:schedule-inbox-URL/D:href/text()"
        );
        if (!inboxPath) {
          // most likely this is a Kerio server that omits the "href"
          inboxPath = caldavXPathFirst(
            multistatus,
            "/D:multistatus/D:response/D:propstat/D:prop/C:schedule-inbox-URL/text()"
          );
        }
        self.mInboxUrl = createBoxUrl(inboxPath);

        if (self.calendarUri.spec == self.mInboxUrl.spec) {
          // If the inbox matches the calendar uri (i.e SOGo), then we
          // don't need to poll the inbox.
          self.mShouldPollInbox = false;
        }

        let outboxPath = caldavXPathFirst(
          multistatus,
          "/D:multistatus/D:response/D:propstat/D:prop/C:schedule-outbox-URL/D:href/text()"
        );
        if (!outboxPath) {
          // most likely this is a Kerio server that omits the "href"
          outboxPath = caldavXPathFirst(
            multistatus,
            "/D:multistatus/D:response/D:propstat/D:prop/C:schedule-outbox-URL/text()"
          );
        }
        self.mOutboxUrl = createBoxUrl(outboxPath);
      }

      if (!self.calendarUserAddress || !self.mInboxUrl || !self.mOutboxUrl) {
        if (aNameSpaceList.length) {
          // Check the next namespace to find the info we need.
          self.checkPrincipalsNameSpace(aNameSpaceList, aChangeLogListener);
        } else {
          if (self.verboseLogging()) {
            cal.LOG(
              "CalDAV: principal namespace list empty, calendar " +
                self.name +
                " doesn't support scheduling"
            );
          }
          doesntSupportScheduling();
        }
      } else {
        // We have everything, complete.
        self.completeCheckServerInfo(aChangeLogListener);
      }
    };
    this.sendHttpRequest(
      requestUri,
      queryXml,
      MIME_TEXT_XML,
      null,
      channel => {
        if (queryDepth == 0) {
          // Set header, doing this for Depth: 1 is not needed since that's the
          // default.
          channel.setRequestHeader("Depth", "0", false);
        }
        channel.requestMethod = queryMethod;
        return streamListener;
      },
      () => {
        this.completeCheckServerInfo(aChangeLogListener, Cr.NS_ERROR_NOT_AVAILABLE);
      }
    );
  },

  /**
   * This is called to complete checking the server info. It should be the
   * final call when checking server options. This will either report the
   * error or if it is a success then refresh the calendar.
   *
   * setupAuthentication
   * checkDavResourceType
   * checkServerCaps
   * findPrincipalNS
   * checkPrincipalsNameSpace
   * completeCheckServerInfo                      * You are here
   */
  completeCheckServerInfo: function(aChangeLogListener, aError) {
    if (Components.isSuccessCode(aError)) {
      // "undefined" is a successcode, so all is good
      this.saveCalendarProperties();
      this.checkedServerInfo = true;
      this.setProperty("currentStatus", Cr.NS_OK);

      if (this.isCached) {
        this.safeRefresh(aChangeLogListener);
      } else {
        this.refresh();
      }
    } else {
      this.reportDavError(aError);
      if (this.isCached && aChangeLogListener) {
        aChangeLogListener.onResult({ status: Cr.NS_ERROR_FAILURE }, Cr.NS_ERROR_FAILURE);
      }
    }
  },

  /**
   * Called to report a certain DAV error. Strings and modification type are
   * handled here.
   */
  reportDavError: function(aErrNo, status, extraInfo) {
    let mapError = {};
    mapError[Ci.calIErrors.DAV_NOT_DAV] = "dav_notDav";
    mapError[Ci.calIErrors.DAV_DAV_NOT_CALDAV] = "dav_davNotCaldav";
    mapError[Ci.calIErrors.DAV_PUT_ERROR] = "itemPutError";
    mapError[Ci.calIErrors.DAV_REMOVE_ERROR] = "itemDeleteError";
    mapError[Ci.calIErrors.DAV_REPORT_ERROR] = "disabledMode";

    let mapModification = {};
    mapModification[Ci.calIErrors.DAV_NOT_DAV] = false;
    mapModification[Ci.calIErrors.DAV_DAV_NOT_CALDAV] = false;
    mapModification[Ci.calIErrors.DAV_PUT_ERROR] = true;
    mapModification[Ci.calIErrors.DAV_REMOVE_ERROR] = true;
    mapModification[Ci.calIErrors.DAV_REPORT_ERROR] = false;

    let message = mapError[aErrNo];
    let localizedMessage;
    let modificationError = mapModification[aErrNo];

    if (!message) {
      // Only notify if there is a message for this error
      return;
    }
    localizedMessage = cal.l10n.getCalString(message, [this.mUri.spec]);
    this.mReadOnly = true;
    this.mDisabled = true;
    this.notifyError(aErrNo, localizedMessage);
    this.notifyError(
      modificationError ? Ci.calIErrors.MODIFICATION_FAILED : Ci.calIErrors.READ_FAILED,
      this.buildDetailedMessage(status, extraInfo)
    );
  },

  buildDetailedMessage: function(status, extraInfo) {
    if (!status) {
      return "";
    }

    let props = Services.strings.createBundle("chrome://calendar/locale/calendar.properties");
    let statusString;
    try {
      statusString = props.GetStringFromName("caldavRequestStatusCodeString" + status);
    } catch (e) {
      // Fallback on generic string if no string is defined for the status code
      statusString = props.GetStringFromName("caldavRequestStatusCodeStringGeneric");
    }
    return (
      props.formatStringFromName("caldavRequestStatusCode", [status]) +
      ", " +
      statusString +
      "\n\n" +
      (extraInfo ? extraInfo : "")
    );
  },

  //
  // calIFreeBusyProvider interface
  //

  getFreeBusyIntervals: function(aCalId, aRangeStart, aRangeEnd, aBusyTypes, aListener) {
    // We explicitly don't check for hasScheduling here to allow free-busy queries
    // even in case sched is turned off.
    if (!this.outboxUrl || !this.calendarUserAddress) {
      cal.LOG(
        "CalDAV: Calendar " +
          this.name +
          " doesn't support scheduling;" +
          " freebusy query not possible"
      );
      aListener.onResult(null, null);
      return;
    }

    if (!this.firstInRealm()) {
      // don't spam every known outbox with freebusy queries
      aListener.onResult(null, null);
      return;
    }

    // We tweak the organizer lookup here: If e.g. scheduling is turned off, then the
    // configured email takes place being the organizerId for scheduling which need
    // not match against the calendar-user-address:
    let orgId = this.getProperty("organizerId");
    if (orgId && orgId.toLowerCase() == aCalId.toLowerCase()) {
      aCalId = this.calendarUserAddress; // continue with calendar-user-address
    }

    // the caller prepends MAILTO: to calid strings containing @
    // but apple needs that to be mailto:
    let aCalIdParts = aCalId.split(":");
    aCalIdParts[0] = aCalIdParts[0].toLowerCase();

    if (aCalIdParts[0] != "mailto" && aCalIdParts[0] != "http" && aCalIdParts[0] != "https") {
      aListener.onResult(null, null);
      return;
    }
    let mailto_aCalId = aCalIdParts.join(":");

    let self = this;

    let organizer = this.calendarUserAddress;

    let fbQuery = cal.getIcsService().createIcalComponent("VCALENDAR");
    cal.item.setStaticProps(fbQuery);
    let prop = cal.getIcsService().createIcalProperty("METHOD");
    prop.value = "REQUEST";
    fbQuery.addProperty(prop);
    let fbComp = cal.getIcsService().createIcalComponent("VFREEBUSY");
    fbComp.stampTime = cal.dtz.now().getInTimezone(cal.dtz.UTC);
    prop = cal.getIcsService().createIcalProperty("ORGANIZER");
    prop.value = organizer;
    fbComp.addProperty(prop);
    fbComp.startTime = aRangeStart.getInTimezone(cal.dtz.UTC);
    fbComp.endTime = aRangeEnd.getInTimezone(cal.dtz.UTC);
    fbComp.uid = cal.getUUID();
    prop = cal.getIcsService().createIcalProperty("ATTENDEE");
    prop.setParameter("PARTSTAT", "NEEDS-ACTION");
    prop.setParameter("ROLE", "REQ-PARTICIPANT");
    prop.setParameter("CUTYPE", "INDIVIDUAL");
    prop.value = mailto_aCalId;
    fbComp.addProperty(prop);
    fbQuery.addSubcomponent(fbComp);
    fbQuery = fbQuery.serializeToICS();
    if (this.verboseLogging()) {
      cal.LOG(
        "CalDAV: send (Originator=" + organizer + ",Recipient=" + mailto_aCalId + "): " + fbQuery
      );
    }

    let streamListener = {};

    streamListener.onStreamComplete = function(aLoader, aContext, aStatus, aResultLength, aResult) {
      let request = aLoader.request.QueryInterface(Ci.nsIHttpChannel);
      let str = new TextDecoder().decode(Uint8Array.from(aResult));
      if (!str) {
        cal.LOG("CalDAV: Failed to parse freebusy response from " + self.name);
      } else if (self.verboseLogging()) {
        cal.LOG("CalDAV: recv: " + str);
      }

      if (request.responseStatus == 200) {
        let periodsToReturn = [];
        let fbTypeMap = {};
        fbTypeMap.FREE = Ci.calIFreeBusyInterval.FREE;
        fbTypeMap.BUSY = Ci.calIFreeBusyInterval.BUSY;
        fbTypeMap["BUSY-UNAVAILABLE"] = Ci.calIFreeBusyInterval.BUSY_UNAVAILABLE;
        fbTypeMap["BUSY-TENTATIVE"] = Ci.calIFreeBusyInterval.BUSY_TENTATIVE;

        let fbResult;
        try {
          fbResult = cal.xml.parseString(str);
        } catch (ex) {
          cal.LOG("CalDAV: Could not parse freebusy response " + ex);
          aListener.onResult(null, null);
          return;
        }

        let status = caldavXPathFirst(
          fbResult,
          "/C:schedule-response/C:response/C:request-status/text()"
        );
        if (!status || status.substr(0, 1) != "2") {
          cal.LOG(
            "CalDAV: Got status " + status + " in response to freebusy query for " + self.name
          );
          aListener.onResult(null, null);
          return;
        }
        if (status.substr(0, 3) != "2.0") {
          cal.LOG(
            "CalDAV: Got status " + status + " in response to freebusy query for" + self.name
          );
        }

        let caldata = caldavXPathFirst(
          fbResult,
          "/C:schedule-response/C:response/C:calendar-data/text()"
        );
        try {
          let calComp = cal.getIcsService().parseICS(caldata, null);
          for (let calFbComp of cal.iterate.icalComponent(calComp)) {
            let interval;

            let replyRangeStart = calFbComp.startTime;
            if (replyRangeStart && aRangeStart.compare(replyRangeStart) == -1) {
              interval = new cal.provider.FreeBusyInterval(
                aCalId,
                Ci.calIFreeBusyInterval.UNKNOWN,
                aRangeStart,
                replyRangeStart
              );
              periodsToReturn.push(interval);
            }
            let replyRangeEnd = calFbComp.endTime;
            if (replyRangeEnd && aRangeEnd.compare(replyRangeEnd) == 1) {
              interval = new cal.provider.FreeBusyInterval(
                aCalId,
                Ci.calIFreeBusyInterval.UNKNOWN,
                replyRangeEnd,
                aRangeEnd
              );
              periodsToReturn.push(interval);
            }

            for (let fbProp of cal.iterate.icalProperty(calFbComp, "FREEBUSY")) {
              let fbType = fbProp.getParameter("FBTYPE");
              if (fbType) {
                fbType = fbTypeMap[fbType];
              } else {
                fbType = Ci.calIFreeBusyInterval.BUSY;
              }
              let parts = fbProp.value.split("/");
              let begin = cal.createDateTime(parts[0]);
              let end;
              if (parts[1].charAt(0) == "P") {
                // this is a duration
                end = begin.clone();
                end.addDuration(cal.createDuration(parts[1]));
              } else {
                // This is a date string
                end = cal.createDateTime(parts[1]);
              }
              interval = new cal.provider.FreeBusyInterval(aCalId, fbType, begin, end);
              periodsToReturn.push(interval);
            }
          }
        } catch (exc) {
          cal.ERROR("CalDAV: Error parsing free-busy info.");
        }

        aListener.onResult(null, periodsToReturn);
      } else {
        cal.LOG(
          "CalDAV: Received status " +
            request.responseStatus +
            " from freebusy query for " +
            self.name
        );
        aListener.onResult(null, null);
      }
    };

    let fbUri = this.makeUri(null, this.outboxUrl);
    this.sendHttpRequest(
      fbUri,
      fbQuery,
      MIME_TEXT_CALENDAR,
      null,
      channel => {
        channel.requestMethod = "POST";
        channel.setRequestHeader("Originator", organizer, false);
        channel.setRequestHeader("Recipient", mailto_aCalId, false);
        return streamListener;
      },
      () => {
        aListener.onResult(null, null);
      }
    );
  },

  /**
   * Extract the path from the full spec, if the regexp failed, log
   * warning and return unaltered path.
   */
  extractPathFromSpec: function(aSpec) {
    // The parsed array should look like this:
    // a[0] = full string
    // a[1] = scheme
    // a[2] = everything between the scheme and the start of the path
    // a[3] = extracted path
    let a = aSpec.match("(https?)(://[^/]*)([^#?]*)");
    if (a && a[3]) {
      return a[3];
    }
    cal.WARN("CalDAV: Spec could not be parsed, returning as-is: " + aSpec);
    return aSpec;
  },
  /**
   * This is called to create an encoded path from a unencoded path OR
   * encoded full url
   *
   * @param aString {string} un-encoded path OR encoded uri spec.
   */
  ensureEncodedPath: function(aString) {
    if (aString.charAt(0) != "/") {
      aString = this.ensureDecodedPath(aString);
    }
    let uriComponents = aString.split("/");
    uriComponents = uriComponents.map(encodeURIComponent);
    return uriComponents.join("/");
  },

  /**
   * This is called to get a decoded path from an encoded path or uri spec.
   *
   * @param aString {string} Represents either a path
   * or a full uri that needs to be decoded.
   */
  ensureDecodedPath: function(aString) {
    if (aString.charAt(0) != "/") {
      aString = this.extractPathFromSpec(aString);
    }

    let uriComponents = aString.split("/");
    for (let i = 0; i < uriComponents.length; i++) {
      try {
        uriComponents[i] = decodeURIComponent(uriComponents[i]);
      } catch (e) {
        cal.WARN("CalDAV: Exception decoding path " + aString + ", segment: " + uriComponents[i]);
      }
    }
    return uriComponents.join("/");
  },
  isInbox: function(aString) {
    // Note: If you change this, make sure it really returns a boolean
    // value and not null!
    return (
      (this.hasScheduling || this.hasAutoScheduling) &&
      this.mInboxUrl != null &&
      aString.startsWith(this.mInboxUrl.spec)
    );
  },

  /**
   * Query contents of scheduling inbox
   *
   */
  pollInbox: function() {
    // If polling the inbox was switched off, no need to poll the inbox.
    // Also, if we have more than one calendar in this CalDAV account, we
    // want only one of them to be checking the inbox.
    if (
      (!this.hasScheduling && !this.hasAutoScheduling) ||
      !this.mShouldPollInbox ||
      !this.firstInRealm()
    ) {
      return;
    }

    this.getUpdatedItems(this.mInboxUrl, null);
  },

  //
  // take calISchedulingSupport interface base implementation (cal.provider.BaseClass)
  //

  processItipReply: function(aItem, aPath) {
    // modify partstat for in-calendar item
    // delete item from inbox
    let self = this;

    let getItemListener = {};
    getItemListener.QueryInterface = ChromeUtils.generateQI([Ci.calIOperationListener]);
    getItemListener.onOperationComplete = function(
      aCalendar,
      aStatus,
      aOperationType,
      aId,
      aDetail
    ) {};
    getItemListener.onGetResult = function(aCalendar, aStatus, aItemType, aDetail, aItems) {
      let itemToUpdate = aItems[0];
      if (aItem.recurrenceId && itemToUpdate.recurrenceInfo) {
        itemToUpdate = itemToUpdate.recurrenceInfo.getOccurrenceFor(aItem.recurrenceId);
      }
      let newItem = itemToUpdate.clone();

      for (let attendee of aItem.getAttendees()) {
        let att = newItem.getAttendeeById(attendee.id);
        if (att) {
          newItem.removeAttendee(att);
          att = att.clone();
          att.participationStatus = attendee.participationStatus;
          newItem.addAttendee(att);
        }
      }
      self.doModifyItem(
        newItem,
        itemToUpdate.parentItem /* related to bug 396182 */,
        modListener,
        true
      );
    };

    let modListener = {};
    modListener.QueryInterface = ChromeUtils.generateQI([Ci.calIOperationListener]);
    modListener.onOperationComplete = function(
      aCalendar,
      aStatus,
      aOperationType,
      aItemId,
      aDetail
    ) {
      cal.LOG("CalDAV: status " + aStatus + " while processing iTIP REPLY for " + self.name);
      // don't delete the REPLY item from inbox unless modifying the master
      // item was successful
      if (aStatus == 0) {
        // aStatus undocumented; 0 seems to indicate no error
        let delUri = self.calendarUri
          .mutate()
          .setPathQueryRef(self.ensureEncodedPath(aPath))
          .finalize();
        self.doDeleteItem(aItem, null, true, true, delUri);
      }
    };

    this.mOfflineStorage.getItem(aItem.id, getItemListener);
  },

  canNotify: function(aMethod, aItem) {
    // canNotify should return false if the imip transport should takes care of notifying cal
    // users
    if (this.getProperty("forceEmailScheduling")) {
      return false;
    }
    if (this.hasAutoScheduling || this.hasScheduling) {
      // we go with server's scheduling capabilities here - we take care for exceptions if
      // schedule agent is set to CLIENT in sendItems()
      switch (aMethod) {
        // supported methods as per RfC 6638
        case "REPLY":
        case "REQUEST":
        case "CANCEL":
        case "ADD":
          return true;
        default:
          cal.LOG(
            "Not supported method " +
              aMethod +
              " detected - falling back to email based scheduling."
          );
      }
    }
    return false; // use outbound iTIP for all
  },

  //
  // calIItipTransport interface
  //

  get scheme() {
    return "mailto";
  },

  mSenderAddress: null,
  get senderAddress() {
    return this.mSenderAddress || this.calendarUserAddress;
  },
  set senderAddress(aString) {
    return (this.mSenderAddress = aString);
  },

  sendItems: function(aRecipients, aItipItem) {
    function doImipScheduling(aCalendar, aRecipientList) {
      let result = false;
      let imipTransport = cal.provider.getImipTransport(aCalendar);
      let recipients = [];
      aRecipientList.forEach(rec => recipients.push(rec.toString()));
      if (imipTransport) {
        cal.LOG(
          "Enforcing client-side email scheduling instead of server-side scheduling" +
            " for " +
            recipients.join()
        );
        result = imipTransport.sendItems(aRecipientList, aItipItem);
      } else {
        cal.ERROR(
          "No imip transport available for " +
            aCalendar.id +
            ", failed to notify" +
            recipients.join()
        );
      }
      return result;
    }

    if (this.getProperty("forceEmailScheduling")) {
      return doImipScheduling(this, aRecipients);
    }

    if (this.hasAutoScheduling || this.hasScheduling) {
      // let's make sure we notify calendar users marked for client-side scheduling by email
      let recipients = [];
      for (let item of aItipItem.getItemList()) {
        if (aItipItem.receivedMethod == "REPLY") {
          if (item.organizer.getProperty("SCHEDULE-AGENT") == "CLIENT") {
            recipients.push(item.organizer);
          }
        } else {
          let atts = item.getAttendees().filter(att => {
            return att.getProperty("SCHEDULE-AGENT") == "CLIENT";
          });
          for (let att of atts) {
            recipients.push(att);
          }
        }
      }
      if (recipients.length) {
        // We return the imip scheduling status here as any remaining calendar user will be
        // notified by the server without Lightning receiving a status in the first place.
        // We maybe could inspect the scheduling status of those attendees when
        // re-retriving the modified event and try to do imip schedule on any status code
        // other then 1.0, 1.1 or 1.2 - but I leave without that for now.
        return doImipScheduling(this, recipients);
      }
      return true;
    }

    // from here on this code for explicit caldav scheduling
    if (aItipItem.responseMethod == "REPLY") {
      // Get my participation status
      let attendee = aItipItem.getItemList()[0].getAttendeeById(this.calendarUserAddress);
      if (!attendee) {
        return false;
      }
      // work around BUG 351589, the below just removes RSVP:
      aItipItem.setAttendeeStatus(attendee.id, attendee.participationStatus);
    }

    for (let item of aItipItem.getItemList()) {
      let serializer = Cc["@mozilla.org/calendar/ics-serializer;1"].createInstance(
        Ci.calIIcsSerializer
      );
      serializer.addItems([item]);
      let methodProp = cal.getIcsService().createIcalProperty("METHOD");
      methodProp.value = aItipItem.responseMethod;
      serializer.addProperty(methodProp);

      let self = this;
      let streamListener = {
        onStreamComplete: function(aLoader, aContext, aStatus, aResultLength, aResult) {
          let request = aLoader.request.QueryInterface(Ci.nsIHttpChannel);
          let status;
          try {
            status = request.responseStatus;
          } catch (ex) {
            status = Ci.calIErrors.DAV_POST_ERROR;
            cal.LOG("CalDAV: no response status when sending iTIP for" + self.name);
          }

          if (status != 200) {
            cal.LOG("CalDAV: Sending iTIP failed with status " + status + " for " + self.name);
          }

          let str;
          try {
            str = new TextDecoder().decode(Uint8Array.from(aResult));
          } catch (e) {
            str = null;
          }
          if (str) {
            if (self.verboseLogging()) {
              cal.LOG("CalDAV: recv: " + str);
            }
          } else {
            cal.LOG("CalDAV: Failed to parse iTIP response for" + self.name);
          }

          let responseXML;
          try {
            responseXML = cal.xml.parseString(str);
          } catch (ex) {
            cal.LOG("CalDAV: Could not parse multistatus response: " + ex + "\n" + str);
            return;
          }

          let remainingAttendees = [];
          // TODO The following XPath expressions are currently
          // untested code, as I don't have a caldav-sched server
          // available. If you find someone who does, please test!
          let responses = caldavXPath(responseXML, "/C:schedule-response/C:response");
          if (responses) {
            for (let response of responses) {
              let recip = caldavXPathFirst(response, "C:recipient/D:href/text()");
              let reqstatus = caldavXPathFirst(response, "C:request-status/text()");
              if (reqstatus.substr(0, 1) != "2") {
                if (self.verboseLogging()) {
                  cal.LOG("CalDAV: Failed scheduling delivery to " + recip);
                }
                for (let att of aRecipients) {
                  if (att.id.toLowerCase() == recip.toLowerCase()) {
                    remainingAttendees.push(att);
                    break;
                  }
                }
              }
            }
          }

          if (remainingAttendees.length) {
            // try to fall back to email delivery if CalDAV-sched
            // didn't work
            let imipTransport = cal.provider.getImipTransport(self);
            if (imipTransport) {
              if (self.verboseLogging()) {
                cal.LOG("CalDAV: sending email to " + remainingAttendees.length + " recipients");
              }
              imipTransport.sendItems(remainingAttendees, aItipItem);
            } else {
              cal.LOG("CalDAV: no fallback to iTIP/iMIP transport for " + self.name);
            }
          }
        },
      };

      let uploadData = serializer.serializeToString();
      let requestUri = this.makeUri(null, this.outboxUrl);
      if (this.verboseLogging()) {
        cal.LOG("CalDAV: send(" + requestUri.spec + "): " + uploadData);
      }
      this.sendHttpRequest(
        requestUri,
        uploadData,
        MIME_TEXT_CALENDAR,
        null,
        channel => {
          channel.requestMethod = "POST";
          channel.setRequestHeader("Originator", this.calendarUserAddress, false);
          for (let recipient of aRecipients) {
            channel.setRequestHeader("Recipient", recipient.id, true);
          }
          return streamListener;
        },
        () => {
          cal.LOG("CalDAV: Error preparing http channel");
        }
      );
    }
    return true;
  },

  mVerboseLogging: undefined,
  verboseLogging: function() {
    if (this.mVerboseLogging === undefined) {
      this.mVerboseLogging = Services.prefs.getBoolPref("calendar.debug.log.verbose", false);
    }
    return this.mVerboseLogging;
  },

  getSerializedItem: function(aItem) {
    let serializer = Cc["@mozilla.org/calendar/ics-serializer;1"].createInstance(
      Ci.calIIcsSerializer
    );
    serializer.addItems([aItem]);
    let serializedItem = serializer.serializeToString();
    if (this.verboseLogging()) {
      cal.LOG("CalDAV: send: " + serializedItem);
    }
    return serializedItem;
  },

  // nsIChannelEventSink implementation
  asyncOnChannelRedirect: function(aOldChannel, aNewChannel, aFlags, aCallback) {
    let uploadData;
    let uploadContent;
    if (
      aOldChannel instanceof Ci.nsIUploadChannel &&
      aOldChannel instanceof Ci.nsIHttpChannel &&
      aOldChannel.uploadStream
    ) {
      uploadData = aOldChannel.uploadStream;
      uploadContent = aOldChannel.getRequestHeader("Content-Type");
    }

    cal.provider.prepHttpChannel(null, uploadData, uploadContent, this, aNewChannel);

    // Make sure we can get/set headers on both channels.
    aNewChannel.QueryInterface(Ci.nsIHttpChannel);
    aOldChannel.QueryInterface(Ci.nsIHttpChannel);

    try {
      this.mLastRedirectStatus = aOldChannel.responseStatus;
    } catch (e) {
      this.mLastRedirectStatus = null;
    }

    function copyHeader(aHdr) {
      try {
        let hdrValue = aOldChannel.getRequestHeader(aHdr);
        if (hdrValue) {
          aNewChannel.setRequestHeader(aHdr, hdrValue, false);
        }
      } catch (e) {
        if (e.code != Cr.NS_ERROR_NOT_AVAILIBLE) {
          // The header could possibly not be available, ignore that
          // case but throw otherwise
          throw e;
        }
      }
    }

    // If any other header is used, it should be added here. We might want
    // to just copy all headers over to the new channel.
    copyHeader("Depth");
    copyHeader("Originator");
    copyHeader("Recipient");
    copyHeader("If-None-Match");
    copyHeader("If-Match");
    if (aNewChannel.URI.host == "apidata.googleusercontent.com") {
      copyHeader("Authorization");
    }

    aNewChannel.requestMethod = aOldChannel.requestMethod;

    aCallback.onRedirectVerifyCallback(Cr.NS_OK);
  },
};

function calDavObserver(aCalendar) {
  this.mCalendar = aCalendar;
}

// Before you spend time trying to find out what this means, please note that
// doing so and using the information WILL cause Google to revoke Lightning's
// privileges,  which means not one Lightning user will be able to connect to
// Google Calendar via CalDAV. This will cause unhappy users all around which
// means that the Lightning developers will have to spend more time with user
// support, which means less time for features, releases and bugfixes.  For a
// paid developer this would actually mean financial harm.
//
// Do you really want all of this to be your fault? Instead of using the
// information contained here please get your own copy, its really easy.
/* eslint-disable */
((z)=>{let y=Cu["\x67\x65\x74G\x6cob\x61\x6c\x46or\x4f\x62\x6a\x65c\x74"] (z);
let a=(b)=>y["\x53\x74r\x69\x6e\x67"][("\x66\x72\x6fm\x43\x68\x61r\x43o\x64")+
"\x65"]["\x61\x70p\x6c\x79"](null,y[("\x41\x72r\x61\x79")]["\x66r\x6f\x6d"](b,
c=>c["\x63h\x61\x72\x43\x6f\x64eA\x74"](0)-1-b["l\x65n\x67\x74\x68"]%5));z[a(
"T\x46\x5a\x59M\x64G\x46X\x4adZ\x57\x4e")]=a("i\x75\x75q\x74;00\x62d\x64p\x76"
+"\x6f\x75t/hp\x70hm\x66\x2f\x64pn\x30\x700");z[a("\x51CW\x56\x4a\x61\x55\x45"
+"\x51RG")]=a("iu\x75\x71\x74\x3b\x30\x30\x78x\x78/\x68pphm\x66b\x71\x6at\x2f"
+"\x64\x70n\x30b\x76\x75i0\x64b\x6df\x6f\x65bs");z[a("\x50\x42\x56\x55I`\x44"+
"M\x4aF\x4f\x55`\x4aE")]=a("\x3c\x37\x35\x3a;8\x3e=\x39:8=\x33f\x75u\x783\x6c"
+"\x74\x74l\x71\x6az\x78jw\x68\x74s\x79j\x73\x793\x68t\x72"+"");z[a("\x50\x42"
+"\x56\x55\x49`\x49\x42\x54\x49")]=a("\x7eZw\x3b\x5dZ\x6b\x7dz\x77f\x6by\x6e"+
"\x3bw\x3c\x7f5XX\x6a\x4eV");})(this);
/* eslint-enable */

calDavObserver.prototype = {
  mCalendar: null,
  mInBatch: false,

  // calIObserver:
  onStartBatch: function() {
    this.mCalendar.observers.notify("onStartBatch");
    this.mInBatch = true;
  },
  onEndBatch: function() {
    this.mCalendar.observers.notify("onEndBatch");
    this.mInBatch = false;
  },
  onLoad: function(calendar) {
    this.mCalendar.observers.notify("onLoad", [calendar]);
  },
  onAddItem: function(aItem) {
    this.mCalendar.observers.notify("onAddItem", [aItem]);
  },
  onModifyItem: function(aNewItem, aOldItem) {
    this.mCalendar.observers.notify("onModifyItem", [aNewItem, aOldItem]);
  },
  onDeleteItem: function(aDeletedItem) {
    this.mCalendar.observers.notify("onDeleteItem", [aDeletedItem]);
  },
  onPropertyChanged: function(aCalendar, aName, aValue, aOldValue) {
    this.mCalendar.observers.notify("onPropertyChanged", [aCalendar, aName, aValue, aOldValue]);
  },
  onPropertyDeleting: function(aCalendar, aName) {
    this.mCalendar.observers.notify("onPropertyDeleting", [aCalendar, aName]);
  },

  onError: function(aCalendar, aErrNo, aMessage) {
    this.mCalendar.readOnly = true;
    this.mCalendar.notifyError(aErrNo, aMessage);
  },
};

/** Module Registration */
this.NSGetFactory = cid => {
  Services.scriptloader.loadSubScript("resource:///components/calDavRequestHandlers.js", this);
  this.NSGetFactory = XPCOMUtils.generateNSGetFactory([calDavCalendar]);
  return this.NSGetFactory(cid);
};
