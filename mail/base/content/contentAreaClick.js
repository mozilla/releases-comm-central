/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../../toolkit/content/contentAreaUtils.js */
/* import-globals-from utilityOverlay.js */

/* globals getMessagePaneBrowser */ // From aboutMessage.js

var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);
XPCOMUtils.defineLazyModuleGetters(this, {
  PhishingDetector: "resource:///modules/PhishingDetector.jsm",
});
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

var { openLinkExternally } = ChromeUtils.importESModule(
  "resource:///modules/LinkHelper.sys.mjs"
);
/**
 * Extract the href from the link click event.
 * We look for HTMLAnchorElement, HTMLAreaElement, HTMLLinkElement,
 * HTMLInputElement.form.action, and nested anchor tags.
 * If the clicked element was a HTMLInputElement or HTMLButtonElement
 * we return the form action.
 *
 * @returns [href, linkText] the url and the text for the link being clicked.
 */
function hRefForClickEvent(aEvent, aDontCheckInputElement) {
  const target =
    aEvent.type == "command"
      ? document.commandDispatcher.focusedElement
      : aEvent.target;

  if (
    HTMLImageElement.isInstance(target) &&
    target.hasAttribute("overflowing")
  ) {
    // Click on zoomed image.
    return [null, null];
  }

  let href = null;
  let linkText = null;
  if (
    HTMLAnchorElement.isInstance(target) ||
    HTMLAreaElement.isInstance(target) ||
    HTMLLinkElement.isInstance(target)
  ) {
    if (target.hasAttribute("href")) {
      href = target.href;
      linkText = gatherTextUnder(target);
    }
  } else if (
    !aDontCheckInputElement &&
    (HTMLInputElement.isInstance(target) ||
      HTMLButtonElement.isInstance(target))
  ) {
    if (target.form && target.form.action) {
      href = target.form.action;
    }
  } else {
    // We may be nested inside of a link node.
    let linkNode = aEvent.target;
    while (linkNode && !HTMLAnchorElement.isInstance(linkNode)) {
      linkNode = linkNode.parentNode;
    }

    if (linkNode) {
      href = linkNode.href;
      linkText = gatherTextUnder(linkNode);
    }
  }
  return [href, linkText];
}

/**
 * Check whether the click target's or its ancestor's href
 * points to an anchor on the page.
 *
 * @param HTMLElement aTargetNode - the element node.
 * @returns - true if link pointing to anchor.
 */
function isLinkToAnchorOnPage(aTargetNode) {
  const url = aTargetNode.ownerDocument.URL;
  if (!url.startsWith("http")) {
    return false;
  }

  let linkNode = aTargetNode;
  while (linkNode && !HTMLAnchorElement.isInstance(linkNode)) {
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
  const target = aEvent.target;
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

  const [href, linkText] = hRefForClickEvent(aEvent);

  if (!href && !aEvent.button) {
    // Is this an image that we might want to scale?

    if (HTMLImageElement.isInstance(target)) {
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
  const uri = makeURI(href);
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
  const urlPhishCheckResult = PhishingDetector.warnOnSuspiciousLinkClick(
    window,
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
