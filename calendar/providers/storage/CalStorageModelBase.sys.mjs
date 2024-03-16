/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * CalStorageModelBase is the parent class for the storage calendar models.
 * The idea here is to leave most of the adjustments and integrity checks to
 * CalStorageCalendar (or other classes) while focusing mostly on
 * retrieval/persistence in the children of this class.
 */
export class CalStorageModelBase {
  /**
   * @type {CalStorageDatabase}
   */
  db = null;

  /**
   * @type {CalStorageStatements}
   */
  statements = null;

  /**
   * @type {calICalendar}
   */
  calendar = null;

  /**
   * @param {CalStorageDatabase} db
   * @param {CalStorageStatements} statements
   * @param {calICalendar} calendar
   *
   * @throws - If unable to initialize SQL statements.
   */
  constructor(db, statements, calendar) {
    this.db = db;
    this.statements = statements;
    this.calendar = calendar;
  }

  /**
   * Delete all data stored for the calendar this model's database connection
   * is associated with.
   */
  async deleteCalendar() {
    const stmts = [];
    if (this.statements.mDeleteEventExtras) {
      for (const stmt of this.statements.mDeleteEventExtras) {
        stmts.push(this.db.prepareStatement(stmt));
      }
    }

    if (this.statements.mDeleteTodoExtras) {
      for (const stmt of this.statements.mDeleteTodoExtras) {
        stmts.push(this.db.prepareStatement(stmt));
      }
    }

    stmts.push(this.db.prepareStatement(this.statements.mDeleteAllEvents));
    stmts.push(this.db.prepareStatement(this.statements.mDeleteAllTodos));
    stmts.push(this.db.prepareStatement(this.statements.mDeleteAllMetaData));
    await this.db.executeAsync(stmts);
  }
}
