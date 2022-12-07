/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals cal openLinkExternally */

"use strict";

// Wrap in a block to prevent leaking to window scope.
{
  var { recurrenceRule2String } = ChromeUtils.import(
    "resource:///modules/calendar/calRecurrenceUtils.jsm"
  );

  let l10n = new DOMLocalization(["calendar/calendar-invitation-panel.ftl"]);

  /**
   * Base element providing boilerplate for shadow root initialisation.
   */
  class BaseInvitationElement extends HTMLElement {
    /**
     * A previous copy of the event item if found on an existing calendar.
     * @type {calIEvent?}
     */
    foundItem;

    /**
     * The id of the <template> tag to initialize the element with.
     *
     * @param {string?} id
     */
    constructor(id) {
      super();
      this.attachShadow({ mode: "open" });
      l10n.connectRoot(this.shadowRoot);

      let link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "chrome://calendar/skin/shared/widgets/calendar-invitation-panel.css";
      this.shadowRoot.appendChild(link);

      if (id) {
        this.shadowRoot.appendChild(document.getElementById(id).content.cloneNode(true));
      }
    }

    disconnectedCallback() {
      l10n.disconnectRoot(this.shadowRoot);
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
     *
     * @type {string}
     */
    mode = this.MODE_NEW;

    /**
     * The event item to be displayed.
     *
     * @type {calIEvent?}
     */
    item;

    connectedCallback() {
      if (this.item && this.mode) {
        let template = document.getElementById(`calendarInvitationPanel${this.mode}`);
        this.shadowRoot.appendChild(template.content.cloneNode(true));

        let header = this.shadowRoot.querySelector("calendar-invitation-panel-header");
        header.foundItem = this.foundItem;
        header.item = this.item;

        let wrapper = this.shadowRoot.querySelector("calendar-invitation-panel-wrapper");
        wrapper.foundItem = this.foundItem;
        wrapper.item = this.item;
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
      this.shadowRoot.querySelector("calendar-minidate").date = value.startDate;
      let props = this.shadowRoot.querySelector("calendar-invitation-panel-properties");
      props.foundItem = this.foundItem;
      props.item = value;
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
     *
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

      if (this.foundItem && this.foundItem.title != item.title) {
        this.shadowRoot.querySelector("calendar-invitation-change-indicator").hidden = false;
      }
    }

    /**
     * Provides the value of the title displayed as a string.
     *
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
  }
  customElements.define("calendar-invitation-panel-header", InvitationPanelHeader);

  const PROPERTY_REMOVED = -1;
  const PROPERTY_UNCHANGED = 0;
  const PROPERTY_ADDED = 1;
  const PROPERTY_MODIFIED = 2;

  /**
   * InvitationPanelProperties renders the details of the most useful properties
   * of an invitation.
   */
  class InvitationPanelProperties extends BaseInvitationElement {
    constructor() {
      super("calendarInvitationPanelProperties");
    }

    /**
     * Used to retrieve a property value from an event.
     * @callback GetValue
     * @param {calIEvent} event
     * @returns {string}
     */

    /**
     * A function used to make a property value visible in to the user.
     * @callback PropertyShow
     * @param {HTMLElement} node  - The element responsible for displaying the
     *                              value.
     * @param {string} value      - The value of property to display.
     * @param {string} oldValue   - The previous value of the property if the
     *                              there is a prior copy of the event.
     * @param {calIEvent} item    - The event item the property belongs to.
     * @param {string} oldItem    - The prior version of the event if there is
     *                              one.
     */

    /**
     * @typedef {Object} InvitationPropertyDescriptor
     * @property {string} id         - The id of the HTMLElement that displays
     *                                 the property.
     * @property {GetValue} getValue - Function used to retrieve the displayed
     *                                 value of the property from the item.
     * @property {PropertyShow} show - Function to use to display the property
     *                                 value.
     */

    /**
     * A static list of objects used in determining how to display each of the
     * properties.
     * @type {PropertyDescriptor[]}
     */
    static propertyDescriptors = [
      {
        id: "interval",
        getValue(item) {
          let tz = cal.dtz.defaultTimezone;
          let startDate = item.startDate?.getInTimezone(tz) ?? null;
          let endDate = item.endDate?.getInTimezone(tz) ?? null;
          return `${startDate.icalString}-${endDate?.icalString}`;
        },
        show(intervalNode, newValue, oldValue, item) {
          intervalNode.item = item;
        },
      },
      {
        id: "recurrence",
        getValue(item) {
          let parent = item.parentItem;
          if (!parent.recurrenceInfo) {
            return null;
          }
          return recurrenceRule2String(parent.recurrenceInfo, parent.recurrenceStartDate);
        },
        show(recurrence, value) {
          recurrence.appendChild(document.createTextNode(value));
        },
      },
      {
        id: "location",
        getValue(item) {
          return item.getProperty("LOCATION");
        },
        show(location, value) {
          location.appendChild(cal.view.textToHtmlDocumentFragment(value, document));
        },
      },
      {
        id: "description",
        getValue(item) {
          return item.descriptionText;
        },
        show(description, value) {
          description.appendChild(cal.view.textToHtmlDocumentFragment(value, document));
        },
      },
    ];

    /**
     * Setting the item will populate the table that displays the event
     * properties.
     *
     * @type {calIEvent}
     */
    set item(item) {
      for (let prop of InvitationPanelProperties.propertyDescriptors) {
        let el = this.shadowRoot.getElementById(prop.id);
        let value = prop.getValue(item);
        let oldValue;
        let result = PROPERTY_UNCHANGED;
        if (this.foundItem) {
          oldValue = prop.getValue(this.foundItem);
          result = this.compare(oldValue, value);
          if (result) {
            let indicator = this.shadowRoot.getElementById(`${prop.id}ChangeIndicator`);
            if (indicator) {
              indicator.type = result;
              indicator.hidden = false;
            }
          }
        }
        if (value) {
          prop.show(el, value, oldValue, item, this.foundItem, result);
        }
      }

      let attendees = item.getAttendees();
      this.shadowRoot.getElementById("summary").attendees = attendees;
      this.shadowRoot.getElementById("attendees").attendees = attendees;
      this.shadowRoot.getElementById("attachments").attachments = item.getAttachments();
    }

    /**
     * Compares two like property values, an old and a new one, to determine
     * what type of change has been made (if any).
     *
     * @param {any} oldValue
     * @param {any} newValue
     * @returns {number} - One of the PROPERTY_* constants.
     */
    compare(oldValue, newValue) {
      if (!oldValue && newValue) {
        return PROPERTY_ADDED;
      }
      if (oldValue && !newValue) {
        return PROPERTY_REMOVED;
      }
      return oldValue != newValue ? PROPERTY_MODIFIED : PROPERTY_UNCHANGED;
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
     *
     * @type {calIEvent}
     */
    set item(value) {
      let [startDate, endDate] = cal.dtz.formatter.getItemDates(value);
      let timezone = startDate.timezone.displayName;
      let parts = cal.dtz.formatter.formatIntervalParts(startDate, endDate);
      l10n.setAttributes(
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
     *
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
      l10n.setAttributes(
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
        l10n.setAttributes(span, `calendar-invitation-panel-partstat-${partStat.toLowerCase()}`, {
          count: counts[partStat],
        });
        breakdown.appendChild(span);
      }
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
     *
     * @type {calIAttendee[]}
     */
    set attendees(value) {
      let ul = this.shadowRoot.getElementById("list");
      for (let att of value) {
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
   * InvitationAttachmentList displays a list of all attachments in the
   * invitation that have URIs. Binary attachments are not supported.
   */
  class InvitationAttachmentList extends BaseInvitationElement {
    constructor() {
      super("calendarInvitationAttachmentList");
    }

    /**
     * Setting this property will trigger rendering of the attachments list.
     *
     * @type {calIAttachment[]}
     */
    set attachments(value) {
      let ul = this.shadowRoot.getElementById("list");
      for (let attachment of value) {
        if (attachment.uri) {
          let item = document.createElement("li", { is: "calendar-invitation-attachment-item" });
          item.attachment = attachment;
          ul.appendChild(item);
        }
      }
    }
  }
  customElements.define("calendar-invitation-panel-attachment-list", InvitationAttachmentList);

  /**
   * InvitationAttachmentItem displays a link to an attachment attached to the
   * event.
   */
  class InvitationAttachmentItem extends HTMLLIElement {
    /**
     * Settings this property will set up the attachment to be displayed as a
     * link with appropriate icon. Links are opened externally.
     *
     * @type {calIAttachment[]}
     */
    set attachment(value) {
      let title = value.getParameter("FILENAME") || value.uri.spec;
      let link = document.createElement("a");
      link.textContent = title;
      link.setAttribute("href", value.uri.spec);
      link.addEventListener("click", event => {
        event.preventDefault();
        openLinkExternally(event.target.href);
      });

      let icon = document.createElement("img");
      let iconSrc = value.uri.spec.length ? value.uri.spec : "dummy.html";
      if (!value.uri.schemeIs("file")) {
        // Using an uri directly, with e.g. a http scheme, wouldn't render any icon.
        if (value.formatType) {
          iconSrc = "goat?contentType=" + value.formatType;
        } else {
          // Let's try to auto-detect.
          let parts = iconSrc.substr(value.uri.scheme.length + 2).split("/");
          if (parts.length) {
            iconSrc = parts[parts.length - 1];
          }
        }
      }
      icon.setAttribute("src", "moz-icon://" + iconSrc);
      this.append(icon, link);
    }
  }
  customElements.define("calendar-invitation-attachment-item", InvitationAttachmentItem, {
    extends: "li",
  });

  /**
   * InvitationChangeIndicator is a visual indicator for indicating some piece
   * of data has changed.
   */
  class InvitationChangeIndicator extends HTMLElement {
    constructor() {
      super();
      this.setAttribute("data-l10n-id", `calendar-invitation-change-indicator-modified`);
      this.hidden = true;
    }

    _typeMap = {
      [PROPERTY_REMOVED]: "removed",
      [PROPERTY_ADDED]: "added",
      [PROPERTY_MODIFIED]: "modified",
    };

    /**
     * One of the PROPERTY_* constants that indicates what kind of change we
     * are indicating (add/modify/delete) etc. Setting this will the text
     * displayed.
     * @type {number}
     */
    set type(value) {
      let key = this._typeMap[value];
      this.setAttribute("data-l10n-id", `calendar-invitation-change-indicator-${key}`);
    }
  }
  customElements.define("calendar-invitation-change-indicator", InvitationChangeIndicator);

  /**
   * InvitationPanelFooter renders the footer for the details section of
   * the invitation panel.
   */
  class InvitationPanelFooter extends BaseInvitationElement {
    constructor() {
      super("calendarInvitationPanelFooter");
    }

    connectedCallback() {
      l10n.setAttributes(
        this.shadowRoot.getElementById("status"),
        "calendar-invitation-panel-reply-status"
      );
    }
  }
  customElements.define("calendar-invitation-panel-footer", InvitationPanelFooter);
}
