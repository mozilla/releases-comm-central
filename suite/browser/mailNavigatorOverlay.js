/* -*- Mode: javascript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var gUseExternalMailto;

// attachment: 0 - link
//             1 - page
//             2 - image
function openComposeWindow(url, title, attachment, charset)
{
  if (gUseExternalMailto)
  {
    openExternalMailer(url, title);
  }
  else
  {
    var params = Cc["@mozilla.org/messengercompose/composeparams;1"]
                   .createInstance(Ci.nsIMsgComposeParams);

    params.composeFields = Cc["@mozilla.org/messengercompose/composefields;1"]
                             .createInstance(Ci.nsIMsgCompFields);
    if (attachment == 0 || attachment == 1)
    {
      params.composeFields.body = url;
      params.composeFields.subject = title;
      params.bodyIsLink = true;
    }

    if (attachment == 1 || attachment == 2)
    {
      var attachmentData = Cc["@mozilla.org/messengercompose/attachment;1"]
                             .createInstance(Ci.nsIMsgAttachment);
      attachmentData.url = url;
      attachmentData.urlCharset = charset;
      params.composeFields.addAttachment(attachmentData);
    }

    var composeService = Cc["@mozilla.org/messengercompose;1"]
                           .getService(Ci.nsIMsgComposeService);

    // it is possible you won't have a default identity
    // like if you've never launched mail before on a new profile.
    // see bug #196073
    try
    {
      params.identity = composeService.defaultIdentity;
    }
    catch (ex)
    {
      params.identity = null;
    }

    composeService.OpenComposeWindowWithParams(null, params);
  }
}

function openExternalMailer(url, title) {
  var extProtocolSvc = Cc["@mozilla.org/uriloader/external-protocol-service;1"]
                         .getService(Ci.nsIExternalProtocolService);
  var mailto = url ? "mailto:?body=" + encodeURIComponent(url)
                                     + "&subject="
                                     + encodeURIComponent(title) : "mailto:";
  var uri = Services.io.newURI(mailto);

  extProtocolSvc.loadURI(uri);
}

function openNewCardDialog()
{
  window.openDialog("chrome://messenger/content/addressbook/abNewCardDialog.xul",
                    "", "chrome,modal,resizable=no,centerscreen");
}

function goOpenNewMessage()
{
  if (gUseExternalMailto)
  {
    openExternalMailer();
  }
  else if ("MsgNewMessage" in window)
  {
    MsgNewMessage(null);
  }
  else
  {
    var msgComposeService = Cc["@mozilla.org/messengercompose;1"]
                              .getService(Ci.nsIMsgComposeService);
    msgComposeService.OpenComposeWindow(null, null, null,
                                       Ci.nsIMsgCompType.New,
                                       Ci.nsIMsgCompFormat.Default,
                                       null, null, null);
  }
}

function sendLink(aURL)
{
  var title = "";
  if (!aURL)
  {
    aURL = window.content.document.URL;
    title = window.content.document.title;
  }
  try
  {
    openComposeWindow(aURL, title, 0, null);
  }
  catch(ex)
  {
    dump("Cannot Send Link: " + ex + "\n");
  }
}

function sendMedia(mediaURL)
{
  try
  {
    var charset = getCharsetforSave(null);
    openComposeWindow(mediaURL, null, 2, charset);
  }
  catch(ex)
  {
    dump("Cannot Send Media: " + ex + "\n");
  }
}

function sendPage(aDocument)
{
  if (!aDocument)
    aDocument = window.content.document;

  try
  {
    var charset = getCharsetforSave(aDocument);
    openComposeWindow(aDocument.URL, aDocument.title, 1, charset);
  }
  catch(ex)
  {
    dump("Cannot Send Page: " + ex + "\n");
  }
}

function initMailContextMenuItems(aEvent)
{
  var shouldShowSendPage = !(gContextMenu.onTextInput || gContextMenu.isContentSelected ||
                           gContextMenu.onVideo || gContextMenu.onAudio) &&
                           !gContextMenu.onLink &&
                           !gUseExternalMailto;
  gContextMenu.showItem("context-sendpage", shouldShowSendPage);

  gContextMenu.showItem("context-sep-apps", gContextMenu.shouldShowSeparator("context-sep-apps"));
}

function initMailContextMenuPopupListener(aEvent)
{
  var popup = document.getElementById("contentAreaContextMenu");
  if (popup)
    popup.addEventListener("popupshowing", initMailContextMenuItems);
}

function hideMenuitems() {
  document.getElementById("menu_newCard").hidden = gUseExternalMailto;
  var menu_sendPage = document.getElementById("menu_sendPage");
  if (menu_sendPage)
    menu_sendPage.hidden = gUseExternalMailto;
}

function initOverlay(aEvent) {
  gUseExternalMailto = Services.io.getProtocolHandler("mailto") instanceof
                         Ci.nsIExternalProtocolHandler;
  initMailContextMenuPopupListener(aEvent);
  hideMenuitems();
}

addEventListener("load", initOverlay, false);
