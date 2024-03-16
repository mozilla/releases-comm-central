/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { CalStorageModelBase } from "resource:///modules/calendar/CalStorageModelBase.sys.mjs";

/**
 * CalStorageOfflineModel provides methods for manipulating the offline flags
 * of items.
 */
export class CalStorageOfflineModel extends CalStorageModelBase {
  /**
   * Returns the offline_journal column value for an item.
   *
   * @param {calIItemBase} item
   *
   * @returns {number}
   */
  async getItemOfflineFlag(item) {
    let flag = null;
    const query = item.isEvent() ? this.statements.mSelectEvent : this.statements.mSelectTodo;
    this.db.prepareStatement(query);
    query.params.id = item.id;
    await this.db.executeAsync(query, row => {
      flag = row.getResultByName("offline_journal") || null;
    });
    return flag;
  }

  /**
   * Sets the offline_journal column value for an item.
   *
   * @param {calIItemBase} item
   * @param {number} flag
   */
  async setOfflineJournalFlag(item, flag) {
    const id = item.id;
    const query = item.isEvent()
      ? this.statements.mEditEventOfflineFlag
      : this.statements.mEditTodoOfflineFlag;
    this.db.prepareStatement(query);
    query.params.id = id;
    query.params.offline_journal = flag || null;
    try {
      await this.db.executeAsync(query);
    } catch (e) {
      this.db.logError("Error setting offline journal flag for " + item.title, e);
    }
  }
}
