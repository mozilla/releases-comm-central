/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported onLoad, onUnload, onAccept, onCancel */

Components.utils.import("resource://calendar/modules/calUtils.jsm");
Components.utils.import("resource://calendar/modules/calAlarmUtils.jsm");
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

/**
 * Sets up the invitations dialog from the window arguments, retrieves the
 * invitations from the invitations manager.
 */
function onLoad() {
    let operationListener = {
        QueryInterface: XPCOMUtils.generateQI([Components.interfaces.calIOperationListener]),
        onOperationComplete: function(aCalendar, aStatus, aOperationType, aId, aDetail) {
            let updatingBox = document.getElementById("updating-box");
            updatingBox.setAttribute("hidden", "true");
            let richListBox = document.getElementById("invitations-listbox");
            if (richListBox.getRowCount() > 0) {
                richListBox.selectedIndex = 0;
            } else {
                let noInvitationsBox =
                    document.getElementById("noinvitations-box");
                noInvitationsBox.removeAttribute("hidden");
            }
        },
        onGetResult: function(aCalendar, aStatus, aItemType, aDetail, aCount, aItems) {
            if (!Components.isSuccessCode(aStatus)) {
                return;
            }
            document.title = invitationsText + " (" + aCount + ")";
            let updatingBox = document.getElementById("updating-box");
            updatingBox.setAttribute("hidden", "true");
            let richListBox = document.getElementById("invitations-listbox");
            for (let item of aItems) {
                richListBox.addCalendarItem(item);
            }
        }
    };

    let updatingBox = document.getElementById("updating-box");
    updatingBox.removeAttribute("hidden");

    let args = window.arguments[0];
    args.invitationsManager.getInvitations(operationListener,
                                           args.onLoadOperationListener);

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
 *
 * @return      Returns true if the window should be closed
 */
function onAccept() {
    let args = window.arguments[0];
    fillJobQueue(args.queue);
    args.invitationsManager.processJobQueue(args.queue, args.finishedCallBack);
    return true;
}

/**
 * Handler function to be called when the cancel button is pressed.
 */
function onCancel() {
    let args = window.arguments[0];
    if (args.finishedCallBack) {
        args.finishedCallBack();
    }
}

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
            if (!newCalendarItem.getAlarms({}).length &&
                (oldStatus == "NEEDS-ACTION") &&
                (newStatus != "DECLINED")) {
                cal.alarms.setDefaultValues(newCalendarItem);
            }

            richListItem.setCalendarItemParticipationStatus(newCalendarItem,
                newStatus);
            let job = {
                action: actionString,
                oldItem: oldCalendarItem,
                newItem: newCalendarItem
            };
            queue.push(job);
        }
    }
}
