/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals ReloadMessage, getMessagePaneBrowser, openContentTab,
   gMessageNotificationBar */

var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);
var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { FeedUtils } = ChromeUtils.importESModule(
  "resource:///modules/FeedUtils.sys.mjs"
);
var { MailE10SUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailE10SUtils.sys.mjs"
);
var { openLinkExternally } = ChromeUtils.importESModule(
  "resource:///modules/LinkHelper.sys.mjs"
);

ChromeUtils.defineESModuleGetters(this, {
  MsgHdrToMimeMessage: "resource:///modules/gloda/MimeMessage.sys.mjs",
});

var FeedMessageHandler = {
  gShowSummary: true,
  gToggle: false,
  kSelectOverrideWebPage: 0,
  kSelectOverrideSummary: 1,
  kSelectFeedDefault: 2,
  kOpenWebPage: 0,
  kOpenSummary: 1,
  kOpenToggleInMessagePane: 2,
  kOpenLoadInBrowser: 3,

  FeedAccountTypes: ["rss"],

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
   * How to load message on open (enter/dbl click in threadpane, contextmenu).
   */
  get onOpenPref() {
    return Services.prefs.getIntPref("rss.show.content-base");
  },

  set onOpenPref(val) {
    Services.prefs.setIntPref("rss.show.content-base", val);
  },

  /**
   * Determine whether to show a feed message summary or load a web page in the
   * message pane.
   *
   * @param {nsIMsgDBHdr} aMsgHdr - The message.
   * @param {boolean} aToggle - true if in toggle mode, false otherwise.
   *
   * @returns {boolean} - true if summary is to be displayed, false if web page.
   */
  shouldShowSummary(aMsgHdr, aToggle) {
    // Not a feed message, always show summary (the message).
    if (!FeedUtils.isFeedMessage(aMsgHdr)) {
      return true;
    }

    // Notified of a summary reload when toggling, reset toggle and return.
    if (!aToggle && this.gToggle) {
      return !(this.gToggle = false);
    }

    let showSummary = true;
    this.gToggle = aToggle;

    // Thunderbird 2 rss messages with 'Show article summary' not selected,
    // ie message body constructed to show web page in an iframe, can't show
    // a summary - notify user.
    const browser = getMessagePaneBrowser();
    const contentDoc = browser ? browser.contentDocument : null;
    const rssIframe = contentDoc
      ? contentDoc.getElementById("_mailrssiframe")
      : null;
    if (rssIframe) {
      if (this.gToggle || this.onSelectPref == this.kSelectOverrideSummary) {
        this.gToggle = false;
      }

      return false;
    }

    if (aToggle) {
      // Toggle mode, flip value.
      return (this.gShowSummary = !this.gShowSummary);
    }

    const wintype = document.documentElement.getAttribute("windowtype");
    const tabMail = document.getElementById("tabmail");
    const messageTab = tabMail && tabMail.currentTabInfo.mode.type == "message";
    const messageWindow = wintype == "mail:messageWindow";

    switch (this.onSelectPref) {
      case this.kSelectOverrideWebPage:
        showSummary = false;
        break;
      case this.kSelectOverrideSummary:
        showSummary = true;
        break;
      case this.kSelectFeedDefault: {
        // Get quickmode per feed folder pref from feed subscriptions. If the feed
        // message is not in a feed account folder (hence the folder is not in
        // the feeds database), err on the side of showing the summary.
        // For the former, toggle or global override is necessary; for the
        // latter, a show summary checkbox toggle in Subscribe dialog will set
        // one on the path to bliss.
        const folder = aMsgHdr.folder;
        showSummary = true;
        const ds = FeedUtils.getSubscriptionsDS(folder.server);
        for (const sub of ds.data) {
          if (sub.destFolder == folder.URI) {
            showSummary = sub.quickMode;
            break;
          }
        }
        break;
      }
    }

    this.gShowSummary = showSummary;

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

    return showSummary;
  },

  /**
   * Load a web page for feed messages. Use MsgHdrToMimeMessage() to get
   * the content-base url from the message headers. We cannot rely on
   * currentHeaderData; it has not yet been streamed at our entry point in
   * displayMessageChanged(), and in the case of a collapsed message pane it
   * is not streamed.
   *
   * @param {nsIMsgDBHdr} aMessageHdr - The message.
   * @param {object} aWhere - name value=true pair, where name is in:
   *                                    'messagepane', 'browser', 'tab', 'window'.
   * @returns {void}
   */
  loadWebPage(aMessageHdr, aWhere) {
    MsgHdrToMimeMessage(aMessageHdr, null, function (aMsgHdr, aMimeMsg) {
      if (
        aMimeMsg &&
        aMimeMsg.headers["content-base"] &&
        aMimeMsg.headers["content-base"][0]
      ) {
        let url = aMimeMsg.headers["content-base"],
          uri;
        try {
          // The message and headers are stored as a string of UTF-8 bytes
          // and we need to convert that cpp |string| to js UTF-16 explicitly
          // for idn and non-ascii urls with this api.
          url = decodeURIComponent(escape(url));
          uri = Services.io.newURI(url);
        } catch (ex) {
          FeedUtils.log.info(
            "FeedMessageHandler.loadWebPage: " +
              "invalid Content-Base header url - " +
              url
          );
          return;
        }
        //TODO browser currently only used from SearchDialog for kOpenLoadInBrowser
        if (aWhere.browser) {
          openLinkExternally(uri, { addToHistory: false });
        } else if (aWhere.messagepane) {
          const browser = getMessagePaneBrowser();
          // Load about:blank in the browser before (potentially) switching
          // to a remote process. This prevents sandbox flags being carried
          // over to the web document.
          MailE10SUtils.loadAboutBlank(browser);
          MailE10SUtils.loadURI(browser, url);
        } else if (aWhere.tab) {
          openContentTab(url, "tab", null);
        } else if (aWhere.window) {
          openContentTab(url, "window", null);
        }
      } else {
        FeedUtils.log.info(
          "FeedMessageHandler.loadWebPage: could not get " +
            "Content-Base header url for this message"
        );
      }
    });
  },

  /**
   * Display summary or load web page for feed messages. Caller should already
   * know if the message is a feed message.
   *
   * @param {nsIMsgDBHdr} aMsgHdr - The message.
   * @param {boolean} aShowSummary - true if summary is to be displayed,
   *                                 false if web page.
   * @returns {void}
   */
  setContent(aMsgHdr, aShowSummary) {
    if (aShowSummary) {
      // Only here if toggling to summary in 3pane.
      if (this.gToggle && window.gDBView) {
        ReloadMessage();
      }
    } else {
      const browser = getMessagePaneBrowser();
      if (browser && browser.contentDocument && browser.contentDocument.body) {
        browser.contentDocument.body.hidden = true;
      }
      // If in a non rss folder, hide possible remote content bar on a web
      // page load, as it doesn't apply.
      gMessageNotificationBar.clearMsgNotifications();

      this.loadWebPage(aMsgHdr, { messagepane: true });
      this.gToggle = false;
    }
  },
};

function openSubscriptionsDialog(aFolder) {
  // Check for an existing feed subscriptions window and focus it.
  const subscriptionsWindow = Services.wm.getMostRecentWindow(
    "Mail:News-BlogSubscriptions"
  );

  if (subscriptionsWindow) {
    if (aFolder) {
      subscriptionsWindow.FeedSubscriptions.selectFolder(aFolder);
      subscriptionsWindow.FeedSubscriptions.mView.tree.ensureRowIsVisible(
        subscriptionsWindow.FeedSubscriptions.mView.selection.currentIndex
      );
    }

    subscriptionsWindow.focus();
  } else {
    window.browsingContext.topChromeWindow.openDialog(
      "chrome://messenger-newsblog/content/feed-subscriptions.xhtml",
      "",
      "centerscreen,chrome,dialog=no,resizable",
      { folder: aFolder }
    );
  }
}

// Special case attempts to reply/forward/edit as new RSS articles. For
// messages stored prior to Tb15, we are here only if the message's folder's
// account server is rss and feed messages moved to other types will have their
// summaries loaded, as viewing web pages only happened in an rss account.
// The user may choose whether to load a summary or web page link by ensuring
// the current feed message is being viewed as either a summary or web page.
function openComposeWindowForRSSArticle(
  aMsgComposeWindow,
  aMsgHdr,
  aMessageUri,
  aType,
  aFormat,
  aIdentity,
  aMsgWindow
) {
  // Ensure right content is handled for web pages in window/tab.
  const tabmail = document.getElementById("tabmail");
  const is3pane =
    tabmail && tabmail.selectedTab && tabmail.selectedTab.mode
      ? tabmail.selectedTab.mode.type == "folder"
      : false;
  const showingwebpage =
    "FeedMessageHandler" in window &&
    !is3pane &&
    FeedMessageHandler.onOpenPref == FeedMessageHandler.kOpenWebPage;

  if (FeedMessageHandler.gShowSummary && !showingwebpage) {
    // The user is viewing the summary.
    MailServices.compose.OpenComposeWindow(
      aMsgComposeWindow,
      aMsgHdr,
      aMessageUri,
      aType,
      aFormat,
      aIdentity,
      null,
      aMsgWindow
    );
  } else {
    // Set up the compose message and get the feed message's web page link.
    const msgHdr = aMsgHdr;
    const type = aType;
    let subject = msgHdr.mime2DecodedSubject;
    let fwdPrefix = Services.prefs.getCharPref("mail.forward_subject_prefix");
    fwdPrefix = fwdPrefix ? fwdPrefix + ": " : "";

    const params = Cc[
      "@mozilla.org/messengercompose/composeparams;1"
    ].createInstance(Ci.nsIMsgComposeParams);

    const composeFields = Cc[
      "@mozilla.org/messengercompose/composefields;1"
    ].createInstance(Ci.nsIMsgCompFields);

    if (
      type == Ci.nsIMsgCompType.Reply ||
      type == Ci.nsIMsgCompType.ReplyAll ||
      type == Ci.nsIMsgCompType.ReplyToSender ||
      type == Ci.nsIMsgCompType.ReplyToGroup ||
      type == Ci.nsIMsgCompType.ReplyToSenderAndGroup ||
      type == Ci.nsIMsgCompType.ReplyToList
    ) {
      subject = "Re: " + subject;
    } else if (
      type == Ci.nsIMsgCompType.ForwardInline ||
      type == Ci.nsIMsgCompType.ForwardAsAttachment
    ) {
      subject = fwdPrefix + subject;
    }

    params.composeFields = composeFields;
    params.composeFields.subject = subject;
    params.composeFields.body = "";
    params.bodyIsLink = false;
    params.identity = aIdentity;

    try {
      // The feed's web page url is stored in the Content-Base header.
      MsgHdrToMimeMessage(
        msgHdr,
        null,
        function (messageHeader, aMimeMsg) {
          if (
            aMimeMsg &&
            aMimeMsg.headers["content-base"] &&
            aMimeMsg.headers["content-base"][0]
          ) {
            const url = decodeURIComponent(
              escape(aMimeMsg.headers["content-base"])
            );
            params.composeFields.body = url;
            params.bodyIsLink = true;
            MailServices.compose.OpenComposeWindowWithParams(null, params);
          } else {
            // No content-base url, use the summary.
            MailServices.compose.OpenComposeWindow(
              aMsgComposeWindow,
              messageHeader,
              aMessageUri,
              aType,
              aFormat,
              aIdentity,
              null,
              aMsgWindow
            );
          }
        },
        false,
        { saneBodySize: true }
      );
    } catch (ex) {
      // Error getting header, use the summary.
      MailServices.compose.OpenComposeWindow(
        aMsgComposeWindow,
        aMsgHdr,
        aMessageUri,
        aType,
        aFormat,
        aIdentity,
        null,
        aMsgWindow
      );
    }
  }
}
