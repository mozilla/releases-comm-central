/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

export class InAppNotificationEvent extends MouseEvent {
  /**
   * Id of the notification this event was fired for.
   *
   * @type {string}
   */
  notificationId;

  /**
   *
   * @param {string} type - Event type.
   * @param {MouseEvent} event - Mouse event this is inheriting from.
   * @param {string} notificationId - ID of the notification this event is
   *   emitted for.
   */
  constructor(type, event, notificationId) {
    super(type, event);
    this.notificationId = notificationId;
  }
}
