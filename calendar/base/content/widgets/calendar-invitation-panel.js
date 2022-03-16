/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals cal */

"use strict";

// Wrap in a block to prevent leaking to window scope.
{
  const dateFormat = new Intl.DateTimeFormat(undefined, {
    month: "long",
    day: "2-digit",
    year: "numeric",
  });
  const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: "long" });

  const timeFormat = new Intl.DateTimeFormat(undefined, {
    timeStyle: "short",
  });

  const fmtDate = date => dateFormat.format(date);
  const fmtDay = date => dayFormat.format(date);
  const fmtTime = date => timeFormat.format(date);

  /**
   * Base element providing boilerplate for shadow root initialisation.
   */
  class BaseInvitationElement extends HTMLElement {
    /**
     * The id of the <template> tag the element should use.
     * @param {string} id
     */
    constructor(id) {
      super();
      this.attachShadow({ mode: "open" });
      document.l10n.connectRoot(this.shadowRoot);

      let link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "chrome://calendar/skin/shared/widgets/calendar-invitation-panel.css";
      this.shadowRoot.appendChild(link);
      this.shadowRoot.appendChild(document.getElementById(id).content.cloneNode(true));
    }
  }

  /**
   * InvitationPanel displays the details of an iTIP event invitation in an
   * interactive panel. This widget is meant to be displayed just above the
   * message body.
   */
  class InvitationPanel extends BaseInvitationElement {
    constructor() {
      super("calendarInvitationPanel");
    }

    /**
     * Setting the itipItem will trigger the rendering of the invitation details.
     * This widget is designed to have this value set only once.
     * @type {calIItipItem}
     */
    set itipItem(value) {
      let item = value.getItemList()[0];
      if (!item) {
        return;
      }
      this.shadowRoot.getElementById("minidate").date = item.startDate;
      this.shadowRoot.getElementById("header").item = item;
      this.shadowRoot.getElementById("properties").item = item;
    }
  }
  customElements.define("calendar-invitation-panel", InvitationPanel);

  /**
   * InvitationPanelHeader renders the header for the details section of
   * the invitation panel.
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

      for (let id of ["calendar-invitation-panel-intro", "calendar-invitation-panel-title"]) {
        this.shadowRoot
          .querySelector(`[data-l10n-id="${id}"]`)
          .setAttribute("data-l10n-args", l10nArgs);
      }
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
      let when = this.shadowRoot.getElementById("when");

      let startDatetime = document.createElement("calendar-invitation-datetime");
      startDatetime.datetime = item.startDate;
      when.appendChild(startDatetime);

      if (item.endDate) {
        let endDateTime = document.createElement("calendar-invitation-datetime");
        endDateTime.datetime = item.endDate;
        when.appendChild(endDateTime);
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
   * InvitationDatetime displays the formatted date and time of the event in the
   * format: "Tuesday, February 24, 2022" using the Intl.DateTimeFormat API.
   */
  class InvitationDatetime extends BaseInvitationElement {
    constructor() {
      super("calendarInvitationDatetime");
    }

    /**
     * Set to display a date and time.
     * @type {calIDateTIme}
     */
    set datetime(datetime) {
      let date = cal.dtz.dateTimeToJsDate(datetime);

      document.l10n.setAttributes(
        this.shadowRoot.getElementById("date"),
        "calendar-invitation-datetime-date",
        { dayOfWeek: fmtDay(date), date: fmtDate(date) }
      );

      document.l10n.setAttributes(
        this.shadowRoot.getElementById("time"),
        "calendar-invitation-datetime-time",
        { time: fmtTime(date), timezone: datetime.timezone.displayName }
      );
    }

    disconnectedCallback() {
      document.l10n.disconnectRoot(this.shadowRoot);
    }
  }
  customElements.define("calendar-invitation-datetime", InvitationDatetime);

  const partStatOrder = ["ACCEPTED", "DECLINED", "TENTATIVE", "NEEDS-ACTION", "OTHER"];

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
        "calendar-invitation-panel-partstat-summary",
        { partStat: "TOTAL", count: counts.TOTAL }
      );

      let shownPartStats = partStatOrder.filter(partStat => counts[partStat]);
      let breakdown = this.shadowRoot.getElementById("breakdown");
      for (let partStat of shownPartStats) {
        let span = document.createElement("span");
        span.setAttribute("class", "calendar-invitation-panel-partstat-summary");
        document.l10n.setAttributes(span, "calendar-invitation-panel-partstat-summary", {
          partStat,
          count: counts[partStat],
        });
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
