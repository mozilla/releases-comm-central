/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from mailWindowOverlay.js */
/* import-globals-from utilityOverlay.js */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { isLegalIPAddress, isLegalLocalIPAddress } = ChromeUtils.import(
  "resource:///modules/hostnameUtils.jsm"
);

var kPhishingNotSuspicious = 0;
var kPhishingWithIPAddress = 1;
var kPhishingWithMismatchedHosts = 2;

var gPhishingDetector = {
  mCheckForIPAddresses: true,
  mCheckForMismatchedHosts: true,
  mDisallowFormActions: true,

  shutdown() {},

  /**
   * Initialize the phishing warden.
   * Initialize the black and white list url tables.
   * Update the local tables if necessary.
   */
  init() {
    this.mCheckForIPAddresses = Services.prefs.getBoolPref(
      "mail.phishing.detection.ipaddresses"
    );
    this.mCheckForMismatchedHosts = Services.prefs.getBoolPref(
      "mail.phishing.detection.mismatched_hosts"
    );
    this.mDisallowFormActions = Services.prefs.getBoolPref(
      "mail.phishing.detection.disallow_form_actions"
    );
  },

  /**
   * Analyze the currently loaded message in the message pane, looking for signs
   * of a phishing attempt. Also checks for forms with action URLs, which are
   * disallowed.
   * Assumes the message has finished loading in the message pane (i.e.
   * OnMsgParsed has fired).
   *
   * @param {nsIURI} aUrl - url for the message being analyzed.
   *
   * @return asynchronously calls gMessageNotificationBar.setPhishingMsg if the
   *         message is identified as a scam.
   */
  analyzeMsgForPhishingURLs(aUrl) {
    if (
      !aUrl ||
      !Services.prefs.getBoolPref("mail.phishing.detection.enabled")
    ) {
      return;
    }

    try {
      // nsIMsgMailNewsUrl.folder can throw an NS_ERROR_FAILURE, especially if
      // we are opening an .eml file.
      var folder = aUrl.folder;

      // Ignore nntp and RSS messages.
      if (folder.server.type == "nntp" || folder.server.type == "rss") {
        return;
      }

      // Also ignore messages in Sent/Drafts/Templates/Outbox.
      let outgoingFlags =
        Ci.nsMsgFolderFlags.SentMail |
        Ci.nsMsgFolderFlags.Drafts |
        Ci.nsMsgFolderFlags.Templates |
        Ci.nsMsgFolderFlags.Queue;
      if (folder.isSpecialFolder(outgoingFlags, true)) {
        return;
      }
    } catch (ex) {
      if (ex.result != Cr.NS_ERROR_FAILURE) {
        throw ex;
      }
    }

    // If the message contains forms with action attributes, warn the user.
    let formNodes = document
      .getElementById("messagepane")
      .contentDocument.querySelectorAll("form[action]");

    if (this.mDisallowFormActions && formNodes.length > 0) {
      gMessageNotificationBar.setPhishingMsg();
    }
  },

  /**
   * Analyze the url contained in aLinkNode for phishing attacks.
   *
   * @param {String} aHref - the url to be analyzed
   * @param {String} [aLinkText] - user visible link text associated with aHref
   *         in case we are dealing with a link node.
   * @return true if link node contains phishing URL. false otherwise.
   */
  analyzeUrl(aUrl, aLinkText) {
    if (!aUrl) {
      return false;
    }

    let hrefURL;
    // make sure relative link urls don't make us bail out
    try {
      hrefURL = Services.io.newURI(aUrl);
    } catch (ex) {
      return false;
    }

    // only check for phishing urls if the url is an http or https link.
    // this prevents us from flagging imap and other internally handled urls
    if (hrefURL.schemeIs("http") || hrefURL.schemeIs("https")) {
      // The link is not suspicious if the visible text is the same as the URL,
      // even if the URL is an IP address. URLs are commonly surrounded by
      // < > or "" (RFC2396E) - so strip those from the link text before comparing.
      if (aLinkText) {
        aLinkText = aLinkText.replace(/^<(.+)>$|^"(.+)"$/, "$1$2");
      }

      var failsStaticTests = false;
      // If the link text and url differs by something other than a trailing
      // slash, do some further checks.
      if (
        aLinkText &&
        aLinkText != aUrl &&
        aLinkText.replace(/\/+$/, "") != aUrl.replace(/\/+$/, "")
      ) {
        if (this.mCheckForIPAddresses) {
          let unobscuredHostNameValue = isLegalIPAddress(hrefURL.host, true);
          if (unobscuredHostNameValue) {
            failsStaticTests = !isLegalLocalIPAddress(unobscuredHostNameValue);
          }
        }

        if (!failsStaticTests && this.mCheckForMismatchedHosts) {
          failsStaticTests =
            aLinkText && this.misMatchedHostWithLinkText(hrefURL, aLinkText);
        }
      }
      // We don't use dynamic checks anymore. The old implementation was removed
      // in bug bug 1085382. Using the toolkit safebrowsing is bug 778611.
      //
      // Because these static link checks tend to cause false positives
      // we delay showing the warning until a user tries to click the link.
      if (failsStaticTests) {
        return true;
      }
    }

    return false;
  },

  /**
   * Opens the default browser to a page where the user can submit the given url
   * as a phish.
   * @param aPhishingURL the url we want to report back as a phishing attack
   */
  reportPhishingURL(aPhishingURL) {
    let reportUrl = Services.urlFormatter.formatURLPref(
      "browser.safebrowsing.reportPhishURL"
    );
    reportUrl += "&url=" + encodeURIComponent(aPhishingURL);

    let uri = Services.io.newURI(reportUrl);
    let protocolSvc = Cc[
      "@mozilla.org/uriloader/external-protocol-service;1"
    ].getService(Ci.nsIExternalProtocolService);
    protocolSvc.loadURI(uri);
  },

  /**
   * Private helper method to determine if the link node contains a user visible
   * url with a host name that differs from the actual href the user would get
   * taken to.
   * i.e. <a href="http://myevilsite.com">http://mozilla.org</a>
   *
   * @return true if aHrefURL.host does NOT match the host of the link node text
   */
  misMatchedHostWithLinkText(aHrefURL, aLinkNodeText) {
    // gatherTextUnder puts a space between each piece of text it gathers,
    // so strip the spaces out (see bug 326082 for details).
    aLinkNodeText = aLinkNodeText.replace(/ /g, "");

    // Only worry about http: and https: urls.
    if (/^https?:/.test(aLinkNodeText)) {
      let linkTextURI = Services.io.newURI(aLinkNodeText);

      // Compare the base domain of the href and the link text.
      try {
        return (
          Services.eTLD.getBaseDomain(aHrefURL) !=
          Services.eTLD.getBaseDomain(linkTextURI)
        );
      } catch (e) {
        // If we throw above, one of the URIs probably has no TLD (e.g.
        // http://localhost), so just check the entire host.
        return aHrefURL.host != linkTextURI.host;
      }
    }

    return false;
  },

  /**
   * If the current message has been identified as an email scam, prompts the
   * user with a warning before allowing the link click to be processed.
   * The warning prompt includes the unobscured host name of the http(s) url the
   * user clicked on.
   *
   * @param {String} aUrl - the url
   * @param {String} [aLinkText] - user visible link text associated with the link
   * @return 0 if the URL implied by aLinkText should be used instead.
   *         1 if the request should be blocked.
   *         2 if aUrl should be allowed to load.
   */
  warnOnSuspiciousLinkClick(aUrl, aLinkText) {
    if (!this.analyzeUrl(aUrl, aLinkText)) {
      return 2; // No problem with the url. Allow it to load.
    }
    let bundle = document.getElementById("bundle_messenger");

    // Analysis said there was a problem.
    if (aLinkText && /^https?:/i.test(aLinkText)) {
      let actualURI = makeURI(aUrl);
      let displayedURI;
      try {
        displayedURI = Services.io.newURI(aLinkText);
      } catch (e) {
        return 1;
      }

      let titleMsg = bundle.getString("linkMismatchTitle");
      let dialogMsg = bundle.getFormattedString(
        "confirmPhishingUrlAlternate",
        [displayedURI.host, actualURI.host],
        2
      );
      let warningButtons =
        Ci.nsIPromptService.BUTTON_POS_0 *
          Ci.nsIPromptService.BUTTON_TITLE_IS_STRING +
        Ci.nsIPromptService.BUTTON_POS_1 *
          Ci.nsIPromptService.BUTTON_TITLE_CANCEL +
        Ci.nsIPromptService.BUTTON_POS_2 *
          Ci.nsIPromptService.BUTTON_TITLE_IS_STRING;
      let button0Text = bundle.getFormattedString(
        "confirmPhishingGoDirect",
        [displayedURI.host],
        1
      );
      let button2Text = bundle.getFormattedString(
        "confirmPhishingGoAhead",
        [actualURI.host],
        1
      );
      return Services.prompt.confirmEx(
        window,
        titleMsg,
        dialogMsg,
        warningButtons,
        button0Text,
        "",
        button2Text,
        "",
        {}
      );
    }

    let hrefURL;
    try {
      // make sure relative link urls don't make us bail out
      hrefURL = Services.io.newURI(aUrl);
    } catch (e) {
      return 1; // block the load
    }

    // only prompt for http and https urls
    if (hrefURL.schemeIs("http") || hrefURL.schemeIs("https")) {
      // unobscure the host name in case it's an encoded ip address..
      let unobscuredHostNameValue =
        isLegalIPAddress(hrefURL.host, true) || hrefURL.host;

      let brandShortName = document
        .getElementById("bundle_brand")
        .getString("brandShortName");
      let titleMsg = bundle.getString("confirmPhishingTitle");
      let dialogMsg = bundle.getFormattedString(
        "confirmPhishingUrl",
        [brandShortName, unobscuredHostNameValue],
        2
      );
      let warningButtons =
        Ci.nsIPromptService.STD_YES_NO_BUTTONS +
        Ci.nsIPromptService.BUTTON_POS_1_DEFAULT;
      let button = Services.prompt.confirmEx(
        window,
        titleMsg,
        dialogMsg,
        warningButtons,
        "",
        "",
        "",
        "",
        {}
      );
      return button == 0 ? 2 : 1; // 2 == allow, 1 == block
    }
    return 2; // allow the link to load
  },
};
