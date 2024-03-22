/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* globals scriptError, imIDebugMessage, module */

const _loggers = {};

/*
 * Implement a custom logger to to hook the Matrix logging up to the chat
 * logging framework.
 *
 * This unfortunately does not enable account specific logging.
 */
function getLogger(loggerName) {
  const moduleName = "prpl-matrix." + loggerName;

  let logger = _loggers[moduleName];

  // If the logger was previously created, return it.
  if (logger) {
    return logger;
  }

  // Otherwise, build a new logger.
  logger = {};
  logger.trace = scriptError.bind(
    logger,
    moduleName,
    imIDebugMessage.LEVEL_DEBUG
  );
  logger.debug = scriptError.bind(
    logger,
    moduleName,
    imIDebugMessage.LEVEL_DEBUG
  );
  logger.log = scriptError.bind(
    logger,
    moduleName,
    imIDebugMessage.LEVEL_DEBUG
  );
  logger.info = scriptError.bind(logger, moduleName, imIDebugMessage.LEVEL_LOG);
  logger.warn = scriptError.bind(
    logger,
    moduleName,
    imIDebugMessage.LEVEL_WARNING
  );
  logger.error = scriptError.bind(
    logger,
    moduleName,
    imIDebugMessage.LEVEL_ERROR
  );

  // This is a no-op since log levels are configured via preferences.
  logger.setLevel = function () {};

  _loggers[moduleName] = logger;

  return logger;
}

module.exports = {
  getLogger,
  levels: {
    TRACE: imIDebugMessage.LEVEL_DEBUG,
    DEBUG: imIDebugMessage.LEVEL_DEBUG,
    INFO: imIDebugMessage.LEVEL_LOG,
    WARN: imIDebugMessage.LEVEL_WARNING,
    ERROR: imIDebugMessage.LEVEL_ERROR,
  },
};
