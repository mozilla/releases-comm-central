/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";

import {
  CalDavGenericRequest,
  CalDavLegacySAXRequest,
  CalDavItemRequest,
  CalDavDeleteItemRequest,
  CalDavPropfindRequest,
  CalDavHeaderRequest,
  CalDavPrincipalPropertySearchRequest,
  CalDavOutboxRequest,
  CalDavFreeBusyRequest,
} from "resource:///modules/caldav/CalDavRequest.sys.mjs";

import {
  CalDavEtagsHandler,
  CalDavWebDavSyncHandler,
  CalDavMultigetSyncHandler,
} from "resource:///modules/caldav/CalDavRequestHandlers.sys.mjs";
import { CalDavSession } from "resource:///modules/caldav/CalDavSession.sys.mjs";
import { CalReadableStreamFactory } from "resource:///modules/CalReadableStreamFactory.sys.mjs";

var XML_HEADER = '<?xml version="1.0" encoding="UTF-8"?>\n';
var MIME_TEXT_XML = "text/xml; charset=utf-8";
var FORBIDDEN_PATH_CHARACTERS = /[^a-zA-Z0-9_\-\.]/g;

var cIOL = Ci.calIOperationListener;
const lazy = {};
ChromeUtils.defineLazyGetter(lazy, "l10n", () => new Localization(["calendar/calendar.ftl"], true));
export function CalDavCalendar() {
  this.initProviderBase();
  this.unmappedProperties = [];
  this.mUriParams = null;
  this.mItemInfoCache = {};
  this.mDisabledByDavError = false;
  this.mCalHomeSet = null;
  this.mInboxUrl = null;
  this.mOutboxUrl = null;
  this.mCalendarUserAddress = null;
  this.mCheckedServerInfo = null;
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

// used for etag checking
var CALDAV_MODIFY_ITEM = "modify";
var CALDAV_DELETE_ITEM = "delete";

var calDavCalendarClassID = Components.ID("{a35fc6ea-3d92-11d9-89f9-00045ace3b8d}");
var calDavCalendarInterfaces = [
  "calICalDavCalendar",
  "calICalendar",
  "calIChangeLog",
  "calIFreeBusyProvider",
  "calIItipTransport",
  "calISchedulingSupport",
  "nsIInterfaceRequestor",
];
CalDavCalendar.prototype = {
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

  ensureTargetCalendar() {
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

  get id() {
    return this.mID;
  },
  set id(val) {
    const setter = this.__proto__.__proto__.__lookupSetter__("id");
    val = setter.call(this, val);

    if (this.id) {
      // Recreate the session ID that was used when discovering this calendar,
      // as the password is stored with it. This only matters for OAuth
      // calendars, in all other cases the password is stored by username.
      this.session = new CalDavSession(
        this.getProperty("username") || this.getProperty("sessionId") || this.id,
        this.getProperty("username")
      );
    }
  },

  // calIChangeLog interface
  get offlineStorage() {
    return this.mOfflineStorage;
  },

  set offlineStorage(storage) {
    this.mOfflineStorage = storage;
    this.fetchCachedMetaData();
  },

  resetLog() {
    if (this.isCached && this.mOfflineStorage) {
      this.mOfflineStorage.startBatch();
      try {
        for (const itemId in this.mItemInfoCache) {
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
    }
    return this.mCheckedServerInfo;
  },

  set checkedServerInfo(val) {
    this.mCheckedServerInfo = val;
  },

  saveCalendarProperties() {
    const properties = {};
    for (const property of this.offlineCachedProperties) {
      if (this[property] !== undefined) {
        properties[property] = this[property];
      }
    }
    this.mOfflineStorage.setMetaData("calendar-properties", JSON.stringify(properties));
  },
  restoreCalendarProperties(data) {
    const properties = JSON.parse(data);
    for (const property of this.offlineCachedProperties) {
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
  replayChangesOn(aChangeLogListener) {
    if (this.checkedServerInfo) {
      this.safeRefresh(aChangeLogListener);
    } else {
      // If we haven't refreshed yet, then we should check the resource
      // type first. This will call refresh() again afterwards.
      this.checkDavResourceType(aChangeLogListener);
    }
  },
  setMetaData(id, path, etag, isInboxItem) {
    if (this.mOfflineStorage.setMetaData) {
      if (id) {
        const dataString = [etag, path, isInboxItem ? "true" : "false"].join("\u001A");
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
  async ensureMetaData() {
    let refreshNeeded = false;

    for await (const items of cal.iterate.streamValues(
      this.mOfflineStorage.wrappedJSObject.getItems(
        Ci.calICalendar.ITEM_FILTER_ALL_ITEMS,
        0,
        null,
        null
      )
    )) {
      for (const item of items) {
        if (!(item.id in this.mItemInfoCache)) {
          const path = this.getItemLocationPath(item);
          cal.LOG("Adding meta-data for cached item " + item.id);
          this.mItemInfoCache[item.id] = {
            etag: null,
            isNew: false,
            locationPath: path,
            isInboxItem: false,
          };
          this.mHrefIndex[this.mLocationPath + path] = item.id;
          refreshNeeded = true;
        }
      }
    }

    if (refreshNeeded) {
      // resetting the cached ctag forces an item refresh when
      // safeRefresh is called later
      this.mCtag = null;
      this.mProposedCtag = null;
    }
  },

  fetchCachedMetaData() {
    cal.LOG("CalDAV: Retrieving server info from cache for " + this.name);
    const cacheIds = this.mOfflineStorage.getAllMetaDataIds();
    const cacheValues = this.mOfflineStorage.getAllMetaDataValues();

    for (let count = 0; count < cacheIds.length; count++) {
      const itemId = cacheIds[count];
      const itemData = cacheValues[count];
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
          cal.freeBusyService.addProvider(this);
        }
      } else {
        const itemDataArray = itemData.split("\u001A");
        const etag = itemDataArray[0];
        const resourcePath = itemDataArray[1];
        const isInboxItem = itemDataArray[2];
        if (itemDataArray.length == 3) {
          this.mHrefIndex[resourcePath] = itemId;
          const locationPath = resourcePath.substr(this.mLocationPath.length);
          const item = {
            etag,
            isNew: false,
            locationPath,
            isInboxItem: isInboxItem == "true",
          };
          this.mItemInfoCache[itemId] = item;
        }
      }
    }

    this.ensureMetaData();
  },

  //
  // calICalendar interface
  //

  // readonly attribute AUTF8String type;
  get type() {
    return "caldav";
  },

  mDisabledByDavError: true,

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
  },

  get calendarUri() {
    let calSpec = this.mUri.spec;
    const parts = calSpec.split("?");
    if (parts.length > 1) {
      calSpec = parts.shift();
      this.mUriParams = "?" + parts.join("?");
    }
    if (!calSpec.endsWith("/")) {
      calSpec += "/";
    }
    return Services.io.newURI(calSpec);
  },

  setCalHomeSet(removeLastPathSegment) {
    if (removeLastPathSegment) {
      const split1 = this.mUri.spec.split("?");
      let baseUrl = split1[0];
      if (baseUrl.charAt(baseUrl.length - 1) == "/") {
        baseUrl = baseUrl.substring(0, baseUrl.length - 2);
      }
      const split2 = baseUrl.split("/");
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
    this.mHaveScheduling =
      Services.prefs.getBoolPref("calendar.caldav.sched.enabled", false) && value;
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
   * @param {string} aInsertString - String to append to the base uri, for example,
   *                                 when creating an event this would be the
   *                                 event file name (event.ics). If null, an empty
   *                                 string is used.
   * @param {nsIURI} aBaseUri - Base uri, if null, this.calendarUri will be used.
   */
  makeUri(aInsertString, aBaseUri) {
    const baseUri = aBaseUri || this.calendarUri;
    // Build a string containing the full path, decoded, so it looks like
    // this:
    // /some path/insert string.ics
    const decodedPath = this.ensureDecodedPath(baseUri.pathQueryRef + (aInsertString || ""));

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

  getItemLocationPath(aItem) {
    if (aItem.id && aItem.id in this.mItemInfoCache && this.mItemInfoCache[aItem.id].locationPath) {
      // modifying items use the cached location path
      return this.mItemInfoCache[aItem.id].locationPath;
    }
    // New items just use id.ics
    return aItem.id.replaceAll(FORBIDDEN_PATH_CHARACTERS, "_") + ".ics";
  },

  getProperty(aName) {
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

  promptOverwrite(aMethod, aItem, aListener, aOldItem) {
    const overwrite = cal.provider.promptOverwrite(aMethod, aItem, aListener, aOldItem);
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

  get supportsScheduling() {
    return true;
  },

  getSchedulingSupport() {
    return this;
  },

  /**
   * addItem()
   * we actually use doAdoptItem()
   *
   * @param aItem       item to add
   */
  async addItem(aItem) {
    return this.adoptItem(aItem);
  },

  // Used to allow the cachedCalendar provider to hook into adoptItem() before
  // it returns.
  _cachedAdoptItemCallback: null,

  /**
   * adoptItem()
   * we actually use doAdoptItem()
   *
   * @param aItem       item to check
   */
  async adoptItem(aItem) {
    const adoptCallback = this._cachedAdoptItemCallback;
    return new Promise((resolve, reject) => {
      this.doAdoptItem(aItem.clone(), {
        get wrappedJSObject() {
          return this;
        },
        async onOperationComplete(calendar, status, opType, id, detail) {
          if (adoptCallback) {
            await adoptCallback(calendar, status, opType, id, detail);
          }
          return Components.isSuccessCode(status) ? resolve(detail) : reject(detail);
        },
      });
    });
  },

  /**
   * Performs the actual addition of the item to CalDAV store
   *
   * @param aItem       item to add
   * @param aListener   listener for method completion
   * @param aIgnoreEtag flag to indicate ignoring of Etag
   */
  doAdoptItem(aItem, aListener, aIgnoreEtag) {
    const notifyListener = (status, detail, pure = false) => {
      const method = pure ? "notifyPureOperationComplete" : "notifyOperationComplete";
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

    const parentItem = aItem.parentItem;
    parentItem.calendar = this.superCalendar;

    const locationPath = this.getItemLocationPath(parentItem);
    const itemUri = this.makeUri(locationPath);
    cal.LOG("CalDAV: itemUri.spec = " + itemUri.spec);

    const serializedItem = this.getSerializedItem(aItem);

    const sendEtag = aIgnoreEtag ? null : "*";
    const request = new CalDavItemRequest(this.session, this, itemUri, aItem, sendEtag);

    request.commit().then(
      response => {
        let status = Cr.NS_OK;
        let detail = parentItem;

        // Translate the HTTP status code to a status and message for the listener
        if (response.ok) {
          cal.LOG(`CalDAV: Item added to ${this.name} successfully`);

          const uriComponentParts = this.makeUri()
            .pathQueryRef.replace(/\/{2,}/g, "/")
            .split("/").length;
          const targetParts = response.uri.pathQueryRef.split("/");
          targetParts.splice(0, uriComponentParts - 1);

          this.mItemInfoCache[parentItem.id] = { locationPath: targetParts.join("/") };
          // TODO: onOpComplete adds the item to the cache, probably after getUpdatedItem!

          // Some CalDAV servers will modify items on PUT (add X-props,
          // for instance) so we'd best re-fetch in order to know
          // the current state of the item
          // Observers will be notified in getUpdatedItem()
          this.getUpdatedItem(parentItem, aListener);
          return;
        } else if (response.serverError) {
          status = Cr.NS_ERROR_NOT_AVAILABLE;
          detail = "Server Replied with " + response.status;
        } else if (response.status) {
          // There is a response status, but we haven't handled it yet. Any
          // error occurring here should consider being handled!
          cal.ERROR(
            "CalDAV: Unexpected status adding item to " +
              this.name +
              ": " +
              response.status +
              "\n" +
              serializedItem
          );

          status = Cr.NS_ERROR_FAILURE;
          detail = "Server Replied with " + response.status;
        }

        // Still need to visually notify for uncached calendars.
        if (!this.isCached && !Components.isSuccessCode(status)) {
          this.reportDavError(Ci.calIErrors.DAV_PUT_ERROR, status, detail);
        }

        // Finally, notify listener.
        notifyListener(status, detail, true);
      },
      e => {
        notifyListener(Cr.NS_ERROR_NOT_AVAILABLE, "Error preparing http channel: " + e);
      }
    );
  },

  // Used to allow the cachedCalendar provider to hook into modifyItem() before
  // it returns.
  _cachedModifyItemCallback: null,

  /**
   * modifyItem(); required by calICalendar.idl
   * we actually use doModifyItem()
   *
   * @param aItem       item to check
   */
  async modifyItem(aNewItem, aOldItem) {
    const modifyCallback = this._cachedModifyItemCallback;
    return new Promise((resolve, reject) => {
      this.doModifyItem(
        aNewItem,
        aOldItem,
        {
          get wrappedJSObject() {
            return this;
          },
          async onOperationComplete(calendar, status, opType, id, detail) {
            if (modifyCallback) {
              await modifyCallback(calendar, status, opType, id, detail);
            }
            return Components.isSuccessCode(status) ? resolve(detail) : reject(detail);
          },
        },
        false
      );
    });
  },

  /**
   * Modifies existing item in CalDAV store.
   *
   * @param aItem       item to check
   * @param aOldItem    previous version of item to be modified
   * @param aListener   listener from original request
   * @param aIgnoreEtag ignore item etag
   */
  doModifyItem(aNewItem, aOldItem, aListener, aIgnoreEtag) {
    const notifyListener = (status, detail, pure = false) => {
      const method = pure ? "notifyPureOperationComplete" : "notifyOperationComplete";
      this[method](aListener, status, cIOL.MODIFY, aNewItem.id, detail);
    };
    if (aNewItem.id == null) {
      notifyListener(Cr.NS_ERROR_FAILURE, "ID for modifyItem doesn't exist or is null");
      return;
    }

    const wasInboxItem = this.mItemInfoCache[aNewItem.id].isInboxItem;

    const newItem_ = aNewItem;
    aNewItem = aNewItem.parentItem.clone();
    if (newItem_.parentItem != newItem_) {
      aNewItem.recurrenceInfo.modifyException(newItem_, false);
    }
    aNewItem.generation += 1;

    const eventUri = this.makeUri(this.mItemInfoCache[aNewItem.id].locationPath);
    const modifiedItemICS = this.getSerializedItem(aNewItem);

    const sendEtag = aIgnoreEtag ? null : this.mItemInfoCache[aNewItem.id].etag;
    const request = new CalDavItemRequest(this.session, this, eventUri, aNewItem, sendEtag);

    request.commit().then(
      response => {
        let status = Cr.NS_OK;
        let detail = aNewItem;

        let shouldNotify = true;
        if (response.ok) {
          cal.LOG("CalDAV: Item modified successfully on " + this.name);

          // Some CalDAV servers will modify items on PUT (add X-props, for instance) so we'd
          // best re-fetch in order to know the current state of the item Observers will be
          // notified in getUpdatedItem()
          this.getUpdatedItem(aNewItem, aListener);

          // SOGo has calendarUri == inboxUri so we need to be careful about deletions
          if (wasInboxItem && this.mShouldPollInbox) {
            this.doDeleteItem(aNewItem, null, true, true, null);
          }
          shouldNotify = false;
        } else if (response.conflict) {
          // promptOverwrite will ask the user and then re-request
          this.promptOverwrite(CALDAV_MODIFY_ITEM, aNewItem, aListener, aOldItem);
          shouldNotify = false;
        } else if (response.serverError) {
          status = Cr.NS_ERROR_NOT_AVAILABLE;
          detail = "Server Replied with " + response.status;
        } else if (response.status) {
          // There is a response status, but we haven't handled it yet. Any error occurring
          // here should consider being handled!
          cal.ERROR(
            "CalDAV: Unexpected status modifying item to " +
              this.name +
              ": " +
              response.status +
              "\n" +
              modifiedItemICS
          );

          status = Cr.NS_ERROR_FAILURE;
          detail = "Server Replied with " + response.status;
        }

        if (shouldNotify) {
          // Still need to visually notify for uncached calendars.
          if (!this.isCached && !Components.isSuccessCode(status)) {
            this.reportDavError(Ci.calIErrors.DAV_PUT_ERROR, status, detail);
          }

          notifyListener(status, detail, true);
        }
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
   * @param {calIItemBase} item The item to delete
   *
   * @returns {Promise<void>}
   */
  async deleteItem(item) {
    return this.doDeleteItem(item, false, null, null);
  },

  /**
   * Deletes item from CalDAV store.
   *
   * @param {calIItemBase}  item       Item to delete.
   * @param {boolean}       ignoreEtag Ignore item etag.
   * @param {boolean}       fromInbox  Delete from inbox rather than calendar.
   * @param {string}        uri        Uri of item to delete.
   *
   * @returns {Promise<void>}
   */
  async doDeleteItem(item, ignoreEtag, fromInbox, uri) {
    const onError = async (status, detail) => {
      // Still need to visually notify for uncached calendars.
      if (!this.isCached) {
        this.reportDavError(Ci.calIErrors.DAV_REMOVE_ERROR, status, detail);
      }
      this.notifyOperationComplete(null, status, cIOL.DELETE, null, detail);
      return Promise.reject(new Components.Exception(detail, status));
    };

    if (item.id == null) {
      return onError(Cr.NS_ERROR_FAILURE, "ID doesn't exist for deleteItem");
    }

    let eventUri;
    if (uri) {
      eventUri = uri;
    } else if (fromInbox || this.mItemInfoCache[item.id].isInboxItem) {
      eventUri = this.makeUri(this.mItemInfoCache[item.id].locationPath, this.mInboxUrl);
    } else {
      eventUri = this.makeUri(this.mItemInfoCache[item.id].locationPath);
    }

    if (eventUri.pathQueryRef == this.calendarUri.pathQueryRef) {
      return onError(
        Cr.NS_ERROR_FAILURE,
        "eventUri and calendarUri paths are the same, will not go on to delete entire calendar"
      );
    }

    if (this.verboseLogging()) {
      cal.LOG("CalDAV: Deleting " + eventUri.spec);
    }

    const sendEtag = ignoreEtag ? null : this.mItemInfoCache[item.id].etag;
    const request = new CalDavDeleteItemRequest(this.session, this, eventUri, sendEtag);

    let response;
    try {
      response = await request.commit();
    } catch (e) {
      return onError(Cr.NS_ERROR_NOT_AVAILABLE, "Error preparing http channel");
    }

    if (response.ok) {
      if (!fromInbox) {
        const decodedPath = this.ensureDecodedPath(eventUri.pathQueryRef);
        delete this.mHrefIndex[decodedPath];
        delete this.mItemInfoCache[item.id];
        cal.LOG("CalDAV: Item deleted successfully from calendar " + this.name);

        if (this.isCached) {
          this.notifyOperationComplete(null, Cr.NS_OK, cIOL.DELETE, null, null);
          return null;
        }
        // If the calendar is not cached, we need to remove
        // the item from our memory calendar now. The
        // listeners will be notified there.
        return this.mOfflineStorage.deleteItem(item);
      }
      return null;
    } else if (response.conflict) {
      // item has either been modified or deleted by someone else check to see which
      cal.LOG("CalDAV: Item has been modified on server, checking if it has been deleted");
      const headRequest = new CalDavGenericRequest(this.session, this, "HEAD", eventUri);
      const headResponse = await headRequest.commit();

      if (headResponse.notFound) {
        // Nothing to do. Someone else has already deleted it
        this.notifyPureOperationComplete(null, Cr.NS_OK, cIOL.DELETE, null, null);
        return null;
      } else if (headResponse.serverError) {
        return onError(Cr.NS_ERROR_NOT_AVAILABLE, "Server Replied with " + headResponse.status);
      } else if (headResponse.status) {
        // The item still exists. We need to ask the user if he
        // really wants to delete the item. Remember, we only
        // made this request since the actual delete gave 409/412
        const item = await this.getItem(item.id);
        return cal.provider.promptOverwrite(CALDAV_DELETE_ITEM, item)
          ? this.doDeleteItem(item, true, false, null)
          : null;
      }
    } else if (response.serverError) {
      return onError(Cr.NS_ERROR_NOT_AVAILABLE, "Server Replied with " + response.status);
    } else if (response.status) {
      cal.ERROR(
        "CalDAV: Unexpected status deleting item from " +
          this.name +
          ": " +
          response.status +
          "\n" +
          "uri: " +
          eventUri.spec
      );
    }
    return onError(Cr.NS_ERROR_FAILURE, "Server Replied with status " + response.status);
  },

  /**
   * Add an item to the target calendar
   *
   * @param path      Item path MUST NOT BE ENCODED
   * @param calData   iCalendar string representation of the item
   * @param aUri      Base URI of the request
   * @param aListener Listener
   */
  async addTargetCalendarItem(path, calData, aUri, etag, aListener) {
    const parser = Cc["@mozilla.org/calendar/ics-parser;1"].createInstance(Ci.calIIcsParser);
    // aUri.pathQueryRef may contain double slashes whereas path does not
    // this confuses our counting, so remove multiple successive slashes
    const strippedUriPath = aUri.pathQueryRef.replace(/\/{2,}/g, "/");
    const uriPathComponentLength = strippedUriPath.split("/").length;
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
    const items = parser.getItems();
    const propertiesList = parser.getProperties();
    let method;
    for (const prop of propertiesList) {
      if (prop.propertyName == "METHOD") {
        method = prop.value;
        break;
      }
    }
    const isReply = method == "REPLY";
    const item = items[0];

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
    const resPathComponents = path.split("/");
    resPathComponents.splice(0, uriPathComponentLength - 1);
    const locationPath = resPathComponents.join("/");
    const isInboxItem = this.isInbox(aUri.spec);

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

    if (this.isCached) {
      this.setMetaData(item.id, path, etag, isInboxItem);

      // If we have a listener, then the caller will take care of adding the item
      // Otherwise, we have to do it ourself
      // XXX This is quite fragile, but saves us a double modify/add

      if (aListener) {
        await new Promise(resolve => {
          const wrappedListener = {
            onGetResult(...args) {
              aListener.onGetResult(...args);
            },
            onOperationComplete(...args) {
              // We must use wrappedJSObject to receive a returned Promise.
              const promise = aListener.wrappedJSObject.onOperationComplete(...args);
              if (promise) {
                promise.then(resolve);
              } else {
                resolve();
              }
            },
          };

          // In the cached case, notifying operation complete will add the item to the cache
          if (this.mItemInfoCache[item.id].isNew) {
            this.notifyOperationComplete(wrappedListener, Cr.NS_OK, cIOL.ADD, item.id, item);
          } else {
            this.notifyOperationComplete(wrappedListener, Cr.NS_OK, cIOL.MODIFY, item.id, item);
          }
        });
        return;
      }
    }

    // Either there's no listener, or we're uncached.

    if (this.mItemInfoCache[item.id].isNew) {
      await this.mOfflineStorage.adoptItem(item).then(
        () => aListener?.onOperationComplete(item.calendar, Cr.NS_OK, cIOL.ADD, item.id, item),
        e => aListener?.onOperationComplete(null, e.result, null, null, e)
      );
    } else {
      await this.mOfflineStorage.modifyItem(item, null).then(
        item => aListener?.onOperationComplete(item.calendar, Cr.NS_OK, cIOL.MODIFY, item.id, item),
        e => aListener?.onOperationComplete(null, e.result, null, null, e)
      );
    }
  },

  /**
   * Deletes an item from the target calendar
   *
   * @param path Path of the item to delete, must not be encoded
   */
  async deleteTargetCalendarItem(path) {
    const foundItem = await this.mOfflineStorage.getItem(this.mHrefIndex[path]);
    const wasInboxItem = this.mItemInfoCache[foundItem.id].isInboxItem;
    if ((wasInboxItem && this.isInbox(path)) || (wasInboxItem === false && !this.isInbox(path))) {
      cal.LOG("CalDAV: deleting item: " + path + ", uid: " + foundItem.id);
      delete this.mHrefIndex[path];
      delete this.mItemInfoCache[foundItem.id];
      if (this.isCached) {
        this.mOfflineStorage.deleteMetaData(foundItem.id);
      }
      await this.mOfflineStorage.deleteItem(foundItem);
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
  finalizeUpdatedItems(aChangeLogListener, calendarURI) {
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
    if (this.isCached && aChangeLogListener) {
      aChangeLogListener.onResult({ status: Cr.NS_OK }, Cr.NS_OK);
    } else {
      this.mObservers.notify("onLoad", [this]);
    }

    if (this.mProposedCtag) {
      this.mCtag = this.mProposedCtag;
      this.mProposedCtag = null;
    }

    this.mFirstRefreshDone = true;
    while (this.mQueuedQueries.length) {
      const query = this.mQueuedQueries.pop();
      const { filter, count, rangeStart, rangeEnd } = query;
      query.onStream(this.mOfflineStorage.getItems(filter, count, rangeStart, rangeEnd));
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
  notifyGetFailed(errorMsg, aListener, aChangeLogListener) {
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
      this.mQueuedQueries.pop().onError(new Components.Exception(errorMsg, Cr.NS_ERROR_FAILURE));
    }
  },

  /**
   * Retrieves a specific item from the CalDAV store.
   * Use when an outdated copy of the item is in hand.
   *
   * @param aItem       item to fetch
   * @param aListener   listener for method completion
   */
  getUpdatedItem(aItem, aListener, aChangeLogListener) {
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

    const locationPath = this.getItemLocationPath(aItem);
    const itemUri = this.makeUri(locationPath);

    const multiget = new CalDavMultigetSyncHandler(
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

  // Promise<calIItemBase|null> getItem(in string id);
  async getItem(aId) {
    return this.mOfflineStorage.getItem(aId);
  },

  // ReadableStream<calIItemBase> getItems(in unsigned long filter,
  //                                       in unsigned long count,
  //                                       in calIDateTime rangeStart,
  //                                       in calIDateTime rangeEnd)
  getItems(filter, count, rangeStart, rangeEnd) {
    if (this.isCached) {
      if (this.mOfflineStorage) {
        return this.mOfflineStorage.getItems(...arguments);
      }
      return CalReadableStreamFactory.createEmptyReadableStream();
    } else if (
      this.checkedServerInfo ||
      this.getProperty("currentStatus") == Ci.calIErrors.READ_FAILED
    ) {
      return this.mOfflineStorage.getItems(...arguments);
    }
    const self = this;
    return CalReadableStreamFactory.createBoundedReadableStream(
      count,
      CalReadableStreamFactory.defaultQueueSize,
      {
        async start(controller) {
          return new Promise((resolve, reject) => {
            self.mQueuedQueries.push({
              filter,
              count,
              rangeStart,
              rangeEnd,
              failed: false,
              onError(e) {
                this.failed = true;
                reject(e);
              },
              async onStream(stream) {
                for await (const items of cal.iterate.streamValues(stream)) {
                  if (this.failed) {
                    break;
                  }
                  controller.enqueue(items);
                }
                if (!this.failed) {
                  controller.close();
                  resolve();
                }
              },
            });
          });
        },
      }
    );
  },

  fillACLProperties() {
    const orgId = this.calendarUserAddress;
    if (orgId) {
      this.mACLProperties.organizerId = orgId;
    }

    if (this.mACLEntry && this.mACLEntry.hasAccessControl) {
      const ownerIdentities = this.mACLEntry.getOwnerIdentities();
      if (ownerIdentities.length > 0) {
        const identity = ownerIdentities[0];
        this.mACLProperties.organizerId = identity.email;
        this.mACLProperties.organizerCN = identity.fullName;
        this.mACLProperties["imip.identity"] = identity;
      }
    }
  },

  safeRefresh(aChangeLogListener) {
    const notifyListener = status => {
      if (this.isCached && aChangeLogListener) {
        aChangeLogListener.onResult({ status }, status);
      }
    };

    if (!this.mACLEntry) {
      const self = this;
      const opListener = {
        QueryInterface: ChromeUtils.generateQI(["calIOperationListener"]),
        onGetResult() {
          cal.ASSERT(false, "unexpected!");
        },
        onOperationComplete(opCalendar, opStatus, opType, opId, opDetail) {
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
      // the auth could have timed out and be in need of renegotiation we can't risk several
      // calendars doing this simultaneously so we'll force the renegotiation in a sync query,
      // using OPTIONS to keep it quick
      const headchannel = cal.provider.prepHttpChannel(this.makeUri(), null, null, this);
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

    // Call getUpdatedItems right away if its the first refresh *OR* if webdav Sync is enabled
    // (It is redundant to send a request to get the collection tag (getctag) on a calendar if
    // it supports webdav sync, the sync request will only return data if something changed).
    if (!this.mCtag || !this.mFirstRefreshDone || this.mHasWebdavSyncSupport) {
      this.getUpdatedItems(this.calendarUri, aChangeLogListener);
      return;
    }
    const request = new CalDavPropfindRequest(this.session, this, this.makeUri(), ["CS:getctag"]);

    request.commit().then(response => {
      cal.LOG(`CalDAV: Status ${response.status} checking ctag for calendar ${this.name}`);

      if (response.status == -1) {
        notifyListener(Cr.NS_OK);
        return;
      } else if (response.notFound) {
        cal.LOG(`CalDAV: Disabling calendar ${this.name} due to 404`);
        notifyListener(Cr.NS_ERROR_FAILURE);
        return;
      } else if (response.ok && this.mDisabledByDavError) {
        // Looks like the calendar is there again, check its resource
        // type first.
        this.checkDavResourceType(aChangeLogListener);
        return;
      } else if (!response.ok) {
        cal.LOG("CalDAV: Failed to get ctag from server for calendar " + this.name);
        notifyListener(Cr.NS_OK);
        return;
      }

      const ctag = response.firstProps["CS:getctag"];
      if (!ctag || ctag != this.mCtag) {
        // ctag mismatch, need to fetch calendar-data
        this.mProposedCtag = ctag;
        this.getUpdatedItems(this.calendarUri, aChangeLogListener);
        if (this.verboseLogging()) {
          cal.LOG("CalDAV: ctag mismatch on refresh, fetching data for calendar " + this.name);
        }
      } else {
        if (this.verboseLogging()) {
          cal.LOG("CalDAV: ctag matches, no need to fetch data for calendar " + this.name);
        }

        // Notify the listener, but don't return just yet...
        notifyListener(Cr.NS_OK);

        // ...we may still need to poll the inbox
        if (this.firstInRealm()) {
          this.pollInbox();
        }
      }
    });
  },

  refresh() {
    this.replayChangesOn(null);
  },

  firstInRealm() {
    const calendars = cal.manager.getCalendars();
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
   * @param {nsIURI} aUri - The uri to request the items from.
   *                        NOTE: This must be the uri without any uri
   *                        params. They will be appended in this function.
   * @param aChangeLogListener - (optional) The listener to notify for cached
   *                             calendars.
   */
  getUpdatedItems(aUri, aChangeLogListener) {
    if (this.mDisabledByDavError) {
      // check if maybe our calendar has become available
      this.checkDavResourceType(aChangeLogListener);
      return;
    }

    if (this.mHasWebdavSyncSupport) {
      const webDavSync = new CalDavWebDavSyncHandler(this, aUri, aChangeLogListener);
      webDavSync.doWebDAVSync();
      return;
    }

    const queryXml =
      XML_HEADER +
      '<D:propfind xmlns:D="DAV:">' +
      "<D:prop>" +
      "<D:getcontenttype/>" +
      "<D:resourcetype/>" +
      "<D:getetag/>" +
      "</D:prop>" +
      "</D:propfind>";

    const requestUri = this.makeUri(null, aUri);
    const handler = new CalDavEtagsHandler(this, aUri, aChangeLogListener);

    const onSetupChannel = channel => {
      channel.requestMethod = "PROPFIND";
      channel.setRequestHeader("Depth", "1", false);
    };
    const request = new CalDavLegacySAXRequest(
      this.session,
      this,
      requestUri,
      queryXml,
      MIME_TEXT_XML,
      handler,
      onSetupChannel
    );

    request.commit().catch(() => {
      if (aChangeLogListener && this.isCached) {
        aChangeLogListener.onResult(
          { status: Cr.NS_ERROR_NOT_AVAILABLE },
          Cr.NS_ERROR_NOT_AVAILABLE
        );
      }
    });
  },

  /**
   * @see nsIInterfaceRequestor
   * @see calProviderUtils.sys.mjs
   */
  getInterface: cal.provider.InterfaceRequestor_getInterface,

  //
  // Helper functions
  //

  oauthConnect(authSuccessCb, authFailureCb, aRefresh = false) {
    // Use the async prompter to avoid multiple primary password prompts
    const self = this;
    const promptlistener = {
      onPromptStartAsync(callback) {
        this.onPromptAuthAvailable(callback);
      },
      onPromptAuthAvailable(callback) {
        self.oauth.connect(true, aRefresh).then(
          () => {
            authSuccessCb();
            callback?.onAuthResult(true);
          },
          () => {
            authFailureCb();
            callback?.onAuthResult(false);
          }
        );
      },
      onPromptCanceled: authFailureCb,
      onPromptStart() {},
    };
    const asyncprompter = Cc["@mozilla.org/messenger/msgAsyncPrompter;1"].getService(
      Ci.nsIMsgAsyncPrompter
    );
    asyncprompter.queueAsyncAuthPrompt(self.uri.spec, false, promptlistener);
  },

  /**
   * Called when a response has had its URL redirected. Shows a dialog
   * to allow the user to accept or reject the redirect. If they accept,
   * change the calendar's URI to the target URI of the redirect.
   *
   * @param {PropfindResponse} response - Response to handle. Typically a
   *                                      PropfindResponse but could be any
   *                                      subclass of CalDavResponseBase.
   * @returns {boolean} True if the user accepted the redirect.
   *                   False, if the calendar should be disabled.
   */
  openUriRedirectDialog(response) {
    const args = {
      calendarName: this.name,
      originalURI: response.nsirequest.originalURI.spec,
      targetURI: response.uri.spec,
      returnValue: false,
    };

    cal.window
      .getCalendarWindow()
      .openDialog(
        "chrome://calendar/content/calendar-uri-redirect-dialog.xhtml",
        "Calendar:URIRedirectDialog",
        "chrome,modal,titlebar,resizable,centerscreen",
        args
      );

    if (args.returnValue) {
      this.uri = response.uri;
      this.setProperty("uri", response.uri.spec);
    }

    return args.returnValue;
  },

  /**
   * Checks that the calendar URI exists and is a CalDAV calendar. This is the beginning of a
   * chain of asynchronous calls. This function will, when done, call the next function related to
   * checking resource type, server capabilities, etc.
   *
   * checkDavResourceType                        * You are here
   * checkServerCaps
   * findPrincipalNS
   * checkPrincipalsNameSpace
   * completeCheckServerInfo
   */
  checkDavResourceType(aChangeLogListener) {
    this.ensureTargetCalendar();

    const request = new CalDavPropfindRequest(this.session, this, this.makeUri(), [
      "D:resourcetype",
      "D:owner",
      "D:current-user-principal",
      "D:current-user-privilege-set",
      "D:supported-report-set",
      "C:supported-calendar-component-set",
      "CS:getctag",
    ]);

    request.commit().then(
      response => {
        cal.LOG(`CalDAV: Status ${response.status} on initial PROPFIND for calendar ${this.name}`);

        // If the URI was redirected, and the user rejects the redirect, disable the calendar.
        if (response.redirected && !this.openUriRedirectDialog(response)) {
          this.setProperty("disabled", "true");
          this.completeCheckServerInfo(aChangeLogListener, Cr.NS_ERROR_ABORT);
          return;
        }

        if (response.clientError) {
          // 4xx codes, which is either an authentication failure or something like method not
          // allowed. This is a failure worth disabling the calendar.
          this.setProperty("disabled", "true");
          this.setProperty("auto-enabled", "true");
          this.completeCheckServerInfo(aChangeLogListener, Cr.NS_ERROR_ABORT);
          return;
        } else if (response.serverError) {
          // 5xx codes, a server error. This could be a temporary failure, i.e a backend
          // server being disabled.
          cal.LOG(
            "CalDAV: Server not available " +
              request.responseStatus +
              ", abort sync for calendar " +
              this.name
          );
          this.completeCheckServerInfo(aChangeLogListener, Cr.NS_ERROR_ABORT);
          return;
        }

        const wwwauth = request.getHeader("Authorization");
        this.mAuthScheme = wwwauth ? wwwauth.split(" ")[0] : "none";

        if (this.mUriParams) {
          this.mAuthScheme = "Ticket";
        }
        cal.LOG(`CalDAV: Authentication scheme for ${this.name} is ${this.mAuthScheme}`);

        // We only really need the authrealm for Digest auth since only Digest is going to time
        // out on us
        if (this.mAuthScheme == "Digest") {
          const realmChop = wwwauth.split('realm="')[1];
          this.mAuthRealm = realmChop.split('", ')[0];
          cal.LOG("CalDAV: realm " + this.mAuthRealm);
        }

        if (!response.text || response.notFound) {
          // No response, or the calendar no longer exists.
          cal.LOG("CalDAV: Failed to determine resource type for" + this.name);
          this.completeCheckServerInfo(aChangeLogListener, Ci.calIErrors.DAV_NOT_DAV);
          return;
        }

        const multistatus = response.xml;
        if (!multistatus) {
          cal.LOG(`CalDAV: Failed to determine resource type for ${this.name}`);
          this.completeCheckServerInfo(aChangeLogListener, Ci.calIErrors.DAV_NOT_DAV);
          return;
        }

        // check for webdav-sync capability
        // http://tools.ietf.org/html/draft-daboo-webdav-sync
        if (response.firstProps["D:supported-report-set"]?.has("D:sync-collection")) {
          cal.LOG("CalDAV: Collection has webdav sync support");
          this.mHasWebdavSyncSupport = true;
        }

        // check for server-side ctag support only if webdav sync is not available
        const ctag = response.firstProps["CS:getctag"];
        if (!this.mHasWebdavSyncSupport && ctag) {
          // We compare the stored ctag with the one we just got, if
          // they don't match, we update the items in safeRefresh.
          if (ctag == this.mCtag) {
            this.mFirstRefreshDone = true;
          }

          this.mProposedCtag = ctag;
          if (this.verboseLogging()) {
            cal.LOG(`CalDAV: initial ctag ${ctag} for calendar ${this.name}`);
          }
        }

        // Use supported-calendar-component-set if the server supports it; some do not.
        const supportedComponents = response.firstProps["C:supported-calendar-component-set"];
        if (supportedComponents?.size) {
          this.mSupportedItemTypes = [...this.mGenerallySupportedItemTypes].filter(itype => {
            return supportedComponents.has(itype);
          });
          cal.LOG(
            `Adding supported items: ${this.mSupportedItemTypes.join(",")} for calendar: ${
              this.name
            }`
          );
        }

        // check if current-user-principal or owner is specified; might save some work finding
        // the principal URL.
        const owner = response.firstProps["D:owner"];
        const cuprincipal = response.firstProps["D:current-user-principal"];
        if (cuprincipal) {
          this.mPrincipalUrl = cuprincipal;
          cal.LOG(
            "CalDAV: Found principal url from DAV:current-user-principal " + this.mPrincipalUrl
          );
        } else if (owner) {
          this.mPrincipalUrl = owner;
          cal.LOG("CalDAV: Found principal url from DAV:owner " + this.mPrincipalUrl);
        }

        const resourceType = response.firstProps["D:resourcetype"] || new Set();
        if (resourceType.has("C:calendar")) {
          // This is a valid calendar resource
          if (this.mDisabledByDavError) {
            this.mDisabledByDavError = false;
          }

          const privs = response.firstProps["D:current-user-privilege-set"];
          // Don't clear this.readOnly, only set it. The user may have write
          // privileges but not want to use them.
          if (!this.readOnly && privs && privs instanceof Set) {
            this.readOnly = !["D:write", "D:write-content", "D:write-properties", "D:all"].some(
              priv => privs.has(priv)
            );
          }

          this.setCalHomeSet(true);
          this.checkServerCaps(aChangeLogListener);
        } else if (resourceType.has("D:collection")) {
          // Not a CalDAV calendar
          cal.LOG(`CalDAV: ${this.name} points to a DAV resource, but not a CalDAV calendar`);
          this.completeCheckServerInfo(aChangeLogListener, Ci.calIErrors.DAV_DAV_NOT_CALDAV);
        } else {
          // Something else?
          cal.LOG(
            `CalDAV: No resource type received, ${this.name} doesn't seem to point to a DAV resource`
          );
          this.completeCheckServerInfo(aChangeLogListener, Ci.calIErrors.DAV_NOT_DAV);
        }
      },
      e => {
        cal.LOG(`CalDAV: Error during initial PROPFIND for calendar ${this.name}: ${e}`);
        this.completeCheckServerInfo(aChangeLogListener, Ci.calIErrors.DAV_NOT_DAV);
      }
    );
  },

  /**
   * Checks server capabilities.
   *
   * checkDavResourceType
   * checkServerCaps                              * You are here
   * findPrincipalNS
   * checkPrincipalsNameSpace
   * completeCheckServerInfo
   */
  checkServerCaps(aChangeLogListener, calHomeSetUrlRetry) {
    const request = new CalDavHeaderRequest(
      this.session,
      this,
      this.makeUri(null, this.mCalHomeSet)
    );

    request.commit().then(
      response => {
        if (!response.ok) {
          if (!calHomeSetUrlRetry && response.notFound) {
            // try again with calendar URL, see https://bugzilla.mozilla.org/show_bug.cgi?id=588799
            cal.LOG(
              "CalDAV: Calendar homeset was not found at parent url of calendar URL" +
                ` while querying options ${this.name}, will try calendar URL itself now`
            );
            this.setCalHomeSet(false);
            this.checkServerCaps(aChangeLogListener, true);
          } else {
            cal.LOG(
              `CalDAV: Unexpected status ${response.status} while querying options ${this.name}`
            );
            this.completeCheckServerInfo(aChangeLogListener, Cr.NS_ERROR_FAILURE);
          }

          // No further processing needed, we have called subsequent (async) functions above.
          return;
        }

        if (this.verboseLogging()) {
          cal.LOG("CalDAV: DAV features: " + [...response.features.values()].join(", "));
        }

        if (response.features.has("calendar-auto-schedule")) {
          if (this.verboseLogging()) {
            cal.LOG(`CalDAV: Calendar ${this.name} supports calendar-auto-schedule`);
          }
          this.mHasAutoScheduling = true;
          // leave outbound inbox/outbox scheduling off
        } else if (response.features.has("calendar-schedule")) {
          if (this.verboseLogging()) {
            cal.LOG(`CalDAV: Calendar ${this.name} generally supports calendar-schedule`);
          }
          this.hasScheduling = true;
        }

        if (this.hasAutoScheduling || response.features.has("calendar-schedule")) {
          // XXX - we really shouldn't register with the fb service if another calendar with
          // the same principal-URL has already done so. We also shouldn't register with the
          // fb service if we don't have an outbox.
          if (!this.hasFreeBusy) {
            // This may have already been set by fetchCachedMetaData, we only want to add
            // the freebusy provider once.
            this.hasFreeBusy = true;
            cal.freeBusyService.addProvider(this);
          }
          this.findPrincipalNS(aChangeLogListener);
        } else {
          cal.LOG("CalDAV: Server does not support CalDAV scheduling.");
          this.completeCheckServerInfo(aChangeLogListener);
        }
      },
      e => {
        cal.LOG(`CalDAV: Error checking server capabilities for calendar ${this.name}: ${e}`);
        this.completeCheckServerInfo(aChangeLogListener, Cr.NS_ERROR_FAILURE);
      }
    );
  },

  /**
   * Locates the principal namespace. This function should solely be called
   * from checkServerCaps to find the principal namespace.
   *
   * checkDavResourceType
   * checkServerCaps
   * findPrincipalNS                              * You are here
   * checkPrincipalsNameSpace
   * completeCheckServerInfo
   */
  findPrincipalNS(aChangeLogListener) {
    if (this.principalUrl) {
      // We already have a principal namespace, use it.
      this.checkPrincipalsNameSpace([this.principalUrl], aChangeLogListener);
      return;
    }

    const homeSet = this.makeUri(null, this.mCalHomeSet);
    const request = new CalDavPropfindRequest(this.session, this, homeSet, [
      "D:principal-collection-set",
    ]);

    request.commit().then(
      response => {
        if (response.ok) {
          const pcs = response.firstProps["D:principal-collection-set"];
          const nsList = pcs ? pcs.map(path => this.ensureDecodedPath(path)) : [];

          this.checkPrincipalsNameSpace(nsList, aChangeLogListener);
        } else {
          cal.LOG(
            "CalDAV: Unexpected status " +
              response.status +
              " while querying principal namespace for " +
              this.name
          );
          this.completeCheckServerInfo(aChangeLogListener, Cr.NS_ERROR_FAILURE);
        }
      },
      e => {
        cal.LOG(`CalDAV: Failed to propstat principal namespace for calendar ${this.name}: ${e}`);
        this.completeCheckServerInfo(aChangeLogListener, Cr.NS_ERROR_FAILURE);
      }
    );
  },

  /**
   * Checks the principals namespace for scheduling info. This function should
   * solely be called from findPrincipalNS
   *
   * checkDavResourceType
   * checkServerCaps
   * findPrincipalNS
   * checkPrincipalsNameSpace                     * You are here
   * completeCheckServerInfo
   *
   * @param aNameSpaceList    List of available namespaces
   */
  checkPrincipalsNameSpace(aNameSpaceList, aChangeLogListener) {
    const doesntSupportScheduling = () => {
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

    // We want a trailing slash, ensure it.
    const nextNS = aNameSpaceList.pop().replace(/([^\/])$/, "$1/"); // eslint-disable-line no-useless-escape
    const requestUri = Services.io.newURI(
      this.calendarUri.prePath + this.ensureEncodedPath(nextNS)
    );
    const requestProps = [
      "C:calendar-home-set",
      "C:calendar-user-address-set",
      "C:schedule-inbox-URL",
      "C:schedule-outbox-URL",
    ];

    let request;
    if (this.mPrincipalUrl) {
      request = new CalDavPropfindRequest(this.session, this, requestUri, requestProps);
    } else {
      const homePath = this.ensureEncodedPath(this.mCalHomeSet.spec.replace(/\/$/, ""));
      request = new CalDavPrincipalPropertySearchRequest(
        this.session,
        this,
        requestUri,
        homePath,
        "C:calendar-home-set",
        requestProps
      );
    }

    request.commit().then(
      response => {
        const homeSetMatches = homeSet => {
          const normalized = homeSet.replace(/([^\/])$/, "$1/"); // eslint-disable-line no-useless-escape
          const chs = this.mCalHomeSet;
          return normalized == chs.path || normalized == chs.spec;
        };
        const createBoxUrl = path => {
          if (!path) {
            return null;
          }
          let newPath = this.ensureDecodedPath(path);
          // Make sure the uri has a / at the end, as we do with the calendarUri.
          if (newPath.charAt(newPath.length - 1) != "/") {
            newPath += "/";
          }
          return this.mUri.mutate().setPathQueryRef(newPath).finalize();
        };

        if (!response.ok) {
          cal.LOG(
            `CalDAV: Bad response to in/outbox query, status ${response.status} for ${this.name}`
          );
          doesntSupportScheduling();
          return;
        }

        // If there are multiple home sets, we need to match the email addresses for scheduling.
        // If there is only one, assume its the right one.
        // TODO with multiple address sets, we should just use the ACL manager.
        const homeSets = response.firstProps["C:calendar-home-set"];
        if (homeSets.length == 1 || homeSets.some(homeSetMatches)) {
          const addrSet = response.firstProps["C:calendar-user-address-set"];
          // The first address in the list is expected to be the primary address among the aliases.
          const firstAddr = addrSet.find(addr => addr.match(/^mailto:/i));
          if (firstAddr) {
            if (this.verboseLogging()) {
              cal.LOG("CalDAV: mCalendarUserAddress set to " + firstAddr);
            }
            this.mCalendarUserAddress = firstAddr;
          }

          this.mInboxUrl = createBoxUrl(response.firstProps["C:schedule-inbox-URL"]);
          this.mOutboxUrl = createBoxUrl(response.firstProps["C:schedule-outbox-URL"]);

          if (!this.mInboxUrl || this.calendarUri.spec == this.mInboxUrl.spec) {
            // If the inbox matches the calendar uri (i.e SOGo), then we
            // don't need to poll the inbox.
            this.mShouldPollInbox = false;
          }
        }

        if (!this.calendarUserAddress || !this.mInboxUrl || !this.mOutboxUrl) {
          if (aNameSpaceList.length) {
            // Check the next namespace to find the info we need.
            this.checkPrincipalsNameSpace(aNameSpaceList, aChangeLogListener);
          } else {
            if (this.verboseLogging()) {
              cal.LOG(
                "CalDAV: principal namespace list empty, calendar " +
                  this.name +
                  " doesn't support scheduling"
              );
            }
            doesntSupportScheduling();
          }
        } else {
          // We have everything, complete.
          this.completeCheckServerInfo(aChangeLogListener);
        }
      },
      e => {
        cal.LOG(`CalDAV: Failure checking principal namespace for calendar ${this.name}: ${e}`);
        doesntSupportScheduling();
      }
    );
  },

  /**
   * This is called to complete checking the server info. It should be the
   * final call when checking server options. This will either report the
   * error or if it is a success then refresh the calendar.
   *
   * checkDavResourceType
   * checkServerCaps
   * findPrincipalNS
   * checkPrincipalsNameSpace
   * completeCheckServerInfo                      * You are here
   */
  completeCheckServerInfo(aChangeLogListener, aError = Cr.NS_OK) {
    if (Components.isSuccessCode(aError)) {
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
  reportDavError(aErrNo, status, extraInfo) {
    const mapError = {};
    mapError[Ci.calIErrors.DAV_NOT_DAV] = "dav-not-dav";
    mapError[Ci.calIErrors.DAV_DAV_NOT_CALDAV] = "dav-dav-not-cal-dav";
    mapError[Ci.calIErrors.DAV_PUT_ERROR] = "item-put-error";
    mapError[Ci.calIErrors.DAV_REMOVE_ERROR] = "item-delete-error";
    mapError[Ci.calIErrors.DAV_REPORT_ERROR] = "disabled-mode";

    const mapModification = {};
    mapModification[Ci.calIErrors.DAV_NOT_DAV] = false;
    mapModification[Ci.calIErrors.DAV_DAV_NOT_CALDAV] = false;
    mapModification[Ci.calIErrors.DAV_PUT_ERROR] = true;
    mapModification[Ci.calIErrors.DAV_REMOVE_ERROR] = true;
    mapModification[Ci.calIErrors.DAV_REPORT_ERROR] = false;

    const message = mapError[aErrNo];
    const modificationError = mapModification[aErrNo];

    if (!message) {
      // Only notify if there is a message for this error
      return;
    }
    const localizedMessage = lazy.l10n.formatValueSync(message, { name: this.mUri.spec });
    this.mDisabledByDavError = true;
    this.notifyError(aErrNo, localizedMessage);
    this.notifyError(
      modificationError ? Ci.calIErrors.MODIFICATION_FAILED : Ci.calIErrors.READ_FAILED,
      this.buildDetailedMessage(status, extraInfo)
    );
  },

  buildDetailedMessage(status, extraInfo) {
    if (!status) {
      return "";
    }

    let statusString;
    try {
      statusString = lazy.l10n.formatValueSync(`cal-dav-request-status-code-string-${status}`);
    } catch (e) {
      // Fallback on generic string if no string is defined for the status code
      statusString = lazy.l10n.formatValueSync("cal-dav-request-status-code-string-generic");
    }
    return (
      lazy.l10n.formatValueSync("cal-dav-request-status-code", { statusCode: status }) +
      ", " +
      statusString +
      "\n\n" +
      (extraInfo ? extraInfo : "")
    );
  },

  //
  // calIFreeBusyProvider interface
  //

  getFreeBusyIntervals(aCalId, aRangeStart, aRangeEnd, aBusyTypes, aListener) {
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
    const orgId = this.getProperty("organizerId");
    if (orgId && orgId.toLowerCase() == aCalId.toLowerCase()) {
      aCalId = this.calendarUserAddress; // continue with calendar-user-address
    }

    // the caller prepends MAILTO: to calid strings containing @
    // but apple needs that to be mailto:
    const aCalIdParts = aCalId.split(":");
    aCalIdParts[0] = aCalIdParts[0].toLowerCase();
    if (aCalIdParts[0] != "mailto" && aCalIdParts[0] != "http" && aCalIdParts[0] != "https") {
      aListener.onResult(null, null);
      return;
    }

    const organizer = this.calendarUserAddress;
    const recipient = aCalIdParts.join(":");
    const fbUri = this.makeUri(null, this.outboxUrl);

    const request = new CalDavFreeBusyRequest(
      this.session,
      this,
      fbUri,
      organizer,
      recipient,
      aRangeStart,
      aRangeEnd
    );

    request.commit().then(
      response => {
        if (!response.xml || response.status != 200) {
          cal.LOG(
            "CalDAV: Received status " + response.status + " from freebusy query for " + this.name
          );
          aListener.onResult(null, null);
          return;
        }

        const fbTypeMap = {
          UNKNOWN: Ci.calIFreeBusyInterval.UNKNOWN,
          FREE: Ci.calIFreeBusyInterval.FREE,
          BUSY: Ci.calIFreeBusyInterval.BUSY,
          "BUSY-UNAVAILABLE": Ci.calIFreeBusyInterval.BUSY_UNAVAILABLE,
          "BUSY-TENTATIVE": Ci.calIFreeBusyInterval.BUSY_TENTATIVE,
        };

        const status = response.firstRecipient.status;
        if (!status || !status.startsWith("2")) {
          cal.LOG(`CalDAV: Got status ${status} in response to freebusy query for ${this.name}`);
          aListener.onResult(null, null);
          return;
        }

        if (!status.startsWith("2.0")) {
          cal.LOG(`CalDAV: Got status ${status} in response to freebusy query for ${this.name}`);
        }

        const intervals = response.firstRecipient.intervals.map(data => {
          const fbType = fbTypeMap[data.type] || Ci.calIFreeBusyInterval.UNKNOWN;
          return new cal.provider.FreeBusyInterval(aCalId, fbType, data.begin, data.end);
        });

        aListener.onResult(null, intervals);
      },
      e => {
        cal.LOG(`CalDAV: Failed freebusy request for ${this.name}: ${e}`);
        aListener.onResult(null, null);
      }
    );
  },

  /**
   * Extract the path from the full spec, if the regexp failed, log
   * warning and return unaltered path.
   */
  extractPathFromSpec(aSpec) {
    // The parsed array should look like this:
    // a[0] = full string
    // a[1] = scheme
    // a[2] = everything between the scheme and the start of the path
    // a[3] = extracted path
    const a = aSpec.match("(https?)(://[^/]*)([^#?]*)");
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
  ensureEncodedPath(aString) {
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
   * @param {string} aString - Represents either a path
   *                           or a full uri that needs to be decoded.
   * @returns {string} A decoded path.
   */
  ensureDecodedPath(aString) {
    if (aString.charAt(0) != "/") {
      aString = this.extractPathFromSpec(aString);
    }

    const uriComponents = aString.split("/");
    for (let i = 0; i < uriComponents.length; i++) {
      try {
        uriComponents[i] = decodeURIComponent(uriComponents[i]);
      } catch (e) {
        cal.WARN("CalDAV: Exception decoding path " + aString + ", segment: " + uriComponents[i]);
      }
    }
    return uriComponents.join("/");
  },
  isInbox(aString) {
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
  pollInbox() {
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

  async processItipReply(aItem, aPath) {
    // modify partstat for in-calendar item
    // delete item from inbox
    const self = this;
    const modListener = {};
    modListener.QueryInterface = ChromeUtils.generateQI(["calIOperationListener"]);
    modListener.onOperationComplete = function (aCalendar, aStatus) {
      cal.LOG(`CalDAV: status ${aStatus} while processing iTIP REPLY for ${self.name}`);
      // don't delete the REPLY item from inbox unless modifying the master
      // item was successful
      if (aStatus == 0) {
        // aStatus undocumented; 0 seems to indicate no error
        const delUri = self.calendarUri
          .mutate()
          .setPathQueryRef(self.ensureEncodedPath(aPath))
          .finalize();
        self.doDeleteItem(aItem, null, true, true, delUri);
      }
    };

    let itemToUpdate = await this.mOfflineStorage.getItem(aItem.id);

    if (aItem.recurrenceId && itemToUpdate.recurrenceInfo) {
      itemToUpdate = itemToUpdate.recurrenceInfo.getOccurrenceFor(aItem.recurrenceId);
    }
    const newItem = itemToUpdate.clone();

    for (const attendee of aItem.getAttendees()) {
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
  },

  canNotify(aMethod) {
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
    this.mSenderAddress = aString;
  },

  sendItems(aRecipients, aItipItem, aFromAttendee) {
    function doImipScheduling(aCalendar, aRecipientList) {
      let result = false;
      const imipTransport = cal.provider.getImipTransport(aCalendar);
      const recipients = [];
      aRecipientList.forEach(rec => recipients.push(rec.toString()));
      if (imipTransport) {
        cal.LOG(
          "Enforcing client-side email scheduling instead of server-side scheduling" +
            " for " +
            recipients.join()
        );
        result = imipTransport.sendItems(aRecipientList, aItipItem, aFromAttendee);
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
      const recipients = [];
      for (const item of aItipItem.getItemList()) {
        if (aItipItem.receivedMethod == "REPLY") {
          if (item.organizer.getProperty("SCHEDULE-AGENT") == "CLIENT") {
            recipients.push(item.organizer);
          }
        } else {
          const atts = item.getAttendees().filter(att => {
            return att.getProperty("SCHEDULE-AGENT") == "CLIENT";
          });
          for (const att of atts) {
            recipients.push(att);
          }
        }
      }
      if (recipients.length) {
        // We return the imip scheduling status here as any remaining calendar user will be
        // notified by the server without receiving a status in the first place.
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
      const attendee = aItipItem.getItemList()[0].getAttendeeById(this.calendarUserAddress);
      if (!attendee) {
        return false;
      }
      // work around BUG 351589, the below just removes RSVP:
      aItipItem.setAttendeeStatus(attendee.id, attendee.participationStatus);
    }

    for (const item of aItipItem.getItemList()) {
      const requestUri = this.makeUri(null, this.outboxUrl);
      const request = new CalDavOutboxRequest(
        this.session,
        this,
        requestUri,
        this.calendarUserAddress,
        aRecipients,
        item
      );

      request.commit().then(
        response => {
          if (!response.ok) {
            cal.LOG(`CalDAV: Sending iTIP failed with status ${response.status} for ${this.name}`);
          }

          const lowerRecipients = new Map(
            aRecipients.map(recip => [recip.id.toLowerCase(), recip])
          );
          const remainingAttendees = [];
          for (const [recipient, status] of Object.entries(response.data)) {
            if (status.startsWith("2")) {
              continue;
            }

            const att = lowerRecipients.get(recipient.toLowerCase());
            if (att) {
              remainingAttendees.push(att);
            }
          }

          if (this.verboseLogging()) {
            cal.LOG(
              "CalDAV: Failed scheduling delivery to " +
                remainingAttendees.map(att => att.id).join(", ")
            );
          }

          if (remainingAttendees.length) {
            // try to fall back to email delivery if CalDAV-sched didn't work
            const imipTransport = cal.provider.getImipTransport(this);
            if (imipTransport) {
              if (this.verboseLogging()) {
                cal.LOG(`CalDAV: sending email to ${remainingAttendees.length} recipients`);
              }
              imipTransport.sendItems(remainingAttendees, aItipItem, aFromAttendee);
            } else {
              cal.LOG("CalDAV: no fallback to iTIP/iMIP transport for " + this.name);
            }
          }
        },
        e => {
          cal.LOG(`CalDAV: Failed itip request for ${this.name}: ${e}`);
        }
      );
    }
    return true;
  },

  mVerboseLogging: undefined,
  verboseLogging() {
    if (this.mVerboseLogging === undefined) {
      this.mVerboseLogging = Services.prefs.getBoolPref("calendar.debug.log.verbose", false);
    }
    return this.mVerboseLogging;
  },

  getSerializedItem(aItem) {
    const serializer = Cc["@mozilla.org/calendar/ics-serializer;1"].createInstance(
      Ci.calIIcsSerializer
    );
    serializer.addItems([aItem]);
    const serializedItem = serializer.serializeToString();
    if (this.verboseLogging()) {
      cal.LOG("CalDAV: send: " + serializedItem);
    }
    return serializedItem;
  },
};

function calDavObserver(aCalendar) {
  this.mCalendar = aCalendar;
}

calDavObserver.prototype = {
  mCalendar: null,
  mInBatch: false,

  // calIObserver:
  onStartBatch(calendar) {
    this.mCalendar.observers.notify("onStartBatch", [calendar]);
    this.mInBatch = true;
  },
  onEndBatch(calendar) {
    this.mCalendar.observers.notify("onEndBatch", [calendar]);
    this.mInBatch = false;
  },
  onLoad(calendar) {
    this.mCalendar.observers.notify("onLoad", [calendar]);
  },
  onAddItem(aItem) {
    this.mCalendar.observers.notify("onAddItem", [aItem]);
  },
  onModifyItem(aNewItem, aOldItem) {
    this.mCalendar.observers.notify("onModifyItem", [aNewItem, aOldItem]);
  },
  onDeleteItem(aDeletedItem) {
    this.mCalendar.observers.notify("onDeleteItem", [aDeletedItem]);
  },
  onPropertyChanged(aCalendar, aName, aValue, aOldValue) {
    this.mCalendar.observers.notify("onPropertyChanged", [aCalendar, aName, aValue, aOldValue]);
  },
  onPropertyDeleting(aCalendar, aName) {
    this.mCalendar.observers.notify("onPropertyDeleting", [aCalendar, aName]);
  },

  onError(aCalendar, aErrNo, aMessage) {
    this.mCalendar.readOnly = true;
    this.mCalendar.notifyError(aErrNo, aMessage);
  },
};
