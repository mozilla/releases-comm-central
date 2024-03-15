/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { TreeViewTableRow } from "chrome://messenger/content/tree-view.mjs";

/**
 * The tr element row of the TreeView table.
 *
 * @note The main child is a clone of the `#threadPaneRowTemplate` template.
 * @extends TreeViewTableRow
 * @tagname thread-row
 */
class ThreadRow extends TreeViewTableRow {
  /**
   * The default height of the table row.
   */
  static ROW_HEIGHT = 22;

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }

    super.connectedCallback();

    this.setAttribute("draggable", "true");
    this.appendChild(
      document.getElementById("threadPaneRowTemplate").content.cloneNode(true)
    );
  }

  get index() {
    return super.index;
  }

  set index(index) {
    super.index = index;

    // Check if a only a single column should be updated.
    const columns = this.invalidateSingleColumn
      ? window.threadPane.columns.filter(
          column => column.id == this.invalidateSingleColumn
        )
      : window.threadPane.columns;

    const textColumns = [];
    for (const column of columns) {
      // No need to update the text of this cell if it's hidden, the selection
      // column, or a non-custom icon column that doesn't match a specific flag.
      if (column.hidden || (!column.custom && column.icon) || column.select) {
        continue;
      }
      textColumns.push(column.id);
    }

    // XPCOM calls here must be keep to a minimum. Collect all of the
    // required data in one go.
    const properties = {};
    const threadLevel = {};
    const cellTexts = this.view.cellDataForColumns(
      index,
      textColumns,
      properties,
      threadLevel
    );

    // Collect the various strings and fluent IDs to build the full string for
    // the message row aria-label.
    const ariaLabelPromises = [];

    const propertiesSet = new Set(properties.value.split(" "));
    const isDummyRow = propertiesSet.has("dummy");

    this.dataset.properties = properties.value.trim();

    for (const column of columns) {
      // Skip this column if it's hidden.
      if (column.hidden) {
        continue;
      }
      const cell = this.querySelector(`.${column.id.toLowerCase()}-column`);
      const textIndex = textColumns.indexOf(column.id);

      // Special case for the subject column.
      if (column.id == "subjectCol") {
        const div = cell.querySelector(".subject-line");

        // Indent child message of this thread.
        div.style.setProperty(
          "--thread-level",
          window.gViewWrapper.showGroupedBySort ? 0 : threadLevel.value
        );

        const imageFluentID = this.#getMessageIndicatorString(propertiesSet);
        const image = div.querySelector("img");
        if (imageFluentID && !isDummyRow) {
          document.l10n.setAttributes(image, imageFluentID);
        } else {
          image.removeAttribute("data-l10n-id");
          image.alt = "";
        }

        const span = div.querySelector("span");
        span.textContent = cellTexts[textIndex];
        document.l10n.setAttributes(cell, column.l10n.cell, {
          title: cellTexts[textIndex],
        });
        ariaLabelPromises.push(cellTexts[textIndex]);
        continue;
      }

      // Only set the aria-label. The selection state is communicated via the
      // aria-activedescendant.
      if (["selectCol", "deleteCol"].includes(column.id)) {
        document.l10n.setAttributes(cell, column.l10n.cell);
        continue;
      }

      if (column.id == "threadCol") {
        let buttonL10nId, labelString;
        if (propertiesSet.has("ignore")) {
          buttonL10nId = "tree-list-view-row-ignored-thread-button";
          labelString = "tree-list-view-row-ignored-thread";
        } else if (propertiesSet.has("ignoreSubthread")) {
          buttonL10nId = "tree-list-view-row-ignored-subthread-button";
          labelString = "tree-list-view-row-ignored-subthread";
        } else if (propertiesSet.has("watch")) {
          buttonL10nId = "tree-list-view-row-watched-thread-button";
          labelString = "tree-list-view-row-watched-thread";
        } else if (this.classList.contains("children")) {
          buttonL10nId = "tree-list-view-row-thread-button";
        }

        const button = cell.querySelector("button");
        if (buttonL10nId) {
          document.l10n.setAttributes(button, buttonL10nId);
        }
        if (labelString) {
          ariaLabelPromises.push(document.l10n.formatValue(labelString));
        }
        document.l10n.setAttributes(cell, column.l10n.cell);
        continue;
      }

      if (column.id == "flaggedCol") {
        const button = cell.querySelector("button");
        if (propertiesSet.has("flagged")) {
          document.l10n.setAttributes(button, "tree-list-view-row-flagged");
          ariaLabelPromises.push(
            document.l10n.formatValue("threadpane-flagged-cell-label")
          );
        } else {
          document.l10n.setAttributes(button, "tree-list-view-row-flag");
        }
        document.l10n.setAttributes(cell, column.l10n.cell);
        continue;
      }

      if (column.id == "junkStatusCol") {
        const button = cell.querySelector("button");
        if (propertiesSet.has("junk")) {
          document.l10n.setAttributes(button, "tree-list-view-row-spam");
          ariaLabelPromises.push(
            document.l10n.formatValue("threadpane-spam-cell-label")
          );
        } else {
          document.l10n.setAttributes(button, "tree-list-view-row-not-spam");
        }
        document.l10n.setAttributes(cell, column.l10n.cell);
        continue;
      }

      if (column.id == "unreadButtonColHeader") {
        const button = cell.querySelector("button");
        if (propertiesSet.has("read")) {
          document.l10n.setAttributes(button, "tree-list-view-row-read");
          ariaLabelPromises.push(
            document.l10n.formatValue("threadpane-read-cell-label")
          );
        } else {
          document.l10n.setAttributes(button, "tree-list-view-row-not-read");
          ariaLabelPromises.push(
            document.l10n.formatValue("threadpane-unread-cell-label")
          );
        }
        document.l10n.setAttributes(cell, column.l10n.cell);
        continue;
      }

      if (column.id == "attachmentCol") {
        if (propertiesSet.has("attach")) {
          const img = cell.querySelector("img");
          document.l10n.setAttributes(img, "tree-list-view-row-attach");
          ariaLabelPromises.push(
            document.l10n.formatValue("threadpane-attachments-cell-label")
          );
        }
        document.l10n.setAttributes(cell, column.l10n.cell);
        continue;
      }

      if (column.id == "locationCol") {
        const prettyPath = cellTexts[textIndex].split("/");
        cell.textContent = Array.isArray(prettyPath)
          ? prettyPath.at(-1)
          : cellTexts[textIndex];
        document.l10n.setAttributes(cell, column.l10n.cell, {
          title: cellTexts[textIndex],
        });
        ariaLabelPromises.push(cellTexts[textIndex]);
        continue;
      }

      if (column.custom && column.icon) {
        // For simplicity, custom icon columns return the cellIconId as their
        // cell text.
        const cellIconId = cellTexts[textIndex];
        const images = cell.querySelectorAll("img");
        for (const image of images) {
          image.hidden = !cellIconId.includes(image.dataset.cellIconId);
        }
        continue;
      }

      if (textIndex >= 0) {
        if (isDummyRow) {
          cell.textContent = "";
          continue;
        }
        cell.textContent = cellTexts[textIndex];
        document.l10n.setAttributes(cell, column.l10n.cell, {
          title: cellTexts[textIndex],
        });
        ariaLabelPromises.push(cellTexts[textIndex]);
      }
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

  /**
   * Find the fluent ID matching the current message state.
   *
   * @param {Set} propertiesSet - The Set() of properties for the row.
   * @returns {?string} - The fluent ID string if we found one, otherwise null.
   */
  #getMessageIndicatorString(propertiesSet) {
    // Bail out early if this is a new message since it can't be anything else.
    if (propertiesSet.has("new")) {
      return "threadpane-message-new";
    }

    const isReplied = propertiesSet.has("replied");
    const isForwarded = propertiesSet.has("forwarded");
    const isRedirected = propertiesSet.has("redirected");

    if (isReplied && !isForwarded && !isRedirected) {
      return "threadpane-message-replied";
    }

    if (isRedirected && !isForwarded && !isReplied) {
      return "threadpane-message-redirected";
    }

    if (isForwarded && !isReplied && !isRedirected) {
      return "threadpane-message-forwarded";
    }

    if (isReplied && isForwarded && !isRedirected) {
      return "threadpane-message-replied-forwarded";
    }

    if (isReplied && isRedirected && !isForwarded) {
      return "threadpane-message-replied-redirected";
    }

    if (isForwarded && isRedirected && !isReplied) {
      return "threadpane-message-forwarded-redirected";
    }

    if (isReplied && isForwarded && isRedirected) {
      return "threadpane-message-replied-forwarded-redirected";
    }

    return null;
  }
}
customElements.define("thread-row", ThreadRow, { extends: "tr" });
