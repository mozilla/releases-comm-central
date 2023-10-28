/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

function DevToolsStartup() {}

DevToolsStartup.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsICommandLineHandler"]),

  helpInfo: "",
  handle(cmdLine) {
    this.initialize();

    // We want to overwrite the -devtools flag and open the toolbox instead
    const devtoolsFlag = cmdLine.handleFlag("devtools", false);
    if (devtoolsFlag) {
      this.handleDevToolsFlag(cmdLine);
    }
  },

  handleDevToolsFlag(cmdLine) {
    const { BrowserToolboxLauncher } = ChromeUtils.importESModule(
      "resource://devtools/client/framework/browser-toolbox/Launcher.sys.mjs"
    );
    BrowserToolboxLauncher.init();

    if (cmdLine.state == Ci.nsICommandLine.STATE_REMOTE_AUTO) {
      cmdLine.preventDefault = true;
    }
  },

  initialize() {
    const { loader, require, DevToolsLoader } = ChromeUtils.importESModule(
      "resource://devtools/shared/loader/Loader.sys.mjs"
    );
    const { DevToolsServer } = require("devtools/server/devtools-server");
    const { gDevTools } = require("devtools/client/framework/devtools");

    // Set up the client and server chrome window type, make sure it can't be set
    Object.defineProperty(DevToolsServer, "chromeWindowType", {
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
    const devtoolsRegisterActors =
      DevToolsServer.registerActors.bind(DevToolsServer);
    DevToolsServer.registerActors = function (options) {
      devtoolsRegisterActors(options);
      if (options.root) {
        const {
          createRootActor,
        } = require("resource:///modules/tb-root-actor.js");
        DevToolsServer.setRootActor(createRootActor);
      }
    };

    // Make the loader visible to the debugger by default and for the already
    // loaded instance. Thunderbird now also provides the Browser Toolbox for
    // chrome debugging, which uses its own separate loader instance.
    DevToolsLoader.prototype.invisibleToDebugger = false;
    loader.invisibleToDebugger = false;
    DevToolsServer.allowChromeProcess = true;

    // Initialize and load the toolkit/browser actors. This will also call above function to set the
    // Thunderbird root actor
    DevToolsServer.init();
    DevToolsServer.registerAllActors();
  },
};

var EXPORTED_SYMBOLS = ["DevToolsStartup"];
