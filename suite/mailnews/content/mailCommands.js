/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
const { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.js");

/**
 * Get the identity that most likely is the best one to use, given the hint.
 * @param {Array<nsIMsgIdentity> identities  The candidates to pick from.
 * @param {String} optionalHint  String containing comma separated mailboxes
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
      for (let identity of identities) {
        if (!identity.email)
          continue;
        if (hints[i].trim() == identity.email.toLowerCase() ||
            hints[i].includes("<" + identity.email.toLowerCase() + ">"))
          return identity;
      }
    }
  }
  // Return only found identity or pick the first one from list if no matches found.
  return identities[0];
}

function getIdentityForServer(server, optionalHint)
{
  let identities = accountManager.getIdentitiesForServer(server);
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
      for (let identity of accountManager.allIdentities) {
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
  if (aType == Ci.nsIMsgCompType.ReplyToList)
    hintForIdentity = findDeliveredToIdentityEmail();
  else if (aType == Ci.nsIMsgCompType.Template ||
           aType == Ci.nsIMsgCompType.EditTemplate ||
           aType == Ci.nsIMsgCompType.EditAsNew)
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
    var newsFolder = folder.QueryInterface(Ci.nsIMsgNewsFolder);
    if (newsFolder) {
      newsFolder.getNextNMessages(msgWindow);
    }
  }
}

// type is a nsIMsgCompType and format is a nsIMsgCompFormat
function ComposeMessage(type, format, folder, messageArray)
{
  var msgComposeType = Ci.nsIMsgCompType;
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
                                            format, identity, null, msgWindow);
      return;
    case msgComposeType.NewsPost:
      // dump("OpenComposeWindow with " + identity + " and " + newsgroup + "\n");
      msgComposeService.OpenComposeWindow(null, null, newsgroup, type,
                                          format, identity, null, msgWindow);
      return;
    case msgComposeType.ForwardAsAttachment:
      if (messageArray && messageArray.length)
      {
        // If we have more than one ForwardAsAttachment then pass null instead
        // of the header to tell the compose service to work out the attachment
        // subjects from the URIs.
        hdr = messageArray.length > 1 ? null : messenger.msgHdrFromURI(messageArray[0]);
        msgComposeService.OpenComposeWindow(null, hdr, messageArray.join(','),
                                            type, format, identity, null, msgWindow);
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
        if (FeedMessageHandler.isFeedMessage(hdr))
          openComposeWindowForRSSArticle(null, hdr, messageUri, type,
                                         format, identity, msgWindow);
        else
          msgComposeService.OpenComposeWindow(null, hdr, messageUri, type,
                                              format, identity, null, msgWindow);
      }
  }
}

function NewMessageToSelectedAddresses(type, format, identity) {
  var abSidebarPanel = document.commandDispatcher.focusedWindow;
  var abResultsTree = abSidebarPanel.document.getElementById("abResultsTree");
  var abResultsBoxObject = abResultsTree.treeBoxObject;
  var abView = abResultsBoxObject.view;
  abView = abView.QueryInterface(Ci.nsIAbView);
  var addresses = abView.selectedAddresses;
  var params = Cc["@mozilla.org/messengercompose/composeparams;1"].createInstance(Ci.nsIMsgComposeParams);
  if (params) {
    params.type = type;
    params.format = format;
    params.identity = identity;
    var composeFields = Cc["@mozilla.org/messengercompose/composefields;1"].createInstance(Ci.nsIMsgCompFields);
    if (composeFields) {
      let addressList = [];
      const nsISupportsString = Ci.nsISupportsString;
      for (let i = 0; i < addresses.length; i++) {
        addressList.push(addresses.queryElementAt(i, nsISupportsString).data);
      }
      composeFields.to = addressList.join(",");
      params.composeFields = composeFields;
      msgComposeService.OpenComposeWindowWithParams(null, params);
    }
  }
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
    var folder = MailUtils.getFolderForURI(serverURI, true);
    var server = folder.server;
    var subscribableServer =
          server.QueryInterface(Ci.nsISubscribableServer);

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
    messenger.saveMessages(fileNames, aUris);
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
    var identity = GetIdentityForHeader(hdr, Ci.nsIMsgCompType.Template);
    var templates = MailUtils.getFolderForURI(identity.stationeryFolder, false);
    if (!templates.parent)
    {
      templates.setFlag(Ci.nsMsgFolderFlags.Templates);
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
    // First, get the mail session.
    for (let i = 0; i < numMessages; i++) {
      // Now, we need to get a URL from a URI.
      var url = MailServices.mailSession.ConvertMsgURIToMsgURL(messages[i],
                                                               msgWindow);

      // Strip out the message-display parameter to ensure that attached
      // emails display the message source, not the processed HTML.
      url = url.replace(/(\?|&)type=application\/x-message-display(&|$)/, "$1")
               .replace(/\?$/, "");
      window.openDialog("chrome://global/content/viewSource.xul", "_blank",
                        "all,dialog=no",
                        {URL: url, browser: browser,
                         outerWindowID: browser.outerWindowID});
    }
    return true;
  } catch (e) {
    // Couldn't get mail session.
    return false;
  }
}

function doHelpButton()
{
    openHelp("mail-offline-items");
}
