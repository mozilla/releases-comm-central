/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

import { TreeViewTableRow } from "chrome://messenger/content/tree-view.mjs";

/**
 * The tr element row of the TreeView table for the cards view layout.
 *
 * @note The main child is a clone of the `#threadPaneCardTemplate` template.
 * @extends TreeViewTableRow
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

    this.appendChild(
      document.getElementById("threadPaneCardTemplate").content.cloneNode(true)
    );

    this.senderLine = this.querySelector(".sender");
    this.subjectLine = this.querySelector(".subject");
    this.dateLine = this.querySelector(".date");
    this.starButton = this.querySelector(".button-star");
    this.threadCardTagsInfo = this.querySelector(".thread-card-tags-info");
    this.tagIcons = this.querySelectorAll(".tag-icon");
    this.tagsMore = this.querySelector(".tag-more");
    this.replies = this.querySelector(".thread-replies");
    this.sortHeaderDetails = this.querySelector(".sort-header-details");
  }

  get index() {
    return super.index;
  }

  set index(index) {
    super.index = index;

    // XPCOM calls here must be keep to a minimum. Collect all of the
    // required data in one go.
    const properties = {};
    const threadLevel = {};

    const cellTexts = this.view.cellDataForColumns(
      index,
      window.threadPane.cardColumns,
      properties,
      threadLevel
    );

    // Collect the various strings and fluent IDs to build the full string for
    // the message row aria-label.
    const ariaLabelPromises = [];
    // Use static mapping instead of threadPane.cardColumns since the name of
    // the sender column changes. (see getProperSenderForCardsView)
    const KEYS = ["subject", "sender", "date", "tags", "total", "unread"];
    const data = Object.fromEntries(KEYS.map((key, i) => [key, cellTexts[i]]));

    if (threadLevel.value) {
      properties.value += " thread-children";
    }
    const propertiesSet = new Set(properties.value.split(" "));
    this.dataset.properties = properties.value.trim();

    this.subjectLine.textContent = data.subject;
    this.subjectLine.title = data.subject;
    this.senderLine.textContent = data.sender;
    this.senderLine.title = data.sender;
    this.dateLine.textContent = data.date;

    if (propertiesSet.has("dummy")) {
      if (data.unread) {
        document.l10n.setAttributes(
          this.sortHeaderDetails,
          "threadpane-sort-header-unread",
          {
            unread: data.unread,
            total: data.total,
          }
        );
      } else {
        document.l10n.setAttributes(
          this.sortHeaderDetails,
          "threadpane-sort-header",
          {
            total: data.total,
          }
        );
      }
    }

    let tagColor;
    const matchesTags = [];
    const matchesColors = [];
    for (const tag of MailServices.tags.getAllTags()) {
      if (data.tags.includes(tag.tag)) {
        matchesTags.push(tag.tag);
        tagColor = tag.color;
        matchesColors.push(tagColor);
      }
    }
    this.threadCardTagsInfo.title = matchesTags.join(", ");

    // Clears the text span displaying the extra amount of the tags to prevent stale content.
    const tagCount = matchesTags.length;
    this.tagsMore.hidden = tagCount <= 3;

    // Show or hide tags based on its index and the amount of tags.
    for (const [tagIndex, tag] of this.tagIcons.entries()) {
      tag.hidden = tagIndex >= tagCount;
      // If any tag is active, we reset the tags colors.
      tag.style.setProperty("--tag-color", matchesColors[tagIndex]);
    }

    // Updates the text span displaying the extra amount of the tags
    if (tagCount > 3) {
      this.tagsMore.hidden = false;
      this.tagsMore.textContent = new Intl.NumberFormat(
        Services.locale.appLocaleAsBCP47,
        {
          signDisplay: "always",
        }
      ).format(tagCount - 3);
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
