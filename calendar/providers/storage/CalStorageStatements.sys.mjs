/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const cICL = Ci.calIChangeLog;

/**
 * CalStorageStatements contains the mozIStorageBaseStatements used by the
 * various storage calendar models. Remember to call the finalize() method when
 * shutting down the db.
 */
export class CalStorageStatements {
  /**
   * @type {mozIStorageAsyncStatement}
   */
  mSelectEvent = null;

  /**
   * @type {mozIStorageAsyncStatement}
   */
  mSelectTodo = null;

  /**
   * @type {mozIStorageAsyncStatement} mSelectNonRecurringEventsByRange
   */
  mSelectNonRecurringEventsByRange = null;

  /**
   * @type {mozIStorageAsyncStatement} mSelectNonRecurringTodosByRange
   */
  mSelectNonRecurringTodosByRange = null;

  /**
   * @type {mozIStorageAsyncStatement}
   */
  mSelectAttendeesForItem = null;

  /**
   * @type {mozIStorageAsyncStatement}
   */
  mSelectAttendeesForItemWithRecurrenceId = null;

  /**
   * @type {mozIStorageAsyncStatement}
   */
  mSelectAllAttendees = null;

  /**
   * @type {mozIStorageAsyncStatement}
   */
  mSelectPropertiesForItem = null;

  /**
   * @type {mozIStorageAsyncStatement}
   */
  mSelectPropertiesForItemWithRecurrenceId = null;

  /**
   * @type {mozIStorageAsyncStatement}
   */
  mSelectAllProperties = null;

  /**
   * @type {mozIStorageAsyncStatement}
   */
  mSelectParametersForItem = null;

  /**
   * @type {mozIStorageAsyncStatement}
   */
  mSelectParametersForItemWithRecurrenceId = null;

  /**
   * @type {mozIStorageAsyncStatement}
   */
  mSelectAllParameters = null;

  /**
   * @type {mozIStorageAsyncStatement}
   */
  mSelectRecurrenceForItem = null;

  /**
   * @type {mozIStorageAsyncStatement}
   */
  mSelectAllRecurrences = null;

  /**
   * @type {mozIStorageAsyncStatement}
   */
  mSelectEventsWithRecurrence = null;

  /**
   * @type {mozIStorageAsyncStatement}
   */
  mSelectTodosWithRecurrence = null;

  /**
   * @type {mozIStorageAsyncStatement}
   */
  mSelectEventExceptions = null;

  /**
   * @type {mozIStorageAsyncStatement}
   */
  mSelectAllEventExceptions = null;

  /**
   * @type {mozIStorageAsyncStatement}
   */
  mSelectTodoExceptions = null;

  /**
   * @type {mozIStorageAsyncStatement}
   */
  mSelectAllTodoExceptions = null;

  /**
   * @type {mozIStorageStatement}
   */
  mSelectMetaData = null;

  /**
   * @type {mozIStorageStatement}
   */
  mSelectAllMetaData = null;

  /**
   * @type {mozIStorageAsyncStatement}
   */
  mSelectRelationsForItemWithRecurrenceId = null;

  /**
   * @type {mozIStorageAsyncStatement}
   */
  mSelectAllRelations = null;

  /**
   * @type {mozIStorageAsyncStatement}
   */
  mSelectRelationsForItem = null;

  /**
   * @type {mozIStorageAsyncStatement}
   */
  mSelectAlarmsForItem = null;

  /**
   * @type {mozIStorageAsyncStatement}
   */
  mSelectAlarmsForItemWithRecurrenceId = null;

  /**
   * @type {mozIStorageAsyncStatement}
   */
  mSelectAllAlarms = null;

  /**
   * @type {mozIStorageAsyncStatement}
   */
  mSelectAttachmentsForItem = null;

  /**
   * @type {mozIStorageAsyncStatement}
   */
  mSelectAttachmentsForItemWithRecurrenceId = null;

  /**
   * @type {mozIStorageAsyncStatement}
   */
  mSelectAllAttachments = null;

  /**
   * @type {mozIStorageAsyncStatement}
   */
  mInsertEvent = null;

  /**
   * @type {mozIStorageAsyncStatement}
   */
  mInsertTodo = null;

  /**
   * @type {mozIStorageAsyncStatement}
   */
  mInsertProperty = null;

  /**
   * @type {mozIStorageAsyncStatement}
   */
  mInsertParameter = null;

  /**
   * @type {mozIStorageAsyncStatement}
   */
  mInsertAttendee = null;

  /**
   * @type {mozIStorageAsyncStatement}
   */
  mInsertRecurrence = null;

  /**
   * @type {mozIStorageAsyncStatement}
   */
  mInsertAttachment = null;

  /**
   * @type {mozIStorageAsyncStatement}
   */
  mInsertRelation = null;

  /**
   * @type {mozIStorageStatement}
   */
  mInsertMetaData = null;

  /**
   * @type {mozIStorageAsyncStatement}
   */
  mInsertAlarm = null;

  /**
   * @type {mozIStorageAsyncStatement}
   */
  mEditEventOfflineFlag = null;

  /**
   * @type {mozIStorageAsyncStatement}
   */
  mEditTodoOfflineFlag = null;

  /**
   * @type {mozIStorageAsyncStatement}
   */
  mDeleteEvent = null;

  /**
   * @type {mozIStorageAsyncStatement}
   */
  mDeleteTodo = null;

  /**
   * @type {mozIStorageAsyncStatement}
   */
  mDeleteAttendees = null;

  /**
   * @type {mozIStorageAsyncStatement}
   */
  mDeleteProperties = null;

  /**
   * @type {mozIStorageAsyncStatement}
   */
  mDeleteParameters = null;
  /**
   * @type {mozIStorageAsyncStatement}
   */
  mDeleteRecurrence = null;

  /**
   * @type {mozIStorageAsyncStatement}
   */
  mDeleteAttachments = null;

  /**
   * @type {mozIStorageAsyncStatement}
   */
  mDeleteRelations = null;

  /**
   * @type {mozIStorageStatement}
   */
  mDeleteMetaData = null;

  /**
   * @type {mozIStorageAsyncStatement}
   */
  mDeleteAlarms = null;

  /**
   * @type {mozIStorageAsyncStatement[]}
   */
  mDeleteEventExtras = [];

  /**
   * @type {mozIStorageAsyncStatement[]}
   */
  mDeleteTodoExtras = [];

  /**
   * @type {mozIStorageAsyncStatement}
   */
  mDeleteAllEvents = null;

  /**
   * @type {mozIStorageAsyncStatement}
   */
  mDeleteAllTodos = null;

  /**
   * @type {mozIStorageStatement}
   */
  mDeleteAllMetaData = null;

  /**
   * @param {CalStorageDatabase} db
   *
   * @throws - If unable to initialize SQL statements.
   */
  constructor(db) {
    this.mSelectEvent = db.createAsyncStatement(
      `SELECT * FROM cal_events
          WHERE id = :id
            AND cal_id = :cal_id
            AND recurrence_id IS NULL
          LIMIT 1`
    );

    this.mSelectTodo = db.createAsyncStatement(
      `SELECT * FROM cal_todos
          WHERE id = :id 
            AND cal_id = :cal_id
            AND recurrence_id IS NULL
          LIMIT 1`
    );

    // The more readable version of the next where-clause is:
    //   WHERE  ((event_end > :range_start OR
    //           (event_end = :range_start AND
    //           event_start = :range_start))
    //          AND event_start < :range_end)
    //
    // but that doesn't work with floating start or end times. The logic
    // is the same though.
    // For readability, a few helpers:
    const floatingEventStart = "event_start_tz = 'floating' AND event_start";
    const nonFloatingEventStart = "event_start_tz != 'floating' AND event_start";
    const floatingEventEnd = "event_end_tz = 'floating' AND event_end";
    const nonFloatingEventEnd = "event_end_tz != 'floating' AND event_end";
    // The query needs to take both floating and non floating into account.
    this.mSelectNonRecurringEventsByRange = db.createAsyncStatement(
      `SELECT * FROM cal_events 
         WHERE
          ((${floatingEventEnd} > :range_start + :start_offset) OR 
           (${nonFloatingEventEnd} > :range_start) OR
           (((${floatingEventEnd} = :range_start + :start_offset) OR
             (${nonFloatingEventEnd} = :range_start)) AND
            ((${floatingEventStart} = :range_start + :start_offset) OR
             (${nonFloatingEventStart} = :range_start)))) 
          AND
           ((${floatingEventStart} < :range_end + :end_offset) OR
            (${nonFloatingEventStart} < :range_end))
          AND cal_id = :cal_id AND flags & 16 == 0 AND recurrence_id IS NULL
          AND ((:offline_journal IS NULL
          AND  (offline_journal IS NULL
           OR   offline_journal != ${cICL.OFFLINE_FLAG_DELETED_RECORD}))
           OR (offline_journal == :offline_journal))`
    );

    //
    // WHERE (due > rangeStart  AND  (entry IS NULL  OR  entry < rangeEnd)) OR
    //       (due = rangeStart  AND  (entry IS NULL  OR  entry = rangeStart)) OR
    //       (due IS NULL  AND  (entry >= rangeStart  AND  entry < rangeEnd)) OR
    //       (entry IS NULL  AND  (completed > rangeStart  OR  completed IS NULL))
    //
    const floatingTodoEntry = "todo_entry_tz = 'floating' AND todo_entry";
    const nonFloatingTodoEntry = "todo_entry_tz != 'floating' AND todo_entry";
    const floatingTodoDue = "todo_due_tz = 'floating' AND todo_due";
    const nonFloatingTodoDue = "todo_due_tz != 'floating' AND todo_due";
    const floatingCompleted = "todo_completed_tz = 'floating' AND todo_completed";
    const nonFloatingCompleted = "todo_completed_tz != 'floating' AND todo_completed";

    this.mSelectNonRecurringTodosByRange = db.createAsyncStatement(
      `SELECT * FROM cal_todos
         WHERE
          ((((${floatingTodoDue} > :range_start + :start_offset) OR
             (${nonFloatingTodoDue} > :range_start)) AND
            ((todo_entry IS NULL) OR
             ((${floatingTodoEntry} < :range_end + :end_offset) OR
              (${nonFloatingTodoEntry} < :range_end)))) OR
           (((${floatingTodoDue} = :range_start + :start_offset) OR
             (${nonFloatingTodoDue} = :range_start)) AND
            ((todo_entry IS NULL) OR
             ((${floatingTodoEntry} = :range_start + :start_offset) OR
              (${nonFloatingTodoEntry} = :range_start)))) OR
           ((todo_due IS NULL) AND
            (((${floatingTodoEntry} >= :range_start + :start_offset) OR
              (${nonFloatingTodoEntry} >= :range_start)) AND
             ((${floatingTodoEntry} < :range_end + :end_offset) OR
              (${nonFloatingTodoEntry} < :range_end)))) OR
           ((todo_entry IS NULL) AND
            (((${floatingCompleted} > :range_start + :start_offset) OR
              (${nonFloatingCompleted} > :range_start)) OR
             (todo_completed IS NULL))))
          AND cal_id = :cal_id AND flags & 16 == 0 AND recurrence_id IS NULL
          AND ((:offline_journal IS NULL
          AND  (offline_journal IS NULL
           OR   offline_journal != ${cICL.OFFLINE_FLAG_DELETED_RECORD}))
           OR (offline_journal == :offline_journal))`
    );

    this.mSelectEventsWithRecurrence = db.createAsyncStatement(
      `SELECT * FROM cal_events
          WHERE flags & 16 == 16
            AND cal_id = :cal_id 
            AND recurrence_id is NULL`
    );

    this.mSelectTodosWithRecurrence = db.createAsyncStatement(
      `SELECT * FROM cal_todos
          WHERE flags & 16 == 16
            AND cal_id = :cal_id
            AND recurrence_id IS NULL`
    );

    this.mSelectEventExceptions = db.createAsyncStatement(
      `SELECT * FROM cal_events
          WHERE id = :id
            AND cal_id = :cal_id
            AND recurrence_id IS NOT NULL`
    );
    this.mSelectAllEventExceptions = db.createAsyncStatement(
      `SELECT * FROM cal_events
          WHERE cal_id = :cal_id
            AND recurrence_id IS NOT NULL`
    );

    this.mSelectTodoExceptions = db.createAsyncStatement(
      `SELECT * FROM cal_todos
          WHERE id = :id
            AND cal_id = :cal_id
            AND recurrence_id IS NOT NULL`
    );
    this.mSelectAllTodoExceptions = db.createAsyncStatement(
      `SELECT * FROM cal_todos 
          WHERE cal_id = :cal_id
            AND recurrence_id IS NOT NULL`
    );

    this.mSelectAttendeesForItem = db.createAsyncStatement(
      `SELECT * FROM cal_attendees
          WHERE item_id = :item_id
            AND cal_id = :cal_id
            AND recurrence_id IS NULL`
    );

    this.mSelectAttendeesForItemWithRecurrenceId = db.createAsyncStatement(
      `SELECT * FROM cal_attendees
          WHERE item_id = :item_id
            AND cal_id = :cal_id
            AND recurrence_id = :recurrence_id
            AND recurrence_id_tz = :recurrence_id_tz`
    );
    this.mSelectAllAttendees = db.createAsyncStatement(
      `SELECT item_id, icalString FROM cal_attendees
          WHERE cal_id = :cal_id
            AND recurrence_id IS NULL`
    );

    this.mSelectPropertiesForItem = db.createAsyncStatement(
      `SELECT * FROM cal_properties
          WHERE item_id = :item_id
            AND cal_id = :cal_id
            AND recurrence_id IS NULL`
    );
    this.mSelectPropertiesForItemWithRecurrenceId = db.createAsyncStatement(
      `SELECT * FROM cal_properties
          WHERE item_id = :item_id
            AND cal_id = :cal_id
            AND recurrence_id = :recurrence_id
            AND recurrence_id_tz = :recurrence_id_tz`
    );
    this.mSelectAllProperties = db.createAsyncStatement(
      `SELECT item_id, key, value FROM cal_properties
          WHERE cal_id = :cal_id
            AND recurrence_id IS NULL`
    );

    this.mSelectParametersForItem = db.createAsyncStatement(
      `SELECT * FROM cal_parameters
          WHERE item_id = :item_id
            AND cal_id = :cal_id
            AND recurrence_id IS NULL`
    );
    this.mSelectParametersForItemWithRecurrenceId = db.createAsyncStatement(
      `SELECT * FROM cal_parameters
          WHERE item_id = :item_id
            AND cal_id = :cal_id
            AND recurrence_id = :recurrence_id
            AND recurrence_id_tz = :recurrence_id_tz`
    );
    this.mSelectAllParameters = db.createAsyncStatement(
      `SELECT item_id, key1, key2, value FROM cal_parameters
          WHERE cal_id = :cal_id
            AND recurrence_id IS NULL`
    );

    this.mSelectRecurrenceForItem = db.createAsyncStatement(
      `SELECT * FROM cal_recurrence
          WHERE item_id = :item_id
            AND cal_id = :cal_id`
    );
    this.mSelectAllRecurrences = db.createAsyncStatement(
      `SELECT item_id, icalString FROM cal_recurrence
          WHERE cal_id = :cal_id`
    );

    this.mSelectAttachmentsForItem = db.createAsyncStatement(
      `SELECT * FROM cal_attachments
          WHERE item_id = :item_id
            AND cal_id = :cal_id
            AND recurrence_id IS NULL`
    );
    this.mSelectAttachmentsForItemWithRecurrenceId = db.createAsyncStatement(
      `SELECT * FROM cal_attachments
          WHERE item_id = :item_id
            AND cal_id = :cal_id
            AND recurrence_id = :recurrence_id
            AND recurrence_id_tz = :recurrence_id_tz`
    );
    this.mSelectAllAttachments = db.createAsyncStatement(
      `SELECT item_id, icalString FROM cal_attachments
          WHERE cal_id = :cal_id
            AND recurrence_id IS NULL`
    );

    this.mSelectRelationsForItem = db.createAsyncStatement(
      `SELECT * FROM cal_relations
          WHERE item_id = :item_id
            AND cal_id = :cal_id
            AND recurrence_id IS NULL`
    );
    this.mSelectRelationsForItemWithRecurrenceId = db.createAsyncStatement(
      `SELECT * FROM cal_relations
          WHERE item_id = :item_id
            AND cal_id = :cal_id
            AND recurrence_id = :recurrence_id
            AND recurrence_id_tz = :recurrence_id_tz`
    );
    this.mSelectAllRelations = db.createAsyncStatement(
      `SELECT item_id, icalString FROM cal_relations
          WHERE cal_id = :cal_id
            AND recurrence_id IS NULL`
    );

    this.mSelectMetaData = db.createStatement(
      `SELECT * FROM cal_metadata
          WHERE item_id = :item_id
            AND cal_id = :cal_id`
    );

    this.mSelectAllMetaData = db.createStatement(
      `SELECT * FROM cal_metadata
          WHERE cal_id = :cal_id`
    );

    this.mSelectAlarmsForItem = db.createAsyncStatement(
      `SELECT icalString FROM cal_alarms
          WHERE item_id = :item_id
            AND cal_id = :cal_id
            AND recurrence_id IS NULL`
    );

    this.mSelectAlarmsForItemWithRecurrenceId = db.createAsyncStatement(
      `SELECT icalString FROM cal_alarms
          WHERE item_id = :item_id
            AND cal_id = :cal_id
            AND recurrence_id = :recurrence_id
            AND recurrence_id_tz = :recurrence_id_tz`
    );
    this.mSelectAllAlarms = db.createAsyncStatement(
      `SELECT item_id, icalString FROM cal_alarms
          WHERE cal_id = :cal_id
            AND recurrence_id IS NULL`
    );

    // insert statements
    this.mInsertEvent = db.createAsyncStatement(
      `INSERT INTO cal_events
           (cal_id, id, time_created, last_modified,
            title, priority, privacy, ical_status, flags,
            event_start, event_start_tz, event_end, event_end_tz, event_stamp,
            recurrence_id, recurrence_id_tz, alarm_last_ack)
         VALUES (:cal_id, :id, :time_created, :last_modified,
                 :title, :priority, :privacy, :ical_status, :flags,
                 :event_start, :event_start_tz, :event_end, :event_end_tz, :event_stamp,
                 :recurrence_id, :recurrence_id_tz, :alarm_last_ack)`
    );

    this.mInsertTodo = db.createAsyncStatement(
      `INSERT INTO cal_todos
           (cal_id, id, time_created, last_modified,
            title, priority, privacy, ical_status, flags,
            todo_entry, todo_entry_tz, todo_due, todo_due_tz, todo_stamp,
            todo_completed, todo_completed_tz, todo_complete,
            recurrence_id, recurrence_id_tz, alarm_last_ack)
         VALUES (:cal_id, :id, :time_created, :last_modified,
                 :title, :priority, :privacy, :ical_status, :flags,
                 :todo_entry, :todo_entry_tz, :todo_due, :todo_due_tz, :todo_stamp,
                 :todo_completed, :todo_completed_tz, :todo_complete,
                 :recurrence_id, :recurrence_id_tz, :alarm_last_ack)`
    );
    this.mInsertProperty = db.createAsyncStatement(
      `INSERT INTO cal_properties (cal_id, item_id, recurrence_id, recurrence_id_tz, key, value)
         VALUES (:cal_id, :item_id, :recurrence_id, :recurrence_id_tz, :key, :value)`
    );
    this.mInsertParameter = db.createAsyncStatement(
      `INSERT INTO cal_parameters (cal_id, item_id, recurrence_id, recurrence_id_tz, key1, key2, value)
         VALUES (:cal_id, :item_id, :recurrence_id, :recurrence_id_tz, :key1, :key2, :value)`
    );
    this.mInsertAttendee = db.createAsyncStatement(
      `INSERT INTO cal_attendees
           (cal_id, item_id, recurrence_id, recurrence_id_tz, icalString)
         VALUES (:cal_id, :item_id, :recurrence_id, :recurrence_id_tz, :icalString)`
    );
    this.mInsertRecurrence = db.createAsyncStatement(
      `INSERT INTO cal_recurrence
           (cal_id, item_id, icalString)
         VALUES (:cal_id, :item_id, :icalString)`
    );

    this.mInsertAttachment = db.createAsyncStatement(
      `INSERT INTO cal_attachments
           (cal_id, item_id, icalString, recurrence_id, recurrence_id_tz)
         VALUES (:cal_id, :item_id, :icalString, :recurrence_id, :recurrence_id_tz)`
    );

    this.mInsertRelation = db.createAsyncStatement(
      `INSERT INTO cal_relations
           (cal_id, item_id, icalString, recurrence_id, recurrence_id_tz)
         VALUES (:cal_id, :item_id, :icalString, :recurrence_id, :recurrence_id_tz)`
    );

    this.mInsertMetaData = db.createStatement(
      `INSERT INTO cal_metadata
           (cal_id, item_id, value)
         VALUES (:cal_id, :item_id, :value)`
    );

    this.mInsertAlarm = db.createAsyncStatement(
      `INSERT INTO cal_alarms
           (cal_id, item_id, icalString, recurrence_id, recurrence_id_tz)
         VALUES  (:cal_id, :item_id, :icalString, :recurrence_id, :recurrence_id_tz)`
    );
    // Offline Operations
    this.mEditEventOfflineFlag = db.createStatement(
      `UPDATE cal_events SET offline_journal = :offline_journal
          WHERE id = :id
            AND cal_id = :cal_id`
    );

    this.mEditTodoOfflineFlag = db.createStatement(
      `UPDATE cal_todos SET offline_journal = :offline_journal
          WHERE id = :id
            AND cal_id = :cal_id`
    );

    // delete statements
    this.mDeleteEvent = db.createAsyncStatement(
      "DELETE FROM cal_events WHERE id = :id AND cal_id = :cal_id"
    );
    this.mDeleteTodo = db.createAsyncStatement(
      "DELETE FROM cal_todos WHERE id = :id AND cal_id = :cal_id"
    );
    this.mDeleteAttendees = db.createAsyncStatement(
      "DELETE FROM cal_attendees WHERE item_id = :item_id AND cal_id = :cal_id"
    );
    this.mDeleteProperties = db.createAsyncStatement(
      "DELETE FROM cal_properties WHERE item_id = :item_id AND cal_id = :cal_id"
    );
    this.mDeleteParameters = db.createAsyncStatement(
      "DELETE FROM cal_parameters WHERE item_id = :item_id AND cal_id = :cal_id"
    );
    this.mDeleteRecurrence = db.createAsyncStatement(
      "DELETE FROM cal_recurrence WHERE item_id = :item_id AND cal_id = :cal_id"
    );
    this.mDeleteAttachments = db.createAsyncStatement(
      "DELETE FROM cal_attachments WHERE item_id = :item_id AND cal_id = :cal_id"
    );
    this.mDeleteRelations = db.createAsyncStatement(
      "DELETE FROM cal_relations WHERE item_id = :item_id AND cal_id = :cal_id"
    );
    this.mDeleteMetaData = db.createStatement(
      "DELETE FROM cal_metadata WHERE item_id = :item_id AND cal_id = :cal_id"
    );
    this.mDeleteAlarms = db.createAsyncStatement(
      "DELETE FROM cal_alarms WHERE item_id = :item_id AND cal_id = :cal_id"
    );

    // These are only used when deleting an entire calendar
    const extrasTables = [
      "cal_attendees",
      "cal_properties",
      "cal_parameters",
      "cal_recurrence",
      "cal_attachments",
      "cal_metadata",
      "cal_relations",
      "cal_alarms",
    ];

    this.mDeleteEventExtras = [];
    this.mDeleteTodoExtras = [];

    for (const table in extrasTables) {
      this.mDeleteEventExtras[table] = db.createAsyncStatement(
        `DELETE FROM ${extrasTables[table]}
            WHERE item_id IN
             (SELECT id FROM cal_events WHERE cal_id = :cal_id)
            AND cal_id = :cal_id`
      );
      this.mDeleteTodoExtras[table] = db.createAsyncStatement(
        `DELETE FROM ${extrasTables[table]}
            WHERE item_id IN
             (SELECT id FROM cal_todos WHERE cal_id = :cal_id)
            AND cal_id = :cal_id`
      );
    }

    // Note that you must delete the "extras" _first_ using the above two
    // statements, before you delete the events themselves.
    this.mDeleteAllEvents = db.createAsyncStatement(
      "DELETE from cal_events WHERE cal_id = :cal_id"
    );
    this.mDeleteAllTodos = db.createAsyncStatement("DELETE from cal_todos WHERE cal_id = :cal_id");

    this.mDeleteAllMetaData = db.createStatement("DELETE FROM cal_metadata WHERE cal_id = :cal_id");
  }

  /**
   * Ensures all Db statements are properly cleaned up before shutdown by
   * calling their finalize() method.
   */
  finalize() {
    for (const key of Object.keys(this)) {
      if (this[key] instanceof Ci.mozIStorageBaseStatement) {
        this[key].finalize();
      }
    }
    for (const stmt of this.mDeleteEventExtras) {
      stmt.finalize();
    }
    for (const stmt of this.mDeleteTodoExtras) {
      stmt.finalize();
    }
  }
}
