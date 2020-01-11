/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported onLoad, onUnload */

/* globals invitationsText, MozXULElement, MozElements */ // From calendar-invitations-dialog.xhtml.

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

// Wrap in a block to prevent leaking to window scope.
{
  const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

  class MozCalendarInvitationsRichlistitem extends MozElements.MozRichlistitem {
    constructor() {
      super();

      this.mDateFormatter = null;
      this.mCalendarItem = null;
      this.mInitialParticipationStatus = null;
      this.mParticipationStatus = null;
      this.mDateFormatter = cal.getDateFormatter();
      this.calInvitationsProps = Services.strings.createBundle(
        "chrome://calendar/locale/calendar-invitations-dialog.properties"
      );
    }

    getString(propName) {
      return this.calInvitationsProps.GetStringFromName(propName);
    }

    connectedCallback() {
      if (this.delayConnectedCallback() || this.hasChildNodes()) {
        return;
      }

      this.setAttribute("is", "calendar-invitations-richlistitem");
      this.classList.add("calendar-invitations-richlistitem");

      this.appendChild(
        MozXULElement.parseXULToFragment(
          `
          <hbox align="start" flex="1">
            <image class="calendar-invitations-richlistitem-icon"/>
            <vbox flex="1">
              <label class="calendar-invitations-richlistitem-title" crop="end"/>
              <label class="calendar-invitations-richlistitem-date" crop="end"/>
              <label class="calendar-invitations-richlistitem-recurrence" crop="end"/>
              <label class="calendar-invitations-richlistitem-location" crop="end"/>
              <label class="calendar-invitations-richlistitem-organizer" crop="end"/>
              <label class="calendar-invitations-richlistitem-attendee" crop="end"/>
              <label class="calendar-invitations-richlistitem-spacer" value="" hidden="true"/>
            </vbox>
            <vbox>
              <button group="${this.getAttribute("itemId")}"
                      type="radio"
                      class="calendar-invitations-richlistitem-accept-button
                      calendar-invitations-richlistitem-button"
                      label="&calendar.invitations.list.accept.button.label;"
                      oncommand="accept();"/>
              <button group="${this.getAttribute("itemId")}"
                      type="radio"
                      class="calendar-invitations-richlistitem-decline-button
                      calendar-invitations-richlistitem-button"
                      label="&calendar.invitations.list.decline.button.label;"
                      oncommand="decline();"/>
            </vbox>
          </hbox>
          `,
          ["chrome://calendar/locale/calendar-invitations-dialog.dtd"]
        )
      );
    }

    set calendarItem(val) {
      this.setCalendarItem(val);
      return val;
    }

    get calendarItem() {
      return this.mCalendarItem;
    }

    set initialParticipationStatus(val) {
      this.mInitialParticipationStatus = val;
      return val;
    }

    get initialParticipationStatus() {
      return this.mInitialParticipationStatus;
    }

    set participationStatus(val) {
      this.mParticipationStatus = val;
      let icon = this.querySelector(".calendar-invitations-richlistitem-icon");
      icon.setAttribute("status", val);
      return val;
    }

    get participationStatus() {
      return this.mParticipationStatus;
    }

    setCalendarItem(item) {
      this.mCalendarItem = item;
      this.mInitialParticipationStatus = this.getCalendarItemParticipationStatus(item);
      this.participationStatus = this.mInitialParticipationStatus;

      let titleLabel = this.querySelector(".calendar-invitations-richlistitem-title");
      titleLabel.setAttribute("value", item.title);

      let dateLabel = this.querySelector(".calendar-invitations-richlistitem-date");
      let dateString = this.mDateFormatter.formatItemInterval(item);
      if (item.startDate.isDate) {
        dateString += ", " + this.getString("alldayEvent");
      }
      dateLabel.setAttribute("value", dateString);

      let recurrenceLabel = this.querySelector(".calendar-invitations-richlistitem-recurrence");
      if (item.recurrenceInfo) {
        recurrenceLabel.setAttribute("value", this.getString("recurrentEvent"));
      } else {
        recurrenceLabel.setAttribute("hidden", "true");
        let spacer = this.querySelector(".calendar-invitations-richlistitem-spacer");
        spacer.removeAttribute("hidden");
      }

      let locationLabel = this.querySelector(".calendar-invitations-richlistitem-location");
      let locationProperty = item.getProperty("LOCATION") || this.getString("none");
      let locationString = this.calInvitationsProps.formatStringFromName("location", [
        locationProperty,
      ]);

      locationLabel.setAttribute("value", locationString);

      let organizerLabel = this.querySelector(".calendar-invitations-richlistitem-organizer");
      let org = item.organizer;
      let organizerProperty = "";
      if (org) {
        if (org.commonName && org.commonName.length > 0) {
          organizerProperty = org.commonName;
        } else if (org.id) {
          organizerProperty = org.id.replace(/^mailto:/i, "");
        }
      }
      let organizerString = this.calInvitationsProps.formatStringFromName("organizer", [
        organizerProperty,
      ]);
      organizerLabel.setAttribute("value", organizerString);

      let attendeeLabel = this.querySelector(".calendar-invitations-richlistitem-attendee");
      let att = cal.itip.getInvitedAttendee(item);
      let attendeeProperty = "";
      if (att) {
        if (att.commonName && att.commonName.length > 0) {
          attendeeProperty = att.commonName;
        } else if (att.id) {
          attendeeProperty = att.id.replace(/^mailto:/i, "");
        }
      }
      let attendeeString = this.calInvitationsProps.formatStringFromName("attendee", [
        attendeeProperty,
      ]);
      attendeeLabel.setAttribute("value", attendeeString);
      Array.from(this.querySelectorAll("button")).map(button =>
        button.setAttribute("group", item.hashId)
      );
    }

    getCalendarItemParticipationStatus(item) {
      let att = cal.itip.getInvitedAttendee(item);
      return att ? att.participationStatus : null;
    }

    setCalendarItemParticipationStatus(item, status) {
      let calendar = cal.wrapInstance(item.calendar, Ci.calISchedulingSupport);
      if (calendar) {
        let att = calendar.getInvitedAttendee(item);
        if (att) {
          let att_ = att.clone();
          att_.participationStatus = status;

          // Update attendee
          item.removeAttendee(att);
          item.addAttendee(att_);
          return true;
        }
      }
      return false;
    }

    accept() {
      this.participationStatus = "ACCEPTED";
    }

    decline() {
      this.participationStatus = "DECLINED";
    }
  }
  customElements.define("calendar-invitations-richlistitem", MozCalendarInvitationsRichlistitem, {
    extends: "richlistitem",
  });
}

/**
 * Sets up the invitations dialog from the window arguments, retrieves the
 * invitations from the invitations manager.
 */
function onLoad() {
  let operationListener = {
    QueryInterface: ChromeUtils.generateQI([Ci.calIOperationListener]),
    onOperationComplete: function(aCalendar, aStatus, aOperationType, aId, aDetail) {
      let updatingBox = document.getElementById("updating-box");
      updatingBox.setAttribute("hidden", "true");
      let richListBox = document.getElementById("invitations-listbox");
      if (richListBox.getRowCount() > 0) {
        richListBox.selectedIndex = 0;
      } else {
        let noInvitationsBox = document.getElementById("noinvitations-box");
        noInvitationsBox.removeAttribute("hidden");
      }
    },
    onGetResult: function(aCalendar, aStatus, aItemType, aDetail, aItems) {
      if (!Components.isSuccessCode(aStatus)) {
        return;
      }
      document.title = invitationsText + " (" + aItems.length + ")";
      let updatingBox = document.getElementById("updating-box");
      updatingBox.setAttribute("hidden", "true");
      let richListBox = document.getElementById("invitations-listbox");
      for (let item of aItems) {
        let newNode = document.createXULElement("richlistitem", {
          is: "calendar-invitations-richlistitem",
        });
        richListBox.appendChild(newNode);
        newNode.calendarItem = item;
      }
    },
  };

  let updatingBox = document.getElementById("updating-box");
  updatingBox.removeAttribute("hidden");

  let args = window.arguments[0];
  args.invitationsManager.getInvitations(operationListener, args.onLoadOperationListener);

  opener.setCursor("auto");
}

/**
 * Cleans up the invitations dialog, cancels pending requests.
 */
function onUnload() {
  let args = window.arguments[0];
  args.requestManager.cancelPendingRequests();
}

/**
 * Handler function to be called when the accept button is pressed.
 */
document.addEventListener("dialogaccept", () => {
  let args = window.arguments[0];
  fillJobQueue(args.queue);
  args.invitationsManager.processJobQueue(args.queue, args.finishedCallBack);
});

/**
 * Handler function to be called when the cancel button is pressed.
 */
document.addEventListener("dialogcancel", () => {
  let args = window.arguments[0];
  if (args.finishedCallBack) {
    args.finishedCallBack();
  }
});

/**
 * Fills the job queue from the invitations-listbox's items. The job queue
 * contains objects for all items that have a modified participation status.
 *
 * @param queue     The queue to fill.
 */
function fillJobQueue(queue) {
  let richListBox = document.getElementById("invitations-listbox");
  let rowCount = richListBox.getRowCount();
  for (let i = 0; i < rowCount; i++) {
    let richListItem = richListBox.getItemAtIndex(i);
    let newStatus = richListItem.participationStatus;
    let oldStatus = richListItem.initialParticipationStatus;
    if (newStatus != oldStatus) {
      let actionString = "modify";
      let oldCalendarItem = richListItem.calendarItem;
      let newCalendarItem = oldCalendarItem.clone();

      // set default alarm on unresponded items that have not been declined:
      if (
        !newCalendarItem.getAlarms().length &&
        oldStatus == "NEEDS-ACTION" &&
        newStatus != "DECLINED"
      ) {
        cal.alarms.setDefaultValues(newCalendarItem);
      }

      richListItem.setCalendarItemParticipationStatus(newCalendarItem, newStatus);
      let job = {
        action: actionString,
        oldItem: oldCalendarItem,
        newItem: newCalendarItem,
      };
      queue.push(job);
    }
  }
}
