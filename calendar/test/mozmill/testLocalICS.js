/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var MODULE_NAME = "testLocalICS";
var RELATIVE_ROOT = "./shared-modules";
var MODULE_REQUIRES = ["calendar-utils", "window-helpers"];

var calUtils = require("./shared-modules/calendar-utils");
var modalDialog; // Initialized in setupModule
Components.utils.import("resource://calendar/modules/calUtils.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");

var sleep = 500;
var TIMEOUT_MODAL_DIALOG = 30000;
var hour = 8;
var calendar;
var uri;
var file;
var title;

var setupModule = function(module) {
  controller = mozmill.getMail3PaneController();
  modalDialog = collector.getModule('window-helpers');
  
  // unique name needed as deleting a calendar only unsubscribes from it
  // and if same file were used on next testrun then previously created event would show up
  let time = (new Date()).getTime() + '';
  calendar = time;
  title = time;
  
  file = Services.dirsvc.get("TmpD", Components.interfaces.nsIFile);
  file.append(calendar + ".ics");
  let fileURI = Services.io.newFileURI(file);
  uri = fileURI.prePath + fileURI.path;
}

var testLocalICS = function () {
  controller.click(new elementslib.ID(controller.window.document,"calendar-tab-button"));
  calUtils.switchToView(controller, "day");
  
  modalDialog.plan_for_modal_dialog("Calendar:NewCalendarWizard", handleNewCalendarWizard);
  controller.mainMenu.click("#ltnNewCalendar");
  modalDialog.wait_for_modal_dialog("Calendar:NewCalendarWizard", TIMEOUT_MODAL_DIALOG);
  
  // create new event
  controller.doubleClick(new elementslib.Lookup(controller.window.document,
    calUtils.getEventBoxPath(controller, "day", calUtils.CANVAS_BOX, undefined, 1, hour)), 1, 1);
  controller.waitFor(function() {return mozmill.utils.getWindows("Calendar:EventDialog").length > 0}, sleep);
  let event = new mozmill.controller.MozMillController(mozmill.utils
    .getWindows("Calendar:EventDialog")[0]);
  
  // title
  let titleTextBox = new elementslib.Lookup(event.window.document, '/id("calendar-event-dialog")/'
    + 'id("event-grid")/id("event-grid-rows")/id("event-grid-title-row")/'
    + 'id("item-title")/anon({"class":"textbox-input-box"})/anon({"anonid":"input"})');
  event.waitForElement(titleTextBox);
  event.type(titleTextBox, title);
  
  // set calendar
  let itemCalendar = new elementslib.ID(event.window.document, "item-calendar")
  event.select(itemCalendar, undefined, calendar);
  // HACK - Wait for the value to be selected. This is needed for platforms
  // like mac where selecting the menuitem is an asynchronous process, it might
  // be fixed in a later version of mozmill.
  event.waitFor(() => itemCalendar.getNode().value == calendar);
  
  // save
  event.click(new elementslib.ID(event.window.document, "button-save"));
  
  // assert presence in view
  let box = calUtils.getEventBoxPath(controller, "day", calUtils.EVENT_BOX, undefined, 1, hour)
    + '/{"tooltip":"itemTooltip","calendar":"' + calendar + '"}';
  controller.waitForElement(new elementslib.Lookup(controller.window.document, box));

  // verify in file
  let fstream = Components.classes["@mozilla.org/network/file-input-stream;1"]
                          .createInstance(Components.interfaces.nsIFileInputStream);
  let cstream = Components.classes["@mozilla.org/intl/converter-input-stream;1"]
                          .createInstance(Components.interfaces.nsIConverterInputStream);

  // wait a moment until file is written
  let i = 0;
  while(!file.exists() && i < 10) {
    controller.sleep(sleep);
    i++;
  }

  fstream.init(file, -1, 0, 0);
  cstream.init(fstream, "UTF-8", 0, 0);

  let str = {};
  cstream.readString(-1, str);
  cstream.close();

  controller.assertJS(str.value.includes("SUMMARY:" + title));
}

var teardownTest = function(module) {
  calUtils.deleteCalendars(controller, calendar);
}

function handleNewCalendarWizard(wizard) {
  let docEl = wizard.window.document.documentElement;
  
  // choose network calendar
  let remoteOption = new elementslib.Lookup(wizard.window.document, '/id("calendar-wizard")/'
    + '{"pageid":"initialPage"}/id("calendar-type")/{"value":"remote"}');
  wizard.waitForElement(remoteOption);
  wizard.radio(remoteOption);
  docEl.getButton("next").doCommand();
  
  // choose ical
  let icalOption = new elementslib.Lookup(wizard.window.document, '/id("calendar-wizard")/'
    + '{"pageid":"locationPage"}/[1]/[1]/[0]/id("calendar-format")/{"value":"ics"}');
  wizard.waitForElement(icalOption);
  wizard.radio(icalOption);
  // enter location
  wizard.type(new elementslib.Lookup(wizard.window.document, '/id("calendar-wizard")/'
    + '{"pageid":"locationPage"}/[1]/[1]/{"align":"center"}/id("calendar-uri")/'
    + 'anon({"class":"textbox-input-box"})/anon({"anonid":"input"})'),
    uri);
  docEl.getButton("next").doCommand();
  
  // name is filled in automatically using filename
  wizard.waitFor(function() {return docEl.getButton("next").disabled == false});
  docEl.getButton("next").doCommand();
  
  // finish
  docEl.getButton("finish").doCommand();
}
