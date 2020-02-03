/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../import-export.js */

var FIREFOX_UID = "{ec8030f7-c20a-464f-9b0e-13a3a9e97384}";

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { AppConstants } = ChromeUtils.import("resource://gre/modules/AppConstants.jsm");

//
// The front-end wizard bits.
//
var gMigrateWizard = {
  /**
   * Called from onload of the migrator window.  Takes all of the migrators
   * that were passed in via window.arguments and adds them to checklist. The
   * user can then check these off to migrate the data from those sources.
   */
  loadMigrators: function() {
    let wizardPage2 = document.getElementById("wizardPage2");
    wizardPage2.addEventListener("pageshow", gMigrateWizard.migrateChecked);

    let listbox = document.getElementById("datasource-list");

    // XXX Once we have branding for lightning, this hack can go away
    let props = Services.strings.createBundle("chrome://calendar/locale/migration.properties");

    let wizard = document.querySelector("wizard");
    let desc = document.getElementById("wizard-desc");
    // Since we don't translate "Lightning"...
    wizard.title = props.formatStringFromName("migrationTitle", ["Lightning"]);
    desc.textContent = props.formatStringFromName("migrationDescription", ["Lightning"]);

    migLOG("migrators: " + window.arguments.length);
    for (let migrator of window.arguments[0]) {
      let checkbox = document.createXULElement("checkbox");
      checkbox.setAttribute("checked", true);
      checkbox.setAttribute("label", migrator.title);
      checkbox.migrator = migrator;
      listbox.appendChild(checkbox);
    }
  },

  /**
   * Called from the second page of the wizard.  Finds all of the migrators
   * that were checked and begins migrating their data.  Also controls the
   * progress dialog so the user can see what is happening. (somewhat)
   */
  migrateChecked: function() {
    let migrators = [];

    // Get all the checked migrators into an array
    let listbox = document.getElementById("datasource-list");
    for (let i = listbox.children.length - 1; i >= 0; i--) {
      if (listbox.children[i].getAttribute("checked")) {
        migrators.push(listbox.children[i].migrator);
      }
    }

    // If no migrators were checked, then we're done
    if (migrators.length == 0) {
      window.close();
    }

    // Don't let the user get away while we're migrating
    // XXX may want to wire this into the 'cancel' function once that's
    //    written
    let wizard = document.querySelector("wizard");
    wizard.canAdvance = false;
    wizard.canRewind = false;

    // We're going to need this for the progress meter's description
    let props = Services.strings.createBundle("chrome://calendar/locale/migration.properties");
    let label = document.getElementById("progress-label");
    let meter = document.getElementById("migrate-progressmeter");

    let i = 0;
    // Because some of our migrators involve async code, we need this
    // call-back function so we know when to start the next migrator.
    function getNextMigrator() {
      if (migrators[i]) {
        let mig = migrators[i];

        // Increment i to point to the next migrator
        i++;
        migLOG("starting migrator: " + mig.title);
        label.value = props.formatStringFromName("migratingApp", [mig.title]);
        meter.value = ((i - 1) / migrators.length) * 100;
        mig.args.push(getNextMigrator);

        try {
          mig.migrate(...mig.args);
        } catch (e) {
          migLOG("Failed to migrate: " + mig.title);
          migLOG(e);
          getNextMigrator();
        }
      } else {
        migLOG("migration done");
        wizard.canAdvance = true;
        label.value = props.GetStringFromName("finished");
        meter.value = 100;
        gMigrateWizard.setCanRewindFalse();
      }
    }

    // And get the first migrator
    getNextMigrator();
  },

  /**
   * Makes sure the wizard "back" button can not be pressed.
   */
  setCanRewindFalse: function() {
    document.querySelector("wizard").canRewind = false;
  },
};

//
// The more back-end data detection bits
//

/**
 * A data migrator prototype, holding the information for migration
 *
 * @class
 * @param aTitle    The title of the migrator
 * @param aMigrateFunction    The function to call when migrating
 * @param aArguments          The arguments to pass in.
 */
function dataMigrator(aTitle, aMigrateFunction, aArguments) {
  this.title = aTitle;
  this.migrate = aMigrateFunction;
  this.args = aArguments || [];
}

var gDataMigrator = {
  mIsInFirefox: false,
  mPlatform: null,
  mDirService: null,
  mIoService: null,

  /**
   * Cached getter for the directory service.
   */
  get dirService() {
    if (!this.mDirService) {
      this.mDirService = Services.dirsvc;
    }
    return this.mDirService;
  },

  /**
   * Call to do a general data migration (for a clean profile)  Will run
   * through all of the known migrator-checkers.  These checkers will return
   * an array of valid dataMigrator objects, for each kind of data they find.
   * If there is at least one valid migrator, we'll pop open the migration
   * wizard, otherwise, we'll return silently.
   */
  checkAndMigrate: function() {
    if (Services.appinfo.ID == FIREFOX_UID) {
      this.mIsInFirefox = true;
      // We can't handle Firefox Lightning yet
      migLOG("Holy cow, you're Firefox-Lightning! sorry, can't help.");
      return;
    }

    this.mPlatform = Services.appinfo.OS.toLowerCase();

    migLOG("mPlatform is: " + this.mPlatform);

    let DMs = [];
    let migrators = [this.checkEvolution, this.checkWindowsMail, this.checkIcal];
    // XXX also define a category and an interface here for pluggability
    for (let migrator of migrators) {
      let migs = migrator.call(this);
      for (let mig of migs) {
        DMs.push(mig);
      }
    }

    if (DMs.length == 0) {
      // No migration available
      return;
    }
    migLOG("DMs: " + DMs.length);

    let url = "chrome://calendar/content/calendar-migration-dialog.xhtml";
    if (AppConstants.platform == "macosx") {
      let win = Services.wm.getMostRecentWindow("Calendar:MigrationWizard");
      if (win) {
        win.focus();
      } else {
        openDialog(url, "migration", "centerscreen,chrome,resizable=no,width=500,height=400", DMs);
      }
    } else {
      openDialog(
        url,
        "migration",
        "modal,centerscreen,chrome,resizable=no,width=500,height=400",
        DMs
      );
    }
  },

  /**
   * Checks to see if Apple's iCal is installed and offers to migrate any data
   * the user has created in it.
   */
  checkIcal: function() {
    function icalMigrate(aDataDir, aCallback) {
      aDataDir.append("Sources");
      let calManager = cal.getCalendarManager();

      let i = 1;
      for (let dataDir of aDataDir.directoryEntries) {
        let dataStore = dataDir.clone();
        dataStore.append("corestorage.ics");
        if (!dataStore.exists()) {
          continue;
        }

        let fileStream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(
          Ci.nsIFileInputStream
        );

        fileStream.init(dataStore, 0x01, parseInt("0444", 8), {});
        let convIStream = Cc["@mozilla.org/intl/converter-input-stream;1"].getService(
          Ci.nsIConverterInputStream
        );
        convIStream.init(fileStream, "UTF-8", 0, 0x0000);
        let tmpStr = {};
        let str = "";
        while (convIStream.readString(-1, tmpStr)) {
          str += tmpStr.value;
        }

        // Strip out the timezone definitions, since it makes the file
        // invalid otherwise
        let index = str.indexOf(";TZID=");
        while (index != -1) {
          let endIndex = str.indexOf(":", index);
          let otherEnd = str.indexOf(";", index + 2);
          if (otherEnd < endIndex) {
            endIndex = otherEnd;
          }
          let sub = str.substring(index, endIndex);
          str = str.split(sub).join("");
          index = str.indexOf(";TZID=");
        }
        let tempFile = gDataMigrator.dirService.get("TmpD", Ci.nsIFile);
        tempFile.append("icalTemp.ics");
        tempFile.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, parseInt("0600", 8));

        let stream = Cc["@mozilla.org/network/file-output-stream;1"].createInstance(
          Ci.nsIFileOutputStream
        );
        stream.init(tempFile, 0x2a, parseInt("0600", 8), 0);
        let convOStream = Cc["@mozilla.org/intl/converter-output-stream;1"].createInstance(
          Ci.nsIConverterOutputStream
        );
        convOStream.init(stream, "UTF-8");
        convOStream.writeString(str);

        let calendar = gDataMigrator.importICSToStorage(tempFile);
        calendar.name = "iCalendar" + i;
        i++;
        calManager.registerCalendar(calendar);
        cal.view.getCompositeCalendar(window).addCalendar(calendar);
      }
      migLOG("icalMig making callback");
      aCallback();
    }

    migLOG("Checking for ical data");
    let profileDir = this.dirService.get("ProfD", Ci.nsIFile);
    let icalSpec = profileDir.path;
    let diverge = icalSpec.indexOf("Thunderbird");
    if (diverge == -1) {
      return [];
    }
    icalSpec = icalSpec.substr(0, diverge);
    let icalFile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    icalFile.initWithPath(icalSpec);
    icalFile.append("Application Support");

    icalFile.append("iCal");
    if (icalFile.exists()) {
      return [new dataMigrator("Apple iCal", icalMigrate, [icalFile])];
    }

    return [];
  },

  /**
   * Checks to see if Evolution is installed and offers to migrate any data
   * stored there.
   */
  checkEvolution: function() {
    function evoMigrate(aDataDir, aCallback) {
      let i = 1;
      let evoDataMigrate = function(dataStore) {
        migLOG("Migrating evolution data file in " + dataStore.path);
        if (dataStore.exists()) {
          let calendar = gDataMigrator.importICSToStorage(dataStore);
          calendar.name = "Evolution " + i++;
          calManager.registerCalendar(calendar);
          cal.view.getCompositeCalendar(window).addCalendar(calendar);
        }
        return dataStore.exists();
      };

      let calManager = cal.getCalendarManager();
      for (let dataDir of aDataDir.directoryEntries) {
        let dataStore = dataDir.clone();
        dataStore.append("calendar.ics");
        evoDataMigrate(dataStore);
      }

      aCallback();
    }

    let evoDir = this.dirService.get("Home", Ci.nsIFile);
    evoDir.append(".evolution");
    evoDir.append("calendar");
    evoDir.append("local");
    return evoDir.exists() ? [new dataMigrator("Evolution", evoMigrate, [evoDir])] : [];
  },

  checkWindowsMail: function() {
    function doMigrate(aCalendarNodes, aMailDir, aCallback) {
      let calManager = cal.getCalendarManager();

      for (let node of aCalendarNodes) {
        let name = node.getElementsByTagName("Name")[0].textContent;
        let color = node.getElementsByTagName("Color")[0].textContent;
        let enabled = node.getElementsByTagName("Enabled")[0].textContent == "True";

        // The name is quoted, and the color also contains an alpha
        // value. Lets just ignore the alpha value and take the
        // color part.
        name = name.replace(/(^'|'$)/g, "");
        color = color.replace(/0x[0-9a-fA-F]{2}([0-9a-fA-F]{4})/, "#$1");

        let calfile = aMailDir.clone();
        calfile.append(name + ".ics");

        if (calfile.exists()) {
          let storage = gDataMigrator.importICSToStorage(calfile);
          storage.name = name;

          if (color) {
            storage.setProperty("color", color);
          }
          calManager.registerCalendar(storage);

          if (enabled) {
            cal.view.getCompositeCalendar(window).addCalendar(storage);
          }
        }
      }
      aCallback();
    }

    if (!this.dirService.has("LocalAppData")) {
      // We are probably not on windows
      return [];
    }

    let maildir = this.dirService.get("LocalAppData", Ci.nsIFile);

    maildir.append("Microsoft");
    maildir.append("Windows Calendar");
    maildir.append("Calendars");

    let settingsxml = maildir.clone();
    settingsxml.append("Settings.xml");

    let migrators = [];
    if (settingsxml.exists()) {
      let settingsXmlUri = Services.io.newFileURI(settingsxml);

      let req = new XMLHttpRequest();
      req.open("GET", settingsXmlUri.spec, false);
      req.send(null);
      if (req.status == 0) {
        // The file was found, it seems we are on windows vista.
        let doc = req.responseXML;

        // Get all calendar property tags and return the migrator.
        let calendars = doc.getElementsByTagName("VCalendar");
        if (calendars.length > 0) {
          migrators = [
            new dataMigrator("Windows Calendar", doMigrate.bind(null, calendars, maildir)),
          ];
        }
      }
    }
    return migrators;
  },

  /**
   * Creates and registers a storage calendar and imports the given ics file into it.
   *
   * @param icsFile     The nsI(Local)File to import.
   */
  importICSToStorage: function(icsFile) {
    const uri = "moz-storage-calendar://";
    let calendar = cal.getCalendarManager().createCalendar("storage", Services.io.newURI(uri));
    let icsImporter = Cc["@mozilla.org/calendar/import;1?type=ics"].getService(Ci.calIImporter);

    let inputStream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(
      Ci.nsIFileInputStream
    );
    let items = [];

    calendar.id = cal.getUUID();

    try {
      inputStream.init(icsFile, MODE_RDONLY, parseInt("0444", 8), {});
      items = icsImporter.importFromStream(inputStream);
    } catch (ex) {
      switch (ex.result) {
        case Ci.calIErrors.INVALID_TIMEZONE:
          cal.showError(cal.l10n.getCalString("timezoneError", [icsFile.path]), window);
          break;
        default:
          cal.showError(cal.l10n.getCalString("unableToRead") + icsFile.path + "\n" + ex, window);
      }
    } finally {
      inputStream.close();
    }

    // Defined in import-export.js
    putItemsIntoCal(calendar, items, icsFile.leafName);

    return calendar;
  },
};

/**
 * logs to system and error console, depending on the calendar.migration.log
 * preference.
 *
 * XXX Use log4moz instead.
 *
 * @param aString   The string to log
 */
function migLOG(aString) {
  if (!Services.prefs.getBoolPref("calendar.migration.log", false)) {
    return;
  }
  Services.console.logStringMessage(aString);
  dump(aString + "\n");
}
