/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/*
 * Import into a JS component using
 * 'ChromeUtils.import("chrome://openpgp/content/modules/subprocess.jsm");'
 *
 * This object allows to start a process, and read/write data to/from it
 * using stdin/stdout/stderr streams.
 * Usage example:
 *
 *  var p = subprocess.call({
 *    command:     '/bin/foo',
 *    arguments:   ['-v', 'foo'],
 *    environment: [ "XYZ=abc", "MYVAR=def" ],
 *    //stdin: "some value to write to stdin\nfoobar",
 *    stdin: function(stdin) {
 *      stdin.write("some value to write to stdin\nfoobar");
 *      stdin.close();
 *    },
 *    stdout: function(data) {
 *      dump("got data on stdout:" + data + "\n");
 *    },
 *    stderr: function(data) {
 *      dump("got data on stderr:" + data + "\n");
 *    },
 *    done: function(result) {
 *      dump("process terminated with " + result.exitCode + "\n");
 *    },
 *    mergeStderr: false
 *  });
 *  p.wait(); // wait for the subprocess to terminate
 *            // this will block the main thread,
 *            // only do if you can wait that long
 *
 *
 * Description of parameters:
 * --------------------------
 * Apart from <command>, all arguments are optional.
 *
 * command:     either a |nsIFile| object pointing to an executable file or a
 *              String containing the platform-dependent path to an executable
 *              file.
 *
 * arguments:   optional string array containing the arguments to the command.
 *
 * environment: optional string array containing environment variables to pass
 *              to the command. The array elements must have the form
 *              "VAR=data". Please note that if environment is defined, it
 *              replaces any existing environment variables for the subprocess.
 *
 * stdin:       optional input data for the process to be passed on standard
 *              input. stdin can either be a string or a function.
 *              A |string| gets written to stdin and stdin gets closed;
 *              A |function| gets passed an object with write and close function.
 *              Please note that the write() function will return almost immediately;
 *              data is always written asynchronously on a separate thread.
 *
 * stdout:      an optional function that can receive output data from the
 *              process. The stdout-function is called asynchronously; it can be
 *              called mutliple times during the execution of a process.
 *              At a minimum at each occurance of \n or \r.
 *              Please note that null-characters might need to be escaped
 *              with something like 'data.replace(/\0/g, "\\0");'.
 *
 * stderr:      an optional function that can receive stderr data from the
 *              process. The stderr-function is called asynchronously; it can be
 *              called mutliple times during the execution of a process. Please
 *              note that null-characters might need to be escaped with
 *              something like 'data.replace(/\0/g, "\\0");'.
 *              (on windows it only gets called once right now)
 *
 *
 * done:        optional function that is called when the process has terminated.
 *              The exit code from the process available via result.exitCode. If
 *              stdout is not defined, then the output from stdout is available
 *              via result.stdout. stderr data is in result.stderr
 *              done() is guaranteed to be called before .wait() finishes
 *
 * mergeStderr: optional boolean value. If true, stderr is merged with stdout;
 *              no data will be provided to stderr. Default is false.
 *
 *
 * Description of object returned by subprocess.call(...)
 * ------------------------------------------------------
 * The object returned by subprocess.call offers a few methods that can be
 * executed:
 *
 * wait():         waits for the subprocess to terminate. It is not required to use
 *                 wait; done will be called in any case when the subprocess terminated.
 *
 * kill(hardKill): kill the subprocess. Any open pipes will be closed and
 *                 done will be called.
 *                 hardKill [ignored on Windows]:
 *                  - false: signal the process terminate (SIGTERM)
 *                  - true:  kill the process (SIGKILL)
 *
 *
 * Other methods in subprocess
 * ---------------------------
 *
 * registerDebugHandler(functionRef):   register a handler that is called to get
 *                                      debugging information
 * registerLogHandler(functionRef):     register a handler that is called to get error
 *                                      messages
 *
 * example:
 *    subprocess.registerLogHandler( function(s) { dump(s); } );
 */

'use strict';

const SubprocessMain = ChromeUtils.import("chrome://openpgp/content/modules/enigmailprocess_main.jsm").SubprocessMain;
const Services = ChromeUtils.import("resource://gre/modules/Services.jsm").Services;

var EXPORTED_SYMBOLS = ["subprocess"];

const DEFAULT_ENVIRONMENT = [];

var gDebugFunction = null;
var gErrorFunction = null;
var gRunningProcesses = []; // Array with all running subprocesses

function write(pipe, data) {
  let buffer = new Uint8Array(Array.from(data, c => c.charCodeAt(0)));
  return pipe.write(buffer);
}

function arrayBufferToString(buffer) {
  const MAXLEN = 102400;

  let uArr = new Uint8Array(buffer);
  let ret = "";
  let len = buffer.byteLength;

  for (let j = 0; j < Math.floor(len / MAXLEN) + 1; j++) {
    ret += String.fromCharCode.apply(null, uArr.subarray(j * MAXLEN, ((j + 1) * MAXLEN)));
  }

  return ret;
}

async function read(pipe) {
  let buffer = await pipe.read();

  try {
    if (buffer.byteLength > 0) {
      return arrayBufferToString(buffer);
    }
  } catch (ex) {
    DEBUG_LOG("err: " + ex.toString());
  }
  return "";
}


var readAllData = async function(pipe, read, callback) {
  /* eslint no-cond-assign: 0 */
  let string;
  while (string = await read(pipe)) {
    callback(string);
  }
};


function removeProcRef(proc) {
  if (proc) {
    let i = gRunningProcesses.indexOf(proc);
    if (i >= 0) {
      gRunningProcesses.splice(i, 1);
    }
  }
}

var subprocess = {
  registerLogHandler: function(func) {
    gErrorFunction = func;
  },

  registerDebugHandler: function(func) {
    gDebugFunction = func;
  },

  call: function(options) {

    let resolved = null;
    let promises = [];
    let inputPromises = [];
    let stdinClosed = false;
    let stdoutData = "";
    let stderrData = "";

    let formattedStack = Components.stack.formattedStack;

    function writePipe(pipe, value) {
      let p = write(pipe, value);
      promises.push(p);
      inputPromises.push(p);
    }

    function subProcessThen(proc) {
      gRunningProcesses.push(proc);

      if (typeof options.stdin === "function") {
        // Some callers (e.g. child_process.js) depend on this
        // being called synchronously.
        options.stdin({
          write(val) {
            writePipe(proc.stdin, val);
          },

          close() {
            Promise.all(inputPromises).then(() => {
              if (!stdinClosed) {
                stdinClosed = true;
                proc.stdin.close();
              }
            });
          }
        });

      } else {
        if (typeof options.stdin === "string") {
          DEBUG_LOG("write Stdin");
          writePipe(proc.stdin, options.stdin);
        }

        Promise.all(inputPromises).then(() => {
          proc.stdin.close();
        });
      }


      promises.push(
        readAllData(proc.stdout, read, data => {
          DEBUG_LOG("Got Stdout: " + data.length + "\n");
          if (typeof options.stdout === "function") {
            try {
              options.stdout(data);
            } catch (ex) {}
          } else
            stdoutData += data;
        }));

      if (!options.mergeStderr) {
        promises.push(
          readAllData(proc.stderr, read, data => {
            DEBUG_LOG("Got Stderr: " + data.length + "\n");
            if (typeof options.stderr === "function") {
              try {
                options.stderr(data);
              } catch (ex) {}
            } else
              stderrData += data;

          }));
      }

      Promise.all(promises)
        .then(() => proc.wait())
        .then(result => {
          DEBUG_LOG("Complete: " + result.exitCode + "\n");
          removeProcRef(proc);
          if (gRunningProcesses.indexOf(proc) >= 0) {

          }
          if (result.exitCode === null) result.exitCode = -1;
          resolved = result.exitCode;
          if (typeof options.done === "function") {
            try {
              options.done({
                exitCode: result.exitCode,
                stdout: stdoutData,
                stderr: stderrData
              });
            } catch (ex) {}
          }
        })
        .catch(error => {
          resolved = -1;
          let errStr = "";
          if (typeof error === "string") {
            errStr = error;
          } else if (error) {
            for (let i in error) {
              errStr += "\n" + i + ": " + error[i];
            }
          }

          ERROR_LOG(errStr);
          throw ("subprocess.jsm: caught error: " + errStr);
        });

    }

    let opts = {};
    if (options.mergeStderr) {
      opts.stderr = "stdout";
    } else {
      opts.stderr = "pipe";
    }

    if (options.command instanceof Ci.nsIFile) {
      opts.command = options.command.path;
    } else {
      opts.command = options.command;
    }

    if (options.workdir) {
      opts.workdir = options.workdir;
    }

    opts.arguments = options.arguments || [];


    // Set up environment

    let envVars = options.environment || DEFAULT_ENVIRONMENT;
    if (envVars.length) {
      let environment = {};
      for (let val of envVars) {
        let idx = val.indexOf("=");
        if (idx >= 0)
          environment[val.slice(0, idx)] = val.slice(idx + 1);
      }

      opts.environment = environment;
    }

    let subproc = SubprocessMain.call(opts).then(subProcessThen).catch(
      error => {
        resolved = -1;
        let errStr = formattedStack;
        throw ("subprocess.jsm: launch error: " + errStr + 'error: ' +
          error + "\n" + JSON.stringify(error));
      }
    );

    return {
      wait: function() {
        let mainThread = Services.tm.mainThread;
        try {
          while (resolved === null) {
            mainThread.processNextEvent(true);
          }
        } catch(ex) {
          console.log(ex);
        }

        return resolved;
      },

      kill: function(hard = false) {
        subproc.then(proc => {
          proc.kill(hard ? 0 : undefined);
          removeProcRef();
        });
      }
    };
  },


  /**
   * on shutdown kill all still running child processes
   */
  onShutdown: function() {
    // create a copy of the array because gRunningProcesses will
    // get altered during kill()
    let procs = gRunningProcesses.map(x => x);

    for (let i = 0; i < procs.length; i++) {
      if (procs[i] && ("kill" in procs[i])) {
        procs[i].kill(true);
      }
    }
  }
};

function DEBUG_LOG(str) {
  if (gDebugFunction) {
    gDebugFunction("subprocess.jsm: " + str + "\n");
  }
}

function ERROR_LOG(str) {
  if (gErrorFunction) {
    gErrorFunction("subprocess.jsm: " + str + "\n");
  }
}
