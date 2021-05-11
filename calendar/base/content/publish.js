/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported publishCalendarData, publishCalendarDataDialogResponse,
 *          publishEntireCalendar, publishEntireCalendarDialogResponse
 */

/* import-globals-from ../../base/content/calendar-views-utils.js */

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

/**
 * publishCalendarData
 * Show publish dialog, ask for URL and publish all selected items.
 */
function publishCalendarData() {
  let args = {};

  args.onOk = self.publishCalendarDataDialogResponse;

  openDialog(
    "chrome://calendar/content/publishDialog.xhtml",
    "caPublishEvents",
    "chrome,titlebar,modal,resizable",
    args
  );
}

/**
 * publishCalendarDataDialogResponse
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
 * publishEntireCalendar
 * Show publish dialog, ask for URL and publish all items from the calendar.
 *
 * @param aCalendar   (optional) The calendar that will be published. If omitted
 *                               the user will be prompted to select a calendar.
 */
function publishEntireCalendar(aCalendar) {
  if (!aCalendar) {
    let calendars = cal.getCalendarManager().getCalendars();

    if (calendars.length == 1) {
      // Do not ask user for calendar if only one calendar exists
      aCalendar = calendars[0];
    } else {
      // Ask user to select the calendar that should be published.
      // publishEntireCalendar() will be called again if OK is pressed
      // in the dialog and the selected calendar will be passed in.
      // Therefore return after openDialog().
      let args = {};
      args.onOk = publishEntireCalendar;
      args.promptText = cal.l10n.getCalString("publishPrompt");
      openDialog(
        "chrome://calendar/content/chooseCalendarDialog.xhtml",
        "_blank",
        "chrome,titlebar,modal,resizable",
        args
      );
      return;
    }
  }

  let args = {};
  let publishObject = {};

  args.onOk = self.publishEntireCalendarDialogResponse;

  publishObject.calendar = aCalendar;

  // restore the remote ics path preference from the calendar passed in
  let remotePath = aCalendar.getProperty("remote-ics-path");
  if (remotePath && remotePath.length && remotePath.length > 0) {
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
 * publishEntireCalendarDialogResponse
 * Callback method for publishEntireCalendar() that is called when the user
 * presses the OK button in the publish dialog.
 */
function publishEntireCalendarDialogResponse(CalendarPublishObject, aProgressDialog) {
  // store the selected remote ics path as a calendar preference
  CalendarPublishObject.calendar.setProperty("remote-ics-path", CalendarPublishObject.remotePath);

  let itemArray = [];
  let getListener = {
    QueryInterface: ChromeUtils.generateQI(["calIOperationListener"]),
    onOperationComplete(aCalendar, aStatus, aOperationType, aId, aDetail) {
      publishItemArray(itemArray, CalendarPublishObject.remotePath, aProgressDialog);
    },
    onGetResult(aCalendar, aStatus, aItemType, aDetail, aItems) {
      if (!Components.isSuccessCode(aStatus)) {
        return;
      }
      if (aItems.length) {
        for (let i = 0; i < aItems.length; ++i) {
          // Store a (short living) reference to the item.
          let itemCopy = aItems[i].clone();
          itemArray.push(itemCopy);
        }
      }
    },
  };
  aProgressDialog.onStartUpload();
  let oldCalendar = CalendarPublishObject.calendar;
  oldCalendar.getItems(Ci.calICalendar.ITEM_FILTER_ALL_ITEMS, 0, null, null, getListener);
}

function publishItemArray(aItemArray, aPath, aProgressDialog) {
  let outputStream;
  let inputStream;
  let storageStream;

  let icsURL = Services.io.newURI(aPath);

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
    case "ftp":
      channel = channel.QueryInterface(Ci.nsIFTPChannel);
      break;
    case "file":
      channel = channel.QueryInterface(Ci.nsIFileChannel);
      break;
    default:
      dump("No such scheme\n");
      return;
  }

  let uploadChannel = channel.QueryInterface(Ci.nsIUploadChannel);
  uploadChannel.notificationCallbacks = notificationCallbacks;

  storageStream = Cc["@mozilla.org/storagestream;1"].createInstance(Ci.nsIStorageStream);
  storageStream.init(32768, 0xffffffff, null);
  outputStream = storageStream.getOutputStream(0);

  let serializer = Cc["@mozilla.org/calendar/ics-serializer;1"].createInstance(
    Ci.calIIcsSerializer
  );
  serializer.addItems(aItemArray);
  // Outlook requires METHOD:PUBLISH property:
  let methodProp = cal.getIcsService().createIcalProperty("METHOD");
  methodProp.value = "PUBLISH";
  serializer.addProperty(methodProp);
  serializer.serializeToStream(outputStream);
  outputStream.close();

  inputStream = storageStream.newInputStream(0);

  uploadChannel.setUploadStream(inputStream, "text/calendar", -1);
  try {
    channel.asyncOpen(new PublishingListener(aProgressDialog));
  } catch (e) {
    Services.prompt.alert(
      null,
      cal.l10n.getCalString("genericErrorTitle"),
      cal.l10n.getCalString("otherPutError", [e.message])
    );
  }
}

var notificationCallbacks = {
  // nsIInterfaceRequestor interface
  getInterface(iid, instance) {
    if (iid.equals(Ci.nsIAuthPrompt)) {
      // use the window watcher service to get a nsIAuthPrompt impl
      return Services.ww.getNewAuthPrompter(null);
    }

    throw Components.Exception("", Cr.NS_ERROR_NO_INTERFACE);
  },
};

/**
 * Listener object to pass to `channel.asyncOpen()`. A reference to the current dialog window
 * passed to the constructor provides access to the dialog once the request is done.
 * @implements {nsIStreamListener}
 */
class PublishingListener {
  constructor(progressDialog) {
    this.progressDialog = progressDialog;
  }

  QueryInterface = ChromeUtils.generateQI(["nsIStreamListener"]);

  onStartRequest(request) {}

  onStopRequest(request, status) {
    this.progressDialog.wrappedJSObject.onStopUpload();

    let channel;
    let requestSucceeded;
    try {
      channel = request.QueryInterface(Ci.nsIHttpChannel);
      requestSucceeded = channel.requestSucceeded;
    } catch (e) {
      // Don't fail if it is not an http channel, will be handled below.
    }

    if (channel && !requestSucceeded) {
      let body = cal.l10n.getCalString("httpPutError", [
        channel.responseStatus,
        channel.responseStatusText,
      ]);
      Services.prompt.alert(null, cal.l10n.getCalString("genericErrorTitle"), body);
    } else if (!channel && !Components.isSuccessCode(request.status)) {
      // XXX this should be made human-readable.
      let body = cal.l10n.getCalString("otherPutError", [request.status.toString(16)]);
      Services.prompt.alert(null, cal.l10n.getCalString("genericErrorTitle"), body);
    }
  }

  onDataAvailable(request, inStream, sourceOffset, count) {}
}
