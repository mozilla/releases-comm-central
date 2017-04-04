"use strict";

module.exports = {
    "extends": [
        "plugin:mozilla/xpcshell-test"
    ],
    "rules": {
        // Allow non-camelcase so that run_test doesn't produce a warning.
        "camelcase": 0,
        // Allow using undefined variables so that tests can refer to functions
        // and variables defined in head.js files, without having to maintain a
        // list of globals in each .eslintrc file.
        // Note that bug 1168340 will eventually help auto-registering globals
        // from head.js files.
        "no-undef": 0,
        "block-scoped-var": 0,
        // Allow run_test to be unused in xpcshell
        "no-unused-vars": [2, { vars: "all", args: "none", varsIgnorePattern: "run_test" }],

        // Allow function names, because they are useful for add_test/add_task
        "func-names": 0,
    }
};
