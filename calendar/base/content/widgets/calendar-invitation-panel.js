/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals cal, MozXULElement, MozElements */

"use strict";

// Wrap in a block to prevent leaking to window scope.
{
  var { recurrenceRule2String } = ChromeUtils.importESModule(
    "resource:///modules/calendar/calRecurrenceUtils.sys.mjs"
  );
  const { openLinkExternally } = ChromeUtils.importESModule(
    "resource:///modules/LinkHelper.sys.mjs"
  );

  // calendar-invitation-panel.ftl is not globally loaded until now.
  MozXULElement.insertFTLIfNeeded("calendar/calendar-invitation-panel.ftl");

  const PROPERTY_REMOVED = -1;
  const PROPERTY_UNCHANGED = 0;
  const PROPERTY_ADDED = 1;
  const PROPERTY_MODIFIED = 2;

  /**
   * InvitationPanel displays the details of an iTIP event invitation in an
   * interactive panel.
   */
  class InvitationPanel extends HTMLElement {
    static MODE_NEW = "New";
    static MODE_ALREADY_PROCESSED = "Processed";
    static MODE_UPDATE_MAJOR = "UpdateMajor";
    static MODE_UPDATE_MINOR = "UpdateMinor";
    static MODE_CANCELLED = "Cancelled";
    static MODE_CANCELLED_NOT_FOUND = "CancelledNotFound";

    /**
     * Used to retrieve a property value from an event.
     *
     * @callback GetValue
     * @param {calIEvent} event
     * @returns {string}
     */

    /**
     * A function used to make a property value visible in to the user.
     *
     * @callback PropertyShow
     * @param {HTMLElement} node - The element responsible for displaying the
     *   value.
     * @param {string} value - The value of property to display.
     * @param {string} oldValue - The previous value of the property if the
     *   there is a prior copy of the event.
     * @param {calIEvent} item - The event item the property belongs to.
     * @param {string} oldItem - The prior version of the event if there is one.
     */

    /**
     * @typedef {object} InvitationPropertyDescriptor
     * @property {string} id - The id of the HTMLElement that displays
     *   the property.
     * @property {GetValue} getValue - Function used to retrieve the displayed
     *   value of the property from the item.
     * @property {boolean?} isList - Indicates the value of the property is a
     *   list.
     * @property {PropertyShow?} show - Function to use to display the property
     *   value if it is not a list.
     */

    /**
     * A static list of objects used in determining how to display each of the
     * properties.
     *
     * @type {PropertyDescriptor[]}
     */
    static propertyDescriptors = [
      {
        id: "when",
        getValue(item) {
          const tz = cal.dtz.defaultTimezone;
          const startDate = item.startDate?.getInTimezone(tz) ?? null;
          const endDate = item.endDate?.getInTimezone(tz) ?? null;
          return `${startDate.icalString}-${endDate?.icalString}`;
        },
        show(intervalNode, newValue, oldValue, item) {
          intervalNode.item = item;
        },
      },
      {
        id: "recurrence",
        getValue(item) {
          const parent = item.parentItem;
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
        id: "summary",
        getValue(item) {
          return item.getAttendees();
        },
        show(summary, value) {
          summary.attendees = value;
        },
      },
      {
        id: "attendees",
        isList: true,
        getValue(item) {
          return item.getAttendees();
        },
      },
      {
        id: "attachments",
        isList: true,
        getValue(item) {
          return item.getAttachments();
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
     * mode determines how the UI should display the received invitation. It
     * must be set to one of the MODE_* constants, defaults to MODE_NEW.
     *
     * @type {string}
     */
    mode = InvitationPanel.MODE_NEW;

    /**
     * A previous copy of the event item if found on an existing calendar.
     *
     * @type {calIEvent?}
     */
    foundItem;

    /**
     * The event item to be displayed.
     *
     * @type {calIEvent?}
     */
    item;

    constructor(id) {
      super();
      this.attachShadow({ mode: "open" });
      document.l10n.connectRoot(this.shadowRoot);

      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "chrome://calendar/skin/shared/widgets/calendar-invitation-panel.css";
      this.shadowRoot.appendChild(link);
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

    connectedCallback() {
      if (this.item && this.mode) {
        const template = document.getElementById(`calendarInvitationPanel`);
        this.shadowRoot.appendChild(template.content.cloneNode(true));

        if (this.foundItem && this.foundItem.title != this.item.title) {
          const indicator = this.shadowRoot.getElementById("titleChangeIndicator");
          indicator.status = PROPERTY_MODIFIED;
          indicator.hidden = false;
        }
        this.shadowRoot.getElementById("title").textContent = this.item.title;

        const statusBar = this.shadowRoot.querySelector("calendar-invitation-panel-status-bar");
        statusBar.status = this.mode;

        this.shadowRoot.querySelector("calendar-minidate").date = this.item.startDate;

        for (const prop of InvitationPanel.propertyDescriptors) {
          const el = this.shadowRoot.getElementById(prop.id);
          const value = prop.getValue(this.item);
          let result = PROPERTY_UNCHANGED;

          if (prop.isList) {
            const oldValue = this.foundItem ? prop.getValue(this.foundItem) : [];
            if (value.length || oldValue.length) {
              el.oldValue = oldValue;
              el.value = value;
              el.closest(".calendar-invitation-row").hidden = false;
            }
            continue;
          }

          const oldValue = this.foundItem ? prop.getValue(this.foundItem) : null;
          if (this.foundItem) {
            result = this.compare(oldValue, value);
            if (result) {
              const indicator = this.shadowRoot.getElementById(`${prop.id}ChangeIndicator`);
              if (indicator) {
                indicator.type = result;
                indicator.hidden = false;
              }
            }
          }
          if (value || oldValue) {
            prop.show(el, value, oldValue, this.item, this.foundItem, result);
            el.closest(".calendar-invitation-row").hidden = false;
          }
        }

        if (
          this.mode == InvitationPanel.MODE_NEW ||
          this.mode == InvitationPanel.MODE_UPDATE_MAJOR
        ) {
          for (const button of this.shadowRoot.querySelectorAll("#actionButtons > button")) {
            button.addEventListener("click", e =>
              this.dispatchEvent(
                new CustomEvent("calendar-invitation-panel-action", {
                  detail: { type: button.dataset.action },
                })
              )
            );
          }
          this.shadowRoot.getElementById("footer").hidden = false;
        }
      }
    }
  }
  customElements.define("calendar-invitation-panel", InvitationPanel);

  /**
   * Object used to describe relevant arguments to MozElements.NotificationBox.
   * appendNotification().
   *
   * @type {object} InvitationStatusBarDescriptor
   * @property {string} label - An l10n id used used to generate the
   *   notification bar text.
   * @property {number} priority - One of the notification box constants that
   *   indicate the priority of a notification.
   * @property {object[]} buttons - An array of objects corresponding to the
   *   "buttons" argument of MozElements.NotificationBox.appendNotification().
   *   See that method for details.
   */

  /**
   * InvitationStatusBar generates a notification bar that informs the user about
   * the status of the received invitation and possible actions they may take.
   */
  class InvitationPanelStatusBar extends HTMLElement {
    /**
     * @type {NotificationBox}
     */
    get notificationBox() {
      if (!this._notificationBox) {
        this._notificationBox = new MozElements.NotificationBox(element => {
          this.append(element);
        });
      }
      return this._notificationBox;
    }

    /**
     * Map-like object where each key is an InvitationPanel mode and the values
     * are descriptors used to generate the notification bar for that mode.
     *
     * @type {Object<string, InvitationStatusBarDescriptor>}
     */
    notices = {
      [InvitationPanel.MODE_NEW]: {
        label: "calendar-invitation-panel-status-new",
        buttons: [
          {
            "l10n-id": "calendar-invitation-panel-more-button",
            callback: (notification, opts, button, event) =>
              this._showMoreMenu(event, [
                {
                  l10nId: "calendar-invitation-panel-menu-item-save-copy",
                  name: "save",
                  command: e =>
                    this.dispatchEvent(
                      new CustomEvent("calendar-invitation-panel-action", {
                        details: { type: "x-savecopy" },
                        bubbles: true,
                        composed: true,
                      })
                    ),
                },
              ]),
          },
        ],
      },
      [InvitationPanel.MODE_ALREADY_PROCESSED]: {
        label: "calendar-invitation-panel-status-processed",
        buttons: [
          {
            "l10n-id": "calendar-invitation-panel-view-button",
            callback: () => {
              this.dispatchEvent(
                new CustomEvent("calendar-invitation-panel-action", {
                  detail: { type: "x-showdetails" },
                  bubbles: true,
                  composed: true,
                })
              );
              return true;
            },
          },
        ],
      },
      [InvitationPanel.MODE_UPDATE_MINOR]: {
        label: "calendar-invitation-panel-status-updateminor",
        priority: this.notificationBox.PRIORITY_WARNING_LOW,
        buttons: [
          {
            "l10n-id": "calendar-invitation-panel-update-button",
            callback: () => {
              this.dispatchEvent(
                new CustomEvent("calendar-invitation-panel-action", {
                  detail: { type: "update" },
                  bubbles: true,
                  composed: true,
                })
              );
              return true;
            },
          },
        ],
      },
      [InvitationPanel.MODE_UPDATE_MAJOR]: {
        label: "calendar-invitation-panel-status-updatemajor",
        priority: this.notificationBox.PRIORITY_WARNING_LOW,
      },
      [InvitationPanel.MODE_CANCELLED]: {
        label: "calendar-invitation-panel-status-cancelled",
        buttons: [{ "l10n-id": "calendar-invitation-panel-delete-button" }],
        priority: this.notificationBox.PRIORITY_CRITICAL_LOW,
      },
      [InvitationPanel.MODE_CANCELLED_NOT_FOUND]: {
        label: "calendar-invitation-panel-status-cancelled-notfound",
        priority: this.notificationBox.PRIORITY_CRITICAL_LOW,
      },
    };

    /**
     * status corresponds to one of the MODE_* constants and will trigger
     * rendering of the notification box.
     *
     * @type {string} status
     */
    set status(value) {
      const opts = this.notices[value];
      const priority = opts.priority || this.notificationBox.PRIORITY_INFO_LOW;
      const buttons = opts.buttons || [];
      this.notificationBox
        .appendNotification(
          "invitationStatus",
          {
            label: { "l10n-id": opts.label },
            priority,
          },
          buttons
        )
        .then(notification => (notification.dismissable = false), console.warn);
    }

    _showMoreMenu(event, menuitems) {
      const menu = document.getElementById("calendarInvitationPanelMoreMenu");
      menu.replaceChildren();
      for (const { type, l10nId, name, command } of menuitems) {
        const menuitem = document.createXULElement("menuitem");
        if (type) {
          menuitem.type = type;
        }
        if (name) {
          menuitem.name = name;
        }
        if (command) {
          menuitem.addEventListener("command", command);
        }
        document.l10n.setAttributes(menuitem, l10nId);
        menu.appendChild(menuitem);
      }
      menu.openPopup(event.originalTarget, "after_start", 0, 0, false, false, event);
      return true;
    }
  }
  customElements.define("calendar-invitation-panel-status-bar", InvitationPanelStatusBar);

  /**
   * InvitationInterval displays the formatted interval of the event. Formatting
   * relies on cal.dtz.formatter.formatIntervalParts().
   */
  class InvitationInterval extends HTMLElement {
    /**
     * The item whose interval to show.
     *
     * @type {calIEvent}
     */
    set item(value) {
      const [startDate, endDate] = cal.dtz.formatter.getItemDates(value);
      const timezone = startDate.timezone.displayName;
      const parts = cal.dtz.formatter.formatIntervalParts(startDate, endDate);
      document.l10n.setAttributes(this, `calendar-invitation-interval-${parts.type}`, {
        ...parts,
        timezone,
      });
    }
  }
  customElements.define("calendar-invitation-interval", InvitationInterval);

  const partStatOrder = ["ACCEPTED", "DECLINED", "TENTATIVE", "NEEDS-ACTION"];

  /**
   * InvitationPartStatSummary generates text indicating the aggregated
   * participation status of each attendee in the event's attendees list.
   */
  class InvitationPartStatSummary extends HTMLElement {
    constructor() {
      super();
      this.appendChild(
        document.getElementById("calendarInvitationPartStatSummary").content.cloneNode(true)
      );
    }

    /**
     * Setting this property will trigger an update of the text displayed.
     *
     * @type {calIAttendee[]}
     */
    set attendees(attendees) {
      const counts = {
        ACCEPTED: 0,
        DECLINED: 0,
        TENTATIVE: 0,
        "NEEDS-ACTION": 0,
        TOTAL: attendees.length,
        OTHER: 0,
      };

      for (const { participationStatus } of attendees) {
        if (counts.hasOwnProperty(participationStatus)) {
          counts[participationStatus]++;
        } else {
          counts.OTHER++;
        }
      }
      document.l10n.setAttributes(
        this.querySelector("#partStatTotal"),
        "calendar-invitation-panel-partstat-total",
        { count: counts.TOTAL }
      );

      const shownPartStats = partStatOrder.filter(partStat => counts[partStat]);
      const breakdown = this.querySelector("#partStatBreakdown");
      for (const partStat of shownPartStats) {
        const span = document.createElement("span");
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
  }
  customElements.define("calendar-invitation-partstat-summary", InvitationPartStatSummary);

  /**
   * BaseInvitationChangeList is a <ul> element that can visually show changes
   * between elements of a list value.
   *
   * @template T
   */
  class BaseInvitationChangeList extends HTMLUListElement {
    /**
     * An array containing the old values to be compared against for changes.
     *
     * @type {T[]}
     */
    oldValue = [];

    /**
     * String indicating the type of list items to create. This is passed
     * directly to the "is" argument of document.createElement().
     *
     * @abstract
     */
    listItem;

    _createListItem(value, status) {
      const li = document.createElement("li", { is: this.listItem });
      li.changeStatus = status;
      li.value = value;
      return li;
    }

    /**
     * Setting this property will trigger rendering of the list. If no prior
     * values are detected, change indicators are not touched.
     *
     * @type {T[]}
     */
    set value(list) {
      if (!this.oldValue.length) {
        for (const value of list) {
          this.append(this._createListItem(value));
        }
        return;
      }
      for (const [value, status] of this.getChanges(this.oldValue, list)) {
        this.appendChild(this._createListItem(value, status));
      }
    }

    /**
     * Implemented by sub-classes to generate a list of changes for each element
     * of the new list.
     *
     * @param {T[]} oldValue
     * @param {T[]} newValue
     * @returns {[T, number][]}
     */
    getChanges(oldValue, newValue) {
      throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
    }
  }

  /**
   * BaseInvitationChangeListItem is the <li> element used for change lists.
   *
   * @template {T}
   */
  class BaseInvitationChangeListItem extends HTMLLIElement {
    /**
     * Indicates whether the item value has changed and should be displayed as
     * such. Its value is one of the PROPERTY_* constants.
     *
     * @type {number}
     */
    changeStatus = PROPERTY_UNCHANGED;

    /**
     * Settings this property will render the list item including a change
     * indicator if the changeStatus property != PROPERTY_UNCHANGED.
     *
     * @type {T}
     */
    set value(itemValue) {
      this.build(itemValue);
      if (this.changeStatus) {
        const changeIndicator = document.createElement("calendar-invitation-change-indicator");
        changeIndicator.type = this.changeStatus;
        this.append(changeIndicator);
      }
    }

    /**
     * Implemented by sub-classes to build the <li> inner DOM structure.
     *
     * @param {T} value
     * @abstract
     */
    build(value) {
      throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
    }
  }

  /**
   * InvitationAttendeeList displays a list of all the attendees on an event's
   * attendee list.
   */
  class InvitationAttendeeList extends BaseInvitationChangeList {
    listItem = "calendar-invitation-panel-attendee-list-item";

    getChanges(oldValue, newValue) {
      const diff = [];
      for (const att of newValue) {
        const oldAtt = oldValue.find(oldAtt => oldAtt.id == att.id);
        if (!oldAtt) {
          diff.push([att, PROPERTY_ADDED]); // New attendee.
        } else if (oldAtt.participationStatus != att.participationStatus) {
          diff.push([att, PROPERTY_MODIFIED]); // Participation status changed.
        } else {
          diff.push([att, PROPERTY_UNCHANGED]); // No change.
        }
      }

      // Insert removed attendees into the diff.
      for (const [idx, att] of oldValue.entries()) {
        const found = newValue.find(newAtt => newAtt.id == att.id);
        if (!found) {
          diff.splice(idx, 0, [att, PROPERTY_REMOVED]);
        }
      }
      return diff;
    }
  }
  customElements.define("calendar-invitation-panel-attendee-list", InvitationAttendeeList, {
    extends: "ul",
  });

  /**
   * InvitationAttendeeListItem displays a single attendee from the attendee
   * list.
   */
  class InvitationAttendeeListItem extends BaseInvitationChangeListItem {
    build(value) {
      const span = document.createElement("span");
      if (this.changeStatus == PROPERTY_REMOVED) {
        span.setAttribute("class", "removed");
      }
      span.textContent = value;
      this.appendChild(span);
    }
  }
  customElements.define(
    "calendar-invitation-panel-attendee-list-item",
    InvitationAttendeeListItem,
    {
      extends: "li",
    }
  );

  /**
   * InvitationAttachmentList displays a list of all attachments in the invitation
   * that have URIs. Binary attachments are not supported.
   */
  class InvitationAttachmentList extends BaseInvitationChangeList {
    listItem = "calendar-invitation-panel-attachment-list-item";

    getChanges(oldValue, newValue) {
      const diff = [];
      for (const attch of newValue) {
        if (!attch.uri) {
          continue;
        }
        const oldAttch = oldValue.find(
          oldAttch => oldAttch.uri && oldAttch.uri.spec == attch.uri.spec
        );

        if (!oldAttch) {
          // New attachment.
          diff.push([attch, PROPERTY_ADDED]);
          continue;
        }
        if (
          attch.hashId != oldAttch.hashId ||
          attch.getParameter("FILENAME") != oldAttch.getParameter("FILENAME")
        ) {
          // Contents changed or renamed.
          diff.push([attch, PROPERTY_MODIFIED]);
          continue;
        }
        // No change.
        diff.push([attch, PROPERTY_UNCHANGED]);
      }

      // Insert removed attachments into the diff.
      for (const [idx, attch] of oldValue.entries()) {
        if (!attch.uri) {
          continue;
        }
        const found = newValue.find(newAtt => newAtt.uri && newAtt.uri.spec == attch.uri.spec);
        if (!found) {
          diff.splice(idx, 0, [attch, PROPERTY_REMOVED]);
        }
      }
      return diff;
    }
  }
  customElements.define("calendar-invitation-panel-attachment-list", InvitationAttachmentList, {
    extends: "ul",
  });

  /**
   * InvitationAttachmentListItem displays a link to an attachment attached to the
   * event.
   */
  class InvitationAttachmentListItem extends BaseInvitationChangeListItem {
    /**
     * Indicates whether the attachment has changed and should be displayed as
     * such. Its value is one of the PROPERTY_* constants.
     *
     * @type {number}
     */
    changeStatus = PROPERTY_UNCHANGED;

    /**
     * Sets up the attachment to be displayed as a link with appropriate icon.
     * Links are opened externally.
     *
     * @param {calIAttachment} value
     */
    build(value) {
      const icon = document.createElement("img");
      let iconSrc = value.uri.spec.length ? value.uri.spec : "dummy.html";
      if (!value.uri.schemeIs("file")) {
        // Using an uri directly, with e.g. a http scheme, wouldn't render any icon.
        if (value.formatType) {
          iconSrc = "goat?contentType=" + value.formatType;
        } else {
          // Let's try to auto-detect.
          const parts = iconSrc.substr(value.uri.scheme.length + 2).split("/");
          if (parts.length) {
            iconSrc = parts[parts.length - 1];
          }
        }
      }
      icon.setAttribute("src", "moz-icon://" + iconSrc);
      this.append(icon);

      const title = value.getParameter("FILENAME") || value.uri.spec;
      if (this.changeStatus == PROPERTY_REMOVED) {
        const span = document.createElement("span");
        span.setAttribute("class", "removed");
        span.textContent = title;
        this.append(span);
      } else {
        const link = document.createElement("a");
        link.textContent = title;
        link.setAttribute("href", value.uri.spec);
        link.addEventListener("click", event => {
          event.preventDefault();
          openLinkExternally(event.target.href);
        });
        this.append(link);
      }
    }
  }
  customElements.define(
    "calendar-invitation-panel-attachment-list-item",
    InvitationAttachmentListItem,
    {
      extends: "li",
    }
  );

  /**
   * InvitationChangeIndicator is a visual indicator for indicating some piece
   * of data has changed.
   */
  class InvitationChangeIndicator extends HTMLElement {
    _typeMap = {
      [PROPERTY_REMOVED]: "removed",
      [PROPERTY_ADDED]: "added",
      [PROPERTY_MODIFIED]: "modified",
    };

    /**
     * One of the PROPERTY_* constants that indicates what kind of change we
     * are indicating (add/modify/delete) etc.
     *
     * @type {number}
     */
    set type(value) {
      const key = this._typeMap[value];
      document.l10n.setAttributes(this, `calendar-invitation-change-indicator-${key}`);
    }
  }
  customElements.define("calendar-invitation-change-indicator", InvitationChangeIndicator);
}
