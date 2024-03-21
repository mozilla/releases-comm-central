/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global MozXULElement, activityManager */

// Wrap in a block to prevent leaking to window scope.
{
  const { makeFriendlyDateAgo } = ChromeUtils.importESModule(
    "resource:///modules/TemplateUtils.sys.mjs"
  );

  const activityStrings = Services.strings.createBundle(
    "chrome://messenger/locale/activity.properties"
  );

  /**
   * The ActivityItemBase widget is the base class for all the activity item.
   * It initializes activity details: i.e. id, status, icon, name, progress,
   * date etc. for the activity widgets.
   *
   * @abstract
   * @augments HTMLLIElement
   */
  class ActivityItemBase extends HTMLLIElement {
    connectedCallback() {
      if (!this.hasChildNodes()) {
        // fetch the activity and set the base attributes
        this.log = console.createInstance({
          prefix: "mail.activity",
          maxLogLevel: "Warn",
          maxLogLevelPref: "mail.activity.loglevel",
        });
        const actID = this.getAttribute("actID");
        this._activity = activityManager.getActivity(actID);
        this._activity.QueryInterface(this.constructor.activityInterface);

        // Construct the children.
        this.classList.add("activityitem");

        const icon = document.createElement("img");
        icon.setAttribute(
          "src",
          this._activity.iconClass
            ? `chrome://messenger/skin/icons/new/activity/${this._activity.iconClass}Icon.svg`
            : this.constructor.defaultIconSrc
        );
        icon.setAttribute("alt", "");
        this.appendChild(icon);

        const display = document.createElement("span");
        display.classList.add("displayText");
        this.appendChild(display);

        if (this.isEvent || this.isWarning) {
          const time = document.createElement("time");
          time.classList.add("dateTime");
          this.appendChild(time);
        }

        if (this.isProcess) {
          const progress = document.createElement("progress");
          progress.setAttribute("value", "0");
          progress.setAttribute("max", "100");
          progress.classList.add("progressmeter");
          this.appendChild(progress);
        }

        const statusText = document.createElement("span");
        statusText.setAttribute("role", "note");
        statusText.classList.add("statusText");
        this.appendChild(statusText);
      }
      // (Re-)Attach the listener.
      this.attachToActivity();
    }

    disconnectedCallback() {
      this.detachFromActivity();
    }

    get isProcess() {
      return this.constructor.activityInterface == Ci.nsIActivityProcess;
    }

    get isEvent() {
      return this.constructor.activityInterface == Ci.nsIActivityEvent;
    }

    get isWarning() {
      return this.constructor.activityInterface == Ci.nsIActivityWarning;
    }

    get isGroup() {
      return false;
    }

    get activity() {
      return this._activity;
    }

    detachFromActivity() {
      if (this.activityListener) {
        this._activity.removeListener(this.activityListener);
      }
    }

    attachToActivity() {
      if (this.activityListener) {
        this._activity.addListener(this.activityListener);
      }
    }

    static _dateTimeFormatter = new Services.intl.DateTimeFormat(undefined, {
      dateStyle: "long",
      timeStyle: "short",
    });

    /**
     * The time the activity occurred.
     *
     * @type {number} - The time in milliseconds since the epoch.
     */
    set dateTime(time) {
      const element = this.querySelector(".dateTime");
      if (!element) {
        return;
      }
      time = new Date(parseInt(time));

      element.setAttribute("datetime", time.toISOString());
      element.textContent = makeFriendlyDateAgo(time);
      element.setAttribute(
        "title",
        this.constructor._dateTimeFormatter.format(time)
      );
    }

    /**
     * The text that describes additional information to the user.
     *
     * @type {string}
     */
    set statusText(val) {
      this.querySelector(".statusText").textContent = val;
    }

    get statusText() {
      return this.querySelector(".statusText").textContent;
    }

    /**
     * The text that describes the activity to the user.
     *
     * @type {string}
     */
    set displayText(val) {
      this.querySelector(".displayText").textContent = val;
    }

    get displayText() {
      return this.querySelector(".displayText").textContent;
    }
  }

  /**
   * The MozActivityEvent widget displays information about events (like
   * deleting or moving the message): e.g image, name, date and description.
   * It is typically used in Activity Manager window.
   *
   * @augments ActivityItemBase
   */
  class ActivityEventItem extends ActivityItemBase {
    static defaultIconSrc =
      "chrome://messenger/skin/icons/new/activity/defaultEventIcon.svg";
    static activityInterface = Ci.nsIActivityEvent;

    connectedCallback() {
      super.connectedCallback();
      this.setAttribute("is", "activity-event-item");

      this.displayText = this.activity.displayText;
      this.statusText = this.activity.statusText;
      this.dateTime = this.activity.completionTime;
    }
  }

  customElements.define("activity-event-item", ActivityEventItem, {
    extends: "li",
  });

  /**
   * The ActivityGroupItem widget displays information about the activities of
   * the group: e.g. name of the group, list of the activities with their name,
   * progress and icon. It is shown in Activity Manager window. It gets removed
   * when there is no activities from the group.
   *
   * @augments HTMLLIElement
   */
  class ActivityGroupItem extends HTMLLIElement {
    constructor() {
      super();

      const heading = document.createElement("h2");
      heading.classList.add("contextDisplayText");
      this.appendChild(heading);

      const list = document.createElement("ul");
      list.classList.add("activitygroup-list", "activityview");
      this.appendChild(list);

      this.classList.add("activitygroup");
      this.setAttribute("is", "activity-group-item");
    }

    /**
     * The text heading for the group, as seen by the user.
     *
     * @type {string}
     */
    set contextDisplayText(val) {
      this.querySelector(".contextDisplayText").textContent = val;
    }

    get contextDisplayText() {
      return this.querySelctor(".contextDisplayText").textContent;
    }

    get isGroup() {
      return true;
    }
  }

  customElements.define("activity-group-item", ActivityGroupItem, {
    extends: "li",
  });

  /**
   * The ActivityProcessItem widget displays information about the internal
   * process : e.g image, progress, name, date and description.
   * It is typically used in Activity Manager window.
   *
   * @augments ActivityItemBase
   */
  class ActivityProcessItem extends ActivityItemBase {
    static defaultIconSrc =
      "chrome://messenger/skin/icons/new/activity/deafultProcessIcon.svg";
    static activityInterface = Ci.nsIActivityProcess;
    static textMap = {
      paused: activityStrings.GetStringFromName("paused2"),
      canceled: activityStrings.GetStringFromName("canceled"),
      failed: activityStrings.GetStringFromName("failed"),
      waitingforinput: activityStrings.GetStringFromName("waitingForInput"),
      waitingforretry: activityStrings.GetStringFromName("waitingForRetry"),
    };

    constructor() {
      super();

      this.activityListener = {
        onStateChanged: (activity, oldState) => {
          // change the view of the element according to the new state
          // default states for each item
          let hideProgressMeter = false;
          let statusText = this.statusText;

          switch (this.activity.state) {
            case Ci.nsIActivityProcess.STATE_INPROGRESS:
              statusText = "";
              break;
            case Ci.nsIActivityProcess.STATE_COMPLETED:
              hideProgressMeter = true;
              statusText = "";
              break;
            case Ci.nsIActivityProcess.STATE_CANCELED:
              hideProgressMeter = true;
              statusText = this.constructor.textMap.canceled;
              break;
            case Ci.nsIActivityProcess.STATE_PAUSED:
              statusText = this.constructor.textMap.paused;
              break;
            case Ci.nsIActivityProcess.STATE_WAITINGFORINPUT:
              statusText = this.constructor.textMap.waitingforinput;
              break;
            case Ci.nsIActivityProcess.STATE_WAITINGFORRETRY:
              hideProgressMeter = true;
              statusText = this.constructor.textMap.waitingforretry;
              break;
          }

          // Set the visibility
          const meter = this.querySelector(".progressmeter");
          meter.hidden = hideProgressMeter;

          // Ensure progress meter not active when hidden
          if (hideProgressMeter) {
            meter.value = 0;
          }

          // Update Status text and Display Text Areas
          // In some states we need to modify Display Text area of
          // the process (e.g. Failure).
          this.statusText = statusText;
        },
        onProgressChanged: (
          activity,
          statusText,
          workUnitsComplete,
          totalWorkUnits
        ) => {
          const element = document.querySelector(".progressmeter");
          if (totalWorkUnits == 0) {
            element.removeAttribute("value");
          } else {
            const _percentComplete =
              (100.0 * workUnitsComplete) / totalWorkUnits;
            element.value = _percentComplete;
          }
          this.statusText = statusText;
        },
      };
    }

    connectedCallback() {
      super.connectedCallback();
      this.setAttribute("is", "activity-process-item");

      this.displayText = this.activity.displayText;
      // make sure that custom element reflects the latest state of the process
      this.activityListener.onStateChanged(
        this.activity.state,
        Ci.nsIActivityProcess.STATE_NOTSTARTED
      );
      this.activityListener.onProgressChanged(
        this.activity,
        this.activity.lastStatusText,
        this.activity.workUnitComplete,
        this.activity.totalWorkUnits
      );
    }

    get inProgress() {
      return this.activity.state == Ci.nsIActivityProcess.STATE_INPROGRESS;
    }

    get isRemovable() {
      return (
        this.activity.state == Ci.nsIActivityProcess.STATE_COMPLETED ||
        this.activity.state == Ci.nsIActivityProcess.STATE_CANCELED
      );
    }
  }

  customElements.define("activity-process-item", ActivityProcessItem, {
    extends: "li",
  });

  /**
   * The ActivityWarningItem widget displays information about
   * warnings : e.g image, name, date and description.
   * It is typically used in Activity Manager window.
   *
   * @augments ActivityItemBase
   */
  class ActivityWarningItem extends ActivityItemBase {
    static defaultIconSrc =
      "chrome://messenger/skin/icons/new/activity/warning.svg";
    static activityInterface = Ci.nsIActivityWarning;

    connectedCallback() {
      super.connectedCallback();
      this.setAttribute("is", "activity-warning-item");

      this.displayText = this.activity.displayText;
      this.dateTime = this.activity.time;
      this.statusText = this.activity.recoveryTipText;
    }
  }

  customElements.define("activity-warning-item", ActivityWarningItem, {
    extends: "li",
  });
}
