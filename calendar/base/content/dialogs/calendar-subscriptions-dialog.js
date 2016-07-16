/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported onLoad, onUnload, onKeyPress, onTextBoxKeyPress, onAccept,
 *          onCancel, onSubscribe, onUnsubscribe
 */

/**
 * Cancels any pending search operations.
 */
var gCurrentSearchOperation = null;
function cancelPendingSearchOperation() {
    if (gCurrentSearchOperation && gCurrentSearchOperation.isPending) {
        gCurrentSearchOperation.cancel(Components.interfaces.calIErrors.OPERATION_CANCELLED);
    }
    gCurrentSearchOperation = null;
}

/**
 * Sets up the subscriptions dialog.
 */
function onLoad() {
    opener.setCursor("auto");
}

/**
 * Cleans up the subscriptions dialog.
 */
function onUnload() {
    cancelPendingSearchOperation();
}

/**
 * Handler function to handle dialog keypress events.
 * (Cancels the search when pressing escape)
 */
function onKeyPress(event) {
    switch (event.keyCode) {
        case 27: /* ESC */
            if (gCurrentSearchOperation) {
                cancelPendingSearchOperation();
                document.getElementById("status-deck").selectedIndex = 0;
                event.stopPropagation();
                event.preventDefault();
            }
            break;
    }
}

/**
 * Handler function to handle keypress events in the textbox.
 * (Starts the search when hitting enter)
 */
function onTextBoxKeyPress(event) {
    switch (event.keyCode) {
        case 13: /* RET */
            onSearch();
            event.stopPropagation();
            event.preventDefault();
            break;
    }
}

/**
 * Handler function to be called when the accept button is pressed.
 *
 * @return      Returns true if the window should be closed
 */
function onAccept() {
    let richListBox = document.getElementById("subscriptions-listbox");
    let rowCount = richListBox.getRowCount();
    for (let i = 0; i < rowCount; i++) {
        let richListItem = richListBox.getItemAtIndex(i);
        let checked = richListItem.checked;
        if (checked != richListItem.subscribed) {
            let calendar = richListItem.calendar;
            if (checked) {
                getCalendarManager().registerCalendar(calendar);
            } else {
                getCalendarManager().unregisterCalendar(calendar);
            }
        }
    }
    return true;
}

/**
 * Handler function to be called when the cancel button is pressed.
 */
function onCancel() {
}

/**
 * Performs the search for subscriptions, canceling any pending searches.
 */
function onSearch() {
    cancelPendingSearchOperation();

    let richListBox = document.getElementById("subscriptions-listbox");
    richListBox.clear();

    let registeredCals = {};
    for (let calendar of getCalendarManager().getCalendars({})) {
        registeredCals[calendar.id] = true;
    }

    let opListener = {
        onResult: function(operation, result) {
            if (result) {
                for (let calendar of result) {
                    richListBox.addCalendar(calendar, registeredCals[calendar.id]);
                }
            }
            if (!operation.isPending) {
                let statusDeck = document.getElementById("status-deck");
                if (richListBox.getRowCount() > 0) {
                    statusDeck.selectedIndex = 0;
                } else {
                    statusDeck.selectedIndex = 2;
                }
            }
        }
    };

    let operation = getCalendarSearchService().searchForCalendars(document.getElementById("search-textbox").value,
                                                           0 /* hints */, 50, opListener);
    if (operation && operation.isPending) {
        gCurrentSearchOperation = op;
        document.getElementById("status-deck").selectedIndex = 1;
    }
}

/**
 * Markes the selected item in the subscriptions-listbox for subscribing. The
 * actual subscribe happens when the window is closed.
 */
function onSubscribe() {
    let item = document.getElementById("subscriptions-listbox").selectedItem;
    if (item && !item.disabled) {
        item.checked = true;
    }
}

/**
 * Unmarkes the selected item in the subscriptions-listbox for subscribing. The
 * actual subscribe happens when the window is closed.
 */
function onUnsubscribe() {
    let item = document.getElementById("subscriptions-listbox").selectedItem;
    if (item && !item.disabled) {
        item.checked = false;
    }
}
