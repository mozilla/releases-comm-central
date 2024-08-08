/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* globals MozXULElement */

// Wrap in a block to prevent leaking to window scope.
{
  var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
  /**
   * A calendar-notifications-setting provides controls to config notifications
   * times of a calendar.
   *
   * @augments {MozXULElement}
   */
  class CalendarNotificationsSetting extends MozXULElement {
    connectedCallback() {
      MozXULElement.insertFTLIfNeeded("calendar/calendar-widgets.ftl");
    }

    /**
     * @type {string} A string in the form of "PT5M PT0M" to represent the notifications times.
     */
    get value() {
      return [...this._elList.children]
        .map(row => {
          const count = row.querySelector("input").value;
          const unit = row.querySelector(".unit-menu").value;
          let [relation, tag] = row.querySelector(".relation-menu").value.split("-");

          tag = tag == "END" ? "END:" : "";
          relation = relation == "before" ? "-" : "";
          const durTag = unit == "D" ? "P" : "PT";
          return `${tag}${relation}${durTag}${count}${unit}`;
        })
        .join(",");
    }

    set value(value) {
      // An array of notifications times, each item is in the form of [5, "M",
      // "before-start"], i.e. a triple of time, unit and relation.
      const items = [];
      const durations = value?.split(",") || [];
      for (let dur of durations) {
        dur = dur.trim();
        if (!dur) {
          continue;
        }
        let [relation, value] = dur.split(":");
        if (!value) {
          value = relation;
          relation = "START";
        }
        if (value.startsWith("-")) {
          relation = `before-${relation}`;
          value = value.slice(1);
        } else {
          relation = `after-${relation}`;
        }
        let prefix = value.slice(0, 2);
        if (prefix != "PT") {
          prefix = value[0];
        }
        const unit = value.slice(-1);
        if ((prefix == "P" && unit != "D") || (prefix == "PT" && !["M", "H"].includes(unit))) {
          continue;
        }
        value = value.slice(prefix.length, -1);
        items.push([value, unit, relation]);
      }
      this._render(items);
    }

    /**
     * @type {boolean} If true, all form controls should be disabled.
     */
    set disabled(disabled) {
      this._disabled = disabled;
      this._updateDisabled();
    }

    /**
     * Update the disabled attributes of all form controls to this._disabled.
     */
    _updateDisabled() {
      for (const el of this.querySelectorAll("label, input, button, menulist")) {
        el.disabled = this._disabled;
      }
    }

    /**
     * Because form controls can be dynamically added/removed, we bind events to
     * _elButtonAdd and _elList.
     */
    _bindEvents() {
      this._elButtonAdd.addEventListener("click", () => {
        // Add a notification time row.
        this._addNewRow(0, "M", "before-START");
        this._emit();
      });

      this._elList.addEventListener("change", e => {
        if (!HTMLInputElement.isInstance(e.target)) {
          // We only care about change event of input elements.
          return;
        }
        // We don't want this to interfere with the 'change' event emitted by
        // calendar-notifications-setting itself.
        e.stopPropagation();
        this._updateMenuLists();
        this._emit();
      });

      this._elList.addEventListener("command", e => {
        const el = e.target;
        if (el.tagName == "menuitem") {
          this._emit();
        } else if (el.tagName == "button") {
          // Remove a notification time row.
          el.closest("hbox").remove();
          this._updateAddButton();
          this._emit();
        }
      });
    }

    /**
     * Render the layout and the add button, then bind events. This is delayed
     * until the first `set value` call, so that l10n works correctly.
     */
    _renderLayout() {
      this.appendChild(
        MozXULElement.parseXULToFragment(`
          <hbox align="center">
            <label data-l10n-id="calendar-notifications-label"></label>
            <spacer flex="1"></spacer>
            <button class="add-button"
                    data-l10n-id="calendar-add-notification-button"/>
          </hbox>
          <separator class="thin"/>
          <vbox class="calendar-notifications-list indent"></vbox>
          `)
      );
      this._elList = this.querySelector(".calendar-notifications-list");
      this._elButtonAdd = this.querySelector("button");
      this._bindEvents();
    }

    /**
     * Render this_items to a list of rows.
     *
     * @param {Array<[number, string, string]>} items - An array of count, unit and relation.
     */
    _render(items) {
      this._renderLayout();

      // Render a row for each item in this._items.
      items.forEach(([value, unit, relation]) => {
        this._addNewRow(value, unit, relation);
      });
      if (items.length) {
        this._updateMenuLists();
        this._updateDisabled();
      }
    }

    /**
     * Render a notification entry to a row. Each row contains a time input, a
     * unit menulist, a relation menulist and a remove button.
     */
    _addNewRow(value, unit, relation) {
      const fragment = MozXULElement.parseXULToFragment(`
        <hbox class="calendar-notifications-row" align="center">
          <html:input class="size3" value="${value}" type="number" min="0"/>
          <menulist class="unit-menu" crop="none" value="${unit}">
            <menupopup>
              <menuitem value="M"/>
              <menuitem value="H"/>
              <menuitem value="D"/>
            </menupopup>
          </menulist>
          <menulist class="relation-menu" crop="none" value="${relation}">
            <menupopup class="reminder-relation-origin-menupopup">
              <menuitem data-l10n-id="reminder-custom-origin-begin-before-event-dom"
                        value="before-START"/>
              <menuitem data-l10n-id="reminder-custom-origin-begin-after-event-dom"
                        value="after-START"/>
              <menuitem data-l10n-id="reminder-custom-origin-end-before-event-dom"
                        value="before-END"/>
              <menuitem data-l10n-id="reminder-custom-origin-end-after-event-dom"
                        value="after-END"/>
            </menupopup>
          </menulist>
          <button class="remove-button"></button>
        </hbox>
      `);
      this._elList.appendChild(fragment);
      this._updateMenuLists();
      this._updateAddButton();
    }

    /**
     * To prevent a too crowded UI, hide the add button if already have 5 rows.
     */
    _updateAddButton() {
      if (this._elList.childElementCount >= 5) {
        this._elButtonAdd.hidden = true;
      } else {
        this._elButtonAdd.hidden = false;
      }
    }

    /**
     * Iterate all rows, update the plurality of menulist (unit) to the input
     * value (time).
     */
    _updateMenuLists() {
      for (const row of this._elList.children) {
        const input = row.querySelector("input");
        const menulist = row.querySelector(".unit-menu");
        this._updateMenuList(Number(input.value), menulist);
      }
    }

    /**
     * Update the plurality of a menulist (unit) options to the input value (time).
     */
    _updateMenuList(count, menu) {
      const getUnitEntry = unit =>
        ({
          M: "event-duration-menuitem-minutes",
          H: "event-duration-menuitem-hours",
          D: "event-duration-menuitem-days",
        }[unit] || "event-duration-menuitem-minutes");

      for (const menuItem of menu.getElementsByTagName("menuitem")) {
        document.l10n.setAttributes(menuItem, getUnitEntry(menuItem.value), {
          count,
        });
      }
    }

    /**
     * Emit a change event.
     */
    _emit() {
      this.dispatchEvent(new CustomEvent("change", { detail: this.value }));
    }
  }

  customElements.define("calendar-notifications-setting", CalendarNotificationsSetting);
}
