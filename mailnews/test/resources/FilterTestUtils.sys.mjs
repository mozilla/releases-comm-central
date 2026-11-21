/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * The search term for each trigger name: the attribute, the operator, the
 * nsIMsgSearchValue field holding the value, and the header name for
 * arbitrary headers.
 *
 * @type {{[trigger: string]: [nsMsgSearchAttribValue, nsMsgSearchOpValue, string, ?string]}}
 */
const TRIGGERS = {
  subject: [
    Ci.nsMsgSearchAttrib.Subject,
    Ci.nsMsgSearchOp.Contains,
    "str",
    null,
  ],
  from: [Ci.nsMsgSearchAttrib.Sender, Ci.nsMsgSearchOp.Contains, "str", null],
  date: [Ci.nsMsgSearchAttrib.Date, Ci.nsMsgSearchOp.Is, "date", null],
  size: [Ci.nsMsgSearchAttrib.Size, Ci.nsMsgSearchOp.Is, "size", null],
  "message-id": [
    Ci.nsMsgSearchAttrib.OtherHeader + 1,
    Ci.nsMsgSearchOp.Contains,
    "str",
    "Message-ID",
  ],
  "user-agent": [
    Ci.nsMsgSearchAttrib.OtherHeader + 2,
    Ci.nsMsgSearchOp.Contains,
    "str",
    "User-Agent",
  ],
};

/**
 * The filter action for each action name, and optionally the nsIMsgRuleAction
 * field to set and its value.
 *
 * @type {{[action: string]: [nsMsgRuleActionType, string?, any?]}}
 */
const ACTIONS = {
  priority: [Ci.nsMsgFilterAction.ChangePriority, "priority", 6],
  delete: [Ci.nsMsgFilterAction.Delete],
  read: [Ci.nsMsgFilterAction.MarkRead],
  unread: [Ci.nsMsgFilterAction.MarkUnread],
  kill: [Ci.nsMsgFilterAction.KillThread],
  watch: [Ci.nsMsgFilterAction.WatchThread],
  flag: [Ci.nsMsgFilterAction.MarkFlagged],
  stop: [Ci.nsMsgFilterAction.StopExecution],
  tag: [Ci.nsMsgFilterAction.AddTag, "strValue", "tag"],
};

export class FilterTestUtils {
  /**
   * Create an enabled news filter with one term and one action, and append it
   * to a filter list.
   *
   * @param {nsIMsgFilterList} list
   * @param {string} trigger - What to match: "subject", "from", "date",
   *   "size", "message-id" or "user-agent".
   * @param {string|integer} value - The value to match the trigger against.
   * @param {string} action - What to do: "priority", "delete", "read",
   *   "unread", "kill", "watch", "flag", "stop" or "tag".
   * @returns {nsIMsgFilter}
   */
  static createFilter(list, trigger, value, action) {
    if (!(trigger in TRIGGERS)) {
      throw new Error(`Unknown trigger ${trigger}`);
    }
    if (!(action in ACTIONS)) {
      throw new Error(`Unknown action ${action}`);
    }

    const filter = list.createFilter(`${trigger}${action}Test`);
    filter.filterType = Ci.nsMsgFilterType.NewsRule;

    const [attrib, op, valueField, header] = TRIGGERS[trigger];
    const term = filter.createTerm();
    term.matchAll = false;
    term.attrib = attrib;
    if (header) {
      term.arbitraryHeader = header;
    }
    term.op = op;
    const searchValue = term.value;
    searchValue.attrib = attrib;
    searchValue[valueField] = value;
    term.value = searchValue;
    term.booleanAnd = true;
    filter.appendTerm(term);

    const [type, field, fieldValue] = ACTIONS[action];
    const filterAction = filter.createAction();
    filterAction.type = type;
    if (field) {
      filterAction[field] = fieldValue;
    }
    filter.appendAction(filterAction);

    filter.enabled = true;
    list.insertFilterAt(list.filterCount, filter);
    return filter;
  }
}
