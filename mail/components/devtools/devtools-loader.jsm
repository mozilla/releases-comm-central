/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

function DevToolsStartup() {}

DevToolsStartup.prototype = {
  QueryInterface: ChromeUtils.generateQI([Ci.nsICommandLineHandler]),

  helpInfo: "",
  handle(cmdLine) {
    this.initialize();

    // We want to overwrite the -devtools flag and open the toolbox instead
    let devtoolsFlag = cmdLine.handleFlag("devtools", false);
    if (devtoolsFlag) {
      this.handleDevToolsFlag(cmdLine);
    }
  },

  handleDevToolsFlag(cmdLine) {
    const { BrowserToolboxLauncher } = ChromeUtils.import(
      "resource://devtools/client/framework/browser-toolbox/Launcher.jsm"
    );
    BrowserToolboxLauncher.init();

    if (cmdLine.state == Ci.nsICommandLine.STATE_REMOTE_AUTO) {
      cmdLine.preventDefault = true;
    }
  },

  initialize() {
    let { loader, require, DevToolsLoader } = ChromeUtils.import(
      "resource://devtools/shared/Loader.jsm"
    );
    let { DebuggerServer } = require("devtools/server/debugger-server");
    let { gDevTools } = require("devtools/client/framework/devtools");

    // Set up the client and server chrome window type, make sure it can't be set
    Object.defineProperty(DebuggerServer, "chromeWindowType", {
      get: () => "mail:3pane",
      set: () => {},
      configurable: true,
    });
    Object.defineProperty(gDevTools, "chromeWindowType", {
      get: () => "mail:3pane",
      set: () => {},
      configurable: true,
    });

    // Make sure our root actor is always registered, no matter how devtools are called.
    let devtoolsRegisterActors = DebuggerServer.registerActors.bind(
      DebuggerServer
    );
    DebuggerServer.registerActors = function(options) {
      devtoolsRegisterActors(options);
      if (options.root) {
        const {
          createRootActor,
        } = require("resource:///modules/tb-root-actor.js");
        DebuggerServer.setRootActor(createRootActor);
      }
    };

    // Make the loader visible to the debugger by default and for the already
    // loaded instance. Thunderbird now also provides the Browser Toolbox for
    // chrome debugging, which uses its own separate loader instance.
    DevToolsLoader.prototype.invisibleToDebugger = false;
    loader.invisibleToDebugger = false;
    DebuggerServer.allowChromeProcess = true;

    // Initialize and load the toolkit/browser actors. This will also call above function to set the
    // Thunderbird root actor
    DebuggerServer.init();
    DebuggerServer.registerAllActors();
  },
};

var EXPORTED_SYMBOLS = ["DevToolsStartup"];
