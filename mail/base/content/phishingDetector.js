/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Dependencies:
// gatherTextUnder from utilityOverlay.js

Components.utils.import("resource://gre/modules/Services.jsm");

var kPhishingNotSuspicious = 0;
var kPhishingWithIPAddress = 1;
var kPhishingWithMismatchedHosts = 2;


var gPhishingDetector = {
  mCheckForIPAddresses: true,
  mCheckForMismatchedHosts: true,

  shutdown: function()
  {
  },

  /**
   * Initialize the phishing warden.
   * Initialize the black and white list url tables.
   * Update the local tables if necessary.
   */
  init: function()
  {
    Components.utils.import("resource:///modules/hostnameUtils.jsm", this);

    this.mCheckForIPAddresses = Services.prefs.getBoolPref("mail.phishing.detection.ipaddresses");
    this.mCheckForMismatchedHosts = Services.prefs.getBoolPref("mail.phishing.detection.mismatched_hosts");
  },

  /**
   * Analyzes the urls contained in the currently loaded message in the message pane, looking for
   * phishing URLs.
   * Assumes the message has finished loading in the message pane (i.e. OnMsgParsed has fired).
   *
   * @param aUrl nsIURI for the message being analyzed.
   *
   * @return asynchronously calls gMessageNotificationBar.setPhishingMsg if the message
   *         is identified as a scam.
   */
  analyzeMsgForPhishingURLs: function (aUrl)
  {
    if (!aUrl || !Services.prefs.getBoolPref("mail.phishing.detection.enabled"))
      return;

    try {
      // nsIMsgMailNewsUrl.folder can throw an NS_ERROR_FAILURE, especially if
      // we are opening an .eml file.
      var folder = aUrl.folder;

      // Ignore nntp and RSS messages.
      if (folder.server.type == 'nntp' || folder.server.type == 'rss')
        return;

      // Also ignore messages in Sent/Drafts/Templates/Outbox.
      const nsMsgFolderFlags = Components.interfaces.nsMsgFolderFlags;
      let outgoingFlags = nsMsgFolderFlags.SentMail | nsMsgFolderFlags.Drafts |
                          nsMsgFolderFlags.Templates | nsMsgFolderFlags.Queue;
      if (folder.isSpecialFolder(outgoingFlags, true))
        return;

    } catch (ex) {
        if (ex.result != Components.results.NS_ERROR_FAILURE)
          throw ex;
    }

    // extract the link nodes in the message and analyze them, looking for suspicious URLs...
    var linkNodes = document.getElementById('messagepane').contentDocument.links;
    for (var index = 0; index < linkNodes.length; index++)
      this.analyzeUrl(linkNodes[index].href, gatherTextUnder(linkNodes[index]));

    // extract the action urls associated with any form elements in the message and analyze them.
    let formNodes = document.getElementById('messagepane').contentDocument.querySelectorAll("form[action]");
    for (index = 0; index < formNodes.length; index++)
    {
      this.analyzeUrl(formNodes[index].action);
    }
  },

  /**
   * Analyze the url contained in aLinkNode for phishing attacks. If a phishing URL is found,
   *
   * @param aHref the url to be analyzed
   * @param aLinkText (optional) user visible link text associated with aHref in case
   *        we are dealing with a link node.
   * @return asynchronously calls gMessageNotificationBar.setPhishingMsg if the link node
   *         contains a phishing URL.
   */
  analyzeUrl: function (aUrl, aLinkText)
  {
    if (!aUrl)
      return;

    var hrefURL;
    // make sure relative link urls don't make us bail out
    try {
      hrefURL = Services.io.newURI(aUrl, null, null);
    } catch(ex) { return; }

    // only check for phishing urls if the url is an http or https link.
    // this prevents us from flagging imap and other internally handled urls
    if (hrefURL.schemeIs('http') || hrefURL.schemeIs('https'))
    {
      // The link is not suspicious if the visible text is the same as the URL,
      // even if the URL is an IP address. URLs are commonly surrounded by
      // < > or "" (RFC2396E) - so strip those from the link text before comparing.
      if (aLinkText)
        aLinkText = aLinkText.replace(/^<(.+)>$|^"(.+)"$/, "$1$2");

      var failsStaticTests = false;
      // If the link text and url differs by something other than a trailing
      // slash, do some further checks.
      if (aLinkText != aUrl &&
          aLinkText.replace(/\/+$/, "") != aUrl.replace(/\/+$/, ""))
      {
        if (this.mCheckForIPAddresses)
        {
          let unobscuredHostNameValue = this.isLegalIPAddress(hrefURL.host, true);
          if (unobscuredHostNameValue)
            failsStaticTests = !this.isLegalLocalIPAddress(unobscuredHostNameValue);
        }

        if (!failsStaticTests && this.mCheckForMismatchedHosts)
        {
          failsStaticTests = (aLinkText &&
            this.misMatchedHostWithLinkText(hrefURL, aLinkText))
        }
      }
      // We don't use dynamic checks anymore. The old implementation was removed
      // in bug bug 1085382. Using the toolkit safebrowsing is bug 778611.
      if (failsStaticTests) {
        gMessageNotificationBar.setPhishingMsg();
      }
    }
  },

  /**
   * Opens the default browser to a page where the user can submit the given url
   * as a phish.
   * @param aPhishingURL the url we want to report back as a phishing attack
   */
   reportPhishingURL: function(aPhishingURL)
   {
     let reportUrl = Services.urlFormatter.formatURLPref(
       "browser.safebrowsing.reportPhishURL");
     reportUrl += "&url=" + encodeURIComponent(aPhishingURL);

     let uri = Services.io.newURI(reportUrl, null, null);
     let protocolSvc = Components.classes["@mozilla.org/uriloader/external-protocol-service;1"]
                       .getService(Components.interfaces.nsIExternalProtocolService);
     protocolSvc.loadUrl(uri);
   },

  /**
   * Private helper method to determine if the link node contains a user visible
   * url with a host name that differs from the actual href the user would get
   * taken to.
   * i.e. <a href="http://myevilsite.com">http://mozilla.org</a>
   *
   * @return true if aHrefURL.host does NOT match the host of the link node text
   */
  misMatchedHostWithLinkText: function(aHrefURL, aLinkNodeText)
  {
    // gatherTextUnder puts a space between each piece of text it gathers,
    // so strip the spaces out (see bug 326082 for details).
    aLinkNodeText = aLinkNodeText.replace(/ /g, "");

    // Only worry about http: and https: urls.
    if (/^https?:/.test(aLinkNodeText))
    {
      let linkTextURI = Services.io.newURI(aLinkNodeText, null, null);

      // Compare the base domain of the href and the link text.
      try {
        return Services.eTLD.getBaseDomain(aHrefURL) !=
               Services.eTLD.getBaseDomain(linkTextURI);
      } catch (e) {
        // If we throw above, one of the URIs probably has no TLD (e.g.
        // http://localhost), so just check the entire host.
        return aHrefURL.host != linkTextURI.host;
      }
    }

    return false;
  },

  /**
   * If the current message has been identified as an email scam, prompts the user with a warning
   * before allowing the link click to be processed. The warning prompt includes the unobscured host name
   * of the http(s) url the user clicked on.
   *
   * @param aUrl the url
   * @return true if the link should be allowed to load
   */
  warnOnSuspiciousLinkClick: function(aUrl)
  {
    // If the loaded message has *not* been flagged as a scam...
    if (!gMessageNotificationBar.isShowingPhishingNotification())
      return true; // ...allow the link to load.

    var hrefURL;
    // make sure relative link urls don't make us bail out
    try {
      hrefURL = Services.io.newURI(aUrl, null, null);
    } catch(ex) { return false; }

    // only prompt for http and https urls
    if (hrefURL.schemeIs('http') || hrefURL.schemeIs('https'))
    {
      // unobscure the host name in case it's an encoded ip address..
      let unobscuredHostNameValue = this.isLegalIPAddress(hrefURL.host, true)
        || hrefURL.host;

      var brandShortName = document.getElementById("bundle_brand")
                                   .getString("brandShortName");
      var bundle = document.getElementById("bundle_messenger");
      var titleMsg = bundle.getString("confirmPhishingTitle");
      var dialogMsg = bundle.getFormattedString("confirmPhishingUrl",
                        [brandShortName, unobscuredHostNameValue], 2);

      const nsIPS = Components.interfaces.nsIPromptService;
      return !Services.prompt.confirmEx(window, titleMsg, dialogMsg,
                                        nsIPS.STD_YES_NO_BUTTONS +
                                        nsIPS.BUTTON_POS_1_DEFAULT,
                                        "", "", "", "", {}); /* the yes button is in position 0 */
    }

    return true; // allow the link to load
  }
};
