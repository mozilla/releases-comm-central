/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that the IMIP bar behaves properly for eml files.
 */

// make -C calendar/test/mozmill SOLO_TEST=invitations/test-imip-bar-eml.js mozmill-one

var MODULE_NAME = "invitations";

var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = [
    "folder-display-helpers",
    "window-helpers",
    "notificationbox-helpers"
];

var os = {};
Components.utils.import('resource://mozmill/stdlib/os.js', os);

function setupModule(module) {
    for (let dep of MODULE_REQUIRES) {
        collector.getModule(dep).installInto(module);
    }
}

/**
 * Test that when opening a message containing an event, the IMIP bar shows.
 */
function test_event_from_eml() {
    let thisFilePath = os.getFileForPath(__file__);
    let file = os.getFileForPath(os.abspath("./message-containing-event.eml", thisFilePath));

    let msgc = open_message_from_file(file);

    msgc.waitFor(() => {
        let nb = msgc.window.document.getElementById("imip-bar");
        if (!nb) {
            throw new Error("Couldn't find imip-bar in DOM.");
        }
        return (nb.collapsed === false);
    }, "Timed out waiting for IMIP bar to show");

    close_window(msgc);
}

