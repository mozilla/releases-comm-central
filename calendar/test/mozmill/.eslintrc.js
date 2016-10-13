"use strict";

module.exports = {
    globals: {
        elementslib: true,
        controller: true,
        mozmill: true,
        utils: true,
        require: true,
        exports: true,
        module: true
    },
    rules: {
        // Allow mozmill test methods to be used without warning
        "no-unused-vars": [2, {
            vars: "all",
            args: "none",
            varsIgnorePattern: "(MODULE_NAME|MODULE_REQUIRES|RELATIVE_ROOT|setupModule|teardownTest|^test[A-Z].*)"
        }]
    }
};
