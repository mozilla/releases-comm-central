/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import GraphCalendar from "./GraphCalendar.sys.mjs";
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
   * @param {calIProviderListener} _listener - Callback for results
   * @returns {Promise}
   */
  static async deleteCalendar(_calendar, _listener) {
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
    const graphCalendarClient = Cc["@mozilla.org/messenger/graph-client;1"].createInstance(
      Ci.IGraphCalendarClient
    );
    const exchangeClient = graphCalendarClient.QueryInterface(Ci.IExchangeClient);

    // Find an incoming server with the given username and host.
    const incomingServer = MailServices.accounts.findServer(username, location, "graph");
    if (incomingServer) {
      // TODO: https://bugzilla.mozilla.org/show_bug.cgi?id=2052326
      // We're reaching across to an incoming mail server here to instantiate a
      // new client. Instead, we should be sharing the client between all
      // connections to the same Microsoft account to handle rate limiting and
      // throttling. We'll want to change this to obtain a client reference that
      // is shared with the email system, but still able to work without a
      // configured Graph email account.
      const uri = incomingServer.getStringValue("ews_url");
      exchangeClient.initialize(uri, incomingServer, false, "", "", "", "", "");
      const listener = new CalendarDiscoveryCallbackListener();
      graphCalendarClient.detectCalendars(listener);
      await listener.deferred.promise;

      const discoveredCalendars = listener.calendars.map(
        value =>
          new GraphCalendar(uri, value.id, value.name, {
            readOnly: value.readOnly,
          })
      );
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
