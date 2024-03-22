/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  FeedParser: "resource:///modules/FeedParser.sys.mjs",
  FeedUtils: "resource:///modules/FeedUtils.sys.mjs",
});

// Cache for all of the feeds currently being downloaded, indexed by URL,
// so the load event listener can access the Feed objects after it finishes
// downloading the feed.
var FeedCache = {
  mFeeds: {},

  putFeed(aFeed) {
    this.mFeeds[this.normalizeHost(aFeed.url)] = aFeed;
  },

  getFeed(aUrl) {
    const index = this.normalizeHost(aUrl);
    if (index in this.mFeeds) {
      return this.mFeeds[index];
    }

    return null;
  },

  removeFeed(aUrl) {
    const index = this.normalizeHost(aUrl);
    if (index in this.mFeeds) {
      delete this.mFeeds[index];
    }
  },

  normalizeHost(aUrl) {
    try {
      let normalizedUrl = Services.io.newURI(aUrl);
      const newHost = normalizedUrl.host.toLowerCase();
      normalizedUrl = normalizedUrl.mutate().setHost(newHost).finalize();
      return normalizedUrl.spec;
    } catch (ex) {
      return aUrl;
    }
  },
};

/**
 * A Feed object. If aFolder is the account root folder, a new subfolder
 * for the feed url is created otherwise the url will be subscribed to the
 * existing aFolder, upon successful download() completion.
 *
 * @class
 * @param  {string} aFeedUrl        - feed url.
 * @param  {nsIMsgFolder} aFolder   - folder containing or to contain the feed
 *                                     subscription.
 */
export function Feed(aFeedUrl, aFolder) {
  this.url = aFeedUrl;
  this.server = aFolder.server;
  if (!aFolder.isServer) {
    this.mFolder = aFolder;
  }
}

Feed.prototype = {
  url: null,
  description: null,
  author: null,
  request: null,
  server: null,
  downloadCallback: null,
  resource: null,
  itemsToStore: [],
  itemsStored: 0,
  fileSize: 0,
  mFolder: null,
  mInvalidFeed: false,
  mFeedType: null,
  mLastModified: null,

  get folder() {
    return this.mFolder;
  },

  set folder(aFolder) {
    this.mFolder = aFolder;
  },

  get name() {
    // Used for the feed's title in Subscribe dialog and opml export.
    const name = this.title || this.description || this.url;
    /* eslint-disable-next-line no-control-regex */
    return name.replace(/[\n\r\t]+/g, " ").replace(/[\x00-\x1F]+/g, "");
  },

  get folderName() {
    if (this.mFolderName) {
      return this.mFolderName;
    }

    // Get a unique sanitized name. Use title or description as a base;
    // these are mandatory by spec. Length of 80 is plenty.
    const folderName = (this.title || this.description || "").substr(0, 80);
    const defaultName =
      lazy.FeedUtils.strings.GetStringFromName("ImportFeedsNew");
    return (this.mFolderName = lazy.FeedUtils.getSanitizedFolderName(
      this.server.rootMsgFolder,
      folderName,
      defaultName,
      true
    ));
  },

  download(aParseItems, aCallback) {
    // May be null.
    this.downloadCallback = aCallback;

    // Whether or not to parse items when downloading and parsing the feed.
    // Defaults to true, but setting to false is useful for obtaining
    // just the title of the feed when the user subscribes to it.
    this.parseItems = aParseItems == null || aParseItems;

    // Before we do anything, make sure the url is an http url.  This is just
    // a sanity check so we don't try opening mailto urls, imap urls, etc. that
    // the user may have tried to subscribe to as an rss feed.
    if (!lazy.FeedUtils.isValidScheme(this.url)) {
      // Simulate an invalid feed error.
      lazy.FeedUtils.log.info(
        "Feed.download: invalid protocol for - " + this.url
      );
      this.onParseError(this);
      return;
    }

    // Before we try to download the feed, make sure we aren't already
    // processing the feed by looking up the url in our feed cache.
    if (FeedCache.getFeed(this.url)) {
      if (this.downloadCallback) {
        this.downloadCallback.downloaded(
          this,
          lazy.FeedUtils.kNewsBlogFeedIsBusy
        );
      }

      // Return, the feed is already in use.
      return;
    }

    if (Services.io.offline) {
      // If offline and don't want to go online, just add the feed subscription;
      // it can be verified later (the folder name will be the url if not adding
      // to an existing folder). Only for subscribe actions; passive biff and
      // active get new messages are handled prior to getting here.
      const win = Services.wm.getMostRecentWindow("mail:3pane");
      if (!win.MailOfflineMgr.getNewMail()) {
        this.storeNextItem();
        return;
      }
    }

    this.request = new XMLHttpRequest();
    // Must set onProgress before calling open.
    this.request.onprogress = this.onProgress;
    this.request.open("GET", this.url, true);
    this.request.channel.loadFlags |=
      Ci.nsIRequest.LOAD_BYPASS_CACHE | Ci.nsIRequest.INHIBIT_CACHING;

    // Some servers, if sent If-Modified-Since, will send 304 if subsequently
    // not sent If-Modified-Since, as in the case of an unsubscribe and new
    // subscribe.  Send start of century date to force a download; some servers
    // will 304 on older dates (such as epoch 1970).
    const lastModified = this.lastModified || "Sat, 01 Jan 2000 00:00:00 GMT";
    this.request.setRequestHeader("If-Modified-Since", lastModified);

    // Only order what you're going to eat...
    this.request.responseType = "document";
    this.request.overrideMimeType("text/xml");
    this.request.setRequestHeader("Accept", lazy.FeedUtils.REQUEST_ACCEPT);
    this.request.timeout = lazy.FeedUtils.REQUEST_TIMEOUT;
    this.request.onload = this.onDownloaded;
    this.request.onreadystatechange = this.onReadyStateChange;
    this.request.onerror = this.onDownloadError;
    this.request.ontimeout = this.onDownloadError;
    FeedCache.putFeed(this);
    this.request.send(null);
  },

  onReadyStateChange(aEvent) {
    // Once a server responds with data, reset the timeout to allow potentially
    // large files to complete the download.
    const request = aEvent.target;
    if (request.timeout && request.readyState == request.LOADING) {
      request.timeout = 0;
    }
  },

  onDownloaded(aEvent) {
    const request = aEvent.target;
    const isHttp = request.channel.originalURI.scheme.startsWith("http");
    const url = request.channel.originalURI.spec;
    if (isHttp && (request.status < 200 || request.status >= 300)) {
      Feed.prototype.onDownloadError(aEvent);
      return;
    }

    lazy.FeedUtils.log.debug(
      "Feed.onDownloaded: got a download, fileSize:url - " +
        aEvent.loaded +
        " : " +
        url
    );
    const feed = FeedCache.getFeed(url);
    if (!feed) {
      throw new Error(
        "Feed.onDownloaded: error - couldn't retrieve feed from cache"
      );
    }

    // If the server sends a Last-Modified header, store the property on the
    // feed so we can use it when making future requests, to avoid downloading
    // and parsing feeds that have not changed.  Don't update if merely checking
    // the url, as for subscribe move/copy, as a subsequent refresh may get a 304.
    // Save the response and persist it only upon successful completion of the
    // refresh cycle (i.e. not if the request is cancelled).
    const lastModifiedHeader = request.getResponseHeader("Last-Modified");
    feed.mLastModified =
      lastModifiedHeader && feed.parseItems ? lastModifiedHeader : null;

    feed.fileSize = aEvent.loaded;

    // The download callback is called asynchronously when parse() is done.
    feed.parse();
  },

  onProgress(aEvent) {
    const request = aEvent.target;
    const url = request.channel.originalURI.spec;
    const feed = FeedCache.getFeed(url);

    if (feed.downloadCallback) {
      feed.downloadCallback.onProgress(
        feed,
        aEvent.loaded,
        aEvent.total,
        aEvent.lengthComputable
      );
    }
  },

  onDownloadError(aEvent) {
    const request = aEvent.target;
    const url = request.channel.originalURI.spec;
    const feed = FeedCache.getFeed(url);
    if (feed.downloadCallback) {
      // Generic network or 'not found' error initially.
      let error = lazy.FeedUtils.kNewsBlogRequestFailure;
      // Certain errors should disable the feed.
      let disable = false;

      if (request.status == 304) {
        // If the http status code is 304, the feed has not been modified
        // since we last downloaded it and does not need to be parsed.
        error = lazy.FeedUtils.kNewsBlogNoNewItems;
      } else {
        const [errType, errName] =
          lazy.FeedUtils.createTCPErrorFromFailedXHR(request);
        lazy.FeedUtils.log.info(
          "Feed.onDownloaded: request errType:errName:statusCode - " +
            errType +
            ":" +
            errName +
            ":" +
            request.status
        );
        if (errType == "SecurityCertificate") {
          // This is the code for nsINSSErrorsService.ERROR_CLASS_BAD_CERT
          // overridable security certificate errors.
          error = lazy.FeedUtils.kNewsBlogBadCertError;
        }

        if (request.status == 401 || request.status == 403) {
          // Unauthorized or Forbidden.
          error = lazy.FeedUtils.kNewsBlogNoAuthError;
        }

        if (
          request.status != 0 ||
          error == lazy.FeedUtils.kNewsBlogBadCertError ||
          errName == "DomainNotFoundError"
        ) {
          disable = true;
        }
      }

      feed.downloadCallback.downloaded(feed, error, disable);
    }

    FeedCache.removeFeed(url);
  },

  onParseError(aFeed) {
    if (!aFeed) {
      return;
    }

    aFeed.mInvalidFeed = true;
    if (aFeed.downloadCallback) {
      aFeed.downloadCallback.downloaded(
        aFeed,
        lazy.FeedUtils.kNewsBlogInvalidFeed,
        true
      );
    }

    FeedCache.removeFeed(aFeed.url);
  },

  onUrlChange(aFeed, aOldUrl) {
    if (!aFeed) {
      return;
    }

    // Simulate a cancel after a url update; next cycle will check the new url.
    aFeed.mInvalidFeed = true;
    if (aFeed.downloadCallback) {
      aFeed.downloadCallback.downloaded(aFeed, lazy.FeedUtils.kNewsBlogCancel);
    }

    FeedCache.removeFeed(aOldUrl);
  },

  // nsIUrlListener methods for getDatabaseWithReparse().
  OnStartRunningUrl() {},
  OnStopRunningUrl(aUrl, aExitCode) {
    if (Components.isSuccessCode(aExitCode)) {
      lazy.FeedUtils.log.debug(
        "Feed.OnStopRunningUrl: rebuilt msgDatabase for " +
          this.folder.name +
          " - " +
          this.folder.filePath.path
      );
    } else {
      lazy.FeedUtils.log.error(
        "Feed.OnStopRunningUrl: rebuild msgDatabase failed, " +
          "error " +
          aExitCode +
          ", for " +
          this.folder.name +
          " - " +
          this.folder.filePath.path
      );
    }
    // Continue.
    this.storeNextItem();
  },

  get title() {
    return lazy.FeedUtils.getSubscriptionAttr(
      this.url,
      this.server,
      "title",
      ""
    );
  },

  set title(aNewTitle) {
    if (!aNewTitle) {
      return;
    }
    lazy.FeedUtils.setSubscriptionAttr(
      this.url,
      this.server,
      "title",
      aNewTitle
    );
  },

  get lastModified() {
    return lazy.FeedUtils.getSubscriptionAttr(
      this.url,
      this.server,
      "lastModified",
      ""
    );
  },

  set lastModified(aLastModified) {
    lazy.FeedUtils.setSubscriptionAttr(
      this.url,
      this.server,
      "lastModified",
      aLastModified
    );
  },

  get quickMode() {
    const defaultValue = this.server.getBoolValue("quickMode");
    return lazy.FeedUtils.getSubscriptionAttr(
      this.url,
      this.server,
      "quickMode",
      defaultValue
    );
  },

  set quickMode(aNewQuickMode) {
    lazy.FeedUtils.setSubscriptionAttr(
      this.url,
      this.server,
      "quickMode",
      aNewQuickMode
    );
  },

  get options() {
    const options = lazy.FeedUtils.getSubscriptionAttr(
      this.url,
      this.server,
      "options",
      null
    );
    if (options && options.version == lazy.FeedUtils._optionsDefault.version) {
      return options;
    }

    const newOptions = lazy.FeedUtils.newOptions(options);
    this.options = newOptions;
    return newOptions;
  },

  set options(aOptions) {
    const newOptions = aOptions ? aOptions : lazy.FeedUtils.optionsTemplate;
    lazy.FeedUtils.setSubscriptionAttr(
      this.url,
      this.server,
      "options",
      newOptions
    );
  },

  get link() {
    return lazy.FeedUtils.getSubscriptionAttr(
      this.url,
      this.server,
      "link",
      ""
    );
  },

  set link(aNewLink) {
    if (!aNewLink) {
      return;
    }
    lazy.FeedUtils.setSubscriptionAttr(this.url, this.server, "link", aNewLink);
  },

  parse() {
    // Create a feed parser which will parse the feed.
    let parser = new lazy.FeedParser();
    this.itemsToStore = parser.parseFeed(this, this.request.responseXML);
    parser = null;

    if (this.mInvalidFeed) {
      this.request = null;
      this.mInvalidFeed = false;
      return;
    }

    this.itemsToStoreIndex = 0;
    this.itemsStored = 0;

    // At this point, if we have items to potentially store and an existing
    // folder, ensure the folder's msgDatabase is openable for new message
    // processing. If not, reparse with an async nsIUrlListener |this| to
    // continue once the reparse is complete.
    if (
      this.itemsToStore.length > 0 &&
      this.folder &&
      !lazy.FeedUtils.isMsgDatabaseOpenable(this.folder, true, this)
    ) {
      return;
    }

    // We have an msgDatabase; storeNextItem() will iterate through the parsed
    // items, storing each one.
    this.storeNextItem();
  },

  /**
   * Clear the 'valid' field of all feeditems associated with this feed.
   *
   * @returns {void}
   */
  invalidateItems() {
    const ds = lazy.FeedUtils.getItemsDS(this.server);
    for (const id in ds.data) {
      const item = ds.data[id];
      if (item.feedURLs.includes(this.url)) {
        item.valid = false;
        lazy.FeedUtils.log.trace("Feed.invalidateItems: item - " + id);
      }
    }
    ds.saveSoon();
  },

  /**
   * Discards invalid items (in the feed item store) associated with the
   * feed. There's a delay - invalid items are kept around for a set time
   * before being purged.
   *
   * @param {Boolean} aDeleteFeed - is the feed being deleted (bypasses
   *                                the delay time).
   * @returns {void}
   */
  removeInvalidItems(aDeleteFeed) {
    const ds = lazy.FeedUtils.getItemsDS(this.server);
    lazy.FeedUtils.log.debug("Feed.removeInvalidItems: for url - " + this.url);

    const currentTime = new Date().getTime();
    for (const id in ds.data) {
      const item = ds.data[id];
      // skip valid items and ones not part of this feed.
      if (!item.feedURLs.includes(this.url) || item.valid) {
        continue;
      }
      const lastSeenTime = item.lastSeenTime || 0;

      if (
        currentTime - lastSeenTime < lazy.FeedUtils.INVALID_ITEM_PURGE_DELAY &&
        !aDeleteFeed
      ) {
        // Don't immediately purge items in active feeds; do so for deleted feeds.
        continue;
      }

      lazy.FeedUtils.log.trace("Feed.removeInvalidItems: item - " + id);
      // Detach the item from this feed (it could be shared by multiple feeds).
      item.feedURLs = item.feedURLs.filter(url => url != this.url);
      if (item.feedURLs.length > 0) {
        lazy.FeedUtils.log.debug(
          "Feed.removeInvalidItems: " +
            id +
            " is from more than one feed; only the reference to" +
            " this feed removed"
        );
      } else {
        delete ds.data[id];
      }
    }
    ds.saveSoon();
  },

  createFolder() {
    if (this.folder) {
      return;
    }

    try {
      this.folder = this.server.rootMsgFolder
        .QueryInterface(Ci.nsIMsgLocalMailFolder)
        .createLocalSubfolder(this.folderName);
    } catch (ex) {
      // An error creating.
      lazy.FeedUtils.log.info(
        "Feed.createFolder: error creating folder - '" +
          this.folderName +
          "' in parent folder " +
          this.server.rootMsgFolder.filePath.path +
          " -- " +
          ex
      );
      // But its remnants are still there, clean up.
      const xfolder = this.server.rootMsgFolder.getChildNamed(this.folderName);
      this.server.rootMsgFolder.propagateDelete(xfolder, true);
    }
  },

  // Gets the next item from itemsToStore and forces that item to be stored
  // to the folder.  If more items are left to be stored, fires a timer for
  // the next one, otherwise triggers a download done notification to the UI.
  storeNextItem() {
    if (lazy.FeedUtils.CANCEL_REQUESTED) {
      lazy.FeedUtils.CANCEL_REQUESTED = false;
      this.cleanupParsingState(this, lazy.FeedUtils.kNewsBlogCancel);
      return;
    }

    if (this.itemsToStore.length == 0) {
      let code = lazy.FeedUtils.kNewsBlogSuccess;
      this.createFolder();
      if (!this.folder) {
        code = lazy.FeedUtils.kNewsBlogFileError;
      }

      this.cleanupParsingState(this, code);
      return;
    }

    const item = this.itemsToStore[this.itemsToStoreIndex];

    if (item.store()) {
      this.itemsStored++;
    }

    if (!this.folder) {
      this.cleanupParsingState(this, lazy.FeedUtils.kNewsBlogFileError);
      return;
    }

    this.itemsToStoreIndex++;

    // If the listener is tracking progress for each item, report it here.
    if (
      item.feed.downloadCallback &&
      item.feed.downloadCallback.onFeedItemStored
    ) {
      item.feed.downloadCallback.onFeedItemStored(
        item.feed,
        this.itemsToStoreIndex,
        this.itemsToStore.length
      );
    }

    // Eventually we'll report individual progress here.

    if (this.itemsToStoreIndex < this.itemsToStore.length) {
      if (!this.storeItemsTimer) {
        this.storeItemsTimer = Cc["@mozilla.org/timer;1"].createInstance(
          Ci.nsITimer
        );
      }

      this.storeItemsTimer.initWithCallback(
        this,
        50,
        Ci.nsITimer.TYPE_ONE_SHOT
      );
    } else {
      // We have just finished downloading one or more feed items into the
      // destination folder; if the folder is still listed as having new
      // messages in it, then we should set the biff state on the folder so the
      // right RDF UI changes happen in the folder pane to indicate new mail.
      if (item.feed.folder.hasNewMessages) {
        item.feed.folder.biffState = Ci.nsIMsgFolder.nsMsgBiffState_NewMail;
        // Run the bayesian spam filter, if enabled.
        item.feed.folder.callFilterPlugins(null);
      }

      this.cleanupParsingState(this, lazy.FeedUtils.kNewsBlogSuccess);
    }
  },

  cleanupParsingState(aFeed, aCode) {
    // Now that we are done parsing the feed, remove the feed from the cache.
    FeedCache.removeFeed(aFeed.url);

    if (aFeed.parseItems) {
      // Do this only if we're in parse/store mode.
      aFeed.removeInvalidItems(false);

      if (aCode == lazy.FeedUtils.kNewsBlogSuccess && aFeed.mLastModified) {
        aFeed.lastModified = aFeed.mLastModified;
      }

      // Flush any feed item changes to disk.
      const ds = lazy.FeedUtils.getItemsDS(aFeed.server);
      ds.saveSoon();
      lazy.FeedUtils.log.debug(
        "Feed.cleanupParsingState: items stored - " + this.itemsStored
      );
    }

    // Force the xml http request to go away.  This helps reduce some nasty
    // assertions on shut down.
    this.request = null;
    this.itemsToStore = [];
    this.itemsToStoreIndex = 0;
    this.storeItemsTimer = null;

    if (aFeed.downloadCallback) {
      aFeed.downloadCallback.downloaded(aFeed, aCode);
    }
  },

  // nsITimerCallback
  notify() {
    this.storeNextItem();
  },
};
