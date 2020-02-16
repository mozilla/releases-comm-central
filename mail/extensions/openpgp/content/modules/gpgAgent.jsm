/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */


"use strict";

var EXPORTED_SYMBOLS = ["EnigmailGpgAgent"];



const ctypes = ChromeUtils.import("resource://gre/modules/ctypes.jsm").ctypes;
const subprocess = ChromeUtils.import("chrome://openpgp/content/modules/subprocess.jsm").subprocess;
const EnigmailCore = ChromeUtils.import("chrome://openpgp/content/modules/core.jsm").EnigmailCore;
const EnigmailFiles = ChromeUtils.import("chrome://openpgp/content/modules/files.jsm").EnigmailFiles;
const EnigmailLog = ChromeUtils.import("chrome://openpgp/content/modules/log.jsm").EnigmailLog;
const EnigmailPrefs = ChromeUtils.import("chrome://openpgp/content/modules/prefs.jsm").EnigmailPrefs;
const EnigmailOS = ChromeUtils.import("chrome://openpgp/content/modules/os.jsm").EnigmailOS;
const EnigmailLocale = ChromeUtils.import("chrome://openpgp/content/modules/locale.jsm").EnigmailLocale;
const EnigmailWindows = ChromeUtils.import("chrome://openpgp/content/modules/windows.jsm").EnigmailWindows;
const EnigmailApp = ChromeUtils.import("chrome://openpgp/content/modules/app.jsm").EnigmailApp;
const EnigmailExecution = ChromeUtils.import("chrome://openpgp/content/modules/execution.jsm").EnigmailExecution;
const EnigmailPassword = ChromeUtils.import("chrome://openpgp/content/modules/passwords.jsm").EnigmailPassword;
const EnigmailSystem = ChromeUtils.import("chrome://openpgp/content/modules/system.jsm").EnigmailSystem;
const EnigmailData = ChromeUtils.import("chrome://openpgp/content/modules/data.jsm").EnigmailData;
const EnigmailLazy = ChromeUtils.import("chrome://openpgp/content/modules/lazy.jsm").EnigmailLazy;
const getEnigmailGpg = EnigmailLazy.loader("enigmail/gpg.jsm", "EnigmailGpg");
const getDialog = EnigmailLazy.loader("enigmail/dialog.jsm", "EnigmailDialog");





const NS_LOCAL_FILE_CONTRACTID = "@mozilla.org/file/local;1";
const DIR_SERV_CONTRACTID = "@mozilla.org/file/directory_service;1";
const NS_LOCALFILEOUTPUTSTREAM_CONTRACTID = "@mozilla.org/network/file-output-stream;1";

const DEFAULT_FILE_PERMS = 0o600;

// Making this a var makes it possible to test windows things on linux
var nsIWindowsRegKey = Ci.nsIWindowsRegKey;

var gIsGpgAgent = -1;

const DUMMY_AGENT_INFO = "none";

function cloneOrNull(v) {
  if (v && typeof v.clone === "function") {
    return v.clone();
  }
  else {
    return v;
  }
}

function extractAgentInfo(fullStr) {
  if (fullStr) {
    return fullStr.
    replace(/[\r\n]/g, "").
    replace(/^.*=/, "").
    replace(/;.*$/, "");
  }
  else {
    return "";
  }
}

function getHomedirFromParam(param) {
  let i = param.search(/--homedir/);
  if (i >= 0) {
    param = param.substr(i + 9);

    let m = param.match(/^(\s*)([^\\]".+[^\\]")/);
    if (m && m.length > 2) {
      param = m[2].substr(1);
      let j = param.search(/[^\\]"/);
      return param.substr(1, j);
    }

    m = param.match(/^(\s*)([^\\]'.+[^\\]')/);
    if (m && m.length > 2) {
      param = m[2].substr(1);
      let j = param.search(/[^\\]'/);
      return param.substr(1, j);
    }

    m = param.match(/^(\s*)(\S+)/);
    if (m && m.length > 2) {
      return m[2];
    }
  }

  return null;
}

var EnigmailGpgAgent = {
  agentType: "",
  agentPath: null,
  connGpgAgentPath: null,
  gpgconfPath: null,
  gpgAgentInfo: {
    preStarted: false,
    envStr: ""
  },
  gpgAgentProcess: null,
  gpgAgentIsOptional: true,

  isDummy: function() {
    return EnigmailGpgAgent.gpgAgentInfo.envStr === DUMMY_AGENT_INFO;
  },

  resetGpgAgent: function() {
    EnigmailLog.DEBUG("gpgAgent.jsm: resetGpgAgent\n");
    gIsGpgAgent = -1;
  },

  isCmdGpgAgent: function(pid) {
    console.debug("reaching disabled EnigmailGpgAgent.isCmdGpgAgent()");
    return;

    EnigmailLog.DEBUG("gpgAgent.jsm: isCmdGpgAgent:\n");

    const environment = Cc["@mozilla.org/process/environment;1"].getService(Ci.nsIEnvironment);
    let ret = false;

    let path = environment.get("PATH");
    if (!path || path.length === 0) {
      path = "/bin:/usr/bin:/usr/local/bin";
    }

    const psCmd = EnigmailFiles.resolvePath("ps", path, false);
    let outStr = "";

    const proc = {
      command: psCmd,
      arguments: ["-o", "comm", "-p", pid],
      environment: EnigmailCore.getEnvList(),
      charset: null,
      stdout: function(data) {
        outStr += data;
      }
    };

    try {
      subprocess.call(proc).wait();

      EnigmailLog.DEBUG("gpgAgent.jsm: isCmdGpgAgent: got data: '" + outStr + "'\n");
      var data = outStr.replace(/[\r\n]/g, " ");
      if (data.search(/gpg-agent/) >= 0) {
        ret = true;
      }
    }
    catch (ex) {}

    return ret;

  },

  isAgentTypeGpgAgent: function() {
    console.debug("reaching disabled EnigmailGpgAgent.isAgentTypeGpgAgent()");
    return;

    // determine if the used agent is a gpg-agent

    EnigmailLog.DEBUG("gpgAgent.jsm: isAgentTypeGpgAgent:\n");

    // to my knowledge there is no other agent than gpg-agent on Windows
    if (EnigmailOS.getOS() == "WINNT") return true;

    if (gIsGpgAgent >= 0) {
      return gIsGpgAgent == 1;
    }

    let pid = -1;
    let exitCode = -1;
    let outStr = "";
    if (!EnigmailCore.getService()) return false;

    const proc = {
      command: EnigmailGpgAgent.connGpgAgentPath,
      arguments: [],
      charset: null,
      environment: EnigmailCore.getEnvList(),
      stdin: function(pipe) {
        pipe.write("/subst\n");
        pipe.write("/serverpid\n");
        pipe.write("/echo pid: ${get serverpid}\n");
        pipe.write("/bye\n");
        pipe.close();
      },
      stdout: function(data) {
        outStr += data;
      }
    };

    try {
      exitCode = subprocess.call(proc).wait();
      if (exitCode) pid = -2;

      const data = outStr.replace(/[\r\n]/g, "");
      if (data.search(/^pid: [0-9]+$/) === 0) {
        pid = data.replace(/^pid: /, "");
      }
    }
    catch (ex) {}

    EnigmailLog.DEBUG("gpgAgent.jsm: isAgentTypeGpgAgent: pid=" + pid + "\n");

    EnigmailGpgAgent.isCmdGpgAgent(pid);
    let isAgent = false;

    try {
      isAgent = EnigmailGpgAgent.isCmdGpgAgent(pid);
      gIsGpgAgent = isAgent ? 1 : 0;
    }
    catch (ex) {}

    return isAgent;
  },

  getAgentMaxIdle: function() {
    console.debug("reaching disabled EnigmailGpgAgent.getAgentMaxIdle()");
    return;

    EnigmailLog.DEBUG("gpgAgent.jsm: getAgentMaxIdle:\n");
    let maxIdle = -1;

    if (!EnigmailCore.getService()) return maxIdle;

    const DEFAULT = 7;
    const CFGVALUE = 9;
    let outStr = "";

    const proc = {
      command: EnigmailGpgAgent.gpgconfPath,
      arguments: ["--list-options", "gpg-agent"],
      charset: null,
      environment: EnigmailCore.getEnvList(),
      stdout: function(data) {
        outStr += data;
      }
    };

    subprocess.call(proc).wait();

    const lines = outStr.split(/[\r\n]/);

    for (let i = 0; i < lines.length; i++) {
      EnigmailLog.DEBUG("gpgAgent.jsm: getAgentMaxIdle: line: " + lines[i] + "\n");

      if (lines[i].search(/^default-cache-ttl:/) === 0) {
        const m = lines[i].split(/:/);
        if (m[CFGVALUE].length === 0) {
          maxIdle = Math.round(m[DEFAULT] / 60);
        }
        else {
          maxIdle = Math.round(m[CFGVALUE] / 60);
        }

        break;
      }
    }
    return maxIdle;
  },

  setAgentMaxIdle: function(idleMinutes) {
    console.debug("reaching disabled EnigmailGpgAgent.setAgentMaxIdle()");
    return;

    EnigmailLog.DEBUG("gpgAgent.jsm: setAgentMaxIdle:\n");
    if (!EnigmailCore.getService()) return;

    const RUNTIME = 8;

    const proc = {
      command: EnigmailGpgAgent.gpgconfPath,
      arguments: ["--runtime", "--change-options", "gpg-agent"],
      environment: EnigmailCore.getEnvList(),
      charset: null,
      mergeStderr: true,
      stdin: function(pipe) {
        pipe.write("default-cache-ttl:" + RUNTIME + ":" + (idleMinutes * 60) + "\n");
        pipe.write("max-cache-ttl:" + RUNTIME + ":" + (idleMinutes * 600) + "\n");
        pipe.close();
      },
      stdout: function(data) {
        EnigmailLog.DEBUG("gpgAgent.jsm: setAgentMaxIdle.stdout: " + data + "\n");
      }
    };

    try {
      let exitCode = subprocess.call(proc);
      EnigmailLog.DEBUG("gpgAgent.jsm: setAgentMaxIdle.stdout: gpgconf exitCode=" + exitCode + "\n");
    }
    catch (ex) {
      EnigmailLog.DEBUG("gpgAgent.jsm: setAgentMaxIdle: exception: " + ex.toString() + "\n");
    }
  },

  getMaxIdlePref: function(win) {
    let maxIdle = EnigmailPrefs.getPref("maxIdleMinutes");

    try {
      if (EnigmailCore.getService(win)) {
        if (EnigmailGpgAgent.gpgconfPath &&
          EnigmailGpgAgent.connGpgAgentPath) {

          if (EnigmailGpgAgent.isAgentTypeGpgAgent()) {
            const m = EnigmailGpgAgent.getAgentMaxIdle();
            if (m > -1) maxIdle = m;
          }
        }
      }
    }
    catch (ex) {}

    return maxIdle;
  },

  setMaxIdlePref: function(minutes) {
    EnigmailPrefs.setPref("maxIdleMinutes", minutes);

    if (EnigmailGpgAgent.isAgentTypeGpgAgent()) {
      try {
        EnigmailGpgAgent.setAgentMaxIdle(minutes);
      }
      catch (ex) {}
    }
  },

  /**
   * Determine the "gpg home dir", i.e. the directory where gpg.conf and the keyring are
   * stored using the "additional parameter" and gpgconf.
   *
   * @return String - directory name, or NULL (in case the command did not succeed)
   */
  getGpgHomeDir: function() {
    console.debug("reaching disabled EnigmailGpgAgent.getGpgHomeDir()");
    return;

    let param = EnigmailPrefs.getPref("agentAdditionalParam");

    if (param) {
      let hd = getHomedirFromParam(param);

      if (hd) return hd;
    }

    if (EnigmailGpgAgent.gpgconfPath === null) return null;

    const command = EnigmailGpgAgent.gpgconfPath;
    let args = ["--list-dirs"];

    let exitCode = -1;
    let outStr = "";
    EnigmailLog.DEBUG("gpgAgent.jsm: getGpgHomeDir: calling subprocess with '" + command.path + "'\n");

    EnigmailLog.CONSOLE("enigmail> " + EnigmailFiles.formatCmdLine(command, args) + "\n");

    const proc = {
      command: command,
      arguments: args,
      environment: EnigmailCore.getEnvList(),
      charset: null,
      stdout: function(data) {
        outStr += data;
      },
      mergeStderr: false
    };

    try {
      exitCode = subprocess.call(proc).wait();
    }
    catch (ex) {
      EnigmailLog.ERROR("gpgAgent.jsm: getGpgHomeDir: subprocess.call failed with '" + ex.toString() + "'\n");
      EnigmailLog.DEBUG("  enigmail> DONE with FAILURE\n");
      throw ex;
    }

    let m = outStr.match(/^(homedir:)(.*)$/mi);
    if (m && m.length > 2) {
      return EnigmailData.convertGpgToUnicode(unescape(m[2]));
    }

    return null;
  },

  /**
   * @param domWindow:     Object - parent window, may be NULL
   * @param esvc:          Object - Enigmail service object
   * @param preferredPath: String - try to use specific path to locate gpg
   */
  setAgentPath: function(domWindow, esvc, preferredPath) {
    console.debug("reaching disabled EnigmailGpgAgent.setAgentPath()");
    return;

    EnigmailLog.DEBUG("gpgAgent.jsm: setAgentPath()\n");
    let agentPath = "";
    try {
      if (preferredPath) {
        agentPath = preferredPath;
      }
      else {
        agentPath = EnigmailPrefs.getPrefBranch().getCharPref("agentPath");
      }
    }
    catch (ex) {}

    var agentType = "gpg";
    var agentName = "";

    EnigmailGpgAgent.resetGpgAgent();

    if (agentPath) {
      // Locate GnuPG executable

      // Append default .exe extension for DOS-Like systems, if needed
      if (EnigmailOS.isDosLike && (agentPath.search(/\.\w+$/) < 0)) {
        agentPath += ".exe";
      }

      try {
        let pathDir = Cc[NS_LOCAL_FILE_CONTRACTID].createInstance(Ci.nsIFile);

        if (!EnigmailFiles.isAbsolutePath(agentPath, EnigmailOS.isDosLike)) {
          // path relative to Mozilla installation dir
          const ds = Cc[DIR_SERV_CONTRACTID].getService();
          const dsprops = ds.QueryInterface(Ci.nsIProperties);
          pathDir = dsprops.get("CurProcD", Ci.nsIFile);

          const dirs = agentPath.split(new RegExp(EnigmailOS.isDosLike ? "\\\\" : "/"));
          for (let i = 0; i < dirs.length; i++) {
            if (dirs[i] != ".") {
              pathDir.append(dirs[i]);
            }
          }
          if (pathDir.exists()) {
            pathDir.normalize();
          }
        }
        else {
          // absolute path
          EnigmailFiles.initPath(pathDir, agentPath);
        }
        if (!(pathDir.isFile() /* && pathDir.isExecutable()*/ )) {
          throw Components.results.NS_ERROR_FAILURE;
        }
        agentPath = pathDir.QueryInterface(Ci.nsIFile);

      }
      catch (ex) {
        esvc.initializationError = EnigmailLocale.getString("gpgNotFound", [agentPath]);
        EnigmailLog.ERROR("gpgAgent.jsm: initialize: Error - " + esvc.initializationError + "\n");
        throw Components.results.NS_ERROR_FAILURE;
      }
    }
    else {
      agentPath = this.resolveGpgPath(esvc.environment);
      if (!agentPath) {
        esvc.initializationError = EnigmailLocale.getString("gpgNotInPath");
        EnigmailLog.ERROR("gpgAgent.jsm: Error - " + esvc.initializationError + "\n");
        throw Components.results.NS_ERROR_FAILURE;
      }
    }

    agentPath.normalize(); // replace a/../b with b
    EnigmailLog.CONSOLE("EnigmailAgentPath=" + EnigmailFiles.getFilePathDesc(agentPath) + "\n\n");

    EnigmailGpgAgent.agentType = agentType;
    EnigmailGpgAgent.agentPath = agentPath;
    getEnigmailGpg().setAgentPath(agentPath);
    EnigmailExecution.agentType = agentType;

    const command = agentPath;
    let args = [];
    if (agentType == "gpg") {
      args = ["--batch", "--no-tty", "--charset", "utf-8", "--display-charset", "utf-8", "--version", "--version"];
    }

    let exitCode = -1;
    let outStr = "";
    let errStr = "";
    EnigmailLog.DEBUG("gpgAgent.jsm: setAgentPath: calling subprocess with '" + command.path + "'\n");

    EnigmailLog.CONSOLE("enigmail> " + EnigmailFiles.formatCmdLine(command, args) + "\n");

    const proc = {
      command: command,
      arguments: args,
      environment: EnigmailCore.getEnvList(),
      charset: null,
      stdout: function(data) {
        outStr += data;
      },
      stderr: function(data) {
        errStr += data;
      },
      mergeStderr: false
    };

    try {
      exitCode = subprocess.call(proc).wait();
    }
    catch (ex) {
      EnigmailLog.ERROR("gpgAgent.jsm: setAgentPath: subprocess.call failed with '" + ex.toString() + "'\n");
      EnigmailLog.DEBUG("  enigmail> DONE with FAILURE\n");
      throw ex;
    }
    EnigmailLog.DEBUG("  enigmail> DONE\n");

    outStr = EnigmailSystem.convertNativeToUnicode(outStr);

    if (exitCode !== 0) {
      EnigmailLog.ERROR("gpgAgent.jsm: setAgentPath: gpg failed with exitCode " + exitCode + " msg='" + outStr + " " + errStr + "'\n");
      throw Components.results.NS_ERROR_FAILURE;
    }

    EnigmailLog.CONSOLE(outStr + "\n");

    // detection for Gpg4Win wrapper
    if (outStr.search(/^gpgwrap.*;/) === 0) {
      const outLines = outStr.split(/[\n\r]+/);
      const firstLine = outLines[0];
      outLines.splice(0, 1);
      outStr = outLines.join("\n");
      agentPath = firstLine.replace(/^.*;[ \t]*/, "");

      EnigmailLog.CONSOLE("gpg4win-gpgwrapper detected; EnigmailAgentPath=" + agentPath + "\n\n");
    }

    const versionParts = outStr.replace(/[\r\n].*/g, "").replace(/ *\(gpg4win.*\)/i, "").split(/ /);
    const gpgVersion = versionParts[versionParts.length - 1];

    EnigmailLog.DEBUG("gpgAgent.jsm: detected GnuPG version '" + gpgVersion + "'\n");
    getEnigmailGpg().agentVersion = gpgVersion;

    if (!getEnigmailGpg().getGpgFeature("version-supported")) {
      if (!domWindow) {
        domWindow = EnigmailWindows.getBestParentWin();
      }
      getDialog().alert(domWindow, EnigmailLocale.getString("oldGpgVersion20", [gpgVersion, getEnigmailGpg().getMinimumGpgVersion()]));
      throw Components.results.NS_ERROR_FAILURE;
    }

    EnigmailGpgAgent.gpgconfPath = EnigmailGpgAgent.resolveToolPath("gpgconf");
    EnigmailGpgAgent.connGpgAgentPath = EnigmailGpgAgent.resolveToolPath("gpg-connect-agent");

    EnigmailGpgAgent.checkGpgHomeDir(domWindow, esvc);

    EnigmailLog.DEBUG("gpgAgent.jsm: setAgentPath: gpgconf found: " + (EnigmailGpgAgent.gpgconfPath ? "yes" : "no") + "\n");
  },


  /**
   * Determine the location of the GnuPG executable
   *
   * @param env: Object: nsIEnvironment to use
   *
   * @return Object: nsIFile pointing to gpg, or NULL
   */
  resolveGpgPath: function(env) {
    console.debug("reaching disabled EnigmailGpgAgent.resolveGpgPath()");
    return;

    EnigmailLog.DEBUG("gpgAgent.jsm: resolveGpgPath()\n");

    let agentName = "";
    if (EnigmailOS.isDosLike) {
      agentName = "gpg2.exe;gpg.exe";
    }
    else {
      agentName = "gpg2;gpg";
    }

    // Resolve relative path using PATH environment variable
    const envPath = env.get("PATH");
    let agentPath = EnigmailFiles.resolvePath(agentName, envPath, EnigmailOS.isDosLike);

    if (!agentPath && EnigmailOS.isDosLike) {
      // DOS-like systems: search for GPG in c:\gnupg, c:\gnupg\bin, d:\gnupg, d:\gnupg\bin
      let gpgPath = "c:\\gnupg;c:\\gnupg\\bin;d:\\gnupg;d:\\gnupg\\bin";
      agentPath = EnigmailFiles.resolvePath(agentName, gpgPath, EnigmailOS.isDosLike);
    }

    if ((!agentPath) && EnigmailOS.isWin32) {
      // Look up in Windows Registry
      const installDir = ["Software\\GNU\\GNUPG", "Software\\GNUPG"];

      try {
        for (let i = 0; i < installDir.length && !agentPath; i++) {
          let gpgPath = EnigmailOS.getWinRegistryString(installDir[i], "Install Directory", nsIWindowsRegKey.ROOT_KEY_LOCAL_MACHINE);

          agentPath = EnigmailFiles.resolvePath(agentName, gpgPath, EnigmailOS.isDosLike());
          if (!agentPath) {
            gpgPath += "\\bin";
            agentPath = EnigmailFiles.resolvePath(agentName, gpgPath, EnigmailOS.isDosLike());
          }
        }
      }
      catch (ex) {}

      if (!agentPath) {
        // try to determine the default PATH from the registry after the installation
        // if we could not get any information from the registry
        try {
          let winPath = EnigmailOS.getWinRegistryString("SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment", "Path", nsIWindowsRegKey.ROOT_KEY_LOCAL_MACHINE);
          agentPath = EnigmailFiles.resolvePath(agentName, winPath, EnigmailOS.isDosLike);
        }
        catch (ex) {}
      }

      if (!agentPath) {
        // default for gpg4win 3.0
        let gpgPath = "C:\\Program Files\\GnuPG\\bin;C:\\Program Files (x86)\\GnuPG\\bin";
        agentPath = EnigmailFiles.resolvePath(agentName, gpgPath, EnigmailOS.isDosLike);
      }
    }

    if (!agentPath && !EnigmailOS.isDosLike) {
      // Unix-like systems: check /usr/bin and /usr/local/bin
      let gpgPath = "/usr/bin:/usr/local/bin";
      agentPath = EnigmailFiles.resolvePath(agentName, gpgPath, EnigmailOS.isDosLike);
    }

    if (!agentPath) {
      return null;
    }

    return agentPath.QueryInterface(Ci.nsIFile);
  },

  // resolve the path for GnuPG helper tools
  resolveToolPath: function(fileName) {
    let filePath = cloneOrNull(EnigmailGpgAgent.agentPath);

    if (filePath) {
      // try to get the install directory of gpg/gpg2 executable
      filePath.normalize();
      filePath = filePath.parent;
    }

    if (filePath) {
      filePath.append(EnigmailFiles.potentialWindowsExecutable(fileName));
      if (filePath.exists()) {
        filePath.normalize();
        return filePath;
      }
    }

    return EnigmailFiles.resolvePathWithEnv(fileName);
  },

  detectGpgAgent: function(domWindow, esvc) {
    EnigmailLog.DEBUG("gpgAgent.jsm: detectGpgAgent\n");

    var gpgAgentInfo = esvc.environment.get("GPG_AGENT_INFO");
    if (gpgAgentInfo && gpgAgentInfo.length > 0) {
      EnigmailLog.DEBUG("gpgAgent.jsm: detectGpgAgent: GPG_AGENT_INFO variable available\n");
      // env. variable suggests running gpg-agent
      EnigmailGpgAgent.gpgAgentInfo.preStarted = true;
      EnigmailGpgAgent.gpgAgentInfo.envStr = gpgAgentInfo;
      EnigmailGpgAgent.gpgAgentIsOptional = false;
    }
    else {
      EnigmailLog.DEBUG("gpgAgent.jsm: detectGpgAgent: no GPG_AGENT_INFO variable set\n");
      EnigmailGpgAgent.gpgAgentInfo.preStarted = false;

      if (!getEnigmailGpg().getGpgFeature("supports-gpg-agent")) {
        esvc.initializationError = EnigmailLocale.getString("gpgAgent.noAutostart", getEnigmailGpg().agentVersion);
        EnigmailLog.ERROR("gpgAgent.jsm: Error - " + esvc.initializationError + "\n");
        throw Components.results.NS_ERROR_FAILURE;
      }

      var command = null;
      var outStr = "";
      var errorStr = "";
      var exitCode = -1;
      EnigmailGpgAgent.gpgAgentIsOptional = false;


      EnigmailGpgAgent.gpgAgentInfo.envStr = DUMMY_AGENT_INFO;
      var envFile = Components.classes[NS_LOCAL_FILE_CONTRACTID].createInstance(Ci.nsIFile);
      EnigmailFiles.initPath(envFile, EnigmailGpgAgent.determineGpgHomeDir(esvc));
      envFile.append("gpg-agent.conf");

      if (!envFile.exists()) {
        EnigmailLog.DEBUG("gpgAgent.jsm: detectGpgAgent: writing gpg-agent.conf file\n");
        let data = "default-cache-ttl " + (EnigmailPassword.getMaxIdleMinutes() * 60) + "\n";
        data += "max-cache-ttl 999999\n";
        try {
          var flags = 0x02 | 0x08 | 0x20;
          var fileOutStream = Cc[NS_LOCALFILEOUTPUTSTREAM_CONTRACTID].createInstance(Ci.nsIFileOutputStream);
          fileOutStream.init(envFile, flags, 384, 0); // 0600
          fileOutStream.write(data, data.length);
          fileOutStream.flush();
          fileOutStream.close();
        }
        catch (ex) {} // ignore file write errors
      }

    }
    EnigmailLog.DEBUG("gpgAgent.jsm: detectGpgAgent: GPG_AGENT_INFO='" + EnigmailGpgAgent.gpgAgentInfo.envStr + "'\n");
  },

  /**
   * Determine the GnuPG home directory based on the same logic as GnuPG, but without involving
   * any external tool.
   *
   * @return String - the path to the gpg home directory
   */
  determineGpgHomeDir: function(esvc) {

    let param = EnigmailPrefs.getPref("agentAdditionalParam");
    if (param) {
      let hd = getHomedirFromParam(param);

      if (hd) return hd;
    }

    let homeDir = esvc.environment.get("GNUPGHOME");

    if (!homeDir && EnigmailOS.isWin32) {
      homeDir = EnigmailOS.getWinRegistryString("Software\\GNU\\GNUPG", "HomeDir", nsIWindowsRegKey.ROOT_KEY_CURRENT_USER);

      if (!homeDir) {
        homeDir = esvc.environment.get("USERPROFILE") || esvc.environment.get("SystemRoot");

        if (homeDir) homeDir += "\\Application Data\\GnuPG";
      }

      if (!homeDir) homeDir = "C:\\gnupg";
    }

    if (!homeDir) homeDir = esvc.environment.get("HOME") + "/.gnupg";

    return homeDir;
  },

  /**
   * Check if the users directory for GnuPG exists and is writeable.
   * Throw exception if directory cannot be created or adjusted.
   */
  checkGpgHomeDir: function(domWindow, esvc) {
    EnigmailLog.DEBUG("gpgAgent.jsm: checkGpgHomeDir:\n");

    let homeDir = EnigmailGpgAgent.getGpgHomeDir();
    if (!homeDir) homeDir = EnigmailGpgAgent.determineGpgHomeDir(esvc);

    EnigmailLog.DEBUG("gpgAgent.jsm: checkGpgHomeDir: got homedir = '" + homeDir + "'\n");

    let homeDirObj = Components.classes[NS_LOCAL_FILE_CONTRACTID].createInstance(Ci.nsIFile);
    EnigmailFiles.initPath(homeDirObj, homeDir);

    if (homeDirObj.exists()) {
      homeDirObj.normalize(); // resolve symlinks etc.
    }

    let dirType = EnigmailFiles.ensureWritableDirectory(homeDirObj, 0x1C0); // 0700
    let errMsg = "";
    switch (dirType) {
      case 1:
        errMsg = "gpghomedir.notexists";
        break;
      case 2:
        errMsg = "gpghomedir.notwritable";
        break;
      case 3:
        errMsg = "gpghomedir.notdirectory";
        break;
    }

    if (errMsg.length > 0) {
      if (!domWindow) {
        domWindow = EnigmailWindows.getBestParentWin();
      }
      getDialog().alert(domWindow, EnigmailLocale.getString(errMsg, homeDir) + "\n\n" + EnigmailLocale.getString("gpghomedir.notusable"));
      throw Components.results.NS_ERROR_FAILURE;
    }
  },

  finalize: function() {
    console.debug("reaching disabled EnigmailGpgAgent.finalize()");
    return;

    if (EnigmailGpgAgent.gpgAgentProcess) {
      EnigmailLog.DEBUG("gpgAgent.jsm: EnigmailGpgAgent.finalize: stopping gpg-agent\n");
      try {
        const proc = {
          command: EnigmailGpgAgent.connGpgAgentPath,
          arguments: ['killagent', '/bye'],
          environment: EnigmailCore.getEnvList()
        };

        subprocess.call(proc).wait();
      }
      catch (ex) {
        EnigmailLog.ERROR("gpgAgent.jsm: EnigmailGpgAgent.finalize ERROR: " + ex + "\n");
      }
    }
  }
};
