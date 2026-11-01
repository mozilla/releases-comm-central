/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  DEFAULT_DIALOG_MARGIN,
  PositionedDialog,
} from "./positioned-dialog.mjs";
import { CalendarEventDialogSourceMixin } from "./calendar-event-dialog-source-mixin.mjs";
import "./calendar-dialog-acceptance.mjs"; // eslint-disable-line import-x/no-unassigned-import
import "./calendar-dialog-subview-manager.mjs"; // eslint-disable-line import-x/no-unassigned-import
import "./calendar-dialog-date-row.mjs"; // eslint-disable-line import-x/no-unassigned-import
import "./calendar-dialog-description-row.mjs"; // eslint-disable-line import-x/no-unassigned-import
import "./calendar-dialog-categories.mjs"; // eslint-disable-line import-x/no-unassigned-import
import "./calendar-dialog-reminders-row.mjs"; // eslint-disable-line import-x/no-unassigned-import
import "./calendar-dialog-attachments-list.mjs"; // eslint-disable-line import-x/no-unassigned-import
import "./calendar-dialog-attendees-row.mjs"; // eslint-disable-line import-x/no-unassigned-import

const { openLinkExternally } = ChromeUtils.importESModule(
  "resource:///modules/LinkHelper.sys.mjs"
);
// Eagerly loading modules, since we assume that an event will be displayed soon
// after this is loaded. Any module in an optional path for displaying an event
// should be lazy loaded, however.
const { cal } = ChromeUtils.importESModule(
  "resource:///modules/calendar/calUtils.sys.mjs"
);
const { recurrenceStringFromItem, countOccurrences } =
  ChromeUtils.importESModule(
    "resource:///modules/calendar/calRecurrenceUtils.sys.mjs"
  );

const { extractJoinLink } = ChromeUtils.importESModule(
  "resource:///modules/calendar/JoinLinkParser.sys.mjs"
);

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  openLinkExternally: "resource:///modules/LinkHelper.sys.mjs",
  getAttachmentIcon:
    "moz-src:///comm/mail/components/calendar/modules/CalendarAttachmentUtils.sys.mjs",
});

/**
 * Read-only calendar event dialog. Expects to find an element to anchor to at
 * a selector of the pattern
 * `#view-box > :not([hidden]) [data-event-id="${event-id}"][data-recurrence-id="${recurrence-id}"]`.
 * If there is no recurrence ID, that part of the selector is omitted. If no
 * element is found we attempt to fall back to the target of the opening event
 * if possible.
 * Template ID: #calendarDialogTemplate
 *
 * @tagname calendar-dialog
 * @attribute {string} event-id - ID of the event to display.
 * @attribute {string} calendar-id - ID of the calendar the event to display is
 *  in.
 * @attribute {string} [recurrence-id] - Recurrence ID as the nativeTime
 *  representation of a CalDateTime. icalString is not appropriately portable.
 */

export class CalendarDialog extends CalendarEventDialogSourceMixin(
  PositionedDialog
) {
  #subviewManager = null;

  #sourceEvent = null;

  #sourceState = null;

  /**
   * The margin the dialog should maintain from the trigger and container edges
   *
   * @type {number}
   */
  margin = DEFAULT_DIALOG_MARGIN;

  /**
   * Selector for trigger element to position the dialog relative to.
   *
   * @type {string}
   */
  triggerSelector =
    "calendar-event-box,calendar-month-day-box-item,.multiday-event-listitem";

  /**
   * The video conferencing join link string for the calendar event.
   *
   * @type {string}
   */
  #meetingUrl = null;

  /**
   * The event currently displayed in the dialog. For recurring events this is
   * the selected occurrence.
   *
   * @type {calIEvent?}
   */
  #event = null;

  /**
   * The callback used to save changes to the displayed event.
   *
   * @type {?Function}
   */
  #onEventResponse = null;

  /**
   * The title element for the dialog
   *
   * @type {HTMLElement}
   */
  #title;

  connectedCallback() {
    if (!this.hasConnected) {
      this.hasConnected = true;
      const template = document
        .getElementById("calendarDialogTemplate")
        .content.cloneNode(true);

      this.append(template);

      window.MozXULElement?.insertFTLIfNeeded("messenger/calendarDialog.ftl");

      this.#subviewManager = this.querySelector(
        "calendar-dialog-subview-manager"
      );

      this.addEventListener("click", this);
      this.#subviewManager.addEventListener("subviewchanged", this);
      this.#subviewManager.addEventListener("toggleRowVisibility", this);
      this.querySelector("calendar-dialog-acceptance").addEventListener(
        "setEventResponse",
        this
      );

      this.addEventListener("command", this);

      this.querySelector(".back-button").hidden =
        this.#subviewManager.isDefaultSubviewVisible();

      this.setAttribute("is", "calendar-dialog");
      this.setAttribute("closedby", "closerequest");
      this.addEventListener("cancel", this);

      this.container = document.getElementById("calendarDisplayBox");
      this.#title = this.querySelector(".calendar-dialog-title");
    }

    document.l10n.translateFragment(this);
    this.initializeCalendarEventRoute();
  }

  /**
   * The latest source transition, kept as a legacy read-dialog adapter. This
   * is cached from the observer update rather than selected from the store by
   * this getter.
   *
   * @returns {?CalendarEventSourceSession}
   */
  get sourceState() {
    return this.#sourceState ? structuredClone(this.#sourceState) : null;
  }

  /**
   * The platform event retained for this legacy read-dialog renderer. New
   * Redux consumers use their serializable source snapshot instead.
   *
   * @returns {?calIEvent}
   */
  get sourceEvent() {
    return this.#sourceEvent;
  }

  get retainsRawCalendarEvent() {
    return true;
  }

  /**
   * Cache the source session for the read dialog's legacy public interface.
   * The shared mixin continues to consume the same transition first.
   *
   * @param {string} fieldName
   * @param {*} oldValue
   * @param {*} newValue
   */
  handleStateChange(fieldName, oldValue, newValue) {
    super.handleStateChange(fieldName, oldValue, newValue);
    if (fieldName == "sourceSession") {
      this.#sourceState = newValue ? structuredClone(newValue) : null;
    }
  }

  /**
   * Maps selectors for click events to their handler functions.
   *
   * @type {Record<string,Function>}
   */
  #clickHandlers = {
    "#locationLink": event => {
      event.preventDefault();
      openLinkExternally(event.target.href);
      return false;
    },
    ".close-button": () => this.close(),
    ".menu-button": () => this.#toggleMenu(),
    ".back-button": () => this.#subviewManager.showDefaultSubview(),
    "#expandDescription": () =>
      this.#subviewManager.showSubview("calendarDescriptionSubview"),
    "#joinMeeting": () => lazy.openLinkExternally(this.#meetingUrl),
    "#expandAttachments": () =>
      this.#subviewManager.showSubview("calendarAttachmentsSubview"),
    "#expandAttendees": () =>
      this.#subviewManager.showSubview("calendarAttendeesSubview"),
    "#deleteEvent": () => this.#deleteEvent(),
  };

  /**
   * Maps selectors for command events to their handler functions.
   *
   * @type {Record<string,Function>}
   */
  #commandHandlers = {
    "#deleteEvent": () => this.#deleteEvent(),
  };

  handleEvent(event) {
    switch (event.type) {
      case "cancel":
        this.close();
        break;
      case "click":
        for (const [selector, handler] of Object.entries(this.#clickHandlers)) {
          if (event.target.closest(selector)) {
            handler(event);
            break;
          }
        }
        break;
      case "command":
        for (const [selector, handler] of Object.entries(
          this.#commandHandlers
        )) {
          if (event.target.closest(selector)) {
            handler(event);
            break;
          }
        }
        break;
      case "subviewchanged":
        this.querySelector(".back-button").hidden =
          this.#subviewManager.isDefaultSubviewVisible();
        break;
      case "toggleRowVisibility": {
        event.target
          .closest(".hideable-row")
          .toggleAttribute("hidden", event.detail.isHidden);
        break;
      }
      case "setEventResponse":
        this.#setEventResponse(event.detail.status);
        break;
    }
  }

  /**
   * Helper to set up the calendar event reference for the dialog. When called
   * with a calIEvent the dialog will update to show the data of that event.
   *
   * @param {calIEvent} event
   * @param {?Function} [onEventResponse] - Called to save an event response.
   * @throws {Error} When passed a calIItemBase that isn't an event.
   */
  setCalendarEvent(event, onEventResponse = null) {
    if (!event.isEvent()) {
      throw new Error("Can only display events");
    }

    if (this.open) {
      this.close();
    }

    this.setCalendarEventRoute({
      calendarId: event.calendar.id,
      eventId: event.id,
      recurrenceId: event.recurrenceId
        ? String(event.recurrenceId.nativeTime)
        : null,
    });
    this.#onEventResponse = onEventResponse;
  }

  /**
   * Select a visible positioning container before the shared source lifecycle
   * loads and shows the dialog.
   *
   * @param {?Event} event
   * @returns {Promise<boolean>} Whether the dialog was shown.
   */
  async show(event) {
    const calendarDisplayBox = document.getElementById("calendarDisplayBox");
    const calendarDisplayBoxRect = calendarDisplayBox?.getBoundingClientRect();
    this.container =
      calendarDisplayBoxRect?.width > 0 && calendarDisplayBoxRect.height > 0
        ? calendarDisplayBox
        : (document.getElementById("tabpanelcontainer") ??
          document.documentElement);

    return super.show(event);
  }

  /**
   * Render the source event after the shared loader gets the current event.
   * This completes the initial layout before the mixin lets PositionedDialog
   * measure and position the dialog.
   *
   * @param {object} source
   * @param {calIEvent} source.event
   * @param {CalendarEventSourceIdentity} source.identity
   */
  async onCalendarEventSourceLoaded({ event, identity }) {
    this.#sourceEvent = event;
    this.#event = event;
    const calendar = event.calendar;
    const recurrenceSelector = identity.recurrenceId
      ? `[data-recurrence-id="${identity.recurrenceId}"]`
      : "";
    const selector = `#view-box > :not([hidden]) [data-event-id="${event.id}"]${recurrenceSelector}`;
    this.trigger = document.querySelector(selector);

    // We did it, we have an event to display \o/.
    this.#subviewManager.showDefaultSubview();

    const cssSafeCalendarId = cal.view.formatStringForCSSRule(calendar.id);
    this.style.setProperty(
      "--calendar-bar-color",
      `var(--calendar-${cssSafeCalendarId}-backcolor)`
    );

    this.#title.textContent = event.title;
    this.querySelector(".calendar-name").textContent = calendar.name;
    this.#title.title = `${calendar.name} - ${event.title}`;

    const dateRow = this.querySelector("calendar-dialog-date-row");
    const startDate = cal.dtz.dateTimeToJsDate(event.startDate);
    dateRow.setAttribute("start-date", startDate.toISOString());
    const endDate = cal.dtz.dateTimeToJsDate(event.endDate);
    dateRow.setAttribute("end-date", endDate.toISOString());

    const recurrence = recurrenceStringFromItem(
      event,
      "recurrence-rule-too-complex"
    );
    if (recurrence) {
      dateRow.setAttribute("repeats", recurrence);
    } else {
      // Make sure the attribute is unset, since we might be switching event.
      dateRow.removeAttribute("repeats");
    }

    this.querySelector("calendar-dialog-categories").setCategories(
      event.getCategories()
    );

    this.#setLocation(event.getProperty("LOCATION") ?? "");

    // Sort the reminders by offset from event date.
    const reminders = event
      .getAlarms()
      .sort((a, b) =>
        cal.alarms
          .calculateAlarmDate(event, b)
          .compare(cal.alarms.calculateAlarmDate(event, a))
      );

    this.querySelector("calendar-dialog-reminders-row").setReminders(reminders);

    const attendees = event.getAttendees();
    const organizer = event.organizer;

    if (organizer) {
      const organizerAttendee = attendees.find(
        attendee => attendee.id.toLowerCase() == organizer.id.toLowerCase()
      );

      if (organizerAttendee) {
        const organizerDisplay = organizerAttendee.clone();
        organizerDisplay.isOrganizer = true;
        attendees[attendees.indexOf(organizerAttendee)] = organizerDisplay;
      } else {
        const organizerDisplay = organizer.clone();
        organizerDisplay.participationStatus = "";
        attendees.push(organizerDisplay);
      }
    }

    for (const attendeeView of this.querySelectorAll(
      "calendar-dialog-attendees-row"
    )) {
      attendeeView.setAttendees(attendees);
    }

    this.querySelector("#expandAttendees").hidden = attendees.length <= 3;
    this.querySelector(`#attendeesRow`).classList.toggle(
      "expanding-row",
      attendees.length > 3
    );

    const attachments = event.getAttachments();
    if (attachments.length) {
      document.l10n.setAttributes(
        this.querySelector("#attachmentsRow .row-label"),
        "calendar-dialog-attachments-summary-label",
        { count: attachments.length }
      );
      this.querySelector("calendar-dialog-attachments-list").setAttachments(
        attachments.map(attachment => ({
          uri: attachment.uri.spec,
          icon: lazy.getAttachmentIcon(attachment),
        }))
      );
    }
    this.querySelector("#attachmentsRow").hidden = !attachments.length;

    this.#setJoinMeetingButton(event.descriptionText || "");

    const acceptanceWidget = this.querySelector("calendar-dialog-acceptance");
    const hasAttendees = event.getAttendees().length > 0;
    const attendee = cal.itip.getInvitedAttendee(event, calendar);
    acceptanceWidget.hidden = !hasAttendees || !attendee;
    if (hasAttendees && attendee) {
      acceptanceWidget.setAttribute("status", attendee.participationStatus);
    }

    this.querySelector("#expandingDescription").setDescription(
      event.descriptionText
    );
    this.querySelector("#expandedDescription").setDescription(
      event.descriptionText,
      event.descriptionHTML
    );

    const canEdit =
      cal.acl.isCalendarWritable(event.calendar) &&
      cal.acl.userCanModifyItem(event) &&
      !(
        event.calendar instanceof Ci.calISchedulingSupport &&
        event.calendar.isInvitation(event)
      ) &&
      event.calendar.getProperty("capabilities.events.supported") !== false;
    this.querySelector("#edit").hidden = !canEdit;
  }

  onCalendarEventRouteCleared() {
    this.#sourceEvent = null;
    this.#sourceState = null;
    this.#clearData();
  }

  /**
   * Clear the data displayed in the dialog.
   */
  #clearData() {
    this.#event = null;
    this.#onEventResponse = null;
    this.#subviewManager.showDefaultSubview();
    this.#title.textContent = "";
    this.querySelector(".calendar-name").textContent = "";
    this.#title.title = "";

    // Only clearing the repeats attribute, the dates are expected to always
    // have a value.
    this.querySelector("calendar-dialog-date-row").removeAttribute("repeats");
    this.querySelector("calendar-dialog-categories").setCategories([]);
    this.#setLocation("");
    this.style.removeProperty("--calendar-bar-color");
    this.querySelector(
      `calendar-dialog-attendees-row:not([type])`
    ).setAttendees([]);
    this.querySelector(`calendar-dialog-attendees-row[type]`).setAttendees([]);
    this.querySelector("calendar-dialog-reminders-row").setReminders([]);
    this.querySelector("calendar-dialog-attachments-list").setAttachments([]);
    this.querySelector("#attachmentsRow").hidden = true;
    this.querySelector("calendar-dialog-acceptance").reset();
    this.querySelector("#expandingDescription").setDescription("");
    this.querySelector("#expandedDescription").setDescription("");
  }

  /**
   * Saves a new participation status and sends the corresponding iTIP reply.
   *
   * @param {string} participationStatus - The new participation status.
   */
  async #setEventResponse(participationStatus) {
    const oldEvent = this.#event;
    const oldAttendee =
      oldEvent && cal.itip.getInvitedAttendee(oldEvent, oldEvent.calendar);
    if (
      !oldEvent ||
      !oldAttendee ||
      oldAttendee.participationStatus == participationStatus
    ) {
      return;
    }

    // `oldEvent` is the displayed occurrence, so this intentionally updates
    // only that occurrence instead of the parent recurring event.
    const newEvent = oldEvent.clone();
    const invitedAttendee = cal.itip.getInvitedAttendee(
      newEvent,
      newEvent.calendar
    );
    if (!invitedAttendee) {
      return;
    }
    const newAttendee = invitedAttendee.clone();
    newEvent.removeAttendee(invitedAttendee);
    newEvent.addAttendee(newAttendee);
    // Ensure scheduling recognizes this as an attendee update, as the
    // existing event read dialog does.
    newEvent.wrappedJSObject.ensureNotDirty();
    newAttendee.participationStatus = participationStatus;

    try {
      const response = { responseMode: Ci.calIItipItem.AUTO };
      if (this.#onEventResponse) {
        await this.#onEventResponse(
          newEvent,
          newEvent.calendar,
          oldEvent,
          null,
          response
        );
      } else {
        await window.doTransaction(
          "modify",
          newEvent,
          newEvent.calendar,
          oldEvent,
          null,
          response
        );
      }
    } catch (error) {
      console.error("Failed to send calendar event response", error);
      this.querySelector("calendar-dialog-acceptance").setAttribute(
        "status",
        oldAttendee.participationStatus
      );
      return;
    }

    // The dialog may have been reused while the transaction was in progress.
    if (this.#event !== oldEvent) {
      return;
    }

    this.#event = newEvent;
    const attendees = newEvent.getAttendees();
    for (const attendeeView of this.querySelectorAll(
      "calendar-dialog-attendees-row"
    )) {
      attendeeView.setAttendees(attendees);
    }
    this.querySelector("calendar-dialog-acceptance").setAttribute(
      "status",
      participationStatus
    );
  }

  /**
   * Sets the location in the dialog for the calendar event.
   *
   * @param {string} eventLocation - The location of the event.
   */
  #setLocation(eventLocation) {
    const parsedURL = URL.parse(eventLocation.trim());
    const locationLink = this.querySelector("#locationLink");
    const locationText = this.querySelector("#locationText");
    locationLink.hidden = !parsedURL;
    locationText.hidden = parsedURL || !eventLocation;
    this.querySelector("#locationRow").toggleAttribute(
      "hidden",
      !eventLocation
    );
    this.querySelector("#locationRow").classList.toggle(
      "divider",
      eventLocation
    );
    this.querySelector("#joinMeetingRow").classList.toggle(
      "divider",
      !eventLocation
    );

    if (parsedURL) {
      locationLink.textContent = eventLocation;
      locationLink.setAttribute("href", eventLocation);
      locationText.textContent = "";
      return;
    }

    locationText.textContent = eventLocation;
    locationLink.textContent = "";
    locationLink.setAttribute("href", "");
  }

  /**
   * Sets the join meeting button link in the event dialog by parsing the
   * description for any meeting links.
   *
   * @param {string} eventDescription - The event plain text description.
   */
  #setJoinMeetingButton(eventDescription) {
    const joinMeetingRow = this.querySelector("#joinMeetingRow");
    const meetingUrl = extractJoinLink(eventDescription);
    joinMeetingRow.hidden = !meetingUrl;
    this.#meetingUrl = meetingUrl;
  }

  /**
   * Open the popup menu in the header.
   */
  #toggleMenu() {
    this.querySelector("menupopup").openPopup(
      this.querySelector(".menu-button"),
      "after_end"
    );
  }

  /**
   * Opens a modal prompt about deleting the event. The prompt can handle
   * recurring events, being able to delete a single occurrence or all
   * occurrences (the whole event), as well as delete a standalone event.
   */
  async #deleteEvent() {
    const calendar = cal.manager.getCalendarById(
      this.getAttribute("calendar-id")
    );
    const event = await calendar.getItem(this.getAttribute("event-id"));
    const isRecurring =
      this.hasAttribute("recurrence-id") &&
      !!event.recurrenceInfo &&
      countOccurrences(event) != 1;
    const extResponse = { responseMode: Ci.calIItipItem.USER };

    const CANCEL = 0;
    const DELETE_OCCURRENCE = 1;
    const DELETE_FOLLOWING = 2;
    const DELETE_ALL = 3;

    let response = CANCEL;

    const returnValue = { value: CANCEL, isRecurring };
    window.openDialog(
      "chrome://messenger/content/calendarPrompt.xhtml",
      "_blank",
      "centerscreen,chrome,titlebar,modal",
      returnValue
    );
    response = returnValue.value;
    this.close();

    switch (response) {
      case DELETE_ALL:
        // eslint-disable-next-line no-undef
        doTransaction("delete", event, calendar, null, null, extResponse);
        break;
      case DELETE_FOLLOWING:
        // TODO: Add functionality to only delete all following events.
        break;
      case DELETE_OCCURRENCE:
        if (isRecurring) {
          const eventCopy = event.parentItem.clone();
          const recurrenceId = cal.createDateTime();
          recurrenceId.nativeTime = this.getAttribute("recurrence-id");

          eventCopy.recurrenceInfo.removeOccurrenceAt(recurrenceId);

          // eslint-disable-next-line no-undef
          doTransaction(
            "modify",
            eventCopy,
            eventCopy.calendar,
            event.parentItem,
            null,
            extResponse
          );
          break;
        }

        // eslint-disable-next-line no-undef
        doTransaction("delete", event, calendar, null, null, extResponse);
        break;
      case CANCEL:
        break;
    }
  }
}

customElements.define("calendar-dialog", CalendarDialog, { extends: "dialog" });
