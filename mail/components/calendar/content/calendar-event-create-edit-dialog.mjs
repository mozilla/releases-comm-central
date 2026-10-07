/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  DEFAULT_DIALOG_MARGIN,
  PositionedDialog,
} from "./positioned-dialog.mjs";
import { CalendarEventDialogSourceMixin } from "./calendar-event-dialog-source-mixin.mjs";
import {
  clearCalendarEventDraft,
  resetForCreate,
  resetFromSource,
  selectCalendarEventDraftState,
  updateSection,
} from "./state/calendarEventDraftSlice.mjs";
import {
  clearCalendarEventCreateEditSession,
  selectCalendarEventCreateEditSession,
  startCreateSession,
  startEditSession,
} from "./state/calendarEventCreateEditSessionSlice.mjs";

/**
 * The dialog that creates and edits calendar events.
 *
 * The dialog reads its route attributes and loads event data. It makes a
 * draft, an editable copy, in Redux, the app state store. It watches its
 * session and keeps copies for public getters. Other components add position,
 * size, header controls, field rows, and Save.
 *
 * Template ID: #calendarEventCreateEditDialogTemplate
 *
 * @tagname calendar-event-create-edit-dialog
 */
export class CalendarEventCreateEditDialog extends CalendarEventDialogSourceMixin(
  PositionedDialog
) {
  /**
   * The latest "create" or "edit" mode and work state for this dialog.
   *
   * @type {?CalendarEventCreateEditSession}
   */
  #createEditSession = null;

  /**
   * A copy of the current editable values, or null before a draft exists.
   *
   * @type {?CalendarEventDraft}
   */
  #draft = null;

  /**
   * The latest draft values, starting values, changed sections, and validation
   * results for each section.
   *
   * @type {?CalendarEventDraftState}
   */
  #draftState = null;

  /**
   * Names of field sections whose values differ from their starting values.
   *
   * @type {string[]}
   */
  #dirtySections = [];

  /**
   * True when at least one field section differs from its starting values.
   *
   * @type {boolean}
   */
  #isDirty = false;

  /**
   * True when a draft exists, no work is in progress, and all known sections
   * are valid. This does not check permissions or save an event.
   *
   * @type {boolean}
   */
  #canSave = false;

  /**
   * The mode of the current session, or null when no session exists.
   *
   * @type {"create"|"edit"|null}
   */
  #mode = null;

  /**
   * The margin maintained between this dialog and the visible calendar view.
   *
   * @type {number}
   */
  margin = DEFAULT_DIALOG_MARGIN;

  /**
   * Calendar targets that are meaningful placement anchors. Controls such as
   * menu and toolbar buttons deliberately do not match, so their create
   * routes center in the calendar view instead.
   *
   * @type {string}
   */
  triggerSelector =
    "calendar-event-box,calendar-month-day-box-item,.multiday-event-listitem,calendar-month-day-box,calendar-event-column,.multiday-hour-box,[data-calendar-range-target]";

  /**
   * Keep the dialog's top edge slightly above an anchored calendar target.
   *
   * @type {number}
   */
  triggerTopOffset = DEFAULT_DIALOG_MARGIN;

  /**
   * Add this dialog's Redux data to the shared source observer. The shared
   * constructor sets this element's fixed session key before these functions
   * use it.
   *
   * @param {...*} args
   */
  constructor(...args) {
    super(
      {
        createEditSession: state =>
          selectCalendarEventCreateEditSession(
            state,
            this.calendarEventSessionKey
          ),
        draftState: state =>
          selectCalendarEventDraftState(state, this.calendarEventSessionKey),
      },
      ...args
    );
  }

  /**
   * Start a "create" session with an empty draft. Field code adds defaults.
   */
  #initializeDraft() {
    this.dispatch(
      startCreateSession({ sessionKey: this.calendarEventSessionKey })
    );
    this.resetCreateDraft({});
  }

  /**
   * Create the dialog content and start route observation.
   */
  connectedCallback() {
    if (!this.hasConnected) {
      this.hasConnected = true;

      const template = document.getElementById(
        "calendarEventCreateEditDialogTemplate"
      );
      this.append(template.content.cloneNode(true));

      this.setAttribute("is", "calendar-event-create-edit-dialog");

      window.MozXULElement?.insertFTLIfNeeded("messenger/calendarDialog.ftl");
      document.l10n.setAttributes(this, "calendar-event-create-edit-dialog");
    }
    this.initializeCalendarEventRoute();
  }

  /**
   * The current "create" or "edit" mode, or null when no session exists.
   *
   * @returns {"create"|"edit"|null}
   */
  get mode() {
    return this.#mode;
  }

  /**
   * The current copied draft, or null while "edit" data loads.
   *
   * @returns {?CalendarEventDraft}
   */
  get draft() {
    return this.#draft ? structuredClone(this.#draft) : null;
  }

  /**
   * Whether any field section differs from its starting values.
   *
   * @returns {boolean}
   */
  get isDirty() {
    return this.#isDirty;
  }

  /**
   * The field sections that differ from their starting values.
   *
   * @returns {string[]}
   */
  get dirtySections() {
    return [...this.#dirtySections];
  }

  /**
   * Whether the current draft has no known invalid sections and could be saved
   * by future save code.
   *
   * @returns {boolean}
   */
  get canSave() {
    return this.#canSave;
  }

  /**
   * Allow an empty route to open this dialog in "create" mode.
   *
   * @returns {boolean}
   */
  get allowsEmptyCalendarEventRoute() {
    return true;
  }

  /**
   * Update a field section with values from its field code. The caller must
   * supply every draft property for the section, including unchanged values.
   * The reducer compares only the supplied properties with their baseline.
   * An omitted changed property can cause a section to be marked clean.
   *
   * @param {string} section
   * @param {CalendarEventDraft} patch - All draft properties for the section.
   */
  updateDraftSection(section, patch) {
    this.dispatch(
      updateSection({
        patch,
        section,
        sessionKey: this.calendarEventSessionKey,
      })
    );
  }

  /**
   * Reset a "create" draft with values from field defaults. This model does not
   * choose a calendar or date/time default.
   *
   * @param {CalendarEventDraft} initialDraft
   */
  resetCreateDraft(initialDraft) {
    this.dispatch(
      resetForCreate({
        initialDraft,
        sessionKey: this.calendarEventSessionKey,
      })
    );
  }

  /**
   * Read changes from the shared source session and this dialog's draft and
   * session. Update public values only when Redux reports a change. These
   * saved values never call helper functions or `store.getState()`.
   *
   * @param {string} fieldName
   * @param {*} oldValue
   * @param {*} newValue
   */
  handleStateChange(fieldName, oldValue, newValue) {
    super.handleStateChange(fieldName, oldValue, newValue);

    if (fieldName == "createEditSession") {
      this.#createEditSession = newValue;
      this.#updateDraftViewModel();
    } else if (fieldName == "draftState") {
      this.#draftState = newValue;
      this.#updateDraftViewModel();
    }
  }

  /**
   * Update public getter values from the latest observed state.
   * Copy draft data so callers cannot change Redux state through a getter.
   */
  #updateDraftViewModel() {
    const draft = this.#draftState?.value ?? null;
    this.#draft = draft ? structuredClone(draft) : null;
    this.#dirtySections = [...(this.#draftState?.dirtySections ?? [])];
    this.#isDirty = !!this.#dirtySections.length;
    this.#canSave =
      this.#draft !== null &&
      this.#createEditSession?.operation.status != "pending" &&
      Object.values(this.#draftState?.validation ?? {}).every(
        validity => validity.valid
      );
    this.#mode = this.#createEditSession?.mode ?? null;
  }

  /**
   * Select the visible calendar view before the readiness gate opens this
   * dialog. A caller can pass a calendar cell or selected-range event target;
   * menu, toolbar, and keyboard callers pass no matching target and therefore
   * receive the centered fallback.
   *
   * @param {?Event} event
   * @returns {Promise<boolean>} Whether the dialog was shown.
   */
  async show(event) {
    const calendarDisplayBox = document.getElementById("calendarDisplayBox");
    const calendarDisplayBoxRect = calendarDisplayBox?.getBoundingClientRect();
    const hasCalendarDisplayBox =
      calendarDisplayBoxRect?.width > 0 && calendarDisplayBoxRect.height > 0;
    const fallbackContainer =
      document.getElementById("tabpanelcontainer") ?? document.documentElement;

    this.container = hasCalendarDisplayBox
      ? calendarDisplayBox
      : fallbackContainer;

    return super.show(event);
  }

  /**
   * Start a clean "create" session for an empty route.
   *
   * @param {CalendarEventDialogRouteRequest} _route
   */
  async onEmptyCalendarEventRoute(_route) {
    this.#initializeDraft();
  }

  /**
   * Start an "edit" session before source loading completes.
   *
   * @param {CalendarEventSourceIdentity} _identity
   * @param {CalendarEventDialogRouteRequest} _route
   */
  async onCalendarEventSourceLoadStart(_identity, _route) {
    this.dispatch(
      startEditSession({ sessionKey: this.calendarEventSessionKey })
    );
  }

  /**
   * Start the draft with data copied from the loaded source.
   *
   * @param {CalendarEventDialogSource} source
   */
  async onCalendarEventSourceLoaded({ snapshot }) {
    this.dispatch(
      resetFromSource({
        sessionKey: this.calendarEventSessionKey,
        snapshot,
      })
    );
  }

  /**
   * Clear the draft and create/edit session when the route is replaced or
   * closed.
   */
  onCalendarEventRouteCleared() {
    this.dispatch(
      clearCalendarEventDraft({ sessionKey: this.calendarEventSessionKey })
    );
    this.dispatch(
      clearCalendarEventCreateEditSession({
        sessionKey: this.calendarEventSessionKey,
      })
    );
  }
}

customElements.define(
  "calendar-event-create-edit-dialog",
  CalendarEventCreateEditDialog,
  { extends: "dialog" }
);
