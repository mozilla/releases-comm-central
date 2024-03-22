/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global MozElements, MozXULElement, onMouseOverItem, invokeEventDragSession */

"use strict";

// Wrap in a block to prevent leaking to window scope.
{
  var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
  /**
   * The MozCalendarEditableItem widget is used as a full day event item in the
   * Day and Week views of the calendar. It displays the event name, alarm icon
   * and the category type color. It gets displayed in the header container of
   * the respective view of the calendar.
   *
   * @augments MozXULElement
   */
  class MozCalendarEditableItem extends MozXULElement {
    static get inheritedAttributes() {
      return {
        ".alarm-icons-box": "flashing",
      };
    }
    constructor() {
      super();

      this.mOccurrence = null;

      this.mSelected = false;

      this.mCalendarView = null;

      this.addEventListener(
        "contextmenu",
        event => {
          // If the middle/right button was used for click just select the item.
          if (!this.selected) {
            this.select(event);
          }
        },
        true
      );

      this.addEventListener("click", event => {
        if (event.button != 0 || this.mEditing) {
          return;
        }

        // If the left button was used and the item is already selected
        // and there are no multiple items selected start
        // the 'single click edit' timeout. Otherwise select the item too.
        // Also, check if the calendar is readOnly or we are offline.

        if (
          this.selected &&
          !(event.ctrlKey || event.metaKey) &&
          cal.acl.isCalendarWritable(this.mOccurrence.calendar) &&
          !cal.itip.isInvitation(this.mOccurrence)
        ) {
          if (this.editingTimer) {
            clearTimeout(this.editingTimer);
          }
          this.editingTimer = setTimeout(() => this.startEditing(), 350);
        } else {
          this.select(event);
          if (!this.closest("richlistitem")) {
            event.stopPropagation();
          }
        }
      });

      this.addEventListener("dblclick", event => {
        if (event.button != 0) {
          return;
        }

        event.stopPropagation();

        // Stop 'single click edit' timeout (if started).
        if (this.editingTimer) {
          clearTimeout(this.editingTimer);
          this.editingTimer = null;
        }

        if (this.calendarView && this.calendarView.controller) {
          const item = event.ctrlKey ? this.mOccurrence.parentItem : this.mOccurrence;
          if (Services.prefs.getBoolPref("calendar.events.defaultActionEdit", true)) {
            this.calendarView.controller.modifyOccurrence(item);
            return;
          }
          this.calendarView.controller.viewOccurrence(item);
        }
      });

      this.addEventListener("mouseover", event => {
        if (this.calendarView && this.calendarView.controller) {
          event.stopPropagation();
          onMouseOverItem(event);
        }
      });

      // We have two event listeners for dragstart. This event listener is for the bubbling phase.
      this.addEventListener("dragstart", event => {
        if (document.monthDragEvent?.localName == "calendar-event-box") {
          return;
        }
        const item = this.occurrence;
        const isInvitation =
          item.calendar instanceof Ci.calISchedulingSupport && item.calendar.isInvitation(item);
        if (
          !cal.acl.isCalendarWritable(item.calendar) ||
          !cal.acl.userCanModifyItem(item) ||
          isInvitation
        ) {
          return;
        }
        if (!this.selected) {
          this.select(event);
        }
        invokeEventDragSession(item, this);
      });
    }

    connectedCallback() {
      if (this.delayConnectedCallback() || this.hasChildNodes()) {
        return;
      }
      this.appendChild(
        MozXULElement.parseXULToFragment(`
          <html:div class="calendar-item-flex">
            <html:img class="item-type-icon" alt="" />
            <html:div class="event-name-label"></html:div>
            <html:input class="plain event-name-input"
                        hidden="hidden"
                        placeholder='${cal.l10n.getCalString("newEvent")}'/>
            <html:div class="alarm-icons-box"></html:div>
            <html:img class="item-classification-icon" />
            <html:img class="item-recurrence-icon" />
          </html:div>
          <html:div class="location-desc"></html:div>
          <html:div class="calendar-category-box"></html:div>
        `)
      );

      this.classList.add("calendar-color-box", "calendar-item-container");

      // We have two event listeners for dragstart. This event listener is for the capturing phase
      // where we are setting up the document.monthDragEvent which will be used in the event listener
      // in the bubbling phase.
      this.addEventListener(
        "dragstart",
        () => {
          document.monthDragEvent = this;
        },
        true
      );

      this.style.pointerEvents = "auto";
      this.setAttribute("tooltip", "itemTooltip");
      this.setAttribute("tabindex", "-1");
      this.addEventNameTextboxListener();
      this.initializeAttributeInheritance();
    }

    set parentBox(val) {
      this.mParentBox = val;
    }

    get parentBox() {
      return this.mParentBox;
    }

    set selected(val) {
      if (val && !this.mSelected) {
        this.mSelected = true;
        this.setAttribute("selected", "true");
        this.focus();
      } else if (!val && this.mSelected) {
        this.mSelected = false;
        this.removeAttribute("selected");
        this.blur();
      }
    }

    get selected() {
      return this.mSelected;
    }

    set calendarView(val) {
      this.mCalendarView = val;
    }

    get calendarView() {
      return this.mCalendarView;
    }

    set occurrence(val) {
      this.mOccurrence = val;
      this.setEditableLabel();
      this.setLocationLabel();
      this.setCSSClasses();
    }

    get occurrence() {
      return this.mOccurrence;
    }

    get eventNameLabel() {
      return this.querySelector(".event-name-label");
    }

    get eventNameTextbox() {
      return this.querySelector(".event-name-input");
    }

    addEventNameTextboxListener() {
      const stopPropagationIfEditing = event => {
        if (this.mEditing) {
          event.stopPropagation();
        }
      };
      // While editing, single click positions cursor, so don't propagate.
      this.eventNameTextbox.onclick = stopPropagationIfEditing;
      // While editing, double click selects words, so don't propagate.
      this.eventNameTextbox.ondblclick = stopPropagationIfEditing;
      // While editing, don't propagate mousedown/up (selects calEvent).
      this.eventNameTextbox.onmousedown = stopPropagationIfEditing;
      this.eventNameTextbox.onmouseup = stopPropagationIfEditing;
      this.eventNameTextbox.onblur = () => {
        this.stopEditing(true);
      };
      this.eventNameTextbox.onkeypress = event => {
        if (event.key == "Enter") {
          // Save on enter.
          this.stopEditing(true);
        } else if (event.key == "Escape") {
          // Abort on escape.
          this.stopEditing(false);
        }
      };
    }

    setEditableLabel() {
      const label = this.eventNameLabel;
      const item = this.mOccurrence;
      label.textContent = item.title
        ? item.title.replace(/\n/g, " ")
        : cal.l10n.getCalString("eventUntitled");
    }

    setLocationLabel() {
      const locationLabel = this.querySelector(".location-desc");
      const location = this.mOccurrence.getProperty("LOCATION");
      const showLocation = Services.prefs.getBoolPref("calendar.view.showLocation", false);

      locationLabel.textContent = showLocation && location ? location : "";
      locationLabel.hidden = !showLocation || !location;
    }

    setCSSClasses() {
      const item = this.mOccurrence;
      const cssSafeId = cal.view.formatStringForCSSRule(item.calendar.id);
      this.style.setProperty("--item-backcolor", `var(--calendar-${cssSafeId}-backcolor)`);
      this.style.setProperty("--item-forecolor", `var(--calendar-${cssSafeId}-forecolor)`);
      const categoriesBox = this.querySelector(".calendar-category-box");

      const categoriesArray = item.getCategories().map(cal.view.formatStringForCSSRule);
      // Find the first category with a colour.
      const firstCategory = categoriesArray.find(
        category => Services.prefs.getStringPref("calendar.category.color." + category, "") != ""
      );
      if (firstCategory) {
        categoriesBox.hidden = false;
        categoriesBox.style.backgroundColor = `var(--category-${firstCategory}-color)`;
      } else {
        categoriesBox.hidden = true;
      }

      // Add alarm icons as needed.
      const alarms = item.getAlarms();
      if (alarms.length && Services.prefs.getBoolPref("calendar.alarms.indicator.show", true)) {
        const iconsBox = this.querySelector(".alarm-icons-box");
        // Set suppressed status on the icons box.
        iconsBox.toggleAttribute("suppressed", item.calendar.getProperty("suppressAlarms"));

        cal.alarms.addReminderImages(iconsBox, alarms);
      }

      // Item classification / privacy.
      const classificationIcon = this.querySelector(".item-classification-icon");
      if (classificationIcon) {
        switch (item.privacy) {
          case "PRIVATE":
            classificationIcon.setAttribute(
              "src",
              "chrome://calendar/skin/shared/icons/private.svg"
            );
            // Set the alt attribute.
            document.l10n.setAttributes(
              classificationIcon,
              "calendar-editable-item-privacy-icon-private"
            );
            break;
          case "CONFIDENTIAL":
            classificationIcon.setAttribute(
              "src",
              "chrome://calendar/skin/shared/icons/confidential.svg"
            );
            // Set the alt attribute.
            document.l10n.setAttributes(
              classificationIcon,
              "calendar-editable-item-privacy-icon-confidential"
            );
            break;
          default:
            classificationIcon.removeAttribute("src");
            classificationIcon.removeAttribute("data-l10n-id");
            classificationIcon.setAttribute("alt", "");
            break;
        }
      }

      const recurrenceIcon = this.querySelector(".item-recurrence-icon");
      if (item.parentItem != item && item.parentItem.recurrenceInfo) {
        if (item.parentItem.recurrenceInfo.getExceptionFor(item.recurrenceId)) {
          recurrenceIcon.setAttribute(
            "src",
            "chrome://messenger/skin/icons/new/recurrence-exception.svg"
          );
          document.l10n.setAttributes(
            recurrenceIcon,
            "calendar-editable-item-recurrence-exception"
          );
        } else {
          recurrenceIcon.setAttribute("src", "chrome://messenger/skin/icons/new/recurrence.svg");
          document.l10n.setAttributes(recurrenceIcon, "calendar-editable-item-recurrence");
        }
        recurrenceIcon.hidden = false;
      } else {
        recurrenceIcon.removeAttribute("src");
        recurrenceIcon.removeAttribute("data-l10n-id");
        recurrenceIcon.setAttribute("alt", "");
        recurrenceIcon.hidden = true;
      }

      // Event type specific properties.
      if (item.isEvent() && item.startDate.isDate) {
        this.setAttribute("allday", "true");
      }
      if (item.isTodo()) {
        const icon = this.querySelector(".item-type-icon");
        if (cal.item.getProgressAtom(item) === "completed") {
          icon.setAttribute("src", "chrome://calendar/skin/shared/todo-complete.svg");
          document.l10n.setAttributes(icon, "calendar-editable-item-todo-icon-completed-task");
        } else {
          icon.setAttribute("src", "chrome://calendar/skin/shared/todo.svg");
          document.l10n.setAttributes(icon, "calendar-editable-item-todo-icon-task");
        }
      }

      if (this.calendarView && item.hashId in this.calendarView.mFlashingEvents) {
        this.setAttribute("flashing", "true");
      }

      if (alarms.length) {
        this.setAttribute("alarm", "true");
      }

      // Priority.
      if (item.priority > 0 && item.priority < 5) {
        this.setAttribute("priority", "high");
      } else if (item.priority > 5 && item.priority < 10) {
        this.setAttribute("priority", "low");
      }

      // Status attribute.
      if (item.status) {
        this.setAttribute("status", item.status.toUpperCase());
      }

      // Item class.
      if (item.hasProperty("CLASS")) {
        this.setAttribute("itemclass", item.getProperty("CLASS"));
      }

      // Calendar name.
      this.setAttribute("calendar", item.calendar.name.toLowerCase());

      // Invitation.
      if (cal.itip.isInvitation(item)) {
        this.setAttribute(
          "invitation-status",
          cal.itip.getInvitedAttendee(item).participationStatus
        );
      }
    }

    startEditing() {
      this.editingTimer = null;
      this.mOriginalTextLabel = this.mOccurrence.title;

      this.eventNameLabel.hidden = true;

      this.mEditing = true;

      this.eventNameTextbox.value = this.mOriginalTextLabel;
      this.eventNameTextbox.hidden = false;
      this.eventNameTextbox.focus();
    }

    get isEditing() {
      return this.mEditing || false;
    }

    select(event) {
      if (!this.calendarView) {
        return;
      }
      let items = this.calendarView.mSelectedItems.slice();
      if (event.ctrlKey || event.metaKey) {
        if (this.selected) {
          const pos = items.indexOf(this.mOccurrence);
          items.splice(pos, 1);
        } else {
          items.push(this.mOccurrence);
        }
      } else {
        items = [this.mOccurrence];
      }
      this.calendarView.setSelectedItems(items);
    }

    stopEditing(saveChanges) {
      if (!this.mEditing) {
        return;
      }

      this.mEditing = false;

      if (saveChanges && this.eventNameTextbox.value != this.mOriginalTextLabel) {
        this.calendarView.controller.modifyOccurrence(
          this.mOccurrence,
          null,
          null,
          this.eventNameTextbox.value || cal.l10n.getCalString("eventUntitled")
        );

        // Note that as soon as we do the modifyItem, this element ceases to exist,
        // so don't bother trying to modify anything further here! ('this' exists,
        // because it's being kept alive, but our child content etc. is all gone).
        return;
      }

      this.eventNameTextbox.hidden = true;
      this.eventNameLabel.hidden = false;
    }
  }

  MozElements.MozCalendarEditableItem = MozCalendarEditableItem;

  customElements.define("calendar-editable-item", MozCalendarEditableItem);
}
