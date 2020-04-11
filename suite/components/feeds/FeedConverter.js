/* -*- Mode: Javascript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
var {XPCOMUtils} = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

const TYPE_MAYBE_FEED = "application/vnd.mozilla.maybe.feed";
const TYPE_MAYBE_VIDEO_FEED = "application/vnd.mozilla.maybe.video.feed";
const TYPE_MAYBE_AUDIO_FEED = "application/vnd.mozilla.maybe.audio.feed";
const TYPE_ANY = "*/*";

const FEEDHANDLER_URI = "about:feeds";

const PREF_SELECTED_APP = "browser.feeds.handlers.application";
const PREF_SELECTED_WEB = "browser.feeds.handlers.webservice";
const PREF_SELECTED_ACTION = "browser.feeds.handler";
const PREF_SELECTED_READER = "browser.feeds.handler.default";

const PREF_VIDEO_SELECTED_APP = "browser.videoFeeds.handlers.application";
const PREF_VIDEO_SELECTED_WEB = "browser.videoFeeds.handlers.webservice";
const PREF_VIDEO_SELECTED_ACTION = "browser.videoFeeds.handler";
const PREF_VIDEO_SELECTED_READER = "browser.videoFeeds.handler.default";

const PREF_AUDIO_SELECTED_APP = "browser.audioFeeds.handlers.application";
const PREF_AUDIO_SELECTED_WEB = "browser.audioFeeds.handlers.webservice";
const PREF_AUDIO_SELECTED_ACTION = "browser.audioFeeds.handler";
const PREF_AUDIO_SELECTED_READER = "browser.audioFeeds.handler.default";

function getPrefAppForType(t) {
  switch (t) {
    case Ci.nsIFeed.TYPE_VIDEO:
      return PREF_VIDEO_SELECTED_APP;

    case Ci.nsIFeed.TYPE_AUDIO:
      return PREF_AUDIO_SELECTED_APP;

    default:
      return PREF_SELECTED_APP;
  }
}

function getPrefWebForType(t) {
  switch (t) {
    case Ci.nsIFeed.TYPE_VIDEO:
      return PREF_VIDEO_SELECTED_WEB;

    case Ci.nsIFeed.TYPE_AUDIO:
      return PREF_AUDIO_SELECTED_WEB;

    default:
      return PREF_SELECTED_WEB;
  }
}

function getPrefActionForType(t) {
  switch (t) {
    case Ci.nsIFeed.TYPE_VIDEO:
      return PREF_VIDEO_SELECTED_ACTION;

    case Ci.nsIFeed.TYPE_AUDIO:
      return PREF_AUDIO_SELECTED_ACTION;

    default:
      return PREF_SELECTED_ACTION;
  }
}

function getPrefReaderForType(t) {
  switch (t) {
    case Ci.nsIFeed.TYPE_VIDEO:
      return PREF_VIDEO_SELECTED_READER;

    case Ci.nsIFeed.TYPE_AUDIO:
      return PREF_AUDIO_SELECTED_READER;

    default:
      return PREF_SELECTED_READER;
  }
}

function LOG(str) {
  if (Services.prefs.getBoolPref("feeds.log", false))
    dump("*** Feeds: " + str + "\n");
}

function FeedConverter() {
}

FeedConverter.prototype = {
  /**
   * This is the downloaded text data for the feed.
   */
  _data: null,

  /**
   * This is the object listening to the conversion, which is ultimately the
   * docshell for the load.
   */
  _listener: null,

  /**
   * Records if the feed was sniffed
   */
  _sniffed: false,

  /**
   * See nsISupports.idl
   */
  QueryInterface: XPCOMUtils.generateQI(
    [Ci.nsIFeedResultListener,
     Ci.nsIStreamConverter,
     Ci.nsIStreamListener,
     Ci.nsIRequestObserver]),
  classID: Components.ID("{88592f45-3866-4c8e-9d8a-ab58b290fcf7}"),

  /**
   * See nsIStreamConverter.idl
   */
  convert: function convert(sourceStream, sourceType, destinationType,
                               context) {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },

  /**
   * See nsIStreamConverter.idl
   */
  asyncConvertData: function asyncConvertData(sourceType, destinationType,
                                               listener, context) {
    this._listener = listener;
  },

  /**
   * Whether or not the preview page is being forced.
   */
  _forcePreviewPage: false,

  /**
   * Release our references to various things once we're done using them.
   */
  _releaseHandles: function _releaseHandles() {
    this._listener = null;
    this._request = null;
    this._processor = null;
  },

  /**
   * See nsIFeedResultListener.idl
   */
  handleResult: function handleResult(result) {
    // Feeds come in various content types, which our feed sniffer coerces to
    // the maybe.feed type. However, feeds are used as a transport for
    // different data types, e.g. news/blogs (traditional feed), video/audio
    // (podcasts) and photos (photocasts, photostreams). Each of these is
    // different in that there's a different class of application suitable for
    // handling feeds of that type, but without a content-type differentiation
    // it is difficult for us to disambiguate.
    //
    // The other problem is that if the user specifies an auto-action handler
    // for one feed application, the fact that the content type is shared means
    // that all other applications will auto-load with that handler too,
    // regardless of the content-type.
    //
    // This means that content-type alone is not enough to determine whether
    // or not a feed should be auto-handled. Therefore for feeds we need
    // to always use this stream converter, even when an auto-action is
    // specified, not the basic one provided by WebContentConverter. This
    // converter needs to consume all of the data and parse it, and based on
    // that determination make a judgement about type.
    //
    // Since there are no content types for this content, and I'm not going to
    // invent any, the upshot is that while a user can set an auto-handler for
    // generic feed content, the system will prevent them from setting an auto-
    // handler for other stream types. In those cases, the user will always see
    // the preview page and have to select a handler. We can guess and show
    // a client handler, but will not be able to show web handlers for those
    // types.
    //
    // If this is just a feed, not some kind of specialized application, then
    // auto-handlers can be set and we should obey them.
    try {
      var feedService = Cc["@mozilla.org/browser/feeds/result-service;1"]
                          .getService(Ci.nsIFeedResultService);
      if (!this._forcePreviewPage && result.doc) {
        var feed = result.doc.QueryInterface(Ci.nsIFeed);
        var handler = Services.prefs.getCharPref(getPrefActionForType(feed.type), "ask");

        if (handler != "ask") {
          if (handler == "reader")
            handler = Services.prefs.getCharPref(getPrefReaderForType(feed.type), "messenger");
          switch (handler) {
            case "web":
              var wccr = Cc["@mozilla.org/embeddor.implemented/web-content-handler-registrar;1"]
                           .getService(Ci.nsIWebContentConverterService);
              if ((feed.type == Ci.nsIFeed.TYPE_FEED &&
                   wccr.getAutoHandler(TYPE_MAYBE_FEED)) ||
                  (feed.type == Ci.nsIFeed.TYPE_VIDEO &&
                   wccr.getAutoHandler(TYPE_MAYBE_VIDEO_FEED)) ||
                  (feed.type == Ci.nsIFeed.TYPE_AUDIO &&
                   wccr.getAutoHandler(TYPE_MAYBE_AUDIO_FEED))) {
                wccr.loadPreferredHandler(this._request);
                return;
              }
              break;

            default:
              LOG("unexpected handler: " + handler);
              // fall through -- let feed service handle error
            case "bookmarks":
            case "client":
            case "messenger":
              try {
                var title = feed.title ? feed.title.plainText() : "";
                var desc = feed.subtitle ? feed.subtitle.plainText() : "";
                feedService.addToClientReader(result.uri.spec, title, desc, feed.type);
                return;
              } catch(ex) {
                /* fallback to preview mode */
              }
          }
        }
      }

      var chromeChannel;
      var oldChannel = this._request.QueryInterface(Ci.nsIChannel);
      var loadInfo = oldChannel.loadInfo;

      // If there was no automatic handler, or this was a podcast,
      // photostream or some other kind of application, show the
      // preview page if the parser returned a document.
      if (result.doc) {

        // Store the result in the result service so that the display
        // page can access it.
        feedService.addFeedResult(result);

        // Now load the actual XUL document.
        var chromeURI = Services.io.newURI(FEEDHANDLER_URI);
        chromeChannel = Services.io.newChannelFromURIWithLoadInfo(chromeURI, loadInfo);
        // carry the origin attributes from the channel that loaded the feed.
        chromeChannel.owner = Services.scriptSecurityManager
                                      .createCodebasePrincipal(chromeURI,
                                                               loadInfo.originAttributes);
        chromeChannel.originalURI = result.uri;
      }
      else
        chromeChannel = Services.io.newChannelFromURIWithLoadInfo(result.uri, loadInfo);

      chromeChannel.loadGroup = this._request.loadGroup;
      chromeChannel.asyncOpen2(this._listener);
    }
    finally {
      this._releaseHandles();
    }
  },

  /**
   * See nsIStreamListener.idl
   */
  onDataAvailable: function onDataAvailable(request, context, inputStream,
                                             sourceOffset, count) {
    if (this._processor)
      this._processor.onDataAvailable(request, context, inputStream,
                                      sourceOffset, count);
  },

  /**
   * See nsIRequestObserver.idl
   */
  onStartRequest: function onStartRequest(request, context) {
    var channel = request.QueryInterface(Ci.nsIChannel);

    // Check for a header that tells us there was no sniffing
    // The value doesn't matter.
    try {
      var httpChannel = channel.QueryInterface(Ci.nsIHttpChannel);
      // Make sure to check requestSucceeded before the potentially-throwing
      // getResponseHeader.
      if (!httpChannel.requestSucceeded) {
        // Just give up, but don't forget to cancel the channel first!
        request.cancel(Cr.NS_BINDING_ABORTED);
        return;
      }
      // Note: this throws if the header is not set.
      httpChannel.getResponseHeader("X-Moz-Is-Feed");
    }
    catch (ex) {
      this._sniffed = true;
    }

    this._request = request;

    // Save and reset the forced state bit early, in case there's some kind of
    // error.
    var feedService = Cc["@mozilla.org/browser/feeds/result-service;1"]
                        .getService(Ci.nsIFeedResultService);
    this._forcePreviewPage = feedService.forcePreviewPage;
    feedService.forcePreviewPage = false;

    // Parse feed data as it comes in
    this._processor = Cc["@mozilla.org/feed-processor;1"]
                        .createInstance(Ci.nsIFeedProcessor);
    this._processor.listener = this;
    this._processor.parseAsync(null, channel.URI);

    this._processor.onStartRequest(request, context);
  },

  /**
   * See nsIRequestObserver.idl
   */
  onStopRequest: function onStopRequest(request, context, status) {
    if (this._processor)
      this._processor.onStopRequest(request, context, status);
  }

};

/**
 * Keeps parsed FeedResults around for use elsewhere in the UI after the stream
 * converter completes.
 */
function FeedResultService() {
}

FeedResultService.prototype = {
  /**
   * A URI spec -> [nsIFeedResult] hash. We have to keep a list as the
   * value in case the same URI is requested concurrently.
   */
  _results: { },

  /**
   * See nsIFeedResultService.idl
   */
  forcePreviewPage: false,

  /**
   * See nsIFeedResultService.idl
   */
  addToClientReader: function addToClientReader(spec, title, subtitle, feedType) {
    var handler = Services.prefs.getCharPref(getPrefActionForType(feedType), "reader");
    if (handler == "ask" || handler == "reader")
      handler = Services.prefs.getCharPref(getPrefReaderForType(feedType), "messenger");

    switch (handler) {
    case "client":
      var clientApp = Services.prefs.getComplexValue(getPrefAppForType(feedType),
                                                     Ci.nsIFile);

      // For the benefit of applications that might know how to deal with more
      // URLs than just feeds, send feed: URLs in the following format:
      //
      // http urls: replace scheme with feed, e.g.
      // http://foo.com/index.rdf -> feed://foo.com/index.rdf
      // other urls: prepend feed: scheme, e.g.
      // https://foo.com/index.rdf -> feed:https://foo.com/index.rdf
      var feedURI = Services.io.newURI(spec);
      if (feedURI.schemeIs("http")) {
        feedURI.scheme = "feed";
        spec = feedURI.spec;
      }
      else
        spec = "feed:" + spec;

      // Retrieving the shell service might fail on some systems, most
      // notably systems where GNOME is not installed.
      try {
        var ss = Cc["@mozilla.org/suite/shell-service;1"]
                   .getService(Ci.nsIShellService);
        ss.openApplicationWithURI(clientApp, spec);
      } catch(e) {
        // If we couldn't use the shell service, fallback to using a
        // nsIProcess instance
        var p = Cc["@mozilla.org/process/util;1"]
                  .createInstance(Ci.nsIProcess);
        p.init(clientApp);
        p.run(false, [spec], 1);
      }
      break;

    default:
      // "web" should have been handled elsewhere
      LOG("unexpected handler: " + handler);
      // fall through
    case "bookmarks":
      var topWindow = Services.wm.getMostRecentWindow("navigator:browser");
      topWindow.PlacesCommandHook.addLiveBookmark(spec, title, subtitle)
                                 .catch(Cu.reportError);
      break;
    case "messenger":
      Cc["@mozilla.org/newsblog-feed-downloader;1"]
        .getService(Ci.nsINewsBlogFeedDownloader)
        .subscribeToFeed("feed:" + spec, null, null);
      break;

    }
  },

  /**
   * See nsIFeedResultService.idl
   */
  addFeedResult: function addFeedResult(feedResult) {
    if (feedResult == null)
      throw new Error("null feedResult!");
    if (feedResult.uri == null)
      throw new Error("null URI!");
    var spec = feedResult.uri.spec;
    if (!this._results[spec])
      this._results[spec] = [];
    this._results[spec].push(feedResult);
  },

  /**
   * See nsIFeedResultService.idl
   */
  getFeedResult: function getFeedResult(uri) {
    if (uri == null)
      throw new Error("null URI!");
    var resultList = this._results[uri.spec];
    for (let i = 0; i < resultList.length; ++i) {
      if (resultList[i].uri == uri)
        return resultList[i];
    }
    return null;
  },

  /**
   * See nsIFeedResultService.idl
   */
  removeFeedResult: function removeFeedResult(uri) {
    if (uri == null)
      throw new Error("null URI!");
    var resultList = this._results[uri.spec];
    if (!resultList)
      return;
    var deletions = 0;
    for (let i = 0; i < resultList.length; ++i) {
      if (resultList[i].uri == uri) {
        delete resultList[i];
        ++deletions;
      }
    }

    // send the holes to the end
    resultList.sort();
    // and trim the list
    resultList.splice(resultList.length - deletions, deletions);
    if (resultList.length == 0)
      delete this._results[uri.spec];
  },

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIFeedResultService]),
  classID: Components.ID("{e5b05e9d-f037-48e4-b9a4-b99476582927}")
};

var components = [FeedConverter,
                  FeedResultService];

var NSGetFactory = XPCOMUtils.generateNSGetFactory(components);
