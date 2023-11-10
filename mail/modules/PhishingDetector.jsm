/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["PhishingDetector"];

const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

const lazy = {};

XPCOMUtils.defineLazyModuleGetters(lazy, {
  isLegalIPAddress: "resource:///modules/hostnameUtils.jsm",
  isLegalLocalIPAddress: "resource:///modules/hostnameUtils.jsm",
});

const PhishingDetector = new (class PhishingDetector {
  mEnabled = true;
  mDisallowFormActions = true;

  constructor() {
    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "mEnabled",
      "mail.phishing.detection.enabled",
      true
    );
    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "mDisallowFormActions",
      "mail.phishing.detection.disallow_form_actions",
      true
    );
  }

  /**
   * Analyze the currently loaded message in the message pane, looking for signs
   * of a phishing attempt. Also checks for forms with action URLs, which are
   * disallowed.
   * Assumes the message has finished loading in the message pane (i.e.
   * OnMsgParsed has fired).
   *
   * @param {nsIMsgMailNewsUrl} aUrl
   *   Url for the message being analyzed.
   * @param {Element} browser
   *   The browser element where the message is loaded.
   * @returns {boolean}
   *   Returns true if this does have phishing urls. Returns false if we
   *   do not check this message or the phishing message does not need to be
   *   displayed.
   */
  analyzeMsgForPhishingURLs(aUrl, browser) {
    if (!aUrl || !this.mEnabled) {
      return false;
    }

    try {
      // nsIMsgMailNewsUrl.folder can throw an NS_ERROR_FAILURE, especially if
      // we are opening an .eml file.
      var folder = aUrl.folder;

      // Ignore nntp and RSS messages.
      if (
        !folder ||
        folder.server.type == "nntp" ||
        folder.server.type == "rss"
      ) {
        return false;
      }

      // Also ignore messages in Sent/Drafts/Templates/Outbox.
      const outgoingFlags =
        Ci.nsMsgFolderFlags.SentMail |
        Ci.nsMsgFolderFlags.Drafts |
        Ci.nsMsgFolderFlags.Templates |
        Ci.nsMsgFolderFlags.Queue;
      if (folder.isSpecialFolder(outgoingFlags, true)) {
        return false;
      }
    } catch (ex) {
      if (ex.result != Cr.NS_ERROR_FAILURE) {
        throw ex;
      }
    }

    // If the message contains forms with action attributes, warn the user.
    const formNodes = browser.contentDocument.querySelectorAll("form[action]");

    return this.mDisallowFormActions && formNodes.length > 0;
  }

  /**
   * Analyze the url contained for phishing attacks. Determine if the link node
   * contains a user visible url with a host name that differs from the actual
   * href the user would get taken to.
   * E.g. <a href="http://myevilsite.com">http://mozilla.org</a>
   *
   * @param {string} aUrl - The url to be analyzed
   * @param {string} aLinkText - User visible link text associated with aUrl
   *   in case we are dealing with a link node.
   * @returns {boolean} true if link node contains phishing URL.
   */
  linkTextMismatch(aUrl, aLinkText) {
    if (!aUrl || !URL.canParse(aUrl)) {
      return false;
    }

    const hrefURL = new URL(aUrl);

    // Only check for phishing urls if the url is an http or https link.
    // this prevents us from flagging imap and other internally handled urls
    if (hrefURL.protocol != "http:" && hrefURL.protocol != "https:") {
      return false;
    }
    // The link is not suspicious if the visible text is the same as the URL,
    // even if the URL is an IP address. URLs are commonly surrounded by
    // < > or "" (RFC2396E) - so strip those from the link text before comparing.
    aLinkText = aLinkText.replace(/^<(.+)>$|^"(.+)"$/, "$1$2");

    // gatherTextUnder puts a space between each piece of text it gathers,
    // so strip the spaces out (see bug 326082 for details).
    aLinkText = aLinkText.replace(/ /g, "");

    if (!URL.canParse(aLinkText)) {
      return false;
    }
    const textURL = new URL(aLinkText);
    if (textURL.protocol != "http:" && textURL.protocol != "https:") {
      return false;
    }
    if (hrefURL.hostname == textURL.hostname) {
      return false;
    }

    const hrefURI = Services.io.newURI(aUrl);
    const linkTextURI = Services.io.newURI(aLinkText);

    // Compare the base domain of the href and the link text.
    try {
      return (
        Services.eTLD.getBaseDomain(hrefURI) !=
        Services.eTLD.getBaseDomain(linkTextURI)
      );
    } catch (e) {
      // If we throw above, one of the URIs probably has no TLD (e.g.
      // http://localhost), so just check the entire host.
      return hrefURI.host != linkTextURI.host;
    }
  }

  /**
   * Opens the default browser to a page where the user can submit the given url
   * as a phish.
   *
   * @param aPhishingURL the url we want to report back as a phishing attack
   */
  reportPhishingURL(aPhishingURL) {
    let reportUrl = Services.urlFormatter.formatURLPref(
      "browser.safebrowsing.reportPhishURL"
    );
    reportUrl += "&url=" + encodeURIComponent(aPhishingURL);

    const uri = Services.io.newURI(reportUrl);
    const protocolSvc = Cc[
      "@mozilla.org/uriloader/external-protocol-service;1"
    ].getService(Ci.nsIExternalProtocolService);
    protocolSvc.loadURI(uri);
  }

  /**
   * If the current message has been identified as an email scam, prompts the
   * user with a warning before allowing the link click to be processed.
   * The warning prompt includes the unobscured host name of the http(s) url the
   * user clicked on.
   *
   * @param {DOMWindow} win
   *   The window the message is being displayed within.
   * @param {string} aUrl
   *   The url of the message
   * @param {string} aLinkText
   *   User visible link text associated with the link
   * @returns {number}
   *   0 if the URL implied by aLinkText should be used instead.
   *   1 if the request should be blocked.
   *   2 if aUrl should be allowed to load.
   */
  warnOnSuspiciousLinkClick(win, aUrl, aLinkText) {
    if (!aUrl || !URL.canParse(aUrl)) {
      return 1; // block
    }

    const bundle = Services.strings.createBundle(
      "chrome://messenger/locale/messenger.properties"
    );

    const hrefURL = new URL(aUrl);
    if (hrefURL.protocol != "http:" && hrefURL.protocol != "https:") {
      return 2; // allow
    }

    if (!this.linkTextMismatch(aUrl, aLinkText)) {
      return 2; // allow
    }

    // Unobscure the hostname in case it's an encoded IP address.
    const unobscuredHostname = lazy.isLegalIPAddress(hrefURL.hostname, true);
    if (unobscuredHostname && !lazy.isLegalLocalIPAddress(unobscuredHostname)) {
      const brandBundle = Services.strings.createBundle(
        "chrome://branding/locale/brand.properties"
      );
      const titleMsg = bundle.GetStringFromName("confirmPhishingTitle");
      const brandShortName = brandBundle.GetStringFromName("brandShortName");
      const dialogMsg = bundle.formatStringFromName("confirmPhishingUrl", [
        brandShortName,
        unobscuredHostname,
      ]);
      const button = Services.prompt.confirmEx(
        win,
        titleMsg,
        dialogMsg,
        Ci.nsIPromptService.STD_YES_NO_BUTTONS +
          Ci.nsIPromptService.BUTTON_POS_1_DEFAULT,
        "",
        "",
        "",
        "",
        {}
      );
      return button == 0 ? 2 : 1; // 2 == allow, 1 == block
    }

    // We have a mismatching hostname. Prompt the user what to do.
    const actualURL = hrefURL;
    const displayedURL = new URL(aLinkText);

    const titleMsg = bundle.GetStringFromName("linkMismatchTitle");
    const dialogMsg = bundle.formatStringFromName(
      "confirmPhishingUrlAlternate",
      [displayedURL.hostname, actualURL.hostname]
    );
    const warningButtons =
      Ci.nsIPromptService.BUTTON_POS_0 *
        Ci.nsIPromptService.BUTTON_TITLE_IS_STRING +
      Ci.nsIPromptService.BUTTON_POS_1 *
        Ci.nsIPromptService.BUTTON_TITLE_CANCEL +
      Ci.nsIPromptService.BUTTON_POS_2 *
        Ci.nsIPromptService.BUTTON_TITLE_IS_STRING;
    const button0Text = bundle.formatStringFromName("confirmPhishingGoDirect", [
      displayedURL.hostname,
    ]);
    const button2Text = bundle.formatStringFromName("confirmPhishingGoAhead", [
      actualURL.hostname,
    ]);
    return Services.prompt.confirmEx(
      win,
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
})();
