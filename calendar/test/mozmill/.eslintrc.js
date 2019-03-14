"use strict";

module.exports = {
    globals: {
        __file__: true,
        elementslib: true,
        controller: true,
        mozmill: true,
        utils: true,
        require: true,
        exports: true,
        module: true,
        registeredFunctions: true,
        collector: true,
        persisted: true,

        lookup: true,
        eid: true,
        xpath: true,
        sleep: true,
        getEventBoxPath: true,
        lookupEventBox: true,
        iframeLookup: true,
        getDateTimePicker: true,
    },
    rules: {
        // Allow mozmill test methods to be used without warning
        "no-unused-vars": [2, {
            vars: "all",
            args: "none",
            varsIgnorePattern: "(MODULE_NAME|MODULE_REQUIRES|RELATIVE_ROOT|setupModule|installInto|teardownTest|^test[A-Z_].*)"
        }]
    }
};
