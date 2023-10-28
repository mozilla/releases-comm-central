/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");

var kIMig = Ci.nsIMailProfileMigrator;
var kIPStartup = Ci.nsIProfileStartup;
var kProfileMigratorContractIDPrefix =
  "@mozilla.org/profile/migrator;1?app=mail&type=";

var MigrationWizard = {
  _source: "", // Source Profile Migrator ContractID suffix
  _itemsFlags: kIMig.ALL, // Selected Import Data Sources (16-bit bitfield)
  _selectedProfile: null, // Selected Profile name to import from
  _wiz: null,
  _migrator: null,
  _autoMigrate: null,

  init() {
    document
      .querySelector("wizard")
      .addEventListener("wizardback", this.onBack.bind(this));
    document
      .querySelector("wizard")
      .addEventListener("wizardcancel", this.onCancel.bind(this));

    const importSourcePage = document.getElementById("importSource");
    importSourcePage.addEventListener(
      "pageadvanced",
      this.onImportSourcePageAdvanced.bind(this)
    );

    const selectProfilePage = document.getElementById("selectProfile");
    selectProfilePage.addEventListener(
      "pageshow",
      this.onSelectProfilePageShow.bind(this)
    );
    selectProfilePage.addEventListener(
      "pagerewound",
      this.onSelectProfilePageRewound.bind(this)
    );
    selectProfilePage.addEventListener(
      "pageadvanced",
      this.onSelectProfilePageAdvanced.bind(this)
    );

    const importItemsPage = document.getElementById("importItems");
    importItemsPage.addEventListener(
      "pageshow",
      this.onImportItemsPageShow.bind(this)
    );
    importItemsPage.addEventListener(
      "pagerewound",
      this.onImportItemsPageAdvanced.bind(this)
    );
    importItemsPage.addEventListener(
      "pageadvanced",
      this.onImportItemsPageAdvanced.bind(this)
    );

    const migratingPage = document.getElementById("migrating");
    migratingPage.addEventListener(
      "pageshow",
      this.onMigratingPageShow.bind(this)
    );

    const donePage = document.getElementById("done");
    donePage.addEventListener("pageshow", this.onDonePageShow.bind(this));

    const failedPage = document.getElementById("failed");
    failedPage.addEventListener("pageshow", () => (this._failed = true));
    failedPage.addEventListener("pagerewound", () => (this._failed = false));

    Services.obs.addObserver(this, "Migration:Started");
    Services.obs.addObserver(this, "Migration:ItemBeforeMigrate");
    Services.obs.addObserver(this, "Migration:ItemAfterMigrate");
    Services.obs.addObserver(this, "Migration:Ended");
    Services.obs.addObserver(this, "Migration:Progress");

    this._wiz = document.querySelector("wizard");

    if ("arguments" in window && !window.arguments[3]) {
      this._source = window.arguments[0];
      this._migrator = window.arguments[1]
        ? window.arguments[1].QueryInterface(kIMig)
        : null;
      this._autoMigrate = window.arguments[2].QueryInterface(kIPStartup);

      // Show the "nothing" option in the automigrate case to provide an
      // easily identifiable way to avoid migration and create a new profile.
      var nothing = document.getElementById("nothing");
      nothing.hidden = false;
    }

    this.onImportSourcePageShow();

    // Behavior alert! If we were given a migrator already, then we are going to perform migration
    // with that migrator, skip the wizard screen where we show all of the migration sources and
    // jump right into migration.
    if (this._migrator) {
      if (this._migrator.sourceHasMultipleProfiles) {
        this._wiz.goTo("selectProfile");
      } else {
        var sourceProfiles = this._migrator.sourceProfiles;
        this._selectedProfile = sourceProfiles[0];
        this._wiz.goTo("migrating");
      }
    }
  },

  uninit() {
    Services.obs.removeObserver(this, "Migration:Started");
    Services.obs.removeObserver(this, "Migration:ItemBeforeMigrate");
    Services.obs.removeObserver(this, "Migration:ItemAfterMigrate");
    Services.obs.removeObserver(this, "Migration:Ended");
    Services.obs.removeObserver(this, "Migration:Progress");

    // Imported accounts don't show up without restarting.
    if (this._wiz.onLastPage && !this._failed) {
      MailUtils.restartApplication();
    }
  },

  // 1 - Import Source
  onImportSourcePageShow() {
    this._wiz.canRewind = false;
    this._wiz.canAdvance = false;

    // Figure out what source apps are are available to import from:
    var group = document.getElementById("importSourceGroup");
    for (const childNode of group.children) {
      const suffix = childNode.id;
      if (suffix != "nothing") {
        var contractID =
          kProfileMigratorContractIDPrefix + suffix.split("-")[0];
        var migrator = Cc[contractID].createInstance(kIMig);
        if (!migrator.sourceExists) {
          childNode.hidden = true;
          if (this._source == suffix) {
            this._source = null;
          }
        }
      }
    }

    var firstNonDisabled = null;
    for (const childNode of group.children) {
      if (!childNode.hidden && !childNode.disabled) {
        firstNonDisabled = childNode;
        break;
      }
    }
    group.selectedItem =
      this._source == ""
        ? firstNonDisabled
        : document.getElementById(this._source);

    if (firstNonDisabled) {
      this._wiz.canAdvance = true;
      document.getElementById("importSourceFound").hidden = false;
      return;
    }
    // If no usable import module was found, inform user and enable back button.
    document.getElementById("importSourceNotFound").hidden = false;
    this._wiz.canRewind = true;
    this._wiz.getButton("back").setAttribute("hidden", "false");
  },

  onImportSourcePageAdvanced() {
    var newSource =
      document.getElementById("importSourceGroup").selectedItem.id;

    if (newSource == "nothing") {
      document.querySelector("wizard").cancel();
      return;
    }

    if (!this._migrator || newSource != this._source) {
      // Create the migrator for the selected source.
      var contractID =
        kProfileMigratorContractIDPrefix + newSource.split("-")[0];
      this._migrator = Cc[contractID].createInstance(kIMig);

      this._itemsFlags = kIMig.ALL;
      this._selectedProfile = null;
    }

    this._source = newSource;

    // check for more than one source profile
    if (this._migrator.sourceHasMultipleProfiles) {
      this._wiz.currentPage.next = "selectProfile";
    } else {
      this._wiz.currentPage.next = "migrating";
      var sourceProfiles = this._migrator.sourceProfiles;
      if (sourceProfiles && sourceProfiles.length == 1) {
        this._selectedProfile = sourceProfiles[0];
      } else {
        this._selectedProfile = "";
      }
    }
  },

  // 2 - [Profile Selection]
  onSelectProfilePageShow() {
    // Disabling this for now, since we ask about import sources in automigration
    // too and don't want to disable the back button
    // if (this._autoMigrate)
    //   document.querySelector("wizard").getButton("back").disabled = true;

    var profiles = document.getElementById("profiles");
    while (profiles.hasChildNodes()) {
      profiles.lastChild.remove();
    }

    if (!this._migrator) {
      return;
    }
    var sourceProfiles = this._migrator.sourceProfiles;
    var count = sourceProfiles.length;
    for (var i = 0; i < count; ++i) {
      var item = document.createXULElement("radio");
      item.id = sourceProfiles[i];
      item.setAttribute("label", item.id);
      profiles.appendChild(item);
    }

    profiles.selectedItem = this._selectedProfile
      ? document.getElementById(this._selectedProfile)
      : profiles.firstElementChild;
  },

  onSelectProfilePageRewound() {
    var profiles = document.getElementById("profiles");
    this._selectedProfile = profiles.selectedItem.id;
  },

  onSelectProfilePageAdvanced() {
    var profiles = document.getElementById("profiles");
    this._selectedProfile = profiles.selectedItem.id;

    // If we're automigrating, don't show the item selection page, just grab everything.
    if (this._autoMigrate) {
      this._wiz.currentPage.next = "migrating";
    }
  },

  // 3 - ImportItems
  onImportItemsPageShow() {
    var dataSources = document.getElementById("dataSources");
    while (dataSources.hasChildNodes()) {
      dataSources.lastChild.remove();
    }

    var bundle = document.getElementById("bundle");

    var items = this._migrator.getMigrateData(
      this._selectedProfile,
      this._autoMigrate
    );
    for (var i = 0; i < 16; ++i) {
      var itemID = (items >> i) & 0x1 ? Math.pow(2, i) : 0;
      if (itemID > 0) {
        var checkbox = document.createXULElement("checkbox");
        checkbox.id = itemID;
        checkbox.setAttribute(
          "label",
          bundle.getString(itemID + "_" + this._source.split("-")[0])
        );
        dataSources.appendChild(checkbox);
        if (!this._itemsFlags || this._itemsFlags & itemID) {
          checkbox.checked = true;
        }
      }
    }
  },

  onImportItemsPageAdvanced() {
    var dataSources = document.getElementById("dataSources");
    this._itemsFlags = 0;
    for (var i = 0; i < dataSources.children.length; ++i) {
      var checkbox = dataSources.children[i];
      if (checkbox.localName == "checkbox" && checkbox.checked) {
        this._itemsFlags |= parseInt(checkbox.id);
      }
    }
  },

  onImportItemCommand(aEvent) {
    var items = document.getElementById("dataSources");
    var checkboxes = items.getElementsByTagName("checkbox");

    var oneChecked = false;
    for (var i = 0; i < checkboxes.length; ++i) {
      if (checkboxes[i].checked) {
        oneChecked = true;
        break;
      }
    }

    this._wiz.canAdvance = oneChecked;
  },

  // 4 - Migrating
  async onMigratingPageShow() {
    this._wiz.getButton("cancel").disabled = true;
    this._wiz.canRewind = false;
    this._wiz.canAdvance = false;

    // When automigrating or migrating all, show all of the data that can
    // be received from this source.
    if (this._autoMigrate || this._itemsFlags == kIMig.ALL) {
      this._itemsFlags = this._migrator.getMigrateData(
        this._selectedProfile,
        this._autoMigrate
      );
    }

    this._listItems("migratingItems");
    try {
      await this.onMigratingMigrate();
    } catch (e) {
      switch (e.message) {
        case "file-picker-cancelled":
          this._wiz.canRewind = true;
          this._wiz.rewind();
          this._wiz.canAdvance = true;
          return;
        case "zip-file-too-big":
          this._wiz.canRewind = true;
          this._wiz.rewind();
          this._wiz.canAdvance = true;
          const [zipFileTooBigTitle, zipFileTooBigMessage] =
            await document.l10n.formatValues([
              "zip-file-too-big-title",
              "zip-file-too-big-message",
            ]);
          Services.prompt.alert(
            window,
            zipFileTooBigTitle,
            zipFileTooBigMessage
          );
          document.getElementById("importSourceGroup").selectedItem =
            document.getElementById("thunderbird-dir");
          return;
        default:
          document.getElementById("failed-message-default").hidden = e.message;
          document.getElementById("failed-message").hidden = !e.message;
          document.getElementById("failed-message").textContent =
            e.message || "";
          this._wiz.canAdvance = true;
          this._wiz.advance("failed");
          throw e;
      }
    }
  },

  async onMigratingMigrate(aOuter) {
    const [source, type] = this._source.split("-");
    if (source == "thunderbird") {
      // Ask user for the profile directory location.
      await this._migrator.wrappedJSObject.getProfileDir(window, type);
      await this._migrator.wrappedJSObject.asyncMigrate();
      return;
    }
    this._migrator.migrate(
      this._itemsFlags,
      this._autoMigrate,
      this._selectedProfile
    );
  },

  _listItems(aID) {
    var items = document.getElementById(aID);
    while (items.hasChildNodes()) {
      items.lastChild.remove();
    }

    var bundle = document.getElementById("bundle");
    for (var i = 0; i < 16; ++i) {
      var itemID = (this._itemsFlags >> i) & 0x1 ? Math.pow(2, i) : 0;
      if (itemID > 0) {
        var label = document.createXULElement("label");
        label.id = itemID + "_migrated";
        try {
          label.setAttribute(
            "value",
            "- " + bundle.getString(itemID + "_" + this._source.split("-")[0])
          );
          items.appendChild(label);
        } catch (e) {
          // if the block above throws, we've enumerated all the import data types we
          // currently support and are now just wasting time, break.
          break;
        }
      }
    }
  },

  observe(aSubject, aTopic, aData) {
    switch (aTopic) {
      case "Migration:Started":
        dump("*** started\n");
        break;
      case "Migration:ItemBeforeMigrate": {
        dump("*** before " + aData + "\n");
        const label = document.getElementById(aData + "_migrated");
        if (label) {
          label.setAttribute("style", "font-weight: bold");
        }
        break;
      }
      case "Migration:ItemAfterMigrate": {
        dump("*** after " + aData + "\n");
        const label = document.getElementById(aData + "_migrated");
        if (label) {
          label.removeAttribute("style");
        }
        break;
      }
      case "Migration:Ended":
        dump("*** done\n");
        if (this._autoMigrate) {
          // We're done now.
          this._wiz.canAdvance = true;
          this._wiz.advance();
          setTimeout(window.close, 5000);
        } else {
          this._wiz.canAdvance = true;
          var nextButton = this._wiz.getButton("next");
          nextButton.click();
        }
        break;
      case "Migration:Progress":
        document.getElementById("progressBar").value = aData;
        break;
    }
  },

  onDonePageShow() {
    this._wiz.getButton("cancel").disabled = true;
    this._wiz.canRewind = false;
    this._listItems("doneItems");
  },

  onBack(event) {
    this._wiz.goTo("importSource");
    this._wiz.canRewind = false;
    event.preventDefault();
  },

  onCancel() {
    // If .closeMigration is false, the user clicked Back button,
    // then do not change its value.
    if (
      window.arguments[3] &&
      "closeMigration" in window.arguments[3] &&
      window.arguments[3].closeMigration !== false
    ) {
      window.arguments[3].closeMigration = true;
    }
  },
};
