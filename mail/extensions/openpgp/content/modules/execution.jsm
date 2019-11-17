/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */


"use strict";

const EXPORTED_SYMBOLS = ["EnigmailExecution"];

const EnigmailData = ChromeUtils.import("chrome://openpgp/content/modules/data.jsm").EnigmailData;
const EnigmailFiles = ChromeUtils.import("chrome://openpgp/content/modules/files.jsm").EnigmailFiles;
const EnigmailLog = ChromeUtils.import("chrome://openpgp/content/modules/log.jsm").EnigmailLog;
const subprocess = ChromeUtils.import("chrome://openpgp/content/modules/subprocess.jsm").subprocess;
const EnigmailErrorHandling = ChromeUtils.import("chrome://openpgp/content/modules/errorHandling.jsm").EnigmailErrorHandling;
const EnigmailCore = ChromeUtils.import("chrome://openpgp/content/modules/core.jsm").EnigmailCore;
const EnigmailLazy = ChromeUtils.import("chrome://openpgp/content/modules/lazy.jsm").EnigmailLazy;
const EnigmailConstants = ChromeUtils.import("chrome://openpgp/content/modules/constants.jsm").EnigmailConstants;

const loadOS = EnigmailLazy.loader("enigmail/os.jsm", "EnigmailOS");

var EnigmailExecution = {
  agentType: "",

  /**
   * execStart Listener Object
   *
   * The listener object must implement at least the following methods:
   *
   *  stdin(pipe)    - OPTIONAL - write data to subprocess stdin via |pipe| hanlde
   *  stdout(data)   - receive |data| from subprocess stdout
   *  stderr(data)   - receive |data| from subprocess stderr
   *  done(exitCode) - receive signal when subprocess has terminated
   */

  /**
   *  start a subprocess (usually gpg) that gets and/or receives data via stdin/stdout/stderr.
   *
   * @param {String/nsIFile}  command: either full path to executable
   *                                    or: object referencing executable
   * @param {Array of Strings}   args: command line parameters for executable
   * @param {Boolean}  needPassphrase: is a passphrase required for the action?
   *                                   (this is currently a no-op)
   * @param {nsIWindow}     domWindow: window on top of which password dialog is shown
   * @param {Object}         listener: Listener to interact with subprocess; see spec. above
   * @param {Object}   statusflagsObj: .value will hold status Flags
   *
   * @return {Object}:         handle to subprocess
   */
  execStart: function(command, args, needPassphrase, domWindow, listener, statusFlagsObj) {
    EnigmailLog.WRITE("execution.jsm: execStart: " +
      "command = " + EnigmailFiles.formatCmdLine(command, args) +
      ", needPassphrase=" + needPassphrase +
      ", domWindow=" + domWindow +
      ", listener=" + listener + "\n");

    listener = listener || {};

    statusFlagsObj.value = 0;

    let proc = null;

    listener.command = command;

    EnigmailLog.CONSOLE("enigmail> " + EnigmailFiles.formatCmdLine(command, args) + "\n");

    try {
      proc = subprocess.call({
        command: command,
        arguments: args,
        environment: EnigmailCore.getEnvList(),
        charset: null,
        bufferedOutput: true,
        stdin: function(pipe) {
          if (listener.stdin) listener.stdin(pipe);
        },
        stdout: function(data) {
          listener.stdout(data);
        },
        stderr: function(data) {
          listener.stderr(data);
        },
        done: function(result) {
          try {
            listener.done(result.exitCode);
          }
          catch (ex) {
            EnigmailLog.writeException("execution.jsm", ex);
          }
        },
        mergeStderr: false
      });
    }
    catch (ex) {
      EnigmailLog.ERROR("execution.jsm: execStart: subprocess.call failed with '" + ex.toString() + "'\n");
      EnigmailLog.DEBUG("  enigmail> DONE with FAILURE\n");
      return null;
    }
    EnigmailLog.DEBUG("  enigmail> DONE\n");

    return proc;
  },

  /*
   requirements for listener object:
   exitCode
   stderrData
   */
  execEnd: function(listener, statusFlagsObj, statusMsgObj, cmdLineObj, errorMsgObj, blockSeparationObj) {
    EnigmailLog.DEBUG("execution.jsm: execEnd:\n");

    cmdLineObj.value = listener.command;

    let exitCode = listener.exitCode;
    const errOutput = listener.stderrData;

    EnigmailLog.DEBUG("execution.jsm: execEnd: exitCode = " + exitCode + "\n");
    EnigmailLog.DEBUG("execution.jsm: execEnd: errOutput = " + errOutput.substr(0, 500) + "\n");

    const retObj = {};
    errorMsgObj.value = EnigmailErrorHandling.parseErrorOutput(errOutput, retObj);
    statusFlagsObj.value = retObj.statusFlags;
    statusMsgObj.value = retObj.statusMsg;
    statusFlagsObj.encryptedFileName = retObj.encryptedFileName;
    if (!blockSeparationObj) blockSeparationObj = {};
    blockSeparationObj.value = retObj.blockSeparation;

    if (errOutput.search(/jpeg image of size \d+/) > -1) {
      statusFlagsObj.value |= EnigmailConstants.PHOTO_AVAILABLE;
    }
    if (blockSeparationObj && blockSeparationObj.value.indexOf(" ") > 0) {
      exitCode = 2;
    }

    EnigmailLog.CONSOLE(EnigmailData.convertFromUnicode(errorMsgObj.value) + "\n");

    return exitCode;
  },

  /**
   * Resolve the path to the command and execute it if available
   * Returns output from simpleExecCmd
   */
  resolveAndSimpleExec: function(command, args, exitCodeObj, errorMsgObj) {
    const resolvedCommand = EnigmailFiles.resolvePathWithEnv(command);
    if (resolvedCommand === null) {
      return null;
    }
    return EnigmailExecution.simpleExecCmd(resolvedCommand, args, exitCodeObj, errorMsgObj);
  },

  /**
   * Execute a command and return the output from stdout
   * No input and no statusFlags are returned.
   */
  simpleExecCmd: function(command, args, exitCodeObj, errorMsgObj) {
    EnigmailLog.WRITE("execution.jsm: EnigmailExecution.simpleExecCmd: command = " + command + " " + args.join(" ") + "\n");

    let outputData = "";
    let errOutput = "";
    errorMsgObj.value = "";
    exitCodeObj.value = -1;

    EnigmailLog.CONSOLE("enigmail> " + EnigmailFiles.formatCmdLine(command, args) + "\n");

    try {
      subprocess.call({
        command: command,
        arguments: args,
        charset: null,
        environment: EnigmailCore.getEnvList(),
        done: function(result) {
          exitCodeObj.value = result.exitCode;
          outputData = result.stdout;
          errOutput = result.stderr;
        },
        mergeStderr: false
      }).wait();
    }
    catch (ex) {
      EnigmailLog.ERROR("execution.jsm: EnigmailExecution.simpleExecCmd: " + command.path + " failed\n");
      EnigmailLog.DEBUG("  enigmail> DONE with FAILURE\n");
      exitCodeObj.value = -1;
    }
    EnigmailLog.DEBUG("  enigmail> DONE\n");

    if (errOutput) {
      errorMsgObj.value = errOutput;
    }

    EnigmailLog.DEBUG("execution.jsm: EnigmailExecution.simpleExecCmd: exitCode = " + exitCodeObj.value + "\n");
    EnigmailLog.DEBUG("execution.jsm: EnigmailExecution.simpleExecCmd: errOutput = " + errOutput.substr(0, 500) + "\n");

    return outputData;
  },

  /**
   * Execute a command and return the output from stdout.
   * Accepts input and returns error message and statusFlags.
   */
  execCmd: function(command, args, input, exitCodeObj, statusFlagsObj, statusMsgObj,
    errorMsgObj, retStatusObj) {
    EnigmailLog.WRITE("execution.jsm: EnigmailExecution.execCmd: subprocess = '" + command.path + "'\n");

    if ((typeof input) != "string") input = "";

    let preInput = "";
    let outputData = "";
    let errOutput = "";
    EnigmailLog.CONSOLE("enigmail> " + EnigmailFiles.formatCmdLine(command, args) + "\n");

    const procBuilder = new EnigmailExecution.processBuilder();
    procBuilder.setCommand(command);
    procBuilder.setArguments(args);
    procBuilder.setEnvironment(EnigmailCore.getEnvList());
    procBuilder.setStdin(
      function(pipe) {
        if (input.length > 0 || preInput.length > 0) {
          pipe.write(preInput + input);
        }
        pipe.close();
      }
    );
    procBuilder.setStdout(
      function(data) {
        outputData += data;
      }
    );
    procBuilder.setStderr(
      function(data) {
        errOutput += data;
      }
    );
    procBuilder.setDone(
      function(result) {
        exitCodeObj.value = result.exitCode;
      }
    );

    const proc = procBuilder.build();
    try {
      subprocess.call(proc).wait();
    }
    catch (ex) {
      EnigmailLog.ERROR("execution.jsm: EnigmailExecution.execCmd: subprocess.call failed with '" + ex.toString() + "'\n");
      EnigmailLog.DEBUG("  enigmail> DONE with FAILURE\n");
      exitCodeObj.value = -1;
    }
    EnigmailLog.DEBUG("  enigmail> DONE\n");

    if (proc.resultData) outputData = proc.resultData;
    if (proc.errorData) errOutput = proc.errorData;

    EnigmailLog.DEBUG("execution.jsm: EnigmailExecution.execCmd: exitCode = " + exitCodeObj.value + "\n");
    EnigmailLog.DEBUG("execution.jsm: EnigmailExecution.execCmd: errOutput = " + errOutput.substr(0, 500) + "\n");


    if (!retStatusObj) {
      retStatusObj = {};
    }

    errorMsgObj.value = EnigmailErrorHandling.parseErrorOutput(errOutput, retStatusObj);

    statusFlagsObj.value = retStatusObj.statusFlags;
    statusMsgObj.value = retStatusObj.statusMsg;
    const blockSeparation = retStatusObj.blockSeparation;

    exitCodeObj.value = EnigmailExecution.fixExitCode(exitCodeObj.value, statusFlagsObj);

    if (blockSeparation.indexOf(" ") > 0) {
      exitCodeObj.value = 2;
    }

    EnigmailLog.CONSOLE(errorMsgObj.value + "\n");

    return outputData;
  },

  /**
   * Execute a command and asynchronously, and return a Promise
   * Accepts input and returns error message and statusFlags.
   *
   * @param {String/nsIFile}  command: either full path to executable
   *                                    or: object referencing executable
   * @param {Array of Strings}   args: command line parameters for executable
   * @param {String}            input: data to pass to subprocess via stdin
   * @param {Object} subprocessHandle: handle to subprocess. The subprocess may be
   *                        killed via subprocessHandle.value.killProcess();
   *
   * @return {Promise<Object>}: Object with:
   *        - {Number} exitCode
   *        - {String} stdoutData  - unmodified data from stdout
   *        - {String} stderrData  - unmodified data from stderr
   *        - {String} errorMsg    - error message from parseErrorOutput()
   *        - {Number} statusFlags
   *        - {String} statusMsg   - pre-processed status messages (without [GNUPG:])
   *        - blockSeparation
   *        - isKilled: 0
   */

  execAsync: function(command, args, input, subprocessHandle = null) {
    EnigmailLog.WRITE("execution.jsm: execAsync: command = '" + command.path + "'\n");
    return new Promise((resolve, reject) => {

      if ((typeof input) != "string") input = "";

      let outputData = "";
      let errOutput = "";
      let returnObj = {
        exitCode: -1,
        stdoutData: "",
        stderrData: "",
        errorMsg: "",
        statusFlags: 0,
        statusMsg: "",
        blockSeparation: "",
        isKilled: 0
      };

      EnigmailLog.CONSOLE("enigmail> " + EnigmailFiles.formatCmdLine(command, args) + "\n");
      EnigmailLog.CONSOLE(input + "\n");

      const procBuilder = new EnigmailExecution.processBuilder();
      procBuilder.setCommand(command);
      procBuilder.setArguments(args);
      procBuilder.setEnvironment(EnigmailCore.getEnvList());
      procBuilder.setStdin(
        function(pipe) {
          if (input.length > 0) {
            pipe.write(input);
          }
          pipe.close();
        }
      );
      procBuilder.setStdout(
        function(data) {
          outputData += data;
        }
      );
      procBuilder.setStderr(
        function(data) {
          errOutput += data;
        }
      );

      procBuilder.setDone(
        function(result) {
          let exitCode = result.exitCode;
          EnigmailLog.DEBUG("  enigmail> DONE\n");
          EnigmailLog.DEBUG("execution.jsm: execAsync: exitCode = " + exitCode + "\n");
          EnigmailLog.DEBUG("execution.jsm: execAsync: errOutput = " + errOutput.substr(0, 500) + "\n");

          let retStatusObj = {};
          let errorMsg = EnigmailErrorHandling.parseErrorOutput(errOutput, retStatusObj);

          let statusFlagsObj = {
            value: retStatusObj.statusFlags
          };

          exitCode = EnigmailExecution.fixExitCode(exitCode, statusFlagsObj);

          if (retStatusObj.blockSeparation.indexOf(" ") > 0) {
            exitCode = 2;
          }

          EnigmailLog.CONSOLE(errorMsg + "\n");
          returnObj.exitCode = exitCode;
          returnObj.stdoutData = outputData;
          returnObj.stderrData = errOutput;
          returnObj.errorMsg = errorMsg;
          returnObj.statusFlags = statusFlagsObj.value;
          returnObj.statusMsg = retStatusObj.statusMsg;
          returnObj.blockSeparation = retStatusObj.blockSeparation;

          resolve(returnObj);
        }
      );
      const proc = procBuilder.build();
      try {
        let p = subprocess.call(proc);
        if (subprocessHandle) {
          p.killProcess = function(hardKill) {
            returnObj.isKilled = 1;
            this.kill(hardKill);
          };
          subprocessHandle.value = p;
        }
      }
      catch (ex) {
        EnigmailLog.ERROR("execution.jsm: execAsync: subprocess.call failed with '" + ex.toString() + "'\n");
        EnigmailLog.DEBUG("  enigmail> DONE with FAILURE\n");
        reject(returnObj);
      }
    });
  },

  /**
   * Fix the exit code of GnuPG (which may be wrong in some circumstances)
   *
   * @exitCode:       Number - the exitCode obtained from GnuPG
   * @statusFlagsObj: Object - the statusFlagsObj as received from parseErrorOutput()
   *
   * @return: Number - fixed exit code
   */
  fixExitCode: function(exitCode, statusFlagsObj) {
    EnigmailLog.DEBUG("execution.jsm: EnigmailExecution.fixExitCode: agentType: " + EnigmailExecution.agentType + " exitCode: " + exitCode + " statusFlags " + statusFlagsObj.statusFlags + "\n");

    const statusFlags = statusFlagsObj.statusFlags;

    if (exitCode !== 0) {
      if ((statusFlags & (EnigmailConstants.BAD_PASSPHRASE | EnigmailConstants.UNVERIFIED_SIGNATURE)) &&
        (statusFlags & EnigmailConstants.DECRYPTION_OKAY)) {
        EnigmailLog.DEBUG("enigmailCommon.jsm: Enigmail.fixExitCode: Changing exitCode for decrypted msg " + exitCode + "->0\n");
        exitCode = 0;
      }
      if ((EnigmailExecution.agentType === "gpg") && (exitCode == 256) && (loadOS().getOS() == "WINNT")) {
        EnigmailLog.WARNING("enigmailCommon.jsm: Enigmail.fixExitCode: Using gpg and exit code is 256. You seem to use cygwin-gpg, activating countermeasures.\n");
        if (statusFlags & (EnigmailConstants.BAD_PASSPHRASE | EnigmailConstants.UNVERIFIED_SIGNATURE)) {
          EnigmailLog.WARNING("enigmailCommon.jsm: Enigmail.fixExitCode: Changing exitCode 256->2\n");
          exitCode = 2;
        }
        else {
          EnigmailLog.WARNING("enigmailCommon.jsm: Enigmail.fixExitCode: Changing exitCode 256->0\n");
          exitCode = 0;
        }
      }
    }
    else {
      if (statusFlags & (EnigmailConstants.INVALID_RECIPIENT | EnigmailConstants.DECRYPTION_FAILED | EnigmailConstants.BAD_ARMOR |
          EnigmailConstants.MISSING_PASSPHRASE | EnigmailConstants.BAD_PASSPHRASE)) {
        exitCode = 1;
      }
      else if (typeof(statusFlagsObj.extendedStatus) === "string" && statusFlagsObj.extendedStatus.search(/\bdisp:/) >= 0) {
        exitCode = 1;
      }
    }

    return exitCode;
  },

  processBuilder: function() {
    this.process = {};
    this.setCommand = function(command) {
      this.process.command = command;
    };
    this.setArguments = function(args) {
      this.process.arguments = args;
    };
    this.setEnvironment = function(envList) {
      this.process.environment = envList;
    };
    this.setStdin = function(stdin) {
      this.process.stdin = stdin;
    };
    this.setStdout = function(stdout) {
      this.process.stdout = stdout;
    };
    this.setStderr = function(stderr) {
      this.process.stderr = stderr;
    };
    this.setDone = function(done) {
      this.process.done = done;
    };
    this.build = function() {
      this.process.charset = null;
      this.process.mergeStderr = false;
      this.process.resultData = "";
      this.process.errorData = "";
      this.process.exitCode = -1;
      return this.process;
    };
    return this;
  },

  execCmd2: function(command, args, stdinFunc, stdoutFunc, doneFunc) {
    EnigmailLog.CONSOLE("enigmail> " + EnigmailFiles.formatCmdLine(command, args) + "\n");
    const procBuilder = new EnigmailExecution.processBuilder();
    procBuilder.setCommand(command);
    procBuilder.setArguments(args);
    procBuilder.setEnvironment(EnigmailCore.getEnvList());
    procBuilder.setStdin(stdinFunc);
    procBuilder.setStdout(stdoutFunc);
    procBuilder.setDone(doneFunc);
    const proc = procBuilder.build();
    subprocess.call(proc).wait();
  },


  /**
   * simple listener for using with execStart
   *
   * stdinFunc: optional function to write to stdin
   * doneFunc : optional function that is called when the process is terminated
   */
  newSimpleListener: function(stdinFunc, doneFunc) {
    const simpleListener = {
      stdoutData: "",
      stderrData: "",
      exitCode: -1,
      stdin: function(pipe) {
        if (stdinFunc) {
          stdinFunc(pipe);
        }
        else {
          pipe.close();
        }
      },
      stdout: function(data) {
        simpleListener.stdoutData += data;
      },
      stderr: function(data) {
        simpleListener.stderrData += data;
      },
      done: function(exitCode) {
        simpleListener.exitCode = exitCode;
        if (doneFunc) {
          doneFunc(exitCode);
        }
      }
    };

    return simpleListener;
  }
};
