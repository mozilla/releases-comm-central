/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Cache for all of the feeds currently being downloaded, indexed by URL,
// so the load event listener can access the Feed objects after it finishes
// downloading the feed.
var FeedCache =
{
  mFeeds: {},

  putFeed: function (aFeed)
  {
    this.mFeeds[this.normalizeHost(aFeed.url)] = aFeed;
  },

  getFeed: function (aUrl)
  {
    let index = this.normalizeHost(aUrl);
    if (index in this.mFeeds)
      return this.mFeeds[index];
    return null;
  },

  removeFeed: function (aUrl)
  {
    let index = this.normalizeHost(aUrl);
    if (index in this.mFeeds)
      delete this.mFeeds[index];
  },

  normalizeHost: function (aUrl)
  {
    try
    {
      let normalizedUrl = Services.io.newURI(aUrl, null, null);
      normalizedUrl.host = normalizedUrl.host.toLowerCase();
      return normalizedUrl.spec
    }
    catch (ex)
    {
      return aUrl;
    }
  }
};

function Feed(aResource, aRSSServer)
{
  this.resource = aResource.QueryInterface(Ci.nsIRDFResource);
  this.server = aRSSServer;
}

Feed.prototype = 
{
  description: null,
  author: null,
  request: null,
  server: null,
  downloadCallback: null,
  resource: null,
  items: new Array(),
  itemsStored: 0,
  mFolder: null,
  mInvalidFeed: false,
  mFeedType: null,
  mLastModified: null,

  get folder()
  {
    return this.mFolder;
  },

  set folder (aFolder)
  {
    this.mFolder = aFolder;
  },

  get name()
  {
    // Used for the feed's title in Subcribe dialog and opml export.
    let name = this.title || this.description || this.url;
    return name.replace(/[\n\r\t]+/g, " ").replace(/[\x00-\x1F]+/g, "");
  },

  get folderName()
  {
    if (this.mFolderName)
      return this.mFolderName;

    // Get a unique sanitized name. Use title or description as a base;
    // these are mandatory by spec. Length of 80 is plenty.
    let folderName = (this.title || this.description || "").substr(0,80);
    let defaultName = FeedUtils.strings.GetStringFromName("ImportFeedsNew");
    return this.mFolderName = FeedUtils.getSanitizedFolderName(this.server.rootMsgFolder,
                                                               folderName,
                                                               defaultName,
                                                               true);
  },

  download: function(aParseItems, aCallback)
  {
     // May be null.
    this.downloadCallback = aCallback;

    // Whether or not to parse items when downloading and parsing the feed.
    // Defaults to true, but setting to false is useful for obtaining
    // just the title of the feed when the user subscribes to it.
    this.parseItems = aParseItems == null ? true : aParseItems ? true : false;

    // Before we do anything, make sure the url is an http url.  This is just
    // a sanity check so we don't try opening mailto urls, imap urls, etc. that
    // the user may have tried to subscribe to as an rss feed.
    let uri = Cc["@mozilla.org/network/standard-url;1"].
              createInstance(Ci.nsIURI);
    uri.spec = this.url;
    if (!FeedUtils.isValidScheme(uri))
    {
       // Simulate an invalid feed error.
      FeedUtils.log.info("Feed.download: invalid protocol for - " + uri.spec);
      this.onParseError(this);
      return;
    }

    // Before we try to download the feed, make sure we aren't already
    // processing the feed by looking up the url in our feed cache.
    if (FeedCache.getFeed(this.url))
    {
      if (this.downloadCallback)
        this.downloadCallback.downloaded(this, FeedUtils.kNewsBlogFeedIsBusy);
      // Return, the feed is already in use.
      return;
    }

    if (Services.io.offline) {
      // If offline and don't want to go online, just add the feed subscription;
      // it can be verified later (the folder name will be the url if not adding
      // to an existing folder). Only for subscribe actions; passive biff and
      // active get new messages are handled prior to getting here.
      let win = Services.wm.getMostRecentWindow("mail:3pane");
      if (!win.MailOfflineMgr.getNewMail()) {
        this.storeNextItem();
        return;
      }
    }

    this.request = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].
                   createInstance(Ci.nsIXMLHttpRequest);
    // Must set onProgress before calling open.
    this.request.onprogress = this.onProgress;
    this.request.open("GET", this.url, true);
    this.request.channel.loadFlags |= Ci.nsIRequest.LOAD_BYPASS_CACHE |
                                      Ci.nsIRequest.INHIBIT_CACHING;

    // Some servers, if sent If-Modified-Since, will send 304 if subsequently
    // not sent If-Modified-Since, as in the case of an unsubscribe and new
    // subscribe.  Send start of century date to force a download; some servers
    // will 304 on older dates (such as epoch 1970).
    let lastModified = this.lastModified || "Sat, 01 Jan 2000 00:00:00 GMT";
    this.request.setRequestHeader("If-Modified-Since", lastModified);

    // Only order what you're going to eat...
    this.request.responseType = "document";
    this.request.overrideMimeType("text/xml");
    this.request.setRequestHeader("Accept", FeedUtils.REQUEST_ACCEPT);
    this.request.timeout = FeedUtils.REQUEST_TIMEOUT;
    this.request.onload = this.onDownloaded;
    this.request.onerror = this.onDownloadError;
    this.request.ontimeout = this.onDownloadError;
    FeedCache.putFeed(this);
    this.request.send(null);
  },

  onDownloaded: function(aEvent)
  {
    let request = aEvent.target;
    let isHttp = /^http(s?)/.test(request.channel.originalURI.scheme);
    let url = request.channel.originalURI.spec;
    if (isHttp && (request.status < 200 || request.status >= 300))
    {
      Feed.prototype.onDownloadError(aEvent);
      return;
    }

    FeedUtils.log.debug("Feed.onDownloaded: got a download - " + url);
    let feed = FeedCache.getFeed(url);
    if (!feed)
      throw new Error("Feed.onDownloaded: error - couldn't retrieve feed " +
                      "from cache");

    // If the server sends a Last-Modified header, store the property on the
    // feed so we can use it when making future requests, to avoid downloading
    // and parsing feeds that have not changed.  Don't update if merely checking
    // the url, as for subscribe move/copy, as a subsequent refresh may get a 304.
    // Save the response and persist it only upon successful completion of the
    // refresh cycle (i.e. not if the request is cancelled).
    let lastModifiedHeader = request.getResponseHeader("Last-Modified");
    feed.mLastModified = (lastModifiedHeader && feed.parseItems) ?
                           lastModifiedHeader : null;

    // The download callback is called asynchronously when parse() is done.
    feed.parse();
  },
  
  onProgress: function(aEvent) 
  {
    let request = aEvent.target;
    let url = request.channel.originalURI.spec;
    let feed = FeedCache.getFeed(url);

    if (feed.downloadCallback)
      feed.downloadCallback.onProgress(feed, aEvent.loaded, aEvent.total,
                                       aEvent.lengthComputable);
  },

  onDownloadError: function(aEvent)
  {
    let request = aEvent.target;
    let url = request.channel.originalURI.spec;
    let feed = FeedCache.getFeed(url);
    if (feed.downloadCallback) 
    {
      let error = FeedUtils.kNewsBlogRequestFailure;
      try
      {
        if (request.status == 304)
          // If the http status code is 304, the feed has not been modified
          // since we last downloaded it and does not need to be parsed.
          error = FeedUtils.kNewsBlogNoNewItems;
      }
      catch (ex) {}

      feed.downloadCallback.downloaded(feed, error);
    }

    FeedCache.removeFeed(url);
  },

  onParseError: function(aFeed)
  {
    if (!aFeed)
      return;

    aFeed.mInvalidFeed = true;
    if (aFeed.downloadCallback)
      aFeed.downloadCallback.downloaded(aFeed, FeedUtils.kNewsBlogInvalidFeed);

    FeedCache.removeFeed(aFeed.url);
  },

  onUrlChange: function(aFeed, aOldUrl)
  {
    if (!aFeed)
      return;

    // Simulate a cancel after a url update; next cycle will check the new url.
    aFeed.mInvalidFeed = true;
    if (aFeed.downloadCallback)
      aFeed.downloadCallback.downloaded(aFeed, FeedUtils.kNewsBlogCancel);

    FeedCache.removeFeed(aOldUrl);
  },

  get url()
  {
    let ds = FeedUtils.getSubscriptionsDS(this.server);
    let url = ds.GetTarget(this.resource, FeedUtils.DC_IDENTIFIER, true);
    if (url)
      url = url.QueryInterface(Ci.nsIRDFLiteral).Value;
    else
      url = this.resource.ValueUTF8;

    return url;
  },

  get title()
  {
    let ds = FeedUtils.getSubscriptionsDS(this.server);
    let title = ds.GetTarget(this.resource, FeedUtils.DC_TITLE, true);
    if (title)
      title = title.QueryInterface(Ci.nsIRDFLiteral).Value;

    return title;
  },

  set title (aNewTitle)
  {
    if (!aNewTitle)
      return;

    let ds = FeedUtils.getSubscriptionsDS(this.server);
    aNewTitle = FeedUtils.rdf.GetLiteral(aNewTitle);
    let old_title = ds.GetTarget(this.resource, FeedUtils.DC_TITLE, true);
    if (old_title)
        ds.Change(this.resource, FeedUtils.DC_TITLE, old_title, aNewTitle);
    else
        ds.Assert(this.resource, FeedUtils.DC_TITLE, aNewTitle, true);
  },

  get lastModified()
  {
    let ds = FeedUtils.getSubscriptionsDS(this.server);
    let lastModified = ds.GetTarget(this.resource,
                                    FeedUtils.DC_LASTMODIFIED,
                                    true);
    if (lastModified)
      lastModified = lastModified.QueryInterface(Ci.nsIRDFLiteral).Value;
    return lastModified;
  },

  set lastModified(aLastModified)
  {
    let ds = FeedUtils.getSubscriptionsDS(this.server);
    aLastModified = FeedUtils.rdf.GetLiteral(aLastModified);
    let old_lastmodified = ds.GetTarget(this.resource,
                                        FeedUtils.DC_LASTMODIFIED,
                                        true);
    if (old_lastmodified)
      ds.Change(this.resource, FeedUtils.DC_LASTMODIFIED,
                old_lastmodified, aLastModified);
    else
      ds.Assert(this.resource, FeedUtils.DC_LASTMODIFIED, aLastModified, true);
  },

  get quickMode ()
  {
    let ds = FeedUtils.getSubscriptionsDS(this.server);
    let quickMode = ds.GetTarget(this.resource, FeedUtils.FZ_QUICKMODE, true);
    if (quickMode)
    {
      quickMode = quickMode.QueryInterface(Ci.nsIRDFLiteral);
      quickMode = quickMode.Value == "true";
    }

    return quickMode;
  },

  set quickMode (aNewQuickMode)
  {
    let ds = FeedUtils.getSubscriptionsDS(this.server);
    aNewQuickMode = FeedUtils.rdf.GetLiteral(aNewQuickMode);
    let old_quickMode = ds.GetTarget(this.resource, 
                                     FeedUtils.FZ_QUICKMODE,
                                     true);
    if (old_quickMode)
      ds.Change(this.resource, FeedUtils.FZ_QUICKMODE,
                old_quickMode, aNewQuickMode);
    else
      ds.Assert(this.resource, FeedUtils.FZ_QUICKMODE,
                aNewQuickMode, true);
  },

  get options ()
  {
    let ds = FeedUtils.getSubscriptionsDS(this.server);
    let options = ds.GetTarget(this.resource, FeedUtils.FZ_OPTIONS, true);
    if (options)
      return JSON.parse(options.QueryInterface(Ci.nsIRDFLiteral).Value);

    return null;
  },

  set options (aOptions)
  {
    let newOptions = aOptions ? FeedUtils.newOptions(aOptions) :
                                FeedUtils._optionsDefault;
    let ds = FeedUtils.getSubscriptionsDS(this.server);
    newOptions = FeedUtils.rdf.GetLiteral(JSON.stringify(newOptions));
    let oldOptions = ds.GetTarget(this.resource, FeedUtils.FZ_OPTIONS, true);
    if (oldOptions)
      ds.Change(this.resource, FeedUtils.FZ_OPTIONS, oldOptions, newOptions);
    else
      ds.Assert(this.resource, FeedUtils.FZ_OPTIONS, newOptions, true);
  },

  categoryPrefs: function ()
  {
    let categoryPrefsAcct = FeedUtils.getOptionsAcct(this.server).category;
    if (!this.options)
      return categoryPrefsAcct;

    return this.options.category;
  },

  get link ()
  {
    let ds = FeedUtils.getSubscriptionsDS(this.server);
    let link = ds.GetTarget(this.resource, FeedUtils.RSS_LINK, true);
    if (link)
      link = link.QueryInterface(Ci.nsIRDFLiteral).Value;

    return link;
  },

  set link (aNewLink)
  {
    if (!aNewLink)
      return;

    let ds = FeedUtils.getSubscriptionsDS(this.server);
    aNewLink = FeedUtils.rdf.GetLiteral(aNewLink);
    let old_link = ds.GetTarget(this.resource, FeedUtils.RSS_LINK, true);
    if (old_link)
      ds.Change(this.resource, FeedUtils.RSS_LINK, old_link, aNewLink);
    else
      ds.Assert(this.resource, FeedUtils.RSS_LINK, aNewLink, true);
  },

  parse: function()
  {
    // Create a feed parser which will parse the feed.
    let parser = new FeedParser();
    this.itemsToStore = parser.parseFeed(this, this.request.responseXML);
    parser = null;

    if (this.mInvalidFeed)
    {
      this.request = null;
      this.mInvalidFeed = false;
      return;
    }

    // storeNextItem() will iterate through the parsed items, storing each one.
    this.itemsToStoreIndex = 0;
    this.itemsStored = 0;
    this.storeNextItem();
  },

  invalidateItems: function ()
  {
    let ds = FeedUtils.getItemsDS(this.server);
    FeedUtils.log.debug("Feed.invalidateItems: for url - " + this.url);
    let items = ds.GetSources(FeedUtils.FZ_FEED, this.resource, true);
    let item;

    while (items.hasMoreElements())
    {
      item = items.getNext();
      item = item.QueryInterface(Ci.nsIRDFResource);
      FeedUtils.log.trace("Feed.invalidateItems: item - " + item.Value);
      let valid = ds.GetTarget(item, FeedUtils.FZ_VALID, true);
      if (valid)
        ds.Unassert(item, FeedUtils.FZ_VALID, valid, true);
    }
  },

  removeInvalidItems: function(aDeleteFeed)
  {
    let ds = FeedUtils.getItemsDS(this.server);
    FeedUtils.log.debug("Feed.removeInvalidItems: for url - " + this.url);
    let items = ds.GetSources(FeedUtils.FZ_FEED, this.resource, true);
    let item;
    let currentTime = new Date().getTime();
    while (items.hasMoreElements())
    {
      item = items.getNext();
      item = item.QueryInterface(Ci.nsIRDFResource);

      if (ds.HasAssertion(item, FeedUtils.FZ_VALID,
                          FeedUtils.RDF_LITERAL_TRUE, true))
        continue;

      let lastSeenTime = ds.GetTarget(item, FeedUtils.FZ_LAST_SEEN_TIMESTAMP, true);
      if (lastSeenTime)
        lastSeenTime = parseInt(lastSeenTime.QueryInterface(Ci.nsIRDFLiteral).Value)
      else
        lastSeenTime = 0;

      if ((currentTime - lastSeenTime) < FeedUtils.INVALID_ITEM_PURGE_DELAY &&
          !aDeleteFeed)
        // Don't immediately purge items in active feeds; do so for deleted feeds.
        continue;

      FeedUtils.log.trace("Feed.removeInvalidItems: item - " + item.Value);
      ds.Unassert(item, FeedUtils.FZ_FEED, this.resource, true);
      if (ds.hasArcOut(item, FeedUtils.FZ_FEED))
        FeedUtils.log.debug("Feed.removeInvalidItems: " + item.Value +
                            " is from more than one feed; only the reference to" +
                            " this feed removed");
      else
        FeedUtils.removeAssertions(ds, item);
    }
  },

  createFolder: function()
  {
    if (this.folder)
      return;

    try {
      this.folder = this.server.rootMsgFolder
                               .QueryInterface(Ci.nsIMsgLocalMailFolder)
                               .createLocalSubfolder(this.folderName);
    }
    catch (ex) {
      // An error creating.
      FeedUtils.log.info("Feed.createFolder: error creating folder - '"+
                          this.folderName+"' in parent folder "+
                          this.server.rootMsgFolder.filePath.path + " -- "+ex);
      // But its remnants are still there, clean up.
      let xfolder = this.server.rootMsgFolder.getChildNamed(this.folderName);
      this.server.rootMsgFolder.propagateDelete(xfolder, true, null);
    }
  },

  // Gets the next item from itemsToStore and forces that item to be stored
  // to the folder.  If more items are left to be stored, fires a timer for
  // the next one, otherwise triggers a download done notification to the UI.
  storeNextItem: function()
  {
    if (FeedUtils.CANCEL_REQUESTED)
    {
      FeedUtils.CANCEL_REQUESTED = false;
      this.cleanupParsingState(this, FeedUtils.kNewsBlogCancel);
      return;
    }

    if (!this.itemsToStore || !this.itemsToStore.length)
    {
      let code = FeedUtils.kNewsBlogSuccess;
      this.createFolder();
      if (!this.folder)
        code = FeedUtils.kNewsBlogFileError;
      this.cleanupParsingState(this, code);
      return;
    }

    let item = this.itemsToStore[this.itemsToStoreIndex];

    if (item.store())
      this.itemsStored++;

    if (!this.folder)
    {
      this.cleanupParsingState(this, FeedUtils.kNewsBlogFileError);
      return;
    }

    this.itemsToStoreIndex++;

    // If the listener is tracking progress for each item, report it here.
    if (item.feed.downloadCallback && item.feed.downloadCallback.onFeedItemStored)
      item.feed.downloadCallback.onFeedItemStored(item.feed,
                                                  this.itemsToStoreIndex,
                                                  this.itemsToStore.length);

    // Eventually we'll report individual progress here.

    if (this.itemsToStoreIndex < this.itemsToStore.length)
    {
      if (!this.storeItemsTimer)
        this.storeItemsTimer = Cc["@mozilla.org/timer;1"].
                               createInstance(Ci.nsITimer);
      this.storeItemsTimer.initWithCallback(this, 50, Ci.nsITimer.TYPE_ONE_SHOT);
    }
    else
    {
      // We have just finished downloading one or more feed items into the
      // destination folder; if the folder is still listed as having new
      // messages in it, then we should set the biff state on the folder so the
      // right RDF UI changes happen in the folder pane to indicate new mail.
      if (item.feed.folder.hasNewMessages)
      {
        item.feed.folder.biffState = Ci.nsIMsgFolder.nsMsgBiffState_NewMail;
        // Run the bayesian spam filter, if enabled.
        item.feed.folder.callFilterPlugins(null);
      }

      this.cleanupParsingState(this, FeedUtils.kNewsBlogSuccess);
    }
  },

  cleanupParsingState: function(aFeed, aCode)
  {
    // Now that we are done parsing the feed, remove the feed from the cache.
    FeedCache.removeFeed(aFeed.url);
    aFeed.removeInvalidItems(false);

    if (aCode == FeedUtils.kNewsBlogSuccess && aFeed.mLastModified)
      aFeed.lastModified = aFeed.mLastModified;

    // Flush any feed item changes to disk.
    let ds = FeedUtils.getItemsDS(aFeed.server);
    ds.Flush();
    FeedUtils.log.debug("Feed.cleanupParsingState: items stored - " + this.itemsStored);

    // Force the xml http request to go away.  This helps reduce some nasty
    // assertions on shut down.
    this.request = null;
    this.itemsToStore = "";
    this.itemsToStoreIndex = 0;
    this.itemsStored = 0;
    this.storeItemsTimer = null;

    if (aFeed.downloadCallback)
      aFeed.downloadCallback.downloaded(aFeed, aCode);
  },

  // nsITimerCallback
  notify: function(aTimer)
  {
    this.storeNextItem();
  }
};

