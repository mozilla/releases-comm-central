/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");

function calBackendLoader() {
    this.wrappedJSObject = this;
    try {
        this.loadBackend();
    } catch (e) {
        dump("### Error loading backend: " + e + "\n");
    }
}

var calBackendLoaderClassID = Components.ID("{0314c271-7168-40fa-802e-83c8c46a557e}");
var calBackendLoaderInterfaces = [Components.interfaces.nsIObserver];
calBackendLoader.prototype = {
    classID: calBackendLoaderClassID,
    QueryInterface: XPCOMUtils.generateQI(calBackendLoaderInterfaces),
    classInfo: XPCOMUtils.generateCI({
        classID: calBackendLoaderClassID,
        contractID: "@mozilla.org/calendar/backend-loader;1",
        classDescription: "Calendar Backend Loader",
        interfaces: calBackendLoaderInterfaces,
        flags: Components.interfaces.nsIClassInfo.SINGLETON
    }),

    loaded: false,

    observe: function() {
        // Nothing to do here, just need the entry so this is instanciated
    },

    loadBackend: function() {
        if (this.loaded) {
            return;
        }

        if (Services.prefs.getBoolPref("calendar.icaljs")) {
            let contracts = [
                "@mozilla.org/calendar/datetime;1",
                "@mozilla.org/calendar/duration;1",
                "@mozilla.org/calendar/ics-service;1",
                "@mozilla.org/calendar/period;1",
                "@mozilla.org/calendar/recurrence-rule;1"
            ];

            // Unregister libical components
            let registrar = Components.manager.QueryInterface(Components.interfaces.nsIComponentRegistrar);
            for (let contractId of contracts) {
                let classobj = Components.classes[contractId];
                let factory = Components.manager.getClassObject(classobj, Components.interfaces.nsIFactory);
                let classId = registrar.contractIDToCID(contractId);
                registrar.unregisterFactory(classId, factory);
            }

            // Now load ical.js backend
            let uri = Services.io.getProtocolHandler("resource")
                              .QueryInterface(Components.interfaces.nsIResProtocolHandler)
                              .getSubstitution("calendar");

            let file = Services.io.getProtocolHandler("file")
                               .QueryInterface(Components.interfaces.nsIFileProtocolHandler)
                               .getFileFromURLSpec(uri.spec);
            file.append("components");
            file.append("icaljs-manifest");

            Components.manager.QueryInterface(Components.interfaces.nsIComponentRegistrar)
                      .autoRegister(file);
            dump("[calBackendLoader] Using icaljs backend at " + file.path + "\n");
        } else {
            dump("[calBackendLoader] Using Thunderbird's builtin libical backend\n");
        }

        this.loaded = true;
    }
};

this.NSGetFactory = XPCOMUtils.generateNSGetFactory([calBackendLoader]);
