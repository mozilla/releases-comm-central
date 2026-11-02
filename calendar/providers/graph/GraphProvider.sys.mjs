/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";
import { MailServices } from "resource:///modules/MailServices.sys.mjs";

/**
 * GraphProvider class implementing calICalendarProvider.
 *
 * Note: All methods defined in this class are static because calling code
 * assumes methods on providers are static.
 */
export class GraphProvider {
  QueryInterface = ChromeUtils.generateQI(["calICalendarProvider"]);

  static get type() {
    return "graph";
  }

  static get displayName() {
    return "Microsoft Graph Calendar";
  }

  static get shortName() {
    return "Microsoft Graph";
  }

  /**
   * Delete a calendar.
   *
   * Not implemented for Graph.
   *
   * @param {calICalendar} _calendar - The calendar to delete
   * @returns {Promise}
   */
  static async deleteCalendar(_calendar) {
    throw new Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  }

  /**
   * Detect calendars on the server.
   *
   * @param {string} username - User credentials
   * @param {string} password - User credentials
   * @param {string} location - Server location (Graph API endpoint)
   * @param {boolean} _savePassword - Whether to save password
   * @param {object} _extraProperties - Additional properties
   * @returns {Promise<Array<calICalendar>>} Array of found calendars
   */
  static async detectCalendars(username, password, location, _savePassword, _extraProperties) {
    // If the protocol scheme isn't specified, default to HTTPS to be safe.
    const url = /https?:\/\//.exec(location) ? location : `https://${location}`;
    const graphCalendarClient = MailServices.protocolClient
      .getClient("graph", location, username)
      .QueryInterface(Ci.IGraphCalendarClient);

    if (graphCalendarClient) {
      const listener = new CalendarDiscoveryCallbackListener();
      graphCalendarClient.detectCalendars(listener);
      await listener.deferred.promise;

      const discoveredCalendars = listener.calendars.map(value => {
        const calendar = cal.manager.initializeCalendar(
          value.id,
          "graph",
          graphCalendarClient.baseURI
        );
        calendar.name = value.name;
        calendar.readOnly = value.readOnly;
        const graphCalendar = calendar.QueryInterface(Ci.IGraphCalendar);
        graphCalendar.username = username;
        graphCalendar.location = url;
        return calendar;
      });
      return discoveredCalendars;
    }
    return [];
  }
}

/**
 * IGraphCalendarDiscoverListener that wraps a promise that will resolve when a
 * response has been received.
 */
class CalendarDiscoveryCallbackListener {
  QueryInterface = ChromeUtils.generateQI(["IGraphCalendarDiscoveryListener"]);

  constructor() {
    this.calendars = [];
    this.deferred = Promise.withResolvers();
  }

  onCalendarDiscovered(id, name, readOnly) {
    this.calendars.push({ id, name, readOnly });
  }

  onComplete(errorStatus) {
    if (errorStatus == Cr.NS_OK) {
      this.deferred.resolve();
    }
    this.deferred.reject(`Graph calendar detection failed with status ${errorStatus}`);
  }
}
