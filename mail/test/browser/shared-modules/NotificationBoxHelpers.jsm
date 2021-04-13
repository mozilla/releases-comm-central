/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const EXPORTED_SYMBOLS = [
  "check_notification_displayed",
  "assert_notification_displayed",
  "close_notification",
  "wait_for_notification_to_stop",
  "wait_for_notification_to_show",
  "get_notification_button",
  "get_notification",
];

/**
 * A helper function for determining whether or not a notification with
 * a particular value is being displayed.
 *
 * @param aController    the controller of the window to check
 * @param aBoxId         the id of the notification box
 * @param aValue         the value of the notification to look for
 * @param aNotification  an optional out parameter: object that will pass the
 *                       notification element out of this function in its
 *                       'notification' property
 *
 * @return  True/false depending on the state of the notification.
 */
function check_notification_displayed(
  aController,
  aBoxId,
  aValue,
  aNotification
) {
  let nb = aController.window.document.getElementById(aBoxId);
  if (!nb) {
    throw new Error("Couldn't find a notification box for id=" + aBoxId);
  }

  if (nb.querySelector(".notificationbox-stack")) {
    let box = nb.querySelector(".notificationbox-stack")._notificationBox;
    let notification = box.getNotificationWithValue(aValue);
    if (aNotification) {
      aNotification.notification = notification;
    }
    return notification != null;
  }

  return false;
}

/**
 * A helper function ensuring whether or not a notification with
 * a particular value is being displayed. Throws if the state is
 * not the expected one.
 *
 * @param aController the controller of the window to check
 * @param aBoxId the id of the notification box
 * @param aValue the value of the notification to look for
 * @param aDisplayed true if the notification should be displayed, false
 *                   otherwise
 * @return  the notification if we're asserting that the notification is
 *          displayed, and it actually shows up. Throws otherwise.
 */
function assert_notification_displayed(
  aController,
  aBoxId,
  aValue,
  aDisplayed
) {
  let notification = {};
  let hasNotification = check_notification_displayed(
    aController,
    aBoxId,
    aValue,
    notification
  );
  if (hasNotification != aDisplayed) {
    throw new Error(
      "Expected the notification with value " +
        aValue +
        " to be " +
        (aDisplayed ? "shown" : "not shown")
    );
  }

  return notification.notification;
}

/**
 * A helper function for closing a notification if one is currently displayed
 * in the window.
 *
 * @param aController the controller for the window with the notification
 * @param aBoxId the id of the notification box
 * @param aValue the value of the notification to close
 */
function close_notification(aController, aBoxId, aValue) {
  let nb = aController.window.document.getElementById(aBoxId);
  if (!nb) {
    throw new Error("Couldn't find a notification box for id=" + aBoxId);
  }

  let box = nb.querySelector(".notificationbox-stack")._notificationBox;
  let notification = box.getNotificationWithValue(aValue);
  if (notification) {
    notification.close();
  }
}

/**
 * A helper function that waits for a notification with value aValue
 * to stop displaying in the window.
 *
 * @param aController the controller for the window with the notification
 * @param aBoxId the id of the notification box
 * @param aValue the value of the notification to wait to stop
 */
function wait_for_notification_to_stop(aController, aBoxId, aValue) {
  let nb = aController.window.document.getElementById(aBoxId);
  if (!nb) {
    throw new Error("Couldn't find a notification box for id=" + aBoxId);
  }

  let box = nb.querySelector(".notificationbox-stack")._notificationBox;
  aController.waitFor(
    () => !box.getNotificationWithValue(aValue),
    "Timed out waiting for notification with value " + aValue + " to stop."
  );
}

/**
 * A helper function that waits for a notification with value aValue
 * to show in the window.
 *
 * @param aController the controller for the window that we want
 *                    the notification to appear in
 * @param aBoxId the id of the notification box
 * @param aValue the value of the notification to wait for
 */
function wait_for_notification_to_show(aController, aBoxId, aValue) {
  let nb = aController.window.document.getElementById(aBoxId);
  if (!nb) {
    throw new Error("Couldn't find a notification box for id=" + aBoxId);
  }

  function nbReady() {
    if (nb.querySelector(".notificationbox-stack")) {
      let box = nb.querySelector(".notificationbox-stack")._notificationBox;
      return box.getNotificationWithValue(aValue) != null && !box._animating;
    }
    return false;
  }
  aController.waitFor(
    nbReady,
    "Timed out waiting for notification with value " + aValue + " to show."
  );
}

/**
 * Return the notification element based on the container ID and the Value type.
 *
 * @param {MozMillController} controller - The controller for the window that we
 *   want the notification to appear in.
 * @param {string} id - The id of the notification box.
 * @param {string} val - The value of the notification to fetch.
 * @returns {?Element} - The notification element if found.
 */
function get_notification(controller, id, val) {
  let nb = controller.window.document.getElementById(id);
  if (!nb) {
    throw new Error("Couldn't find a notification box for id=" + id);
  }

  if (nb.querySelector(".notificationbox-stack")) {
    let box = nb.querySelector(".notificationbox-stack")._notificationBox;
    return box.getNotificationWithValue(val);
  }

  return null;
}

/**
 * Gets a button in a notification, as those do not have IDs.
 *
 * @param aController The controller for the window
 *                    that has the notification.
 * @param aBoxId      The id of the notification box.
 * @param aValue      The value of the notification to find.
 * @param aMatch      Attributes of the button to find.
 *                    An object with key:value pairs,
 *                    similar to click_menus_in_sequence().
 */
function get_notification_button(aController, aBoxId, aValue, aMatch) {
  let notification = get_notification(aController, aBoxId, aValue);
  let buttons = notification.buttonContainer.querySelectorAll("button");
  for (let button of buttons) {
    let matchedAll = true;
    for (let name in aMatch) {
      let value = aMatch[name];
      let matched = false;
      if (name == "popup") {
        if (
          button.getAttribute("type") == "menu-button" ||
          button.getAttribute("type") == "menu"
        ) {
          // The button contains a menupopup as the first child.
          matched = button.querySelector("menupopup#" + value);
        } else {
          // The "popup" attribute is not on the button itself but in its
          // buttonInfo member.
          matched = "buttonInfo" in button && button.buttonInfo.popup == value;
        }
      } else if (
        button.hasAttribute(name) &&
        button.getAttribute(name) == value
      ) {
        matched = true;
      }
      if (!matched) {
        matchedAll = false;
        break;
      }
    }
    if (matchedAll) {
      return button;
    }
  }

  throw new Error("Couldn't find the requested button on a notification");
}
