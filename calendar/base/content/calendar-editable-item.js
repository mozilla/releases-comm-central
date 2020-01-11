/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global MozElements, MozXULElement, setBooleanAttribute, onMouseOverItem
   invokeEventDragSession, setElementValue */

"use strict";

// Wrap in a block to prevent leaking to window scope.
{
  var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
  var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
  /**
   * The MozCalendarEditableItem widget is used as a full day event item in the
   * Day and Week views of the calendar. It displays the event name, alarm icon
   * and the category type color. It gets displayed in the header container of
   * the respective view of the calendar.
   *
   * @extends MozXULElement
   */
  class MozCalendarEditableItem extends MozXULElement {
    static get inheritedAttributes() {
      return {
        ".calendar-event-box-container":
          "readonly,flashing,alarm,allday,priority,progress,status,calendar,categories",
        ".calendar-category-box": "categories",
        ".alarm-icons-box": "flashing",
        ".calendar-event-details > vbox": "context",
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
          cal.acl.isCalendarWritable(this.mOccurrence.calendar)
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
          let item = event.ctrlKey ? this.mOccurrence.parentItem : this.mOccurrence;
          this.calendarView.controller.modifyOccurrence(item);
        }
      });

      this.addEventListener("mouseover", event => {
        if (this.calendarView && this.calendarView.controller) {
          event.stopPropagation();
          onMouseOverItem(event);
        }
      });

      // We have two event listeners for dragstart. This event listener is for the capturing phase.
      this.addEventListener("dragstart", event => {
        if (document.monthDragEvent.localName == "calendar-event-box") {
          return;
        }
        let item = this.occurrence;
        let isInvitation =
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
          <vbox flex="1">
            <hbox>
              <box class="calendar-color-box"
                   flex="1">
                <box class="calendar-event-selection"
                     orient="horizontal"
                     flex="1">
                  <stack class="calendar-event-box-container"
                         flex="1">
                    <hbox class="calendar-event-details">
                      <vbox align="start"
                            flex="1">
                        <label class="event-name-label"
                               crop="end"
                               style="margin: 0;">
                        </label>
                        <html:input class="calendar-event-details-core title-desc"
                                    hidden="hidden"
                                    style="background: transparent !important;"/>
                        <label crop="end"
                               class="calendar-event-details-core location-desc">
                        </label>
                        <spacer flex="1">
                        </spacer>
                      </vbox>
                      <hbox>
                        <hbox align="center">
                          <hbox class="alarm-icons-box"
                                align="center">
                          </hbox>
                          <image class="item-classification-box"
                                 pack="end">
                          </image>
                        </hbox>
                        <hbox class="calendar-category-box category-color-box calendar-event-selection"
                              flex="1" pack="end">
                          <image class="calendar-category-box-gradient">
                          </image>
                        </hbox>
                      </hbox>
                    </hbox>
                  </stack>
                </box>
              </box>
            </hbox>
          </vbox>
        `)
      );

      // We have two event listeners for dragstart. This event listener is for the bubbling phase
      // where we are setting up the document.monthDragEvent which will be used in the event listener
      // in the capturing phase.
      this.addEventListener(
        "dragstart",
        event => {
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
      } else if (!val && this.mSelected) {
        this.mSelected = false;
        this.removeAttribute("selected");
      }
      return val;
    }

    get selected() {
      return this.mSelected;
    }

    set calendarView(val) {
      this.mCalendarView = val;
      return val;
    }

    get calendarView() {
      return this.mCalendarView;
    }

    set occurrence(val) {
      this.mOccurrence = val;
      this.setEditableLabel();
      this.setLocationLabel();
      this.setCSSClasses();
      return val;
    }

    get occurrence() {
      return this.mOccurrence;
    }

    get eventNameLabel() {
      return this.querySelector(".event-name-label");
    }

    get eventNameTextbox() {
      return this.querySelector(".title-desc");
    }

    addEventNameTextboxListener() {
      let stopPropagationIfEditing = event => {
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
      let label = this.eventNameLabel;
      let item = this.mOccurrence;
      label.value = item.title
        ? item.title.replace(/\n/g, " ")
        : cal.l10n.getCalString("eventUntitled");
    }

    setLocationLabel() {
      let locationLabel = this.querySelector(".location-desc");
      let location = this.mOccurrence.getProperty("LOCATION");
      let showLocation = Services.prefs.getBoolPref("calendar.view.showLocation", false);

      locationLabel.value = showLocation && location ? location : "";
      setBooleanAttribute(locationLabel, "hidden", !showLocation || !location);
    }

    setCSSClasses() {
      let item = this.mOccurrence;
      let cssSafeId = cal.view.formatStringForCSSRule(item.calendar.id);
      this.style.setProperty("--item-backcolor", `var(--calendar-${cssSafeId}-backcolor)`);
      this.style.setProperty("--item-forecolor", `var(--calendar-${cssSafeId}-forecolor)`);
      let categoriesArray = item.getCategories();
      if (categoriesArray.length > 0) {
        let cssClassesArray = categoriesArray.map(cal.view.formatStringForCSSRule);
        this.setAttribute("categories", cssClassesArray.join(" "));
        let categoriesBox = this.querySelector(".calendar-category-box");
        categoriesBox.style.backgroundColor = `var(--category-${cssClassesArray[0]}-color)`;
      }

      // Add alarm icons as needed.
      let alarms = item.getAlarms();
      if (alarms.length && Services.prefs.getBoolPref("calendar.alarms.indicator.show", true)) {
        let iconsBox = this.querySelector(".alarm-icons-box");
        cal.alarms.addReminderImages(iconsBox, alarms);

        // Set suppressed status on the icons box.
        setElementValue(
          iconsBox,
          item.calendar.getProperty("suppressAlarms") || false,
          "suppressed"
        );
      }

      // Item classification / privacy.
      let classificationBox = this.querySelector(".item-classification-box");
      if (classificationBox) {
        classificationBox.setAttribute("classification", item.privacy || "PUBLIC");
      }

      // Set up event box attributes for use in css selectors. Note if
      // something is added here, it should also be inherited correctly
      // in the <content> section of this custom element, and all that inherit it.

      // Event type specific properties.
      if (cal.item.isEvent(item)) {
        if (item.startDate.isDate) {
          this.setAttribute("allday", "true");
        }
        this.setAttribute("itemType", "event");
      } else if (cal.item.isToDo(item)) {
        // Progress attribute.
        this.setAttribute("progress", cal.item.getProgressAtom(item));
        // Attribute for tasks and tasks image.
        this.setAttribute("itemType", "todo");
        if (item.entryDate && !item.dueDate) {
          this.setAttribute("todoType", "start");
        } else if (!item.entryDate && item.dueDate) {
          this.setAttribute("todoType", "end");
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
        this.setAttribute("readonly", "true");
      } else if (!cal.acl.isCalendarWritable(item.calendar)) {
        this.setAttribute("readonly", "true");
      }
    }

    startEditing() {
      this.editingTimer = null;
      this.mOriginalTextLabel = this.mOccurrence.title;

      this.eventNameLabel.setAttribute("hidden", "true");

      this.mEditing = true;

      this.eventNameTextbox.value = this.mOriginalTextLabel;
      this.eventNameTextbox.removeAttribute("hidden");
      this.eventNameTextbox.focus();
    }

    select(event) {
      if (!this.calendarView) {
        return;
      }
      let items = this.calendarView.mSelectedItems.slice();
      if (event.ctrlKey || event.metaKey) {
        if (this.selected) {
          let pos = items.indexOf(this.mOccurrence);
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
          this.eventNameTextbox.value
        );

        // Note that as soon as we do the modifyItem, this element ceases to exist,
        // so don't bother trying to modify anything further here! ('this' exists,
        // because it's being kept alive, but our child content etc. is all gone).
        return;
      }

      this.eventNameTextbox.setAttribute("hidden", "hidden");
      this.eventNameLabel.removeAttribute("hidden");
    }
  }

  MozElements.MozCalendarEditableItem = MozCalendarEditableItem;

  customElements.define("calendar-editable-item", MozCalendarEditableItem);
}
