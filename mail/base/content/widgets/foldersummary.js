/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global MozElements */
/* global MozXULElement */
/* import-globals-from ../../../../mailnews/base/content/newmailalert.js */

// Wrap in a block to prevent leaking to window scope.
{
  const { MailServices } = ChromeUtils.importESModule(
    "resource:///modules/MailServices.sys.mjs"
  );

  /**
   * MozFolderSummary displays a listing of NEW mails for the folder in question.
   * For each mail the subject, sender and a message preview can be included.
   *
   * @augments {MozXULElement}
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

      ChromeUtils.defineESModuleGetters(this, {
        MailUtils: "resource:///modules/MailUtils.sys.mjs",
      });
    }

    hasMessages() {
      return this.lastElementChild;
    }

    static createFolderSummaryMessage() {
      const vbox = document.createXULElement("vbox");
      vbox.setAttribute("class", "folderSummaryMessage");

      const hbox = document.createXULElement("hbox");
      hbox.setAttribute("class", "folderSummary-message-row");

      const subject = document.createXULElement("label");
      subject.setAttribute("class", "folderSummary-subject");

      const sender = document.createXULElement("label");
      sender.setAttribute("class", "folderSummary-sender");
      sender.setAttribute("crop", "end");

      hbox.appendChild(subject);
      hbox.appendChild(sender);

      const preview = document.createXULElement("description");
      preview.setAttribute(
        "class",
        "folderSummary-message-row folderSummary-previewText"
      );
      preview.setAttribute("crop", "end");

      vbox.appendChild(hbox);
      vbox.appendChild(preview);
      return vbox;
    }

    /**
     * Check the given folder for NEW messages.
     *
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

      const folders = [];
      let msgDatabase;
      try {
        msgDatabase = folder.msgDatabase;
      } catch (e) {
        // The database for this folder may be missing (e.g. outdated/missing .msf),
        // so just skip this folder.
        return false;
      }

      if (folder.flags & Ci.nsMsgFolderFlags.Virtual) {
        const srchFolderUri =
          msgDatabase.dBFolderInfo.getCharProperty("searchFolderUri");
        const folderUris = srchFolderUri.split("|");
        for (const uri of folderUris) {
          const realFolder = this.MailUtils.getOrCreateFolder(uri);
          if (!realFolder.isServer) {
            folders.push(realFolder);
          }
        }
      } else {
        folders.push(folder);
      }

      let haveMsgsToShow = false;
      // eslint-disable-next-line no-shadow
      for (const folder of folders) {
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

        const numNewMessages = folder.getNumNewMessages(false);
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
            outAsync.value = folder.fetchMsgPreviewText(msgKeys, urlListener);
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
        const curHdrsInPopup = this.children.length;
        if (curHdrsInPopup >= this.maxMsgHdrsInPopup) {
          return false;
        }

        for (
          let i = 0;
          i + curHdrsInPopup < this.maxMsgHdrsInPopup && i < msgKeys.length;
          i++
        ) {
          const msgBox = MozFolderSummary.createFolderSummaryMessage();
          const msgHdr = msgDatabase.getMsgHdrForKey(msgKeys[i]);
          msgBox.addEventListener("click", event => {
            if (event.button !== 0) {
              return;
            }
            this.MailUtils.displayMessageInFolderTab(msgHdr, true);
          });

          if (this.showSubject) {
            let msgSubject = msgHdr.mime2DecodedSubject;
            const kMsgFlagHasRe = 0x0010; // MSG_FLAG_HAS_RE
            if (msgHdr.flags & kMsgFlagHasRe) {
              msgSubject = msgSubject ? "Re: " + msgSubject : "Re: ";
            }
            msgBox.querySelector(".folderSummary-subject").textContent =
              msgSubject;
          }

          if (this.showSender) {
            const addrs = MailServices.headerParser.parseEncodedHeader(
              msgHdr.author,
              msgHdr.effectiveCharset,
              false
            );
            const folderSummarySender = msgBox.querySelector(
              ".folderSummary-sender"
            );
            // Set the label value instead of textContent to avoid wrapping.
            folderSummarySender.value =
              addrs.length > 0 ? addrs[0].name || addrs[0].email : "";
            if (addrs.length > 1) {
              const andOthersStr =
                this.messengerBundle.GetStringFromName("andOthers");
              folderSummarySender.value += " " + andOthersStr;
            }
          }

          if (this.showPreview) {
            msgBox.querySelector(".folderSummary-previewText").textContent =
              msgHdr.getStringProperty("preview") || "";
          }
          this.appendChild(msgBox);
          haveMsgsToShow = true;
        }
      }
      return haveMsgsToShow;
    }

    /**
     * Render NEW messages in a folder.
     *
     * @param {nsIMsgFolder} folder - A real folder containing new messages.
     * @param {number[]} msgKeys - The keys of new messages.
     */
    render(folder, msgKeys) {
      const msgDatabase = folder.msgDatabase;
      for (const msgKey of msgKeys.slice(0, this.maxMsgHdrsInPopup)) {
        const msgBox = MozFolderSummary.createFolderSummaryMessage();
        const msgHdr = msgDatabase.getMsgHdrForKey(msgKey);
        msgBox.addEventListener("click", event => {
          if (event.button !== 0) {
            return;
          }
          this.MailUtils.displayMessageInFolderTab(msgHdr, true);
        });

        if (this.showSubject) {
          let msgSubject = msgHdr.mime2DecodedSubject;
          const kMsgFlagHasRe = 0x0010; // MSG_FLAG_HAS_RE
          if (msgHdr.flags & kMsgFlagHasRe) {
            msgSubject = msgSubject ? "Re: " + msgSubject : "Re: ";
          }
          msgBox.querySelector(".folderSummary-subject").textContent =
            msgSubject;
        }

        if (this.showSender) {
          const addrs = MailServices.headerParser.parseEncodedHeader(
            msgHdr.author,
            msgHdr.effectiveCharset,
            false
          );
          const folderSummarySender = msgBox.querySelector(
            ".folderSummary-sender"
          );
          // Set the label value instead of textContent to avoid wrapping.
          folderSummarySender.value =
            addrs.length > 0 ? addrs[0].name || addrs[0].email : "";
          if (addrs.length > 1) {
            const andOthersStr =
              this.messengerBundle.GetStringFromName("andOthers");
            folderSummarySender.value += " " + andOthersStr;
          }
        }

        if (this.showPreview) {
          msgBox.querySelector(".folderSummary-previewText").textContent =
            msgHdr.getStringProperty("preview") || "";
        }
        this.appendChild(msgBox);
      }
    }
  }
  customElements.define("folder-summary", MozFolderSummary);
}
