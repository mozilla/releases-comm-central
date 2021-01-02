// /* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * - [ Dependencies ] ---------------------------------------------------------
 *  utilityOverlay.js:
 *    - gatherTextUnder
 */

  function hrefAndLinkNodeForClickEvent(event)
  {
    var href = "";
    var isKeyCommand = (event.type == "command");
    var linkNode = isKeyCommand ? document.commandDispatcher.focusedElement
                                : event.originalTarget;

    while (linkNode instanceof Element) {
      if (linkNode instanceof HTMLAnchorElement ||
          linkNode instanceof HTMLAreaElement ||
          linkNode instanceof HTMLLinkElement) {
        href = linkNode.href;
        if (href)
          break;
      }
      // Try MathML href
      else if (linkNode.namespaceURI == "http://www.w3.org/1998/Math/MathML" &&
               linkNode.hasAttribute("href")) {
        href = linkNode.getAttribute("href");
        href = makeURLAbsolute(linkNode.baseURI, href);
        break;
      }
      // Try simple XLink
      else if (linkNode.hasAttributeNS("http://www.w3.org/1999/xlink", "href")) {
        href = linkNode.getAttributeNS("http://www.w3.org/1999/xlink", "href");
        href = makeURLAbsolute(linkNode.baseURI, href);
        break;
      }
      linkNode = linkNode.parentNode;
    }

    return href ? {href: href, linkNode: linkNode} : null;
  }

  // Called whenever the user clicks in the content area,
  // except when left-clicking on links (special case)
  // should always return true for click to go through
  function contentAreaClick(event)
  {
    if (!event.isTrusted || event.defaultPrevented) {
      return true;
    }

    var isKeyCommand = (event.type == "command");
    var ceParams = hrefAndLinkNodeForClickEvent(event);
    if (ceParams) {
      var href = ceParams.href;
      if (isKeyCommand) {
        var doc = event.target.ownerDocument;
        urlSecurityCheck(href, doc.nodePrincipal);
        openLinkIn(href, event && event.altKey ? "tabshifted" : "tab",
                   { charset: doc.characterSet,
                     referrerURI: doc.documentURIObject });
        event.stopPropagation();
      }
      else {
        // if in mailnews block the link left click if we determine
        // that this URL is phishy (i.e. a potential email scam)
        if ("gMessengerBundle" in this && event.button < 2 &&
            isPhishingURL(ceParams.linkNode, false, href))
          return false;
        handleLinkClick(event, href, ceParams.linkNode);

        // Mark the page as a user followed link.  This is done so that history can
        // distinguish automatic embed visits from user activated ones.  For example
        // pages loaded in frames are embed visits and lost with the session, while
        // visits across frames should be preserved.
        try {
          PlacesUIUtils.markPageAsFollowedLink(href);
        } catch (ex) { /* Skip invalid URIs. */ }
      }
      return true;
    }

    if (!isKeyCommand && event.button == 1 &&
        Services.prefs.getBoolPref("middlemouse.contentLoadURL") &&
        !Services.prefs.getBoolPref("general.autoScroll")) {
      middleMousePaste(event);
    }

    return true;
  }

function handleLinkClick(event, href, linkNode) {
  if (event.button == 2) // right click
    return false;

  var where = whereToOpenLink(event);
  if (where == "current")
    return false;

  var doc = event.target.ownerDocument;

  if (where == "save") {
    saveURL(href, linkNode ? gatherTextUnder(linkNode) : "", null, false,
            true, doc.documentURIObject, doc);
    event.preventDefault();
    return true;
  }

  var referrerURI = doc.documentURIObject;
  // if the mixedContentChannel is present and the referring URI passes
  // a same origin check with the target URI, we can preserve the users
  // decision of disabling MCB on a page for it's child tabs.
  var persistAllowMixedContentInChildTab = false;

  if (where == "tab" && getBrowser().docShell.mixedContentChannel) {
    const sm = Services.scriptSecurityManager;
    try {
      var targetURI = makeURI(href);
      sm.checkSameOriginURI(referrerURI, targetURI, false);
      persistAllowMixedContentInChildTab = true;
    }
    catch (e) { }
  }

  urlSecurityCheck(href, doc.nodePrincipal);
  let params = {
    charset: doc.characterSet,
    private: gPrivate ? true : false,
    allowMixedContent: persistAllowMixedContentInChildTab,
    referrerURI: referrerURI,
    noReferrer: BrowserUtils.linkHasNoReferrer(linkNode),
    originPrincipal: doc.nodePrincipal,
    triggeringPrincipal: doc.nodePrincipal,
  };

  // The new tab/window must use the same userContextId
  if (doc.nodePrincipal.originAttributes.userContextId) {
    params.userContextId = doc.nodePrincipal.originAttributes.userContextId;
  }

  openLinkIn(href, where, params);
  event.preventDefault();
  return true;
}

  function middleMousePaste(event) {

    let clipboard = readFromClipboard();

    if (!clipboard)
      return;

    // Strip embedded newlines and surrounding whitespace, to match the URL
    // bar's behavior (stripsurroundingwhitespace).
    clipboard = clipboard.replace(/\s*\n\s*/g, "");

    clipboard = stripUnsafeProtocolOnPaste(clipboard);

    // If its not the current tab, we don't need to do anything because the
    // browser doesn't exist.
    let where = whereToOpenLink(event, true, false);
    let lastLocationChange;
    if (where == "current") {
        lastLocationChange = gBrowser.selectedBrowser.lastLocationChange;
    }

    getShortcutOrURIAndPostData(clipboard).then(data => {
      try {
        makeURI(data.url);
      } catch (ex) {
        // Not a valid URI.
        return;
      }

      try {
        addToUrlbarHistory(data.url);
      } catch (ex) {
        // Things may go wrong when adding url to session history,
        // but don't let that interfere with the loading of the url.
        Cu.reportError(ex);
      }

      if (where != "current" ||
          lastLocationChange == gBrowser.selectedBrowser.lastLocationChange) {
        openUILink(data.url, event,
                   { ignoreButton: true,
                     disallowInheritPrincipal: !data.mayInheritPrincipal });
      }
    });

    event.stopPropagation();
  }

  function stripUnsafeProtocolOnPaste(pasteData) {
    // Don't allow pasting javascript URIs since we don't support
    // LOAD_FLAGS_DISALLOW_INHERIT_PRINCIPAL for those.
    let changed = false;
    let pasteDataNoJS = pasteData.replace(/\r?\n/g, "")
                                 .replace(/^(?:\s*javascript:)+/i,
                                          () => { changed = true;
                                                  return ""; });
    return changed ? pasteDataNoJS : pasteData;
  }

  function addToUrlbarHistory(aUrlToAdd)
  {
    if (gPrivate)
      return;

    if (!Services.prefs.getBoolPref("browser.urlbar.historyEnabled"))
      return;

    // Remove leading and trailing spaces first.
    aUrlToAdd = aUrlToAdd.trim();

    if (!aUrlToAdd)
      return;
    // Don't store bad URLs.
    if (aUrlToAdd.search(/[\x00-\x1F]/) != -1) 
      return;

    getShortcutOrURIAndPostData(aUrlToAdd).then(data => {
      var fixedUpURI = Services.uriFixup.createFixupURI(data.url, 0);
      if (!fixedUpURI.schemeIs("data"))
        PlacesUtils.history.markPageAsTyped(fixedUpURI);
    }).catch(() => {});

    // Open or create the urlbar history database.
    var file = GetUrlbarHistoryFile();
    var connection = Services.storage.openDatabase(file);
    connection.beginTransaction();
    if (!connection.tableExists("urlbarhistory"))
      connection.createTable("urlbarhistory", "url TEXT");

    // If the URL is already present in the database then remove it from
    // its current position. It is then reinserted at the top of the list.
    var statement = connection.createStatement(
        "DELETE FROM urlbarhistory WHERE LOWER(url) = LOWER(?1)");
    statement.bindByIndex(0, aUrlToAdd);
    statement.execute();
    statement.finalize();

    // Put the value as it was typed by the user in to urlbar history.
    statement = connection.createStatement(
        "INSERT INTO urlbarhistory (url) VALUES (?1)");
    statement.bindByIndex(0, aUrlToAdd);
    statement.execute();
    statement.finalize();

    // Remove any expired history items so that we don't let
    // this grow without bound.
    connection.executeSimpleSQL(
        "DELETE FROM urlbarhistory WHERE ROWID NOT IN " +
          "(SELECT ROWID FROM urlbarhistory ORDER BY ROWID DESC LIMIT 30)");
    connection.commitTransaction();
    connection.close();
  }
