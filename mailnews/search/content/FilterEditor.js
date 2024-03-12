/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from searchTerm.js */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { MailUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailUtils.sys.mjs"
);
var { PluralForm } = ChromeUtils.importESModule(
  "resource:///modules/PluralForm.sys.mjs"
);

// The actual filter that we're editing if it is a _saved_ filter or prefill;
// void otherwise.
var gFilter;
// cache the key elements we need
var gFilterList;
// The filter name as it appears in the "Filter Name" field of dialog.
var gFilterNameElement;
var gFilterTypeSelector;
var gFilterBundle;
var gPreFillName;
var gFilterActionList;
var gCustomActions = null;
var gFilterType;
var gFilterPosition = 0;

var gFilterActionStrings = [
  "none",
  "movemessage",
  "setpriorityto",
  "deletemessage",
  "markasread",
  "ignorethread",
  "watchthread",
  "markasflagged",
  "label",
  "replytomessage",
  "forwardmessage",
  "stopexecution",
  "deletefrompopserver",
  "leaveonpopserver",
  "setjunkscore",
  "fetchfrompopserver",
  "copymessage",
  "addtagtomessage",
  "ignoresubthread",
  "markasunread",
];

// A temporary filter with the current state of actions in the UI.
var gTempFilter = null;
// nsIMsgRuleAction[] - the currently defined actions in the order they will be run.
var gActionListOrdered = null;

var gFilterEditorMsgWindow = null;

window.addEventListener("DOMContentLoaded", filterEditorOnLoad, { once: true });
document.addEventListener("dialogaccept", onAccept);

function filterEditorOnLoad() {
  getCustomActions();
  initializeSearchWidgets();
  initializeFilterWidgets();

  gFilterBundle = document.getElementById("bundle_filter");

  if ("arguments" in window && window.arguments[0]) {
    var args = window.arguments[0];

    if ("filterList" in args) {
      gFilterList = args.filterList;
      // the postPlugin filters cannot be applied to servers that are
      // deferred, (you must define them on the deferredTo server instead).
      const server = gFilterList.folder.server;
      if (server.rootFolder != server.rootMsgFolder) {
        gFilterTypeSelector.disableDeferredAccount();
      }
    }

    if ("filterPosition" in args) {
      gFilterPosition = args.filterPosition;
    }

    if ("filter" in args) {
      // editing a filter
      gFilter = window.arguments[0].filter;
      initializeDialog(gFilter);
    } else {
      if (gFilterList) {
        setSearchScope(getScopeFromFilterList(gFilterList));
      }
      // if doing prefill filter create a new filter and populate it.
      if ("filterName" in args) {
        gPreFillName = args.filterName;

        // Passing null as the parameter to createFilter to keep the name empty
        // until later where we assign the name.
        gFilter = gFilterList.createFilter(null);

        var term = gFilter.createTerm();

        term.attrib = Ci.nsMsgSearchAttrib.Default;
        if ("fieldName" in args && args.fieldName) {
          // fieldName should contain the name of the field in which to search,
          // from nsMsgSearchTerm.cpp::SearchAttribEntryTable, e.g. "to" or "cc"
          try {
            term.attrib = term.getAttributeFromString(args.fieldName);
          } catch (e) {
            /* Invalid string is fine, just ignore it. */
          }
        }
        if (term.attrib == Ci.nsMsgSearchAttrib.Default) {
          term.attrib = Ci.nsMsgSearchAttrib.Sender;
        }

        term.op = Ci.nsMsgSearchOp.Is;
        term.booleanAnd = gSearchBooleanRadiogroup.value == "and";

        var termValue = term.value;
        termValue.attrib = term.attrib;
        termValue.str = gPreFillName;

        term.value = termValue;

        gFilter.appendTerm(term);

        // the default action for news filters is Delete
        // for everything else, it's MoveToFolder
        var filterAction = gFilter.createAction();
        filterAction.type =
          getScopeFromFilterList(gFilterList) == Ci.nsMsgSearchScope.newsFilter
            ? Ci.nsMsgFilterAction.Delete
            : Ci.nsMsgFilterAction.MoveToFolder;
        gFilter.appendAction(filterAction);
        initializeDialog(gFilter);
      } else if ("copiedFilter" in args) {
        // we are copying a filter
        const copiedFilter = args.copiedFilter;
        const copiedName = gFilterBundle.getFormattedString(
          "copyToNewFilterName",
          [copiedFilter.filterName]
        );
        const newFilter = gFilterList.createFilter(copiedName);

        // copy the actions
        for (let i = 0; i < copiedFilter.actionCount; i++) {
          const filterAction = copiedFilter.getActionAt(i);
          newFilter.appendAction(filterAction);
        }

        // copy the search terms
        for (const searchTerm of copiedFilter.searchTerms) {
          const newTerm = newFilter.createTerm();
          newTerm.attrib = searchTerm.attrib;
          newTerm.op = searchTerm.op;
          newTerm.booleanAnd = searchTerm.booleanAnd;
          newTerm.value = searchTerm.value;
          newFilter.appendTerm(newTerm);
        }

        newFilter.filterType = copiedFilter.filterType;

        gPreFillName = copiedName;
        gFilter = newFilter;

        initializeDialog(gFilter);

        // We reset the filter name, because otherwise the saveFilter()
        // function thinks we are editing a filter, and will thus skip the name
        // uniqueness check.
        gFilter.filterName = "";
      } else {
        // fake the first more button press
        onMore(null);
      }
    }
  }

  if (!gFilter) {
    // This is a new filter. Set to both Incoming and Manual contexts.
    gFilterTypeSelector.setType(
      Ci.nsMsgFilterType.Incoming | Ci.nsMsgFilterType.Manual
    );
  }

  // in the case of a new filter, we may not have an action row yet.
  ensureActionRow();
  gFilterType = gFilterTypeSelector.getType();

  gFilterNameElement.select();
  // This call is required on mac and linux.  It has no effect under win32.  See bug 94800.
  gFilterNameElement.focus();
}

function onEnterInSearchTerm(event) {
  if (event.ctrlKey || (Services.appinfo.OS == "Darwin" && event.metaKey)) {
    // If accel key (Ctrl on Win/Linux, Cmd on Mac) was held too, accept the dialog.
    document.querySelector("dialog").acceptDialog();
  } else {
    // If only plain Enter was pressed, add a new rule line.
    onMore(event);
  }
}

function onAccept(event) {
  try {
    if (!saveFilter()) {
      event.preventDefault();
      return;
    }
  } catch (e) {
    console.error(e);
    event.preventDefault();
    return;
  }

  // parent should refresh filter list..
  // this should REALLY only happen when some criteria changes that
  // are displayed in the filter dialog, like the filter name
  window.arguments[0].refresh = true;
  window.arguments[0].newFilter = gFilter;
}

function duplicateFilterNameExists(filterName) {
  if (gFilterList) {
    for (var i = 0; i < gFilterList.filterCount; i++) {
      if (filterName == gFilterList.getFilterAt(i).filterName) {
        return true;
      }
    }
  }
  return false;
}

function getScopeFromFilterList(filterList) {
  if (!filterList) {
    dump("yikes, null filterList\n");
    return Ci.nsMsgSearchScope.offlineMail;
  }
  return filterList.folder.server.filterScope;
}

function getScope(filter) {
  return getScopeFromFilterList(filter.filterList);
}

function initializeFilterWidgets() {
  gFilterNameElement = document.getElementById("filterName");
  gFilterActionList = document.getElementById("filterActionList");
  initializeFilterTypeSelector();
}

function initializeFilterTypeSelector() {
  /**
   * This object controls code interaction with the widget allowing specifying
   * the filter type (event when the filter is run).
   */
  gFilterTypeSelector = {
    checkBoxManual: document.getElementById("runManual"),
    checkBoxIncoming: document.getElementById("runIncoming"),

    menulistIncoming: document.getElementById("pluginsRunOrder"),

    menuitemBeforePlugins: document.getElementById("runBeforePlugins"),
    menuitemAfterPlugins: document.getElementById("runAfterPlugins"),

    checkBoxArchive: document.getElementById("runArchive"),
    checkBoxOutgoing: document.getElementById("runOutgoing"),
    checkBoxPeriodic: document.getElementById("runPeriodic"),

    /**
     * Returns the currently set filter type (checkboxes) in terms
     * of a Ci.Ci.nsMsgFilterType value.
     */
    getType() {
      let type = Ci.nsMsgFilterType.None;

      if (this.checkBoxManual.checked) {
        type |= Ci.nsMsgFilterType.Manual;
      }

      if (this.checkBoxIncoming.checked) {
        if (this.menulistIncoming.selectedItem == this.menuitemAfterPlugins) {
          type |= Ci.nsMsgFilterType.PostPlugin;
        } else if (
          getScopeFromFilterList(gFilterList) == Ci.nsMsgSearchScope.newsFilter
        ) {
          type |= Ci.nsMsgFilterType.NewsRule;
        } else {
          type |= Ci.nsMsgFilterType.InboxRule;
        }
      }

      if (this.checkBoxArchive.checked) {
        type |= Ci.nsMsgFilterType.Archive;
      }

      if (this.checkBoxOutgoing.checked) {
        type |= Ci.nsMsgFilterType.PostOutgoing;
      }

      if (this.checkBoxPeriodic.checked) {
        type |= Ci.nsMsgFilterType.Periodic;
      }

      return type;
    },

    /**
     * Sets the checkboxes to represent the filter type passed in.
     *
     * @param aType  the filter type to set in terms
     *               of Ci.Ci.nsMsgFilterType values.
     */
    setType(aType) {
      // If there is no type (event) requested, force "when manually run"
      if (aType == Ci.nsMsgFilterType.None) {
        aType = Ci.nsMsgFilterType.Manual;
      }

      this.checkBoxManual.checked = aType & Ci.nsMsgFilterType.Manual;

      this.checkBoxIncoming.checked =
        aType & (Ci.nsMsgFilterType.PostPlugin | Ci.nsMsgFilterType.Incoming);

      this.menulistIncoming.selectedItem =
        aType & Ci.nsMsgFilterType.PostPlugin
          ? this.menuitemAfterPlugins
          : this.menuitemBeforePlugins;

      this.checkBoxArchive.checked = aType & Ci.nsMsgFilterType.Archive;

      this.checkBoxOutgoing.checked = aType & Ci.nsMsgFilterType.PostOutgoing;

      this.checkBoxPeriodic.checked = aType & Ci.nsMsgFilterType.Periodic;
      const periodMinutes = gFilterList.folder.server.getIntValue(
        "periodicFilterRateMinutes"
      );
      document.getElementById("runPeriodic").label = PluralForm.get(
        periodMinutes,
        gFilterBundle.getString("contextPeriodic.label")
      ).replace("#1", periodMinutes);

      this.updateClassificationMenu();
    },

    /**
     * Enable the "before/after classification" menulist depending on
     * whether "run when incoming mail" is selected.
     */
    updateClassificationMenu() {
      this.menulistIncoming.disabled = !this.checkBoxIncoming.checked;
      updateFilterType();
    },

    /**
     * Disable the options unsuitable for deferred accounts.
     */
    disableDeferredAccount() {
      this.menuitemAfterPlugins.disabled = true;
      this.checkBoxOutgoing.disabled = true;
    },
  };
}

function initializeDialog(filter) {
  gFilterNameElement.value = filter.filterName;
  gFilterTypeSelector.setType(filter.filterType);

  const numActions = filter.actionCount;
  for (let actionIndex = 0; actionIndex < numActions; actionIndex++) {
    const filterAction = filter.getActionAt(actionIndex);

    const newActionRow = document.createXULElement("richlistitem", {
      is: "ruleaction-richlistitem",
    });
    newActionRow.setAttribute("initialActionIndex", actionIndex);
    newActionRow.className = "ruleaction";
    gFilterActionList.appendChild(newActionRow);
    newActionRow.setAttribute(
      "value",
      filterAction.type == Ci.nsMsgFilterAction.Custom
        ? filterAction.customId
        : gFilterActionStrings[filterAction.type]
    );
    newActionRow.setAttribute("onfocus", "this.storeFocus();");
  }

  var gSearchScope = getFilterScope(
    getScope(filter),
    filter.filterType,
    filter.filterList
  );
  initializeSearchRows(gSearchScope, filter.searchTerms);
  setFilterScope(filter.filterType, filter.filterList);
}

function ensureActionRow() {
  // make sure we have at least one action row visible to the user
  if (!gFilterActionList.getRowCount()) {
    const newActionRow = document.createXULElement("richlistitem", {
      is: "ruleaction-richlistitem",
    });
    newActionRow.className = "ruleaction";
    gFilterActionList.appendChild(newActionRow);
    newActionRow.mRemoveButton.disabled = true;
  }
}

// move to overlay
function saveFilter() {
  // See if at least one filter type (activation event) is selected.
  if (gFilterType == Ci.nsMsgFilterType.None) {
    Services.prompt.alert(
      window,
      gFilterBundle.getString("mustHaveFilterTypeTitle"),
      gFilterBundle.getString("mustHaveFilterTypeMessage")
    );
    return false;
  }

  const filterName = gFilterNameElement.value;
  // If we think have a duplicate, then we need to check that if we
  // have an original filter name (i.e. we are editing a filter), then
  // we must check that the original is not the current as that is what
  // the duplicateFilterNameExists function will have picked up.
  if (
    (!gFilter || gFilter.filterName != filterName) &&
    duplicateFilterNameExists(filterName)
  ) {
    Services.prompt.alert(
      window,
      gFilterBundle.getString("cannotHaveDuplicateFilterTitle"),
      gFilterBundle.getString("cannotHaveDuplicateFilterMessage")
    );
    return false;
  }

  // Check that all of the search attributes and operators are valid.
  function rule_desc(index, obj) {
    return (
      index +
      1 +
      " (" +
      obj.searchattribute.label +
      ", " +
      obj.searchoperator.label +
      ")"
    );
  }

  let invalidRule = false;
  for (let index = 0; index < gSearchTerms.length; index++) {
    const obj = gSearchTerms[index].obj;
    // We don't need to check validity of matchAll terms
    if (obj.matchAll) {
      continue;
    }

    // the term might be an offscreen one that we haven't initialized yet
    const searchTerm = obj.searchTerm;
    if (!searchTerm && !gSearchTerms[index].initialized) {
      continue;
    }

    if (isNaN(obj.searchattribute.value)) {
      // is this a custom term?
      const customTerm = MailServices.filters.getCustomTerm(
        obj.searchattribute.value
      );
      if (!customTerm) {
        invalidRule = true;
        console.error(
          "Filter not saved because custom search term '" +
            obj.searchattribute.value +
            "' in rule " +
            rule_desc(index, obj) +
            " not found"
        );
      } else if (
        !customTerm.getAvailable(obj.searchScope, obj.searchattribute.value)
      ) {
        invalidRule = true;
        console.error(
          "Filter not saved because custom search term '" +
            customTerm.name +
            "' in rule " +
            rule_desc(index, obj) +
            " not available"
        );
      }
    } else {
      const otherHeader = Ci.nsMsgSearchAttrib.OtherHeader;
      const attribValue =
        obj.searchattribute.value > otherHeader
          ? otherHeader
          : obj.searchattribute.value;
      if (
        !obj.searchattribute.validityTable.getAvailable(
          attribValue,
          obj.searchoperator.value
        )
      ) {
        invalidRule = true;
        console.error(
          "Filter not saved because standard search term '" +
            attribValue +
            "' in rule " +
            rule_desc(index, obj) +
            " not available in this context"
        );
      }
    }

    if (invalidRule) {
      Services.prompt.alert(
        window,
        gFilterBundle.getString("searchTermsInvalidTitle"),
        gFilterBundle.getFormattedString("searchTermsInvalidRule", [
          obj.searchattribute.label,
          obj.searchoperator.label,
        ])
      );
      return false;
    }
  }

  // before we go any further, validate each specified filter action, abort the save
  // if any of the actions is invalid...
  for (let index = 0; index < gFilterActionList.itemCount; index++) {
    var listItem = gFilterActionList.getItemAtIndex(index);
    if (!listItem.validateAction()) {
      return false;
    }
  }

  // if we made it here, all of the actions are valid, so go ahead and save the filter
  let isNewFilter;
  if (!gFilter) {
    // This is a new filter
    gFilter = gFilterList.createFilter(filterName);
    isNewFilter = true;
    gFilter.enabled = true;
  } else {
    // We are working with an existing filter object,
    // either editing or using prefill
    gFilter.filterName = filterName;
    // Prefilter is treated as a new filter.
    if (gPreFillName) {
      isNewFilter = true;
      gFilter.enabled = true;
    } else {
      isNewFilter = false;
    }

    gFilter.clearActionList();
  }

  // add each filteraction to the filter
  for (let index = 0; index < gFilterActionList.itemCount; index++) {
    gFilterActionList.getItemAtIndex(index).saveToFilter(gFilter);
  }

  // If we do not have a filter name at this point, generate one.
  if (!gFilter.filterName) {
    AssignMeaningfulName();
  }

  gFilter.filterType = gFilterType;
  gFilter.searchTerms = saveSearchTerms(gFilter.searchTerms, gFilter);

  if (isNewFilter) {
    // new filter - insert into gFilterList
    gFilterList.insertFilterAt(gFilterPosition, gFilter);
  }

  // success!
  return true;
}

/**
 * Check if the list of actions the user created will be executed in a different order.
 * Exposes a note to the user if that is the case.
 */
function checkActionsReorder() {
  setTimeout(_checkActionsReorder, 0);
}

/**
 * This should be called from setTimeout otherwise some of the elements calling
 * may not be fully initialized yet (e.g. we get ".saveToFilter is not a function").
 * It is OK to schedule multiple timeouts with this function.
 */
function _checkActionsReorder() {
  // Create a temporary disposable filter and add current actions to it.
  if (!gTempFilter) {
    gTempFilter = gFilterList.createFilter("");
  } else {
    gTempFilter.clearActionList();
  }

  for (let index = 0; index < gFilterActionList.itemCount; index++) {
    gFilterActionList.getItemAtIndex(index).saveToFilter(gTempFilter);
  }

  // Now get the actions out of the filter in the order they will be executed in.
  gActionListOrdered = gTempFilter.sortedActionList;

  // Compare the two lists.
  const statusBar = document.getElementById("statusbar");
  for (let index = 0; index < gActionListOrdered.length; index++) {
    if (index != gTempFilter.getActionIndex(gActionListOrdered[index])) {
      // If the lists are not the same unhide the status bar and show warning.
      statusBar.style.visibility = "visible";
      return;
    }
  }

  statusBar.style.visibility = "hidden";
}

/**
 * Show a dialog with the ordered list of actions.
 * The fetching of action label and argument is separated from checkActionsReorder
 * function to make that one more lightweight. The list is built only upon
 * user request.
 */
function showActionsOrder() {
  // Fetch the actions and arguments as a string.
  const actionStrings = [];
  for (let i = 0; i < gFilterActionList.itemCount; i++) {
    const ruleAction = gFilterActionList.getItemAtIndex(i);
    const actionTarget = ruleAction.children[1];
    const actionItem = actionTarget.ruleactiontargetElement;
    const actionItemLabel = actionItem && actionItem.children[0].label;

    const actionString = {
      label: ruleAction.mRuleActionType.label,
      argument: "",
    };
    if (actionItem) {
      if (actionItemLabel) {
        actionString.argument = actionItemLabel;
      } else {
        actionString.argument = actionItem.children[0].value;
      }
    }
    actionStrings.push(actionString);
  }

  // Present a nicely formatted list of action names and arguments.
  let actionList = gFilterBundle.getString("filterActionOrderExplanation");
  for (let i = 0; i < gActionListOrdered.length; i++) {
    const actionIndex = gTempFilter.getActionIndex(gActionListOrdered[i]);
    const action = actionStrings[actionIndex];
    actionList += gFilterBundle.getFormattedString("filterActionItem", [
      i + 1,
      action.label,
      action.argument,
    ]);
  }

  Services.prompt.confirmEx(
    window,
    gFilterBundle.getString("filterActionOrderTitle"),
    actionList,
    Services.prompt.BUTTON_TITLE_OK,
    null,
    null,
    null,
    null,
    { value: false }
  );
}

function AssignMeaningfulName() {
  // termRoot points to the first search object, which is the one we care about.
  const termRoot = gSearchTerms[0].obj;
  // stub is used as the base name for a filter.
  let stub;

  // If this is a Match All Messages Filter, we already know the name to assign.
  if (termRoot.matchAll) {
    stub = gFilterBundle.getString("matchAllFilterName");
  } else {
    // Assign a name based on the first search term.
    const term = termRoot.searchattribute.label;
    const operator = termRoot.searchoperator.label;
    const value = termRoot.searchvalue.getReadableValue();
    stub = gFilterBundle.getFormattedString("filterAutoNameStr", [
      term,
      operator,
      value,
    ]);
  }

  // Whatever name we have used, 'uniquify' it.
  let tempName = stub;
  let count = 1;
  while (duplicateFilterNameExists(tempName)) {
    count++;
    tempName = `${stub} ${count}`;
  }
  gFilter.filterName = tempName;
}

function UpdateAfterCustomHeaderChange() {
  updateSearchAttributes();
}

function SetBusyCursor(window, enable) {
  // setCursor() is only available for chrome windows.
  // However one of our frames is the start page which
  // is a non-chrome window, so check if this window has a
  // setCursor method
  if ("setCursor" in window) {
    if (enable) {
      window.setCursor("wait");
    } else {
      window.setCursor("auto");
    }
  }
}

/* globals openHelp */
// suite/components/helpviewer/content/contextHelp.js
function doHelpButton() {
  openHelp("mail-filters");
}

function getCustomActions() {
  if (!gCustomActions) {
    gCustomActions = MailServices.filters.getCustomActions();
  }
}

function updateFilterType() {
  gFilterType = gFilterTypeSelector.getType();
  setFilterScope(gFilterType, gFilterList);

  // set valid actions
  var ruleActions = gFilterActionList.getElementsByAttribute(
    "class",
    "ruleaction"
  );
  for (var i = 0; i < ruleActions.length; i++) {
    ruleActions[i].mRuleActionType.hideInvalidActions();
  }
}

// Given a filter type, set the global search scope to the filter scope
function setFilterScope(aFilterType, aFilterList) {
  const filterScope = getFilterScope(
    getScopeFromFilterList(aFilterList),
    aFilterType,
    aFilterList
  );
  setSearchScope(filterScope);
}

//
// Given the base filter scope for a server, and the filter
// type, return the scope used for filter. This assumes a
// hierarchy of contexts, with incoming the most restrictive,
// followed by manual and post-plugin.
function getFilterScope(aServerFilterScope, aFilterType, aFilterList) {
  if (aFilterType & Ci.nsMsgFilterType.Incoming) {
    return aServerFilterScope;
  }

  // Manual or PostPlugin
  // local mail allows body and junk types
  if (aServerFilterScope == Ci.nsMsgSearchScope.offlineMailFilter) {
    return Ci.nsMsgSearchScope.offlineMail;
  }
  // IMAP and NEWS online don't allow body
  return Ci.nsMsgSearchScope.onlineManual;
}

/**
 * Re-focus the action that was focused before focus was lost.
 */
function setLastActionFocus() {
  let lastAction = gFilterActionList.getAttribute("focusedAction");
  if (!lastAction || lastAction < 0) {
    lastAction = 0;
  }
  if (lastAction >= gFilterActionList.itemCount) {
    lastAction = gFilterActionList.itemCount - 1;
  }

  gFilterActionList.getItemAtIndex(lastAction).mRuleActionType.focus();
}
