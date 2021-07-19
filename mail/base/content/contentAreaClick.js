/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../../toolkit/content/contentAreaUtils.js */
/* import-globals-from mailWindow.js */
/* import-globals-from utilityOverlay.js */
/* import-globals-from phishingDetector.js */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { PlacesUtils } = ChromeUtils.import(
  "resource://gre/modules/PlacesUtils.jsm"
);
var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);
XPCOMUtils.defineLazyPreferenceGetter(
  this,
  "alternativeAddonSearchUrl",
  "extensions.alternativeAddonSearch.url"
);

XPCOMUtils.defineLazyPreferenceGetter(
  this,
  "canonicalAddonServerUrl",
  "extensions.canonicalAddonServer.url"
);
/**
 * Extract the href from the link click event.
 * We look for HTMLAnchorElement, HTMLAreaElement, HTMLLinkElement,
 * HTMLInputElement.form.action, and nested anchor tags.
 * If the clicked element was a HTMLInputElement or HTMLButtonElement
 * we return the form action.
 *
 * @return [href, linkText] the url and the text for the link being clicked.
 */
function hRefForClickEvent(aEvent, aDontCheckInputElement) {
  let target =
    aEvent.type == "command"
      ? document.commandDispatcher.focusedElement
      : aEvent.target;

  if (
    target instanceof HTMLImageElement &&
    target.hasAttribute("overflowing")
  ) {
    // Click on zoomed image.
    return [null, null];
  }

  let href = null;
  let linkText = null;
  if (
    target instanceof HTMLAnchorElement ||
    target instanceof HTMLAreaElement ||
    target instanceof HTMLLinkElement
  ) {
    if (target.hasAttribute("href")) {
      href = target.href;
      linkText = gatherTextUnder(target);
    }
  } else if (
    !aDontCheckInputElement &&
    (target instanceof HTMLInputElement || target instanceof HTMLButtonElement)
  ) {
    if (target.form && target.form.action) {
      href = target.form.action;
    }
  } else {
    // We may be nested inside of a link node.
    let linkNode = aEvent.target;
    while (linkNode && !(linkNode instanceof HTMLAnchorElement)) {
      linkNode = linkNode.parentNode;
    }

    if (linkNode) {
      href = linkNode.href;
      linkText = gatherTextUnder(linkNode);
    }
  }
  return [href, linkText];
}

function messagePaneOnResize(aEvent) {
  // Scale any overflowing images, exclude http content.
  let browser = getBrowser();
  let doc = browser && browser.contentDocument ? browser.contentDocument : null;
  if (!doc || doc.URL.startsWith("http") || !doc.images) {
    return;
  }

  for (let img of doc.images) {
    if (
      img.clientWidth - doc.body.offsetWidth >= 0 &&
      (img.clientWidth <= img.naturalWidth || !img.naturalWidth)
    ) {
      img.setAttribute("overflowing", true);
    } else {
      img.removeAttribute("overflowing");
    }
  }
}

/**
 * Check whether the click target's or its ancestor's href
 * points to an anchor on the page.
 *
 * @param HTMLElement aTargetNode - the element node.
 * @return                        - true if link pointing to anchor.
 */
function isLinkToAnchorOnPage(aTargetNode) {
  let url = aTargetNode.ownerDocument.URL;
  if (!url.startsWith("http")) {
    return false;
  }

  let linkNode = aTargetNode;
  while (linkNode && !(linkNode instanceof HTMLAnchorElement)) {
    linkNode = linkNode.parentNode;
  }

  // It's not a link with an anchor.
  if (!linkNode || !linkNode.href || !linkNode.hash) {
    return false;
  }

  // The link's href must match the document URL.
  if (makeURI(linkNode.href).specIgnoringRef != makeURI(url).specIgnoringRef) {
    return false;
  }

  return true;
}

// Called whenever the user clicks in the content area,
// should always return true for click to go through.
function contentAreaClick(aEvent) {
  let target = aEvent.target;
  if (target.localName == "browser") {
    // This is a remote browser. Nothing useful can happen in this process.
    return true;
  }

  // If we've loaded a web page url, and the element's or its ancestor's href
  // points to an anchor on the page, let the click go through.
  // Otherwise fall through and open externally.
  if (isLinkToAnchorOnPage(target)) {
    return true;
  }

  let [href, linkText] = hRefForClickEvent(aEvent);

  if (!href && !aEvent.button) {
    // Is this an image that we might want to scale?

    if (target instanceof HTMLImageElement) {
      // Make sure it loaded successfully. No action if not or a broken link.
      var req = target.getRequest(Ci.nsIImageLoadingContent.CURRENT_REQUEST);
      if (!req || req.imageStatus & Ci.imgIRequest.STATUS_ERROR) {
        return false;
      }

      // Is it an image?
      if (target.localName == "img" && target.hasAttribute("overflowing")) {
        if (target.hasAttribute("shrinktofit")) {
          // Currently shrunk to fit, so unshrink it.
          target.removeAttribute("shrinktofit");
        } else {
          // User wants to shrink now.
          target.setAttribute("shrinktofit", true);
        }

        return false;
      }
    }
    return true;
  }

  if (!href || aEvent.button == 2) {
    return true;
  }

  // We want all about, http and https links in the message pane to be loaded
  // externally in a browser, therefore we need to detect that here and redirect
  // as necessary.
  let uri = makeURI(href);
  if (
    Cc["@mozilla.org/uriloader/external-protocol-service;1"]
      .getService(Ci.nsIExternalProtocolService)
      .isExposedProtocol(uri.scheme) &&
    !uri.schemeIs("http") &&
    !uri.schemeIs("https")
  ) {
    return true;
  }

  // Add-on names in the Add-On Manager are links, but we don't want to do
  // anything with them.
  if (uri.schemeIs("addons")) {
    return true;
  }

  // Now we're here, we know this should be loaded in an external browser, so
  // prevent the default action so we don't try and load it here.
  aEvent.preventDefault();

  // Let the phishing detector check the link.
  let urlPhishCheckResult = gPhishingDetector.warnOnSuspiciousLinkClick(
    href,
    linkText
  );
  if (urlPhishCheckResult === 1) {
    return false; // Block request
  }

  if (urlPhishCheckResult === 0) {
    // Use linkText instead.
    openLinkExternally(linkText);
    return true;
  }

  openLinkExternally(href);
  return true;
}

/**
 * Forces a url to open in an external application according to the protocol
 * service settings.
 *
 * @param url  A url string or an nsIURI containing the url to open.
 */
function openLinkExternally(url) {
  let uri = url;
  if (!(uri instanceof Ci.nsIURI)) {
    uri = Services.io.newURI(url);
  }

  // This can fail if there is a problem with the places database.
  PlacesUtils.history
    .insert({
      url, // accepts both string and nsIURI
      visits: [
        {
          date: new Date(),
        },
      ],
    })
    .catch(Cu.reportError);

  Cc["@mozilla.org/uriloader/external-protocol-service;1"]
    .getService(Ci.nsIExternalProtocolService)
    .loadURI(uri);
}

/**
 * Compatibility to Firefox, used for example by devtools to open links. Defer
 * this to the external browser, if it is not add-on related.
 */
function openWebLinkIn(url, where, params) {
  if (
    (url.startsWith(canonicalAddonServerUrl) && where == "tab") ||
    (url.startsWith(alternativeAddonSearchUrl) && where == "tab")
  ) {
    document.getElementById("tabmail").openTab("contentTab", { url });
    return;
  }

  if (!params) {
    params = {};
  }

  if (!params.triggeringPrincipal) {
    params.triggeringPrincipal = Services.scriptSecurityManager.createNullPrincipal(
      {}
    );
  }

  openUILinkIn(url, where, params);
}

function openUILinkIn(url, where, options) {
  openLinkExternally(url);
}

function openTrustedLinkIn(url, where, aParams) {
  var params = aParams;

  if (!params) {
    params = {};
  }

  if (
    url.startsWith("about:certificate") ||
    (url.startsWith(canonicalAddonServerUrl) && where == "tab") ||
    (url.startsWith(alternativeAddonSearchUrl) && where == "tab")
  ) {
    document.getElementById("tabmail").openTab("contentTab", { url });
    return;
  }

  if (!params.triggeringPrincipal) {
    params.triggeringPrincipal = Services.scriptSecurityManager.getSystemPrincipal();
  }

  openUILinkIn(url, where, params);
}
