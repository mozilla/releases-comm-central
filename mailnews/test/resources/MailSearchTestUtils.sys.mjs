/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { Assert } from "resource://testing-common/Assert.sys.mjs";

/**
 * @typedef {object} SearchTermOptions
 * @property {nsMsgSearchAttribValue} attrib - The attribute to search, e.g.
 *   Ci.nsMsgSearchAttrib.Size.
 * @property {nsMsgSearchOpValue} op - The operation, e.g.
 *   Ci.nsMsgSearchOp.Contains.
 * @property {string|integer} [value] - The value to search for. Its type
 *   depends on `attrib`, and is a string for most attributes.
 * @property {string} [customId] - The custom term ID, for
 *   Ci.nsMsgSearchAttrib.Custom.
 * @property {string} [arbitraryHeader] - The header name, for
 *   Ci.nsMsgSearchAttrib.OtherHeader.
 * @property {string} [hdrProperty] - The header property, for
 *   Ci.nsMsgSearchAttrib.HdrProperty and Uint32HdrProperty.
 */

const validityManager = Cc[
  "@mozilla.org/mail/search/validityManager;1"
].getService(Ci.nsIMsgSearchValidityManager);

/**
 * Set the field of a search value that matches its attribute.
 *
 * @param {nsIMsgSearchValue} searchValue
 * @param {nsMsgSearchAttribValue} attrib
 * @param {string|integer} value
 */
function setSearchValue(searchValue, attrib, value) {
  // The attribute has to be set before the value.
  searchValue.attrib = attrib;
  switch (attrib) {
    case Ci.nsMsgSearchAttrib.JunkPercent:
      searchValue.junkPercent = value;
      break;
    case Ci.nsMsgSearchAttrib.Priority:
      searchValue.priority = value;
      break;
    case Ci.nsMsgSearchAttrib.Date:
      searchValue.date = value;
      break;
    case Ci.nsMsgSearchAttrib.MsgStatus:
    case Ci.nsMsgSearchAttrib.FolderFlag:
    case Ci.nsMsgSearchAttrib.Uint32HdrProperty:
      searchValue.status = value;
      break;
    case Ci.nsMsgSearchAttrib.MessageKey:
      searchValue.msgKey = value;
      break;
    case Ci.nsMsgSearchAttrib.Size:
      searchValue.size = value;
      break;
    case Ci.nsMsgSearchAttrib.AgeInDays:
      searchValue.age = value;
      break;
    case Ci.nsMsgSearchAttrib.JunkStatus:
      searchValue.junkStatus = value;
      break;
    case Ci.nsMsgSearchAttrib.HasAttachmentStatus:
      searchValue.status = Ci.nsMsgMessageFlags.Attachment;
      break;
    default:
      searchValue.str = value;
  }
}

export class MailSearchTestUtils {
  /**
   * Run an offline search of a folder with a single term.
   *
   * @param {nsIMsgFolder} folder
   * @param {SearchTermOptions} options
   * @returns {Promise<integer>} The number of hits.
   */
  static search(
    folder,
    { attrib, op, value, customId, arbitraryHeader, hdrProperty }
  ) {
    const session = Cc["@mozilla.org/messenger/searchSession;1"].createInstance(
      Ci.nsIMsgSearchSession
    );
    session.addScopeTerm(Ci.nsMsgSearchScope.offlineMail, folder);

    const term = session.createTerm();
    term.attrib = attrib;
    // term.value returns a copy, so it has to be assigned back.
    const searchValue = term.value;
    setSearchValue(searchValue, attrib, value);
    term.value = searchValue;
    term.op = op;
    term.booleanAnd = false;
    if (attrib == Ci.nsMsgSearchAttrib.Custom) {
      term.customId = customId;
    } else if (attrib == Ci.nsMsgSearchAttrib.OtherHeader) {
      term.arbitraryHeader = arbitraryHeader;
    } else if (
      attrib == Ci.nsMsgSearchAttrib.HdrProperty ||
      attrib == Ci.nsMsgSearchAttrib.Uint32HdrProperty
    ) {
      term.hdrProperty = hdrProperty;
    }
    session.appendTerm(term);

    const { promise, resolve } = Promise.withResolvers();
    let hitCount = 0;
    session.registerListener({
      onNewSearch() {
        hitCount = 0;
      },
      onSearchHit() {
        hitCount++;
      },
      onSearchDone() {
        resolve(hitCount);
      },
    });
    session.search(false);
    return promise;
  }

  /**
   * Run an offline search of a folder with a single term, and check the
   * number of hits.
   *
   * @param {nsIMsgFolder} folder
   * @param {SearchTermOptions} options
   * @param {integer} expectedCount
   */
  static async assertHitCount(folder, options, expectedCount) {
    Assert.equal(
      await this.search(folder, options),
      expectedCount,
      `Searching for ${JSON.stringify(options.value)} (attrib ${options.attrib}, op ${options.op}) should find ${expectedCount} messages`
    );
  }

  /**
   * Check whether a search operation is available and enabled for an
   * attribute in a scope.
   *
   * @param {nsMsgSearchScopeValue} scope
   * @param {nsMsgSearchOpValue} op
   * @param {nsMsgSearchAttribValue} attrib
   * @param {boolean} expected - Whether it should be available and enabled.
   */
  static assertValidity(scope, op, attrib, expected) {
    const table = validityManager.getTable(scope);
    const description = `op ${op} for attrib ${attrib} in scope ${scope}`;
    Assert.equal(
      table.getAvailable(attrib, op),
      expected,
      `Availability of ${description} should be ${expected}`
    );
    Assert.equal(
      table.getEnabled(attrib, op),
      expected,
      `Enabled state of ${description} should be ${expected}`
    );
  }
}
