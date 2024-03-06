/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//TODO try to preserve original callsite in logs.

/**
 * Implementation of the Logger class from the matrix-js-sdk that logs using the
 * IM account's logger.
 */
export class Logger {
  /**
   *
   * @type {?MatrixAccount}
   */
  #account = null;

  /**
   * Namespace for log messages.
   *
   * @type {string}
   */
  #namespace = "";

  /**
   *
   * @param {MatrixAccount} account - The matrix account this logger should log
   *   to.
   * @param {string} [namespace = ""] - The namespace of this logger.
   */
  constructor(account, namespace = "") {
    this.#account = account;
    this.#namespace = namespace;
  }

  /**
   *
   * @param {any[]]} msg - Array of parameters passed into the logging function.
   * @returns {string} String to log, including the namespace of this logger.
   */
  #formatMessage(msg) {
    return `${this.#namespace}: ${msg.join(" ")}`;
  }

  trace(...msg) {
    this.#account.DEBUG(this.#formatMessage(msg));
  }

  debug(...msg) {
    this.#account.DEBUG(this.#formatMessage(msg));
  }

  info(...msg) {
    this.#account.LOG(this.#formatMessage(msg));
  }

  warn(...msg) {
    this.#account.WARN(this.#formatMessage(msg));
  }

  error(...msg) {
    let error = undefined;
    // If the last parameter is an object, assume it's an error and log it as
    // such.
    if (typeof msg.at(-1) === "object") {
      error = msg.at(-1);
      msg.pop();
    }
    this.#account.ERROR(this.#formatMessage(msg), error);
  }

  getChild(namespace) {
    return new Logger(
      this.#account,
      this.#namespace ? `${this.#namespace}:${namespace}` : namespace
    );
  }
}
