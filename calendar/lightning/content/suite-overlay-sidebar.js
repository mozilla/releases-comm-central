/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://gre/modules/Services.jsm");

var ltnSuiteUtils = {

    addStartupObserver: function() {
        Services.obs.addObserver(this.startupObserver, "lightning-startup-done", false);
        Services.obs.addObserver(this.startupObserver, "calendar-taskview-startup-done",
                        false);
    },

    startupObserver: {
        observe: function(subject, topic, state) {
            if (topic != "lightning-startup-done" &&
                topic != "calendar-taskview-startup-done") {
                return;
            }

            const ids = [
                ["CustomizeTaskActionsToolbar", "task-actions-toolbox"],
                ["CustomizeCalendarToolbar", "calendar-toolbox"],
                ["CustomizeTaskToolbar", "task-toolbox"]
            ];

            ids.forEach(([itemID, toolboxID]) => {
                let item = document.getElementById(itemID);
                let toolbox = document.getElementById(toolboxID);
                toolbox.customizeInit = function() {
                    item.setAttribute("disabled", "true");
                    toolboxCustomizeInit("mail-menubar");
                };
                toolbox.customizeDone = function(aToolboxChanged) {
                    item.removeAttribute("disabled");
                    toolboxCustomizeDone("mail-menubar", toolbox, aToolboxChanged);
                };
                toolbox.customizeChange = function(aEvent) {
                    toolboxCustomizeChange(toolbox, aEvent);
                };
            });
        }
    }
};

ltnSuiteUtils.addStartupObserver();
