/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global MozElements MozXULElement */

/* import-globals-from ../../src/calApplicationUtils.js */
/* import-globals-from ../dialogs/calendar-summary-dialog.js */

// Wrap in a block to prevent leaking to window scope.
{
  var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
  var { recurrenceStringFromItem } = ChromeUtils.importESModule(
    "resource:///modules/calendar/calRecurrenceUtils.sys.mjs"
  );

  /**
   * Represents a mostly read-only summary of a calendar item. Used in places
   * like the calendar summary dialog and calendar import dialog. All instances
   * should have an ID attribute.
   */
  class CalendarItemSummary extends MozXULElement {
    static get markup() {
      return `<vbox class="item-summary-box" flex="1">
        <!-- General -->
        <hbox class="calendar-caption" align="center">
          <label value="&read.only.general.label;" class="header"/>
          <separator class="groove" flex="1"/>
        </hbox>
        <html:table class="calendar-summary-table">
          <html:tr>
            <html:th>
              &read.only.title.label;
            </html:th>
            <html:td class="item-title">
            </html:td>
          </html:tr>
          <html:tr class="calendar-row" hidden="hidden">
            <html:th>
              &read.only.calendar.label;
            </html:th>
            <html:td class="item-calendar">
            </html:td>
          </html:tr>
          <html:tr class="item-date-row">
            <html:th class="item-start-row-label"
                     taskStartLabel="&read.only.task.start.label;"
                     eventStartLabel="&read.only.event.start.label;">
            </html:th>
            <html:td class="item-date-row-start-date">
            </html:td>
          </html:tr>
          <html:tr class="item-date-row">
            <html:th class="item-due-row-label"
                     taskDueLabel="&read.only.task.due.label;"
                     eventEndLabel="&read.only.event.end.label;">
            </html:th>
            <html:td class="item-date-row-end-date">
            </html:td>
          </html:tr>
          <html:tr class="repeat-row" hidden="hidden">
            <html:th>
              &read.only.repeat.label;
            </html:th>
            <html:td class="repeat-details">
            </html:td>
          </html:tr>
          <html:tr class="location-row" hidden="hidden">
            <html:th>
              &read.only.location.label;
            </html:th>
            <html:td class="item-location">
            </html:td>
          </html:tr>
          <html:tr class="category-row" hidden="hidden">
            <html:th>
              &read.only.category.label;
            </html:th>
            <html:td class="item-category">
            </html:td>
          </html:tr>
          <html:tr class="item-organizer-row" hidden="hidden">
            <html:th>
              &read.only.organizer.label;
            </html:th>
            <html:td class="item-organizer-cell">
            </html:td>
          </html:tr>
          <html:tr class="status-row" hidden="hidden">
            <html:th>
              &task.status.label;
            </html:th>
            <html:td class="status-row-td">
              <html:div hidden="true" status="TENTATIVE">&newevent.status.tentative.label;</html:div>
              <html:div hidden="true" status="CONFIRMED">&newevent.status.confirmed.label;</html:div>
              <html:div hidden="true" status="CANCELLED">&newevent.eventStatus.cancelled.label;</html:div>
              <html:div hidden="true" status="CANCELLED">&newevent.todoStatus.cancelled.label;</html:div>
              <html:div hidden="true" status="NEEDS-ACTION">&newevent.status.needsaction.label;</html:div>
              <html:div hidden="true" status="IN-PROCESS">&newevent.status.inprogress.label;</html:div>
              <html:div hidden="true" status="COMPLETED">&newevent.status.completed.label;</html:div>
            </html:td>
          </html:tr>
          <separator class="groove" flex="1" hidden="true"/>
          <html:tr class="reminder-row" hidden="hidden">
            <html:th class="reminder-label">
              &read.only.reminder.label;
            </html:th>
            <html:td class="reminder-details">
            </html:td>
          </html:tr>
          <html:tr class="attachments-row item-attachments-row" hidden="hidden" >
            <html:th class="attachments-label">
              &read.only.attachments.label;
            </html:th>
            <html:td>
              <vbox class="item-attachment-cell">
                <!-- attachment box template -->
                <hbox class="attachment-template"
                      hidden="true"
                      align="center"
                      disable-on-readonly="true">
                  <html:img class="attachment-icon invisible-on-broken"
                            alt="" />
                  <label class="text-link item-attachment-cell-label"
                         crop="end"
                         flex="1" />
                </hbox>
              </vbox>
            </html:td>
          </html:tr>
        </html:table>
        <!-- Attendees -->
        <box class="item-attendees-description">
          <box class="item-attendees" orient="vertical" hidden="true">
            <spacer class="default-spacer"/>
            <hbox class="calendar-caption" align="center">
              <label value="&read.only.attendees.label;"
                    class="header"/>
              <separator class="groove" flex="1"/>
            </hbox>
            <vbox class="item-attendees-list-container"
                  flex="1"
                  context="attendee-popup"
                  oncontextmenu="onAttendeeContextMenu(event)">
            </vbox>
          </box>

          <splitter id="attendeeDescriptionSplitter"
                    class="item-summary-splitter"
                    collapse="after"
                    orient="vertical"
                    state="open"/>

          <!-- Description -->
          <box class="item-description-box" hidden="true" orient="vertical">
            <hbox class="calendar-caption" align="center">
              <label value="&read.only.description.label;"
                    class="header"/>
              <separator class="groove" flex="1"/>
            </hbox>
            <iframe class="item-description"
                    type="content"
                    flex="1"
                    oncontextmenu="openDescriptionContextMenu(event);">
            </iframe>
          </box>
        </box>

        <!-- URL link -->
        <box class="event-grid-link-row" hidden="true" orient="vertical">
          <spacer class="default-spacer"/>
          <hbox class="calendar-caption" align="center">
            <label value="&read.only.link.label;"
                   class="header"/>
            <separator class="groove" flex="1"/>
          </hbox>
          <label class="url-link text-link default-indent"
                 crop="end"/>
        </box>
      </vbox>`;
    }

    static get entities() {
      return [
        "chrome://calendar/locale/global.dtd",
        "chrome://calendar/locale/calendar.dtd",
        "chrome://calendar/locale/calendar-event-dialog.dtd",
        "chrome://branding/locale/brand.dtd",
      ];
    }

    static get alarmMenulistFragment() {
      const frag = document.importNode(
        MozXULElement.parseXULToFragment(
          `<hbox align="center">
            <menulist class="item-alarm"
                      disable-on-readonly="true">
              <menupopup>
                <menuitem label="&event.reminder.none.label;"
                          selected="true"
                          value="none"/>
                <menuseparator/>
                <menuitem label="&event.reminder.0minutes.before.label;"
                          length="0"
                          origin="before"
                          relation="START"
                          unit="minutes"/>
                <menuitem label="&event.reminder.5minutes.before.label;"
                          length="5"
                          origin="before"
                          relation="START"
                          unit="minutes"/>
                <menuitem label="&event.reminder.15minutes.before.label;"
                          length="15"
                          origin="before"
                          relation="START"
                          unit="minutes"/>
                <menuitem label="&event.reminder.30minutes.before.label;"
                          length="30"
                          origin="before"
                          relation="START"
                          unit="minutes"/>
                <menuseparator/>
                <menuitem label="&event.reminder.1hour.before.label;"
                          length="1"
                          origin="before"
                          relation="START"
                          unit="hours"/>
                <menuitem label="&event.reminder.2hours.before.label;"
                          length="2"
                          origin="before"
                          relation="START"
                          unit="hours"/>
                <menuitem label="&event.reminder.12hours.before.label;"
                          length="12"
                          origin="before"
                          relation="START"
                          unit="hours"/>
                <menuseparator/>
                <menuitem label="&event.reminder.1day.before.label;"
                          length="1"
                          origin="before"
                          relation="START"
                          unit="days"/>
                <menuitem label="&event.reminder.2days.before.label;"
                          length="2"
                          origin="before"
                          relation="START"
                          unit="days"/>
                <menuitem label="&event.reminder.1week.before.label;"
                          length="7"
                          origin="before"
                          relation="START"
                          unit="days"/>
                <menuseparator/>
                <menuitem class="reminder-custom-menuitem"
                          label="&event.reminder.custom.label;"
                          value="custom"/>
              </menupopup>
            </menulist>
            <hbox class="reminder-details">
              <hbox class="alarm-icons-box" align="center"/>
              <!-- TODO oncommand? onkeypress? -->
              <label class="reminder-multiple-alarms-label text-link"
                     hidden="true"
                     value="&event.reminder.multiple.label;"
                     disable-on-readonly="true"
                     flex="1"
                     hyperlink="true"/>
              <label class="reminder-single-alarms-label text-link"
                     hidden="true"
                     disable-on-readonly="true"
                     flex="1"
                     hyperlink="true"/>
            </hbox>
          </hbox>`,
          CalendarItemSummary.entities
        ),
        true
      );
      Object.defineProperty(this, "alarmMenulistFragment", { value: frag });
      return frag;
    }

    connectedCallback() {
      if (this.delayConnectedCallback() || this.hasConnected) {
        return;
      }
      this.hasConnected = true;

      this.appendChild(this.constructor.fragment);

      this.mItem = null;
      this.mCalendar = null;
      this.mReadOnly = true;
      this.mIsInvitation = false;

      this.mIsToDoItem = null;

      const urlLink = this.querySelector(".url-link");
      urlLink.addEventListener("click", event => {
        launchBrowser(urlLink.getAttribute("href"), event);
      });
      urlLink.addEventListener("command", event => {
        launchBrowser(urlLink.getAttribute("href"), event);
      });
    }

    set item(item) {
      this.mItem = item;
      this.mIsToDoItem = item.isTodo();

      // When used in places like the import dialog, there is no calendar (yet).
      if (item.calendar) {
        this.mCalendar = item.calendar;

        this.mIsInvitation =
          item.calendar.supportsScheduling &&
          item.calendar.getSchedulingSupport()?.isInvitation(item);

        this.mReadOnly = !(
          cal.acl.isCalendarWritable(this.mCalendar) &&
          (cal.acl.userCanModifyItem(item) ||
            (this.mIsInvitation && cal.acl.userCanRespondToInvitation(item)))
        );
      }

      if (!item.descriptionHTML || !item.getAttendees().length) {
        // Hide the splitter when there is no description or attendees.
        document.getElementById("attendeeDescriptionSplitter").setAttribute("hidden", "true");
      }
    }

    get item() {
      return this.mItem;
    }

    get calendar() {
      return this.mCalendar;
    }

    get readOnly() {
      return this.mReadOnly;
    }

    get isInvitation() {
      return this.mIsInvitation;
    }

    /**
     * Update the item details in the UI. To be called when this element is
     * first rendered and when the item changes.
     */
    updateItemDetails() {
      if (!this.item) {
        // Setup not complete, do nothing for now.
        return;
      }
      const item = this.item;
      const isToDoItem = this.mIsToDoItem;

      this.querySelector(".item-title").textContent = item.title;

      if (this.calendar) {
        this.querySelector(".calendar-row").removeAttribute("hidden");
        this.querySelector(".item-calendar").textContent = this.calendar.name;
      }

      // Show start date.
      const itemStartDate = item[cal.dtz.startDateProp(item)];

      const itemStartRowLabel = this.querySelector(".item-start-row-label");
      const itemDateRowStartDate = this.querySelector(".item-date-row-start-date");

      itemStartRowLabel.style.visibility = itemStartDate ? "visible" : "collapse";
      itemDateRowStartDate.style.visibility = itemStartDate ? "visible" : "collapse";

      if (itemStartDate) {
        itemStartRowLabel.textContent = itemStartRowLabel.getAttribute(
          isToDoItem ? "taskStartLabel" : "eventStartLabel"
        );
        itemDateRowStartDate.textContent = cal.dtz.getStringForDateTime(itemStartDate);
      }

      // Show due date / end date.
      let itemDueDate = item[cal.dtz.endDateProp(item)];

      const itemDueRowLabel = this.querySelector(".item-due-row-label");
      const itemDateRowEndDate = this.querySelector(".item-date-row-end-date");

      itemDueRowLabel.style.visibility = itemDueDate ? "visible" : "collapse";
      itemDateRowEndDate.style.visibility = itemDueDate ? "visible" : "collapse";

      if (itemDueDate) {
        // For all-day events, display the last day, not the finish time.
        if (itemDueDate.isDate) {
          itemDueDate = itemDueDate.clone();
          itemDueDate.day--;
        }
        itemDueRowLabel.textContent = itemDueRowLabel.getAttribute(
          isToDoItem ? "taskDueLabel" : "eventEndLabel"
        );
        itemDateRowEndDate.textContent = cal.dtz.getStringForDateTime(itemDueDate);
      }

      const alarms = item.getAlarms();
      const hasAlarms = alarms && alarms.length;
      const canShowReadOnlyReminders = hasAlarms && item.calendar;
      const shouldShowReminderMenu =
        !this.readOnly &&
        this.isInvitation &&
        item.calendar &&
        item.calendar.getProperty("capabilities.alarms.oninvitations.supported") !== false;

      // For invitations where the reminders can be edited, show a menu to
      // allow setting the reminder, because you can't edit an invitation in
      // the edit item dialog. For all other cases, show a plain text
      // representation of the reminders but only if there are any.
      if (shouldShowReminderMenu) {
        if (!this.mAlarmsMenu) {
          // Attempt to vertically align the label. It's not perfect but it's the best we've got.
          const reminderLabel = this.querySelector(".reminder-label");
          reminderLabel.style.verticalAlign = "middle";
          const reminderCell = this.querySelector(".reminder-details");
          while (reminderCell.lastChild) {
            reminderCell.lastChild.remove();
          }

          // Add the menulist dynamically only if it's going to be used. This removes a
          // significant performance penalty in most use cases.
          reminderCell.append(this.constructor.alarmMenulistFragment.cloneNode(true));
          this.mAlarmsMenu = this.querySelector(".item-alarm");
          this.mLastAlarmSelection = 0;

          this.mAlarmsMenu.addEventListener("command", () => {
            this.updateReminder();
          });

          this.querySelector(".reminder-multiple-alarms-label").addEventListener("click", () => {
            this.updateReminder();
          });

          this.querySelector(".reminder-single-alarms-label").addEventListener("click", () => {
            this.updateReminder();
          });
        }

        if (hasAlarms) {
          this.mLastAlarmSelection = loadReminders(alarms, this.mAlarmsMenu, this.mItem.calendar);
        }
        this.updateReminder();
      } else if (canShowReadOnlyReminders) {
        this.updateReminderReadOnly(alarms);
      }

      if (shouldShowReminderMenu || canShowReadOnlyReminders) {
        this.querySelector(".reminder-row").removeAttribute("hidden");
      }

      const recurrenceDetails = recurrenceStringFromItem(
        item,
        "calendar-event-dialog",
        "ruleTooComplexSummary"
      );
      this.updateRecurrenceDetails(recurrenceDetails);
      this.updateAttendees(item);

      const url = item.getProperty("URL")?.trim() || "";

      const link = this.querySelector(".url-link");
      link.setAttribute("href", url);
      link.setAttribute("value", url);
      // Hide the row if there is no url.
      this.querySelector(".event-grid-link-row").hidden = !url;

      const location = item.getProperty("LOCATION");
      if (location) {
        this.updateLocation(location);
      }

      const categories = item.getCategories();
      if (categories.length > 0) {
        this.querySelector(".category-row").removeAttribute("hidden");
        // TODO: this join is unfriendly for l10n (categories.join(", ")).
        this.querySelector(".item-category").textContent = categories.join(", ");
      }

      if (item.organizer && item.organizer.id) {
        this.updateOrganizer(item);
      }

      const status = item.getProperty("STATUS");
      if (status && status.length) {
        this.updateStatus(status, isToDoItem);
      }

      const descriptionText = item.descriptionText?.trim();
      if (descriptionText) {
        this.updateDescription(descriptionText, item.descriptionHTML);
      }

      const attachments = item.getAttachments();
      if (attachments.length) {
        this.updateAttachments(attachments);
      }
    }

    /**
     * Updates the reminder, called when a reminder has been selected in the
     * menulist.
     */
    updateReminder() {
      this.mLastAlarmSelection = commonUpdateReminder(
        this.mAlarmsMenu,
        this.mItem,
        this.mLastAlarmSelection,
        this.mItem.calendar,
        this.querySelector(".reminder-details"),
        null,
        false
      );
    }

    /**
     * Updates the reminder to display the set reminders as read-only text.
     * Depends on updateReminder() to get the text to display.
     */
    updateReminderReadOnly(alarms) {
      const reminderLabel = this.querySelector(".reminder-label");
      reminderLabel.style.verticalAlign = null;
      const reminderCell = this.querySelector(".reminder-details");
      while (reminderCell.lastChild) {
        reminderCell.lastChild.remove();
      }
      delete this.mAlarmsMenu;

      switch (alarms.length) {
        case 0:
          reminderCell.textContent = "";
          break;
        case 1:
          reminderCell.textContent = alarms[0].toString(this.item);
          break;
        default:
          for (const a of alarms) {
            reminderCell.appendChild(document.createTextNode(a.toString(this.item)));
            reminderCell.appendChild(document.createElement("br"));
          }
          break;
      }
    }

    /**
     * Updates the item's recurrence details, i.e. shows text describing them,
     * or hides the recurrence row if the item does not recur.
     *
     * @param {string | null} details - Recurrence details as a string or null.
     *                                  Passing null hides the recurrence row.
     */
    updateRecurrenceDetails(details) {
      const repeatRow = this.querySelector(".repeat-row");
      const repeatDetails = repeatRow.querySelector(".repeat-details");

      repeatRow.toggleAttribute("hidden", !details);
      repeatDetails.textContent = details ? details.replace(/\n/g, " ") : "";
    }

    /**
     * Updates the attendee listbox, displaying all attendees invited to the item.
     */
    updateAttendees(item) {
      const attendees = item.getAttendees();
      if (attendees && attendees.length) {
        this.querySelector(".item-attendees").removeAttribute("hidden");
        this.querySelector(".item-attendees-list-container").appendChild(
          cal.invitation.createAttendeesList(document, attendees)
        );
      }
    }

    /**
     * Updates the location, creating a link if the value is a URL.
     *
     * @param {string} location - The value of the location property.
     */
    updateLocation(location) {
      this.querySelector(".location-row").removeAttribute("hidden");
      const urlMatch = location.match(/(https?:\/\/[^ ]*)/);
      const url = urlMatch && urlMatch[1];
      const itemLocation = this.querySelector(".item-location");
      if (url) {
        const link = document.createElementNS("http://www.w3.org/1999/xhtml", "a");
        link.setAttribute("class", "item-location-link text-link");
        link.setAttribute("href", url);
        link.title = url;
        link.setAttribute("onclick", "launchBrowser(this.getAttribute('href'), event)");
        link.setAttribute("oncommand", "launchBrowser(this.getAttribute('href'), event)");

        const label = document.createXULElement("label");
        label.setAttribute("context", "location-link-context-menu");
        label.textContent = location;
        link.appendChild(label);

        itemLocation.replaceChildren(link);
      } else {
        itemLocation.textContent = location;
      }
    }

    /**
     * Update the organizer part of the UI.
     *
     * @param {calIItemBase} item - The calendar item.
     */
    updateOrganizer(item) {
      this.querySelector(".item-organizer-row").removeAttribute("hidden");
      const organizerLabel = cal.invitation.createAttendeeLabel(
        document,
        item.organizer,
        item.getAttendees()
      );
      const organizerName = organizerLabel.querySelector(".attendee-name");
      organizerName.classList.add("text-link");
      organizerName.addEventListener("click", () => sendMailToOrganizer(this.mItem));
      this.querySelector(".item-organizer-cell").appendChild(organizerLabel);
    }

    /**
     * Update the status part of the UI.
     *
     * @param {string} status - The status of the calendar item.
     * @param {boolean} isToDoItem - True if the calendar item is a todo, false if an event.
     */
    updateStatus(status, isToDoItem) {
      const statusRow = this.querySelector(".status-row");
      const statusRowData = this.querySelector(".status-row-td");

      for (let i = 0; i < statusRowData.children.length; i++) {
        if (statusRowData.children[i].getAttribute("status") == status) {
          statusRow.removeAttribute("hidden");

          if (status == "CANCELLED" && isToDoItem) {
            // There are two status elements for CANCELLED, the second one is for
            // todo items. Increment the counter here.
            i++;
          }
          statusRowData.children[i].removeAttribute("hidden");
          break;
        }
      }
    }

    /**
     * Update the description part of the UI.
     *
     * @param {string} descriptionText - The value of the DESCRIPTION property.
     * @param {string} descriptionHTML - HTML description if available.
     */
    async updateDescription(descriptionText, descriptionHTML) {
      this.querySelector(".item-description-box").removeAttribute("hidden");
      const itemDescription = this.querySelector(".item-description");
      if (itemDescription.contentDocument.readyState != "complete") {
        // The iframe's document hasn't loaded yet. If we add to it now, what we add will be
        // overwritten. Wait for the initial document to load.
        await new Promise(resolve => {
          itemDescription._listener = {
            QueryInterface: ChromeUtils.generateQI([
              "nsIWebProgressListener",
              "nsISupportsWeakReference",
            ]),
            onStateChange(webProgress, request, stateFlags) {
              if (stateFlags & Ci.nsIWebProgressListener.STATE_STOP) {
                itemDescription.browsingContext.webProgress.removeProgressListener(this);
                delete itemDescription._listener;
                resolve();
              }
            },
          };
          itemDescription.browsingContext.webProgress.addProgressListener(
            itemDescription._listener,
            Ci.nsIWebProgress.NOTIFY_STATE_ALL
          );
        });
      }
      const docFragment = cal.view.textToHtmlDocumentFragment(
        descriptionText,
        itemDescription.contentDocument,
        descriptionHTML
      );

      // Make any links open in the user's default browser, not in Thunderbird.
      for (const anchor of docFragment.querySelectorAll("a")) {
        anchor.addEventListener("click", function (event) {
          event.preventDefault();
          if (event.isTrusted) {
            launchBrowser(anchor.getAttribute("href"), event);
          }
        });
      }

      itemDescription.contentDocument.body.appendChild(docFragment);

      const link = itemDescription.contentDocument.createElement("link");
      link.rel = "stylesheet";
      link.href = "chrome://messenger/skin/shared/editorContent.css";
      itemDescription.contentDocument.head.appendChild(link);
    }

    /**
     * Update the attachments part of the UI.
     *
     * @param {calIAttachment[]} attachments - Array of attachment objects.
     */
    updateAttachments(attachments) {
      // We only want to display URI type attachments and no ones received inline with the
      // invitation message (having a CID: prefix results in about:blank) here.
      let attCounter = 0;
      attachments.forEach(aAttachment => {
        if (aAttachment.uri && aAttachment.uri.spec != "about:blank") {
          const attachment = this.querySelector(".attachment-template").cloneNode(true);
          attachment.removeAttribute("id");
          attachment.removeAttribute("hidden");

          const label = attachment.querySelector("label");
          label.setAttribute("value", aAttachment.uri.spec);

          label.addEventListener("click", () => {
            openAttachmentFromItemSummary(aAttachment.hashId, this.mItem);
          });

          const icon = attachment.querySelector("img");
          let iconSrc = aAttachment.uri.spec.length ? aAttachment.uri.spec : "dummy.html";
          if (aAttachment.uri && !aAttachment.uri.schemeIs("file")) {
            // Using an uri directly, with e.g. a http scheme, wouldn't render any icon.
            if (aAttachment.formatType) {
              iconSrc = "goat?contentType=" + aAttachment.formatType;
            } else {
              // Let's try to auto-detect.
              const parts = iconSrc.substr(aAttachment.uri.scheme.length + 2).split("/");
              if (parts.length) {
                iconSrc = parts[parts.length - 1];
              }
            }
          }
          icon.setAttribute("src", "moz-icon://" + iconSrc);

          this.querySelector(".item-attachment-cell").appendChild(attachment);
          attCounter++;
        }
      });

      if (attCounter > 0) {
        this.querySelector(".attachments-row").removeAttribute("hidden");
      }
    }
  }

  customElements.define("calendar-item-summary", CalendarItemSummary);
}
