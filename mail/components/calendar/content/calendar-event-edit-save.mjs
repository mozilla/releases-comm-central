/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { loadCalendarEventSource } from "./calendar-event-source-loader.mjs";
import { canMoveCalendarEvent } from "./calendar-event-calendar-options.mjs";
import {
  applyCalendarEventDraft,
  prepareCalendarEventSave,
} from "./calendar-event-save-fields.mjs";
import { selectCalendarEventSourceSession } from "./state/calendar-event-source-state.mjs";
import { selectCalendarEventDraftState } from "./state/calendarEventDraftSlice.mjs";
import { selectCanSave } from "./state/calendar-event-create-edit-selectors.mjs";
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
  queueCalendarEventEdit:
    "resource:///modules/calendar/CalendarEventEdit.sys.mjs",
});

/**
 * Returns whether Edit Save needs to write categories.
 * Compares sorted names so order alone leaves the saved categories intact.
 *
 * @param {CalendarEventDraft} draft - The values captured for Save.
 * @param {CalendarEventDraft} baseline - The starting values of the draft.
 * @returns {boolean} Whether the enabled state or enabled selection changed.
 */
function haveCategoriesChanged(draft, baseline) {
  const isEnabled = draft.enabledRows?.categories !== false;
  const wasEnabled = baseline.enabledRows?.categories !== false;

  if (isEnabled !== wasEnabled) {
    return true;
  }

  return (
    isEnabled &&
    JSON.stringify((draft.categories ?? []).toSorted()) !==
      JSON.stringify((baseline.categories ?? []).toSorted())
  );
}

/**
 * Saves a copy of the draft through the host window's Calendar transaction.
 * A transaction writes the event and supports Undo and meeting messages.
 *
 * Redux stores plain data: values that can be copied and stored as JSON.
 * Calendar objects have methods and provider references, so they stay outside
 * Redux. This function loads the current Calendar event, applies the draft to
 * an event copy, and asks `transact` to write that copy.
 *
 * Requests for the same event wait in a shared queue. After earlier requests
 * finish, this request reloads the event so unchanged draft fields can retain
 * newer saved values. A replaced source, baseline, or operation prevents this
 * request from updating replacement dialog state. That check does not cancel
 * a calendar write that has already started. Failures retain all draft input.
 *
 * @param {object} options - The current dialog and host functions.
 * @param {{getState: () => object, dispatch: (action: object) => void}} options.store
 *   - The document's Redux store, which holds this dialog's state.
 * @param {string} options.sessionKey - The fixed dialog key.
 * @param {Record<string, CalendarEventSaveField>} [options.fields={}] - Field helpers.
 * @param {(event: calIEvent) => calIEvent|null} options.chooseOccurrence
 *   - Return the event to change: one occurrence or its parent series.
 *   Return null to cancel Save.
 * @param {(event: calIEvent, oldEvent: calIEvent) => Promise<void>} options.transact
 *   - Write the event through the modify transaction. Resolve after it finishes.
 * @returns {Promise<
 *   {status: "success", identity: CalendarEventSourceIdentity} |
 *   {status: "unavailable"|"stale"|"cancelled"|"error"}
 * >}
 *   The result after queued work finishes. `success` includes the saved IDs.
 *   `error` retains the draft for retry. `cancelled` means the prompt returned
 *   null. `stale` means this request's dialog data was replaced. `unavailable`
 *   means no work started because the source, mode, operation, or validation
 *   did not permit Save. Dialog closing is separate from this promise.
 */
export async function saveCalendarEventEdit({
  store,
  sessionKey,
  fields = {},
  chooseOccurrence,
  transact,
}) {
  const state = store.getState();
  const source = selectCalendarEventSourceSession(state, sessionKey);
  const session = selectCalendarEventCreateEditSession(state, sessionKey);
  const draftState = selectCalendarEventDraftState(state, sessionKey);
  if (
    source?.status != "ready" ||
    session?.mode != "edit" ||
    !["idle", "error"].includes(session.operation.status) ||
    !draftState?.value ||
    !selectCanSave(state, sessionKey)
  ) {
    return { status: "unavailable" };
  }

  // Capture one Save request. Later draft edits must not change the values
  // already queued for this request.
  const requestId = Services.uuid.generateUUID().toString();
  const operation = { sessionKey, kind: "save", requestId };
  const draft = structuredClone(draftState.value);
  const baseline = draftState.baseline;

  // Do not update the dialog after an await if its source, draft baseline,
  // or Save request has been replaced.
  const isCurrent = () => {
    const current = store.getState();
    const currentSource = selectCalendarEventSourceSession(current, sessionKey);
    const currentDraft = selectCalendarEventDraftState(current, sessionKey);
    const currentSession = selectCalendarEventCreateEditSession(
      current,
      sessionKey
    );

    const hasCurrentSource = currentSource?.requestId === source.requestId;
    const hasCurrentBaseline = currentDraft?.baseline === baseline;
    const hasCurrentOperation =
      currentSession?.operation.requestId === requestId;

    return hasCurrentSource && hasCurrentBaseline && hasCurrentOperation;
  };

  store.dispatch(operationStarted(operation));

  try {
    const identity = await lazy.queueCalendarEventEdit(
      source.identity,
      async (latestIdentity, updateQueuedOccurrenceIds) => {
        // Reload after earlier queued edits finish. They can change the event
        // values, calendar, or recurrence ID used by this request.
        const { event: occurrence } =
          await loadCalendarEventSource(latestIdentity);
        if (!isCurrent()) {
          return latestIdentity;
        }

        // An unchanged calendar field follows earlier moves. Only an explicit
        // draft change asks to move the current event to another calendar.
        const calendar =
          draft.calendarId === baseline.calendarId
            ? occurrence.calendar
            : lazy.cal.manager.getCalendarById(draft.calendarId);

        // Permissions can change after the dialog loads. Recheck both the
        // source edit and any destination addition against the live event.
        if (!calendar) {
          throw new Error("event-not-editable");
        }

        const sourceCalendar = occurrence.calendar;
        const isMoving = calendar.id != sourceCalendar.id;
        const canEditSource =
          lazy.cal.acl.isCalendarWritable(sourceCalendar) &&
          lazy.cal.acl.userCanModifyItem(occurrence) &&
          !lazy.cal.itip.isInvitation(occurrence);
        const canUseDestination =
          lazy.cal.acl.isCalendarWritable(calendar) &&
          calendar.getProperty("capabilities.events.supported") !== false;
        const canMove =
          !isMoving ||
          (canMoveCalendarEvent(occurrence) &&
            lazy.cal.acl.userCanAddItemsToCalendar(calendar));

        if (!canEditSource || !canUseDestination || !canMove) {
          throw new Error("event-not-editable");
        }

        // The prompt can select one occurrence or its whole series. Check
        // request ownership again because the prompt can replace dialog state.
        const original = chooseOccurrence(occurrence);
        if (!original) {
          throw new Error("save-cancelled");
        }
        if (!isCurrent()) {
          return latestIdentity;
        }

        const event = original.clone();
        applyCalendarEventDraft(event, draft, baseline, occurrence);

        // Field helpers own their properties. Disabled rows remove stored
        // properties while their entered values remain in the retained draft.
        const prepared = prepareCalendarEventSave(draft, fields);

        for (const [section, field] of Object.entries(fields)) {
          // Keep the selected event's categories if the draft left them alone.
          // The selected event may be newer or may be the parent series.
          if (
            section == "categories" &&
            !haveCategoriesChanged(draft, baseline)
          ) {
            continue;
          }

          const { enabled, values } = prepared[section];

          if (enabled) {
            field.apply(event, values);
          } else {
            field.remove(event);
          }
        }

        event.calendar = calendar;

        // The organizer is the person who sends meeting invitations. A move
        // can change the organizer identity supplied by the calendar.
        // Clone the attendee before changing an organizer from an immutable item.
        if (event.organizer && calendar.id != original.calendar.id) {
          const organizerId = calendar.getProperty("organizerId");
          if (organizerId) {
            event.organizer = event.organizer.clone();
            event.organizer.id = organizerId;
            event.organizer.commonName = calendar.getProperty("organizerCN");
          }
        }

        // SENT-BY names the sender acting for the organizer. If the calendar's
        // access-control entry (aclEntry) supplies no matching organizer address,
        // use its first address as that sender.
        if (event.organizer && calendar.aclEntry) {
          const addresses = calendar.aclEntry.getUserAddresses();
          if (
            addresses.length &&
            !lazy.cal.email.attendeeMatchesAddresses(event.organizer, addresses)
          ) {
            event.organizer = event.organizer.clone();
            event.organizer.setProperty("SENT-BY", "mailto:" + addresses[0]);
          }
        }

        lazy.cal.itip.adaptScheduleAgent(event);
        event.makeImmutable();
        await transact(event, original);

        // Update queued occurrence IDs only after the series change succeeds.
        // A failed transaction must leave later requests at the old dates.
        if (
          event.recurrenceInfo &&
          !event.recurrenceId &&
          event.startDate.compare(original.startDate) != 0
        ) {
          updateQueuedOccurrenceIds(original, event);
        }

        return { ...latestIdentity, calendarId: calendar.id };
      }
    );

    // Storage may have completed for a request whose dialog state was replaced.
    // Release only that request; do not close or overwrite the replacement.
    if (!isCurrent()) {
      store.dispatch(operationReleased(operation));
      return { status: "stale" };
    }

    store.dispatch(operationSucceeded(operation));
    return { status: "success", identity };
  } catch (error) {
    if (!isCurrent()) {
      store.dispatch(operationReleased(operation));
      return { status: "stale" };
    }

    // Cancellation and failure retain the draft. Store only the error code;
    // provider error objects and live calendar objects stay outside Redux.
    const cancelled = error?.message == "save-cancelled";
    store.dispatch(
      operationFailed({
        ...operation,
        error: { code: cancelled ? "save-cancelled" : "event-save-failed" },
      })
    );

    return { status: cancelled ? "cancelled" : "error" };
  }
}
