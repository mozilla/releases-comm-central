/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MailServices } from "resource:///modules/MailServices.sys.mjs";

/**
 * Helpers and base class for calendar providers
 */

// NOTE: This module should not be loaded directly, it is available when
// including calUtils.sys.mjs under the cal.provider namespace.

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  CalPeriod: "resource:///modules/CalPeriod.sys.mjs",
  CalReadableStreamFactory: "resource:///modules/CalReadableStreamFactory.sys.mjs",
  cal: "resource:///modules/calendar/calUtils.sys.mjs",
});

export var provider = {
  /**
   * Prepare HTTP channel with standard request headers and upload data/content-type if needed.
   *
   * @param {nsIURI} aUri - The channel URI, only used for a new channel.
   * @param {nsIInputStream | string} aUploadData - Data to be uploaded, if any. If a string,
   *   it will be converted to an nsIInputStream.
   * @param {string} aContentType - Value for Content-Type header, if any.
   * @param {nsIInterfaceRequestor} aNotificationCallbacks - Typically a CalDavRequestBase which
   *   implements nsIInterfaceRequestor and nsIChannelEventSink, and provides access to the
   *   calICalendar associated with the channel.
   * @param {nsIChannel} [aExistingChannel] - An existing channel to modify (optional).
   * @param {boolean} [aForceNewAuth=false] - If true, use a new user context to avoid cached
   *   authentication (see code comments). Optional, ignored if aExistingChannel is passed.
   * @returns {nsIChannel} - The prepared channel.
   */
  prepHttpChannel(
    aUri,
    aUploadData,
    aContentType,
    aNotificationCallbacks,
    aExistingChannel = null,
    aForceNewAuth = false
  ) {
    const originAttributes = {};

    // The current nsIHttpChannel implementation separates connections only
    // by hosts, which causes issues with cookies and password caching for
    // two or more simultaneous connections to the same host and different
    // authenticated users. This can be solved by providing the additional
    // userContextId, which also separates connections (a.k.a. containers).
    // Connections for userA @ server1 and userA @ server2 can exist in the
    // same container, as nsIHttpChannel will separate them. Connections
    // for userA @ server1 and userB @ server1 however must be placed into
    // different containers. It is therefore sufficient to add individual
    // userContextIds per username.

    if (aForceNewAuth) {
      // A random "username" that won't be the same as any existing one.
      // The value is not used for any other reason, so a UUID will do.
      originAttributes.userContextId = lazy.cal.auth.containerMap.getUserContextIdForUsername(
        lazy.cal.getUUID()
      );
    } else if (!aExistingChannel) {
      try {
        // Use a try/catch because there may not be a calICalendar interface.
        // For example, when there is no calendar associated with a request,
        // as in calendar detection.
        const calendar = aNotificationCallbacks.getInterface(Ci.calICalendar);
        if (calendar && calendar.getProperty("capabilities.username.supported") === true) {
          originAttributes.userContextId = lazy.cal.auth.containerMap.getUserContextIdForUsername(
            calendar.getProperty("username")
          );
        }
      } catch (e) {
        if (e.result != Cr.NS_ERROR_NO_INTERFACE) {
          throw e;
        }
      }
    }

    // We cannot use a system principal here since the connection setup will fail if
    // same-site cookie protection is enabled in TB and server-side.
    const principal = aExistingChannel
      ? null
      : Services.scriptSecurityManager.createContentPrincipal(aUri, originAttributes);
    const channel =
      aExistingChannel ||
      Services.io.newChannelFromURI(
        aUri,
        null,
        principal,
        null,
        Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
        Ci.nsIContentPolicy.TYPE_OTHER
      );
    let httpchannel = channel.QueryInterface(Ci.nsIHttpChannel);

    httpchannel.setRequestHeader("Accept", "text/xml", false);
    httpchannel.setRequestHeader("Accept-Charset", "utf-8,*;q=0.1", false);
    httpchannel.loadFlags |= Ci.nsIRequest.LOAD_BYPASS_CACHE;
    httpchannel.notificationCallbacks = aNotificationCallbacks;

    if (aUploadData) {
      httpchannel = httpchannel.QueryInterface(Ci.nsIUploadChannel);
      let stream;
      if (aUploadData instanceof Ci.nsIInputStream) {
        // Make sure the stream is reset
        stream = aUploadData.QueryInterface(Ci.nsISeekableStream);
        stream.seek(Ci.nsISeekableStream.NS_SEEK_SET, 0);
      } else {
        // Otherwise its something that should be a string, convert it.
        stream = Cc["@mozilla.org/io/string-input-stream;1"].createInstance(
          Ci.nsIStringInputStream
        );
        stream.setUTF8Data(aUploadData, aUploadData.length);
      }

      httpchannel.setUploadStream(stream, aContentType, -1);
    }

    return httpchannel;
  },

  /**
   * Send prepared HTTP request asynchronously
   *
   * @param {nsIStreamLoader} aStreamLoader - Stream loader for request
   * @param {nsIChannel} aChannel - Channel for request
   * @param {nsIStreamLoaderObserver} aListener - Listener for method completion
   */
  sendHttpRequest(aStreamLoader, aChannel, aListener) {
    aStreamLoader.init(aListener);
    aChannel.asyncOpen(aStreamLoader);
  },

  /**
   * Shortcut to create an nsIStreamLoader
   *
   * @returns {nsIStreamLoader} A fresh streamloader
   */
  createStreamLoader() {
    return Cc["@mozilla.org/network/stream-loader;1"].createInstance(Ci.nsIStreamLoader);
  },

  /**
   * getInterface method for providers. This should be called in the context of
   * the respective provider, i.e
   *
   * return cal.provider.InterfaceRequestor_getInterface.apply(this, arguments);
   *
   * or
   * ...
   * getInterface: cal.provider.InterfaceRequestor_getInterface,
   * ...
   *
   * NOTE: If the server only provides one realm for all calendars, be sure that
   * the |this| object implements calICalendar. In this case the calendar name
   * will be appended to the realm. If you need that feature disabled, see the
   * capabilities section of calICalendar.idl
   *
   * @param {nsIIDRef} aIID - The interface ID to return
   * @returns {nsISupports} The requested interface
   */
  InterfaceRequestor_getInterface(aIID) {
    try {
      return this.QueryInterface(aIID);
    } catch (e) {
      // Support Auth Prompt Interfaces
      if (aIID.equals(Ci.nsIAuthPrompt2)) {
        if (!this.calAuthPrompt) {
          this.calAuthPrompt = new lazy.cal.auth.Prompt();
        }
        return this.calAuthPrompt;
      } else if (aIID.equals(Ci.nsIAuthPromptProvider) || aIID.equals(Ci.nsIPrompt)) {
        return Services.ww.getNewPrompter(null);
      }
      throw e;
    }
  },

  /**
   * Bad Certificate Handler for Network Requests. Shows the Network Exception
   * Dialog if a certificate Problem occurs.
   */
  BadCertHandler: class {
    /**
     * @param {calICalendar} [calendar] - A calendar associated with the request, may be null.
     */
    constructor(calendar) {
      this.calendar = calendar;
      this.timer = null;
    }

    notifyCertProblem(secInfo, targetSite) {
      // Unfortunately we can't pass js objects using the window watcher, so
      // we'll just take the first available calendar window. We also need to
      // do this on a timer so that the modal window doesn't block the
      // network request.
      const calWindow = lazy.cal.window.getCalendarWindow();

      const timerCallback = {
        calendar: this.calendar,
        notify(timer) {
          const params = {
            exceptionAdded: false,
            securityInfo: secInfo,
            prefetchCert: true,
            location: targetSite,
          };
          calWindow.openDialog(
            "chrome://pippki/content/exceptionDialog.xhtml",
            "",
            "chrome,centerscreen,modal",
            params
          );
          if (this.calendar && this.calendar.canRefresh && params.exceptionAdded) {
            // Refresh the calendar if the exception certificate was added
            this.calendar.refresh();
          }
        },
      };
      this.timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
      this.timer.initWithCallback(timerCallback, 0, Ci.nsITimer.TYPE_ONE_SHOT);
      return true;
    }
  },

  /**
   * Check for bad server certificates on SSL/TLS connections.
   *
   * @param {nsIRequest} request - request from the Stream loader.
   * @param {number} status - A Components.results result.
   * @param {calICalendar} [calendar] - A calendar associated with the request, may be null.
   */
  checkBadCertStatus(request, status, calendar) {
    const nssErrorsService = Cc["@mozilla.org/nss_errors_service;1"].getService(
      Ci.nsINSSErrorsService
    );
    let isCertError = false;
    try {
      const errorType = nssErrorsService.getErrorClass(status);
      if (errorType == Ci.nsINSSErrorsService.ERROR_CLASS_BAD_CERT) {
        isCertError = true;
      }
    } catch (e) {
      // nsINSSErrorsService.getErrorClass throws if given a non-TLS, non-cert error, so ignore this.
    }

    if (isCertError && request.securityInfo) {
      const secInfo = request.securityInfo.QueryInterface(Ci.nsITransportSecurityInfo);
      const badCertHandler = new provider.BadCertHandler(calendar);
      badCertHandler.notifyCertProblem(secInfo, request.originalURI.displayHostPort);
    }
  },

  /**
   * Freebusy interval implementation. All parameters are optional.
   *
   * @param aCalId         The calendar id to set up with.
   * @param aFreeBusyType  The type from calIFreeBusyInterval.
   * @param aStart         The start of the interval.
   * @param aEnd           The end of the interval.
   * @returns The fresh calIFreeBusyInterval.
   */
  FreeBusyInterval: class {
    QueryInterface() {
      return ChromeUtils.generateQI(["calIFreeBusyInterval"]);
    }

    constructor(aCalId, aFreeBusyType, aStart, aEnd) {
      this.calId = aCalId;
      this.interval = new lazy.CalPeriod();
      this.interval.start = aStart;
      this.interval.end = aEnd;

      this.freeBusyType = aFreeBusyType || Ci.calIFreeBusyInterval.UNKNOWN;
    }
  },

  /**
   * Gets the iTIP/iMIP transport if the passed calendar has configured email.
   *
   * @param {calICalendar} aCalendar - The calendar to get the transport for
   * @returns {?calIItipTransport} The email transport, or null if no identity configured
   */
  getImipTransport(aCalendar) {
    // assure an identity is configured for the calendar
    if (aCalendar && aCalendar.getProperty("imip.identity")) {
      return this.defaultImipTransport;
    }
    return null;
  },

  /**
   * Gets the configured identity and account of a particular calendar instance, or null.
   *
   * @param {calICalendar} aCalendar - Calendar instance
   * @param {?object} outAccount - Optional out value for account
   * @returns {nsIMsgIdentity} The configured identity
   */
  getEmailIdentityOfCalendar(aCalendar, outAccount) {
    lazy.cal.ASSERT(aCalendar, "no calendar!", Cr.NS_ERROR_INVALID_ARG);
    const key = aCalendar.getProperty("imip.identity.key");
    if (key === null) {
      // take default account/identity:
      const findIdentity = function (account) {
        if (account && account.identities.length) {
          return account.defaultIdentity || account.identities[0];
        }
        return null;
      };

      let foundAccount = MailServices.accounts.defaultAccount;
      let foundIdentity = findIdentity(foundAccount);

      if (!foundAccount || !foundIdentity) {
        for (const account of MailServices.accounts.accounts) {
          const identity = findIdentity(account);

          if (account && identity) {
            foundAccount = account;
            foundIdentity = identity;
            break;
          }
        }
      }

      if (outAccount) {
        outAccount.value = foundIdentity ? foundAccount : null;
      }
      return foundIdentity;
    }
    if (key.length == 0) {
      // i.e. "None"
      return null;
    }
    let identity = null;
    lazy.cal.email.iterateIdentities((identity_, account) => {
      if (identity_.key == key) {
        identity = identity_;
        if (outAccount) {
          outAccount.value = account;
        }
      }
      return identity_.key != key;
    });

    if (!identity) {
      // dangling identity:
      lazy.cal.WARN(
        "Calendar " +
          (aCalendar.uri ? aCalendar.uri.spec : aCalendar.id) +
          " has a dangling E-Mail identity configured."
      );
    }
    return identity;
  },

  /**
   * Opens the calendar conflict dialog
   *
   * @param {string} aMode - The conflict mode, either "modify" or "delete"
   * @param {calIItemBase} aItem - The item to raise a conflict for
   * @returns {boolean} True, if the item should be overwritten
   */
  promptOverwrite(aMode, aItem) {
    const window = lazy.cal.window.getCalendarWindow();
    const args = {
      item: aItem,
      mode: aMode,
      overwrite: false,
    };

    window.openDialog(
      "chrome://calendar/content/calendar-conflicts-dialog.xhtml",
      "calendarConflictsDialog",
      "chrome,titlebar,modal",
      args
    );

    return args.overwrite;
  },

  /**
   * Gets the calendar directory, defaults to <profile-dir>/calendar-data
   *
   * @returns {nsIFile} The calendar-data directory as nsIFile
   */
  getCalendarDirectory() {
    if (provider.getCalendarDirectory.mDir === undefined) {
      const dir = Services.dirsvc.get("ProfD", Ci.nsIFile);
      dir.append("calendar-data");
      if (!dir.exists()) {
        try {
          dir.create(Ci.nsIFile.DIRECTORY_TYPE, 0o700);
        } catch (exc) {
          lazy.cal.ASSERT(false, exc);
          throw exc;
        }
      }
      provider.getCalendarDirectory.mDir = dir;
    }
    return provider.getCalendarDirectory.mDir.clone();
  },

  /**
   * Base prototype to be used implementing a calICalendar.
   */
  BaseClass: class {
    /**
     * The transient properties that are not pesisted to storage
     */
    static get mTransientProperties() {
      return {
        "cache.uncachedCalendar": true,
        currentStatus: true,
        "itip.transport": true,
        "imip.identity": true,
        "imip.account": true,
        "imip.identity.disabled": true,
        organizerId: true,
        organizerCN: true,
      };
    }

    QueryInterface = ChromeUtils.generateQI(["calICalendar", "calISchedulingSupport"]);

    /**
     * Initialize the base class, this should be migrated to an ES6 constructor once all
     * subclasses are also es6 classes. Call this from the constructor.
     */
    initProviderBase() {
      this.wrappedJSObject = this;
      this.mID = null;
      this.mUri = null;
      this.mACLEntry = null;
      this.mBatchCount = 0;
      this.transientProperties = false;
      this.mObservers = new lazy.cal.data.ObserverSet(Ci.calIObserver);
      this.mProperties = {};
      this.mProperties.currentStatus = Cr.NS_OK;
    }

    /**
     * Returns the calIObservers for this calendar
     */
    get observers() {
      return this.mObservers;
    }

    // attribute AUTF8String id;
    get id() {
      return this.mID;
    }
    set id(aValue) {
      if (this.mID) {
        throw Components.Exception("", Cr.NS_ERROR_ALREADY_INITIALIZED);
      }
      this.mID = aValue;

      // make all properties persistent that have been set so far:
      for (const aName in this.mProperties) {
        if (!this.constructor.mTransientProperties[aName]) {
          const value = this.mProperties[aName];
          if (value !== null) {
            lazy.cal.manager.setCalendarPref_(this, aName, value);
          }
        }
      }
    }

    // attribute AUTF8String name;
    get name() {
      return this.getProperty("name");
    }
    set name(aValue) {
      this.setProperty("name", aValue);
    }

    // readonly attribute calICalendarACLManager aclManager;
    get aclManager() {
      const defaultACLProviderClass = "@mozilla.org/calendar/acl-manager;1?type=default";
      let providerClass = this.getProperty("aclManagerClass");
      if (!providerClass || !Cc[providerClass]) {
        providerClass = defaultACLProviderClass;
      }
      return Cc[providerClass].getService(Ci.calICalendarACLManager);
    }

    // readonly attribute calICalendarACLEntry aclEntry;
    get aclEntry() {
      return this.mACLEntry;
    }

    // attribute calICalendar superCalendar;
    get superCalendar() {
      // If we have a superCalendar, check this calendar for a superCalendar.
      // This will make sure the topmost calendar is returned
      return this.mSuperCalendar ? this.mSuperCalendar.superCalendar : this;
    }
    set superCalendar(val) {
      this.mSuperCalendar = val;
    }

    // attribute nsIURI uri;
    get uri() {
      return this.mUri;
    }
    set uri(aValue) {
      this.mUri = aValue;
    }

    // attribute boolean readOnly;
    get readOnly() {
      return this.getProperty("readOnly");
    }
    set readOnly(aValue) {
      this.setProperty("readOnly", aValue);
    }

    // readonly attribute boolean canRefresh;
    get canRefresh() {
      return false;
    }

    // void startBatch();
    startBatch() {
      if (this.mBatchCount++ == 0) {
        this.mObservers.notify("onStartBatch", [this]);
      }
    }

    // void endBatch();
    endBatch() {
      if (this.mBatchCount > 0) {
        if (--this.mBatchCount == 0) {
          this.mObservers.notify("onEndBatch", [this]);
        }
      } else {
        lazy.cal.ASSERT(this.mBatchCount > 0, "unexpected endBatch!");
      }
    }

    /**
     * Implementation of calICalendar.getItems(). This should be overridden by
     * all child classes.
     *
     * @param {number} itemFilter
     * @param {number} count
     * @param {calIDateTime} rangeStart
     * @param {calIDateTime} rangeEnd
     *
     * @returns {ReadableStream<calIItemBase>}
     */
    getItems(itemFilter, count, rangeStart, rangeEnd) {
      return lazy.CalReadableStreamFactory.createEmptyReadableStream();
    }

    /**
     * Implementation of calICalendar.getItemsAsArray().
     *
     * @param {number} itemFilter
     * @param {number} count
     * @param {calIDateTime} rangeStart
     * @param {calIDateTime} rangeEnd
     *
     * @returns {calIItemBase[]}
     */
    async getItemsAsArray(itemFilter, count, rangeStart, rangeEnd) {
      return lazy.cal.iterate.streamToArray(this.getItems(itemFilter, count, rangeStart, rangeEnd));
    }

    /**
     * Notifies the given listener for onOperationComplete, ignoring (but logging) any
     * exceptions that occur. If no listener is passed the function is a no-op.
     *
     * @param {?calIOperationListener} aListener - The listener to notify
     * @param {number} aStatus - A Components.results result
     * @param {number} aOperationType - The operation type component
     * @param {string} aId - The item id
     * @param {*} aDetail - The item detail for the listener
     */
    notifyPureOperationComplete(aListener, aStatus, aOperationType, aId, aDetail) {
      if (aListener) {
        try {
          aListener.onOperationComplete(this.superCalendar, aStatus, aOperationType, aId, aDetail);
        } catch (exc) {
          lazy.cal.ERROR(exc);
        }
      }
    }

    /**
     * Notifies the given listener for onOperationComplete, also setting various calendar status
     * variables and notifying about the error.
     *
     * @param {?calIOperationListener} aListener - The listener to notify
     * @param {number} aStatus - A Components.results result
     * @param {number} aOperationType - The operation type component
     * @param {string} aId - The item id
     * @param {*} aDetail - The item detail for the listener
     * @param {string} aExtraMessage - An extra message to pass to notifyError
     */
    notifyOperationComplete(aListener, aStatus, aOperationType, aId, aDetail, aExtraMessage) {
      this.notifyPureOperationComplete(aListener, aStatus, aOperationType, aId, aDetail);

      if (aStatus == Ci.calIErrors.OPERATION_CANCELLED) {
        return; // cancellation doesn't change current status, no notification
      }
      if (Components.isSuccessCode(aStatus)) {
        this.setProperty("currentStatus", aStatus);
      } else {
        if (aDetail instanceof Ci.nsIException) {
          this.notifyError(aDetail); // will set currentStatus
        } else {
          this.notifyError(aStatus, aDetail); // will set currentStatus
        }
        this.notifyError(
          aOperationType == Ci.calIOperationListener.GET
            ? Ci.calIErrors.READ_FAILED
            : Ci.calIErrors.MODIFICATION_FAILED,
          aExtraMessage || ""
        );
      }
    }

    /**
     * Notify observers using the onError notification with a readable error message
     *
     * @param {number | nsIException} aErrNo      The error number from Components.results, or
     *                                            the exception which contains the error number
     * @param {?string} aMessage - The message to show for the error
     */
    notifyError(aErrNo, aMessage = null) {
      if (aErrNo == Ci.calIErrors.OPERATION_CANCELLED) {
        return; // cancellation doesn't change current status, no notification
      }
      if (aErrNo instanceof Ci.nsIException) {
        if (!aMessage) {
          aMessage = aErrNo.message;
        }
        aErrNo = aErrNo.result;
      }
      this.setProperty("currentStatus", aErrNo);
      this.observers.notify("onError", [this.superCalendar, aErrNo, aMessage]);
    }

    // nsIVariant getProperty(in AUTF8String aName);
    getProperty(aName) {
      switch (aName) {
        case "itip.transport": // iTIP/iMIP default:
          return provider.getImipTransport(this);
        case "itip.notify-replies": // iTIP/iMIP default:
          return Services.prefs.getBoolPref("calendar.itip.notify-replies", false);
        // temporary hack to get the uncached calendar instance:
        case "cache.uncachedCalendar":
          return this;
      }

      let ret = this.mProperties[aName];
      if (ret === undefined) {
        ret = null;
        switch (aName) {
          case "imip.identity": // we want to cache the identity object a little, because
            // it is heavily used by the invitation checks
            ret = provider.getEmailIdentityOfCalendar(this);
            break;
          case "imip.account": {
            const outAccount = {};
            if (provider.getEmailIdentityOfCalendar(this, outAccount)) {
              ret = outAccount.value;
            }
            break;
          }
          case "organizerId": {
            // itip/imip default: derived out of imip.identity
            const identity = this.getProperty("imip.identity");
            ret = identity ? "mailto:" + identity.QueryInterface(Ci.nsIMsgIdentity).email : null;
            break;
          }
          case "organizerCN": {
            // itip/imip default: derived out of imip.identity
            const identity = this.getProperty("imip.identity");
            ret = identity ? identity.QueryInterface(Ci.nsIMsgIdentity).fullName : null;
            break;
          }
        }
        if (
          ret === null &&
          !this.constructor.mTransientProperties[aName] &&
          !this.transientProperties
        ) {
          if (this.id) {
            ret = lazy.cal.manager.getCalendarPref_(this, aName);
          }
          switch (aName) {
            case "suppressAlarms":
              if (this.getProperty("capabilities.alarms.popup.supported") === false) {
                // If popup alarms are not supported,
                // automatically suppress alarms
                ret = true;
              }
              break;
          }
        }
        this.mProperties[aName] = ret;
      }
      return ret;
    }

    // void setProperty(in AUTF8String aName, in nsIVariant aValue);
    setProperty(aName, aValue) {
      const oldValue = this.getProperty(aName);
      if (oldValue != aValue) {
        this.mProperties[aName] = aValue;
        switch (aName) {
          case "imip.identity.key": // invalidate identity and account object if key is set:
            delete this.mProperties["imip.identity"];
            delete this.mProperties["imip.account"];
            delete this.mProperties.organizerId;
            delete this.mProperties.organizerCN;
            break;
        }
        if (!this.transientProperties && !this.constructor.mTransientProperties[aName] && this.id) {
          lazy.cal.manager.setCalendarPref_(this, aName, aValue);
        }
        this.mObservers.notify("onPropertyChanged", [this.superCalendar, aName, aValue, oldValue]);
      }
      return aValue;
    }

    // void deleteProperty(in AUTF8String aName);
    deleteProperty(aName) {
      this.mObservers.notify("onPropertyDeleting", [this.superCalendar, aName]);
      delete this.mProperties[aName];
      lazy.cal.manager.deleteCalendarPref_(this, aName);
    }

    // calIOperation refresh
    refresh() {
      return null;
    }

    // void addObserver( in calIObserver observer );
    addObserver(aObserver) {
      this.mObservers.add(aObserver);
    }

    // void removeObserver( in calIObserver observer );
    removeObserver(aObserver) {
      this.mObservers.delete(aObserver);
    }

    // calISchedulingSupport: Implementation corresponding to our iTIP/iMIP support
    isInvitation(aItem) {
      if (!this.mACLEntry || !this.mACLEntry.hasAccessControl) {
        // No ACL support - fallback to the old method
        const id = aItem.getProperty("X-MOZ-INVITED-ATTENDEE") || this.getProperty("organizerId");
        if (id) {
          const org = aItem.organizer;
          if (!org || !org.id || org.id.toLowerCase() == id.toLowerCase()) {
            return false;
          }
          return aItem.getAttendeeById(id) != null;
        }
        return false;
      }

      let org = aItem.organizer;
      if (!org || !org.id) {
        // HACK
        // if we don't have an organizer, this is perhaps because it's an exception
        // to a recurring event. We check the parent item.
        if (aItem.parentItem) {
          org = aItem.parentItem.organizer;
          if (!org || !org.id) {
            return false;
          }
        } else {
          return false;
        }
      }

      // We check if :
      // - the organizer of the event is NOT within the owner's identities of this calendar
      // - if the one of the owner's identities of this calendar is in the attendees
      const ownerIdentities = this.mACLEntry.getOwnerIdentities();
      for (let i = 0; i < ownerIdentities.length; i++) {
        const identity = "mailto:" + ownerIdentities[i].email.toLowerCase();
        if (org.id.toLowerCase() == identity) {
          return false;
        }

        if (aItem.getAttendeeById(identity) != null) {
          return true;
        }
      }

      return false;
    }

    // calIAttendee getInvitedAttendee(in calIItemBase aItem);
    getInvitedAttendee(aItem) {
      const id = this.getProperty("organizerId");
      let attendee = id ? aItem.getAttendeeById(id) : null;

      if (!attendee && this.mACLEntry && this.mACLEntry.hasAccessControl) {
        const ownerIdentities = this.mACLEntry.getOwnerIdentities();
        if (ownerIdentities.length > 0) {
          let identity;
          for (let i = 0; !attendee && i < ownerIdentities.length; i++) {
            identity = "mailto:" + ownerIdentities[i].email.toLowerCase();
            attendee = aItem.getAttendeeById(identity);
          }
        }
      }

      return attendee;
    }

    // boolean canNotify(in AUTF8String aMethod, in calIItemBase aItem);
    canNotify(aMethod, aItem) {
      return false; // use outbound iTIP for all
    }
  },

  // Provider Registration

  /**
   * Register a provider.
   *
   * @param {calICalendarProvider} newProvider - The provider object.
   */
  register(newProvider) {
    this.providers.set(newProvider.type, newProvider);
  },

  /**
   * Unregister a provider.
   *
   * @param {string} type - The type of the provider to unregister.
   * @returns {boolean} True if the provider was unregistered, false if
   *                            it was not registered in the first place.
   */
  unregister(type) {
    return this.providers.delete(type);
  },

  /**
   * Get a provider by its type property, e.g. "ics", "caldav".
   *
   * @param {string} type - Type of the provider to get.
   * @returns {calICalendarProvider | undefined} Provider or undefined if none
   *                                                is registered for the type.
   */
  byType(type) {
    return this.providers.get(type);
  },

  /**
   * The built-in "ics" provider.
   *
   * @type {calICalendarProvider}
   */
  get ics() {
    return this.byType("ics");
  },

  /**
   * The built-in "caldav" provider.
   *
   * @type {calICalendarProvider}
   */
  get caldav() {
    return this.byType("caldav");
  },
};

// Initialize `cal.provider.providers` with the built-in providers.
ChromeUtils.defineLazyGetter(provider, "providers", () => {
  const { CalICSProvider } = ChromeUtils.importESModule(
    "resource:///modules/CalICSProvider.sys.mjs"
  );
  const { CalDavProvider } = ChromeUtils.importESModule(
    "resource:///modules/CalDavProvider.sys.mjs"
  );
  return new Map([
    ["ics", CalICSProvider],
    ["caldav", CalDavProvider],
  ]);
});

// This is the transport returned by getImipTransport().
ChromeUtils.defineLazyGetter(provider, "defaultImipTransport", () => {
  const { CalItipEmailTransport } = ChromeUtils.importESModule(
    "resource:///modules/CalItipEmailTransport.sys.mjs"
  );
  return CalItipEmailTransport.createInstance();
});

// Set up the `cal.provider.detection` module.
// XXX: https://bugzilla.mozilla.org/show_bug.cgi?id=1745807 should drop the
// pattern seen here of "namespacing" calendar utils onto the `cal` object.
// Until that work is done, we ignore the lint requirement that lazy objects be
// named `lazy`.
// eslint-disable-next-line mozilla/lazy-getter-object-name
ChromeUtils.defineESModuleGetters(provider, {
  detection: "resource:///modules/calendar/utils/calProviderDetectionUtils.sys.mjs",
});
