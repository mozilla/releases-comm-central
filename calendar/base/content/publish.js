/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported publishCalendarData, publishCalendarDataDialogResponse,
 *          publishEntireCalendar, publishEntireCalendarDialogResponse
 */

/* import-globals-from ../../base/content/calendar-views-utils.js */

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
var lazy = {};
ChromeUtils.defineLazyGetter(lazy, "l10n", () => new Localization(["calendar/calendar.ftl"], true));

/**
 * Show publish dialog, ask for URL and publish all selected items.
 */
function publishCalendarData() {
  const args = {};

  args.onOk = self.publishCalendarDataDialogResponse;

  openDialog(
    "chrome://calendar/content/publishDialog.xhtml",
    "caPublishEvents",
    "chrome,titlebar,modal,resizable",
    args
  );
}

/**
 * Callback method for publishCalendarData() that is called when the user
 * presses the OK button in the publish dialog.
 */
function publishCalendarDataDialogResponse(CalendarPublishObject, aProgressDialog) {
  publishItemArray(
    currentView().getSelectedItems(),
    CalendarPublishObject.remotePath,
    aProgressDialog
  );
}

/**
 * Show publish dialog, ask for URL and publish all items from the calendar.
 *
 * @param {?calICalendar} aCalendar - The calendar that will be published.
 *   If not specified, the user will be prompted to select a calendar.
 */
function publishEntireCalendar(aCalendar) {
  if (!aCalendar) {
    const calendars = cal.manager.getCalendars();

    if (calendars.length == 1) {
      // Do not ask user for calendar if only one calendar exists
      aCalendar = calendars[0];
    } else {
      // Ask user to select the calendar that should be published.
      // publishEntireCalendar() will be called again if OK is pressed
      // in the dialog and the selected calendar will be passed in.
      // Therefore return after openDialog().
      const args = {};
      args.onOk = publishEntireCalendar;
      args.promptText = lazy.l10n.formatValueSync("publish-prompt");
      openDialog(
        "chrome://calendar/content/chooseCalendarDialog.xhtml",
        "_blank",
        "chrome,titlebar,modal,resizable",
        args
      );
      return;
    }
  }

  const args = {};
  const publishObject = {};

  args.onOk = self.publishEntireCalendarDialogResponse;

  publishObject.calendar = aCalendar;

  // restore the remote ics path preference from the calendar passed in
  const remotePath = aCalendar.getProperty("remote-ics-path");
  if (remotePath) {
    publishObject.remotePath = remotePath;
  }

  args.publishObject = publishObject;
  openDialog(
    "chrome://calendar/content/publishDialog.xhtml",
    "caPublishEvents",
    "chrome,titlebar,modal,resizable",
    args
  );
}

/**
 * Callback method for publishEntireCalendar() that is called when the user
 * presses the OK button in the publish dialog.
 */
async function publishEntireCalendarDialogResponse(CalendarPublishObject, aProgressDialog) {
  // store the selected remote ics path as a calendar preference
  CalendarPublishObject.calendar.setProperty("remote-ics-path", CalendarPublishObject.remotePath);

  aProgressDialog.onStartUpload();
  const oldCalendar = CalendarPublishObject.calendar;
  const items = await oldCalendar.getItemsAsArray(
    Ci.calICalendar.ITEM_FILTER_ALL_ITEMS,
    0,
    null,
    null
  );
  publishItemArray(items, CalendarPublishObject.remotePath, aProgressDialog);
}

function publishItemArray(aItemArray, aPath, aProgressDialog) {
  const icsURL = Services.io.newURI(aPath);

  let channel = Services.io.newChannelFromURI(
    icsURL,
    null,
    Services.scriptSecurityManager.getSystemPrincipal(),
    null,
    Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
    Ci.nsIContentPolicy.TYPE_OTHER
  );
  if (icsURL.schemeIs("webcal")) {
    icsURL.scheme = "http";
  }
  if (icsURL.schemeIs("webcals")) {
    icsURL.scheme = "https";
  }

  switch (icsURL.scheme) {
    case "http":
    case "https":
      channel = channel.QueryInterface(Ci.nsIHttpChannel);
      break;
    case "file":
      channel = channel.QueryInterface(Ci.nsIFileChannel);
      break;
    default:
      dump("No such scheme\n");
      return;
  }

  const uploadChannel = channel.QueryInterface(Ci.nsIUploadChannel);
  uploadChannel.notificationCallbacks = notificationCallbacks;

  const storageStream = Cc["@mozilla.org/storagestream;1"].createInstance(Ci.nsIStorageStream);
  storageStream.init(32768, 0xffffffff, null);
  const outputStream = storageStream.getOutputStream(0);

  const serializer = Cc["@mozilla.org/calendar/ics-serializer;1"].createInstance(
    Ci.calIIcsSerializer
  );
  serializer.addItems(aItemArray);
  // Outlook requires METHOD:PUBLISH property:
  const methodProp = cal.icsService.createIcalProperty("METHOD");
  methodProp.value = "PUBLISH";
  serializer.addProperty(methodProp);
  serializer.serializeToStream(outputStream);
  outputStream.close();

  const inputStream = storageStream.newInputStream(0);

  uploadChannel.setUploadStream(inputStream, "text/calendar", -1);
  try {
    channel.asyncOpen(new PublishingListener(aProgressDialog));
  } catch (e) {
    Services.prompt.alert(
      null,
      lazy.l10n.formatValueSync("generic-error-title"),
      lazy.l10n.formatValueSync("other-put-error", { statusCode: e.message })
    );
  }
}

/** @implements {nsIInterfaceRequestor} */
var notificationCallbacks = {
  getInterface(iid) {
    if (iid.equals(Ci.nsIAuthPrompt2)) {
      if (!this.calAuthPrompt) {
        return new cal.auth.Prompt();
      }
    }

    throw Components.Exception(`${iid} not implemented`, Cr.NS_ERROR_NO_INTERFACE);
  },
};

/**
 * Listener object to pass to `channel.asyncOpen()`. A reference to the current dialog window
 * passed to the constructor provides access to the dialog once the request is done.
 *
 * @implements {nsIStreamListener}
 */
class PublishingListener {
  QueryInterface = ChromeUtils.generateQI(["nsIStreamListener"]);

  constructor(progressDialog) {
    this.progressDialog = progressDialog;
  }

  onStartRequest() {}
  onStopRequest(request) {
    let channel;
    let requestSucceeded;
    try {
      channel = request.QueryInterface(Ci.nsIHttpChannel);
      requestSucceeded = channel.requestSucceeded;
    } catch (e) {
      // Don't fail if it is not an http channel, will be handled below.
    }

    if (channel && !requestSucceeded) {
      this.progressDialog.wrappedJSObject.onStopUpload(0);
      const body = lazy.l10n.formatValueSync("http-put-error", {
        statusCode: channel.responseStatus,
        statusCodeInfo: channel.responseStatusText,
      });
      Services.prompt.alert(null, lazy.l10n.formatValueSync("generic-error-title"), body);
    } else if (!channel && !Components.isSuccessCode(request.status)) {
      this.progressDialog.wrappedJSObject.onStopUpload(0);
      // XXX this should be made human-readable.
      const body = lazy.l10n.formatValueSync("other-put-error", {
        statusCode: request.status.toString(16),
      });
      Services.prompt.alert(null, lazy.l10n.formatValueSync("generic-error-title"), body);
    } else {
      this.progressDialog.wrappedJSObject.onStopUpload(100);
    }
  }

  onDataAvailable() {}
}
