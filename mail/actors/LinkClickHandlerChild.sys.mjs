/* vim: set ts=2 sw=2 et tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  BrowserUtils: "resource://gre/modules/BrowserUtils.sys.mjs",
});

XPCOMUtils.defineLazyServiceGetter(
  lazy,
  "protocolSvc",
  "@mozilla.org/uriloader/external-protocol-service;1",
  "nsIExternalProtocolService"
);

/**
 * Extract the target from the link node and determine, if the link can be
 * navigated to directly, or needs to be opened in a new tab.
 *
 * @param {?DOMNode} linkNode
 * @param {DOMWindow} window - the window which initiated the actor event
 *
 * @returns {boolean}
 */
function canNavigate(linkNode, window) {
  const target = linkNode?.getAttribute("target");
  if (!target) {
    return true;
  }
  if (window.windowGlobalChild.findBrowsingContextWithName(target)) {
    return true;
  }
  return false;
}

/**
 * Listens for click events and, if the click would result in loading a page
 * on a different base domain from the current page, cancels the click event,
 * redirecting the URI to an external browser, effectively creating a
 * single-site browser.
 *
 * This actor applies to browsers in the "single-site" message manager group.
 */
export class LinkClickHandlerChild extends JSWindowActorChild {
  handleEvent(event) {
    // Don't handle events that:
    //   a) are in the parent process (handled by onclick),
    //   b) aren't trusted,
    //   c) have already been handled or
    //   d) aren't left-click.
    if (
      this.manager.isInProcess ||
      !event.isTrusted ||
      event.defaultPrevented ||
      event.button
    ) {
      return;
    }

    const [eventHRef, linkNode] =
      lazy.BrowserUtils.hrefAndLinkNodeForClickEvent(event) || [];
    if (!eventHRef) {
      return;
    }

    const pageURI = Services.io.newURI(this.document.location.href);
    const eventURI = Services.io.newURI(eventHRef);

    try {
      // Avoid using the eTLD service, and this also works for IP addresses.
      if (pageURI.host == eventURI.host) {
        if (!canNavigate(linkNode, this.contentWindow)) {
          event.preventDefault();
          this.sendAsyncMessage("openLinkInNewTab", {
            url: eventHRef,
            refererTopBrowsingContextId: this.browsingContext.top.id,
          });
        }
        return;
      }

      try {
        if (
          Services.eTLD.getBaseDomain(eventURI) ==
          Services.eTLD.getBaseDomain(pageURI)
        ) {
          if (!canNavigate(linkNode, this.contentWindow)) {
            event.preventDefault();
            this.sendAsyncMessage("openLinkInNewTab", {
              url: eventHRef,
              refererTopBrowsingContextId: this.browsingContext.top.id,
            });
          }
          return;
        }
      } catch (ex) {
        if (ex.result != Cr.NS_ERROR_HOST_IS_IP_ADDRESS) {
          console.error(ex);
        }
      }
    } catch (ex) {
      // The page or link might be from a host-less URL scheme such as about,
      // blob, or data. The host is never going to match, carry on.
    }

    if (
      !lazy.protocolSvc.isExposedProtocol(eventURI.scheme) ||
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
export class StrictLinkClickHandlerChild extends JSWindowActorChild {
  handleEvent(event) {
    // Don't handle events that:
    //   a) are in the parent process (handled by onclick),
    //   b) aren't trusted,
    //   c) have already been handled or
    //   d) aren't left-click.
    if (
      this.manager.isInProcess ||
      !event.isTrusted ||
      event.defaultPrevented ||
      event.button
    ) {
      return;
    }

    const [eventHRef, linkNode] =
      lazy.BrowserUtils.hrefAndLinkNodeForClickEvent(event) || [];
    if (!eventHRef) {
      return;
    }

    const pageURI = Services.io.newURI(this.document.location.href);
    const eventURI = Services.io.newURI(eventHRef);
    if (eventURI.specIgnoringRef == pageURI.specIgnoringRef) {
      if (!canNavigate(linkNode, this.contentWindow)) {
        event.preventDefault();
        this.sendAsyncMessage("openLinkInNewTab", {
          url: eventHRef,
          refererTopBrowsingContextId: this.browsingContext.top.id,
        });
      }
      return;
    }

    if (
      !lazy.protocolSvc.isExposedProtocol(eventURI.scheme) ||
      eventURI.schemeIs("http") ||
      eventURI.schemeIs("https")
    ) {
      event.preventDefault();
      this.sendAsyncMessage("openLinkExternally", eventHRef);
    }
  }
}
