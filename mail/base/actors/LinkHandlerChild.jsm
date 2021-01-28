/* vim: set ts=2 sw=2 et tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const EXPORTED_SYMBOLS = ["LinkHandlerChild", "StrictLinkHandlerChild"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  Services: "resource://gre/modules/Services.jsm",
});
XPCOMUtils.defineLazyServiceGetter(
  this,
  "protocolSvc",
  "@mozilla.org/uriloader/external-protocol-service;1",
  "nsIExternalProtocolService"
);

const MESSAGE_PROTOCOLS = ["imap", "mailbox", "news", "nntp", "snews"];

/**
 * Extract the href from the link click event.
 * We look for HTMLAnchorElement, HTMLAreaElement, HTMLLinkElement,
 * HTMLInputElement.form.action, and nested anchor tags.
 * If the clicked element was a HTMLInputElement or HTMLButtonElement
 * we return the form action.
 *
 * @return the url and the text for the link being clicked.
 */
function hRefForClickEvent(aEvent) {
  let target = aEvent.target;

  if (
    target instanceof HTMLImageElement &&
    target.hasAttribute("overflowing")
  ) {
    // Click on zoomed image.
    return [null, null];
  }

  let href = null;
  if (
    target instanceof HTMLAnchorElement ||
    target instanceof HTMLAreaElement ||
    target instanceof HTMLLinkElement
  ) {
    if (target.hasAttribute("href")) {
      href = target.href;
    }
  } else {
    // We may be nested inside of a link node.
    let linkNode = aEvent.originalTarget;
    while (linkNode && !(linkNode instanceof HTMLAnchorElement)) {
      linkNode = linkNode.parentNode;
    }

    if (linkNode) {
      href = linkNode.href;
    }
  }
  return href;
}

/**
 * Listens for click events and, if the click would result in loading a page
 * on a different base domain from the current page, cancels the click event,
 * redirecting the URI to an external browser, effectively creating a
 * single-site browser.
 *
 * This actor applies to browsers in the "single-site" message manager group.
 */
class LinkHandlerChild extends JSWindowActorChild {
  handleEvent(event) {
    // Don't handle events that: a) aren't trusted, b) have already been
    // handled or c) aren't left-click.
    if (!event.isTrusted || event.defaultPrevented || event.button) {
      return;
    }

    // Link handling in mail messages is handled elsewhere.
    let pageURI = Services.io.newURI(this.document.location.href);
    if (MESSAGE_PROTOCOLS.includes(pageURI.scheme)) {
      return;
    }

    let eventHRef = hRefForClickEvent(event);
    if (!eventHRef) {
      return;
    }

    let eventURI = Services.io.newURI(eventHRef);

    if (pageURI.host == eventURI.host) {
      // Avoid using the eTLD service, and this also works for IP addresses.
      return;
    }

    try {
      if (
        Services.eTLD.getBaseDomain(eventURI) ==
        Services.eTLD.getBaseDomain(pageURI)
      ) {
        return;
      }
    } catch (ex) {
      if (ex.result != Cr.NS_ERROR_HOST_IS_IP_ADDRESS) {
        Cu.reportError(ex);
      }
    }

    if (
      !protocolSvc.isExposedProtocol(eventURI.scheme) ||
      eventURI.schemeIs("http") ||
      eventURI.schemeIs("https")
    ) {
      event.preventDefault();
      this.sendAsyncMessage("openLinkExternally", eventHRef);
    }
  }
}

/**
 * Listens for click events and, if the click would result in loading a
 * different page from the current page, cancels the click event, redirecting
 * the URI to an external browser, effectively creating a single-page browser.
 *
 * This actor applies to browsers in the "single-page" message manager group.
 */
class StrictLinkHandlerChild extends JSWindowActorChild {
  handleEvent(event) {
    // Don't handle events that: a) aren't trusted, b) have already been
    // handled or c) aren't left-click.
    if (!event.isTrusted || event.defaultPrevented || event.button) {
      return;
    }

    // Link handling in mail messages is handled elsewhere.
    let pageURI = Services.io.newURI(this.document.location.href);
    if (MESSAGE_PROTOCOLS.includes(pageURI.scheme)) {
      return;
    }

    let eventHRef = hRefForClickEvent(event);
    if (!eventHRef) {
      return;
    }

    let eventURI = Services.io.newURI(eventHRef);
    if (eventURI.specIgnoringRef == pageURI.specIgnoringRef) {
      return;
    }

    if (
      !protocolSvc.isExposedProtocol(eventURI.scheme) ||
      eventURI.schemeIs("http") ||
      eventURI.schemeIs("https")
    ) {
      event.preventDefault();
      this.sendAsyncMessage("openLinkExternally", eventHRef);
    }
  }
}
