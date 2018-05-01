/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource://gre/modules/Preferences.jsm");

function calBackendLoader() {
    this.wrappedJSObject = this;
    try {
        this.loadBackend();
    } catch (e) {
        dump(`### Error loading backend:${e.filename || e.fileName}:${e.lineNumber}: ${e}\n`);
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

        if (Preferences.get("calendar.icaljs", false)) {
            let contracts = {
                "@mozilla.org/calendar/datetime;1": "{36783242-ec94-4d8a-9248-d2679edd55b9}",
                "@mozilla.org/calendar/ics-service;1": "{c61cb903-4408-41b3-bc22-da0b27efdfe1}",
                "@mozilla.org/calendar/period;1": "{394a281f-7299-45f7-8b1f-cce21258972f}",
                "@mozilla.org/calendar/recurrence-rule;1": "{df19281a-5389-4146-b941-798cb93a7f0d}",
                "@mozilla.org/calendar/duration;1": "{7436f480-c6fc-4085-9655-330b1ee22288}",
            };

            // Load ical.js backend
            let scope = {};
            Services.scriptloader.loadSubScript("resource://calendar/components/calICALJSComponents.js", scope);

            // Register the icaljs components. We used to unregisterFactory, but this caused all
            // sorts of problems. Just registering over it seems to work quite fine.
            let registrar = Components.manager.QueryInterface(Components.interfaces.nsIComponentRegistrar);
            for (let [contractID, classID] of Object.entries(contracts)) {
                let newClassID = Components.ID(classID);
                let newFactory = lazyFactoryFor(scope, newClassID);
                registrar.registerFactory(newClassID, "", contractID, newFactory);
            }

            dump("[calBackendLoader] Using Lightning's icaljs backend\n");
        } else {
            dump("[calBackendLoader] Using Thunderbird's builtin libical backend\n");
        }

        this.loaded = true;
    }
};

function lazyFactoryFor(backendScope, classID) {
    return {
        createInstance: function(aOuter, aIID) {
            let realFactory = backendScope.NSGetFactory(classID);
            return realFactory.createInstance(aOuter, aIID);
        },
        lockFactory: function(lock) {
            let realFactory = backendScope.NSGetFactory(classID);
            return realFactory.lockFactory(aOuter, aIID);
        }
    };
}

this.NSGetFactory = XPCOMUtils.generateNSGetFactory([calBackendLoader]);
