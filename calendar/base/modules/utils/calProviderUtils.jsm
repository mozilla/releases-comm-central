/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.import("resource:///modules/MailServices.jsm");
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { fixIterator } = ChromeUtils.import("resource:///modules/iteratorUtils.jsm");

ChromeUtils.defineModuleGetter(this, "cal", "resource:///modules/calendar/calUtils.jsm");

/*
 * Helpers and base class for calendar providers
 */

// NOTE: This module should not be loaded directly, it is available when
// including calUtils.jsm under the cal.provider namespace.

this.EXPORTED_SYMBOLS = ["calprovider"]; /* exported calprovider */

var calprovider = {
  /**
   * Prepare HTTP channel with standard request headers and upload data/content-type if needed.
   *
   * @param {nsIURI} aUri                                     Channel Uri, will only be used for a
   *                                                            new channel.
   * @param {nsIInputStream|String} aUploadData               Data to be uploaded, if any. This
   *                                                            may be a nsIInputStream or string
   *                                                            data. In the latter case the
   *                                                            string will be converted to an
   *                                                            input stream.
   * @param {String} aContentType                             Value for Content-Type header, if any
   * @param {nsIInterfaceRequestor} aNotificationCallbacks    Calendar using channel
   * @param {?nsIChannel} aExisting                           An existing channel to modify (optional)
   * @return {nsIChannel}                                     The prepared channel
   */
  prepHttpChannel(aUri, aUploadData, aContentType, aNotificationCallbacks, aExisting = null) {
    let originAttributes = {};

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

    let calendar = cal.wrapInstance(aNotificationCallbacks, Ci.calICalendar);
    if (calendar && calendar.getProperty("capabilities.username.supported") === true) {
      originAttributes.userContextId = cal.auth.containerMap.getUserContextIdForUsername(
        calendar.getProperty("username")
      );
    }

    // We cannot use a system principal here since the connection setup will fail if
    // same-site cookie protection is enabled in TB and server-side.
    let principal = aExisting
      ? null
      : Services.scriptSecurityManager.createContentPrincipal(aUri, originAttributes);
    let channel =
      aExisting ||
      Services.io.newChannelFromURI(
        aUri,
        null,
        principal,
        null,
        Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_DATA_IS_NULL,
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
        let converter = Cc["@mozilla.org/intl/scriptableunicodeconverter"].createInstance(
          Ci.nsIScriptableUnicodeConverter
        );
        converter.charset = "UTF-8";
        stream = converter.convertToInputStream(aUploadData.toString());
      }

      httpchannel.setUploadStream(stream, aContentType, -1);
    }

    return httpchannel;
  },

  /**
   * Send prepared HTTP request asynchronously
   *
   * @param {nsIStreamLoader} aStreamLoader       Stream loader for request
   * @param {nsIChannel} aChannel                 Channel for request
   * @param {nsIStreamLoaderObserver} aListener   Listener for method completion
   */
  sendHttpRequest(aStreamLoader, aChannel, aListener) {
    aStreamLoader.init(aListener);
    aChannel.asyncOpen(aStreamLoader);
  },

  /**
   * Shortcut to create an nsIStreamLoader
   *
   * @return {nsIStreamLoader}        A fresh streamloader
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
   * @param {nsIIDRef} aIID       The interface ID to return
   * @return {nsISupports}        The requested interface
   */
  InterfaceRequestor_getInterface(aIID) {
    try {
      // Try to query the this object for the requested interface but don't
      // throw if it fails since that borks the network code.
      return this.QueryInterface(aIID);
    } catch (e) {
      // Support Auth Prompt Interfaces
      if (aIID.equals(Ci.nsIAuthPrompt2)) {
        if (!this.calAuthPrompt) {
          this.calAuthPrompt = new cal.auth.Prompt();
        }
        return this.calAuthPrompt;
      } else if (aIID.equals(Ci.nsIAuthPromptProvider) || aIID.equals(Ci.nsIPrompt)) {
        return Services.ww.getNewPrompter(null);
      }
      Components.returnCode = e;
    }
    return null;
  },

  // TODO: Add new error handling that uses this code. See bug 1547096.
  /**
   * Bad Certificate Handler for Network Requests. Shows the Network Exception
   * Dialog if a certificate Problem occurs.
   */
  BadCertHandler: class {
    constructor(thisProvider) {
      this.thisProvider = thisProvider;
      this.timer = null;
    }

    notifyCertProblem(socketInfo, secInfo, targetSite) {
      // Unfortunately we can't pass js objects using the window watcher, so
      // we'll just take the first available calendar window. We also need to
      // do this on a timer so that the modal window doesn't block the
      // network request.
      let calWindow = cal.window.getCalendarWindow();

      let timerCallback = {
        thisProvider: this.thisProvider,
        notify(timer) {
          let params = {
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
          if (this.thisProvider.canRefresh && params.exceptionAdded) {
            // Refresh the provider if the
            // exception certificate was added
            this.thisProvider.refresh();
          }
        },
      };
      this.timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
      this.timer.initWithCallback(timerCallback, 0, Ci.nsITimer.TYPE_ONE_SHOT);
      return true;
    }
  },

  /**
   * Freebusy interval implementation. All parameters are optional.
   *
   * @param aCalId         The calendar id to set up with.
   * @param aFreeBusyType  The type from calIFreeBusyInterval.
   * @param aStart         The start of the interval.
   * @param aEnd           The end of the interval.
   * @return               The fresh calIFreeBusyInterval.
   */
  FreeBusyInterval: class {
    QueryInterface() {
      return ChromeUtils.generateQI([Ci.calIFreeBusyInterval]);
    }

    constructor(aCalId, aFreeBusyType, aStart, aEnd) {
      this.calId = aCalId;
      this.interval = Cc["@mozilla.org/calendar/period;1"].createInstance(Ci.calIPeriod);
      this.interval.start = aStart;
      this.interval.end = aEnd;

      this.freeBusyType = aFreeBusyType || Ci.calIFreeBusyInterval.UNKNOWN;
    }
  },

  /**
   * Gets the iTIP/iMIP transport if the passed calendar has configured email.
   *
   * @param {calICalendar} aCalendar      The calendar to get the transport for
   * @return {?calIItipTransport}         The email transport, or null if no identity configured
   */
  getImipTransport(aCalendar) {
    // assure an identity is configured for the calendar
    if (aCalendar && aCalendar.getProperty("imip.identity")) {
      return Cc["@mozilla.org/calendar/itip-transport;1?type=email"].getService(
        Ci.calIItipTransport
      );
    }
    return null;
  },

  /**
   * Gets the configured identity and account of a particular calendar instance, or null.
   *
   * @param {calICalendar} aCalendar      Calendar instance
   * @param {?Object} outAccount          Optional out value for account
   * @return {nsIMsgIdentity}             The configured identity
   */
  getEmailIdentityOfCalendar(aCalendar, outAccount) {
    cal.ASSERT(aCalendar, "no calendar!", Cr.NS_ERROR_INVALID_ARG);
    let key = aCalendar.getProperty("imip.identity.key");
    if (key === null) {
      // take default account/identity:
      let findIdentity = function(account) {
        if (account && account.identities.length) {
          return account.defaultIdentity || account.identities.queryElementAt(0, Ci.nsIMsgIdentity);
        }
        return null;
      };

      let foundAccount = MailServices.accounts.defaultAccount;
      let foundIdentity = findIdentity(foundAccount);

      if (!foundAccount || !foundIdentity) {
        let accounts = MailServices.accounts.accounts;
        for (let account of fixIterator(accounts, Ci.nsIMsgAccount)) {
          let identity = findIdentity(account);

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
    cal.email.iterateIdentities((identity_, account) => {
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
      cal.WARN(
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
   * @param {String} aMode        The conflict mode, either "modify" or "delete"
   * @param {calIItemBase} aItem  The item to raise a conflict for
   * @return {Boolean}            True, if the item should be overwritten
   */
  promptOverwrite(aMode, aItem) {
    let window = cal.window.getCalendarWindow();
    let args = {
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
   * @return {nsIFile}        The calendar-data directory as nsIFile
   */
  getCalendarDirectory() {
    if (calprovider.getCalendarDirectory.mDir === undefined) {
      let dir = Services.dirsvc.get("ProfD", Ci.nsIFile);
      dir.append("calendar-data");
      if (!dir.exists()) {
        try {
          dir.create(Ci.nsIFile.DIRECTORY_TYPE, 0o700);
        } catch (exc) {
          cal.ASSERT(false, exc);
          throw exc;
        }
      }
      calprovider.getCalendarDirectory.mDir = dir;
    }
    return calprovider.getCalendarDirectory.mDir.clone();
  },

  /**
   * Base prototype to be used implementing a provider.
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

    QueryInterface(iid) {
      return cal.generateClassQI(this, iid, [Ci.calICalendar, Ci.calISchedulingSupport]);
    }

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
      this.mObservers = new cal.data.ObserverSet(Ci.calIObserver);
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
        throw Cr.NS_ERROR_ALREADY_INITIALIZED;
      }
      this.mID = aValue;

      let calMgr = cal.getCalendarManager();

      // make all properties persistent that have been set so far:
      for (let aName in this.mProperties) {
        if (!this.constructor.mTransientProperties[aName]) {
          let value = this.mProperties[aName];
          if (value !== null) {
            calMgr.setCalendarPref_(this, aName, value);
          }
        }
      }

      return aValue;
    }

    // attribute AUTF8String name;
    get name() {
      return this.getProperty("name");
    }
    set name(aValue) {
      return this.setProperty("name", aValue);
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
      return (this.mSuperCalendar = val);
    }

    // attribute nsIURI uri;
    get uri() {
      return this.mUri;
    }
    set uri(aValue) {
      return (this.mUri = aValue);
    }

    // attribute boolean readOnly;
    get readOnly() {
      return this.getProperty("readOnly");
    }
    set readOnly(aValue) {
      return this.setProperty("readOnly", aValue);
    }

    // readonly attribute boolean canRefresh;
    get canRefresh() {
      return false;
    }

    // void startBatch();
    startBatch() {
      if (this.mBatchCount++ == 0) {
        this.mObservers.notify("onStartBatch");
      }
    }

    // void endBatch();
    endBatch() {
      if (this.mBatchCount > 0) {
        if (--this.mBatchCount == 0) {
          this.mObservers.notify("onEndBatch");
        }
      } else {
        cal.ASSERT(this.mBatchCount > 0, "unexpected endBatch!");
      }
    }

    /**
     * Notifies the given listener for onOperationComplete, ignoring (but logging) any
     * exceptions that occur. If no listener is passed the function is a no-op.
     *
     * @param {?calIOperationListener} aListener        The listener to notify
     * @param {Number} aStatus                          A Components.results result
     * @param {Number} aOperationType                   The operation type component
     * @param {String} aId                              The item id
     * @param {*} aDetail                               The item detail for the listener
     */
    notifyPureOperationComplete(aListener, aStatus, aOperationType, aId, aDetail) {
      if (aListener) {
        try {
          aListener.onOperationComplete(this.superCalendar, aStatus, aOperationType, aId, aDetail);
        } catch (exc) {
          cal.ERROR(exc);
        }
      }
    }

    /**
     * Notifies the given listener for onOperationComplete, also setting various calendar status
     * variables and notifying about the error.
     *
     * @param {?calIOperationListener} aListener        The listener to notify
     * @param {Number} aStatus                          A Components.results result
     * @param {Number} aOperationType                   The operation type component
     * @param {String} aId                              The item id
     * @param {*} aDetail                               The item detail for the listener
     * @param {String} aExtraMessage                    An extra message to pass to notifyError
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
     * @param {Number|nsIException} aErrNo      The error number from Components.results, or
     *                                            the exception which contains the error number
     * @param {?String} aMessage                The message to show for the error
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
          return calprovider.getImipTransport(this);
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
            ret = calprovider.getEmailIdentityOfCalendar(this);
            break;
          case "imip.account": {
            let outAccount = {};
            if (calprovider.getEmailIdentityOfCalendar(this, outAccount)) {
              ret = outAccount.value;
            }
            break;
          }
          case "organizerId": {
            // itip/imip default: derived out of imip.identity
            let identity = this.getProperty("imip.identity");
            ret = identity ? "mailto:" + identity.QueryInterface(Ci.nsIMsgIdentity).email : null;
            break;
          }
          case "organizerCN": {
            // itip/imip default: derived out of imip.identity
            let identity = this.getProperty("imip.identity");
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
            ret = cal.getCalendarManager().getCalendarPref_(this, aName);
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
      let oldValue = this.getProperty(aName);
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
          cal.getCalendarManager().setCalendarPref_(this, aName, aValue);
        }
        this.mObservers.notify("onPropertyChanged", [this.superCalendar, aName, aValue, oldValue]);
      }
      return aValue;
    }

    // void deleteProperty(in AUTF8String aName);
    deleteProperty(aName) {
      this.mObservers.notify("onPropertyDeleting", [this.superCalendar, aName]);
      delete this.mProperties[aName];
      cal.getCalendarManager().deleteCalendarPref_(this, aName);
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
        let id = this.getProperty("organizerId");
        if (id) {
          let org = aItem.organizer;
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
      let ownerIdentities = this.mACLEntry.getOwnerIdentities();
      for (let i = 0; i < ownerIdentities.length; i++) {
        let identity = "mailto:" + ownerIdentities[i].email.toLowerCase();
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
      let id = this.getProperty("organizerId");
      let attendee = id ? aItem.getAttendeeById(id) : null;

      if (!attendee && this.mACLEntry && this.mACLEntry.hasAccessControl) {
        let ownerIdentities = this.mACLEntry.getOwnerIdentities();
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
};
