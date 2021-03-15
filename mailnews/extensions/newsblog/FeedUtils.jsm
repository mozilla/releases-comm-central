/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["FeedUtils"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  Feed: "resource:///modules/Feed.jsm",
  jsmime: "resource:///modules/jsmime.jsm",
  JSONFile: "resource://gre/modules/JSONFile.jsm",
  MailServices: "resource:///modules/MailServices.jsm",
  MailUtils: "resource:///modules/MailUtils.jsm",
  Services: "resource://gre/modules/Services.jsm",
});

var FeedUtils = {
  MOZ_PARSERERROR_NS: "http://www.mozilla.org/newlayout/xml/parsererror.xml",

  RDF_SYNTAX_NS: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  RDF_SYNTAX_TYPE: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
  RSS_090_NS: "http://my.netscape.com/rdf/simple/0.9/",

  RSS_NS: "http://purl.org/rss/1.0/",

  RSS_CONTENT_NS: "http://purl.org/rss/1.0/modules/content/",

  RSS_SY_NS: "http://purl.org/rss/1.0/modules/syndication/",
  RSS_SY_UNITS: ["hourly", "daily", "weekly", "monthly", "yearly"],
  kBiffUnitsMinutes: "min",
  kBiffUnitsDays: "d",

  DC_NS: "http://purl.org/dc/elements/1.1/",

  MRSS_NS: "http://search.yahoo.com/mrss/",
  FEEDBURNER_NS: "http://rssnamespace.org/feedburner/ext/1.0",
  ITUNES_NS: "http://www.itunes.com/dtds/podcast-1.0.dtd",

  FZ_NS: "urn:forumzilla:",
  FZ_ITEM_NS: "urn:feeditem:",

  // Atom constants
  ATOM_03_NS: "http://purl.org/atom/ns#",
  ATOM_IETF_NS: "http://www.w3.org/2005/Atom",
  ATOM_THREAD_NS: "http://purl.org/syndication/thread/1.0",

  // Accept content mimetype preferences for feeds.
  REQUEST_ACCEPT:
    "application/atom+xml," +
    "application/rss+xml;q=0.9," +
    "application/rdf+xml;q=0.8," +
    "application/xml;q=0.7,text/xml;q=0.7," +
    "*/*;q=0.1",
  // Timeout for nonresponse to request, 30 seconds.
  REQUEST_TIMEOUT: 30 * 1000,

  MILLISECONDS_PER_DAY: 24 * 60 * 60 * 1000,

  // Maximum number of concurrent in progress feeds, across all accounts.
  kMaxConcurrentFeeds: 25,
  get MAX_CONCURRENT_FEEDS() {
    let pref = "rss.max_concurrent_feeds";
    if (Services.prefs.prefHasUserValue(pref)) {
      return Services.prefs.getIntPref(pref);
    }

    Services.prefs.setIntPref(pref, FeedUtils.kMaxConcurrentFeeds);
    return FeedUtils.kMaxConcurrentFeeds;
  },

  // The amount of time, specified in milliseconds, to leave an item in the
  // feeditems cache after the item has disappeared from the publisher's
  // file. The default delay is one day.
  kInvalidItemPurgeDelayDays: 1,
  get INVALID_ITEM_PURGE_DELAY() {
    let pref = "rss.invalid_item_purge_delay_days";
    if (Services.prefs.prefHasUserValue(pref)) {
      return Services.prefs.getIntPref(pref) * this.MILLISECONDS_PER_DAY;
    }

    Services.prefs.setIntPref(pref, FeedUtils.kInvalidItemPurgeDelayDays);
    return FeedUtils.kInvalidItemPurgeDelayDays * this.MILLISECONDS_PER_DAY;
  },

  // Polling interval to check individual feed update interval preference.
  kBiffPollMinutes: 1,
  kNewsBlogSuccess: 0,
  // Usually means there was an error trying to parse the feed.
  kNewsBlogInvalidFeed: 1,
  // Generic networking failure when trying to download the feed.
  kNewsBlogRequestFailure: 2,
  kNewsBlogFeedIsBusy: 3,
  // For 304 Not Modified; There are no new articles for this feed.
  kNewsBlogNoNewItems: 4,
  kNewsBlogCancel: 5,
  kNewsBlogFileError: 6,
  // Invalid certificate, for overridable user exception errors.
  kNewsBlogBadCertError: 7,
  // For 401 Unauthorized or 403 Forbidden.
  kNewsBlogNoAuthError: 8,

  CANCEL_REQUESTED: false,
  AUTOTAG: "~AUTOTAG",

  FEED_ACCOUNT_TYPES: ["rss"],

  /**
   * Get all rss account servers rootFolders.
   *
   * @returns {nsIMsgIncomingServer}[] - Array of servers (empty array if none).
   */
  getAllRssServerRootFolders() {
    let rssRootFolders = [];
    for (let server of MailServices.accounts.allServers) {
      if (server && server.type == "rss") {
        rssRootFolders.push(server.rootFolder);
      }
    }

    // By default, Tb sorts by hostname, ie Feeds, Feeds-1, and not by alpha
    // prettyName.  Do the same as a stock install to match folderpane order.
    rssRootFolders.sort(function(a, b) {
      return a.hostname > b.hostname;
    });

    return rssRootFolders;
  },

  /**
   * Create rss account.
   *
   * @param {String} aName     - Optional account name to override default.
   * @returns {nsIMsgAccount}  - The creaged account.
   */
  createRssAccount(aName) {
    let userName = "nobody";
    let hostName = "Feeds";
    let hostNamePref = hostName;
    let server;
    let serverType = "rss";
    let defaultName = FeedUtils.strings.GetStringFromName("feeds-accountname");
    let i = 2;
    while (
      MailServices.accounts.findRealServer(userName, hostName, serverType, 0)
    ) {
      // If "Feeds" exists, try "Feeds-2", then "Feeds-3", etc.
      hostName = hostNamePref + "-" + i++;
    }

    server = MailServices.accounts.createIncomingServer(
      userName,
      hostName,
      serverType
    );
    server.biffMinutes = FeedUtils.kBiffPollMinutes;
    server.prettyName = aName ? aName : defaultName;
    server.valid = true;
    let account = MailServices.accounts.createAccount();
    account.incomingServer = server;
    // Initialize the feed_options now.
    this.getOptionsAcct(server);

    // Ensure the Trash folder db (.msf) is created otherwise folder/message
    // deletes will throw until restart creates it.
    server.msgStore.discoverSubFolders(server.rootMsgFolder, false);

    // Create "Local Folders" if none exist yet as it's guaranteed that
    // those exist when any account exists.
    let localFolders;
    try {
      localFolders = MailServices.accounts.localFoldersServer;
    } catch (ex) {}

    if (!localFolders) {
      MailServices.accounts.createLocalMailAccount();
    }

    // Save new accounts in case of a crash.
    try {
      MailServices.accounts.saveAccountInfo();
    } catch (ex) {
      this.log.error(
        "FeedUtils.createRssAccount: error on saveAccountInfo - " + ex
      );
    }

    this.log.debug(
      "FeedUtils.createRssAccount: " +
        account.incomingServer.rootFolder.prettyName
    );

    return account;
  },

  /**
   * Helper routine that checks our subscriptions list array and returns
   * true if the url is already in our list.  This is used to prevent the
   * user from subscribing to the same feed multiple times for the same server.
   *
   * @param {String} aUrl                  - The url.
   * @param {nsIMsgIncomingServer} aServer - Account server.
   * @returns {Boolean}                    - true if exists else false.
   */
  feedAlreadyExists(aUrl, aServer) {
    let ds = this.getSubscriptionsDS(aServer);
    let sub = ds.data.find(x => x.url == aUrl);
    if (sub === undefined) {
      return false;
    }
    let folder = sub.destFolder;
    this.log.info(
      "FeedUtils.feedAlreadyExists: feed url " +
        aUrl +
        " subscribed in folder url " +
        decodeURI(folder)
    );

    return true;
  },

  /**
   * Download a feed url on biff or get new messages.
   *
   * @param {nsIMsgFolder} aFolder         - The folder.
   * @param {nsIUrlListener} aUrlListener  - Feed url.
   * @param {Boolean} aIsBiff              - true if biff, false if manual get.
   * @param {nsIDOMWindow} aMsgWindow      - The window.
   *
   * @returns {void}
   */
  downloadFeed(aFolder, aUrlListener, aIsBiff, aMsgWindow) {
    FeedUtils.log.debug(
      "downloadFeed: account isBiff:isOffline - " +
        aIsBiff +
        " : " +
        Services.io.offline
    );
    // User set.
    if (Services.io.offline) {
      return;
    }

    // No network connection. Unfortunately, this is only set if the event is
    // received by Tb from the OS (ie it must already be running) and doesn't
    // necessarily mean connectivity to the internet, only the nearest network
    // point. But it's something.
    if (!Services.io.connectivity) {
      FeedUtils.log.warn("downloadFeed: network connection unavailable");
      return;
    }

    // We don't yet support the ability to check for new articles while we are
    // in the middle of subscribing to a feed. For now, abort the check for
    // new feeds.
    if (FeedUtils.progressNotifier.mSubscribeMode) {
      FeedUtils.log.warn(
        "downloadFeed: Aborting RSS New Mail Check. " +
          "Feed subscription in progress\n"
      );
      return;
    }

    let forceDownload = !aIsBiff;
    let inStartup = false;
    if (aFolder.isServer) {
      // The lastUpdateTime is |null| only at session startup/initialization.
      // Note: feed processing does not impact startup, as the biff poll
      // will go off in about kBiffPollMinutes (1) and process each feed
      // according to its own lastUpdatTime/update frequency.
      if (FeedUtils.getStatus(aFolder, aFolder.URI).lastUpdateTime === null) {
        inStartup = true;
      }

      FeedUtils.setStatus(aFolder, aFolder.URI, "lastUpdateTime", Date.now());
    }

    let allFolders = aFolder.descendants;
    if (!aFolder.isServer) {
      // Add the base folder; it does not get returned by .descendants. Do not
      // add the account folder as it doesn't have the feedUrl property or even
      // a msgDatabase necessarily.
      allFolders.unshift(aFolder);
    }

    let folder;
    function* feeder() {
      for (let i = 0; i < allFolders.length; i++) {
        folder = allFolders[i];
        FeedUtils.log.debug(
          "downloadFeed: START x/# folderName:folderPath - " +
            (i + 1) +
            "/" +
            allFolders.length +
            " " +
            folder.name +
            " : " +
            folder.filePath.path
        );

        let feedUrlArray = FeedUtils.getFeedUrlsInFolder(folder);
        // Continue if there are no feedUrls for the folder in the feeds
        // database.  All folders in Trash are skipped.
        if (!feedUrlArray) {
          continue;
        }

        FeedUtils.log.debug(
          "downloadFeed: CONTINUE foldername:urlArray - " +
            folder.name +
            " : " +
            feedUrlArray
        );

        // We need to kick off a download for each feed.
        let now = Date.now();
        for (let url of feedUrlArray) {
          // Check whether this feed should be updated; if forceDownload is true
          // skip the per feed check.
          if (!forceDownload) {
            let status = FeedUtils.getStatus(folder, url);
            // Also skip if user paused, or error paused (but not inStartup;
            // go check the feed again), or update interval hasn't expired.
            if (
              status.enabled === false ||
              (status.enabled === null && !inStartup) ||
              now - status.lastUpdateTime < status.updateMinutes * 60000
            ) {
              FeedUtils.log.debug(
                "downloadFeed: SKIP feed, " +
                  "aIsBiff:enabled:minsSinceLastUpdate::url - " +
                  aIsBiff +
                  " : " +
                  status.enabled +
                  " : " +
                  Math.round((now - status.lastUpdateTime) / 60) / 1000 +
                  " :: " +
                  url
              );
              continue;
            }
          }

          // Create a feed object.
          let feed = new Feed(url, folder);

          // init can be called multiple times. Checks if it should actually
          // init itself.
          FeedUtils.progressNotifier.init(aMsgWindow, false);

          // Bump our pending feed download count. From now on, all feeds will
          // be resolved and finish with progressNotifier.downloaded(). Any
          // early returns must call downloaded() so mNumPendingFeedDownloads
          // is decremented and notification/status feedback is reset.
          FeedUtils.progressNotifier.mNumPendingFeedDownloads++;

          // If the current active count exceeds the max desired, exit from
          // the current poll cycle. Only throttle for a background biff; for
          // a user manual get messages, do them all.
          if (
            aIsBiff &&
            FeedUtils.progressNotifier.mNumPendingFeedDownloads >
              FeedUtils.MAX_CONCURRENT_FEEDS
          ) {
            FeedUtils.log.debug(
              "downloadFeed: RETURN active feeds count is greater " +
                "than the max - " +
                FeedUtils.MAX_CONCURRENT_FEEDS
            );
            FeedUtils.progressNotifier.downloaded(
              feed,
              FeedUtils.kNewsBlogFeedIsBusy
            );
            return;
          }

          // Set status info and download.
          FeedUtils.log.debug("downloadFeed: DOWNLOAD feed url - " + url);
          FeedUtils.setStatus(
            folder,
            url,
            "code",
            FeedUtils.kNewsBlogFeedIsBusy
          );
          feed.download(true, FeedUtils.progressNotifier);

          Services.tm.mainThread.dispatch(function() {
            try {
              let done = getFeed.next().done;
              if (done) {
                // Finished with all feeds in base aFolder and its subfolders.
                FeedUtils.log.debug(
                  "downloadFeed: Finished with folder - " + aFolder.name
                );
                folder = null;
                allFolders = null;
              }
            } catch (ex) {
              FeedUtils.log.error("downloadFeed: error - " + ex);
              FeedUtils.progressNotifier.downloaded(
                feed,
                FeedUtils.kNewsBlogFeedIsBusy
              );
            }
          }, Ci.nsIThread.DISPATCH_NORMAL);

          yield undefined;
        }
      }
    }

    let getFeed = feeder();
    try {
      let done = getFeed.next().done;
      if (done) {
        // Nothing to do.
        FeedUtils.log.debug(
          "downloadFeed: Nothing to do in folder - " + aFolder.name
        );
        folder = null;
        allFolders = null;
      }
    } catch (ex) {
      FeedUtils.log.error("downloadFeed: error - " + ex);
      FeedUtils.progressNotifier.downloaded(
        { folder: aFolder, url: "" },
        FeedUtils.kNewsBlogFeedIsBusy
      );
    }
  },

  /**
   * Subscribe a new feed url.
   *
   * @param {String} aUrl              - Feed url.
   * @param {nsIMsgFolder} aFolder     - Folder.
   * @param {nsIDOMWindow} aMsgWindow  - The window.
   *
   * @returns {void}
   */
  subscribeToFeed(aUrl, aFolder, aMsgWindow) {
    // We don't support the ability to subscribe to several feeds at once yet.
    // For now, abort the subscription if we are already in the middle of
    // subscribing to a feed via drag and drop.
    if (FeedUtils.progressNotifier.mNumPendingFeedDownloads > 0) {
      FeedUtils.log.warn(
        "subscribeToFeed: Aborting RSS subscription. " +
          "Feed downloads already in progress\n"
      );
      return;
    }

    // If aFolder is null, then use the root folder for the first RSS account.
    if (!aFolder) {
      aFolder = FeedUtils.getAllRssServerRootFolders()[0];
    }

    // If the user has no Feeds account yet, create one.
    if (!aFolder) {
      aFolder = FeedUtils.createRssAccount().incomingServer.rootFolder;
    }

    if (!aMsgWindow) {
      let wlist = Services.wm.getEnumerator("mail:3pane");
      if (wlist.hasMoreElements()) {
        let win = wlist.getNext();
        win.focus();
        aMsgWindow = win.msgWindow;
      } else {
        // If there are no open windows, open one, pass it the URL, and
        // during opening it will subscribe to the feed.
        let arg = Cc["@mozilla.org/supports-string;1"].createInstance(
          Ci.nsISupportsString
        );
        arg.data = aUrl;
        Services.ww.openWindow(
          null,
          "chrome://messenger/content/messenger.xhtml",
          "_blank",
          "chrome,dialog=no,all",
          arg
        );
        return;
      }
    }

    // If aUrl is a feed url, then it is either of the form
    // feed://example.org/feed.xml or feed:https://example.org/feed.xml.
    // Replace feed:// with http:// per the spec, then strip off feed:
    // for the second case.
    aUrl = aUrl.replace(/^feed:\x2f\x2f/i, "http://");
    aUrl = aUrl.replace(/^feed:/i, "");

    // Make sure we aren't already subscribed to this feed before we attempt
    // to subscribe to it.
    if (FeedUtils.feedAlreadyExists(aUrl, aFolder.server)) {
      aMsgWindow.statusFeedback.showStatusString(
        FeedUtils.strings.GetStringFromName("subscribe-feedAlreadySubscribed")
      );
      return;
    }

    let feed = new Feed(aUrl, aFolder);
    // Default setting for new feeds per account settings.
    feed.quickMode = feed.server.getBoolValue("quickMode");
    feed.options = FeedUtils.getOptionsAcct(feed.server);

    FeedUtils.progressNotifier.init(aMsgWindow, true);
    FeedUtils.progressNotifier.mNumPendingFeedDownloads++;
    feed.download(true, FeedUtils.progressNotifier);
  },

  /**
   * Enable or disable updates for all subscriptions in a folder, or all
   * subscriptions in an account if the folder is the account folder.
   * A folder's subfolders' feeds are not included.
   *
   * @param {nsIMsgFolder} aFolder     - Folder or account folder (server).
   * @param {Boolean} aPause           - To pause or not to pause.
   * @param {Boolean} aBiffNow         - If aPause is false, and aBiffNow is true
   *                                     do the biff immediately.
   * @returns {void}
   */
  pauseFeedFolderUpdates(aFolder, aPause, aBiffNow) {
    if (aFolder.isServer) {
      let serverFolder = aFolder.server.rootFolder;
      // Remove server from biff first. If enabling biff, this will make the
      // latest biffMinutes take effect now rather than waiting for the timer
      // to expire.
      aFolder.server.doBiff = false;
      if (!aPause) {
        aFolder.server.doBiff = true;
      }

      FeedUtils.setStatus(serverFolder, serverFolder.URI, "enabled", !aPause);
      if (!aPause && aBiffNow) {
        aFolder.server.performBiff(null);
      }

      return;
    }

    let feedUrls = FeedUtils.getFeedUrlsInFolder(aFolder);
    if (!feedUrls) {
      return;
    }

    for (let feedUrl of feedUrls) {
      let feed = new Feed(feedUrl, aFolder);
      let options = feed.options;
      options.updates.enabled = !aPause;
      feed.options = options;
      FeedUtils.setStatus(aFolder, feedUrl, "enabled", !aPause);
      FeedUtils.log.debug(
        "pauseFeedFolderUpdates: enabled:url " + !aPause + ": " + feedUrl
      );
    }

    let win = Services.wm.getMostRecentWindow("Mail:News-BlogSubscriptions");
    if (win) {
      let curItem = win.FeedSubscriptions.mView.currentItem;
      win.FeedSubscriptions.refreshSubscriptionView();
      if (curItem.container) {
        win.FeedSubscriptions.selectFolder(curItem.folder);
      } else {
        let feed = new Feed(curItem.url, curItem.parentFolder);
        win.FeedSubscriptions.selectFeed(feed);
      }
    }
  },

  /**
   * Add a feed record to the feeds database and update the folder's feedUrl
   * property.
   *
   * @param {Feed} aFeed - Our feed object.
   *
   * @returns {void}
   */
  addFeed(aFeed) {
    // Find or create subscription entry.
    let ds = this.getSubscriptionsDS(aFeed.server);
    let sub = ds.data.find(x => x.url == aFeed.url);
    if (sub === undefined) {
      sub = {};
      ds.data.push(sub);
    }
    sub.url = aFeed.url;
    sub.destFolder = aFeed.folder.URI;
    if (aFeed.title) {
      sub.title = aFeed.title;
    }
    ds.saveSoon();

    // Update folderpane.
    this.setFolderPaneProperty(aFeed.folder, "favicon", null, "row");
  },

  /**
   * Delete a feed record from the feeds database and update the folder's
   * feedUrl property.
   *
   * @param {Feed} aFeed - Our feed object.
   *
   * @returns {void}
   */
  deleteFeed(aFeed) {
    // Remove items associated with this feed from the items db.
    aFeed.invalidateItems();
    aFeed.removeInvalidItems(true);

    // Remove the entry in the subscriptions db.
    let ds = this.getSubscriptionsDS(aFeed.server);
    ds.data = ds.data.filter(x => x.url != aFeed.url);
    ds.saveSoon();

    // Update folderpane.
    this.setFolderPaneProperty(aFeed.folder, "favicon", null, "row");
  },

  /**
   * Change an existing feed's url.
   *
   * @param {Feed} aFeed      - The feed object.
   * @param {String} aNewUrl  - New url.
   *
   * @returns {Boolean}       - true if successful, else false.
   */
  changeUrlForFeed(aFeed, aNewUrl) {
    if (!aFeed || !aFeed.folder || !aNewUrl) {
      return false;
    }

    if (this.feedAlreadyExists(aNewUrl, aFeed.server)) {
      this.log.info(
        "FeedUtils.changeUrlForFeed: new feed url " +
          aNewUrl +
          " already subscribed in account " +
          aFeed.server.prettyName
      );
      return false;
    }

    let title = aFeed.title;
    let link = aFeed.link;
    let quickMode = aFeed.quickMode;
    let options = aFeed.options;

    this.deleteFeed(aFeed);
    aFeed.url = aNewUrl;
    aFeed.title = title;
    aFeed.link = link;
    aFeed.quickMode = quickMode;
    aFeed.options = options;
    this.addFeed(aFeed);

    let win = Services.wm.getMostRecentWindow("Mail:News-BlogSubscriptions");
    if (win) {
      win.FeedSubscriptions.refreshSubscriptionView(aFeed.folder, aNewUrl);
    }

    return true;
  },

  /**
   * Determine if a message is a feed message. Prior to Tb15, a message had to
   * be in an rss acount type folder. In Tb15 and later, a flag is set on the
   * message itself upon initial store; the message can be moved to any folder.
   *
   * @param {nsIMsgDBHdr} aMsgHdr - The message.
   *
   * @returns {Boolean} - true if message is a feed, false if not.
   */
  isFeedMessage(aMsgHdr) {
    return Boolean(
      aMsgHdr instanceof Ci.nsIMsgDBHdr &&
        (aMsgHdr.flags & Ci.nsMsgMessageFlags.FeedMsg ||
          this.isFeedFolder(aMsgHdr.folder))
    );
  },

  /**
   * Determine if a folder is a feed acount folder. Trash or a folder in Trash
   * should be checked with FeedUtils.isInTrash() if required.
   *
   * @param {nsIMsgFolder} aFolder - The folder.
   *
   * @returns {Boolean} - true if folder's server.type is in FEED_ACCOUNT_TYPES,
   *                      false if not.
   */
  isFeedFolder(aFolder) {
    return Boolean(
      aFolder instanceof Ci.nsIMsgFolder &&
        this.FEED_ACCOUNT_TYPES.includes(aFolder.server.type)
    );
  },

  /**
   * Get the list of feed urls for a folder.
   *
   * @param {nsIMsgFolder} aFolder - The folder.
   *
   * @returns {String}[]           - Array of urls, or null if none.
   */
  getFeedUrlsInFolder(aFolder) {
    if (
      !aFolder ||
      aFolder.isServer ||
      aFolder.server.type != "rss" ||
      aFolder.getFlag(Ci.nsMsgFolderFlags.Trash) ||
      aFolder.getFlag(Ci.nsMsgFolderFlags.Virtual) ||
      !aFolder.filePath.exists()
    ) {
      // There are never any feedUrls in the account/non-feed/trash/virtual
      // folders or in a ghost folder (nonexistent on disk yet found in
      // aFolder.subFolders).
      return null;
    }

    let feedUrlArray = [];

    // Get the list from the feeds database.
    try {
      let ds = this.getSubscriptionsDS(aFolder.server);
      for (const sub of ds.data) {
        if (sub.destFolder == aFolder.URI) {
          feedUrlArray.push(sub.url);
        }
      }
    } catch (ex) {
      this.log.error("getFeedUrlsInFolder: feeds db error - " + ex);
      this.log.error(
        "getFeedUrlsInFolder: feeds db error for account - " +
          aFolder.server.serverURI +
          " : " +
          aFolder.server.prettyName
      );
    }

    return feedUrlArray.length ? feedUrlArray : null;
  },

  /**
   * Check if the folder's msgDatabase is openable, reparse if desired.
   *
   * @param {nsIMsgFolder} aFolder        - The folder.
   * @param {Boolean} aReparse            - Reparse if true.
   * @param {nsIUrlListener} aUrlListener - Object implementing nsIUrlListener.
   *
   * @returns {Boolean} - true if msgDb is available, else false
   */
  isMsgDatabaseOpenable(aFolder, aReparse, aUrlListener) {
    let msgDb;
    try {
      msgDb = Cc["@mozilla.org/msgDatabase/msgDBService;1"]
        .getService(Ci.nsIMsgDBService)
        .openFolderDB(aFolder, true);
    } catch (ex) {}

    if (msgDb) {
      return true;
    }

    if (!aReparse) {
      return false;
    }

    // Force a reparse.
    FeedUtils.log.debug(
      "checkMsgDb: rebuild msgDatabase for " +
        aFolder.name +
        " - " +
        aFolder.filePath.path
    );
    try {
      // Ignore error returns.
      aFolder
        .QueryInterface(Ci.nsIMsgLocalMailFolder)
        .getDatabaseWithReparse(aUrlListener, null);
    } catch (ex) {}

    return false;
  },

  /**
   * Return properties for nsITreeView getCellProperties, for a tree row item in
   * folderpane or subscribe dialog tree.
   *
   * @param {nsIMsgFolder} aFolder - Folder or a feed url's parent folder.
   * @param {String} aFeedUrl      - Feed url for a feed row, null for folder.
   *
   * @returns {String}             - The properties.
   */
  getFolderProperties(aFolder, aFeedUrl) {
    let folder = aFolder;
    let feedUrls = aFeedUrl ? [aFeedUrl] : this.getFeedUrlsInFolder(aFolder);
    if (!feedUrls && !folder.isServer) {
      return "";
    }

    let serverEnabled = this.getStatus(
      folder.server.rootFolder,
      folder.server.rootFolder.URI
    ).enabled;
    if (folder.isServer) {
      return !serverEnabled ? " serverIsPaused" : "";
    }

    let properties = aFeedUrl ? " isFeed-true" : " isFeedFolder-true";
    let hasError,
      isBusy,
      numPaused = 0;
    for (let feedUrl of feedUrls) {
      let feedStatus = this.getStatus(folder, feedUrl);
      if (
        feedStatus.code == FeedUtils.kNewsBlogInvalidFeed ||
        feedStatus.code == FeedUtils.kNewsBlogRequestFailure ||
        feedStatus.code == FeedUtils.kNewsBlogBadCertError ||
        feedStatus.code == FeedUtils.kNewsBlogNoAuthError
      ) {
        hasError = true;
      }
      if (feedStatus.code == FeedUtils.kNewsBlogFeedIsBusy) {
        isBusy = true;
      }
      if (!feedStatus.enabled) {
        numPaused++;
      }
    }

    properties += hasError ? " hasError" : "";
    properties += isBusy ? " isBusy" : "";
    properties += numPaused == feedUrls.length ? " isPaused" : "";
    properties += !serverEnabled ? " serverIsPaused" : "";

    return properties;
  },

  /**
   * Update a folderpane cached property.
   *
   * @param {nsIMsgFolder} aFolder   - Folder.
   * @param {String} aProperty       - Property.
   * @param {String} aValue          - Value.
   * @param {String} aInvalidate     - "row" = folder's row.
   *                                  ."all" = all rows.
   * @returns {void}
   */
  setFolderPaneProperty(aFolder, aProperty, aValue, aInvalidate) {
    let win = Services.wm.getMostRecentWindow("mail:3pane");
    if (!aFolder || !aProperty || !win || !("gFolderTreeView" in win)) {
      return;
    }

    win.gFolderTreeView.setFolderCacheProperty(aFolder, aProperty, aValue);

    if (aInvalidate == "all") {
      win.gFolderTreeView._tree.invalidate();
    }

    if (aInvalidate == "row") {
      let row = win.gFolderTreeView.getIndexOfFolder(aFolder);
      win.gFolderTreeView.clearFolderCacheProperty(aFolder, "properties");
      win.gFolderTreeView._tree.invalidateRow(row);
    }
  },

  /**
   * Get a cached feed or folder status.
   *
   * @param {nsIMsgFolder} aFolder   - Folder.
   * @param {String} aUrl            - Url key (feed url or folder URI).
   *
   * @returns {String} aValue        - The value.
   */
  getStatus(aFolder, aUrl) {
    if (!aFolder || !aUrl) {
      return null;
    }

    let serverKey = aFolder.server.serverURI;
    if (!this[serverKey]) {
      this[serverKey] = {};
    }

    if (!this[serverKey][aUrl]) {
      // Seed the status object.
      this[serverKey][aUrl] = {};
      this[serverKey][aUrl].status = this.statusTemplate;
      if (FeedUtils.isValidScheme(aUrl)) {
        // Seed persisted status properties for feed urls.
        let feed = new Feed(aUrl, aFolder);
        this[serverKey][aUrl].status.enabled = feed.options.updates.enabled;
        this[serverKey][aUrl].status.updateMinutes =
          feed.options.updates.updateMinutes;
        this[serverKey][aUrl].status.lastUpdateTime =
          feed.options.updates.lastUpdateTime;
        feed = null;
      } else {
        // Seed persisted status properties for servers.
        let optionsAcct = FeedUtils.getOptionsAcct(aFolder.server);
        this[serverKey][aUrl].status.enabled = optionsAcct.doBiff;
      }
      FeedUtils.log.debug("getStatus: seed url - " + aUrl);
    }

    return this[serverKey][aUrl].status;
  },

  /**
   * Update a feed or folder status and refresh folderpane.
   *
   * @param {nsIMsgFolder} aFolder   - Folder.
   * @param {String} aUrl            - Url key (feed url or folder URI).
   * @param {String} aProperty       - Url status property.
   * @param {String} aValue          - Value.
   *
   * @returns {String} aValue        - The value.
   */
  setStatus(aFolder, aUrl, aProperty, aValue) {
    if (!aFolder || !aUrl || !aProperty) {
      return;
    }

    if (
      !this[aFolder.server.serverURI] ||
      !this[aFolder.server.serverURI][aUrl]
    ) {
      // Not yet seeded, so do it.
      this.getStatus(aFolder, aUrl);
    }

    this[aFolder.server.serverURI][aUrl].status[aProperty] = aValue;

    let win = Services.wm.getMostRecentWindow("mail:3pane");
    if (win && "gFolderTreeView" in win) {
      if (aFolder.isServer) {
        win.gFolderTreeView._tree.invalidate();
      } else {
        let row = win.gFolderTreeView.getIndexOfFolder(aFolder);
        win.gFolderTreeView.clearFolderCacheProperty(aFolder, "properties");
        win.gFolderTreeView._tree.invalidateRow(row);
      }
    }

    win = Services.wm.getMostRecentWindow("Mail:News-BlogSubscriptions");
    if (win) {
      win.FeedSubscriptions.mView.tree.invalidate();
    }
  },

  /**
   * Get the favicon for a feed folder subscription url (first one) or a feed
   * message url. The favicon service caches it in memory if places history is
   * not enabled.
   *
   * @param {nsIMsgFolder} aFolder - The feed folder or null if aUrl.
   * @param {String} aUrl          - A url (feed, message, other) or null if aFolder.
   * @param {String} aIconUrl      - The icon url if already determined, else null.
   * @param {nsIDOMWindow} aWindow - Null if requesting url without setting it.
   * @param {Function} aCallback   - Null or callback.
   *
   * @returns {String}             - The favicon url or empty string.
   */
  getFavicon(aFolder, aUrl, aIconUrl, aWindow, aCallback) {
    // On any error, cache an empty string to show the default favicon, and
    // don't try anymore in this session.
    let useDefaultFavicon = () => {
      if (aCallback) {
        aCallback("");
      }

      return "";
    };

    if (
      !Services.prefs.getBoolPref("browser.chrome.site_icons") ||
      !Services.prefs.getBoolPref("browser.chrome.favicons")
    ) {
      return useDefaultFavicon();
    }

    if (aIconUrl != null) {
      return aIconUrl;
    }

    let onLoadSuccess = aEvent => {
      let iconUri = Services.io.newURI(aEvent.target.src);
      aWindow.specialTabs.mFaviconService.setAndFetchFaviconForPage(
        uri,
        iconUri,
        false,
        aWindow.specialTabs.mFaviconService.FAVICON_LOAD_NON_PRIVATE,
        null,
        Services.scriptSecurityManager.getSystemPrincipal()
      );

      if (aCallback) {
        aCallback(iconUri.spec);
      }
    };

    let onLoadError = aEvent => {
      useDefaultFavicon();
      let url = aEvent.target.src;
      aWindow.specialTabs.getFaviconFromPage(url, aCallback);
    };

    let url = aUrl;
    if (!url) {
      // Get the proposed iconUrl from the folder's first subscribed feed's
      // <link>.
      if (!aFolder) {
        return useDefaultFavicon();
      }

      let feedUrls = this.getFeedUrlsInFolder(aFolder);
      url = feedUrls ? feedUrls[0] : null;
      if (!url) {
        return useDefaultFavicon();
      }
    }

    if (aFolder) {
      let feed = new Feed(url, aFolder);
      url = feed.link && feed.link.startsWith("http") ? feed.link : url;
    }

    let uri, iconUri;
    try {
      uri = Services.io.newURI(url);
      iconUri = Services.io.newURI(uri.prePath + "/favicon.ico");
    } catch (ex) {
      return useDefaultFavicon();
    }

    if (!aWindow) {
      return iconUri.spec;
    }

    aWindow.specialTabs.loadFaviconImageNode(
      onLoadSuccess,
      onLoadError,
      iconUri.spec
    );
    // Cache the favicon url initially.
    if (aCallback) {
      aCallback(iconUri.spec);
    }

    return iconUri.spec;
  },

  /**
   * Update the feeds database for rename and move/copy folder name changes.
   *
   * @param {nsIMsgFolder} aFolder      - The folder, new if rename or target of
   *                                      move/copy folder (new parent).
   * @param {nsIMsgFolder} aOrigFolder  - Original folder.
   * @param {String} aAction            - "move" or "copy" or "rename".
   *
   * @returns {void}
   */
  updateSubscriptionsDS(aFolder, aOrigFolder, aAction) {
    this.log.debug(
      "FeedUtils.updateSubscriptionsDS: " +
        "\nfolder changed - " +
        aAction +
        "\nnew folder  - " +
        aFolder.filePath.path +
        "\norig folder - " +
        aOrigFolder.filePath.path
    );

    this.log.debug(
      `updateSubscriptions(${aFolder.name}, ${aOrigFolder.name}, ${aAction})`
    );

    if (aFolder.server.type != "rss" || FeedUtils.isInTrash(aOrigFolder)) {
      // Target not a feed account folder; nothing to do, or move/rename in
      // trash; no subscriptions already.
      return;
    }

    let newFolder = aFolder;
    let newParentURI = aFolder.URI;
    let origParentURI = aOrigFolder.URI;
    if (aAction == "move" || aAction == "copy") {
      // Get the new folder. Don't process the entire parent (new dest folder)!
      newFolder = aFolder.getChildNamed(aOrigFolder.name);
      origParentURI = aOrigFolder.parent
        ? aOrigFolder.parent.URI
        : aOrigFolder.rootFolder.URI;
    }

    this.updateFolderChangeInFeedsDS(newFolder, aOrigFolder, null, null);

    // There may be subfolders, but we only get a single notification; iterate
    // over all descendent folders of the folder whose location has changed.
    for (let newSubFolder of newFolder.descendants) {
      FeedUtils.updateFolderChangeInFeedsDS(
        newSubFolder,
        aOrigFolder,
        newParentURI,
        origParentURI
      );
    }
  },

  /**
   * Update the feeds database with the new folder's or subfolder's location
   * for rename and move/copy name changes. The feeds subscriptions db is
   * also synced on cross account folder copies. Note that if a copied folder's
   * url exists in the new account, its active subscription will be switched to
   * the folder being copied, to enforce the one unique url per account design.
   *
   * @param {nsIMsgFolder} aFolder      - New folder.
   * @param {nsIMsgFolder} aOrigFolder  - Original folder.
   * @param {String} aNewAncestorURI    - For subfolders, ancestor new folder.
   * @param {String} aOrigAncestorURI   - For subfolders, ancestor original folder.
   *
   * @returns {void}
   */
  updateFolderChangeInFeedsDS(
    aFolder,
    aOrigFolder,
    aNewAncestorURI,
    aOrigAncestorURI
  ) {
    this.log.debug(
      "updateFolderChangeInFeedsDS: " +
        "\naFolder       - " +
        aFolder.URI +
        "\naOrigFolder   - " +
        aOrigFolder.URI +
        "\naOrigAncestor - " +
        aOrigAncestorURI +
        "\naNewAncestor  - " +
        aNewAncestorURI
    );

    // Get the original folder's URI.
    let folderURI = aFolder.URI;
    let origURI =
      aNewAncestorURI && aOrigAncestorURI
        ? folderURI.replace(aNewAncestorURI, aOrigAncestorURI)
        : aOrigFolder.URI;
    this.log.debug("updateFolderChangeInFeedsDS: urls origURI  - " + origURI);

    // Get affected feed subscriptions - all the ones in the original folder.
    let origDS = this.getSubscriptionsDS(aOrigFolder.server);
    let affectedSubs = origDS.data.filter(sub => sub.destFolder == origURI);
    if (affectedSubs.length == 0) {
      this.log.debug("updateFolderChangeInFeedsDS: no feedUrls in this folder");
      return;
    }

    if (this.isInTrash(aFolder)) {
      // Moving to trash. Unsubscribe.
      affectedSubs.forEach(function(sub) {
        let feed = new Feed(sub.url, aFolder);
        FeedUtils.deleteFeed(feed);
      });
      // note: deleteFeed() calls saveSoon(), so we don't need to.
    } else if (aFolder.server == aOrigFolder.server) {
      // Staying in same account - just update destFolder as required
      for (let sub of affectedSubs) {
        sub.destFolder = folderURI;
      }
      origDS.saveSoon();
    } else {
      // Moving between accounts.
      let destDS = this.getSubscriptionsDS(aFolder.server);
      for (let sub of affectedSubs) {
        // Move to the new subscription db (replacing any existing entry).
        origDS.data = origDS.data.filter(x => x.url != sub.url);
        destDS.data = destDS.data.filter(x => x.url != sub.url);
        sub.destFolder = folderURI;
        destDS.data.push(sub);
      }
      this.setFolderPaneProperty(aFolder, "favicon", null, "row");
      origDS.saveSoon();
      destDS.saveSoon();
    }
  },

  /**
   * When subscribing to feeds by dnd on, or adding a url to, the account
   * folder (only), or creating folder structure via opml import, a subfolder is
   * autocreated and thus the derived/given name must be sanitized to prevent
   * filesystem errors. Hashing invalid chars based on OS rather than filesystem
   * is not strictly correct.
   *
   * @param {nsIMsgFolder} aParentFolder - Parent folder.
   * @param {String}       aProposedName - Proposed name.
   * @param {String}       aDefaultName  - Default name if proposed sanitizes to
   *                                       blank, caller ensures sane value.
   * @param {Boolean}      aUnique       - If true, return a unique indexed name.
   *
   * @returns {String}                   - Sanitized unique name.
   */
  getSanitizedFolderName(aParentFolder, aProposedName, aDefaultName, aUnique) {
    // Clean up the name for the strictest fs (fat) and to ensure portability.
    // 1) Replace line breaks and tabs '\n\r\t' with a space.
    // 2) Remove nonprintable ascii.
    // 3) Remove invalid win chars '* | \ / : < > ? "'.
    // 4) Remove all '.' as starting/ending with one is trouble on osx/win.
    // 5) No leading/trailing spaces.
    /* eslint-disable no-control-regex */
    let folderName = aProposedName
      .replace(/[\n\r\t]+/g, " ")
      .replace(/[\x00-\x1F]+/g, "")
      .replace(/[*|\\\/:<>?"]+/g, "")
      .replace(/[\.]+/g, "")
      .trim();
    /* eslint-enable no-control-regex */

    // Prefix with __ if name is:
    // 1) a reserved win filename.
    // 2) an undeletable/unrenameable special folder name (bug 259184).
    if (
      folderName
        .toUpperCase()
        .match(/^COM\d$|^LPT\d$|^CON$|PRN$|^AUX$|^NUL$|^CLOCK\$/) ||
      folderName
        .toUpperCase()
        .match(/^INBOX$|^OUTBOX$|^UNSENT MESSAGES$|^TRASH$/)
    ) {
      folderName = "__" + folderName;
    }

    // Use a default if no name is found.
    if (!folderName) {
      folderName = aDefaultName;
    }

    if (!aUnique) {
      return folderName;
    }

    // Now ensure the folder name is not a dupe; if so append index.
    let folderNameBase = folderName;
    let i = 2;
    while (aParentFolder.containsChildNamed(folderName)) {
      folderName = folderNameBase + "-" + i++;
    }

    return folderName;
  },

  /**
   * This object contains feed/account status info.
   */
  _statusDefault: {
    // Derived from persisted value.
    enabled: null,
    // Last update result code, a kNewsBlog* value.
    code: 0,
    updateMinutes: null,
    // JS Date; startup state is null indicating no update since startup.
    lastUpdateTime: null,
  },

  get statusTemplate() {
    // Copy the object.
    return JSON.parse(JSON.stringify(this._statusDefault));
  },

  /**
   * This object will contain all persisted feed specific properties.
   */
  _optionsDefault: {
    version: 2,
    updates: {
      enabled: true,
      // User set.
      updateMinutes: 100,
      // User set: "min"=minutes, "d"=days
      updateUnits: "min",
      // JS Date.
      lastUpdateTime: null,
      // The last time a new message was stored. JS Date.
      lastDownloadTime: null,
      // Publisher recommended from the feed.
      updatePeriod: null,
      updateFrequency: 1,
      updateBase: null,
    },
    // Autotag and <category> handling options.
    category: {
      enabled: false,
      prefixEnabled: false,
      prefix: null,
    },
  },

  get optionsTemplate() {
    // Copy the object.
    return JSON.parse(JSON.stringify(this._optionsDefault));
  },

  getOptionsAcct(aServer) {
    let optionsAcct;
    let optionsAcctPref = "mail.server." + aServer.key + ".feed_options";
    let check_new_mail = "mail.server." + aServer.key + ".check_new_mail";
    let check_time = "mail.server." + aServer.key + ".check_time";

    // Biff enabled or not. Make sure pref exists.
    if (!Services.prefs.prefHasUserValue(check_new_mail)) {
      Services.prefs.setBoolPref(check_new_mail, true);
    }

    // System polling interval. Make sure pref exists.
    if (!Services.prefs.prefHasUserValue(check_time)) {
      Services.prefs.setIntPref(check_time, FeedUtils.kBiffPollMinutes);
    }

    try {
      optionsAcct = JSON.parse(Services.prefs.getCharPref(optionsAcctPref));
      // Add the server specific biff enabled state.
      optionsAcct.doBiff = Services.prefs.getBoolPref(check_new_mail);
    } catch (ex) {}

    if (optionsAcct && optionsAcct.version == this._optionsDefault.version) {
      return optionsAcct;
    }

    // Init account updates options if new or upgrading to version in
    // |_optionsDefault.version|.
    if (!optionsAcct || optionsAcct.version < this._optionsDefault.version) {
      this.initAcct(aServer);
    }

    let newOptions = this.newOptions(optionsAcct);
    this.setOptionsAcct(aServer, newOptions);
    newOptions.doBiff = Services.prefs.getBoolPref(check_new_mail);
    return newOptions;
  },

  setOptionsAcct(aServer, aOptions) {
    let optionsAcctPref = "mail.server." + aServer.key + ".feed_options";
    aOptions = aOptions || this.optionsTemplate;
    Services.prefs.setCharPref(optionsAcctPref, JSON.stringify(aOptions));
  },

  initAcct(aServer) {
    let serverPrefStr = "mail.server." + aServer.key;
    // System polling interval. Effective after current interval expires on
    // change; no user facing ui.
    Services.prefs.setIntPref(
      serverPrefStr + ".check_time",
      FeedUtils.kBiffPollMinutes
    );

    // If this pref is false, polling on biff is disabled and account updates
    // are paused; ui in account server settings and folderpane context menu
    // (Pause All Updates). Checking Enable updates or unchecking Pause takes
    // effect immediately. Here on startup, we just ensure the polling interval
    // above is reset immediately.
    let doBiff = Services.prefs.getBoolPref(serverPrefStr + ".check_new_mail");
    FeedUtils.log.debug(
      "initAcct: " + aServer.prettyName + " doBiff - " + doBiff
    );
    this.pauseFeedFolderUpdates(aServer.rootFolder, !doBiff, false);
  },

  newOptions(aCurrentOptions) {
    if (!aCurrentOptions) {
      return this.optionsTemplate;
    }

    // Options version has changed; meld current template with existing
    // aCurrentOptions settings, removing items gone from the template while
    // preserving user settings for retained template items.
    let newOptions = this.optionsTemplate;
    this.Mixins.meld(aCurrentOptions, false, true).into(newOptions);
    newOptions.version = this.optionsTemplate.version;
    return newOptions;
  },

  /**
   * A generalized recursive melder of two objects. Getters/setters not included.
   */
  Mixins: {
    meld(source, keep, replace) {
      function meldin(source, target, keep, replace) {
        for (let attribute in source) {
          // Recurse for objects.
          if (
            typeof source[attribute] == "object" &&
            typeof target[attribute] == "object"
          ) {
            meldin(source[attribute], target[attribute], keep, replace);
          } else {
            // Use attribute values from source for the target, unless
            // replace is false.
            if (attribute in target && !replace) {
              continue;
            }
            // Don't copy attribute from source to target if it is not in the
            // target, unless keep is true.
            if (!(attribute in target) && !keep) {
              continue;
            }

            target[attribute] = source[attribute];
          }
        }
      }
      return {
        source,
        into(target) {
          meldin(this.source, target, keep, replace);
        },
      };
    },
  },

  /**
   * Returns a reference to the feed subscriptions store for the given server
   * (the feeds.json data).
   *
   * @param {nsIMsgIncomingServer} aServer - server to fetch item data for.
   * @returns {JSONFile} - a JSONFile holding the array of feed subscriptions
   *                       in its data field.
   */
  getSubscriptionsDS(aServer) {
    if (this[aServer.serverURI] && this[aServer.serverURI].FeedsDS) {
      return this[aServer.serverURI].FeedsDS;
    }

    let rssServer = aServer.QueryInterface(Ci.nsIRssIncomingServer);
    let feedsFile = rssServer.subscriptionsPath; // Path to feeds.json
    let exists = feedsFile.exists();
    let ds = new JSONFile({ path: feedsFile.path });
    ds.ensureDataReady();
    if (!this[aServer.serverURI]) {
      this[aServer.serverURI] = {};
    }
    this[aServer.serverURI].FeedsDS = ds;
    if (!exists) {
      // No feeds.json, so we need to initialise.
      ds.data = [];
    }
    return ds;
  },

  /**
   * Fetch an attribute for a subscribed feed.
   *
   * @param {String} feedURL - URL of the feed.
   * @param {nsIMsgIncomingServer} server - Server holding the subscription.
   * @param {String} attrName - Name of attribute to fetch.
   * @param {undefined} defaultValue - Value to return if not found.
   *
   * @returns {undefined} - the fetched value (defaultValue if the
   *                        subscription or attribute doesn't exist).
   */
  getSubscriptionAttr(feedURL, server, attrName, defaultValue) {
    let ds = this.getSubscriptionsDS(server);
    let sub = ds.data.find(feed => feed.url == feedURL);
    if (sub === undefined || sub[attrName] === undefined) {
      return defaultValue;
    }
    return sub[attrName];
  },

  /**
   * Set an attribute for a feed in the subscriptions store.
   * NOTE: If the feed is not already in the store, it will be
   * added.
   *
   * @param {String} feedURL - URL of the feed.
   * @param {nsIMsgIncomingServer} server - server holding subscription.
   * @param {String} attrName - Name of attribute to fetch.
   * @param {undefined} value - Value to store.
   *
   * @returns {void}
   */
  setSubscriptionAttr(feedURL, server, attrName, value) {
    let ds = this.getSubscriptionsDS(server);
    let sub = ds.data.find(feed => feed.url == feedURL);
    if (sub === undefined) {
      // Add a new entry.
      sub = { url: feedURL };
      ds.data.push(sub);
    }
    sub[attrName] = value;
    ds.saveSoon();
  },

  /**
   * Returns a reference to the feeditems store for the given server
   * (the feeditems.json data).
   *
   * @param {nsIMsgIncomingServer} aServer - server to fetch item data for.
   * @returns {JSONFile} - JSONFile with data field containing a collection
   *                       of feeditems indexed by item url.
   */
  getItemsDS(aServer) {
    if (this[aServer.serverURI] && this[aServer.serverURI].FeedItemsDS) {
      return this[aServer.serverURI].FeedItemsDS;
    }

    let rssServer = aServer.QueryInterface(Ci.nsIRssIncomingServer);
    let itemsFile = rssServer.feedItemsPath; // Path to feeditems.json
    let exists = itemsFile.exists();
    let ds = new JSONFile({ path: itemsFile.path });
    ds.ensureDataReady();
    if (!this[aServer.serverURI]) {
      this[aServer.serverURI] = {};
    }
    this[aServer.serverURI].FeedItemsDS = ds;
    if (!exists) {
      // No feeditems.json, need to initialise our data.
      ds.data = {};
    }
    return ds;
  },

  /**
   * Dragging something from somewhere.  It may be a nice x-moz-url or from a
   * browser or app that provides a less nice dataTransfer object in the event.
   * Extract the url and if it passes the scheme test, try to subscribe.
   *
   * @param {nsISupports} aDataTransfer  - The dnd event's dataTransfer.
   *
   * @returns {nsIURI} or null           - A uri if valid, null if none.
   */
  getFeedUriFromDataTransfer(aDataTransfer) {
    let dt = aDataTransfer;
    let types = ["text/x-moz-url-data", "text/x-moz-url"];
    let validUri = false;
    let uri;

    if (dt.getData(types[0])) {
      // The url is the data.
      uri = Services.io.newURI(dt.mozGetDataAt(types[0], 0));
      validUri = this.isValidScheme(uri);
      this.log.trace(
        "getFeedUriFromDataTransfer: dropEffect:type:value - " +
          dt.dropEffect +
          " : " +
          types[0] +
          " : " +
          uri.spec
      );
    } else if (dt.getData(types[1])) {
      // The url is the first part of the data, the second part is random.
      uri = Services.io.newURI(dt.mozGetDataAt(types[1], 0).split("\n")[0]);
      validUri = this.isValidScheme(uri);
      this.log.trace(
        "getFeedUriFromDataTransfer: dropEffect:type:value - " +
          dt.dropEffect +
          " : " +
          types[0] +
          " : " +
          uri.spec
      );
    } else {
      // Go through the types and see if there's a url; get the first one.
      for (let i = 0; i < dt.types.length; i++) {
        let spec = dt.mozGetDataAt(dt.types[i], 0);
        this.log.trace(
          "getFeedUriFromDataTransfer: dropEffect:index:type:value - " +
            dt.dropEffect +
            " : " +
            i +
            " : " +
            dt.types[i] +
            " : " +
            spec
        );
        try {
          uri = Services.io.newURI(spec);
          validUri = this.isValidScheme(uri);
        } catch (ex) {}

        if (validUri) {
          break;
        }
      }
    }

    return validUri ? uri : null;
  },

  /**
   * Returns security/certificate/network error details for an XMLHTTPRequest.
   *
   * @param {XMLHTTPRequest} xhr - The xhr request.
   *
   * @returns {Array}[{String} errType or null, {String} errName or null]
   *          - Array with 2 error codes, (nulls if not determined).
   */
  createTCPErrorFromFailedXHR(xhr) {
    let status = xhr.channel.QueryInterface(Ci.nsIRequest).status;

    let errType = null;
    let errName = null;
    if ((status & 0xff0000) === 0x5a0000) {
      // Security module.
      const nsINSSErrorsService = Ci.nsINSSErrorsService;
      let nssErrorsService = Cc["@mozilla.org/nss_errors_service;1"].getService(
        nsINSSErrorsService
      );
      let errorClass;

      // getErrorClass()) will throw a generic NS_ERROR_FAILURE if the error
      // code is somehow not in the set of covered errors.
      try {
        errorClass = nssErrorsService.getErrorClass(status);
      } catch (ex) {
        // Catch security protocol exception.
        errorClass = "SecurityProtocol";
      }

      if (errorClass == nsINSSErrorsService.ERROR_CLASS_BAD_CERT) {
        errType = "SecurityCertificate";
      } else {
        errType = "SecurityProtocol";
      }

      // NSS_SEC errors (happen below the base value because of negative vals).
      if (
        (status & 0xffff) <
        Math.abs(nsINSSErrorsService.NSS_SEC_ERROR_BASE)
      ) {
        // The bases are actually negative, so in our positive numeric space,
        // we need to subtract the base off our value.
        let nssErr =
          Math.abs(nsINSSErrorsService.NSS_SEC_ERROR_BASE) - (status & 0xffff);

        switch (nssErr) {
          case 11: // SEC_ERROR_EXPIRED_CERTIFICATE, sec(11)
            errName = "SecurityExpiredCertificateError";
            break;
          case 12: // SEC_ERROR_REVOKED_CERTIFICATE, sec(12)
            errName = "SecurityRevokedCertificateError";
            break;

          // Per bsmith, we will be unable to tell these errors apart very soon,
          // so it makes sense to just folder them all together already.
          case 13: // SEC_ERROR_UNKNOWN_ISSUER, sec(13)
          case 20: // SEC_ERROR_UNTRUSTED_ISSUER, sec(20)
          case 21: // SEC_ERROR_UNTRUSTED_CERT, sec(21)
          case 36: // SEC_ERROR_CA_CERT_INVALID, sec(36)
            errName = "SecurityUntrustedCertificateIssuerError";
            break;
          case 90: // SEC_ERROR_INADEQUATE_KEY_USAGE, sec(90)
            errName = "SecurityInadequateKeyUsageError";
            break;
          case 176: // SEC_ERROR_CERT_SIGNATURE_ALGORITHM_DISABLED, sec(176)
            errName = "SecurityCertificateSignatureAlgorithmDisabledError";
            break;
          default:
            errName = "SecurityError";
            break;
        }
      } else {
        // Calculating the difference.
        let sslErr =
          Math.abs(nsINSSErrorsService.NSS_SSL_ERROR_BASE) - (status & 0xffff);

        switch (sslErr) {
          case 3: // SSL_ERROR_NO_CERTIFICATE, ssl(3)
            errName = "SecurityNoCertificateError";
            break;
          case 4: // SSL_ERROR_BAD_CERTIFICATE, ssl(4)
            errName = "SecurityBadCertificateError";
            break;
          case 8: // SSL_ERROR_UNSUPPORTED_CERTIFICATE_TYPE, ssl(8)
            errName = "SecurityUnsupportedCertificateTypeError";
            break;
          case 9: // SSL_ERROR_UNSUPPORTED_VERSION, ssl(9)
            errName = "SecurityUnsupportedTLSVersionError";
            break;
          case 12: // SSL_ERROR_BAD_CERT_DOMAIN, ssl(12)
            errName = "SecurityCertificateDomainMismatchError";
            break;
          default:
            errName = "SecurityError";
            break;
        }
      }
    } else {
      errType = "Network";
      switch (status) {
        // Connect to host:port failed.
        case 0x804b000c: // NS_ERROR_CONNECTION_REFUSED, network(13)
          errName = "ConnectionRefusedError";
          break;
        // network timeout error.
        case 0x804b000e: // NS_ERROR_NET_TIMEOUT, network(14)
          errName = "NetworkTimeoutError";
          break;
        // Hostname lookup failed.
        case 0x804b001e: // NS_ERROR_UNKNOWN_HOST, network(30)
          errName = "DomainNotFoundError";
          break;
        case 0x804b0047: // NS_ERROR_NET_INTERRUPT, network(71)
          errName = "NetworkInterruptError";
          break;
        default:
          errName = "NetworkError";
          break;
      }
    }

    return [errType, errName];
  },

  /**
   * Returns if a uri/url is valid to subscribe.
   *
   * @param {nsIURI} aUri or {String} aUrl  - The Uri/Url.
   *
   * @returns {Boolean}                     - true if a valid scheme, false if not.
   */
  _validSchemes: ["http", "https", "file"],
  isValidScheme(aUri) {
    if (!(aUri instanceof Ci.nsIURI)) {
      try {
        aUri = Services.io.newURI(aUri);
      } catch (ex) {
        return false;
      }
    }

    return this._validSchemes.includes(aUri.scheme);
  },

  /**
   * Is a folder Trash or in Trash.
   *
   * @param {nsIMsgFolder} aFolder   - The folder.
   *
   * @returns {Boolean}              - true if folder is Trash else false.
   */
  isInTrash(aFolder) {
    let trashFolder = aFolder.rootFolder.getFolderWithFlags(
      Ci.nsMsgFolderFlags.Trash
    );
    if (
      trashFolder &&
      (trashFolder == aFolder || trashFolder.isAncestorOf(aFolder))
    ) {
      return true;
    }

    return false;
  },

  /**
   * Return a folder path string constructed from individual folder UTF8 names
   * stored as properties (not possible hashes used to construct disk foldername).
   *
   * @param {nsIMsgFolder} aFolder         - The folder.
   *
   * @returns {String} prettyName or null  - Name or null if not a disk folder.
   */
  getFolderPrettyPath(aFolder) {
    let msgFolder = MailUtils.getExistingFolder(aFolder.URI);
    if (!msgFolder) {
      // Not a real folder uri.
      return null;
    }

    if (msgFolder.URI == msgFolder.server.serverURI) {
      return msgFolder.server.prettyName;
    }

    // Server part first.
    let pathParts = [msgFolder.server.prettyName];
    let rawPathParts = msgFolder.URI.split(msgFolder.server.serverURI + "/");
    let folderURI = msgFolder.server.serverURI;
    rawPathParts = rawPathParts[1].split("/");
    for (let i = 0; i < rawPathParts.length - 1; i++) {
      // Two or more folders deep parts here.
      folderURI += "/" + rawPathParts[i];
      msgFolder = MailUtils.getExistingFolder(folderURI);
      pathParts.push(msgFolder.name);
    }

    // Leaf folder last.
    pathParts.push(aFolder.name);
    return pathParts.join("/");
  },

  /**
   * Date validator for feeds.
   *
   * @param {String} aDate - Date string.
   *
   * @returns {Boolean}      - true if passes regex test, false if not.
   */
  isValidRFC822Date(aDate) {
    const FZ_RFC822_RE =
      "^(((Mon)|(Tue)|(Wed)|(Thu)|(Fri)|(Sat)|(Sun)), *)?\\d\\d?" +
      " +((Jan)|(Feb)|(Mar)|(Apr)|(May)|(Jun)|(Jul)|(Aug)|(Sep)|(Oct)|(Nov)|(Dec))" +
      " +\\d\\d(\\d\\d)? +\\d\\d:\\d\\d(:\\d\\d)? +(([+-]?\\d\\d\\d\\d)|(UT)|(GMT)" +
      "|(EST)|(EDT)|(CST)|(CDT)|(MST)|(MDT)|(PST)|(PDT)|\\w)$";
    let regex = new RegExp(FZ_RFC822_RE);
    return regex.test(aDate);
  },

  /**
   * Create rfc5322 date.
   *
   * @param {String} aDateString - Optional date string; if null or invalid
   *                               date, get the current datetime.
   *
   * @returns {String}           - An rfc5322 date string.
   */
  getValidRFC5322Date(aDateString) {
    let d = new Date(aDateString || new Date().getTime());
    d = isNaN(d.getTime()) ? new Date() : d;
    return jsmime.headeremitter
      .emitStructuredHeader("Date", d, {})
      .substring(6)
      .trim();
  },

  /**
   * Progress glue code.  Acts as a go between the RSS back end and the mail
   * window front end determined by the aMsgWindow parameter passed into
   * nsINewsBlogFeedDownloader.
   */
  progressNotifier: {
    mSubscribeMode: false,
    mMsgWindow: null,
    mStatusFeedback: null,
    mFeeds: {},
    // Keeps track of the total number of feeds we have been asked to download.
    // This number may not reflect the # of entries in our mFeeds array because
    // not all feeds may have reported in for the first time.
    mNumPendingFeedDownloads: 0,

    init(aMsgWindow, aSubscribeMode) {
      if (this.mNumPendingFeedDownloads == 0) {
        // If we aren't already in the middle of downloading feed items.
        this.mStatusFeedback = aMsgWindow ? aMsgWindow.statusFeedback : null;
        this.mSubscribeMode = aSubscribeMode;
        this.mMsgWindow = aMsgWindow;

        if (this.mStatusFeedback) {
          this.mStatusFeedback.startMeteors();
          this.mStatusFeedback.showStatusString(
            FeedUtils.strings.GetStringFromName(
              aSubscribeMode
                ? "subscribe-validating-feed"
                : "newsblog-getNewMsgsCheck"
            )
          );
        }
      }
    },

    /**
     * Called on final success or error resolution of a feed download and
     * parsing. If aDisable is true, the error shouldn't be retried continually
     * and the url should be verified by the user. A bad html response code or
     * cert error will cause the url to be disabled, while general network
     * connectivity errors applying to all urls will not.
     *
     * @param {Feed} feed - The Feed object, or a synthetic object that must
     *                      contain members {nsIMsgFolder folder, String url}.
     * @param {Integer} aErrorCode  - The resolution code, a kNewsBlog* value.
     * @param {Boolean} aDisable    - If true, disable/pause the feed.
     *
     * @returns {void}
     */
    downloaded(feed, aErrorCode, aDisable) {
      let folderName = feed.folder
        ? feed.folder.name
        : feed.server.rootFolder.prettyName;
      FeedUtils.log.debug(
        "downloaded: " +
          (this.mSubscribeMode ? "Subscribe " : "Update ") +
          "errorCode:folderName:feedUrl - " +
          aErrorCode +
          " : " +
          folderName +
          " : " +
          feed.url
      );
      if (this.mSubscribeMode) {
        if (aErrorCode == FeedUtils.kNewsBlogSuccess) {
          // Add the feed to the databases.
          FeedUtils.addFeed(feed);

          // Nice touch: select the folder that now contains the newly subscribed
          // feed.  This is particularly nice if we just finished subscribing
          // to a feed URL that the operating system gave us.
          this.mMsgWindow.windowCommands.selectFolder(feed.folder.URI);

          // Check for an existing feed subscriptions window and update it.
          let subscriptionsWindow = Services.wm.getMostRecentWindow(
            "Mail:News-BlogSubscriptions"
          );
          if (subscriptionsWindow) {
            subscriptionsWindow.FeedSubscriptions.FolderListener.folderAdded(
              feed.folder
            );
          }
        } else if (feed && feed.url && feed.server) {
          // Non success.  Remove intermediate traces from the feeds database.
          FeedUtils.deleteFeed(feed);
        }
      }

      if (aErrorCode != FeedUtils.kNewsBlogFeedIsBusy) {
        if (
          aErrorCode == FeedUtils.kNewsBlogSuccess ||
          aErrorCode == FeedUtils.kNewsBlogNoNewItems
        ) {
          // Update lastUpdateTime only if successful normal processing.
          let options = feed.options;
          let now = Date.now();
          options.updates.lastUpdateTime = now;
          if (feed.itemsStored) {
            options.updates.lastDownloadTime = now;
          }

          // If a previously disabled due to error feed is successful, set
          // enabled state on, as that was the desired user setting.
          if (options.updates.enabled == null) {
            options.updates.enabled = true;
            FeedUtils.setStatus(feed.folder, feed.url, "enabled", true);
          }

          feed.options = options;
          FeedUtils.setStatus(feed.folder, feed.url, "lastUpdateTime", now);
        } else if (aDisable) {
          // Do not keep retrying feeds with error states. Set persisted state
          // to |null| to indicate error disable (and not user disable), but
          // only if the feed is user enabled.
          let options = feed.options;
          if (options.updates.enabled) {
            options.updates.enabled = null;
          }

          feed.options = options;
          FeedUtils.setStatus(feed.folder, feed.url, "enabled", false);
          FeedUtils.log.warn(
            "downloaded: updates disabled due to error, " +
              "check the url - " +
              feed.url
          );
        }

        if (!this.mSubscribeMode) {
          FeedUtils.setStatus(feed.folder, feed.url, "code", aErrorCode);

          if (
            feed.folder &&
            !FeedUtils.getFolderProperties(feed.folder).includes("isBusy")
          ) {
            // Free msgDatabase after new mail biff is set; if busy let the next
            // result do the freeing.  Otherwise new messages won't be indicated.
            // This feed may belong to a folder with multiple other feeds, some
            // of which may not yet be finished, so free only if the folder is
            // no longer busy.
            feed.folder.msgDatabase = null;
            FeedUtils.log.debug(
              "downloaded: msgDatabase freed - " + feed.folder.name
            );
          }
        }
      }

      let message = "";
      switch (aErrorCode) {
        case FeedUtils.kNewsBlogSuccess:
        case FeedUtils.kNewsBlogFeedIsBusy:
          message = "";
          break;
        case FeedUtils.kNewsBlogNoNewItems:
          message =
            feed.url +
            ". " +
            FeedUtils.strings.GetStringFromName(
              "newsblog-noNewArticlesForFeed"
            );
          break;
        case FeedUtils.kNewsBlogInvalidFeed:
          message = FeedUtils.strings.formatStringFromName(
            "newsblog-feedNotValid",
            [feed.url]
          );
          break;
        case FeedUtils.kNewsBlogRequestFailure:
          message = FeedUtils.strings.formatStringFromName(
            "newsblog-networkError",
            [feed.url]
          );
          break;
        case FeedUtils.kNewsBlogFileError:
          message = FeedUtils.strings.GetStringFromName(
            "subscribe-errorOpeningFile"
          );
          break;
        case FeedUtils.kNewsBlogBadCertError:
          let host = Services.io.newURI(feed.url).host;
          message = FeedUtils.strings.formatStringFromName(
            "newsblog-badCertError",
            [host]
          );
          break;
        case FeedUtils.kNewsBlogNoAuthError:
          message = FeedUtils.strings.formatStringFromName(
            "newsblog-noAuthError",
            [feed.url]
          );
          break;
      }

      if (message) {
        let location =
          FeedUtils.getFolderPrettyPath(feed.folder || feed.server.rootFolder) +
          " -> ";
        FeedUtils.log.info(
          "downloaded: " +
            (this.mSubscribeMode ? "Subscribe: " : "Update: ") +
            location +
            message
        );
      }

      if (this.mStatusFeedback) {
        this.mStatusFeedback.showStatusString(message);
        this.mStatusFeedback.stopMeteors();
      }

      this.mNumPendingFeedDownloads--;

      if (this.mNumPendingFeedDownloads == 0) {
        this.mFeeds = {};
        this.mSubscribeMode = false;
        FeedUtils.log.debug("downloaded: all pending downloads finished");

        // Should we do this on a timer so the text sticks around for a little
        // while?  It doesn't look like we do it on a timer for newsgroups so
        // we'll follow that model.  Don't clear the status text if we just
        // dumped an error to the status bar!
        if (aErrorCode == FeedUtils.kNewsBlogSuccess && this.mStatusFeedback) {
          this.mStatusFeedback.showStatusString("");
        }
      }

      feed = null;
    },

    /**
     * This gets called after the RSS parser finishes storing a feed item to
     * disk. aCurrentFeedItems is an integer corresponding to how many feed
     * items have been downloaded so far. aMaxFeedItems is an integer
     * corresponding to the total number of feed items to download.
     *
     * @param {Feed} feed                 - The Feed object.
     * @param {Integer} aCurrentFeedItems - Number downloaded so far.
     * @param {Integer} aMaxFeedItems     - Total number to download.
     *
     * @returns {void}
     */
    onFeedItemStored(feed, aCurrentFeedItems, aMaxFeedItems) {
      // We currently don't do anything here.  Eventually we may add status
      // text about the number of new feed articles received.

      if (this.mSubscribeMode && this.mStatusFeedback) {
        // If we are subscribing to a feed, show feed download progress.
        this.mStatusFeedback.showStatusString(
          FeedUtils.strings.formatStringFromName("subscribe-gettingFeedItems", [
            aCurrentFeedItems,
            aMaxFeedItems,
          ])
        );
        this.onProgress(feed, aCurrentFeedItems, aMaxFeedItems);
      }
    },

    onProgress(feed, aProgress, aProgressMax, aLengthComputable) {
      if (feed.url in this.mFeeds) {
        // Have we already seen this feed?
        this.mFeeds[feed.url].currentProgress = aProgress;
      } else {
        this.mFeeds[feed.url] = {
          currentProgress: aProgress,
          maxProgress: aProgressMax,
        };
      }

      this.updateProgressBar();
    },

    updateProgressBar() {
      let currentProgress = 0;
      let maxProgress = 0;
      for (let index in this.mFeeds) {
        currentProgress += this.mFeeds[index].currentProgress;
        maxProgress += this.mFeeds[index].maxProgress;
      }

      // If we start seeing weird "jumping" behavior where the progress bar
      // goes below a threshold then above it again, then we can factor a
      // fudge factor here based on the number of feeds that have not reported
      // yet and the avg progress we've already received for existing feeds.
      // Fortunately the progressmeter is on a timer and only updates every so
      // often.  For the most part all of our request have initial progress
      // before the UI actually picks up a progress value.
      if (this.mStatusFeedback) {
        let progress = (currentProgress * 100) / maxProgress;
        this.mStatusFeedback.showProgress(progress);
      }
    },
  },
};

XPCOMUtils.defineLazyGetter(FeedUtils, "log", function() {
  return console.createInstance({
    prefix: "feeds",
    maxLogLevelPref: "feeds.loglevel",
  });
});

XPCOMUtils.defineLazyGetter(FeedUtils, "strings", function() {
  return Services.strings.createBundle(
    "chrome://messenger-newsblog/locale/newsblog.properties"
  );
});

XPCOMUtils.defineLazyGetter(FeedUtils, "stringsPrefs", function() {
  return Services.strings.createBundle(
    "chrome://messenger/locale/prefs.properties"
  );
});
