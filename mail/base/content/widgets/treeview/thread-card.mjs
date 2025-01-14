/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

import { TreeViewTableRow } from "chrome://messenger/content/tree-view.mjs";

const tagsMoreFormatter = new Intl.NumberFormat(undefined, {
  signDisplay: "always",
});
const tagsTitleFormatter = new Intl.ListFormat();

/**
 * The tr element row of the TreeView table for the cards view layout.
 *
 * @note The main child is a clone of the `#threadPaneCardTemplate` template.
 * @augments {TreeViewTableRow}
 * @tagname thread-row
 */
class ThreadCard extends TreeViewTableRow {
  static ROW_HEIGHT = 46;

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }

    super.connectedCallback();

    this.setAttribute("draggable", "true");
    this.classList.add("card-layout");

    this.appendChild(
      document.getElementById("threadPaneCardTemplate").content.cloneNode(true)
    );

    this.senderLine = this.querySelector(".sender");
    this.subjectLine = this.querySelector(".subject");
    this.dateLine = this.querySelector(".date");
    this.messageSizeLine = this.querySelector(".message-size");
    this.starButton = this.querySelector(".button-star");
    this.threadCardTagsInfo = this.querySelector(".thread-card-tags-info");
    this.tagIcons = this.querySelectorAll(".tag-icon");
    this.tagsMore = this.querySelector(".tag-more");
    this.replies = this.querySelector(".thread-replies");
    this.sortHeaderDetails = this.querySelector(".sort-header-details");
  }

  _fillRow() {
    super._fillRow();

    // XPCOM calls here must be keep to a minimum. Collect all of the
    // required data in one go.
    const properties = {};
    const threadLevel = {};

    const cellTexts = this.view.cellDataForColumns(
      this._index,
      window.threadPane.cardColumns,
      properties,
      threadLevel
    );

    // Collect the various strings and fluent IDs to build the full string for
    // the message row aria-label.
    const ariaLabelPromises = [];
    // Use static mapping instead of threadPane.cardColumns since the name of
    // the sender column changes. (see getProperSenderForCardsView)
    const KEYS = ["subject", "sender", "date", "size", "tagKeys", "total", "unread"];
    const data = Object.fromEntries(KEYS.map((key, i) => [key, cellTexts[i]]));

    if (threadLevel.value) {
      properties.value += " thread-children";
    }
    const propertiesSet = new Set(properties.value.split(" "));
    this.dataset.properties = properties.value.trim();

    this.subjectLine.textContent = data.subject;
    this.subjectLine.title = data.subject;

    // Handle a different style and data if this is a dummy row.
    if (propertiesSet.has("dummy")) {
      const unread = Number(data.unread);
      const total = Number(data.total);

      if (unread) {
        document.l10n.setAttributes(
          this.sortHeaderDetails,
          "threadpane-sort-header-unread-count",
          {
            unread,
            total,
          }
        );
        return;
      }

      document.l10n.setAttributes(
        this.sortHeaderDetails,
        "threadpane-sort-header-count",
        {
          total,
        }
      );
      return;
    }

    this.senderLine.textContent = data.sender;
    this.senderLine.title = data.sender;
    this.dateLine.textContent = data.date;
    
    // Format and display message size
    const sizeInBytes = Number(data.size);
    let formattedSize;
    if (sizeInBytes >= 1024 * 1024) {
      formattedSize = `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`;
    } else if (sizeInBytes >= 1024) {
      formattedSize = `${Math.round(sizeInBytes / 1024)} KB`;
    } else {
      formattedSize = `${sizeInBytes} B`;
    }
    this.messageSizeLine.textContent = formattedSize;
    this.messageSizeLine.title = formattedSize;

    const matchedKeys = [];
    const matchedTags = [];
    for (const key of data.tagKeys.split(" ")) {
      try {
        const tag = MailServices.tags.getTagForKey(key);
        matchedKeys.push(key);
        matchedTags.push(tag);
      } catch (ex) {
        // `getTagForKey` throws if the tag doesn't exist.
      }
    }
    this.threadCardTagsInfo.title = tagsTitleFormatter.format(matchedTags);

    // Clears the text span displaying the extra amount of the tags to prevent stale content.
    const tagCount = matchedTags.length;
    this.tagsMore.hidden = tagCount <= 3;

    // Show or hide tags based on its index and the amount of tags.
    for (const [tagIndex, tag] of this.tagIcons.entries()) {
      tag.hidden = tagIndex >= tagCount;
      // If any tag is active, we reset the tags colors.
      tag.style.setProperty(
        "--tag-color",
        `var(--tag-${CSS.escape(matchedKeys[tagIndex])}-backcolor)`
      );
    }

    // Updates the text span displaying the extra amount of the tags
    if (tagCount > 3) {
      this.tagsMore.hidden = false;
      this.tagsMore.textContent = tagsMoreFormatter.format(tagCount - 3);
    }

    // Follow the layout order.
    ariaLabelPromises.push(data.sender);
    ariaLabelPromises.push(data.date);
    ariaLabelPromises.push(data.subject);
    ariaLabelPromises.push(data.tags);

    if (propertiesSet.has("flagged")) {
      document.l10n.setAttributes(
        this.starButton,
        "tree-list-view-row-flagged"
      );
      ariaLabelPromises.push(
        document.l10n.formatValue("threadpane-flagged-cell-label")
      );
    } else {
      document.l10n.setAttributes(this.starButton, "tree-list-view-row-flag");
    }

    if (propertiesSet.has("junk")) {
      ariaLabelPromises.push(
        document.l10n.formatValue("threadpane-spam-cell-label")
      );
    }

    if (propertiesSet.has("read")) {
      ariaLabelPromises.push(
        document.l10n.formatValue("threadpane-read-cell-label")
      );
    }

    if (propertiesSet.has("unread")) {
      ariaLabelPromises.push(
        document.l10n.formatValue("threadpane-unread-cell-label")
      );
    }

    if (propertiesSet.has("attach")) {
      ariaLabelPromises.push(
        document.l10n.formatValue("threadpane-attachments-cell-label")
      );
    }

    // Display number of replies in the twisty button.
    const repliesCount = parseInt(data.total) - 1;
    if (repliesCount > 0) {
      document.l10n.setAttributes(this.replies, "threadpane-replies", {
        count: repliesCount,
      });
    }

    Promise.allSettled(ariaLabelPromises).then(results => {
      this.setAttribute(
        "aria-label",
        results
          .map(settledPromise => settledPromise.value ?? "")
          .filter(value => value.trim() != "")
          .join(", ")
      );
    });
  }
}
customElements.define("thread-card", ThreadCard, {
  extends: "tr",
});
