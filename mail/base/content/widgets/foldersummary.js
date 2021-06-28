/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global MozElements */
/* global MozXULElement */
/* import-globals-from ../../../../mailnews/base/content/newmailalert.js */
/* import-globals-from ../folderDisplay.js */
/* import-globals-from ../folderPane.js */

// Wrap in a block to prevent leaking to window scope.
{
  const { Services } = ChromeUtils.import(
    "resource://gre/modules/Services.jsm"
  );
  const { MailServices } = ChromeUtils.import(
    "resource:///modules/MailServices.jsm"
  );
  const { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");

  /**
   * MozFolderSummary displays a listing of NEW mails for the folder in question.
   * For each mail the subject, sender and a message preview can be included.
   * @extends {MozXULElement}
   */
  class MozFolderSummary extends MozXULElement {
    constructor() {
      super();
      this.maxMsgHdrsInPopup = 8;

      this.showSubject = Services.prefs.getBoolPref(
        "mail.biff.alert.show_subject"
      );
      this.showSender = Services.prefs.getBoolPref(
        "mail.biff.alert.show_sender"
      );
      this.showPreview = Services.prefs.getBoolPref(
        "mail.biff.alert.show_preview"
      );
      this.messengerBundle = Services.strings.createBundle(
        "chrome://messenger/locale/messenger.properties"
      );
    }

    hasMessages() {
      return this.lastElementChild;
    }

    static createFolderSummaryMessage() {
      let vbox = document.createXULElement("vbox");
      vbox.setAttribute("class", "folderSummaryMessage");

      let hbox = document.createXULElement("hbox");
      hbox.setAttribute("class", "folderSummary-message-row");

      let subject = document.createXULElement("label");
      subject.setAttribute("class", "folderSummary-subject");

      let sender = document.createXULElement("label");
      sender.setAttribute("class", "folderSummary-sender");
      sender.setAttribute("crop", "right");

      hbox.appendChild(subject);
      hbox.appendChild(sender);

      let preview = document.createXULElement("description");
      preview.setAttribute(
        "class",
        "folderSummary-message-row folderSummary-previewText"
      );
      preview.setAttribute("crop", "right");

      vbox.appendChild(hbox);
      vbox.appendChild(preview);
      return vbox;
    }

    /**
     * Check the given folder for NEW messages.
     * @param {nsIMsgFolder} folder - The folder to examine.
     * @param {nsIUrlListener} urlListener - Listener to notify if we run urls
     *   to fetch msgs.
     * @param Object outAsync - Object with value property set to true if there
     *   are async fetches pending (a message preview will be available later).
     * @returns true if the folder knows about messages that should be shown.
     */
    parseFolder(folder, urlListener, outAsync) {
      // Skip servers, Trash, Junk folders and newsgroups.
      if (
        !folder ||
        folder.isServer ||
        !folder.hasNewMessages ||
        folder.getFlag(Ci.nsMsgFolderFlags.Junk) ||
        folder.getFlag(Ci.nsMsgFolderFlags.Trash) ||
        folder.server instanceof Ci.nsINntpIncomingServer
      ) {
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
        let srchFolderUri = msgDatabase.dBFolderInfo.getCharProperty(
          "searchFolderUri"
        );
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

      let haveMsgsToShow = false;
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
        let msgKeys = msgDatabase.getNewList();

        let numNewMessages = folder.getNumNewMessages(false);
        if (!numNewMessages) {
          continue;
        }
        // NOTE: getNewlist returns all nsMsgMessageFlagType::New messages,
        // while getNumNewMessages returns count of new messages since the last
        // biff. Only show newly received messages since last biff in
        // notification.
        msgKeys = msgKeys.slice(-numNewMessages);
        if (!msgKeys.length) {
          continue;
        }

        if (this.showPreview) {
          // fetchMsgPreviewText forces the previewText property to get generated
          // for each of the message keys.
          try {
            outAsync.value = folder.fetchMsgPreviewText(
              msgKeys,
              false,
              urlListener
            );
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

        // In the case of async fetching for more than one folder, we may
        //  already have got enough to show (added by another urllistener).
        let curHdrsInPopup = this.children.length;
        if (curHdrsInPopup >= this.maxMsgHdrsInPopup) {
          return false;
        }

        for (
          let i = 0;
          i + curHdrsInPopup < this.maxMsgHdrsInPopup && i < msgKeys.length;
          i++
        ) {
          let msgBox = MozFolderSummary.createFolderSummaryMessage();
          let msgHdr = msgDatabase.GetMsgHdrForKey(msgKeys[i]);
          msgBox.addEventListener("click", event => {
            if (event.button !== 0) {
              return;
            }
            MailUtils.displayMessageInFolderTab(msgHdr);
          });

          if (this.showSubject) {
            let msgSubject = msgHdr.mime2DecodedSubject;
            const kMsgFlagHasRe = 0x0010; // MSG_FLAG_HAS_RE
            if (msgHdr.flags & kMsgFlagHasRe) {
              msgSubject = msgSubject ? "Re: " + msgSubject : "Re: ";
            }
            msgBox.querySelector(
              ".folderSummary-subject"
            ).textContent = msgSubject;
          }

          if (this.showSender) {
            let addrs = MailServices.headerParser.parseEncodedHeader(
              msgHdr.author,
              msgHdr.effectiveCharset,
              false
            );
            let folderSummarySender = msgBox.querySelector(
              ".folderSummary-sender"
            );
            // Set the label value instead of textContent to avoid wrapping.
            folderSummarySender.value =
              addrs.length > 0 ? addrs[0].name || addrs[0].email : "";
            if (addrs.length > 1) {
              let andOthersStr = this.messengerBundle.GetStringFromName(
                "andOthers"
              );
              folderSummarySender.value += " " + andOthersStr;
            }
          }

          if (this.showPreview) {
            // Get the preview text as a UTF-8 encoded string.
            msgBox.querySelector(
              ".folderSummary-previewText"
            ).textContent = decodeURIComponent(
              escape(msgHdr.getStringProperty("preview") || "")
            );
          }
          this.appendChild(msgBox);
          haveMsgsToShow = true;
        }
      }
      return haveMsgsToShow;
    }

    /**
     * Render NEW messages in a folder.
     * @param {nsIMsgFolder} folder - A real folder containing new messages.
     * @param {number[]} msgKeys - The keys of new messages.
     */
    render(folder, msgKeys) {
      let msgDatabase = folder.msgDatabase;
      for (let msgKey of msgKeys.slice(0, this.maxMsgHdrsInPopup)) {
        let msgBox = MozFolderSummary.createFolderSummaryMessage();
        let msgHdr = msgDatabase.GetMsgHdrForKey(msgKey);
        msgBox.addEventListener("click", event => {
          if (event.button !== 0) {
            return;
          }
          MailUtils.displayMessageInFolderTab(msgHdr);
        });

        if (this.showSubject) {
          let msgSubject = msgHdr.mime2DecodedSubject;
          const kMsgFlagHasRe = 0x0010; // MSG_FLAG_HAS_RE
          if (msgHdr.flags & kMsgFlagHasRe) {
            msgSubject = msgSubject ? "Re: " + msgSubject : "Re: ";
          }
          msgBox.querySelector(
            ".folderSummary-subject"
          ).textContent = msgSubject;
        }

        if (this.showSender) {
          let addrs = MailServices.headerParser.parseEncodedHeader(
            msgHdr.author,
            msgHdr.effectiveCharset,
            false
          );
          let folderSummarySender = msgBox.querySelector(
            ".folderSummary-sender"
          );
          // Set the label value instead of textContent to avoid wrapping.
          folderSummarySender.value =
            addrs.length > 0 ? addrs[0].name || addrs[0].email : "";
          if (addrs.length > 1) {
            let andOthersStr = this.messengerBundle.GetStringFromName(
              "andOthers"
            );
            folderSummarySender.value += " " + andOthersStr;
          }
        }

        if (this.showPreview) {
          // Get the preview text as a UTF-8 encoded string.
          msgBox.querySelector(
            ".folderSummary-previewText"
          ).textContent = decodeURIComponent(
            escape(msgHdr.getStringProperty("preview") || "")
          );
        }
        this.appendChild(msgBox);
      }
    }
  }
  customElements.define("folder-summary", MozFolderSummary);

  /**
   * MozFolderTooltip displays a tooltip summarizing the folder status:
   *  - if there are NEW messages, display a summary of them
   *  - if the folder name is cropped, include the name and more details
   *  - a summary of the unread count in this folder and its subfolders
   * @extends {XULPopupElement}
   * @borrows MozFolderSummary.prototype.parseFolder as parseFolder
   */
  class MozFolderTooltip extends MozElements.MozElementMixin(XULPopupElement) {
    constructor() {
      super();

      this.maxMsgHdrsInPopup = 8;
      this.showSubject = true;
      this.showSender = true;
      this.showPreview = true;

      // Borrow the parseFolder function from MozFolderSummary.
      this.parseFolder = MozFolderSummary.prototype.parseFolder;

      this.addEventListener("popupshowing", event => {
        if (!this._folderpopupShowing(event)) {
          event.preventDefault();
        }
      });

      this.addEventListener("popuphiding", event => {
        while (this.lastChild) {
          this.lastChild.remove();
        }
      });
    }

    /** Handle the popupshowing event. */
    _folderpopupShowing(event) {
      let msgFolder = gFolderTreeView.getFolderAtCoords(
        event.clientX,
        event.clientY
      );

      // Interrupt if the selected row is not a folder.
      if (!msgFolder) {
        return false;
      }

      let treeCellInfo = gFolderTreeView._tree.getCellAt(
        event.clientX,
        event.clientY
      );
      if (!treeCellInfo.col) {
        return false;
      }

      let asyncResults = {};
      if (this.parseFolder(msgFolder, null, asyncResults)) {
        return true;
      }

      if (treeCellInfo.col.id == "folderNameCol") {
        let cropped = gFolderTreeView._tree.isCellCropped(
          treeCellInfo.row,
          treeCellInfo.col
        );
        if (this._addLocationInfo(msgFolder, cropped)) {
          return true;
        }
      }

      let counts = gFolderTreeView.getSummarizedCounts(
        treeCellInfo.row,
        treeCellInfo.col.id
      );
      if (this._addSummarizeExplain(counts)) {
        return true;
      }

      if (
        gFolderTreeView._tree.isCellCropped(treeCellInfo.row, treeCellInfo.col)
      ) {
        let croppedText = gFolderTreeView.getCellText(
          treeCellInfo.row,
          treeCellInfo.col
        );
        return this._addCroppedText(croppedText);
      }

      return false;
    }

    /** Add location information to the folder name if needed. */
    _addLocationInfo(folder, cropped) {
      // Display also server name for items that are on level 0 and are not
      // server names by themselves and do not have server name already appended
      // in their label.
      let folderIndex = gFolderTreeView.getIndexOfFolder(folder);
      if (
        !folder.isServer &&
        gFolderTreeView.getLevel(folderIndex) == 0 &&
        !gFolderTreeView.getServerNameAdded(folderIndex)
      ) {
        let loc = document.createXULElement("label");
        let midPath = "";
        let midFolder = folder.parent;
        while (folder.server.rootFolder != midFolder) {
          midPath = midFolder.name + " - " + midPath;
          midFolder = midFolder.parent;
        }
        loc.setAttribute(
          "value",
          folder.server.prettyName + " - " + midPath + folder.name
        );
        this.appendChild(loc);
        return true;
      }

      // If folder name is cropped or is a newsgroup and abbreviated per
      // pref, use the full name as a tooltip.
      if (
        cropped ||
        (folder.server instanceof Ci.nsINntpIncomingServer &&
          !(folder.flags & Ci.nsMsgFolderFlags.Virtual) &&
          folder.server.abbreviate &&
          !folder.isServer)
      ) {
        let loc = document.createXULElement("label");
        loc.setAttribute("value", folder.name);
        this.appendChild(loc);
        return true;
      }
      return false;
    }

    /** Add information about unread messages in this folder and subfolders. */
    _addSummarizeExplain(counts) {
      if (!counts || !counts[1]) {
        return false;
      }
      let expl = document.createXULElement("label");
      let sumString = document
        .getElementById("bundle_messenger")
        .getFormattedString("subfoldersExplanation", [counts[0], counts[1]], 2);
      expl.setAttribute("value", sumString);
      this.appendChild(expl);
      return true;
    }

    _addCroppedText(text) {
      let expl = document.createXULElement("label");
      expl.setAttribute("value", text);
      this.appendChild(expl);
      return true;
    }
  }
  customElements.define("folder-tooltip", MozFolderTooltip, {
    extends: "tooltip",
  });
}
