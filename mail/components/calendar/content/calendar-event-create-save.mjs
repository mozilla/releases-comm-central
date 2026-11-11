/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { canCreateCalendarEvent } from "./calendar-event-calendar-options.mjs";
import { prepareCalendarEventSave } from "./calendar-event-save-fields.mjs";
import {
  selectCalendarEventDraftState,
  setSectionValidity,
} from "./state/calendarEventDraftSlice.mjs";
import {
  operationStarted,
  operationSucceeded,
  operationFailed,
  operationReleased,
  selectCalendarEventCreateEditSession,
} from "./state/calendarEventCreateEditSessionSlice.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  cal: "resource:///modules/calendar/calUtils.sys.mjs",
  CalEvent: "resource:///modules/CalEvent.sys.mjs",
});

/**
 * Runs the supplied validators for enabled fields and stores their results.
 * A validator checks input and returns an object with a `valid` flag.
 * Returns null if the request or draft changes during validation.
 *
 * @param {object} options - The fields and current request.
 * @param {{
 *   getState: () => object,
 *   dispatch: (action: object) => void
 * }} options.store - The dialog's Redux store.
 * @param {string} options.sessionKey - The fixed dialog key.
 * @param {Record<string, CalendarEventSaveField>} options.fields
 *   - Field helpers.
 * @param {Record<string, {
 *   enabled: boolean,
 *   values: CalendarEventDraft
 * }>} options.preparedSections - Copied field values and enabled states.
 * @param {() => boolean} options.isCurrent - Checks the request and draft.
 * @returns {?Record<string, CalendarEventDraftSectionValidity>} Field results,
 *   or null if the request or draft has changed.
 */
function validateFields({
  store,
  sessionKey,
  fields,
  preparedSections,
  isCurrent,
}) {
  // Check only this Save attempt's results. Stored errors can belong to fields
  // that are no longer registered and cannot supply a new validation result.
  const validation = {};
  for (const [section, field] of Object.entries(fields)) {
    if (!preparedSections[section].enabled || !field.validate) {
      continue;
    }

    // A validator can replace the draft. Check before writing its result so
    // the old result cannot set an error on the replacement draft.
    const validity = structuredClone(
      field.validate(preparedSections[section].values)
    );
    if (!isCurrent()) {
      return null;
    }

    validation[section] = validity;
    store.dispatch(setSectionValidity({ sessionKey, section, validity }));
    // Dispatch notifies store listeners before returning. A listener can
    // replace the draft, so check again before validating another field.
    if (!isCurrent()) {
      return null;
    }
  }

  return validation;
}

/**
 * Combines the calendar field result with current calendar permissions.
 * Stores the combined calendar result in the draft state.
 *
 * @param {{dispatch: (action: object) => void}} store
 *   - The dialog's Redux store.
 * @param {string} sessionKey - The fixed dialog key.
 * @param {?calICalendar} calendar - The selected Calendar object, or null if
 *   the selected calendar no longer exists.
 * @param {Record<string, CalendarEventDraftSectionValidity>} validation
 *   - This request's field results. Receives the combined calendar result.
 */
function validateCalendar(store, sessionKey, calendar, validation) {
  // Keep the calendar field's error when checking current permissions.
  const calendarValidity = validation.calendar ?? { valid: true };
  validation.calendar = {
    ...calendarValidity,
    valid: calendarValidity.valid && canCreateCalendarEvent(calendar),
  };
  store.dispatch(
    setSectionValidity({
      sessionKey,
      section: "calendar",
      validity: validation.calendar,
    })
  );
}

/**
 * Creates an event from the enabled fields' copied values.
 * The event is mutable: field helpers can still change its properties.
 *
 * @param {calICalendar} calendar - The selected live calendar.
 * @param {Record<string, CalendarEventSaveField>} fields - Field helpers.
 * @param {Record<string, {
 *   enabled: boolean,
 *   values: CalendarEventDraft
 * }>} preparedSections - Copied field values and enabled states.
 * @returns {calIEvent} The new event with enabled field values.
 */
function createEventFromFields(calendar, fields, preparedSections) {
  const newEvent = new lazy.CalEvent();
  newEvent.calendar = calendar;
  // Field helpers write copied values from enabled fields to the new event.
  // Disabled fields add no values to the event. The draft keeps all field
  // values for retry.
  for (const [section, field] of Object.entries(fields)) {
    if (preparedSections[section].enabled) {
      field.apply(newEvent, preparedSections[section].values);
    }
  }

  return newEvent;
}

/**
 * Validates unsaved values and adds a new event to a calendar.
 *
 * The draft contains the unsaved values. The Redux store holds the draft and
 * Save progress. Dispatching an action asks the store to update that data;
 * it does not write an event to a calendar.
 *
 * Field helpers check input, display errors, and copy values to the event.
 * Runs validators only for registered, enabled fields that supply one.
 * Checks current calendar permissions even if no fields are registered.
 * Calls `transact` once after validation and conversion succeed. The dialog
 * supplies a Calendar transaction, a write that supports Undo and meeting
 * messages. A Calendar transaction is separate from a Redux action.
 *
 * If the session or draft changes, stops applying results to the dialog.
 * A Calendar write that has started can still finish. Validation, conversion,
 * and transaction failures keep draft values and row enabled flags for retry.
 *
 * @param {object} options - The dialog state, field helpers, and write function.
 * @param {{getState: () => object, dispatch: (action: object) => void}} options.store
 *   - The dialog's Redux store.
 * @param {string} options.sessionKey - The key for this dialog's state.
 * @param {Record<string, CalendarEventSaveField>} [options.fields={}]
 *   - Helpers that check and copy each registered field's values.
 * @param {(event: calIEvent) => Promise<void>} options.transact
 *   - Adds the event through Thunderbird's Calendar transaction code.
 *   The event is immutable: the callback must not change its properties.
 * @returns {Promise<{
 *   status: "success"|"invalid"|"error"|"stale"|"unavailable"
 * }>} The Save result:
 *   - `success`: the transaction finished for the current draft.
 *   - `invalid`: a field or calendar check failed. No transaction started.
 *   - `error`: validation, conversion, or the transaction threw an error.
 *   - `stale`: the request or draft changed. Does not undo a completed write.
 *   - `unavailable`: there is no create draft, or the session status is neither
 *     `idle` nor `error`. No transaction started.
 */
export async function saveCalendarEventCreate({
  store,
  sessionKey,
  fields = {},
  transact,
}) {
  const state = store.getState();
  const session = selectCalendarEventCreateEditSession(state, sessionKey);
  const draftState = selectCalendarEventDraftState(state, sessionKey);
  if (
    session?.mode != "create" ||
    !["idle", "error"].includes(session.operation.status) ||
    !draftState?.value
  ) {
    return { status: "unavailable" };
  }

  const requestId = Services.uuid.generateUUID().toString();
  const operation = { sessionKey, kind: "save", requestId };
  const baseline = draftState.baseline;
  const draft = structuredClone(draftState.value);

  // The request ID identifies one Save attempt. The baseline object holds the
  // draft's starting values. A reset replaces that object even if the dialog
  // keeps the same session key and request ID. Both must still match before
  // this attempt can store validation results or complete the operation.
  const isCurrent = () => {
    const current = store.getState();
    return (
      selectCalendarEventDraftState(current, sessionKey)?.baseline ===
        baseline &&
      selectCalendarEventCreateEditSession(current, sessionKey)?.operation
        .requestId === requestId
    );
  };

  store.dispatch(operationStarted(operation));

  try {
    if (!isCurrent()) {
      store.dispatch(operationReleased(operation));
      return { status: "stale" };
    }

    const preparedSections = prepareCalendarEventSave(draft, fields);

    const validation = validateFields({
      store,
      sessionKey,
      fields,
      preparedSections,
      isCurrent,
    });
    if (!validation) {
      store.dispatch(operationReleased(operation));
      return { status: "stale" };
    }

    const calendar = lazy.cal.manager.getCalendarById(draft.calendarId);
    validateCalendar(store, sessionKey, calendar, validation);
    if (!isCurrent()) {
      store.dispatch(operationReleased(operation));
      return { status: "stale" };
    }

    if (!Object.values(validation).every(validity => validity.valid)) {
      store.dispatch(
        operationFailed({
          ...operation,
          error: { code: "event-validation-failed" },
        })
      );
      return { status: "invalid" };
    }

    const event = createEventFromFields(calendar, fields, preparedSections);

    if (!isCurrent()) {
      store.dispatch(operationReleased(operation));
      return { status: "stale" };
    }

    lazy.cal.itip.adaptScheduleAgent(event);
    event.makeImmutable();
    await transact(event);

    // The transaction is complete even if this draft has been replaced.
    // Ignore the old Save result without undoing the calendar change.
    if (!isCurrent()) {
      store.dispatch(operationReleased(operation));
      return { status: "stale" };
    }

    store.dispatch(operationSucceeded(operation));
    return { status: "success" };
  } catch (error) {
    if (!isCurrent()) {
      store.dispatch(operationReleased(operation));
      return { status: "stale" };
    }

    store.dispatch(
      operationFailed({ ...operation, error: { code: "event-save-failed" } })
    );
    return { status: "error" };
  }
}
