/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals MozXULElement */
/* import-globals-from folderDisplay.js */
/* import-globals-from folderPane.js */
/* import-globals-from ../../../mailnews/base/content/newmailalert.js */

var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
var {MailServices} = ChromeUtils.import("resource:///modules/MailServices.jsm");
var {MailUtils} = ChromeUtils.import("resource:///modules/MailUtils.jsm");

/**
 * MozFolderSummary displays a listing of NEW mails for the folder in question.
 * For each mail the subject, sender and a message preview can be included.
 */
class MozFolderSummary extends MozXULElement {
  constructor() {
    super();
    this.maxMsgHdrsInPopup = 8;

    this.showSubject = Services.prefs.getBoolPref("mail.biff.alert.show_subject");
    this.showSender = Services.prefs.getBoolPref("mail.biff.alert.show_sender");
    this.showPreview = Services.prefs.getBoolPref("mail.biff.alert.show_preview");
    this.messengerBundle = Services.strings.createBundle(
                             "chrome://messenger/locale/messenger.properties");
  }

  hasMessages() {
    return this.hasChildNodes();
  }

  parseFolder(folder, urlListener, outAsync) {
    // skip servers, Trash, Junk folders and newsgroups
    if (!folder || folder.isServer || !folder.hasNewMessages ||
        folder.getFlag(Ci.nsMsgFolderFlags.Junk) ||
        folder.getFlag(Ci.nsMsgFolderFlags.Trash) ||
        (folder.server instanceof Ci.nsINntpIncomingServer)) {
      return false;
    }

    let folderArray = [];
    let msgDatabase;
    try {
      msgDatabase = folder.msgDatabase;
    } catch (e) {
      // The database for this folder may be missing (e.g. outdated/missing .msf),
      // so just skip this folder.
      return false;
    }

    if (folder.flags & Ci.nsMsgFolderFlags.Virtual) {
      let srchFolderUri = msgDatabase.dBFolderInfo.getCharProperty("searchFolderUri");
      let folderUris = srchFolderUri.split("|");
      for (let uri of folderUris) {
        let realFolder = MailUtils.getOrCreateFolder(uri);
        if (!realFolder.isServer) {
          folderArray.push(realFolder);
        }
      }
    } else {
      folderArray.push(folder);
    }

    let foundNewMsg = false;
    for (let folder of folderArray) {
      // now get the database
      try {
        msgDatabase = folder.msgDatabase;
      } catch (e) {
        // The database for this folder may be missing (e.g. outdated/missing .msf),
        // then just skip this folder.
        continue;
      }

      folder.msgDatabase = null;
      let msgKeys = {};
      let numMsgKeys = {};
      msgDatabase.getNewList(numMsgKeys, msgKeys);

      if (!numMsgKeys.value) {
        continue;
      }

      if (this.showPreview) {
        // fetchMsgPreviewText forces the previewText property to get generated
        // for each of the message keys.
        try {
          outAsync.value = folder.fetchMsgPreviewText(msgKeys.value,
            numMsgKeys.value, false, urlListener);
          folder.msgDatabase = null;
        } catch (ex) {
          // fetchMsgPreviewText throws an error when we call it on a news
          // folder
          folder.msgDatabase = null;
          continue;
        }
      }
      // If fetching the preview text is going to be an asynch operation and the
      // caller is set up to handle that fact, then don't bother filling in any
      // of the fields since we'll have to do this all over again when the fetch
      // for the preview text completes.
      // We don't expect to get called with a urlListener if we're doing a
      // virtual folder.
      if (outAsync.value && urlListener) {
        return false;
      }

      foundNewMsg = true;

      for (let i = 0; i < this.maxMsgHdrsInPopup && i < numMsgKeys.value; i++) {
        let msgPopup = this._folderSummaryMessagePopup();
        let msgHdr = msgDatabase.GetMsgHdrForKey(msgKeys.value[i]);
        msgPopup.addEventListener("click", (event) => {
          if (event.button !== 0) {
            return;
          }
          MailUtils.displayMessageInFolderTab(msgHdr);
          if (gAlertListener) {
            gAlertListener.observe(null, "alertclickcallback", "");
          }
        });

        if (this.showSubject) {
          let msgSubject = msgHdr.mime2DecodedSubject;
          const kMsgFlagHasRe = 0x0010; // MSG_FLAG_HAS_RE
          if (msgHdr.flags & kMsgFlagHasRe) {
            msgSubject = (msgSubject) ? "Re: " + msgSubject : "Re: ";
          }
          msgPopup.querySelector(".folderSummary-subject").textContent = msgSubject;
        }

        if (this.showSender) {
          let addrs = MailServices.headerParser.parseEncodedHeader(
            msgHdr.author, msgHdr.effectiveCharset, false);
          let folderSummarySender = msgPopup.querySelector(".folderSummary-sender");
          folderSummarySender.textContent =
            (addrs.length > 0) ? (addrs[0].name || addrs[0].email) : "";
          if (addrs.length > 1) {
            let andOthersStr = this.messengerBundle.GetStringFromName("andOthers");
            folderSummarySender.textContent += " " + andOthersStr;
          }
        }

        if (this.showPreview && msgHdr.getProperty("preview")) {
          // Get the preview text as a UTF-8 encoded string.
          msgPopup.querySelector(".folderSummary-previewText").textContent =
            decodeURIComponent(escape(msgHdr.getStringProperty("preview")));
        }
        this.appendChild(msgPopup);
      }
    }
    return foundNewMsg;
  }

  _folderSummaryMessagePopup() {
    let vbox = document.createXULElement("vbox");
    vbox.setAttribute("class", "folderSummaryMessage");

    let hbox = document.createXULElement("hbox");
    hbox.setAttribute("class", "folderSummary-message-row");

    let subject = document.createXULElement("label");
    subject.setAttribute("class", "folderSummary-subject");
    subject.setAttribute("flex", "1");
    subject.setAttribute("crop", "right");

    let sender = document.createXULElement("label");
    sender.setAttribute("class", "folderSummary-sender");
    sender.setAttribute("crop", "right");

    hbox.appendChild(subject);
    hbox.appendChild(sender);

    let preview = document.createXULElement("description");
    preview.setAttribute("class", "folderSummary-message-row folderSummary-previewText");
    preview.setAttribute("crop", "right");

    vbox.appendChild(hbox);
    vbox.appendChild(preview);
    return vbox;
  }
}

/**
 * MozFolderTooltip displays a tooltip summarizing the folder status:
 *  - if there are NEW messages, display a summary of them
 *  - if the folder name is cropped, include the name and more details
 *  - a summary of the unread count in this folder and its subfolders
 */
class MozFolderTooltip extends MozFolderSummary {
  constructor() {
    super();

    this.showSubject = true;
    this.showSender = true;
    this.showPreview = true;
  }

  /** Handle the popupshowing event. */
  folderpopupShowing(event) {
    let msgFolder = gFolderTreeView.getFolderAtCoords(event.clientX,
                                                      event.clientY);
    if (!msgFolder) {
      return false;
    }

    let treeCellInfo = gFolderTreeView._tree.getCellAt(event.clientX, event.clientY);
    if (!treeCellInfo.col) {
      return false;
    }

    let tooltipnode = event.target;
    let asyncResults = {};
    if (tooltipnode.parseFolder(msgFolder, null, asyncResults)) {
      return true;
    }

    if (treeCellInfo.col.id == "folderNameCol") {
      let cropped = gFolderTreeView._tree.isCellCropped(treeCellInfo.row, treeCellInfo.col);
      if (this._addLocationInfo(msgFolder, cropped, tooltipnode)) {
        return true;
      }
    }

    let counts = gFolderTreeView.getSummarizedCounts(treeCellInfo.row, treeCellInfo.col.id);
    if (this._addSummarizeExplain(counts, tooltipnode)) {
      return true;
    }

    if (gFolderTreeView._tree.isCellCropped(treeCellInfo.row, treeCellInfo.col)) {
      let croppedText = gFolderTreeView.getCellText(treeCellInfo.row, treeCellInfo.col);
      return this._addCroppedText(croppedText, tooltipnode);
    }

    return false;
  }

  /** Handle the popuphiding event. */
  folderpopupHiding(event) {
    let node = event.target;
    while (node.hasChildNodes()) {
      node.lastChild.remove();
    }
  }

  /** Add location information to the folder name if needed. */
  _addLocationInfo(folder, cropped, node) {
      // Display also server name for items that are on level 0 and are not
      // server names by themselves and do not have server name already appended
      // in their label.
      let folderIndex = gFolderTreeView.getIndexOfFolder(folder);
      if (!folder.isServer &&
          gFolderTreeView.getLevel(folderIndex) == 0 &&
          !gFolderTreeView.getServerNameAdded(folderIndex)) {
        let loc = document.createXULElement("label");
        let midPath = "";
        let midFolder = folder.parent;
        while (folder.server.rootFolder != midFolder) {
          midPath = midFolder.name + " - " + midPath;
          midFolder = midFolder.parent;
        }
        loc.setAttribute("value", folder.server.prettyName + " - " + midPath + folder.name);
        node.appendChild(loc);
        return true;
      }

      // If folder name is cropped or is a newsgroup and abbreviated per
      // pref, use the full name as a tooltip.
      if (cropped ||
          ((folder.server instanceof Ci.nsINntpIncomingServer) &&
           !(folder.flags & Ci.nsMsgFolderFlags.Virtual) &&
           folder.server.abbreviate) && !folder.isServer) {
        let loc = document.createXULElement("label");
        loc.setAttribute("value", folder.name);
        node.appendChild(loc);
        return true;
      }
      return false;
    }

  /** Add information about unread messages in this folder and subfolders. */
  _addSummarizeExplain(counts, node) {
      if (!counts || !counts[1]) {
        return false;
      }
      let expl = document.createXULElement("label");
      let sumString = document.getElementById("bundle_messenger")
        .getFormattedString("subfoldersExplanation", [counts[0], counts[1]], 2);
      expl.setAttribute("value", sumString);
      node.appendChild(expl);
      return true;
    }

  _addCroppedText(text, node) {
      let expl = document.createXULElement("label");
      expl.setAttribute("value", text);
      node.appendChild(expl);
      return true;
    }
}

customElements.define("folder-summary", MozFolderSummary);
customElements.define("folder-tooltip", MozFolderTooltip);

