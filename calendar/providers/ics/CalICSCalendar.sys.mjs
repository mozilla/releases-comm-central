/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";

import { CalReadableStreamFactory } from "resource:///modules/CalReadableStreamFactory.sys.mjs";

// This is a non-sync ics file. It reads the file pointer to by uri when set,
// then writes it on updates. External changes to the file will be
// ignored and overwritten.
//
// XXX Should do locks, so that external changes are not overwritten.

function icsNSResolver(prefix) {
  const ns = { D: "DAV:" };
  return ns[prefix] || null;
}

var calICSCalendarClassID = Components.ID("{f8438bff-a3c9-4ed5-b23f-2663b5469abf}");
var calICSCalendarInterfaces = [
  "calICalendar",
  "calISchedulingSupport",
  "nsIChannelEventSink",
  "nsIInterfaceRequestor",
  "nsIStreamListener",
  "nsIStreamLoaderObserver",
];

/**
 * @implements {calICalendar}
 * @implements {calISchedulingSupport}
 * @implements {nsIChannelEventSink}
 * @implements {nsIInterfaceRequestor}
 * @implements {nsIStreamListener}
 * @implements {nsIStreamLoaderObserver}
 */
export class CalICSCalendar extends cal.provider.BaseClass {
  classID = calICSCalendarClassID;
  QueryInterface = cal.generateQI(calICSCalendarInterfaces);
  classInfo = cal.generateCI({
    classID: calICSCalendarClassID,
    contractID: "@mozilla.org/calendar/calendar;1?type=ics",
    classDescription: "Calendar ICS provider",
    interfaces: calICSCalendarInterfaces,
  });

  #hooks = null;
  #memoryCalendar = null;
  #modificationActions = [];
  #observer = null;
  #uri = null;
  #locked = false;
  #unmappedComponents = [];
  #unmappedProperties = [];

  // Public to allow access by calCachedCalendar
  _queue = [];

  constructor() {
    super();

    this.initProviderBase();
    this.initICSCalendar();
  }

  initICSCalendar() {
    this.#memoryCalendar = Cc["@mozilla.org/calendar/calendar;1?type=memory"].createInstance(
      Ci.calICalendar
    );

    this.#memoryCalendar.superCalendar = this;
    this.#observer = new calICSObserver(this);
    this.#memoryCalendar.addObserver(this.#observer); // XXX Not removed
  }

  //
  // calICalendar interface
  //
  get type() {
    return "ics";
  }

  get canRefresh() {
    return true;
  }

  get uri() {
    return this.#uri;
  }

  set uri(uri) {
    if (this.#uri?.spec == uri.spec) {
      return;
    }

    this.#uri = uri;
    this.#memoryCalendar.uri = this.#uri;

    if (this.#uri.schemeIs("http") || this.#uri.schemeIs("https")) {
      this.#hooks = new httpHooks(this);
    } else if (this.#uri.schemeIs("file")) {
      this.#hooks = new fileHooks();
    } else {
      this.#hooks = new dummyHooks();
    }
  }

  getProperty(aName) {
    switch (aName) {
      case "requiresNetwork":
        return !this.uri.schemeIs("file");
    }

    return super.getProperty(aName);
  }

  get supportsScheduling() {
    return true;
  }

  getSchedulingSupport() {
    return this;
  }

  // Always use the queue, just to reduce the amount of places where
  // this.mMemoryCalendar.addItem() and friends are called. less
  // copied code.
  addItem(aItem) {
    return this.adoptItem(aItem.clone());
  }

  // Used to allow the cachedCalendar provider to hook into adoptItem() before
  // it returns.
  _cachedAdoptItemCallback = null;

  async adoptItem(aItem) {
    if (this.readOnly) {
      throw new Components.Exception("Calendar is not writable", Ci.calIErrors.CAL_IS_READONLY);
    }

    const adoptCallback = this._cachedAdoptItemCallback;

    const item = await new Promise(resolve => {
      this.startBatch();
      this._queue.push({
        action: "add",
        item: aItem,
        listener: item => {
          this.endBatch();
          resolve(item);
        },
      });
      this.#processQueue();
    });

    if (adoptCallback) {
      await adoptCallback(item.calendar, Cr.NS_OK, Ci.calIOperationListener.ADD, item.id, item);
    }
    return item;
  }

  // Used to allow the cachedCalendar provider to hook into modifyItem() before
  // it returns.
  _cachedModifyItemCallback = null;

  async modifyItem(aNewItem, aOldItem) {
    if (this.readOnly) {
      throw new Components.Exception("Calendar is not writable", Ci.calIErrors.CAL_IS_READONLY);
    }

    const modifyCallback = this._cachedModifyItemCallback;
    const item = await new Promise(resolve => {
      this.startBatch();
      this._queue.push({
        action: "modify",
        newItem: aNewItem,
        oldItem: aOldItem,
        listener: item => {
          this.endBatch();
          resolve(item);
        },
      });
      this.#processQueue();
    });

    if (modifyCallback) {
      await modifyCallback(item.calendar, Cr.NS_OK, Ci.calIOperationListener.MODIFY, item.id, item);
    }
    return item;
  }

  /**
   * Delete the provided item.
   *
   * @param {calIItemBase} aItem
   * @returns {Promise<void>}
   */
  deleteItem(aItem) {
    if (this.readOnly) {
      throw new Components.Exception("Calendar is not writable", Ci.calIErrors.CAL_IS_READONLY);
    }

    return new Promise(resolve => {
      this._queue.push({
        action: "delete",
        item: aItem,
        listener: resolve,
      });
      this.#processQueue();
    });
  }

  /**
   * @param {string} aId
   * @returns {Promise<calIItemBase?>}
   */
  getItem(aId) {
    return new Promise(resolve => {
      this._queue.push({
        action: "get_item",
        id: aId,
        listener: resolve,
      });
      this.#processQueue();
    });
  }

  /**
   * @param {number} aItemFilter
   * @param {number} aCount
   * @param {calIDateTime} aRangeStart
   * @param {calIDateTime} aRangeEndEx
   * @returns {ReadableStream<calIItemBase>}
   */
  getItems(aItemFilter, aCount, aRangeStart, aRangeEndEx) {
    const self = this;
    return CalReadableStreamFactory.createBoundedReadableStream(
      aCount,
      CalReadableStreamFactory.defaultQueueSize,
      {
        start(controller) {
          self._queue.push({
            action: "get_items",
            exec: async () => {
              for await (const value of cal.iterate.streamValues(
                self.#memoryCalendar.getItems(aItemFilter, aCount, aRangeStart, aRangeEndEx)
              )) {
                controller.enqueue(value);
              }
              controller.close();
            },
          });
          self.#processQueue();
        },
      }
    );
  }

  refresh() {
    this._queue.push({ action: "refresh", forceRefresh: false });
    this.#processQueue();
  }

  startBatch() {
    this.#observer.onStartBatch(this);
  }

  endBatch() {
    this.#observer.onEndBatch(this);
  }

  #forceRefresh() {
    this._queue.push({ action: "refresh", forceRefresh: true });
    this.#processQueue();
  }

  #prepareChannel(channel, forceRefresh) {
    channel.loadFlags |= Ci.nsIRequest.LOAD_BYPASS_CACHE;
    channel.notificationCallbacks = this;

    // Allow the hook to do its work, like a performing a quick check to
    // see if the remote file really changed. Might save a lot of time
    this.#hooks.onBeforeGet(channel, forceRefresh);
  }

  #createMemoryCalendar() {
    // Create a new calendar, to get rid of all the old events
    // Don't forget to remove the observer
    if (this.#memoryCalendar) {
      this.#memoryCalendar.removeObserver(this.#observer);
    }
    this.#memoryCalendar = Cc["@mozilla.org/calendar/calendar;1?type=memory"].createInstance(
      Ci.calICalendar
    );
    this.#memoryCalendar.uri = this.#uri;
    this.#memoryCalendar.superCalendar = this;
  }

  #doRefresh(force) {
    const channel = Services.io.newChannelFromURI(
      this.#uri,
      null,
      Services.scriptSecurityManager.getSystemPrincipal(),
      null,
      Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
      Ci.nsIContentPolicy.TYPE_OTHER
    );
    this.#prepareChannel(channel, force);

    const streamLoader = Cc["@mozilla.org/network/stream-loader;1"].createInstance(
      Ci.nsIStreamLoader
    );

    // Lock other changes to the item list.
    this.#lock();

    try {
      streamLoader.init(this);
      channel.asyncOpen(streamLoader);
    } catch (e) {
      // File not found: a new calendar. No problem.
      cal.LOG("[calICSCalendar] Error occurred opening channel: " + e);
      this.#unlock();
    }
  }

  // nsIChannelEventSink implementation
  asyncOnChannelRedirect(aOldChannel, aNewChannel, aFlags, aCallback) {
    this.#prepareChannel(aNewChannel, true);
    aCallback.onRedirectVerifyCallback(Cr.NS_OK);
  }

  // nsIStreamLoaderObserver impl
  // Listener for download. Parse the downloaded file

  onStreamComplete(loader, ctxt, status, resultLength, result) {
    let cont = false;

    if (Components.isSuccessCode(status)) {
      // Allow the hook to get needed data (like an etag) of the channel
      cont = this.#hooks.onAfterGet(loader.request);
      cal.LOG("[calICSCalendar] Loading ICS succeeded, needs further processing: " + cont);
    } else {
      // Failure may be due to temporary connection issue, keep old data to
      // prevent potential data loss if it becomes available again.
      cal.LOG("[calICSCalendar] Unable to load stream - status: " + status);

      // Check for bad server certificates on SSL/TLS connections.
      cal.provider.checkBadCertStatus(loader.request, status, this);
    }

    if (!cont) {
      // no need to process further, we can use the previous data
      // HACK Sorry, but offline support requires the items to be signaled
      // even if nothing has changed (especially at startup)
      this.#observer.onLoad(this);
      this.#unlock();
      return;
    }

    // Clear any existing events if there was no result
    if (!resultLength) {
      this.#createMemoryCalendar();
      this.#memoryCalendar.addObserver(this.#observer);
      this.#observer.onLoad(this);
      this.#unlock();
      return;
    }

    // This conversion is needed, because the stream only knows about
    // byte arrays, not about strings or encodings. The array of bytes
    // need to be interpreted as utf8 and put into a javascript string.
    let str;
    try {
      str = new TextDecoder().decode(Uint8Array.from(result));
    } catch (e) {
      this.#observer.onError(
        this.superCalendar,
        Ci.calIErrors.CAL_UTF8_DECODING_FAILED,
        e.toString()
      );
      this.#observer.onError(this.superCalendar, Ci.calIErrors.READ_FAILED, "");
      this.#unlock();
      return;
    }

    this.#createMemoryCalendar();

    this.#observer.onStartBatch(this);
    this.#memoryCalendar.addObserver(this.#observer);

    // Wrap parsing in a try block. Will ignore errors. That's a good thing
    // for non-existing or empty files, but not good for invalid files.
    // That's why we put them in readOnly mode
    const parser = Cc["@mozilla.org/calendar/ics-parser;1"].createInstance(Ci.calIIcsParser);
    const self = this;
    const listener = {
      // calIIcsParsingListener
      onParsingComplete(rc, parser_) {
        try {
          for (const item of parser_.getItems()) {
            self.#memoryCalendar.adoptItem(item);
          }
          self.#unmappedComponents = parser_.getComponents();
          self.#unmappedProperties = parser_.getProperties();
          cal.LOG("[calICSCalendar] Parsing ICS succeeded for " + self.uri.spec);
        } catch (exc) {
          cal.LOG("[calICSCalendar] Parsing ICS failed for \nException: " + exc);
          self.#observer.onError(self.superCalendar, exc.result, exc.toString());
          self.#observer.onError(self.superCalendar, Ci.calIErrors.READ_FAILED, "");
        }
        self.#observer.onEndBatch(self);
        self.#observer.onLoad(self);

        // Now that all items have been stuffed into the memory calendar
        // we should add ourselves as observer. It is important that this
        // happens *after* the calls to adoptItem in the above loop to prevent
        // the views from being notified.
        self.#unlock();
      },
    };
    parser.parseString(str, listener);
  }

  async #writeICS() {
    cal.LOG("[calICSCalendar] Commencing write of ICS Calendar " + this.name);
    if (!this.#uri) {
      throw Components.Exception("mUri must be set", Cr.NS_ERROR_FAILURE);
    }
    this.#lock();
    try {
      await this.#makeBackup();
      await this.#doWriteICS();
    } catch (e) {
      this.#unlock(Ci.calIErrors.MODIFICATION_FAILED);
    }
  }

  /**
   * Write the contents of an ICS serializer to an open channel as an ICS file.
   *
   * @param {calIIcsSerializer} serializer - The serializer to write
   * @param {nsIChannel} channel - The destination upload or file channel
   */
  async #writeSerializerToChannel(serializer, channel) {
    if (channel.URI.schemeIs("file")) {
      // We handle local files separately, as writing to an nsIChannel has the
      // potential to fail partway and can leave a file truncated, resulting in
      // data loss. For local files, we have the option to do atomic writes.
      try {
        const file = channel.QueryInterface(Ci.nsIFileChannel).file;

        // The temporary file permissions will become the file permissions since
        // we move the temp file over top of the file itself. Copy the file
        // permissions or use a restrictive default.
        const tmpFilePermissions = file.exists() ? file.permissions : 0o600;

        // We're going to be writing to an arbitrary point in the user's file
        // system, so we want to be very careful that we're not going to
        // overwrite any of their files.
        const tmpFilePath = await IOUtils.createUniqueFile(
          file.parent.path,
          `${file.leafName}.tmp`,
          tmpFilePermissions
        );

        const outString = serializer.serializeToString();
        await IOUtils.writeUTF8(file.path, outString, {
          tmpPath: tmpFilePath,
        });
      } catch (e) {
        this.#observer.onError(
          this.superCalendar,
          Ci.calIErrors.MODIFICATION_FAILED,
          `Failed to write to calendar file ${channel.URI.spec}: ${e.message}`
        );

        // Writing the file has failed; refresh and signal error to all
        // modifying operations.
        this.#unlock(Ci.calIErrors.MODIFICATION_FAILED);
        this.#forceRefresh();

        return;
      }

      // Write succeeded and we can clean up. We can reuse the channel, as the
      // last-modified time on the file will still be accurate.
      this.#hooks.onAfterPut(channel, () => {
        this.#unlock();
        this.#observer.onLoad(this);
        Services.startup.exitLastWindowClosingSurvivalArea();
      });

      return;
    }

    channel.notificationCallbacks = this;
    const uploadChannel = channel.QueryInterface(Ci.nsIUploadChannel);

    // Set the content of the upload channel to our ICS file.
    const icsStream = serializer.serializeToInputStream();
    uploadChannel.setUploadStream(icsStream, "text/calendar", -1);

    channel.asyncOpen(this);
  }

  async #doWriteICS() {
    cal.LOG("[calICSCalendar] Writing ICS File " + this.uri.spec);

    const serializer = Cc["@mozilla.org/calendar/ics-serializer;1"].createInstance(
      Ci.calIIcsSerializer
    );
    for (const comp of this.#unmappedComponents) {
      serializer.addComponent(comp);
    }

    for (const prop of this.#unmappedProperties) {
      switch (prop.propertyName) {
        // we always set the current name and timezone:
        case "X-WR-CALNAME":
        case "X-WR-TIMEZONE":
          break;
        default:
          serializer.addProperty(prop);
          break;
      }
    }

    let prop = cal.icsService.createIcalProperty("X-WR-CALNAME");
    prop.value = this.name;
    serializer.addProperty(prop);
    prop = cal.icsService.createIcalProperty("X-WR-TIMEZONE");
    prop.value = cal.timezoneService.defaultTimezone.tzid;
    serializer.addProperty(prop);

    // Get items directly from the memory calendar, as we're locked now and
    // calling this.getItems{,AsArray}() will return immediately
    serializer.addItems(
      await this.#memoryCalendar.getItemsAsArray(
        Ci.calICalendar.ITEM_FILTER_TYPE_ALL | Ci.calICalendar.ITEM_FILTER_COMPLETED_ALL,
        0,
        null,
        null
      )
    );

    let inLastWindowClosingSurvivalArea = false;
    try {
      // All events are returned. Now set up a channel and a
      // streamloader to upload.  onStopRequest will be called
      // once the write has finished
      const channel = Services.io.newChannelFromURI(
        this.#uri,
        null,
        Services.scriptSecurityManager.getSystemPrincipal(),
        null,
        Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
        Ci.nsIContentPolicy.TYPE_OTHER
      );

      // Allow the hook to add things to the channel, like a
      // header that checks etags
      const notChanged = this.#hooks.onBeforePut(channel);
      if (notChanged) {
        // Prevent Thunderbird from exiting entirely until we've finished
        // uploading one way or another
        Services.startup.enterLastWindowClosingSurvivalArea();
        inLastWindowClosingSurvivalArea = true;

        this.#writeSerializerToChannel(serializer, channel);
      } else {
        this.#observer.onError(
          this.superCalendar,
          Ci.calIErrors.MODIFICATION_FAILED,
          "The calendar has been changed remotely. Please reload and apply your changes again!"
        );

        this.#unlock(Ci.calIErrors.MODIFICATION_FAILED);
      }
    } catch (ex) {
      if (inLastWindowClosingSurvivalArea) {
        Services.startup.exitLastWindowClosingSurvivalArea();
      }

      this.#observer.onError(
        this.superCalendar,
        ex.result,
        "The calendar could not be saved; there was a failure: 0x" + ex.result.toString(16)
      );
      this.#observer.onError(this.superCalendar, Ci.calIErrors.MODIFICATION_FAILED, "");
      this.#unlock(Ci.calIErrors.MODIFICATION_FAILED);

      this.#forceRefresh();
    }
  }

  // nsIStreamListener impl
  // For after publishing. Do error checks here
  onStartRequest(aRequest) {}

  onDataAvailable(aRequest, aInputStream, aOffset, aCount) {
    // All data must be consumed. For an upload channel, there is
    // no meaningful data. So it gets read and then ignored
    const scriptableInputStream = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
      Ci.nsIScriptableInputStream
    );
    scriptableInputStream.init(aInputStream);
    scriptableInputStream.read(-1);
  }

  onStopRequest(aRequest, aStatusCode) {
    let httpChannel;
    let requestSucceeded = false;
    try {
      httpChannel = aRequest.QueryInterface(Ci.nsIHttpChannel);
      requestSucceeded = httpChannel.requestSucceeded;
    } catch (e) {
      // This may fail if it was not a http channel, handled later on.
    }

    if (httpChannel) {
      cal.LOG("[calICSCalendar] channel.requestSucceeded: " + requestSucceeded);
    }

    if (
      (httpChannel && !requestSucceeded) ||
      (!httpChannel && !Components.isSuccessCode(aRequest.status))
    ) {
      this.#observer.onError(
        this.superCalendar,
        Components.isSuccessCode(aRequest.status) ? Ci.calIErrors.DAV_PUT_ERROR : aRequest.status,
        "Publishing the calendar file failed\n" +
          "Status code: " +
          aRequest.status.toString(16) +
          "\n"
      );
      this.#observer.onError(this.superCalendar, Ci.calIErrors.MODIFICATION_FAILED, "");

      // The PUT has failed; refresh and signal error to all modifying operations
      this.#forceRefresh();
      this.#unlock(Ci.calIErrors.MODIFICATION_FAILED);

      Services.startup.exitLastWindowClosingSurvivalArea();

      return;
    }

    // Allow the hook to grab data of the channel, like the new etag
    this.#hooks.onAfterPut(aRequest, () => {
      this.#unlock();
      this.#observer.onLoad(this);
      Services.startup.exitLastWindowClosingSurvivalArea();
    });
  }

  async #processQueue() {
    if (this._isLocked) {
      return;
    }

    let task;
    let refreshAction = null;
    while ((task = this._queue.shift())) {
      switch (task.action) {
        case "add":
          this.#lock();
          this.#memoryCalendar.addItem(task.item).then(async item => {
            task.item = item;
            this.#modificationActions.push(task);
            await this.#writeICS();
          });
          return;
        case "modify":
          this.#lock();
          this.#memoryCalendar.modifyItem(task.newItem, task.oldItem).then(async item => {
            task.item = item;
            this.#modificationActions.push(task);
            await this.#writeICS();
          });
          return;
        case "delete":
          this.#lock();
          this.#memoryCalendar.deleteItem(task.item).then(async () => {
            this.#modificationActions.push(task);
            await this.#writeICS();
          });
          return;
        case "get_item":
          this.#memoryCalendar.getItem(task.id).then(task.listener);
          break;
        case "get_items":
          task.exec();
          break;
        case "refresh":
          refreshAction = task;
          break;
      }

      if (refreshAction) {
        cal.LOG(
          "[calICSCalendar] Refreshing " +
            this.name +
            (refreshAction.forceRefresh ? " (forced)" : "")
        );
        this.#doRefresh(refreshAction.forceRefresh);

        // break queue processing here and wait for refresh to finish
        // before processing further operations
        break;
      }
    }
  }

  #lock() {
    this.#locked = true;
  }

  #unlock(errCode) {
    cal.ASSERT(this.#locked, "unexpected!");

    this.#modificationActions.forEach(action => {
      const listener = action.listener;
      if (typeof listener == "function") {
        listener(action.item);
      } else if (listener) {
        const args = action.opCompleteArgs;
        cal.ASSERT(args, "missing onOperationComplete call!");
        if (Components.isSuccessCode(args[1]) && errCode && !Components.isSuccessCode(errCode)) {
          listener.onOperationComplete(args[0], errCode, args[2], args[3], null);
        } else {
          listener.onOperationComplete(...args);
        }
      }
    });
    this.#modificationActions = [];

    this.#locked = false;
    this.#processQueue();
  }

  // Visible for testing.
  get _isLocked() {
    return this.#locked;
  }

  /**
   * @see nsIInterfaceRequestor
   * @see calProviderUtils.jsm
   */
  getInterface = cal.provider.InterfaceRequestor_getInterface;

  /**
   * Make a backup of the (remote) calendar
   *
   * This will download the remote file into the profile dir.
   * It should be called before every upload, so every change can be
   * restored. By default, it will keep 3 backups. It also keeps one
   * file each day, for 3 days. That way, even if the user doesn't notice
   * the remote calendar has become corrupted, he will still lose max 1
   * day of work.
   *
   * @returns {Promise} A promise that is settled once backup completed.
   */
  #makeBackup() {
    return new Promise((resolve, reject) => {
      // Uses |pseudoID|, an id of the calendar, defined below
      function makeName(type) {
        return "calBackupData_" + pseudoID + "_" + type + ".ics";
      }

      // This is a bit messy. createUnique creates an empty file,
      // but we don't use that file. All we want is a filename, to be used
      // in the call to copyTo later. So we create a file, get the filename,
      // and never use the file again, but write over it.
      // Using createUnique anyway, because I don't feel like
      // re-implementing it
      function makeDailyFileName() {
        let dailyBackupFile = backupDir.clone();
        dailyBackupFile.append(makeName("day"));
        dailyBackupFile.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, parseInt("0600", 8));
        dailyBackupFileName = dailyBackupFile.leafName;

        // Remove the reference to the nsIFile, because we need to
        // write over the file later, and you never know what happens
        // if something still has a reference.
        // Also makes it explicit that we don't need the file itself,
        // just the name.
        dailyBackupFile = null;

        return dailyBackupFileName;
      }

      function purgeBackupsByType(files, type) {
        // filter out backups of the type we care about.
        const filteredFiles = files.filter(file =>
          file.name.includes("calBackupData_" + pseudoID + "_" + type)
        );
        // Sort by lastmodifed
        filteredFiles.sort((a, b) => a.lastmodified - b.lastmodified);
        // And delete the oldest files, and keep the desired number of
        // old backups
        for (let i = 0; i < filteredFiles.length - numBackupFiles; ++i) {
          const file = backupDir.clone();
          file.append(filteredFiles[i].name);

          try {
            file.remove(false);
          } catch (ex) {
            // This can fail because of some crappy code in
            // nsIFile.  That's not the end of the world.  We can
            // try to remove the file the next time around.
          }
        }
      }

      function purgeOldBackups() {
        // Enumerate files in the backupdir for expiry of old backups
        const files = [];
        for (const file of backupDir.directoryEntries) {
          if (file.isFile()) {
            files.push({ name: file.leafName, lastmodified: file.lastModifiedTime });
          }
        }

        if (doDailyBackup) {
          purgeBackupsByType(files, "day");
        } else {
          purgeBackupsByType(files, "edit");
        }
      }

      function copyToOverwriting(oldFile, newParentDir, newName) {
        try {
          const newFile = newParentDir.clone();
          newFile.append(newName);

          if (newFile.exists()) {
            newFile.remove(false);
          }
          oldFile.copyTo(newParentDir, newName);
        } catch (e) {
          cal.ERROR("[calICSCalendar] Backup failed, no copy: " + e);
          // Error in making a daily/initial backup.
          // not fatal, so just continue
        }
      }

      const backupDays = Services.prefs.getIntPref("calendar.backup.days", 1);
      const numBackupFiles = Services.prefs.getIntPref("calendar.backup.filenum", 3);

      let backupDir;
      try {
        backupDir = cal.provider.getCalendarDirectory();
        backupDir.append("backup");
        if (!backupDir.exists()) {
          backupDir.create(Ci.nsIFile.DIRECTORY_TYPE, parseInt("0755", 8));
        }
      } catch (e) {
        // Backup dir wasn't found. Likely because we are running in
        // xpcshell. Don't die, but continue the upload.
        cal.ERROR("[calICSCalendar] Backup failed, no backupdir:" + e);
        resolve();
        return;
      }

      let pseudoID;
      try {
        pseudoID = this.getProperty("uniquenum2");
        if (!pseudoID) {
          pseudoID = new Date().getTime();
          this.setProperty("uniquenum2", pseudoID);
        }
      } catch (e) {
        // calendarmgr not found. Likely because we are running in
        // xpcshell. Don't die, but continue the upload.
        cal.ERROR("[calICSCalendar] Backup failed, no calendarmanager:" + e);
        resolve();
        return;
      }

      let doInitialBackup = false;
      const initialBackupFile = backupDir.clone();
      initialBackupFile.append(makeName("initial"));
      if (!initialBackupFile.exists()) {
        doInitialBackup = true;
      }

      let doDailyBackup = false;
      const backupTime = this.getProperty("backup-time2");
      if (!backupTime || new Date().getTime() > backupTime + backupDays * 24 * 60 * 60 * 1000) {
        // It's time do to a daily backup
        doDailyBackup = true;
        this.setProperty("backup-time2", new Date().getTime());
      }

      let dailyBackupFileName;
      if (doDailyBackup) {
        dailyBackupFileName = makeDailyFileName(backupDir);
      }

      const backupFile = backupDir.clone();
      backupFile.append(makeName("edit"));
      backupFile.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, parseInt("0600", 8));

      purgeOldBackups();

      // Now go download the remote file, and store it somewhere local.
      const channel = Services.io.newChannelFromURI(
        this.#uri,
        null,
        Services.scriptSecurityManager.getSystemPrincipal(),
        null,
        Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
        Ci.nsIContentPolicy.TYPE_OTHER
      );
      channel.loadFlags |= Ci.nsIRequest.LOAD_BYPASS_CACHE;
      channel.notificationCallbacks = this;

      const downloader = Cc["@mozilla.org/network/downloader;1"].createInstance(Ci.nsIDownloader);
      const listener = {
        onDownloadComplete(opdownloader, request, ctxt, status, result) {
          if (!Components.isSuccessCode(status)) {
            reject();
            return;
          }
          if (doInitialBackup) {
            copyToOverwriting(result, backupDir, makeName("initial"));
          }
          if (doDailyBackup) {
            copyToOverwriting(result, backupDir, dailyBackupFileName);
          }
          resolve();
        },
      };

      downloader.init(listener, backupFile);
      try {
        channel.asyncOpen(downloader);
      } catch (e) {
        // For local files, asyncOpen throws on new (calendar) files
        // No problem, go and upload something
        cal.ERROR("[calICSCalendar] Backup failed in asyncOpen:" + e);
        resolve();
      }
    });
  }
}

/**
 * @implements {calIObserver}
 */
class calICSObserver {
  #calendar = null;

  constructor(calendar) {
    this.#calendar = calendar;
  }

  onStartBatch(aCalendar) {
    this.#calendar.observers.notify("onStartBatch", [aCalendar]);
  }

  onEndBatch(aCalendar) {
    this.#calendar.observers.notify("onEndBatch", [aCalendar]);
  }

  onLoad(aCalendar) {
    this.#calendar.observers.notify("onLoad", [aCalendar]);
  }

  onAddItem(aItem) {
    this.#calendar.observers.notify("onAddItem", [aItem]);
  }

  onModifyItem(aNewItem, aOldItem) {
    this.#calendar.observers.notify("onModifyItem", [aNewItem, aOldItem]);
  }

  onDeleteItem(aDeletedItem) {
    this.#calendar.observers.notify("onDeleteItem", [aDeletedItem]);
  }

  onError(aCalendar, aErrNo, aMessage) {
    this.#calendar.readOnly = true;
    this.#calendar.notifyError(aErrNo, aMessage);
  }

  onPropertyChanged(aCalendar, aName, aValue, aOldValue) {
    this.#calendar.observers.notify("onPropertyChanged", [aCalendar, aName, aValue, aOldValue]);
  }

  onPropertyDeleting(aCalendar, aName) {
    this.#calendar.observers.notify("onPropertyDeleting", [aCalendar, aName]);
  }
}

/*
 * Transport Abstraction Hooks
 *
 * These hooks provide a way to do checks before or after publishing an
 * ICS file. The main use will be to check etags (or some other way to check
 * for remote changes) to protect remote changes from being overwritten.
 *
 * Different protocols need different checks (webdav can do etag, but
 * local files need last-modified stamps), hence different hooks for each
 * types
 */

// dummyHooks are for transport types that don't have hooks of their own.
// Also serves as poor-mans interface definition.
class dummyHooks {
  onBeforeGet(aChannel, aForceRefresh) {
    return true;
  }

  /**
   * @returns {boolean} false if the previous data should be used (the datastore
   *                    didn't change, there might be no data in this GET), true
   *                    in all other cases
   */
  onAfterGet(aChannel) {
    return true;
  }

  onBeforePut(aChannel) {
    return true;
  }

  onAfterPut(aChannel, aRespFunc) {
    aRespFunc();
    return true;
  }
}

class httpHooks {
  #calendar = null;
  #etag = null;
  #lastModified = null;

  constructor(calendar) {
    this.#calendar = calendar;
  }

  onBeforeGet(aChannel, aForceRefresh) {
    const httpchannel = aChannel.QueryInterface(Ci.nsIHttpChannel);
    httpchannel.setRequestHeader("Accept", "text/calendar,text/plain;q=0.8,*/*;q=0.5", false);

    if (this.#etag && !aForceRefresh) {
      // Somehow the webdav header 'If' doesn't work on apache when
      // passing in a Not, so use the http version here.
      httpchannel.setRequestHeader("If-None-Match", this.#etag, false);
    } else if (!aForceRefresh && this.#lastModified) {
      // Only send 'If-Modified-Since' if no ETag is available
      httpchannel.setRequestHeader("If-Modified-Since", this.#lastModified, false);
    }

    return true;
  }

  onAfterGet(aChannel) {
    const httpchannel = aChannel.QueryInterface(Ci.nsIHttpChannel);
    let responseStatus = 0;
    let responseStatusCategory = 0;

    try {
      responseStatus = httpchannel.responseStatus;
      responseStatusCategory = Math.floor(responseStatus / 100);
    } catch (e) {
      // Error might have been a temporary connection issue, keep old data to
      // prevent potential data loss if it becomes available again.
      cal.LOG("[calICSCalendar] Unable to get response status.");
      return false;
    }

    if (responseStatus == 304) {
      // 304: Not Modified
      // Can use the old data, so tell the caller that it can skip parsing.
      cal.LOG("[calICSCalendar] Response status 304: Not Modified. Using the existing data.");
      return false;
    } else if (responseStatus == 404) {
      // 404: Not Found
      // This is a new calendar. Shouldn't try to parse it. But it also
      // isn't a failure, so don't throw.
      cal.LOG("[calICSCalendar] Response status 404: Not Found. This is a new calendar.");
      return false;
    } else if (responseStatus == 410) {
      cal.LOG("[calICSCalendar] Response status 410, calendar is gone. Disabling the calendar.");
      this.#calendar.setProperty("disabled", "true");
      return false;
    } else if (responseStatusCategory == 4 || responseStatusCategory == 5) {
      cal.LOG(
        "[calICSCalendar] Response status " +
          responseStatus +
          ", temporarily disabling calendar for safety."
      );
      this.#calendar.setProperty("disabled", "true");
      this.#calendar.setProperty("auto-enabled", "true");
      return false;
    }

    try {
      this.#etag = httpchannel.getResponseHeader("ETag");
    } catch (e) {
      // No etag header. Now what?
      this.#etag = null;
    }

    try {
      this.#lastModified = httpchannel.getResponseHeader("Last-Modified");
    } catch (e) {
      this.#lastModified = null;
    }

    return true;
  }

  onBeforePut(aChannel) {
    if (this.#etag) {
      const httpchannel = aChannel.QueryInterface(Ci.nsIHttpChannel);

      // Apache doesn't work correctly with if-match on a PUT method,
      // so use the webdav header
      httpchannel.setRequestHeader("If", "([" + this.#etag + "])", false);
    }
    return true;
  }

  onAfterPut(aChannel, aRespFunc) {
    const httpchannel = aChannel.QueryInterface(Ci.nsIHttpChannel);
    try {
      this.#etag = httpchannel.getResponseHeader("ETag");
      aRespFunc();
    } catch (e) {
      // There was no ETag header on the response. This means that
      // putting is not atomic. This is bad. Race conditions can happen,
      // because there is a time in which we don't know the right
      // etag.
      // Try to do the best we can, by immediately getting the etag.
      const etagListener = {};
      const self = this; // need to reference in callback

      etagListener.onStreamComplete = function (
        aLoader,
        aContext,
        aStatus,
        aResultLength,
        aResult
      ) {
        let multistatus;
        try {
          const str = new TextDecoder().decode(Uint8Array.from(aResult));
          multistatus = cal.xml.parseString(str);
        } catch (ex) {
          cal.LOG("[calICSCalendar] Failed to fetch channel etag");
        }

        self.#etag = cal.xml.evalXPathFirst(
          multistatus,
          "/D:propfind/D:response/D:propstat/D:prop/D:getetag",
          icsNSResolver,
          XPathResult.ANY_TYPE
        );
        aRespFunc();
      };
      const queryXml = '<D:propfind xmlns:D="DAV:"><D:prop><D:getetag/></D:prop></D:propfind>';

      const etagChannel = cal.provider.prepHttpChannel(
        aChannel.URI,
        queryXml,
        "text/xml; charset=utf-8",
        this
      );
      etagChannel.setRequestHeader("Depth", "0", false);
      etagChannel.requestMethod = "PROPFIND";
      const streamLoader = Cc["@mozilla.org/network/stream-loader;1"].createInstance(
        Ci.nsIStreamLoader
      );

      cal.provider.sendHttpRequest(streamLoader, etagChannel, etagListener);
    }
    return true;
  }

  // nsIProgressEventSink
  onProgress(aRequest, aProgress, aProgressMax) {}
  onStatus(aRequest, aStatus, aStatusArg) {}

  getInterface(aIid) {
    if (aIid.equals(Ci.nsIProgressEventSink)) {
      return this;
    }
    throw Components.Exception("", Cr.NS_ERROR_NO_INTERFACE);
  }
}

class fileHooks {
  #lastModified = null;

  onBeforeGet(aChannel, aForceRefresh) {
    return true;
  }

  /**
   * @returns {boolean} false if the previous data should be used (the datastore
   *                    didn't change, there might be no data in this GET), true
   *                    in all other cases
   */
  onAfterGet(aChannel) {
    const filechannel = aChannel.QueryInterface(Ci.nsIFileChannel);
    if (this.#lastModified && this.#lastModified == filechannel.file.lastModifiedTime) {
      return false;
    }
    this.#lastModified = filechannel.file.lastModifiedTime;
    return true;
  }

  onBeforePut(aChannel) {
    const filechannel = aChannel.QueryInterface(Ci.nsIFileChannel);
    if (this.#lastModified && this.#lastModified != filechannel.file.lastModifiedTime) {
      return false;
    }
    return true;
  }

  onAfterPut(aChannel, aRespFunc) {
    const filechannel = aChannel.QueryInterface(Ci.nsIFileChannel);
    this.#lastModified = filechannel.file.lastModifiedTime;
    aRespFunc();
    return true;
  }
}
