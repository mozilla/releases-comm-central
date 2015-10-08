/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource:///modules/gloda/mimemsg.js");
Components.utils.import("resource:///modules/mailServices.js");
Components.utils.import("resource://gre/modules/Services.jsm");

// This global is for SeaMonkey compatibility.
var gShowFeedSummary;

var FeedMessageHandler = {
  gShowSummary: true,
  gToggle: false,
  kSelectOverrideWebPage:   0,
  kSelectOverrideSummary:   1,
  kSelectFeedDefault:       2,
  kOpenWebPage:             0,
  kOpenSummary:             1,
  kOpenToggleInMessagePane: 2,
  kOpenLoadInBrowser:       3,

  /**
   * How to load message on threadpane select.
   */
  get onSelectPref() {
    return Services.prefs.getIntPref("rss.show.summary");
  },

  set onSelectPref(val) {
    Services.prefs.setIntPref("rss.show.summary", val);
    ReloadMessage();
  },

  /**
   * Load web page on threadpane select.
   */
  get loadWebPageOnSelectPref() {
    return Services.prefs.getIntPref("rss.message.loadWebPageOnSelect") ? true : false;
  },

  /**
   * How to load message on open (enter/dbl click in threadpane, contextmenu).
   */
  get onOpenPref() {
    return Services.prefs.getIntPref("rss.show.content-base");
  },

  set onOpenPref(val) {
    Services.prefs.setIntPref("rss.show.content-base", val);
  },

  /**
   * Determine if a message is a feed message. Prior to Tb15, a message had to
   * be in an rss acount type folder. In Tb15 and later, a flag is set on the
   * message itself upon initial store; the message can be moved to any folder.
   *
   * @param nsIMsgDBHdr aMsgHdr - the message.
   *
   * @return true if message is a feed, false if not.
   */
  isFeedMessage: function(aMsgHdr) {
    return (aMsgHdr instanceof Components.interfaces.nsIMsgDBHdr) &&
           ((aMsgHdr.flags & Components.interfaces.nsMsgMessageFlags.FeedMsg) ||
            (aMsgHdr.folder && aMsgHdr.folder.server.type == "rss"));
  },

  /**
   * Determine whether to show a feed message summary or load a web page in the
   * message pane.
   *
   * @param nsIMsgDBHdr aMsgHdr - the message.
   * @param bool aToggle        - true if in toggle mode, false otherwise.
   *
   * @return true if summary is to be displayed, false if web page.
   */
  shouldShowSummary: function(aMsgHdr, aToggle) {
    // Not a feed message, always show summary (the message).
    if (!this.isFeedMessage(aMsgHdr))
      return true;

    // Notified of a summary reload when toggling, reset toggle and return.
    if (!aToggle && this.gToggle)
      return !(this.gToggle = false);

    let showSummary = true;
    this.gToggle = aToggle;

    // Thunderbird 2 rss messages with 'Show article summary' not selected,
    // ie message body constructed to show web page in an iframe, can't show
    // a summary - notify user.
    let browser = getBrowser();
    let contentDoc = browser ? browser.contentDocument : null;
    let rssIframe = contentDoc ? contentDoc.getElementById("_mailrssiframe") : null;
    if (rssIframe) {
      if (this.gToggle || this.onSelectPref == this.kSelectOverrideSummary)
        this.gToggle = false;
      return false;
    }

    if (aToggle)
      // Toggle mode, flip value.
      return gShowFeedSummary = this.gShowSummary = !this.gShowSummary;

    let wintype = document.documentElement.getAttribute("windowtype");
    let tabMail = document.getElementById("tabmail");
    let messageTab = tabMail && tabMail.currentTabInfo.mode.type == "message";
    let messageWindow = wintype == "mail:messageWindow";

    switch (this.onSelectPref) {
      case this.kSelectOverrideWebPage:
        showSummary = false;
        break;
      case this.kSelectOverrideSummary:
        showSummary = true
        break;
      case this.kSelectFeedDefault:
        // Get quickmode per feed folder pref from feeds.rdf. If the feed
        // message is not in a feed account folder (hence the folder is not in
        // the feeds database), or FZ_QUICKMODE property is not found (possible
        // in pre renovation urls), err on the side of showing the summary.
        // For the former, toggle or global override is necessary; for the
        // latter, a show summary checkbox toggle in Subscribe dialog will set
        // one on the path to bliss.
        let folder = aMsgHdr.folder, targetRes;
        try {
          targetRes = FeedUtils.getParentTargetForChildResource(
                        folder.URI, FeedUtils.FZ_QUICKMODE, folder.server);
        }
        catch (ex) {
          // Not in a feed account folder or other error.
          FeedUtils.log.info("FeedMessageHandler.shouldShowSummary: could not " +
                             "get summary pref for this folder");
        }

        showSummary = targetRes && targetRes.QueryInterface(Ci.nsIRDFLiteral).
                                             Value == "false" ? false : true;
        break;
    }

    gShowFeedSummary = this.gShowSummary = showSummary;

    if (messageWindow || messageTab) {
      // Message opened in either standalone window or tab, due to either
      // message open pref (we are here only if the pref is 0 or 1) or
      // contextmenu open.
      switch (this.onOpenPref) {
        case this.kOpenToggleInMessagePane:
          // Opened by contextmenu, use the value derived above.
          // XXX: allow a toggle via crtl?
          break;
        case this.kOpenWebPage:
          showSummary = false;
          break;
        case this.kOpenSummary:
          showSummary = true;
          break;
      }
    }

    // Auto load web page in browser on select, per pref; shouldShowSummary() is
    // always called first to 1)test if feed, 2)get summary pref, so do it here.
    if (this.loadWebPageOnSelectPref)
      setTimeout(FeedMessageHandler.loadWebPage, 20, aMsgHdr, {browser:true});

    return showSummary;
  },

  /**
   * Load a web page for feed messages. Use MsgHdrToMimeMessage() to get
   * the content-base url from the message headers. We cannot rely on
   * currentHeaderData; it has not yet been streamed at our entry point in
   * displayMessageChanged(), and in the case of a collapsed message pane it
   * is not streamed.
   *
   * @param nsIMsgDBHdr aMessageHdr - the message.
   * @param {obj} aWhere            - name value=true pair, where name is in:
   *                                  'messagepane', 'browser', 'tab', 'window'.
   */
  loadWebPage: function(aMessageHdr, aWhere) {
    MsgHdrToMimeMessage(aMessageHdr, null, function(aMsgHdr, aMimeMsg) {
      if (aMimeMsg && aMimeMsg.headers["content-base"] &&
          aMimeMsg.headers["content-base"][0]) {
        let url = aMimeMsg.headers["content-base"], uri;
        try {
          let converter = Cc["@mozilla.org/intl/scriptableunicodeconverter"]
                            .createInstance(Ci.nsIScriptableUnicodeConverter);
          converter.charset = "UTF-8";
          url = converter.ConvertToUnicode(url);
          uri = Services.io.newURI(url, null, null);
          url = uri.spec;
        }
        catch (ex) {
          FeedUtils.log.info("FeedMessageHandler.loadWebPage: " +
                             "invalid Content-Base header url - " + url);
          return;
        }
        if (aWhere.browser)
          Components.classes["@mozilla.org/uriloader/external-protocol-service;1"]
                    .getService(Components.interfaces.nsIExternalProtocolService)
                    .loadURI(uri);
        else if (aWhere.messagepane) {
          let loadFlag = getBrowser().webNavigation.LOAD_FLAGS_NONE;
          getBrowser().webNavigation.loadURI(url, loadFlag, null, null, null);
        }
        else if (aWhere.tab)
          openContentTab(url, "tab", "^");
        else if (aWhere.window)
          openContentTab(url, "window", "^");
      }
      else
        FeedUtils.log.info("FeedMessageHandler.loadWebPage: could not get " +
                           "Content-Base header url for this message");
    });
  },

  /**
   * Display summary or load web page for feed messages. Caller should already
   * know if the message is a feed message.
   *
   * @param nsIMsgDBHdr aMsgHdr - the message.
   * @param bool aShowSummary   - true if summary is to be displayed, false if
   *                              web page.
   */
  setContent: function(aMsgHdr, aShowSummary) {
    if (aShowSummary) {
      // Only here if toggling to summary in 3pane.
      if (this.gToggle && gDBView && GetNumSelectedMessages() == 1)
        ReloadMessage();
    }
    else {
      let browser = getBrowser();
      if (browser && browser.contentDocument && browser.contentDocument.body)
        browser.contentDocument.body.hidden = true;
      // If in a non rss folder, hide possible remote content bar on a web
      // page load, as it doesn't apply.
      if ("msgNotificationBar" in window)
        gMessageNotificationBar.clearMsgNotifications();

      this.loadWebPage(aMsgHdr, {messagepane:true});
      this.gToggle = false;
    }
  }
}

function openSubscriptionsDialog(aFolder)
{
  // Check for an existing feed subscriptions window and focus it.
  let subscriptionsWindow =
    Services.wm.getMostRecentWindow("Mail:News-BlogSubscriptions");

  if (subscriptionsWindow)
  {
    if (aFolder)
    {
      subscriptionsWindow.FeedSubscriptions.selectFolder(aFolder);
      subscriptionsWindow.FeedSubscriptions.mView.treeBox.ensureRowIsVisible(
        subscriptionsWindow.FeedSubscriptions.mView.selection.currentIndex);
    }

    subscriptionsWindow.focus();
  }
  else
  {
    window.openDialog("chrome://messenger-newsblog/content/feed-subscriptions.xul",
                      "", "centerscreen,chrome,dialog=no,resizable",
                      { folder: aFolder});
  }
}

// Special case attempts to reply/forward/edit as new RSS articles. For
// messages stored prior to Tb15, we are here only if the message's folder's
// account server is rss and feed messages moved to other types will have their
// summaries loaded, as viewing web pages only happened in an rss account.
// The user may choose whether to load a summary or web page link by ensuring
// the current feed message is being viewed as either a summary or web page.
function openComposeWindowForRSSArticle(aMsgComposeWindow, aMsgHdr, aMessageUri,
                                        aType, aFormat, aIdentity, aMsgWindow)
{
  // Ensure right content is handled for web pages in window/tab.
  let tabmail = document.getElementById("tabmail");
  let is3pane = tabmail && tabmail.selectedTab && tabmail.selectedTab.mode ?
                  tabmail.selectedTab.mode.type == "folder" : false;
  let showingwebpage = ("FeedMessageHandler" in window) && !is3pane &&
                       FeedMessageHandler.onOpenPref == FeedMessageHandler.kOpenWebPage;

  if (gShowFeedSummary && !showingwebpage)
  {
    // The user is viewing the summary.
    MailServices.compose.OpenComposeWindow(aMsgComposeWindow, aMsgHdr, aMessageUri,
                                           aType, aFormat, aIdentity, aMsgWindow);

  }
  else
  {
    // Set up the compose message and get the feed message's web page link.
    let Cc = Components.classes;
    let Ci = Components.interfaces;
    let msgHdr = aMsgHdr;
    let type = aType;
    let msgComposeType = Ci.nsIMsgCompType;
    let subject = msgHdr.mime2DecodedSubject;
    let fwdPrefix = Services.prefs.getCharPref("mail.forward_subject_prefix");
    fwdPrefix = fwdPrefix ? fwdPrefix + ": " : "";

    let params = Cc["@mozilla.org/messengercompose/composeparams;1"]
                   .createInstance(Ci.nsIMsgComposeParams);

    let composeFields = Cc["@mozilla.org/messengercompose/composefields;1"]
                          .createInstance(Ci.nsIMsgCompFields);

    if (type == msgComposeType.Reply ||
        type == msgComposeType.ReplyAll ||
        type == msgComposeType.ReplyToSender ||
        type == msgComposeType.ReplyToGroup ||
        type == msgComposeType.ReplyToSenderAndGroup)
    {
      subject = "Re: " + subject;
    }
    else if (type == msgComposeType.ForwardInline ||
             type == msgComposeType.ForwardAsAttachment)
    {
      subject = fwdPrefix + subject;
    }

    params.composeFields = composeFields;
    params.composeFields.subject = subject;
    params.composeFields.characterSet = msgHdr.Charset;
    params.composeFields.body = "";
    params.bodyIsLink = false;
    params.identity = aIdentity;

    try
    {
      // The feed's web page url is stored in the Content-Base header.
      MsgHdrToMimeMessage(msgHdr, null, function(aMsgHdr, aMimeMsg) {
        if (aMimeMsg && aMimeMsg.headers["content-base"] &&
            aMimeMsg.headers["content-base"][0])
        {
          let converter = Cc["@mozilla.org/intl/scriptableunicodeconverter"]
                            .createInstance(Ci.nsIScriptableUnicodeConverter);
          converter.charset = "UTF-8";
          let url = converter.ConvertToUnicode(aMimeMsg.headers["content-base"]);
          params.composeFields.body = url;
          params.bodyIsLink = true;
          MailServices.compose.OpenComposeWindowWithParams(null, params);
        }
        else
          // No content-base url, use the summary.
          MailServices.compose.OpenComposeWindow(aMsgComposeWindow, aMsgHdr, aMessageUri,
                                                 aType, aFormat, aIdentity, aMsgWindow);

      }, false, {saneBodySize: true});
    }
    catch (ex)
    {
      // Error getting header, use the summary.
      MailServices.compose.OpenComposeWindow(aMsgComposeWindow, aMsgHdr, aMessageUri,
                                             aType, aFormat, aIdentity, aMsgWindow);
    }
  }
}
