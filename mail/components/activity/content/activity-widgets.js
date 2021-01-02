/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global MozXULElement, MozElements, activityManager */

// Wrap in a block to prevent leaking to window scope.
{
  const { Services } = ChromeUtils.import(
    "resource://gre/modules/Services.jsm"
  );
  const { makeFriendlyDateAgo } = ChromeUtils.import(
    "resource:///modules/TemplateUtils.jsm"
  );
  /**
   * The MozActivityBaseRichlistItem widget is the base class for all the
   * activity item. It initializes activity details: i.e. id, status,
   * icon, name, progress, date etc. for the activity widgets.
   *
   * @abstract
   * @extends {MozElements.MozRichlistitem}
   */
  class MozActivityBaseRichlistItem extends MozElements.MozRichlistitem {
    connectedCallback() {
      if (this.delayConnectedCallback()) {
        return;
      }
      // fetch the activity and set the base attributes
      this.log = console.createInstance({
        prefix: "mail.activity",
        maxLogLevel: "Warn",
        maxLogLevelPref: "mail.activity.loglevel",
      });
      let actID = this.getAttribute("actID");
      this._activity = activityManager.getActivity(actID);
      this.setAttribute("iconclass", this._activity.iconClass);

      this.text = {
        paused: "paused2",
        canceled: "canceled",
        failed: "failed",
        waitingforinput: "waitingForInput",
        waitingforretry: "waitingForRetry",
      };

      // convert strings to those in the string bundle
      let sb = Services.strings.createBundle(
        "chrome://messenger/locale/activity.properties"
      );
      let getStr = string => sb.GetStringFromName(string);
      for (let [name, value] of Object.entries(this.text)) {
        this.text[name] =
          typeof value == "string" ? getStr(value) : value.map(getStr);
      }
    }

    get isProcess() {
      return this._activity && this._activity instanceof Ci.nsIActivityProcess;
    }

    get isEvent() {
      return this._activity && this._activity instanceof Ci.nsIActivityEvent;
    }

    get isWarning() {
      return this._activity && this._activity instanceof Ci.nsIActivityWarning;
    }

    get isGroup() {
      return false;
    }

    get activity() {
      return this._activity;
    }

    setVisibility(className, visible) {
      this.querySelector(className).setAttribute("hidden", !visible);
    }

    formatTimeTip(time) {
      const dateTimeFormatter = new Services.intl.DateTimeFormat(undefined, {
        dateStyle: "long",
        timeStyle: "short",
      });

      // Get the end time to display
      let end = new Date(parseInt(time));

      // Set the tooltip to be the full date and time
      return dateTimeFormatter.format(end);
    }

    detachFromActivity() {
      this._activity.removeListener(this.activityListener);
    }

    disconnectedCallback() {
      this.detachFromActivity();
    }
  }

  MozXULElement.implementCustomInterface(MozActivityBaseRichlistItem, [
    Ci.nsIDOMXULSelectControlItemElement,
  ]);

  /**
   * The MozActivityEvent widget displays information about events (like
   * deleting or moving the message): e.g image, name, date and description.
   * It is typically used in Activity Manager window.
   *
   * @extends MozActivityBase
   */
  class MozActivityEventRichlistItem extends MozActivityBaseRichlistItem {
    static get inheritedAttributes() {
      return {
        ".eventIconBox > image": "class=iconclass",
        ".displayText": "value=displayText,tooltiptext=displayTextTip",
        ".dateTime": "value=completionTime,tooltiptext=completionTimeTip",
        ".statusText": "value=statusText,tooltiptext=statusTextTip",
      };
    }

    connectedCallback() {
      super.connectedCallback();
      if (this.delayConnectedCallback() || this.hasChildNodes()) {
        return;
      }
      this.setAttribute("is", "activity-event-richlistitem");

      this.activityListener = {
        onHandlerChanged: activity => {
          // update handler button's visibility
          this.setVisibility(".undo", this.canUndo);
        },
        QueryInterface: ChromeUtils.generateQI(["nsIActivityListener"]),
      };

      this._activity.addListener(this.activityListener);
      this.appendChild(
        MozXULElement.parseXULToFragment(
          `
          <hbox flex="1">
            <vbox pack="center" class="eventIconBox">
              <image></image>
            </vbox>
            <vbox pack="start" flex="1">
              <hbox align="center" flex="1">
                <label crop="center" flex="1" class="displayText"></label>
                <label class="dateTime"></label>
              </hbox>
              <hbox align="center" flex="1">
                <label crop="end" flex="1" class="statusText"></label>
                <button class="undo mini-button"
                        tooltiptext="&cmd.undo.label;" cmd="cmd_undo"
                        ondblclick="event.stopPropagation();"
                        oncommand="activity.undoHandler.undo(activity);">
                </button>
              </hbox>
            </vbox>
          </hbox>
          `,
          ["chrome://messenger/locale/activity.dtd"]
        )
      );

      this.setAttribute("class", "activityitem");

      this._activity.QueryInterface(Ci.nsIActivityEvent);

      this.displayText = this._activity.displayText;
      this.statusText = this._activity.statusText;
      this.completionTime = this._activity.completionTime;
      this.setVisibility(".undo", this._activity.undoHandler);

      this.initializeAttributeInheritance();
    }

    set displayText(val) {
      this.setAttribute("displayText", val);
    }

    get displayText() {
      return this.getAttribute("displayText");
    }

    set statusText(val) {
      this.setAttribute("statusText", val);
    }

    get statusText() {
      return this.getAttribute("statusText");
    }

    set completionTime(val) {
      this.setAttribute(
        "completionTime",
        makeFriendlyDateAgo(new Date(parseInt(val)))
      );
      this.setAttribute("completionTimeTip", this.formatTimeTip(val));
    }

    get completionTime() {
      return this.getAttribute("completionTime");
    }

    get canUndo() {
      return this._activity.undoHandler != null;
    }
  }

  customElements.define(
    "activity-event-richlistitem",
    MozActivityEventRichlistItem,
    {
      extends: "richlistitem",
    }
  );

  /**
   * The MozActivityGroupRichlistItem widget displays information about the activities of
   * the group: e.g. name of the group, list of the activities with their name,
   * progress and icon. It is shown in Activity Manager window. It gets removed
   * when there is no activities from the group.
   *
   * @extends {MozElements.MozRichlistitem}
   */
  class MozActivityGroupRichlistItem extends MozElements.MozRichlistitem {
    static get inheritedAttributes() {
      return {
        ".contextDisplayText":
          "value=contextDisplayText,tooltiptext=contextDisplayTextTip",
      };
    }
    constructor() {
      super();

      this.appendChild(
        MozXULElement.parseXULToFragment(`
          <vbox flex="1">
            <hbox>
              <vbox pack="start">
                <label crop="left" class="contextDisplayText"></label>
              </vbox>
            </hbox>
            <vbox pack="center">
              <richlistbox class="activitygroupbox activityview"
                           seltype="multiple"
                           flex="1"></richlistbox>
            </vbox>
          </vbox>
        `)
      );

      this.setAttribute("is", "activity-group-richlistitem");
      this.contextType = "";

      this.contextObj = null;
    }

    connectedCallback() {
      this.initializeAttributeInheritance();
    }

    get isGroup() {
      return true;
    }

    get processes() {
      return this.querySelector(".activitygroupbox");
    }

    retry() {
      let processes = activityManager.getProcessesByContext(
        this.contextType,
        this.contextObj
      );
      for (let process of processes) {
        if (process.retryHandler) {
          process.retryHandler.retry(process);
        }
      }
    }
  }

  MozXULElement.implementCustomInterface(MozActivityGroupRichlistItem, [
    Ci.nsIDOMXULSelectControlItemElement,
  ]);

  customElements.define(
    "activity-group-richlistitem",
    MozActivityGroupRichlistItem,
    {
      extends: "richlistitem",
    }
  );

  /**
   * The MozActivityProcessRichlistItem widget displays information about the internal
   * process : e.g image, progress, name, date and description.
   * It is typically used in Activity Manager window.
   *
   * @extends MozActivityBaseRichlistItem
   */
  class MozActivityProcessRichlistItem extends MozActivityBaseRichlistItem {
    static get inheritedAttributes() {
      return {
        ".processIconBox > image": "class=iconclass",
        ".displayText": "value=displayText,tooltiptext=displayTextTip",
        ".progressmeter": "value=progress",
        ".statusText": "value=statusText,tooltiptext=statusTextTip",
      };
    }

    connectedCallback() {
      super.connectedCallback();
      if (this.delayConnectedCallback() || this.hasChildNodes()) {
        return;
      }

      this.setAttribute("is", "activity-process-richlistitem");

      this.appendChild(
        MozXULElement.parseXULToFragment(
          `
          <hbox flex="1" class="activityContentBox">
            <vbox pack="center" class="processIconBox">
              <image></image>
            </vbox>
            <vbox flex="1">
              <label crop="center" flex="2" class="displayText"></label>
              <hbox>
                <vbox flex="1">
                  <html:progress value="0"
                                 max="100"
                                 flex="1"
                                 class="progressmeter"></html:progress>
                </vbox>
                <button class="resume mini-button"
                        tooltiptext="&cmd.resume.label;"
                        cmd="cmd_resume"
                        ondblclick="event.stopPropagation();"
                        oncommand="activity.pauseHandler.resume(activity);">
                </button>
                <button class="pause mini-button"
                        tooltiptext="&cmd.pause.label;"
                        cmd="cmd_pause"
                        ondblclick="event.stopPropagation();"
                        oncommand="activity.pauseHandler.pause(activity);">
                </button>
                <button class="retry mini-button"
                        tooltiptext="&cmd.retry.label;"
                        cmd="cmd_retry"
                        ondblclick="event.stopPropagation();"
                        oncommand="activity.retryHandler.retry(activity);">
                </button>
                <button class="cancel mini-button"
                        tooltiptext="&cmd.cancel.label;"
                        cmd="cmd_cancel"
                        ondblclick="event.stopPropagation();"
                        oncommand="activity.cancelHandler.cancel(activity);">
                </button>
              </hbox>
              <label flex="1" crop="right" class="statusText"></label>
              <spacer flex="1"></spacer>
            </vbox>
          </hbox>
          `,
          ["chrome://messenger/locale/activity.dtd"]
        )
      );

      this._activity.QueryInterface(Ci.nsIActivityProcess);

      this.activityListener = {
        onStateChanged: (activity, oldState) => {
          // change the view of the element according to the new state
          // default states for each item
          let hideCancelBut = true;
          let hideRetryBut = true;
          let hidePauseBut = true;
          let hideResumeBut = true;
          let hideProgressMeter = false;
          let displayText = this.displayText;
          let statusText = this.statusText;

          switch (this._activity.state) {
            case Ci.nsIActivityProcess.STATE_INPROGRESS:
              hideCancelBut = !this.canCancel;
              hidePauseBut = !this.canPause;
              // status text is empty
              statusText = "";
              break;
            case Ci.nsIActivityProcess.STATE_COMPLETED:
              // all buttons and progress meter are hidden
              hideProgressMeter = true;
              // status text is empty
              statusText = "";
              break;
            case Ci.nsIActivityProcess.STATE_CANCELED:
              // all buttons and progress meter are hidden
              hideProgressMeter = true;
              statusText = this.text.canceled;
              break;
            case Ci.nsIActivityProcess.STATE_PAUSED:
              hideCancelBut = !this.canCancel;
              hideResumeBut = !this.canPause;
              statusText = this.text.paused;
              break;
            case Ci.nsIActivityProcess.STATE_WAITINGFORINPUT:
              hideCancelBut = !this.canCancel;
              hideProgressMeter = true;
              statusText = this.text.waitingforinput;
              break;
            case Ci.nsIActivityProcess.STATE_WAITINGFORRETRY:
              hideCancelBut = !this.canCancel;
              hideRetryBut = !this.canRetry;
              hideProgressMeter = true;
              statusText = this.text.waitingforretry;
              break;
          }

          // Set the button visibility
          this.setVisibility(".cancel", !hideCancelBut);
          this.setVisibility(".retry", !hideRetryBut);
          this.setVisibility(".pause", !hidePauseBut);
          this.setVisibility(".resume", !hideResumeBut);
          this.setVisibility(".progressmeter", !hideProgressMeter);

          // Ensure progress meter not active when hidden
          if (hideProgressMeter) {
            let meter = document.querySelector(".progressmeter");
            meter.value = 0;
          }

          // Update Status text and Display Text Areas
          // In some states we need to modify Display Text area of
          // the process (e.g. Failure).
          this.displayText = displayText;
          this.statusText = statusText;
        },
        onProgressChanged: (
          activity,
          statusText,
          workUnitsComplete,
          totalWorkUnits
        ) => {
          let element = document.querySelector(".progressmeter");
          if (totalWorkUnits == 0) {
            element.removeAttribute("value");
          } else {
            let _percentComplete = (100.0 * workUnitsComplete) / totalWorkUnits;
            element.value = _percentComplete;
          }
          this.statusText = statusText;
        },
        onHandlerChanged: activity => {
          // update handler buttons' visibilities
          let hideCancelBut = !this.canCancel;
          let hidePauseBut = !this.canPause;
          let hideRetryBut = !this.canRetry;
          let hideResumeBut =
            !this.canPause ||
            this._activity.state == Ci.nsIActivityProcess.STATE_PAUSED;

          this.setVisibility(".cancel", !hideCancelBut);
          this.setVisibility(".retry", !hideRetryBut);
          if (hidePauseBut) {
            this.setVisibility(".pause", !hidePauseBut);
            this.setVisibility(".resume", !hideResumeBut);
          } else {
            this.setVisibility(".pause", this.paused);
            this.setVisibility(".resume", !this.paused);
          }
        },
        QueryInterface: ChromeUtils.generateQI(["nsIActivityListener"]),
      };

      this._activity.addListener(this.activityListener);

      this.setAttribute("class", "activityitem");

      this.displayText = this._activity.displayText;
      // make sure that custom element reflects the latest state of the process
      this.activityListener.onStateChanged(
        this._activity.state,
        Ci.nsIActivityProcess.STATE_NOTSTARTED
      );
      this.activityListener.onProgressChanged(
        this._activity,
        this._activity.lastStatusText,
        this._activity.workUnitComplete,
        this._activity.totalWorkUnits
      );

      this.initializeAttributeInheritance();
    }

    set displayText(val) {
      this.setAttribute("displayText", val);
    }

    get displayText() {
      return this.getAttribute("displayText");
    }

    set statusText(val) {
      this.setAttribute("statusText", val);
    }

    get statusText() {
      return this.getAttribute("statusText");
    }

    get inProgress() {
      return this._activity.state == Ci.nsIActivityProcess.STATE_INPROGRESS;
    }

    get isRemovable() {
      return (
        this._activity.state == Ci.nsIActivityProcess.STATE_COMPLETED ||
        this._activity.state == Ci.nsIActivityProcess.STATE_CANCELED
      );
    }

    get canCancel() {
      return this._activity.cancelHandler != null;
    }

    get canPause() {
      return this._activity.pauseHandler != null;
    }

    get canRetry() {
      return this._activity.retryHandler != null;
    }

    get paused() {
      return (
        parseInt(this.getAttribute("state")) ==
        Ci.nsIActivityProcess.STATE_PAUSED
      );
    }

    get waitingforinput() {
      return (
        parseInt(this.getAttribute("state")) ==
        Ci.nsIActivityProcess.STATE_WAITINGFORINPUT
      );
    }

    get waitingforretry() {
      return (
        parseInt(this.getAttribute("state")) ==
        Ci.nsIActivityProcess.STATE_WAITINGFORRETRY
      );
    }
  }

  customElements.define(
    "activity-process-richlistitem",
    MozActivityProcessRichlistItem,
    {
      extends: "richlistitem",
    }
  );

  /**
   * The MozActivityWarningRichlistItem widget displays information about
   * warnings : e.g image, name, date and description.
   * It is typically used in Activity Manager window.
   *
   * @extends MozActivityBaseRichlistItem
   */
  class MozActivityWarningRichlistItem extends MozActivityBaseRichlistItem {
    static get inheritedAttributes() {
      return {
        ".displayText": "value=displayText,tooltiptext=displayTextTip",
        ".dateTimeTip": "value=dateTime,tooltiptext=dateTimeTip",
        ".statusText": "value=recoveryTipText,tooltiptext=recoveryTipTextTip",
      };
    }

    connectedCallback() {
      super.connectedCallback();
      if (this.delayConnectedCallback() || this.hasChildNodes()) {
        return;
      }
      this.setAttribute("is", "activity-warning-richlistitem");

      this.activityListener = {
        onHandlerChanged: activity => {
          // update handler button's visibility
          this.setVisibility(".recover", this.canRecover);
        },
        QueryInterface: ChromeUtils.generateQI(["nsIActivityListener"]),
      };

      this._activity.addListener(this.activityListener);

      this.appendChild(
        MozXULElement.parseXULToFragment(
          `
          <hbox flex="1">
            <vbox pack="center" class="warningIconBox">
              <image></image>
            </vbox>
            <vbox pack="start" flex="1">
              <hbox align="center" flex="1">
                <label crop="center" flex="1" class="displayText"></label>
                <label class="dateTime"></label>
                <button class="recover mini-button"
                        tooltiptext="&cmd.recover.label;"
                        cmd="cmd_recover"
                        ondblclick="event.stopPropagation();"
                        oncommand="activity.recoveryHandler.recover(activity);">
                </button>
              </hbox>
              <hbox align="center" flex="1">
                <label crop="end" flex="1" class="statusText"></label>
              </hbox>
            </vbox>
          </hbox>
          `,
          ["chrome://messenger/locale/activity.dtd"]
        )
      );

      this.setAttribute("class", "activityitem");

      this._activity.QueryInterface(Ci.nsIActivityWarning);

      this.displayText = this._activity.displayText;
      this.dateTime = this._activity.time;
      this.recoveryTipText = this._activity.recoveryTipText;
      this.setVisibility(".recover", this._activity.recoveryHandler);

      this.initializeAttributeInheritance();
    }

    set displayText(val) {
      this.setAttribute("displayText", val);
    }

    get displayText() {
      return this.getAttribute("displayText");
    }

    set recoveryTipText(val) {
      this.setAttribute("recoveryTipText", val);
    }

    get recoveryTipText() {
      return this.getAttribute("recoveryTipText");
    }

    set dateTime(val) {
      this.setAttribute(
        "dateTime",
        makeFriendlyDateAgo(new Date(parseInt(val)))
      );
    }

    get dateTime() {
      return this.getAttribute("dateTime");
    }

    get canRecover() {
      return this._activity.recoveryHandler != null;
    }
  }

  customElements.define(
    "activity-warning-richlistitem",
    MozActivityWarningRichlistItem,
    {
      extends: "richlistitem",
    }
  );
}
