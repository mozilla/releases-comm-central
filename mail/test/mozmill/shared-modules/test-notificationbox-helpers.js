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
 * @param aController the controller for the compose window that we want
 *                    the notification to appear in
 * @param aBoxId the id of the notification box
 * @param aValue the value of the notification to wait for
 */
function wait_for_notification_to_show(aController, aBoxId, aValue) {
  let nb = aController.window.document.getElementById(aBoxId);
  if (!nb)
    throw new Error("Couldn't find a notification box for id=" + aBoxId);
  aController.waitFor(() => nb.getNotificationWithValue(aValue) != null,
                      "Timed out waiting for notification with value " +
                      aValue + " to show.");
}
