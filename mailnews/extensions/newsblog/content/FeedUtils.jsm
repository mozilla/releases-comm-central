/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

this.EXPORTED_SYMBOLS = ["Feed", "FeedItem", "FeedParser", "FeedUtils"];

var {classes: Cc, interfaces: Ci, utils: Cu} = Components;

Cu.import("resource:///modules/gloda/log4moz.js");
Cu.import("resource:///modules/mailServices.js");
Cu.import("resource:///modules/MailUtils.js");
Cu.import("resource:///modules/jsmime.jsm");
Cu.import("resource://gre/modules/FileUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

Services.scriptloader.loadSubScript("chrome://messenger-newsblog/content/Feed.js");
Services.scriptloader.loadSubScript("chrome://messenger-newsblog/content/FeedItem.js");
Services.scriptloader.loadSubScript("chrome://messenger-newsblog/content/feed-parser.js");

var FeedUtils = {
  MOZ_PARSERERROR_NS: "http://www.mozilla.org/newlayout/xml/parsererror.xml",

  RDF_SYNTAX_NS: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  RDF_SYNTAX_TYPE: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
  get RDF_TYPE() { return this.rdf.GetResource(this.RDF_SYNTAX_TYPE) },

  RSS_090_NS: "http://my.netscape.com/rdf/simple/0.9/",

  RSS_NS: "http://purl.org/rss/1.0/",
  get RSS_CHANNEL()     { return this.rdf.GetResource(this.RSS_NS + "channel") },
  get RSS_TITLE()       { return this.rdf.GetResource(this.RSS_NS + "title") },
  get RSS_DESCRIPTION() { return this.rdf.GetResource(this.RSS_NS + "description") },
  get RSS_ITEMS()       { return this.rdf.GetResource(this.RSS_NS + "items") },
  get RSS_ITEM()        { return this.rdf.GetResource(this.RSS_NS + "item") },
  get RSS_LINK()        { return this.rdf.GetResource(this.RSS_NS + "link") },

  RSS_CONTENT_NS: "http://purl.org/rss/1.0/modules/content/",
  get RSS_CONTENT_ENCODED() {
    return this.rdf.GetResource(this.RSS_CONTENT_NS + "encoded");
  },

  DC_NS: "http://purl.org/dc/elements/1.1/",
  get DC_CREATOR()      { return this.rdf.GetResource(this.DC_NS + "creator") },
  get DC_SUBJECT()      { return this.rdf.GetResource(this.DC_NS + "subject") },
  get DC_DATE()         { return this.rdf.GetResource(this.DC_NS + "date") },
  get DC_TITLE()        { return this.rdf.GetResource(this.DC_NS + "title") },
  get DC_LASTMODIFIED() { return this.rdf.GetResource(this.DC_NS + "lastModified") },
  get DC_IDENTIFIER()   { return this.rdf.GetResource(this.DC_NS + "identifier") },

  MRSS_NS: "http://search.yahoo.com/mrss/",
  FEEDBURNER_NS: "http://rssnamespace.org/feedburner/ext/1.0",
  ITUNES_NS: "http://www.itunes.com/dtds/podcast-1.0.dtd",

  FZ_NS: "urn:forumzilla:",
  FZ_ITEM_NS: "urn:feeditem:",
  get FZ_ROOT()       { return this.rdf.GetResource(this.FZ_NS + "root") },
  get FZ_FEEDS()      { return this.rdf.GetResource(this.FZ_NS + "feeds") },
  get FZ_FEED()       { return this.rdf.GetResource(this.FZ_NS + "feed") },
  get FZ_QUICKMODE()  { return this.rdf.GetResource(this.FZ_NS + "quickMode") },
  get FZ_DESTFOLDER() { return this.rdf.GetResource(this.FZ_NS + "destFolder") },
  get FZ_STORED()     { return this.rdf.GetResource(this.FZ_NS + "stored") },
  get FZ_VALID()      { return this.rdf.GetResource(this.FZ_NS + "valid") },
  get FZ_OPTIONS()    { return this.rdf.GetResource(this.FZ_NS + "options"); },
  get FZ_LAST_SEEN_TIMESTAMP() {
    return this.rdf.GetResource(this.FZ_NS + "last-seen-timestamp");
  },

  get RDF_LITERAL_TRUE()  { return this.rdf.GetLiteral("true") },
  get RDF_LITERAL_FALSE() { return this.rdf.GetLiteral("false") },

  // Atom constants
  ATOM_03_NS: "http://purl.org/atom/ns#",
  ATOM_IETF_NS: "http://www.w3.org/2005/Atom",
  ATOM_THREAD_NS: "http://purl.org/syndication/thread/1.0",

  // Accept content mimetype preferences for feeds.
  REQUEST_ACCEPT: "application/atom+xml," +
                  "application/rss+xml;q=0.9," +
                  "application/rdf+xml;q=0.8," +
                  "application/xml;q=0.7,text/xml;q=0.7," +
                  "*/*;q=0.1",
  // Timeout for nonresponse to request, 30 seconds.
  REQUEST_TIMEOUT: 30 * 1000,

  // The approximate amount of time, specified in milliseconds, to leave an
  // item in the RDF cache after the item has dissappeared from feeds.
  // The delay is currently one day.
  INVALID_ITEM_PURGE_DELAY: 24 * 60 * 60 * 1000,

  kBiffMinutesDefault: 100,
  kNewsBlogSuccess: 0,
  // Usually means there was an error trying to parse the feed.
  kNewsBlogInvalidFeed: 1,
  // Generic networking failure when trying to download the feed.
  kNewsBlogRequestFailure: 2,
  kNewsBlogFeedIsBusy: 3,
  // There are no new articles for this feed
  kNewsBlogNoNewItems: 4,
  kNewsBlogCancel: 5,
  kNewsBlogFileError: 6,

  CANCEL_REQUESTED: false,
  AUTOTAG: "~AUTOTAG",

/**
 * Get all rss account servers rootFolders.
 * 
 * @return array of nsIMsgIncomingServer (empty array if none).
 */
  getAllRssServerRootFolders: function() {
    let rssRootFolders = [];
    let allServers = MailServices.accounts.allServers;
    for (let i = 0; i < allServers.length; i++)
    {
      let server = allServers.queryElementAt(i, Ci.nsIMsgIncomingServer);
      if (server && server.type == "rss")
        rssRootFolders.push(server.rootFolder);
    }

    // By default, Tb sorts by hostname, ie Feeds, Feeds-1, and not by alpha
    // prettyName.  Do the same as a stock install to match folderpane order.
    rssRootFolders.sort(function(a, b) { return a.hostname > b.hostname });

    return rssRootFolders;
  },

/**
 * Create rss account.
 * 
 * @param  string [aName] - optional account name to override default.
 * @return nsIMsgAccount.
 */
  createRssAccount: function(aName) {
    let userName = "nobody";
    let hostName = "Feeds";
    let hostNamePref = hostName;
    let server;
    let serverType = "rss";
    let defaultName = FeedUtils.strings.GetStringFromName("feeds-accountname");
    let i = 2;
    while (MailServices.accounts.findRealServer(userName, hostName, serverType, 0))
      // If "Feeds" exists, try "Feeds-2", then "Feeds-3", etc.
      hostName = hostNamePref + "-" + i++;

    server = MailServices.accounts.createIncomingServer(userName, hostName, serverType);
    server.biffMinutes = FeedUtils.kBiffMinutesDefault;
    server.prettyName = aName ? aName : defaultName;
    server.valid = true;
    let account = MailServices.accounts.createAccount();
    account.incomingServer = server;

    // Ensure the Trash folder db (.msf) is created otherwise folder/message
    // deletes will throw until restart creates it.
    server.msgStore.discoverSubFolders(server.rootMsgFolder, false);

    // Create "Local Folders" if none exist yet as it's guaranteed that
    // those exist when any account exists.
    let localFolders;
    try {
      localFolders = MailServices.accounts.localFoldersServer;
    }
    catch (ex) {}

    if (!localFolders)
      MailServices.accounts.createLocalMailAccount();

    // Save new accounts in case of a crash.
    try {
      MailServices.accounts.saveAccountInfo();
    }
    catch (ex) {
      this.log.error("FeedUtils.createRssAccount: error on saveAccountInfo - " + ex);
    }

    this.log.debug("FeedUtils.createRssAccount: " +
                   account.incomingServer.rootFolder.prettyName);

    return account;
  },

/**
 * Helper routine that checks our subscriptions list array and returns
 * true if the url is already in our list.  This is used to prevent the
 * user from subscribing to the same feed multiple times for the same server.
 * 
 * @param  string aUrl                  - the url.
 * @param  nsIMsgIncomingServer aServer - account server.
 * @return boolean                      - true if exists else false.
 */
  feedAlreadyExists: function(aUrl, aServer) {
    let ds = this.getSubscriptionsDS(aServer);
    let feeds = this.getSubscriptionsList(ds);
    let resource = this.rdf.GetResource(aUrl);
    if (feeds.IndexOf(resource) == -1)
      return false;

    let folder = ds.GetTarget(resource, FeedUtils.FZ_DESTFOLDER, true)
                   .QueryInterface(Ci.nsIRDFResource).ValueUTF8;
    this.log.info("FeedUtils.feedAlreadyExists: feed url " + aUrl +
                  " subscribed in folder url " + decodeURI(folder));

    return true;
  },

/**
 * Download a feed url on biff or get new messages.
 *
 * @param   nsIMsgFolder aFolder         - folder
 * @param   nsIUrlListener aUrlListener  - feed url
 * @param   bool aIsBiff                 - true if biff, false if manual get
 * @param   nsIDOMWindow aMsgWindow      - window
 */
  downloadFeed: function(aFolder, aUrlListener, aIsBiff, aMsgWindow) {
    if (Services.io.offline)
      return;

    // We don't yet support the ability to check for new articles while we are
    // in the middle of subscribing to a feed. For now, abort the check for
    // new feeds.
    if (FeedUtils.progressNotifier.mSubscribeMode)
    {
      FeedUtils.log.warn("downloadFeed: Aborting RSS New Mail Check. " +
                         "Feed subscription in progress\n");
      return;
    }

    let allFolders = Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray);
    if (!aFolder.isServer) {
      // Add the base folder; it does not get returned by ListDescendants. Do not
      // add the account folder as it doesn't have the feedUrl property or even
      // a msgDatabase necessarily.
      allFolders.appendElement(aFolder, false);
    }

    aFolder.ListDescendants(allFolders);

    function feeder() {
      let folder;
      let numFolders = allFolders.length;
      for (let i = 0; i < numFolders; i++) {
        folder = allFolders.queryElementAt(i, Ci.nsIMsgFolder);
        FeedUtils.log.debug("downloadFeed: START x/# foldername:uri - " +
                            (i+1) + "/" + numFolders + " " +
                            folder.name + ":" + folder.URI);

        // Ensure folder's msgDatabase is openable for new message processing.
        // If not, reparse. After the async reparse the folder will be ready
        // for the next cycle; don't bother with a listener. Continue with
        // the next folder, as attempting to add a message to a folder with
        // an unavailable msgDatabase will throw later.
        if (!FeedUtils.isMsgDatabaseOpenable(folder, true))
          continue;

        let feedUrlArray = FeedUtils.getFeedUrlsInFolder(folder);
        // Continue if there are no feedUrls for the folder in the feeds
        // database.  All folders in Trash are skipped.
        if (!feedUrlArray)
          continue;

        FeedUtils.log.debug("downloadFeed: CONTINUE foldername:urlArray - " +
                            folder.name + ":" + feedUrlArray);

        FeedUtils.progressNotifier.init(aMsgWindow, false);

        // We need to kick off a download for each feed.
        let id, feed;
        for (let url of feedUrlArray)
        {
          id = FeedUtils.rdf.GetResource(url);
          feed = new Feed(id, folder.server);
          feed.folder = folder;
          // Bump our pending feed download count.
          FeedUtils.progressNotifier.mNumPendingFeedDownloads++;
          feed.download(true, FeedUtils.progressNotifier);
          FeedUtils.log.debug("downloadFeed: DOWNLOAD feed url - " + url);

          Services.tm.mainThread.dispatch(function() {
            try {
              getFeed.next();
            }
            catch (ex) {
              if (ex instanceof StopIteration)
              {
                // Finished with all feeds in base folder and its subfolders.
                FeedUtils.log.debug("downloadFeed: Finished with folder - " +
                                    aFolder.name);
                folder = null;
                allFolders = null;
              }
              else
              {
                FeedUtils.log.error("downloadFeed: error - " + ex);
                FeedUtils.progressNotifier.downloaded({name: folder.name}, 0);
              }
            }
          }, Ci.nsIThread.DISPATCH_NORMAL);

          yield undefined;
        }
      }
    }

    let getFeed = feeder();
    try {
      getFeed.next();
    }
    catch (ex) {
      if (ex instanceof StopIteration)
      {
        // Nothing to do.
        FeedUtils.log.debug("downloadFeed: Nothing to do in folder - " +
                            aFolder.name);
        folder = null;
        allFolders = null;
      }
      else
      {
        FeedUtils.log.error("downloadFeed: error - " + ex);
        FeedUtils.progressNotifier.downloaded({name: aFolder.name}, 0);
      }
    }
  },

/**
 * Subscribe a new feed url.
 *
 * @param   string aUrl              - feed url
 * @param   nsIMsgFolder aFolder     - folder
 * @param   nsIDOMWindow aMsgWindow  - window
 */
  subscribeToFeed: function(aUrl, aFolder, aMsgWindow) {
    // We don't support the ability to subscribe to several feeds at once yet.
    // For now, abort the subscription if we are already in the middle of
    // subscribing to a feed via drag and drop.
    if (FeedUtils.progressNotifier.mNumPendingFeedDownloads)
    {
      FeedUtils.log.warn("subscribeToFeed: Aborting RSS subscription. " +
                         "Feed downloads already in progress\n");
      return;
    }

    // If aFolder is null, then use the root folder for the first RSS account.
    if (!aFolder)
      aFolder = FeedUtils.getAllRssServerRootFolders()[0];

    // If the user has no Feeds account yet, create one.
    if (!aFolder)
      aFolder = FeedUtils.createRssAccount().incomingServer.rootFolder;

    if (!aMsgWindow)
    {
      let wlist = Services.wm.getEnumerator("mail:3pane");
      if (wlist.hasMoreElements())
      {
        let win = wlist.getNext().QueryInterface(Ci.nsIDOMWindow);
        win.focus();
        aMsgWindow = win.msgWindow;
      }
      else
      {
        // If there are no open windows, open one, pass it the URL, and
        // during opening it will subscribe to the feed.
        let arg = Cc["@mozilla.org/supports-string;1"].
                  createInstance(Ci.nsISupportsString);
        arg.data = aUrl;
        Services.ww.openWindow(null, "chrome://messenger/content/",
                               "_blank", "chrome,dialog=no,all", arg);
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
    if (FeedUtils.feedAlreadyExists(aUrl, aFolder.server))
    {
      aMsgWindow.statusFeedback.showStatusString(
        FeedUtils.strings.GetStringFromName("subscribe-feedAlreadySubscribed"));
      return;
    }

    let itemResource = FeedUtils.rdf.GetResource(aUrl);
    let feed = new Feed(itemResource, aFolder.server);
    feed.quickMode = feed.server.getBoolValue("quickMode");
    feed.options = FeedUtils.getOptionsAcct(feed.server);

    // If the root server, create a new folder for the feed.  The user must
    // want us to add this subscription url to an existing RSS folder.
    if (!aFolder.isServer)
      feed.folder = aFolder;

    FeedUtils.progressNotifier.init(aMsgWindow, true);
    FeedUtils.progressNotifier.mNumPendingFeedDownloads++;
    feed.download(true, FeedUtils.progressNotifier);
  },

/**
 * Add a feed record to the feeds.rdf database and update the folder's feedUrl
 * property.
 *
 * @param  object aFeed - our feed object
 */
  addFeed: function(aFeed) {
    let ds = this.getSubscriptionsDS(aFeed.folder.server);
    let feeds = this.getSubscriptionsList(ds);

    // Generate a unique ID for the feed.
    let id = aFeed.url;
    let i = 1;
    while (feeds.IndexOf(this.rdf.GetResource(id)) != -1 && ++i < 1000)
      id = aFeed.url + i;
    if (i == 1000)
      throw new Error("FeedUtils.addFeed: couldn't generate a unique ID " +
                      "for feed " + aFeed.url);

    // Add the feed to the list.
    id = this.rdf.GetResource(id);
    feeds.AppendElement(id);
    ds.Assert(id, this.RDF_TYPE, this.FZ_FEED, true);
    ds.Assert(id, this.DC_IDENTIFIER, this.rdf.GetLiteral(aFeed.url), true);
    if (aFeed.title)
      ds.Assert(id, this.DC_TITLE, this.rdf.GetLiteral(aFeed.title), true);
    ds.Assert(id, this.FZ_DESTFOLDER, aFeed.folder, true);
    ds.Flush();

    // Update folderpane.
    this.setFolderPaneProperty(aFeed.folder, "_favicon", null);
  },

/**
 * Delete a feed record from the feeds.rdf database and update the folder's
 * feedUrl property.
 *
 * @param  nsIRDFResource aId           - feed url as rdf resource.
 * @param  nsIMsgIncomingServer aServer - folder's account server.
 * @param  nsIMsgFolder aParentFolder   - owning folder.
 */
  deleteFeed: function(aId, aServer, aParentFolder) {
    let feed = new Feed(aId, aServer);
    let ds = this.getSubscriptionsDS(aServer);

    if (!feed || !ds)
     return;

    // Remove the feed from the subscriptions ds.
    let feeds = this.getSubscriptionsList(ds);
    let index = feeds.IndexOf(aId);
    if (index != -1)
      feeds.RemoveElementAt(index, false);

    // Remove all assertions about the feed from the subscriptions database.
    this.removeAssertions(ds, aId);
    ds.Flush();

    // Remove all assertions about items in the feed from the items database.
    let itemds = this.getItemsDS(aServer);
    feed.invalidateItems();
    feed.removeInvalidItems(true);
    itemds.Flush();

    // Update folderpane.
    this.setFolderPaneProperty(aParentFolder, "_favicon", null);

    feed = null;
  },

/**
 * Change an existing feed's url, as identified by FZ_FEED resource in the
 * feeds.rdf subscriptions database.
 *
 * @param  obj aFeed      - the feed object
 * @param  string aNewUrl - new url
 * @return bool           - true if successful, else false
 */
  changeUrlForFeed: function(aFeed, aNewUrl) {
    if (!aFeed || !aFeed.folder || !aNewUrl)
      return false;

    if (this.feedAlreadyExists(aNewUrl, aFeed.folder.server))
    {
      this.log.info("FeedUtils.changeUrlForFeed: new feed url " + aNewUrl +
                    " already subscribed in account " + aFeed.folder.server.prettyName);
      return false;
    }

    let title = aFeed.title;
    let link = aFeed.link;
    let quickMode = aFeed.quickMode;
    let options = aFeed.options;

    this.deleteFeed(this.rdf.GetResource(aFeed.url),
                    aFeed.folder.server, aFeed.folder);
    aFeed.resource = this.rdf.GetResource(aNewUrl)
                             .QueryInterface(Ci.nsIRDFResource);
    aFeed.title = title;
    aFeed.link = link;
    aFeed.quickMode = quickMode;
    aFeed.options = options;
    this.addFeed(aFeed);

    let win = Services.wm.getMostRecentWindow("Mail:News-BlogSubscriptions");
    if (win)
      win.FeedSubscriptions.refreshSubscriptionView(aFeed.folder, aNewUrl);

    return true;
  },

/**
 * Get the list of feed urls for a folder, as identified by the FZ_DESTFOLDER
 * tag, directly from the primary feeds.rdf subscriptions database.
 *
 * @param  nsIMsgFolder - the folder.
 * @return array of urls, or null if none.
 */
  getFeedUrlsInFolder: function(aFolder) {
    if (aFolder.isServer || aFolder.server.type != "rss" ||
        aFolder.getFlag(Ci.nsMsgFolderFlags.Trash) ||
        aFolder.getFlag(Ci.nsMsgFolderFlags.Virtual) ||
        !aFolder.filePath.exists())
      // There are never any feedUrls in the account/non-feed/trash/virtual
      // folders or in a ghost folder (nonexistant on disk yet found in
      // aFolder.subFolders).
      return null;

    let feedUrlArray = [];

    // Get the list from the feeds database.
    try {
      let ds = this.getSubscriptionsDS(aFolder.server);
      let enumerator = ds.GetSources(this.FZ_DESTFOLDER, aFolder, true);
      while (enumerator.hasMoreElements())
      {
        let containerArc = enumerator.getNext();
        let uri = containerArc.QueryInterface(Ci.nsIRDFResource).ValueUTF8;
        feedUrlArray.push(uri);
      }
    }
    catch(ex)
    {
      this.log.error("getFeedUrlsInFolder: feeds.rdf db error - " + ex);
      this.log.error("getFeedUrlsInFolder: feeds.rdf db error for account - " +
                     aFolder.server.serverURI + " : " + aFolder.server.prettyName);
    }

    return feedUrlArray.length ? feedUrlArray : null;
  },

/**
 * Check if the folder's msgDatabase is openable, reparse if desired.
 *
 * @param  nsIMsgFolder aFolder - the folder
 * @param  boolean aReparse     - reparse if true
 * @return boolean              - true if msgDb is available, else false
 */
  isMsgDatabaseOpenable: function(aFolder, aReparse) {
    let msgDb;
    try {
      msgDb = Cc["@mozilla.org/msgDatabase/msgDBService;1"]
                .getService(Ci.nsIMsgDBService).openFolderDB(aFolder, true);
    }
    catch (ex) {}

    if (msgDb)
      return true;

    if (!aReparse)
      return false;

    // Force a reparse.
    FeedUtils.log.debug("checkMsgDb: rebuild msgDatabase for " +
                        aFolder.name + " - " + aFolder.filePath.path);
    try {
      // Ignore error returns.
      aFolder.QueryInterface(Ci.nsIMsgLocalMailFolder)
             .getDatabaseWithReparse(null, null);
    }
    catch (ex) {}

    return false;
  },

/**
 * Update a folderpane ftvItem property.
 *
 * @param  nsIMsgFolder aFolder   - folder
 * @param  string aProperty       - ftvItem property
 * @param  string aValue          - value
 */
  setFolderPaneProperty: function(aFolder, aProperty, aValue) {
    let win = Services.wm.getMostRecentWindow("mail:3pane");
    if (!aFolder || !win)
      return;

    if ("gFolderTreeView" in win) {
      let row = win.gFolderTreeView.getIndexOfFolder(aFolder);
      let rowItem = win.gFolderTreeView.getFTVItemForIndex(row);
      if (rowItem == null)
        return;

      rowItem[aProperty] = aValue;
      win.gFolderTreeView._tree.invalidateRow(row);
    }
  },

  get mFaviconService() {
    delete this.mFaviconService;
    return this.mFaviconService = Cc["@mozilla.org/browser/favicon-service;1"]
                                    .getService(Ci.nsIFaviconService);
 },

/**
 * Get the favicon for a feed folder subscription url (first one) or a feed
 * message url. The favicon service caches it in memory if places history is
 * not enabled.
 *
 * @param  nsIMsgFolder aFolder - the feed folder or null if aUrl
 * @param  string aUrl          - a url (feed, message, other) or null if aFolder
 * @param  string aIconUrl      - the icon url if already determined, else null
 * @param  nsIDOMWindow aWindow - null or caller's window if aCallback needed
 * @param  function aCallback   - null or callback
 * @return string               - the favicon url or empty string
 */
  getFavicon: function(aFolder, aUrl, aIconUrl, aWindow, aCallback) {
    if (!Services.prefs.getBoolPref("browser.chrome.site_icons") ||
        !Services.prefs.getBoolPref("browser.chrome.favicons") ||
         (aCallback && !aWindow))
      return "";

    if (aIconUrl)
      return aIconUrl;

    let url = aUrl;
    if (!url)
    {
      // Get the proposed iconUrl from the folder's first subscribed feed's <link>.
      if (!aFolder)
        return "";

      let feedUrls = this.getFeedUrlsInFolder(aFolder);
      url = feedUrls ? feedUrls[0] : null;
      if (!url)
        return "";
    }

    if (aFolder)
    {
      let ds = this.getSubscriptionsDS(aFolder.server);
      let resource = this.rdf.GetResource(url).QueryInterface(Ci.nsIRDFResource);
      let feedLinkUrl = ds.GetTarget(resource, this.RSS_LINK, true);
      feedLinkUrl = feedLinkUrl ?
                      feedLinkUrl.QueryInterface(Ci.nsIRDFLiteral).Value : null;
      url = feedLinkUrl && feedLinkUrl.startsWith("http") ? feedLinkUrl : url;
    }

    let uri, iconUri;
    try {
      uri = Services.io.newURI(url, null, null);
      iconUri = Services.io.newURI(uri.prePath + "/favicon.ico", null, null);
    }
    catch (ex) {
      return "";
    }

    if (!iconUri || !this.isValidScheme(iconUri))
      return "";

    try {
      // Valid urls with an icon image gecko cannot render will cause a throw.
      FeedUtils.mFaviconService.setAndFetchFaviconForPage(
        uri, iconUri, false, FeedUtils.mFaviconService.FAVICON_LOAD_NON_PRIVATE);
    }
    catch (ex) {}

    if (aWindow) {
      // Unfortunately, setAndFetchFaviconForPage() does not invoke its
      // callback (Bug 740457).  So we have to do it this way. Try to resolve
      // quickly at first, since most fails will do so and it's better ux to
      // populate the icon fast; resolve slow responders on a second check.
      aWindow.setTimeout(function() {
        if (FeedUtils.mFaviconService.isFailedFavicon(iconUri)) {
          let uri = Services.io.newURI(iconUri.prePath, null, null);
          FeedUtils.getFaviconFromPage(uri.prePath, aCallback, null);
        }
        else {
          // Check slow loaders again.
          aWindow.setTimeout(function() {
            if (FeedUtils.mFaviconService.isFailedFavicon(iconUri)) {
              let uri = Services.io.newURI(iconUri.prePath, null, null);
              FeedUtils.getFaviconFromPage(uri.prePath, aCallback, null);
            }
          }, 6000);
        }
      }, 2000);
    }

    return iconUri.spec;
  },

/**
 * Get the favicon by parsing for <link rel=""> with "icon" from the page's dom.
 * @param  string aUrl        - a url from whose homepage to get a favicon
 * @param  function aCallback - callback
 * @param  aArg               - caller's argument or null
 */
  getFaviconFromPage: function(aUrl, aCallback, aArg) {
    let onDownload = function(aEvent) {
      let request = aEvent.target;
      responseDomain = request.channel.URI.prePath;
      let dom = request.response;
      if (request.status != 200 || !(dom instanceof Ci.nsIDOMHTMLDocument) ||
          !dom.head) {
        onDownloadError();
        return;
      }

      let iconUri;
      let linkNode = dom.head.querySelector('link[rel="shortcut icon"],' +
                                            'link[rel="icon"]');
      let href = linkNode ? linkNode.href : null;
      try {
        iconUri = Services.io.newURI(href, null, null);

        if (!iconUri || !FeedUtils.isValidScheme(iconUri) ||
            !FeedUtils.isValidScheme(uri) ||
            FeedUtils.mFaviconService.isFailedFavicon(iconUri)) {
          onDownloadError();
          return;
        }

        FeedUtils.mFaviconService.setAndFetchFaviconForPage(
          uri, iconUri, false, FeedUtils.mFaviconService.FAVICON_LOAD_NON_PRIVATE);
        if (aCallback)
          aCallback(iconUri.spec, responseDomain, aArg);
      }
      catch (ex) {
        onDownloadError();
      }
    }

    let onDownloadError = function() {
      if (aCallback)
        aCallback(null, responseDomain, aArg);
    }

    if (!aUrl)
      onDownloadError();

    let uri = Services.io.newURI(aUrl, null, null);
    let responseDomain;
    let request = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"]
                    .createInstance(Ci.nsIXMLHttpRequest);
    request.open("GET", aUrl, true);
    request.responseType = "document";
    request.onload = onDownload;
    request.onerror = onDownloadError;
    request.send(null);
  },

/**
 * Update the feeds.rdf database for rename and move/copy folder name changes.
 *
 * @param  nsIMsgFolder aFolder      - the folder, new if rename or target of
 *                                      move/copy folder (new parent)
 * @param  nsIMsgFolder aOrigFolder  - original folder
 * @param  string aAction            - "move" or "copy" or "rename"
 */
  updateSubscriptionsDS: function(aFolder, aOrigFolder, aAction) {
    this.log.debug("FeedUtils.updateSubscriptionsDS: " +
                   "\nfolder changed - " + aAction +
                   "\nnew folder  - " + aFolder.filePath.path +
                   "\norig folder - " + aOrigFolder.filePath.path);

    if (aFolder.server.type != "rss" || FeedUtils.isInTrash(aOrigFolder))
      // Target not a feed account folder; nothing to do, or move/rename in
      // trash; no subscriptions already.
      return;

    let newFolder = aFolder;
    let newParentURI = aFolder.URI;
    let origParentURI = aOrigFolder.URI;
    if (aAction == "move" || aAction == "copy")
    {
      // Get the new folder. Don't process the entire parent (new dest folder)!
      newFolder = aFolder.getChildNamed(aOrigFolder.name);
      origParentURI = aOrigFolder.parent ? aOrigFolder.parent.URI :
                                           aOrigFolder.rootFolder.URI;
    }

    this.updateFolderChangeInFeedsDS(newFolder, aOrigFolder, null, null);

    // There may be subfolders, but we only get a single notification; iterate
    // over all descendent folders of the folder whose location has changed.
    let newSubFolders = Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray);
    newFolder.ListDescendants(newSubFolders);
    for (let i = 0; i < newSubFolders.length; i++)
    {
      let newSubFolder = newSubFolders.queryElementAt(i, Ci.nsIMsgFolder);
      FeedUtils.updateFolderChangeInFeedsDS(newSubFolder, aOrigFolder,
                                            newParentURI, origParentURI)
    }
  },

/**
 * Update the feeds.rdf database with the new folder's or subfolder's location
 * for rename and move/copy name changes. The feeds.rdf subscriptions db is
 * also synced on cross account folder copies. Note that if a copied folder's
 * url exists in the new account, its active subscription will be switched to
 * the folder being copied, to enforce the one unique url per account design.
 *
 * @param  nsIMsgFolder aFolder      - new folder
 * @param  nsIMsgFolder aOrigFolder  - original folder
 * @param  string aNewAncestorURI    - for subfolders, ancestor new folder
 * @param  string aOrigAncestorURI   - for subfolders, ancestor original folder
 */
  updateFolderChangeInFeedsDS: function(aFolder, aOrigFolder,
                                        aNewAncestorURI, aOrigAncestorURI) {
    this.log.debug("updateFolderChangeInFeedsDS: " +
                   "\naFolder       - " + aFolder.URI +
                   "\naOrigFolder   - " + aOrigFolder.URI +
                   "\naOrigAncestor - " + aOrigAncestorURI +
                   "\naNewAncestor  - " + aNewAncestorURI);

    // Get the original folder's URI.
    let folderURI = aFolder.URI;
    let origURI = aNewAncestorURI && aOrigAncestorURI ?
                    folderURI.replace(aNewAncestorURI, aOrigAncestorURI) :
                    aOrigFolder.URI;
    let origFolderRes = this.rdf.GetResource(origURI);
    this.log.debug("updateFolderChangeInFeedsDS: urls origURI  - " + origURI);
    // Get the original folder's url list from the feeds database.
    let feedUrlArray = [];
    let dsSrc = this.getSubscriptionsDS(aOrigFolder.server);
    try {
      let enumerator = dsSrc.GetSources(this.FZ_DESTFOLDER, origFolderRes, true);
      while (enumerator.hasMoreElements())
      {
        let containerArc = enumerator.getNext();
        let uri = containerArc.QueryInterface(Ci.nsIRDFResource).ValueUTF8;
        feedUrlArray.push(uri);
      }
    }
    catch(ex)
    {
      this.log.error("updateFolderChangeInFeedsDS: feeds.rdf db error for account - " +
                     aOrigFolder.server.prettyName + " : " + ex);
    }

    if (!feedUrlArray.length)
    {
      this.log.debug("updateFolderChangeInFeedsDS: no feedUrls in this folder");
      return;
    }

    let id, resource, node;
    let ds = this.getSubscriptionsDS(aFolder.server);
    for (let feedUrl of feedUrlArray)
    {
      this.log.debug("updateFolderChangeInFeedsDS: feedUrl - " + feedUrl);

      id = this.rdf.GetResource(feedUrl);
      // If move to trash, unsubscribe.
      if (this.isInTrash(aFolder))
      {
        this.deleteFeed(id, aFolder.server, aFolder);
      }
      else
      {
        resource = this.rdf.GetResource(aFolder.URI);
        // Get the node for the current folder URI.
        node = ds.GetTarget(id, this.FZ_DESTFOLDER, true);
        if (node)
        {
          ds.Change(id, this.FZ_DESTFOLDER, node, resource);
        }
        else
        {
          // If adding a new feed it's a cross account action; make sure to
          // preserve all properties from the original datasource where
          // available. Otherwise use the new folder's name and default server
          // quickMode; preserve link and options.
          let feedTitle = dsSrc.GetTarget(id, this.DC_TITLE, true);
          feedTitle = feedTitle ? feedTitle.QueryInterface(Ci.nsIRDFLiteral).Value :
                                  resource.name;
          let link = dsSrc.GetTarget(id, FeedUtils.RSS_LINK, true);
          link = link ? link.QueryInterface(Ci.nsIRDFLiteral).Value : "";
          let quickMode = dsSrc.GetTarget(id, this.FZ_QUICKMODE, true);
          quickMode = quickMode ? quickMode.QueryInterface(Ci.nsIRDFLiteral).Value :
                                  null;
          quickMode = quickMode == "true" ? true :
                      quickMode == "false" ? false :
                      aFeed.folder.server.getBoolValue("quickMode");
          let options = dsSrc.GetTarget(id, this.FZ_OPTIONS, true);
          options = options ? JSON.parse(options.QueryInterface(Ci.nsIRDFLiteral).Value) :
                              this.optionsTemplate;

          let feed = new Feed(id, aFolder.server);
          feed.folder = aFolder;
          feed.title = feedTitle;
          feed.link = link;
          feed.quickMode = quickMode;
          feed.options = options;
          this.addFeed(feed);
        }
      }
    }

    ds.Flush();
  },

/**
 * When subscribing to feeds by dnd on, or adding a url to, the account
 * folder (only), or creating folder structure via opml import, a subfolder is
 * autocreated and thus the derived/given name must be sanitized to prevent
 * filesystem errors. Hashing invalid chars based on OS rather than filesystem
 * is not strictly correct.
 *
 * @param  nsIMsgFolder aParentFolder - parent folder
 * @param  string       aProposedName - proposed name
 * @param  string       aDefaultName  - default name if proposed sanitizes to
 *                                      blank, caller ensures sane value
 * @param  bool         aUnique       - if true, return a unique indexed name.
 * @return string                     - sanitized unique name
 */
  getSanitizedFolderName: function(aParentFolder, aProposedName, aDefaultName, aUnique) {
    // Clean up the name for the strictest fs (fat) and to ensure portability.
    // 1) Replace line breaks and tabs '\n\r\t' with a space.
    // 2) Remove nonprintable ascii.
    // 3) Remove invalid win chars '* | \ / : < > ? "'.
    // 4) Remove all '.' as starting/ending with one is trouble on osx/win.
    // 5) No leading/trailing spaces.
    let folderName = aProposedName.replace(/[\n\r\t]+/g, " ")
                                  .replace(/[\x00-\x1F]+/g, "")
                                  .replace(/[*|\\\/:<>?"]+/g, "")
                                  .replace(/[\.]+/g, "")
                                  .trim();

    // Prefix with __ if name is:
    // 1) a reserved win filename.
    // 2) an undeletable/unrenameable special folder name (bug 259184).
    if (folderName.toUpperCase()
                  .match(/^COM\d$|^LPT\d$|^CON$|PRN$|^AUX$|^NUL$|^CLOCK\$/) ||
        folderName.toUpperCase()
                  .match(/^INBOX$|^OUTBOX$|^UNSENT MESSAGES$|^TRASH$/))
      folderName = "__" + folderName;

    // Use a default if no name is found.
    if (!folderName)
      folderName = aDefaultName;

    if (!aUnique)
      return folderName;

    // Now ensure the folder name is not a dupe; if so append index.
    let folderNameBase = folderName;
    let i = 2;
    while (aParentFolder.containsChildNamed(folderName))
    {
      folderName = folderNameBase + "-" + i++;
    }

    return folderName;
  },

/**
 * This object will contain all feed specific properties.
 */
  _optionsDefault: {
    version: 1,
    // Autotag and <category> handling options.
    category: {
      enabled: false,
      prefixEnabled: false,
      prefix: null,
    }
  },

  get optionsTemplate()
  {
    // Copy the object.
    return JSON.parse(JSON.stringify(this._optionsDefault));
  },

  getOptionsAcct: function(aServer)
  {
    let optionsAcctPref = "mail.server." + aServer.key + ".feed_options";
    try {
      return JSON.parse(Services.prefs.getCharPref(optionsAcctPref));
    }
    catch (ex) {
      this.setOptionsAcct(aServer, this._optionsDefault);
      return JSON.parse(Services.prefs.getCharPref(optionsAcctPref));
    }
  },

  setOptionsAcct: function(aServer, aOptions)
  {
    let optionsAcctPref = "mail.server." + aServer.key + ".feed_options";
    let newOptions = this.newOptions(aOptions);
    Services.prefs.setCharPref(optionsAcctPref, JSON.stringify(newOptions));
  },

  newOptions: function(aOptions)
  {
    // TODO: Clean options, so that only keys in the active template are stored.
    return aOptions;
  },

  getSubscriptionsDS: function(aServer) {
    if (this[aServer.serverURI] && this[aServer.serverURI]["FeedsDS"])
      return this[aServer.serverURI]["FeedsDS"];

    let file = this.getSubscriptionsFile(aServer);
    let url = Services.io.getProtocolHandler("file").
                          QueryInterface(Ci.nsIFileProtocolHandler).
                          getURLSpecFromFile(file);

    // GetDataSourceBlocking has a cache, so it's cheap to do this again
    // once we've already done it once.
    let ds = this.rdf.GetDataSourceBlocking(url);

    if (!ds)
      throw new Error("FeedUtils.getSubscriptionsDS: can't get feed " +
                      "subscriptions data source - " + url);

    if (!this[aServer.serverURI])
      this[aServer.serverURI] = {};
    return this[aServer.serverURI]["FeedsDS"] =
             ds.QueryInterface(Ci.nsIRDFRemoteDataSource);
  },

  getSubscriptionsList: function(aDataSource) {
    let list = aDataSource.GetTarget(this.FZ_ROOT, this.FZ_FEEDS, true);
    list = list.QueryInterface(Ci.nsIRDFResource);
    list = this.rdfContainerUtils.MakeSeq(aDataSource, list);
    return list;
  },

  getSubscriptionsFile: function(aServer) {
    aServer.QueryInterface(Ci.nsIRssIncomingServer);
    let file = aServer.subscriptionsDataSourcePath;

    // If the file doesn't exist, create it.
    if (!file.exists())
      this.createFile(file, this.FEEDS_TEMPLATE);

    return file;
  },

  FEEDS_TEMPLATE: '<?xml version="1.0"?>\n' +
    '<RDF:RDF xmlns:dc="http://purl.org/dc/elements/1.1/"\n' +
    '         xmlns:fz="urn:forumzilla:"\n' +
    '         xmlns:RDF="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n' +
    '  <RDF:Description about="urn:forumzilla:root">\n' +
    '    <fz:feeds>\n' +
    '      <RDF:Seq>\n' +
    '      </RDF:Seq>\n' +
    '    </fz:feeds>\n' +
    '  </RDF:Description>\n' +
    '</RDF:RDF>\n',

  getItemsDS: function(aServer) {
    if (this[aServer.serverURI] && this[aServer.serverURI]["FeedItemsDS"])
      return this[aServer.serverURI]["FeedItemsDS"];

    let file = this.getItemsFile(aServer);
    let url = Services.io.getProtocolHandler("file").
                          QueryInterface(Ci.nsIFileProtocolHandler).
                          getURLSpecFromFile(file);

    // GetDataSourceBlocking has a cache, so it's cheap to do this again
    // once we've already done it once.
    let ds = this.rdf.GetDataSourceBlocking(url);
    if (!ds)
      throw new Error("FeedUtils.getItemsDS: can't get feed items " +
                      "data source - " + url);

    // Note that it this point the datasource may not be loaded yet.
    // You have to QueryInterface it to nsIRDFRemoteDataSource and check
    // its "loaded" property to be sure.  You can also attach an observer
    // which will get notified when the load is complete.
    if (!this[aServer.serverURI])
      this[aServer.serverURI] = {};
    return this[aServer.serverURI]["FeedItemsDS"] =
             ds.QueryInterface(Ci.nsIRDFRemoteDataSource);
  },

  getItemsFile: function(aServer) {
    aServer.QueryInterface(Ci.nsIRssIncomingServer);
    let file = aServer.feedItemsDataSourcePath;

    // If the file doesn't exist, create it.
    if (!file.exists()) {
      this.createFile(file, this.FEEDITEMS_TEMPLATE);
      return file;
    }

    // If feeditems.rdf is not sane, duplicate messages will occur repeatedly
    // until the file is corrected; check that the file is valid XML. This is
    // done lazily only once in a session.
    let fileUrl = Services.io.getProtocolHandler("file")
                             .QueryInterface(Ci.nsIFileProtocolHandler)
                             .getURLSpecFromFile(file);
    let request = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"]
                    .createInstance(Ci.nsIXMLHttpRequest);
    request.open("GET", fileUrl, false);
    request.responseType = "document";
    request.send();
    let dom = request.responseXML;
    if (dom instanceof Ci.nsIDOMXMLDocument &&
        dom.documentElement.namespaceURI != this.MOZ_PARSERERROR_NS)
      return file;

    // Error on the file. Rename it and create a new one.
    this.log.debug("FeedUtils.getItemsFile: error in feeditems.rdf");
    let errName = "feeditems_error_" +
                  (new Date().toISOString()).replace(/\D/g, "") + ".rdf";
    file.moveTo(file.parent, errName);
    file = aServer.feedItemsDataSourcePath;
    this.createFile(file, this.FEEDITEMS_TEMPLATE);
    this.log.error("FeedUtils.getItemsFile: error in feeditems.rdf in account '" +
                   aServer.prettyName + "'; the file has been moved to " +
                   errName + " and a new file has been created. Recent messages " +
                   "may be duplicated.");
    return file;
  },

  FEEDITEMS_TEMPLATE: '<?xml version="1.0"?>\n' +
    '<RDF:RDF xmlns:dc="http://purl.org/dc/elements/1.1/"\n' +
    '         xmlns:fz="urn:forumzilla:"\n' +
    '         xmlns:RDF="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n' +
    '</RDF:RDF>\n',

  createFile: function(aFile, aTemplate) {
    let fos = FileUtils.openSafeFileOutputStream(aFile);
    fos.write(aTemplate, aTemplate.length);
    FileUtils.closeSafeFileOutputStream(fos);
  },

  getParentTargetForChildResource: function(aChildResource, aParentTarget,
                                            aServer) {
    // Generic get feed property, based on child value. Assumes 1 unique
    // child value with 1 unique parent, valid for feeds.rdf structure.
    let ds = this.getSubscriptionsDS(aServer);
    let childRes = this.rdf.GetResource(aChildResource);
    let parent = null;

    let arcsIn = ds.ArcLabelsIn(childRes);
    while (arcsIn.hasMoreElements())
    {
      let arc = arcsIn.getNext();
      if (arc instanceof Ci.nsIRDFResource)
      {
        parent = ds.GetSource(arc, childRes, true);
        parent = parent.QueryInterface(Ci.nsIRDFResource);
        break;
      }
    }

    if (parent)
    {
      let resource = this.rdf.GetResource(parent.Value);
      return ds.GetTarget(resource, aParentTarget, true);
    }

    return null;
  },

  removeAssertions: function(aDataSource, aResource) {
    let properties = aDataSource.ArcLabelsOut(aResource);
    let property;
    while (properties.hasMoreElements())
    {
      property = properties.getNext();
      let values = aDataSource.GetTargets(aResource, property, true);
      let value;
      while (values.hasMoreElements())
      {
        value = values.getNext();
        aDataSource.Unassert(aResource, property, value, true);
      }
    }
  },

/**
 * Dragging something from somewhere.  It may be a nice x-moz-url or from a
 * browser or app that provides a less nice dataTransfer object in the event.
 * Extract the url and if it passes the scheme test, try to subscribe.
 * 
 * @param  nsIDOMDataTransfer aDataTransfer  - the dnd event's dataTransfer.
 * @return nsIURI uri                        - a uri if valid, null if none.
 */
  getFeedUriFromDataTransfer: function(aDataTransfer) {
    let dt = aDataTransfer;
    let types = ["text/x-moz-url-data", "text/x-moz-url"];
    let validUri = false;
    let uri = Cc["@mozilla.org/network/standard-url;1"].
              createInstance(Ci.nsIURI);

    if (dt.getData(types[0]))
    {
      // The url is the data.
      uri.spec = dt.mozGetDataAt(types[0], 0);
      validUri = this.isValidScheme(uri);
      this.log.trace("getFeedUriFromDataTransfer: dropEffect:type:value - " +
                     dt.dropEffect + " : " + types[0] + " : " + uri.spec);
    }
    else if (dt.getData(types[1]))
    {
      // The url is the first part of the data, the second part is random.
      uri.spec = dt.mozGetDataAt(types[1], 0).split("\n")[0];
      validUri = this.isValidScheme(uri);
      this.log.trace("getFeedUriFromDataTransfer: dropEffect:type:value - " +
                     dt.dropEffect + " : " + types[0] + " : " + uri.spec);
    }
    else
    {
      // Go through the types and see if there's a url; get the first one.
      for (let i = 0; i < dt.types.length; i++) {
        let spec = dt.mozGetDataAt(dt.types[i], 0);
        this.log.trace("getFeedUriFromDataTransfer: dropEffect:index:type:value - " +
                       dt.dropEffect + " : " + i + " : " + dt.types[i] + " : "+spec);
        try {
          uri.spec = spec;
          validUri = this.isValidScheme(uri);
        }
        catch(ex) {}

        if (validUri)
          break;
      };
    }

    return validUri ? uri : null;
  },
 
/**
 * Returns if a uri/url is valid to subscribe.
 * 
 * @param  nsIURI aUri or string aUrl  - the Uri/Url.
 * @return boolean                     - true if a valid scheme, false if not.
 */
  _validSchemes: ["http", "https"],
  isValidScheme: function(aUri) {
    if (!(aUri instanceof Ci.nsIURI)) {
      try {
        aUri = Services.io.newURI(aUri, null, null);
      }
      catch (ex) {
        return false;
      }
    }

    return (this._validSchemes.indexOf(aUri.scheme) != -1);
  },

/**
 * Is a folder Trash or in Trash.
 * 
 * @param  nsIMsgFolder aFolder   - the folder.
 * @return boolean                - true if folder is Trash else false.
 */
  isInTrash: function(aFolder) {
    let trashFolder =
        aFolder.rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Trash);
    if (trashFolder &&
        (trashFolder == aFolder || trashFolder.isAncestorOf(aFolder)))
      return true;
    return false;
  },

/**
 * Return a folder path string constructed from individual folder UTF8 names
 * stored as properties (not possible hashes used to construct disk foldername).
 * 
 * @param  nsIMsgFolder aFolder     - the folder.
 * @return string prettyName | null - name or null if not a disk folder.
 */
  getFolderPrettyPath: function(aFolder) {
    let msgFolder = MailUtils.getFolderForURI(aFolder.URI, true);
    if (!msgFolder)
      // Not a real folder uri.
      return null;

    if (msgFolder.URI == msgFolder.server.serverURI)
      return msgFolder.server.prettyName;

    // Server part first.
    let pathParts = [msgFolder.server.prettyName];
    let rawPathParts = msgFolder.URI.split(msgFolder.server.serverURI + "/");
    let folderURI = msgFolder.server.serverURI;
    rawPathParts = rawPathParts[1].split("/");
    for (let i = 0; i < rawPathParts.length - 1; i++)
    {
      // Two or more folders deep parts here.
      folderURI += "/" + rawPathParts[i];
      msgFolder = MailUtils.getFolderForURI(folderURI, true);
      pathParts.push(msgFolder.name);
    }

    // Leaf folder last.
    pathParts.push(aFolder.name);
    return pathParts.join("/");
  },

/**
 * Date validator for feeds.
 *
 * @param  string aDate - date string
 * @return boolean      - true if passes regex test, false if not
 */
  isValidRFC822Date: function(aDate)
  {
    const FZ_RFC822_RE = "^(((Mon)|(Tue)|(Wed)|(Thu)|(Fri)|(Sat)|(Sun)), *)?\\d\\d?" +
    " +((Jan)|(Feb)|(Mar)|(Apr)|(May)|(Jun)|(Jul)|(Aug)|(Sep)|(Oct)|(Nov)|(Dec))" +
    " +\\d\\d(\\d\\d)? +\\d\\d:\\d\\d(:\\d\\d)? +(([+-]?\\d\\d\\d\\d)|(UT)|(GMT)" +
    "|(EST)|(EDT)|(CST)|(CDT)|(MST)|(MDT)|(PST)|(PDT)|\\w)$";
    let regex = new RegExp(FZ_RFC822_RE);
    return regex.test(aDate);
  },

/**
 * Create rfc5322 date.
 *
 * @param  [string] aDateString - optional date string; if null or invalid
 *                                 date, get the current datetime.
 * @return string               - an rfc5322 date string
 */
  getValidRFC5322Date: function(aDateString)
  {
    let d = new Date(aDateString || new Date().getTime());
    d = isNaN(d.getTime()) ? new Date() : d;
    return jsmime.headeremitter.emitStructuredHeader("Date", d, {}).substring(6).trim();
  },

  // Progress glue code.  Acts as a go between the RSS back end and the mail
  // window front end determined by the aMsgWindow parameter passed into
  // nsINewsBlogFeedDownloader.
  progressNotifier: {
    mSubscribeMode: false,
    mMsgWindow: null,
    mStatusFeedback: null,
    mFeeds: {},
    // Keeps track of the total number of feeds we have been asked to download.
    // This number may not reflect the # of entries in our mFeeds array because
    // not all feeds may have reported in for the first time.
    mNumPendingFeedDownloads: 0,

    init: function(aMsgWindow, aSubscribeMode)
    {
      if (!this.mNumPendingFeedDownloads)
      {
        // If we aren't already in the middle of downloading feed items.
        this.mStatusFeedback = aMsgWindow ? aMsgWindow.statusFeedback : null;
        this.mSubscribeMode = aSubscribeMode;
        this.mMsgWindow = aMsgWindow;

        if (this.mStatusFeedback)
        {
          this.mStatusFeedback.startMeteors();
          this.mStatusFeedback.showStatusString(
            FeedUtils.strings.GetStringFromName(
              aSubscribeMode ? "subscribe-validating-feed" :
                               "newsblog-getNewMsgsCheck"));
        }
      }
    },

    downloaded: function(feed, aErrorCode)
    {
      let location = feed.folder ? feed.folder.filePath.path : "";
      FeedUtils.log.debug("downloaded: "+
                          (this.mSubscribeMode ? "Subscribe " : "Update ") +
                          "errorCode:feedName:folder - " +
                          aErrorCode + " : " + feed.name + " : " + location);
      if (this.mSubscribeMode)
      {
        if (aErrorCode == FeedUtils.kNewsBlogSuccess)
        {
          // Add the feed to the databases.
          FeedUtils.addFeed(feed);

          // Nice touch: select the folder that now contains the newly subscribed
          // feed.  This is particularly nice if we just finished subscribing
          // to a feed URL that the operating system gave us.
          this.mMsgWindow.windowCommands.selectFolder(feed.folder.URI);

          // Check for an existing feed subscriptions window and update it.
          let subscriptionsWindow =
              Services.wm.getMostRecentWindow("Mail:News-BlogSubscriptions");
          if (subscriptionsWindow)
            subscriptionsWindow.FeedSubscriptions.
                                FolderListener.folderAdded(feed.folder);
        }
        else
        {
          // Non success.  Remove intermediate traces from the feeds database.
          if (feed && feed.url && feed.server)
            FeedUtils.deleteFeed(FeedUtils.rdf.GetResource(feed.url),
                                 feed.server,
                                 feed.server.rootFolder);
        }
      }

      if (feed.folder && aErrorCode != FeedUtils.kNewsBlogFeedIsBusy)
        // Free msgDatabase after new mail biff is set; if busy let the next
        // result do the freeing.  Otherwise new messages won't be indicated.
        feed.folder.msgDatabase = null;

      let message = "";
      if (feed.folder)
        location = FeedUtils.getFolderPrettyPath(feed.folder) + " -> ";
      switch (aErrorCode) {
        case FeedUtils.kNewsBlogSuccess:
        case FeedUtils.kNewsBlogFeedIsBusy:
          message = "";
          break;
        case FeedUtils.kNewsBlogNoNewItems:
          message = feed.url+". " +
                    FeedUtils.strings.GetStringFromName(
                      "newsblog-noNewArticlesForFeed");
          break;
        case FeedUtils.kNewsBlogInvalidFeed:
          message = FeedUtils.strings.formatStringFromName(
                      "newsblog-feedNotValid", [feed.url], 1);
          break;
        case FeedUtils.kNewsBlogRequestFailure:
          message = FeedUtils.strings.formatStringFromName(
                      "newsblog-networkError", [feed.url], 1);
          break;
        case FeedUtils.kNewsBlogFileError:
          message = FeedUtils.strings.GetStringFromName(
                      "subscribe-errorOpeningFile");
          break;
      }
      if (message)
        FeedUtils.log.info("downloaded: " +
                           (this.mSubscribeMode ? "Subscribe: " : "Update: ") +
                           location + message);

      if (this.mStatusFeedback)
      {
        this.mStatusFeedback.showStatusString(message);
        this.mStatusFeedback.stopMeteors();
      }

      if (!--this.mNumPendingFeedDownloads)
      {
        FeedUtils.getSubscriptionsDS(feed.server).Flush();
        this.mFeeds = {};
        this.mSubscribeMode = false;
        FeedUtils.log.debug("downloaded: all pending downloads finished");

        // Should we do this on a timer so the text sticks around for a little
        // while?  It doesnt look like we do it on a timer for newsgroups so
        // we'll follow that model.  Don't clear the status text if we just
        // dumped an error to the status bar!
        if (aErrorCode == FeedUtils.kNewsBlogSuccess && this.mStatusFeedback)
          this.mStatusFeedback.showStatusString("");
      }

      feed = null;
    },

    // This gets called after the RSS parser finishes storing a feed item to
    // disk. aCurrentFeedItems is an integer corresponding to how many feed
    // items have been downloaded so far.  aMaxFeedItems is an integer
    // corresponding to the total number of feed items to download
    onFeedItemStored: function (feed, aCurrentFeedItems, aMaxFeedItems)
    {
      // We currently don't do anything here.  Eventually we may add status
      // text about the number of new feed articles received.

      if (this.mSubscribeMode && this.mStatusFeedback)
      {
        // If we are subscribing to a feed, show feed download progress.
        this.mStatusFeedback.showStatusString(
          FeedUtils.strings.formatStringFromName("subscribe-gettingFeedItems",
                                                 [aCurrentFeedItems, aMaxFeedItems], 2));
        this.onProgress(feed, aCurrentFeedItems, aMaxFeedItems);
      }
    },

    onProgress: function(feed, aProgress, aProgressMax, aLengthComputable)
    {
      if (feed.url in this.mFeeds)
        // Have we already seen this feed?
        this.mFeeds[feed.url].currentProgress = aProgress;
      else
        this.mFeeds[feed.url] = {currentProgress: aProgress,
                                 maxProgress: aProgressMax};

      this.updateProgressBar();
    },

    updateProgressBar: function()
    {
      let currentProgress = 0;
      let maxProgress = 0;
      for (let index in this.mFeeds)
      {
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
      if (this.mStatusFeedback)
      {
        let progress = (currentProgress * 100) / maxProgress;
        this.mStatusFeedback.showProgress(progress);
      }
    }
  }
};

XPCOMUtils.defineLazyGetter(FeedUtils, "log", function() {
  return Log4Moz.getConfiguredLogger("Feeds");
});

XPCOMUtils.defineLazyGetter(FeedUtils, "strings", function() {
  return Services.strings.createBundle(
    "chrome://messenger-newsblog/locale/newsblog.properties");
});

XPCOMUtils.defineLazyGetter(FeedUtils, "rdf", function() {
  return Cc["@mozilla.org/rdf/rdf-service;1"].
         getService(Ci.nsIRDFService);
});

XPCOMUtils.defineLazyGetter(FeedUtils, "rdfContainerUtils", function() {
  return Cc["@mozilla.org/rdf/container-utils;1"].
         getService(Ci.nsIRDFContainerUtils);
});
