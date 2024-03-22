/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

window.addEventListener("DOMContentLoaded", () => {
  gMigrateWizard.loadMigrators();
});

var gMigrateWizard = {
  /**
   * Called from onload of the migrator window.  Takes all of the migrators
   * that were passed in via window.arguments and adds them to checklist. The
   * user can then check these off to migrate the data from those sources.
   */
  loadMigrators() {
    const wizardPage2 = document.getElementById("wizardPage2");
    wizardPage2.addEventListener("pageshow", gMigrateWizard.migrateChecked);

    const listbox = document.getElementById("datasource-list");

    // XXX Once we have branding for lightning, this hack can go away
    const props = Services.strings.createBundle("chrome://calendar/locale/migration.properties");

    const wizard = document.querySelector("wizard");
    const desc = document.getElementById("wizard-desc");
    // Since we don't translate "Lightning"...
    wizard.title = props.formatStringFromName("migrationTitle", ["Lightning"]);
    desc.textContent = props.formatStringFromName("migrationDescription", ["Lightning"]);

    for (const migrator of window.arguments[0]) {
      const checkbox = document.createXULElement("checkbox");
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
  migrateChecked() {
    const migrators = [];

    // Get all the checked migrators into an array
    const listbox = document.getElementById("datasource-list");
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
    const wizard = document.querySelector("wizard");
    wizard.canAdvance = false;
    wizard.canRewind = false;

    // We're going to need this for the progress meter's description
    const props = Services.strings.createBundle("chrome://calendar/locale/migration.properties");
    const label = document.getElementById("progress-label");
    const meter = document.getElementById("migrate-progressmeter");

    let i = 0;
    // Because some of our migrators involve async code, we need this
    // call-back function so we know when to start the next migrator.
    function getNextMigrator() {
      if (migrators[i]) {
        const mig = migrators[i];

        // Increment i to point to the next migrator
        i++;
        label.value = props.formatStringFromName("migratingApp", [mig.title]);
        meter.value = ((i - 1) / migrators.length) * 100;
        mig.args.push(getNextMigrator);

        try {
          mig.migrate(...mig.args);
        } catch (e) {
          console.warn("Failed to migrate: " + mig.title, e);
          getNextMigrator();
        }
      } else {
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
  setCanRewindFalse() {
    document.querySelector("wizard").canRewind = false;
  },
};
