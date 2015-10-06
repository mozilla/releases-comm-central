/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://gre/modules/Services.jsm");

function GetNewMessages(selectedFolders, server)
{
  if (!selectedFolders.length)
    return;

  var msgFolder = selectedFolders[0];

  // Whenever we do get new messages, clear the old new messages.
  if (msgFolder)
  {
    var nsIMsgFolder = Components.interfaces.nsIMsgFolder;
    msgFolder.biffState = nsIMsgFolder.nsMsgBiffState_NoMail;
    msgFolder.clearNewMessages();
  }
  server.getNewMessages(msgFolder, msgWindow, null);
}

/**
 * Get the identity that most likely is the best one to use, given the hint.
 * @param identities nsISupportsArray<nsIMsgIdentity> of identities
 * @param optionalHint string containing comma separated mailboxes
 */
function getBestIdentity(identities, optionalHint)
{
  let identityCount = identities.length;
  if (identityCount < 1)
    return null;

  // If we have more than one identity and a hint to help us pick one.
  if (identityCount > 1 && optionalHint) {
    // Normalize case on the optional hint to improve our chances of
    // finding a match.
    let hints = optionalHint.toLowerCase().split(",");

    for (let i = 0 ; i < hints.length; i++) {
      for (let identity in fixIterator(identities,
                  Components.interfaces.nsIMsgIdentity)) {
        if (!identity.email)
          continue;
        if (hints[i].trim() == identity.email.toLowerCase() ||
            hints[i].includes("<" + identity.email.toLowerCase() + ">"))
          return identity;
      }
    }
  }
  // Return only found identity or pick the first one from list if no matches found.
  return identities.queryElementAt(0, Components.interfaces.nsIMsgIdentity);
}

function getIdentityForServer(server, optionalHint)
{
  var identities = accountManager.getIdentitiesForServer(server);
  return getBestIdentity(identities, optionalHint);
}

/**
 * Get the identity for the given header.
 * @param hdr nsIMsgHdr message header
 * @param type nsIMsgCompType compose type the identity ise used for.
 */

function GetIdentityForHeader(aMsgHdr, aType)
{
  function findDeliveredToIdentityEmail() {
    // Get the delivered-to headers.
    let key = "delivered-to";
    let deliveredTos = new Array();
    let index = 0;
    let header = "";
    while (currentHeaderData[key]) {
      deliveredTos.push(currentHeaderData[key].headerValue.toLowerCase().trim());
      key = "delivered-to" + index++;
    }

    // Reverse the array so that the last delivered-to header will show at front.
    deliveredTos.reverse();
    for (let i = 0; i < deliveredTos.length; i++) {
      for (let identity in fixIterator(accountManager.allIdentities,
                                  Components.interfaces.nsIMsgIdentity)) {
        if (!identity.email)
          continue;
        // If the deliver-to header contains the defined identity, that's it.
        if (deliveredTos[i] == identity.email.toLowerCase() ||
            deliveredTos[i].includes("<" + identity.email.toLowerCase() + ">"))
          return identity.email;
      }
    }
    return "";
  }

  let hintForIdentity = "";
  if (aType == Components.interfaces.nsIMsgCompType.ReplyToList)
    hintForIdentity = findDeliveredToIdentityEmail();
  else if (aType == Components.interfaces.nsIMsgCompType.Template)
    hintForIdentity = aMsgHdr.author;
  else
    hintForIdentity = aMsgHdr.recipients + "," + aMsgHdr.ccList + "," +
                      findDeliveredToIdentityEmail();

  let server = null;
  let identity = null;
  let folder = aMsgHdr.folder;
  if (folder)
  {
    server = folder.server;
    identity = folder.customIdentity;
  }

  if (!identity)
  {
    let accountKey = aMsgHdr.accountKey;
    if (accountKey.length > 0)
    {
      let account = accountManager.getAccount(accountKey);
      if (account)
        server = account.incomingServer;
    }

    if (server)
      identity = getIdentityForServer(server, hintForIdentity);

    if (!identity)
      identity = getBestIdentity(accountManager.allIdentities, hintForIdentity);
  }
  return identity;
}

function GetNextNMessages(folder)
{
  if (folder) {
    var newsFolder = folder.QueryInterface(Components.interfaces.nsIMsgNewsFolder);
    if (newsFolder) {
      newsFolder.getNextNMessages(msgWindow);
    }
  }
}

// type is a nsIMsgCompType and format is a nsIMsgCompFormat
function ComposeMessage(type, format, folder, messageArray)
{
  var msgComposeType = Components.interfaces.nsIMsgCompType;
  var identity = null;
  var newsgroup = null;
  var hdr;

  // dump("ComposeMessage folder=" + folder + "\n");
  try
  {
    if (folder)
    {
      // Get the incoming server associated with this uri.
      var server = folder.server;

      // If they hit new or reply and they are reading a newsgroup,
      // turn this into a new post or a reply to group.
      if (!folder.isServer && server.type == "nntp" && type == msgComposeType.New)
      {
        type = msgComposeType.NewsPost;
        newsgroup = folder.folderURL;
      }

      identity = getIdentityForServer(server);
      // dump("identity = " + identity + "\n");
    }
  }
  catch (ex)
  {
    dump("failed to get an identity to pre-select: " + ex + "\n");
  }

  // dump("\nComposeMessage from XUL: " + identity + "\n");

  if (!msgComposeService)
  {
    dump("### msgComposeService is invalid\n");
    return;
  }

  switch (type)
  {
    case msgComposeType.New: //new message
      // dump("OpenComposeWindow with " + identity + "\n");

      // If the addressbook sidebar panel is open and has focus, get
      // the selected addresses from it.
      if (document.commandDispatcher.focusedWindow &&
          document.commandDispatcher.focusedWindow
                  .document.documentElement.hasAttribute("selectedaddresses"))
        NewMessageToSelectedAddresses(type, format, identity);
      else
        msgComposeService.OpenComposeWindow(null, null, null, type,
                                            format, identity, msgWindow);
      return;
    case msgComposeType.NewsPost:
      // dump("OpenComposeWindow with " + identity + " and " + newsgroup + "\n");
      msgComposeService.OpenComposeWindow(null, null, newsgroup, type,
                                          format, identity, msgWindow);
      return;
    case msgComposeType.ForwardAsAttachment:
      if (messageArray && messageArray.length)
      {
        // If we have more than one ForwardAsAttachment then pass null instead
        // of the header to tell the compose service to work out the attachment
        // subjects from the URIs.
        hdr = messageArray.length > 1 ? null : messenger.msgHdrFromURI(messageArray[0]);
        msgComposeService.OpenComposeWindow(null, hdr, messageArray.join(','),
                                            type, format, identity, msgWindow);
        return;
      }
    default:
      if (!messageArray)
        return;

      // Limit the number of new compose windows to 8. Why 8 ?
      // I like that number :-)
      if (messageArray.length > 8)
        messageArray.length = 8;

      for (var i = 0; i < messageArray.length; ++i)
      {
        var messageUri = messageArray[i];
        hdr = messenger.msgHdrFromURI(messageUri);
        identity = GetIdentityForHeader(hdr, type);
        if (hdr.folder && hdr.folder.server.type == "rss")
          openComposeWindowForRSSArticle(null, hdr, messageUri, type,
                                         format, identity, msgWindow);
        else
          msgComposeService.OpenComposeWindow(null, hdr, messageUri, type,
                                              format, identity, msgWindow);
      }
  }
}

function NewMessageToSelectedAddresses(type, format, identity) {
  var abSidebarPanel = document.commandDispatcher.focusedWindow;
  var abResultsTree = abSidebarPanel.document.getElementById("abResultsTree");
  var abResultsBoxObject = abResultsTree.treeBoxObject;
  var abView = abResultsBoxObject.view;
  abView = abView.QueryInterface(Components.interfaces.nsIAbView);
  var addresses = abView.selectedAddresses;
  var params = Components.classes["@mozilla.org/messengercompose/composeparams;1"].createInstance(Components.interfaces.nsIMsgComposeParams);
  if (params) {
    params.type = type;
    params.format = format;
    params.identity = identity;
    var composeFields = Components.classes["@mozilla.org/messengercompose/composefields;1"].createInstance(Components.interfaces.nsIMsgCompFields);
    if (composeFields) {
      var addressList = "";
      for (var i = 0; i < addresses.Count(); i++) {
        addressList = addressList + (i > 0 ? ",":"") + addresses.QueryElementAt(i,Components.interfaces.nsISupportsString).data;
      }
      composeFields.to = addressList;
      params.composeFields = composeFields;
      msgComposeService.OpenComposeWindowWithParams(null, params);
    }
  }
}

function NewFolder(name, folder)
{
  if (!folder || !name)
    return;

  folder.createSubfolder(name, msgWindow);
}

function UnSubscribe(folder)
{
  // Unsubscribe the current folder from the newsserver, this assumes any confirmation has already
  // been made by the user  SPL

  var server = folder.server;
  var subscribableServer = server.QueryInterface(Components.interfaces.nsISubscribableServer);
  subscribableServer.unsubscribe(folder.name);
  subscribableServer.commitSubscribeChanges();
}

function Subscribe(preselectedMsgFolder)
{
  window.openDialog("chrome://messenger/content/subscribe.xul",
                    "subscribe", "chrome,modal,titlebar,resizable=yes",
                    {folder:preselectedMsgFolder,
                      okCallback:SubscribeOKCallback});
}

function SubscribeOKCallback(changeTable)
{
  for (var serverURI in changeTable) {
    var folder = GetMsgFolderFromUri(serverURI, true);
    var server = folder.server;
    var subscribableServer =
          server.QueryInterface(Components.interfaces.nsISubscribableServer);

    for (var name in changeTable[serverURI]) {
      if (changeTable[serverURI][name] == true) {
        try {
          subscribableServer.subscribe(name);
        }
        catch (ex) {
          dump("failed to subscribe to " + name + ": " + ex + "\n");
        }
      }
      else if (changeTable[serverURI][name] == false) {
        try {
          subscribableServer.unsubscribe(name);
        }
        catch (ex) {
          dump("failed to unsubscribe to " + name + ": " + ex + "\n");
        }
      }
      else {
        // no change
      }
    }

    try {
      subscribableServer.commitSubscribeChanges();
    }
    catch (ex) {
      dump("failed to commit the changes: " + ex + "\n");
    }
  }
}

function SaveAsFile(aUris)
{
  if (/type=application\/x-message-display/.test(aUris[0]))
  {
    saveURL(aUris[0], null, "", true, false, null, document);
    return;
  }

  var num = aUris.length;
  var fileNames = [];
  for (let i = 0; i < num; i++)
  {
    let subject = messenger.messageServiceFromURI(aUris[i])
                           .messageURIToMsgHdr(aUris[i])
                           .mime2DecodedSubject;
    fileNames[i] = suggestUniqueFileName(subject.substr(0, 120), ".eml",
                                         fileNames);
  }
  if (num == 1)
    messenger.saveAs(aUris[0], true, null, fileNames[0]);
  else
    messenger.saveMessages(num, fileNames, aUris);
}

function saveAsUrlListener(aUri, aIdentity)
{
  this.uri = aUri;
  this.identity = aIdentity;
}

saveAsUrlListener.prototype = {
  OnStartRunningUrl: function(aUrl)
  {
  },
  OnStopRunningUrl: function(aUrl, aExitCode)
  {
    messenger.saveAs(this.uri, false, this.identity, null);
  }
};

function SaveAsTemplate(aUris)
{
  // For backwards compatibility check if the argument is a string and,
  // if so, convert to an array.
  if (typeof aUris == "string")
    aUris = [aUris];

  var num = aUris.length;
  if (!num)
    return;

  for (let i = 0; i < num; i++)
  {
    let uri = aUris[i];
    var hdr = messenger.msgHdrFromURI(uri);
    var identity = GetIdentityForHeader(hdr, Components.interfaces.nsIMsgCompType.Template);
    var templates = MailUtils.getFolderForURI(identity.stationeryFolder, false);
    if (!templates.parent)
    {
      templates.setFlag(Components.interfaces.nsMsgFolderFlags.Templates);
      let isAsync = templates.server.protocolInfo.foldersCreatedAsync;
      templates.createStorageIfMissing(new saveAsUrlListener(uri, identity));
      if (isAsync)
        continue;
    }
    messenger.saveAs(uri, false, identity, null);
  }
}

function MarkSelectedMessagesRead(markRead)
{
  ClearPendingReadTimer();
  gDBView.doCommand(markRead ? nsMsgViewCommandType.markMessagesRead : nsMsgViewCommandType.markMessagesUnread);
}

function MarkSelectedMessagesFlagged(markFlagged)
{
  gDBView.doCommand(markFlagged ? nsMsgViewCommandType.flagMessages : nsMsgViewCommandType.unflagMessages);
}

function ViewPageSource(messages)
{
  var numMessages = messages.length;

  if (numMessages == 0)
  {
    dump("MsgViewPageSource(): No messages selected.\n");
    return false;
  }

  var browser = getBrowser();

    try {
        // First, get the mail session
        const nsIMsgMailSession = Components.interfaces.nsIMsgMailSession;
        var mailSession = Components.classes["@mozilla.org/messenger/services/session;1"]
                                    .getService(nsIMsgMailSession);

        for (var i = 0; i < numMessages; i++)
        {
            // Now, we need to get a URL from a URI
            var url = mailSession.ConvertMsgURIToMsgURL(messages[i], msgWindow);

            // Strip out the message-display parameter to ensure that attached
            // emails display the message source, not the processed HTML.
            url = url.replace(/(\?|&)type=application\/x-message-display(&|$)/, "$1")
                     .replace(/\?$/, "");
            window.openDialog( "chrome://global/content/viewSource.xul",
                               "_blank", "all,dialog=no",
                               {URL: url, browser: browser,
                                outerWindowID: browser.outerWindowID});
        }
        return true;
    } catch (e) {
        // Couldn't get mail session
        return false;
    }
}

function doHelpButton()
{
    openHelp("mail-offline-items");
}

function confirmToProceed(commandName)
{
  const kDontAskAgainPref = "mailnews."+commandName+".dontAskAgain";
  // default to ask user if the pref is not set
  var dontAskAgain = false;
  try {
    dontAskAgain = Services.prefs.getBoolPref(kDontAskAgainPref);
  } catch (ex) {}

  if (!dontAskAgain)
  {
    var checkbox = {value:false};
    var choice = Services.prompt.confirmEx(
                   window,
                   gMessengerBundle.getString(commandName+"Title"),
                   gMessengerBundle.getString(commandName+"Message"),
                   Services.prompt.STD_YES_NO_BUTTONS,
                   null, null, null,
                   gMessengerBundle.getString(commandName+"DontAsk"),
                   checkbox);
    try {
      if (checkbox.value)
        Services.prefs.setBoolPref(kDontAskAgainPref, true);
    } catch (ex) {}

    if (choice != 0)
      return false;
  }
  return true;
}

function deleteAllInFolder(commandName)
{
  var folder = GetMsgFolderFromUri(GetSelectedFolderURI(), true);
  if (!folder)
    return;

  if (!confirmToProceed(commandName))
    return;

  // Delete sub-folders.
  var iter = folder.subFolders;
  while (iter.hasMoreElements())
    folder.propagateDelete(iter.getNext(), true, msgWindow);
  
  var children = Components.classes["@mozilla.org/array;1"]
                  .createInstance(Components.interfaces.nsIMutableArray);
                  
  // Delete messages.
  iter = folder.messages;
  while (iter.hasMoreElements()) {
    children.appendElement(iter.getNext(), false);
  }
  folder.deleteMessages(children, msgWindow, true, false, null, false); 
  children.clear();
}
