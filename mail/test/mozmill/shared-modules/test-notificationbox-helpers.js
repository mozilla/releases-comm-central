/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var MODULE_NAME = "notificationbox-helpers";

var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = [];

function installInto(module) {
  module.check_notification_displayed = check_notification_displayed;
  module.assert_notification_displayed = assert_notification_displayed;
  module.close_notification = close_notification;
  module.wait_for_notification_to_stop = wait_for_notification_to_stop;
  module.wait_for_notification_to_show = wait_for_notification_to_show;
  module.get_notification_button = get_notification_button;
}

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
function check_notification_displayed(aController, aBoxId, aValue, aNotification) {
  let nb = aController.window.document.getElementById(aBoxId);
  if (!nb)
     throw new Error("Couldn't find a notification box for id=" + aBoxId);

  let notification = nb.getNotificationWithValue(aValue);
  if (aNotification)
    aNotification.notification = notification;
  return (notification != null);
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
function assert_notification_displayed(aController, aBoxId, aValue, aDisplayed) {
  let notification = {};
  let hasNotification = check_notification_displayed(aController, aBoxId, aValue, notification);
  if (hasNotification != aDisplayed)
    throw new Error("Expected the notification with value " + aValue +
                    " to be " + (aDisplayed ? "shown" : "not shown"));

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
  if (!nb)
    throw new Error("Couldn't find a notification box for id=" + aBoxId);

  let notification = nb.getNotificationWithValue(aValue);
  if (notification)
    notification.close();
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
  if (!nb)
    throw new Error("Couldn't find a notification box for id=" + aBoxId);
  aController.waitFor(() => !nb.getNotificationWithValue(aValue),
                      "Timed out waiting for notification with value " +
                      aValue + " to stop.");
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
  if (!nb)
    throw new Error("Couldn't find a notification box for id=" + aBoxId);

  function nbReady() {
    return (nb.getNotificationWithValue(aValue) != null) && !nb._animating;
  }
  aController.waitFor(nbReady,
                      "Timed out waiting for notification with value " +
                      aValue + " to show.");
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
  let nb = aController.window.document.getElementById(aBoxId);
  if (!nb)
    throw new Error("Couldn't find a notification box for id=" + aBoxId);

  let notification = nb.getNotificationWithValue(aValue);
  let buttons = notification.querySelectorAll("button");
  for (let button of buttons) {
    let matchedAll = true;
    for (let name in aMatch) {
      let value = aMatch[name];
      let matched = false;
      if (name == "popup") {
        if (button.getAttribute("type") == "menu-button" ||
            button.getAttribute("type") == "menu") {
          // The button contains a menupopup as the first child.
          matched = (button.firstChild &&
                     (button.firstChild.tagName == "menupopup") &&
                     (button.firstChild.id == value));
        } else {
          // The "popup" attribute is not on the button itself but in its
          // buttonInfo member.
          matched = (("buttonInfo" in button) && (button.buttonInfo.popup == value));
        }
      } else if (button.hasAttribute(name) && button.getAttribute(name) == value) {
        matched = true;
      }
      if (!matched) {
        matchedAll = false;
        break;
      }
    }
    if (matchedAll)
      return button;
  }

  throw new Error("Couldn't find the requested button on a notification");
}
