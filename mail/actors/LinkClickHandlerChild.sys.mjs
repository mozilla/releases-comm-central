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
  Ci.nsIExternalProtocolService
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
    //   a) aren't trusted,
    //   b) have already been handled or
    //   c) aren't left-click.
    if (!event.isTrusted || event.defaultPrevented || event.button) {
      return;
    }

    const [href, linkNode] =
      lazy.BrowserUtils.hrefAndLinkNodeForClickEvent(event) || [];
    if (!href) {
      return;
    }

    const pageURI = Services.io.newURI(this.document.location.href);
    const eventURI = Services.io.newURI(href);

    if (event.target.ownerSVGElement) {
      if (
        !lazy.protocolSvc.isExposedProtocol(eventURI.scheme) ||
        eventURI.schemeIs("http") ||
        eventURI.schemeIs("https")
      ) {
        event.preventDefault();
        this.sendAsyncMessage("openLinkExternally", { href });
      }
      return;
    }
    try {
      // Avoid using the eTLD service, and this also works for IP addresses.
      if (pageURI.host == eventURI.host) {
        if (!canNavigate(linkNode, this.contentWindow)) {
          event.preventDefault();
          this.sendAsyncMessage("openLinkInNewTab", { href });
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
            this.sendAsyncMessage("openLinkInNewTab", { href });
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
      this.sendAsyncMessage("openLinkExternally", { href });
    }
  }
}

/**
 * Listens for click events and check the requested target and, if the target
 * does not exist on the current page, open the link in a new tab.
 *
 * This actor applies to browsers in the "browsers" message manager group.
 */
export class RelaxedLinkClickHandlerChild extends JSWindowActorChild {
  handleEvent(event) {
    // Don't handle events that:
    //   a) aren't trusted,
    //   b) have already been handled or
    //   c) aren't left-click.
    if (!event.isTrusted || event.defaultPrevented || event.button) {
      return;
    }

    const [href, linkNode] =
      lazy.BrowserUtils.hrefAndLinkNodeForClickEvent(event) || [];
    if (!href) {
      return;
    }

    if (event.target.ownerSVGElement) {
      const eventURI = Services.io.newURI(href);
      if (
        !lazy.protocolSvc.isExposedProtocol(eventURI.scheme) ||
        eventURI.schemeIs("http") ||
        eventURI.schemeIs("https")
      ) {
        event.preventDefault();
        this.sendAsyncMessage("openLinkExternally", { href });
      }
      return;
    }

    if (!canNavigate(linkNode, this.contentWindow)) {
      event.preventDefault();
      this.sendAsyncMessage("openLinkInNewTab", { href });
    }
  }
}

/**
 * Listens for click events and, if the click would result in loading a
 * different page from the current page, cancels the click event, redirecting
 * the URI to an external browser, effectively creating a single-page browser.
 *
 * This actor applies to browsers in the "mail-message" and "single-page"
 * message manager groups.
 */
export class StrictLinkClickHandlerChild extends JSWindowActorChild {
  handleEvent(event) {
    // Don't handle events that:
    //   a) aren't trusted,
    //   b) have already been handled or
    //   c) aren't left-click.
    if (!event.isTrusted || event.defaultPrevented || event.button) {
      return;
    }

    const [href, linkNode] =
      lazy.BrowserUtils.hrefAndLinkNodeForClickEvent(event) || [];
    if (!href) {
      return;
    }

    const pageURI = Services.io.newURI(this.document.location.href);
    const eventURI = Services.io.newURI(href);
    if (eventURI.specIgnoringRef == pageURI.specIgnoringRef) {
      if (!canNavigate(linkNode, this.contentWindow)) {
        event.preventDefault();
        this.sendAsyncMessage("openLinkInNewTab", {
          href,
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
      const labelNode = linkNode || event.target;
      const linkText = labelNode && gatherTextUnder(labelNode);
      this.sendAsyncMessage("openLinkExternally", { href, linkText });
    }
  }
}

/**
 * Gather all descendent text under given node.
 *
 * @param {Node} root - The root node to gather text from.
 * @returns {string} The text data under the node.
 */
function gatherTextUnder(root) {
  let text = "";
  let node = root.firstChild;
  let depth = 1;
  while (node && depth > 0) {
    // See if this node is text.
    if (node.nodeType == Node.TEXT_NODE) {
      // Add this text to our collection.
      text += " " + node.data;
    } else if (HTMLImageElement.isInstance(node)) {
      // If it has an alt= attribute, add that.
      const altText = node.getAttribute("alt");
      if (altText && altText != "") {
        text += " " + altText;
      }
    }
    // Find next node to test.
    if (node.firstChild) {
      // If it has children, go to first child.
      node = node.firstChild;
      depth++;
    } else if (node.nextSibling) {
      // No children, try next sibling.
      node = node.nextSibling;
    } else {
      // Last resort is a sibling of an ancestor.
      while (node && depth > 0) {
        node = node.parentNode;
        depth--;
        if (node.nextSibling) {
          node = node.nextSibling;
          break;
        }
      }
    }
  }
  // Strip leading and trailing whitespace.
  text = text.trim();
  // Compress remaining whitespace.
  text = text.replace(/\s+/g, " ");
  return text;
}
