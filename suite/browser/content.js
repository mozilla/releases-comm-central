/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* This content script should work in any browser or iframe and should not
 * depend on the frame being contained in tabbrowser. */

ChromeUtils.defineModuleGetter(this, "LoginManagerContent",
  "resource://gre/modules/LoginManagerContent.jsm");
ChromeUtils.defineModuleGetter(this, "InsecurePasswordUtils",
  "resource://gre/modules/InsecurePasswordUtils.jsm");
ChromeUtils.defineModuleGetter(this, "PrivateBrowsingUtils",
  "resource://gre/modules/PrivateBrowsingUtils.jsm");
ChromeUtils.defineModuleGetter(this, "LoginFormFactory",
  "resource://gre/modules/LoginManagerContent.jsm");
ChromeUtils.defineModuleGetter(this, "PlacesUIUtils",
  "resource:///modules/PlacesUIUtils.jsm");
ChromeUtils.defineModuleGetter(this, "setTimeout",
  "resource://gre/modules/Timer.jsm");
ChromeUtils.defineModuleGetter(this, "Feeds",
  "resource:///modules/Feeds.jsm");
ChromeUtils.defineModuleGetter(this, "BrowserUtils",
  "resource://gre/modules/BrowserUtils.jsm");

XPCOMUtils.defineLazyGetter(this, "gPipNSSBundle", function() {
  return Services.strings.createBundle("chrome://pipnss/locale/pipnss.properties");
});
XPCOMUtils.defineLazyGetter(this, "gNSSErrorsBundle", function() {
  return Services.strings.createBundle("chrome://pipnss/locale/nsserrors.properties");
});

addMessageListener("RemoteLogins:fillForm", message => {
  LoginManagerContent.receiveMessage(message, content);
});

addEventListener("DOMFormHasPassword", event => {
  LoginManagerContent.onDOMFormHasPassword(event, content);
  let formLike = LoginFormFactory.createFromForm(event.target);
  InsecurePasswordUtils.reportInsecurePasswords(formLike);
});

addEventListener("DOMInputPasswordAdded", event => {
  LoginManagerContent.onDOMInputPasswordAdded(event, content);
  let formLike = LoginFormFactory.createFromField(event.target);
  InsecurePasswordUtils.reportInsecurePasswords(formLike);
});

addEventListener("pageshow", event => {
  LoginManagerContent.onPageShow(event, content);
}, true);

addEventListener("DOMAutoComplete", event => {
  LoginManagerContent.onUsernameInput(event);
});

addEventListener("blur", event => {
  LoginManagerContent.onUsernameInput(event);
});

addMessageListener("Bookmarks:GetPageDetails", (message) => {
  let doc = content.document;
  let isErrorPage = /^about:(neterror|certerror|blocked)/.test(doc.documentURI);
  sendAsyncMessage("Bookmarks:GetPageDetails:Result",
                   { isErrorPage,
                     description: PlacesUIUtils.getDescriptionFromDocument(doc) });
});

/* The following code, in particular AboutCertErrorListener and
 * AboutNetErrorListener, is mostly copied from content browser.js and content.js.
 * Certificate error handling should be unified to remove this duplicated code.
 */

const SEC_ERROR_BASE          = Ci.nsINSSErrorsService.NSS_SEC_ERROR_BASE;
const MOZILLA_PKIX_ERROR_BASE = Ci.nsINSSErrorsService.MOZILLA_PKIX_ERROR_BASE;

const SEC_ERROR_EXPIRED_CERTIFICATE                = SEC_ERROR_BASE + 11;
const SEC_ERROR_UNKNOWN_ISSUER                     = SEC_ERROR_BASE + 13;
const SEC_ERROR_UNTRUSTED_ISSUER                   = SEC_ERROR_BASE + 20;
const SEC_ERROR_UNTRUSTED_CERT                     = SEC_ERROR_BASE + 21;
const SEC_ERROR_EXPIRED_ISSUER_CERTIFICATE         = SEC_ERROR_BASE + 30;
const SEC_ERROR_CA_CERT_INVALID                    = SEC_ERROR_BASE + 36;
const SEC_ERROR_OCSP_FUTURE_RESPONSE               = SEC_ERROR_BASE + 131;
const SEC_ERROR_OCSP_OLD_RESPONSE                  = SEC_ERROR_BASE + 132;
const SEC_ERROR_REUSED_ISSUER_AND_SERIAL           = SEC_ERROR_BASE + 138;
const SEC_ERROR_CERT_SIGNATURE_ALGORITHM_DISABLED  = SEC_ERROR_BASE + 176;
const MOZILLA_PKIX_ERROR_NOT_YET_VALID_CERTIFICATE = MOZILLA_PKIX_ERROR_BASE + 5;
const MOZILLA_PKIX_ERROR_NOT_YET_VALID_ISSUER_CERTIFICATE = MOZILLA_PKIX_ERROR_BASE + 6;
const MOZILLA_PKIX_ERROR_SELF_SIGNED_CERT          = MOZILLA_PKIX_ERROR_BASE + 14;
const MOZILLA_PKIX_ERROR_MITM_DETECTED             = MOZILLA_PKIX_ERROR_BASE + 15;


const SSL_ERROR_BASE = Ci.nsINSSErrorsService.NSS_SSL_ERROR_BASE;
const SSL_ERROR_SSL_DISABLED  = SSL_ERROR_BASE + 20;
const SSL_ERROR_SSL2_DISABLED  = SSL_ERROR_BASE + 14;

var AboutNetAndCertErrorListener = {
  init(chromeGlobal) {
    addEventListener("AboutNetAndCertErrorLoad", this, false, true);
  },

  get isNetErrorSite() {
    return content.document.documentURI.startsWith("about:neterror");
  },

  get isCertErrorSite() {
    return content.document.documentURI.startsWith("about:certerror");
  },

  _getErrorMessageFromCode(securityInfo, doc) {
    let uri = Services.io.newURI(doc.location);
    let hostString = uri.host;
    if (uri.port != 443 && uri.port != -1) {
      hostString += ":" + uri.port;
    }

    let id_str = "";
    switch (securityInfo.errorCode) {
      case SSL_ERROR_SSL_DISABLED:
        id_str = "PSMERR_SSL_Disabled";
        break;
      case SSL_ERROR_SSL2_DISABLED:
        id_str = "PSMERR_SSL2_Disabled";
        break;
      case SEC_ERROR_REUSED_ISSUER_AND_SERIAL:
        id_str = "PSMERR_HostReusedIssuerSerial";
        break;
    }
    let nss_error_id_str = securityInfo.errorCodeString;
    let msg2 = "";
    if (id_str) {
      msg2 = gPipNSSBundle.GetStringFromName(id_str) + "\n";
    } else if (nss_error_id_str) {
      msg2 = gNSSErrorsBundle.GetStringFromName(nss_error_id_str) + "\n";
    }

    if (!msg2) {
      // We couldn't get an error message. Use the error string.
      // Note that this is different from before where we used PR_ErrorToString.
      msg2 = nss_error_id_str;
    }
    let msg = gPipNSSBundle.formatStringFromName("SSLConnectionErrorPrefix2",
                                                 [hostString, msg2], 2);

    if (nss_error_id_str) {
      msg += gPipNSSBundle.formatStringFromName("certErrorCodePrefix3",
                                                [nss_error_id_str], 1);
    }
    let id = content.document.getElementById("errorShortDescText");
    id.textContent = msg;
    id.className = "wrap";
  },

  _setTechDetails(sslStatus, securityInfo, location) {
    if (!securityInfo || !sslStatus || !location) {
      return;
    }
    let validity = sslStatus.serverCert.validity;

    let doc = content.document;
    // CSS class and error code are set from nsDocShell.
    let searchParams = new URLSearchParams(doc.documentURI.split("?")[1]);
    let cssClass = searchParams.get("s");
    let error = searchParams.get("e");
    let technicalInfo = doc.getElementById("technicalContentText");

    let uri = Services.io.newURI(location);
    let hostString = uri.host;
    if (uri.port != 443 && uri.port != -1) {
      hostString += ":" + uri.port;
    }

    let msg = gPipNSSBundle.formatStringFromName("certErrorIntro",
                                                 [hostString], 1);
    msg += "\n\n";

    if (sslStatus.isUntrusted) {
      switch (securityInfo.errorCode) {
        case MOZILLA_PKIX_ERROR_MITM_DETECTED:
          msg += gPipNSSBundle.GetStringFromName("certErrorTrust_MitM") + "\n";
          break;
        case SEC_ERROR_UNKNOWN_ISSUER:
          msg += gPipNSSBundle.GetStringFromName("certErrorTrust_UnknownIssuer") + "\n";
          msg += gPipNSSBundle.GetStringFromName("certErrorTrust_UnknownIssuer2") + "\n";
          msg += gPipNSSBundle.GetStringFromName("certErrorTrust_UnknownIssuer3") + "\n";
          break;
        case SEC_ERROR_CA_CERT_INVALID:
          msg += gPipNSSBundle.GetStringFromName("certErrorTrust_CaInvalid") + "\n";
          break;
        case SEC_ERROR_UNTRUSTED_ISSUER:
          msg += gPipNSSBundle.GetStringFromName("certErrorTrust_Issuer") + "\n";
          break;
        case SEC_ERROR_CERT_SIGNATURE_ALGORITHM_DISABLED:
          msg += gPipNSSBundle.GetStringFromName("certErrorTrust_SignatureAlgorithmDisabled") + "\n";
          break;
        case SEC_ERROR_EXPIRED_ISSUER_CERTIFICATE:
          msg += gPipNSSBundle.GetStringFromName("certErrorTrust_ExpiredIssuer") + "\n";
          break;
        case MOZILLA_PKIX_ERROR_SELF_SIGNED_CERT:
          msg += gPipNSSBundle.GetStringFromName("certErrorTrust_SelfSigned") + "\n";
          break;
        case SEC_ERROR_UNTRUSTED_CERT:
        default:
          msg += gPipNSSBundle.GetStringFromName("certErrorTrust_Untrusted") + "\n";
      }
    }

    technicalInfo.appendChild(doc.createTextNode(msg));

    if (sslStatus.isDomainMismatch) {
      let subjectAltNamesList = sslStatus.serverCert.subjectAltNames;
      let subjectAltNames = subjectAltNamesList.split(",");
      let numSubjectAltNames = subjectAltNames.length;
      if (numSubjectAltNames != 0) {
        if (numSubjectAltNames == 1) {
          // Let's check if we want to make this a link.
          let okHost = subjectAltNamesList;
          let href = "";
          let thisHost = doc.location.hostname;
          let proto = doc.location.protocol + "//";
          // If okHost is a wildcard domain ("*.example.com") let's
          // use "www" instead.  "*.example.com" isn't going to
          // get anyone anywhere useful. bug 432491
          okHost = okHost.replace(/^\*\./, "www.");
          /* case #1:
           * example.com uses an invalid security certificate.
           *
           * The certificate is only valid for www.example.com
           *
           * Make sure to include the "." ahead of thisHost so that
           * a MitM attack on paypal.com doesn't hyperlink to "notpaypal.com"
           *
           * We'd normally just use a RegExp here except that we lack a
           * library function to escape them properly (bug 248062), and
           * domain names are famous for having '.' characters in them,
           * which would allow spurious and possibly hostile matches.
           */
          if (okHost.endsWith("." + thisHost)) {
            href = proto + okHost;
          }
          /* case #2:
           * browser.garage.maemo.org uses an invalid security certificate.
           *
           * The certificate is only valid for garage.maemo.org
           */
          if (thisHost.endsWith("." + okHost)) {
            href = proto + okHost;
          }

          // If we set a link, meaning there's something helpful for
          // the user here, expand the section by default
          if (href && cssClass != "expertBadCert") {
            doc.getElementById("technicalContentText").style.display = "block";
          }

          let msgPrefix =
              gPipNSSBundle.GetStringFromName("certErrorMismatchSinglePrefix");

          // Set the link if we want it.
          if (href) {
            let referrerlink = doc.createElement("a");
            referrerlink.append(subjectAltNamesList + "\n");
            referrerlink.title = subjectAltNamesList;
            referrerlink.id = "cert_domain_link";
            referrerlink.href = href;
            msg = BrowserUtils.getLocalizedFragment(doc, msgPrefix,
                                                    referrerlink);
          } else {
            msg = BrowserUtils.getLocalizedFragment(doc, msgPrefix,
                                                    subjectAltNamesList);
          }
        } else {
          msg = gPipNSSBundle.GetStringFromName("certErrorMismatchMultiple") + "\n";
          for (let i = 0; i < numSubjectAltNames; i++) {
            msg += subjectAltNames[i];
            if (i != (numSubjectAltNames - 1)) {
              msg += ", ";
            }
          }
        }
      } else {
        msg = gPipNSSBundle.formatStringFromName("certErrorMismatch",
                                                 [hostString], 1);
      }
      technicalInfo.append(msg + "\n");
    }

    if (sslStatus.isNotValidAtThisTime) {
      let nowTime = new Date().getTime() * 1000;
      let dateOptions = { year: "numeric", month: "long", day: "numeric",
                          hour: "numeric", minute: "numeric" };
      let now = new Services.intl.DateTimeFormat(undefined, dateOptions).format(new Date());
      if (validity.notBefore) {
        if (nowTime > validity.notAfter) {
          msg = gPipNSSBundle.formatStringFromName("certErrorExpiredNow",
                                                   [validity.notAfterLocalTime, now], 2) + "\n";
        } else {
          msg = gPipNSSBundle.formatStringFromName("certErrorNotYetValidNow",
                                                   [validity.notBeforeLocalTime, now], 2) + "\n";
        }
      } else {
        // If something goes wrong, we assume the cert expired.
        msg = gPipNSSBundle.formatStringFromName("certErrorExpiredNow",
                                                 ["", now], 2) + "\n";
      }
      technicalInfo.append(msg);
    }
    technicalInfo.append("\n");

    // Add link to certificate and error message.
    msg = gPipNSSBundle.formatStringFromName("certErrorCodePrefix3",
                                             [securityInfo.errorCodeString], 1);
    technicalInfo.append(msg);
  },

  handleEvent(aEvent) {
    if (!this.isNetErrorSite && !this.isCertErrorSite) {
      return;
    }

    if (aEvent.type != "AboutNetAndCertErrorLoad") {
      return;
    }

    if (this.isNetErrorSite) {
      let {securityInfo} = docShell.failedChannel;
      // We don't have a securityInfo when this is for example a DNS error.
      if (securityInfo) {
        securityInfo.QueryInterface(Ci.nsITransportSecurityInfo);
        this._getErrorMessageFromCode(securityInfo,
                                      aEvent.originalTarget.ownerGlobal);
      }
      return;
    }

    let ownerDoc = aEvent.originalTarget.ownerGlobal;
    let securityInfo = docShell.failedChannel && docShell.failedChannel.securityInfo;
    securityInfo.QueryInterface(Ci.nsITransportSecurityInfo)
                .QueryInterface(Ci.nsISerializable);
    let sslStatus = securityInfo.QueryInterface(Ci.nsISSLStatusProvider)
                                                .SSLStatus;
    this._setTechDetails(sslStatus, securityInfo, ownerDoc.location.href);
  },
};
AboutNetAndCertErrorListener.init();

const MathMLNS = "http://www.w3.org/1998/Math/MathML";
const XLinkNS  = "http://www.w3.org/1999/xlink";

let PageInfoListener = {

  init: function() {
    addMessageListener("PageInfo:getData", this);
  },

  receiveMessage: function(message) {
    let strings = message.data.strings;
    let window;
    let document;

    let frameOuterWindowID = message.data.frameOuterWindowID;

    // If inside frame then get the frame's window and document.
    if (frameOuterWindowID) {
      window = Services.wm.getOuterWindowWithId(frameOuterWindowID);
      document = window.document;
    }
    else {
      document = content.document;
      window = content.window;
    }

    let imageElement = message.objects.imageElement;

    let pageInfoData = {metaViewRows: this.getMetaInfo(document),
                        docInfo: this.getDocumentInfo(document),
                        feeds: this.getFeedsInfo(document, strings),
                        windowInfo: this.getWindowInfo(window),
                        imageInfo: this.getImageInfo(imageElement)};

    sendAsyncMessage("PageInfo:data", pageInfoData);

    // Separate step so page info dialog isn't blank while waiting for this
    // to finish.
    this.getMediaInfo(document, window, strings);
  },

  getImageInfo: function(imageElement) {
    let imageInfo = null;
    if (imageElement) {
      imageInfo = {
        currentSrc: imageElement.currentSrc,
        width: imageElement.width,
        height: imageElement.height,
        imageText: imageElement.title || imageElement.alt
      };
    }
    return imageInfo;
  },

  getMetaInfo: function(document) {
    let metaViewRows = [];

    // Get the meta tags from the page.
    let metaNodes = document.getElementsByTagName("meta");

    for (let metaNode of metaNodes) {
      metaViewRows.push([metaNode.name || metaNode.httpEquiv ||
                         metaNode.getAttribute("property"),
                         metaNode.content]);
    }

    return metaViewRows;
  },

  getWindowInfo: function(window) {
    let windowInfo = {};
    windowInfo.isTopWindow = window == window.top;

    let hostName = null;
    try {
      hostName = Services.io.newURI(window.location.href).displayHost;
    }
    catch (exception) { }

    windowInfo.hostName = hostName;
    return windowInfo;
  },

  getDocumentInfo: function(document) {
    let docInfo = {};
    docInfo.title = document.title;
    docInfo.location = document.location.toString();
    try {
      docInfo.location = Services.io.newURI(document.location.toString()).displaySpec;
    } catch (exception) { }
    docInfo.referrer = document.referrer;
    try {
      if (document.referrer) {
        docInfo.referrer = Services.io.newURI(document.referrer).displaySpec;
      }
    } catch (exception) { }
    docInfo.compatMode = document.compatMode;
    docInfo.contentType = document.contentType;
    docInfo.characterSet = document.characterSet;
    docInfo.lastModified = document.lastModified;
    docInfo.principal = document.nodePrincipal;

    let documentURIObject = {};
    documentURIObject.spec = document.documentURIObject.spec;
    docInfo.documentURIObject = documentURIObject;

    docInfo.isContentWindowPrivate = PrivateBrowsingUtils.isContentWindowPrivate(content);

    return docInfo;
  },

  getFeedsInfo: function(document, strings) {
    let feeds = [];
    // Get the feeds from the page.
    let linkNodes = document.getElementsByTagName("link");
    let length = linkNodes.length;
    for (let i = 0; i < length; i++) {
      let link = linkNodes[i];
      if (!link.href) {
        continue;
      }
      let rel = link.rel && link.rel.toLowerCase();
      let rels = {};

      if (rel) {
        for (let relVal of rel.split(/\s+/)) {
          rels[relVal] = true;
        }
      }

      if (rels.feed || (link.type && rels.alternate && !rels.stylesheet)) {
        let type = Feeds.isValidFeed(link, document.nodePrincipal, "feed" in rels);
        if (type) {
          type = strings[type] || strings["application/rss+xml"];
          feeds.push([link.title, type, link.href]);
        }
      }
    }
    return feeds;
  },

  // Only called once to get the media tab's media elements from the content
  // page.
  getMediaInfo: function(document, window, strings)
  {
    let frameList = this.goThroughFrames(document, window);
    this.processFrames(document, frameList, strings);
  },

  goThroughFrames: function(document, window)
  {
    let frameList = [document];
    if (window && window.frames.length > 0) {
      let num = window.frames.length;
      for (let i = 0; i < num; i++) {
        // Recurse through the frames.
        frameList =
          frameList.concat(this.goThroughFrames(window.frames[i].document,
                                                window.frames[i]));
      }
    }
    return frameList;
  },

  async processFrames(document, frameList, strings)
  {
    let nodeCount = 0;
    for (let doc of frameList) {
      let iterator = doc.createTreeWalker(doc, content.NodeFilter.SHOW_ELEMENT);

      // Goes through all the elements on the doc.
      while (iterator.nextNode()) {
        this.getMediaItems(document, strings, iterator.currentNode);

        if (++nodeCount % 500 == 0) {
          // setTimeout every 500 elements so we don't keep blocking the
          // content process.
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
    }
    // Send that page info media fetching has finished.
    sendAsyncMessage("PageInfo:mediaData", {isComplete: true});
  },

  getMediaItems: function(document, strings, elem)
  {
    // Check for images defined in CSS (e.g. background, borders).
    let computedStyle = elem.ownerDocument.defaultView.getComputedStyle(elem, "");
    // A node can have multiple media items associated with it - for example,
    // multiple background images.
    let imageItems = [];
    let formItems = [];
    let linkItems = [];

    let addImage = (url, type, alt, elem, isBg) => {
      let element = this.serializeElementInfo(document, url, type, alt, elem, isBg);
      imageItems.push([url, type, alt, element, isBg]);
    };

    if (computedStyle) {
      let addImgFunc = (label, val) => {
        if (val.primitiveType == content.CSSPrimitiveValue.CSS_URI) {
          addImage(val.getStringValue(), label, strings.notSet, elem, true);
        }
        else if (val.primitiveType == content.CSSPrimitiveValue.CSS_STRING) {
          // This is for -moz-image-rect.
          // TODO: Reimplement once bug 714757 is fixed.
          let strVal = val.getStringValue();
          if (strVal.search(/^.*url\(\"?/) > -1) {
            let url = strVal.replace(/^.*url\(\"?/,"").replace(/\"?\).*$/,"");
            addImage(url, label, strings.notSet, elem, true);
          }
        }
        else if (val.cssValueType == content.CSSValue.CSS_VALUE_LIST) {
          // Recursively resolve multiple nested CSS value lists.
          for (let i = 0; i < val.length; i++) {
            addImgFunc(label, val.item(i));
          }
        }
      };

      addImgFunc(strings.mediaBGImg, computedStyle.getPropertyCSSValue("background-image"));
      addImgFunc(strings.mediaBorderImg, computedStyle.getPropertyCSSValue("border-image-source"));
      addImgFunc(strings.mediaListImg, computedStyle.getPropertyCSSValue("list-style-image"));
      addImgFunc(strings.mediaCursor, computedStyle.getPropertyCSSValue("cursor"));
    }

    let addForm = (elem) => {
      let element = this.serializeFormInfo(document, elem, strings);
      formItems.push([elem.name, elem.method, elem.action, element]);
    };

    // One swi^H^H^Hif-else to rule them all.
    if (elem instanceof content.HTMLAnchorElement) {
      linkItems.push([this.getValueText(elem), elem.href, strings.linkAnchor,
                      elem.target, elem.accessKey]);
    }
    else if (elem instanceof content.HTMLImageElement) {
      addImage(elem.src, strings.mediaImg,
               (elem.hasAttribute("alt")) ? elem.alt : strings.notSet,
               elem, false);
    }
    else if (elem instanceof content.HTMLAreaElement) {
      linkItems.push([elem.alt, elem.href, strings.linkArea, elem.target, ""]);
    }
    else if (elem instanceof content.HTMLVideoElement) {
      addImage(elem.currentSrc, strings.mediaVideo, "", elem, false);
    }
    else if (elem instanceof content.HTMLAudioElement) {
      addImage(elem.currentSrc, strings.mediaAudio, "", elem, false);
    }
    else if (elem instanceof content.HTMLLinkElement) {
      if (elem.rel) {
        let rel = elem.rel;
        if (/\bicon\b/i.test(rel)) {
          addImage(elem.href, strings.mediaLink, "", elem, false);
        }
        else if (/(?:^|\s)stylesheet(?:\s|$)/i.test(rel)) {
          linkItems.push([elem.rel, elem.href, strings.linkStylesheet,
                          elem.target, ""]);
        }
        else {
          linkItems.push([elem.rel, elem.href, strings.linkRel,
                          elem.target, ""]);
        }
      }
      else {
        linkItems.push([elem.rev, elem.href, strings.linkRev, elem.target, ""]);
      }
    }
    else if (elem instanceof content.HTMLInputElement ||
             elem instanceof content.HTMLButtonElement) {
      switch (elem.type.toLowerCase()) {
        case "image":
          addImage(elem.src, strings.mediaInput,
                   (elem.hasAttribute("alt")) ? elem.alt : strings.notSet,
                   elem, false);
          // Fall through, <input type="image"> submits, too
        case "submit":
          if ("form" in elem && elem.form) {
            linkItems.push([elem.value || this.getValueText(elem) ||
                            strings.linkSubmit, elem.form.action,
                            strings.linkSubmission, elem.form.target, ""]);
          }
          else {
            linkItems.push([elem.value || this.getValueText(elem) ||
                            strings.linkSubmit, "",
                            strings.linkSubmission, "", ""]);
          }
      }
    }
    else if (elem instanceof content.HTMLFormElement) {
      addForm(elem);
    }
    else if (elem instanceof content.HTMLObjectElement) {
      addImage(elem.data, strings.mediaObject, this.getValueText(elem),
               elem, false);
    }
    else if (elem instanceof content.HTMLEmbedElement) {
      addImage(elem.src, strings.mediaEmbed, "", elem, false);
    }
    else if (elem.namespaceURI == MathMLNS && elem.hasAttribute("href")) {
      let href = elem.getAttribute("href");
      try {
        href = makeURLAbsolute(elem.baseURI, href,
                               elem.ownerDocument.characterSet);
      } catch (e) {}
      linkItems.push([this.getValueText(elem), href, strings.linkX, "", ""]);
    }
    else if (elem.hasAttributeNS(XLinkNS, "href")) {
      let href = elem.getAttributeNS(XLinkNS, "href");
      try {
        href = makeURLAbsolute(elem.baseURI, href,
                               elem.ownerDocument.characterSet);
      } catch (e) {}
      // SVG images without an xlink:href attribute are ignored
      if (elem instanceof content.SVGImageElement) {
        addImage(href, strings.mediaImg, "", elem, false);
      }
      else {
        linkItems.push([this.getValueText(elem), href, strings.linkX, "", ""]);
      }
    }
    else if (elem instanceof content.HTMLScriptElement) {
      linkItems.push([elem.type || elem.getAttribute("language") ||
                      strings.notSet, elem.src || strings.linkScriptInline,
                      strings.linkScript, "", "", ""]);
    }
    if (imageItems.length || formItems.length || linkItems.length) {
      sendAsyncMessage("PageInfo:mediaData",
                       {imageItems, formItems, linkItems, isComplete: false});
    }
  },

  /**
   * Set up a JSON element object with all the instanceOf and other infomation
   * that makePreview in pageInfo.js uses to figure out how to display the
   * preview.
   */

  serializeElementInfo: function(document, url, type, alt, item, isBG)
  {
    let result = {};

    let imageText;
    if (!isBG &&
        !(item instanceof content.SVGImageElement) &&
        !(document instanceof content.ImageDocument)) {
      imageText = item.title || item.alt;

      if (!imageText && !(item instanceof content.HTMLImageElement)) {
        imageText = this.getValueText(item);
      }
    }

    result.imageText = imageText;
    result.longDesc = item.longDesc;
    result.numFrames = 1;

    if (item instanceof content.HTMLObjectElement ||
        item instanceof content.HTMLEmbedElement ||
        item instanceof content.HTMLLinkElement) {
      result.mimeType = item.type;
    }

    if (!result.mimeType && !isBG &&
        item instanceof Ci.nsIImageLoadingContent) {
      let imageRequest =
        item.getRequest(Ci.nsIImageLoadingContent.CURRENT_REQUEST);
      if (imageRequest) {
        result.mimeType = imageRequest.mimeType;
        let image = !(imageRequest.imageStatus & imageRequest.STATUS_ERROR) &&
                    imageRequest.image;
        if (image) {
          result.numFrames = image.numFrames;
        }
      }
    }

    // If we have a data url, get the MIME type from the url.
    if (!result.mimeType && url.startsWith("data:")) {
      let dataMimeType = /^data:(image\/[^;,]+)/i.exec(url);
      if (dataMimeType)
        result.mimeType = dataMimeType[1].toLowerCase();
    }

    result.HTMLLinkElement = item instanceof content.HTMLLinkElement;
    result.HTMLInputElement = item instanceof content.HTMLInputElement;
    result.HTMLImageElement = item instanceof content.HTMLImageElement;
    result.HTMLObjectElement = item instanceof content.HTMLObjectElement;
    result.HTMLEmbedElement = item instanceof content.HTMLEmbedElement;
    result.SVGImageElement = item instanceof content.SVGImageElement;
    result.HTMLVideoElement = item instanceof content.HTMLVideoElement;
    result.HTMLAudioElement = item instanceof content.HTMLAudioElement;

    if (isBG) {
      // Items that are showing this image as a background
      // image might not necessarily have a width or height,
      // so we'll dynamically generate an image and send up the
      // natural dimensions.
      let img = content.document.createElement("img");
      img.src = url;
      result.naturalWidth = img.naturalWidth;
      result.naturalHeight = img.naturalHeight;
    } else {
      // Otherwise, we can use the current width and height
      // of the image.
      result.width = item.width;
      result.height = item.height;
    }

    if (item instanceof content.SVGImageElement) {
      result.SVGImageElementWidth = item.width.baseVal.value;
      result.SVGImageElementHeight = item.height.baseVal.value;
    }

    result.baseURI = item.baseURI;

    return result;
  },

  serializeFormInfo: function(document, form, strings)
  {
    let result = {};

    if (form.name)
      result.name = form.name;

    result.encoding = form.encoding;
    result.target = form.target;
    result.formfields = [];

    function findFirstControl(node, document) {
      function FormControlFilter(node) {
        if (node instanceof content.HTMLInputElement ||
            node instanceof content.HTMLSelectElement ||
            node instanceof content.HTMLButtonElement ||
            node instanceof content.HTMLTextAreaElement ||
           node instanceof content.HTMLObjectElement)
          return content.NodeFilter.FILTER_ACCEPT;
        return content.NodeFilter.FILTER_SKIP;
      }

      if (node.hasAttribute("for")) {
        return document.getElementById(node.getAttribute("for"));
      }

      var iterator = document.createTreeWalker(node, content.NodeFilter.SHOW_ELEMENT, FormControlFilter, true);

      return iterator.nextNode();
    }

    var whatfor;
    var labels = [];
    for (let label of form.getElementsByTagName("label")) {
      var whatfor = findFirstControl(label, document);

      if (whatfor && (whatfor.form == form)) {
        labels.push({label: whatfor, labeltext: this.getValueText(label)});
      }
    }

    result.formfields = [];

    var val;
    for (let formfield of form.elements) {
      if (formfield instanceof content.HTMLButtonElement)
        val = this.getValueText(formfield);
      else
        val = (/^password$/i.test(formfield.type)) ? strings.formPassword : formfield.value;

      var fieldlabel = "";
      for (let labelfor of labels) {
        if (formfield == labelfor.label) {
          fieldlabel = labelfor.labeltext;
        }
      }
      result.formfields.push([fieldlabel, formfield.name, formfield.type, val]);
    }

    return result;
  },

  //******** Other Misc Stuff
  // Modified from the Links Panel v2.3,
  // http://segment7.net/mozilla/links/links.html
  // parse a node to extract the contents of the node
  getValueText: function(node)
  {

    let valueText = "";

    // Form input elements don't generally contain information that is useful
    // to our callers, so return nothing.
    if (node instanceof content.HTMLInputElement ||
        node instanceof content.HTMLSelectElement ||
        node instanceof content.HTMLTextAreaElement) {
      return valueText;
    }

    // Otherwise recurse for each child.
    let length = node.childNodes.length;

    for (let i = 0; i < length; i++) {
      let childNode = node.childNodes[i];
      let nodeType = childNode.nodeType;

      // Text nodes are where the goods are.
      if (nodeType == content.Node.TEXT_NODE) {
        valueText += " " + childNode.nodeValue;
      }
      // And elements can have more text inside them.
      else if (nodeType == content.Node.ELEMENT_NODE) {
        // Images are special, we want to capture the alt text as if the image
        // weren't there.
        if (childNode instanceof content.HTMLImageElement) {
          valueText += " " + this.getAltText(childNode);
        }
        else {
          valueText += " " + this.getValueText(childNode);
        }
      }
    }

    return this.stripWS(valueText);
  },

  // Copied from the Links Panel v2.3,
  // http://segment7.net/mozilla/links/links.html.
  // Traverse the tree in search of an img or area element and grab its alt tag.
  getAltText: function(node)
  {
    let altText = "";

    if (node.alt) {
      return node.alt;
    }
    let length = node.childNodes.length;
    for (let i = 0; i < length; i++) {
      if ((altText = this.getAltText(node.childNodes[i]) != undefined)) { // stupid js warning...
        return altText;
      }
    }
    return "";
  },

  // Copied from the Links Panel v2.3,
  // http://segment7.net/mozilla/links/links.html.
  // Strip leading and trailing whitespace, and replace multiple consecutive
  // whitespace characters with a single space.
  stripWS: function(text)
  {
    let middleRE = /\s+/g;
    let endRE = /(^\s+)|(\s+$)/g;

    text = text.replace(middleRE, " ");
    return text.replace(endRE, "");
  }
};
PageInfoListener.init();
