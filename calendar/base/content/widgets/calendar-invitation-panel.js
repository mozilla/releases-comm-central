/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals cal */

"use strict";

// Wrap in a block to prevent leaking to window scope.
{
  var { recurrenceRule2String } = ChromeUtils.import(
    "resource:///modules/calendar/calRecurrenceUtils.jsm"
  );

  /**
   * Base element providing boilerplate for shadow root initialisation.
   */
  class BaseInvitationElement extends HTMLElement {
    /**
     * The id of the <template> tag to initialize the element with.
     * @param {string?} id
     */
    constructor(id) {
      super();
      this.attachShadow({ mode: "open" });
      document.l10n.connectRoot(this.shadowRoot);

      let link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "chrome://calendar/skin/shared/widgets/calendar-invitation-panel.css";
      this.shadowRoot.appendChild(link);

      if (id) {
        this.shadowRoot.appendChild(document.getElementById(id).content.cloneNode(true));
      }
    }
  }

  /**
   * InvitationPanel displays the details of an iTIP event invitation in an
   * interactive panel.
   */
  class InvitationPanel extends BaseInvitationElement {
    MODE_NEW = "New";
    MODE_ALREADY_PROCESSED = "Processed";
    MODE_UPDATE_MAJOR = "UpdateMajor";
    MODE_UPDATE_MINOR = "UpdateMinor";
    MODE_CANCELLED = "Cancelled";
    MODE_CANCELLED_NOT_FOUND = "CancelledNotFound";

    /**
     * mode determines how the UI should display the received invitation. It
     * must be set to one of the MODE_* constants, defaults to MODE_NEW.
     * @type {string}
     */
    mode = this.MODE_NEW;

    /**
     * The event item to be displayed.
     * @type {calIEvent?}
     */
    item;

    connectedCallback() {
      if (this.item && this.mode) {
        let template = document.getElementById(`calendarInvitationPanel${this.mode}`);
        this.shadowRoot.appendChild(template.content.cloneNode(true));
        this.shadowRoot.getElementById("wrapper").item = this.item;
        this.shadowRoot.getElementById("header").item = this.item;
      }
    }
  }
  customElements.define("calendar-invitation-panel", InvitationPanel);

  /**
   * InvitationPanelWrapper wraps the contents of the panel for formatting and
   * provides the minidate to the left of the details.
   */
  class InvitationPanelWrapper extends BaseInvitationElement {
    constructor() {
      super("calendarInvitationPanelWrapper");
    }

    set item(value) {
      this.shadowRoot.getElementById("minidate").date = value.startDate;
      this.shadowRoot.getElementById("properties").item = value;
    }
  }
  customElements.define("calendar-invitation-panel-wrapper", InvitationPanelWrapper);

  /**
   * InvitationPanelHeader renders the header part of the invitation panel.
   */
  class InvitationPanelHeader extends BaseInvitationElement {
    constructor() {
      super("calendarInvitationPanelHeader");
    }

    /**
     * Setting the item will populate the header with information.
     * @type {calIEvent}
     */
    set item(item) {
      let l10nArgs = JSON.stringify({
        summary: item.getProperty("SUMMARY") || "",
        organizer: item.organizer ? item.organizer?.commonName || item.organizer.toString() : "",
      });

      let action = this.getAttribute("actionType");
      if (action) {
        this.shadowRoot
          .getElementById("intro")
          .setAttribute("data-l10n-id", `calendar-invitation-panel-intro-${action}`);
      }

      for (let id of ["intro", "title"]) {
        this.shadowRoot.getElementById(id).setAttribute("data-l10n-args", l10nArgs);
      }
    }

    /**
     * Provides the value of the title displayed as a string.
     * @type {string}
     */
    get fullTitle() {
      return [
        ...this.shadowRoot.querySelectorAll(
          ".calendar-invitation-panel-intro, .calendar-invitation-panel-title"
        ),
      ]
        .map(node => node.textContent)
        .join(" ");
    }

    disconnectedCallback() {
      document.l10n.disconnectRoot(this.shadowRoot);
    }
  }
  customElements.define("calendar-invitation-panel-header", InvitationPanelHeader);

  /**
   * InvitationPanelProperties renders the details of the most useful properties
   * of an invitation.
   */
  class InvitationPanelProperties extends BaseInvitationElement {
    constructor() {
      super("calendarInvitationPanelProperties");
    }

    /**
     * Setting the item will populate the table that displays the event
     * properties.
     * @type {calIEvent}
     */
    set item(item) {
      let interval = this.shadowRoot.getElementById("interval");
      interval.item = item;

      if (item.recurrenceInfo || item.parentItem.recurrenceInfo) {
        let parent = item.parentItem;
        this.shadowRoot.getElementById("recurrence").textContent = recurrenceRule2String(
          parent.recurrenceInfo,
          parent.recurrenceStartDate
        );
      }

      this.shadowRoot
        .getElementById("location")
        .appendChild(cal.view.textToHtmlDocumentFragment(item.getProperty("LOCATION"), document));

      this.shadowRoot.getElementById("summary").attendees = item.getAttendees();
      this.shadowRoot.getElementById("list").attendees = item.getAttendees();

      this.shadowRoot
        .getElementById("description")
        .appendChild(cal.view.textToHtmlDocumentFragment(item.descriptionText, document));
    }

    disconnectedCallback() {
      document.l10n.disconnectRoot(this.shadowRoot);
    }
  }
  customElements.define("calendar-invitation-panel-properties", InvitationPanelProperties);

  /**
   * InvitationInterval displays the formatted interval of the event. Formatting
   * relies on cal.dtz.formatter.formatIntervalParts().
   */
  class InvitationInterval extends BaseInvitationElement {
    constructor() {
      super("calendarInvitationInterval");
    }

    /**
     * The item whose interval to show.
     * @type {calIEvent}
     */
    set item(value) {
      let [startDate, endDate] = cal.dtz.formatter.getItemDates(value);
      let timezone = startDate.timezone.displayName;
      let parts = cal.dtz.formatter.formatIntervalParts(startDate, endDate);
      document.l10n.setAttributes(
        this.shadowRoot.getElementById("interval"),
        `calendar-invitation-interval-${parts.type}`,
        { ...parts, timezone }
      );
    }
  }
  customElements.define("calendar-invitation-interval", InvitationInterval);

  const partStatOrder = ["ACCEPTED", "DECLINED", "TENTATIVE", "NEEDS-ACTION"];

  /**
   * InvitationPartStatSummary generates text indicating the aggregated
   * participation status of each attendee in the event's attendees list.
   */
  class InvitationPartStatSummary extends BaseInvitationElement {
    constructor() {
      super("calendarInvitationPartStatSummary");
    }

    /**
     * Setting this property will trigger an update of the text displayed.
     * @type {calIAttendee[]}
     */
    set attendees(attendees) {
      let counts = {
        ACCEPTED: 0,
        DECLINED: 0,
        TENTATIVE: 0,
        "NEEDS-ACTION": 0,
        TOTAL: attendees.length,
        OTHER: 0,
      };

      for (let { participationStatus } of attendees) {
        if (counts.hasOwnProperty(participationStatus)) {
          counts[participationStatus]++;
        } else {
          counts.OTHER++;
        }
      }
      document.l10n.setAttributes(
        this.shadowRoot.getElementById("total"),
        "calendar-invitation-panel-partstat-total",
        { count: counts.TOTAL }
      );

      let shownPartStats = partStatOrder.filter(partStat => counts[partStat]);
      let breakdown = this.shadowRoot.getElementById("breakdown");
      for (let partStat of shownPartStats) {
        let span = document.createElement("span");
        span.setAttribute("class", "calendar-invitation-panel-partstat-summary");

        // calendar-invitation-panel-partstat-accepted
        // calendar-invitation-panel-partstat-declined
        // calendar-invitation-panel-partstat-tentative
        // calendar-invitation-panel-partstat-needs-action
        document.l10n.setAttributes(
          span,
          `calendar-invitation-panel-partstat-${partStat.toLowerCase()}`,
          {
            count: counts[partStat],
          }
        );
        breakdown.appendChild(span);
      }
    }

    disconnectedCallback() {
      document.l10n.disconnectRoot(this.shadowRoot);
    }
  }
  customElements.define("calendar-invitation-partstat-summary", InvitationPartStatSummary);

  /**
   * InvitationAttendeeList displays a list of all the attendees on
   * an event's attendee list.
   */
  class InvitationAttendeeList extends BaseInvitationElement {
    constructor() {
      super("calendarInvitationAttendeesList");
    }

    /**
     * Setting this property will trigger rendering of the attendees list.
     * @type {calIAttendee[]}
     */
    set attendees(attendees) {
      let ul = this.shadowRoot.getElementById("attendeeList");
      for (let att of attendees) {
        let li = document.createElement("li");
        let span = document.createElement("span");
        span.textContent = att;
        li.appendChild(span);
        ul.appendChild(li);
      }
    }
  }
  customElements.define("calendar-invitation-attendee-list", InvitationAttendeeList);

  /**
   * InvitationPanelFooter renders the footer for the details section of
   * the invitation panel.
   */
  class InvitationPanelFooter extends BaseInvitationElement {
    constructor() {
      super("calendarInvitationPanelFooter");
    }

    connectedCallback() {
      document.l10n.setAttributes(
        this.shadowRoot.getElementById("status"),
        "calendar-invitation-panel-reply-status"
      );
    }

    disconnectedCallback() {
      document.l10n.disconnectRoot(this.shadowRoot);
    }
  }

  customElements.define("calendar-invitation-panel-footer", InvitationPanelFooter);
}
