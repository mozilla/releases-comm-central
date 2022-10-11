/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var gFolderDisplay =
{
  get selectedCount()
  {
    return gDBView ? gDBView.numSelected : 0;
  },

  get selectedMessage()
  {
    if (!this.selectedIndices.length)
      return null;
    return gDBView.hdrForFirstSelectedMessage;
  },

  get selectedMessageUri()
  {
    if (!this.selectedIndices.length)
      return null;
    return gDBView.URIForFirstSelectedMessage;
  },

  get selectedMessageIsFeed()
  {
    return FeedMessageHandler.isFeedMessage(this.selectedMessage);
  },

  get selectedMessageIsImap()
  {
    var message = this.selectedMessage;
    return message && message.folder &&
           (message.folder.flags & Ci.nsMsgFolderFlags.ImapBox) != 0;
  },

  get selectedMessageIsNews()
  {
    var message = this.selectedMessage;
    return message && message.folder &&
           (message.folder.flags & Ci.nsMsgFolderFlags.Newsgroup) != 0;
  },

  get selectedMessageIsExternal()
  {
    var message = this.selectedMessage;
    return message && !message.folder;
  },

  get selectedIndices()
  {
    return gDBView ? gDBView.getIndicesForSelection() : [];
  },

  get selectedMessages()
  {
    return gDBView ? gDBView.getSelectedMsgHdrs() : [];
  },

  get selectedMessageUris()
  {
    if (!gDBView)
      return null;
    var messageArray = gDBView.getURIsForSelection();
    return messageArray.length ? messageArray : null;
  },

  get canArchiveSelectedMessages()
  {
    if (!gDBView)
      return false;
    var selectedMessages = this.selectedMessages;
    if (selectedMessages.length == 0)
      return false;
    return selectedMessages.every(function(aMsg) {
      let identity = GetIdentityForHeader(aMsg);
      return identity && identity.archiveEnabled;
    });
  },

  get displayedFolder()
  {
    return gMsgFolderSelected;
  },

   /**
   * Determine which pane currently has focus (one of the folder pane, thread
   * pane, or message pane). When changing focus to the message pane, be sure
   * to focus the appropriate content window in addition to the messagepanebox
   * (doing both is required in order to blur the previously-focused chrome
   * element).
   *
   * @return the focused pane
   */
  get focusedPane() {
    let panes = ["threadTree", "folderTree", "messagepanebox"].map(id =>
        document.getElementById(id));

    let currentNode = top.document.activeElement;

    while (currentNode) {
      if (panes.includes(currentNode)) {
        return currentNode;
      }

      currentNode = currentNode.parentNode;
    }
    return null;
  },

}

var gMessageDisplay =
{
  get displayedMessage()
  {
    if (!gDBView)
      return null;
    var viewIndex = gDBView.currentlyDisplayedMessage;
    return viewIndex == nsMsgViewIndex_None ? null :
                                              gDBView.getMsgHdrAt(viewIndex);
  },

  get isDummy()
  {
    return gDBView && gDBView.keyForFirstSelectedMessage == nsMsgKey_None;
  },

  get visible()
  {
    return !GetMessagePane().collapsed;
  },

  set visible(aVisible)
  {
    return aVisible; // Fake setter for the time being.
  }
}

gFolderDisplay.messageDisplay = gMessageDisplay;
