/** ***** BEGIN LICENSE BLOCK *****
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

  /**
   * Extract the href from the link click event.
   * We look for HTMLAnchorElement, HTMLAreaElement, HTMLLinkElement,
   * HTMLInputElement.form.action, and nested anchor tags.
   *
   * @return href for the url being clicked
   */

  Components.utils.import("resource://gre/modules/PlacesUtils.jsm");
  Components.utils.import("resource://gre/modules/Services.jsm");

  function hRefForClickEvent(aEvent, aDontCheckInputElement)
  {
    var href;
    var isKeyCommand = (aEvent.type == "command");
    var target =
      isKeyCommand ? document.commandDispatcher.focusedElement : aEvent.target;

    if (target instanceof HTMLAnchorElement ||
        target instanceof HTMLAreaElement   ||
        target instanceof HTMLLinkElement)
    {
      if (target.hasAttribute("href"))
        href = target.href;
    }
    else if (target instanceof HTMLImageElement &&
             target.hasAttribute("overflowing"))
    {
      // Return if an image is zoomed, otherwise fall through to see if it has
      // a link node.
      return href;
    }
    else if (!aDontCheckInputElement && target instanceof HTMLInputElement)
    {
      if (target.form && target.form.action)
        href = target.form.action;
    }
    else
    {
      // We may be nested inside of a link node.
      var linkNode = aEvent.originalTarget;
      while (linkNode && !(linkNode instanceof HTMLAnchorElement))
        linkNode = linkNode.parentNode;

      if (linkNode)
        href = linkNode.href;
    }

    return href;
  }

function messagePaneOnResize(aEvent)
{
  // Scale any overflowing images, exclude http content.
  let browser = getBrowser();
  let doc = browser && browser.contentDocument ? browser.contentDocument : null;
  if (!doc || doc.URL.startsWith("http") || !doc.images)
    return;

  for (let img of doc.images)
  {
    if (img.clientWidth - doc.body.offsetWidth >= 0 &&
        (img.clientWidth <= img.naturalWidth || !img.naturalWidth))
      img.setAttribute("overflowing", true);
    else
      img.removeAttribute("overflowing");
  }
}

// Called whenever the user clicks in the content area,
// should always return true for click to go through.
function contentAreaClick(aEvent)
{
  let href = hRefForClickEvent(aEvent);

  if (!href && !aEvent.button) {
    var target = aEvent.target;
    // Is this an image that we might want to scale?
    const Ci = Components.interfaces;

    if (target instanceof Ci.nsIImageLoadingContent) {
      // Make sure it loaded successfully. No action if not or a broken link.
      var req = target.getRequest(Ci.nsIImageLoadingContent.CURRENT_REQUEST);
      if (!req || req.imageStatus & Ci.imgIRequest.STATUS_ERROR)
        return false;

      // Is it an image?
      if (target.localName == "img" && target.hasAttribute("overflowing")) {
        if (target.hasAttribute("shrinktofit"))
          // Currently shrunk to fit, so unshrink it.
          target.removeAttribute("shrinktofit");
        else
          // User wants to shrink now.
          target.setAttribute("shrinktofit", true);

        return false;
      }
    }
    return true;
  }

  if (!href || aEvent.button == 2)
    return true;

  // We want all about, http and https links in the message pane to be loaded
  // externally in a browser, therefore we need to detect that here and redirect
  // as necessary.
  let uri = makeURI(href);
  if (Components.classes["@mozilla.org/uriloader/external-protocol-service;1"]
                .getService(Components.interfaces.nsIExternalProtocolService)
                .isExposedProtocol(uri.scheme) &&
      !uri.schemeIs("http") && !uri.schemeIs("https"))
    return true;

  // Now we're here, we know this should be loaded in an external browser, so
  // prevent the default action so we don't try and load it here.
  aEvent.preventDefault();

  // Let the phishing detector check the link.
  if (!gPhishingDetector.warnOnSuspiciousLinkClick(href))
    return false;

  openLinkExternally(href);
  return true;
}

/**
 * Forces a url to open in an external application according to the protocol
 * service settings.
 *
 * @param url  A url string or an nsIURI containing the url to open.
 */
function openLinkExternally(url)
{
  let uri = url;
  if (!(uri instanceof Components.interfaces.nsIURI))
    uri = Services.io.newURI(url, null, null);

  PlacesUtils.asyncHistory.updatePlaces({
    uri: uri,
    visits:  [{
      visitDate: Date.now() * 1000,
      transitionType: Components.interfaces.nsINavHistoryService.TRANSITION_LINK
    }]
  });

  Components.classes["@mozilla.org/uriloader/external-protocol-service;1"]
            .getService(Components.interfaces.nsIExternalProtocolService)
            .loadUrl(uri);
}
