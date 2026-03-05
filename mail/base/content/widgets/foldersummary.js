/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

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
            folderSummarySender.value +=
              " " + MozFolderSummary.l10n.formatValueSync("and-others");
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

  ChromeUtils.defineLazyGetter(
    MozFolderSummary,
    "l10n",
    () => new Localization(["messenger/messenger.ftl"], true)
  );
}
