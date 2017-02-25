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
        openNewTabWith(href, event.target, event.altKey);
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

  function openNewTabOrWindow(event, href, node)
  {
    // should we open it in a new tab?
    if (Services.prefs.getBoolPref("browser.tabs.opentabfor.middleclick")) {
      openNewTabWith(href, node, null, event);
      event.stopPropagation();
      return true;
    }

    // should we open it in a new window?
    if (Services.prefs.getBoolPref("middlemouse.openNewWindow")) {
      if (gPrivate)
        openNewPrivateWith(href, node);
      else
        openNewWindowWith(href, node);
      event.stopPropagation();
      return true;
    }

    // let someone else deal with it
    return false;
  }

  function handleLinkClick(event, href, linkNode)
  {
    // Checking to make sure we are allowed to open this URL
    // (call to urlSecurityCheck) is now done within openNew... functions

    switch (event.button) {
      case 0:                                                         // if left button clicked
        if (event.metaKey || event.ctrlKey) {                         // and meta or ctrl are down
          if (openNewTabOrWindow(event, href, linkNode))
            return true;
        }
        var saveModifier = GetBoolPref("ui.key.saveLink.shift", true);
        saveModifier = saveModifier ? event.shiftKey : event.altKey;

        if (saveModifier) {                                           // if saveModifier is down
          var doc = linkNode.ownerDocument;
          saveURL(href, gatherTextUnder(linkNode), "SaveLinkTitle",
                  false, true, doc.documentURIObject, doc);
          return true;
        }
        if (event.altKey)                                             // if alt is down
          return true;                                                // do nothing
        return false;
      case 1:                                                         // if middle button clicked
        if (openNewTabOrWindow(event, href, linkNode))
          return true;
        break;
    }
    return false;
  }

  var gURIFixup = null;

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
        Components.utils.reportError(ex);
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

    if (!gURIFixup)
      gURIFixup = Components.classes["@mozilla.org/docshell/urifixup;1"]
                            .getService(Components.interfaces.nsIURIFixup);

    getShortcutOrURIAndPostData(aUrlToAdd).then(data => {
      var fixedUpURI = gURIFixup.createFixupURI(data.url, 0);
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
