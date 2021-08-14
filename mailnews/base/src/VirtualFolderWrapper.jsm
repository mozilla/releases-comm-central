/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Wrap everything about virtual folders.
 */

const EXPORTED_SYMBOLS = ["VirtualFolderHelper"];

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");

var VirtualFolderHelper = {
  /**
   * Create a new virtual folder (an actual nsIMsgFolder that did not previously
   *  exist), wrapping it in a VirtualFolderWrapper, and returning that wrapper.
   *
   * If the call to addSubfolder fails (and therefore throws), we will NOT catch
   *  it.
   *
   * @param aFolderName The name of the new folder to create.
   * @param aParentFolder The folder in which to create the search folder.
   * @param aSearchFolders A list of nsIMsgFolders that you want to use as the
   *     sources for the virtual folder OR a string that is the already '|'
   *     delimited list of folder URIs to use.
   * @param {nsIMsgSearchTerms[]} aSearchTerms - The search terms to
   *     use for the virtual folder.
   * @param aOnlineSearch Should the search attempt to use the server's search
   *     capabilities when possible and appropriate?
   *
   * @return The VirtualFolderWrapper wrapping the newly created folder.  You
   *     would probably only want this for its virtualFolder attribute which has
   *     the nsIMsgFolder we created.  Be careful about accessing any of the
   *     other attributes, as they will bring its message database back to life.
   */
  createNewVirtualFolder(
    aFolderName,
    aParentFolder,
    aSearchFolders,
    aSearchTerms,
    aOnlineSearch
  ) {
    let msgFolder = aParentFolder.addSubfolder(aFolderName);
    msgFolder.prettyName = aFolderName;
    msgFolder.setFlag(Ci.nsMsgFolderFlags.Virtual);

    let wrappedVirt = new VirtualFolderWrapper(msgFolder);
    wrappedVirt.searchTerms = aSearchTerms;
    wrappedVirt.searchFolders = aSearchFolders;
    wrappedVirt.onlineSearch = aOnlineSearch;

    let msgDatabase = msgFolder.msgDatabase;
    msgDatabase.summaryValid = true;
    msgDatabase.Close(true);

    aParentFolder.NotifyItemAdded(msgFolder);
    MailServices.accounts.saveVirtualFolders();

    return wrappedVirt;
  },

  /**
   * Given an existing nsIMsgFolder that is a virtual folder, wrap it into a
   *  VirtualFolderWrapper.
   */
  wrapVirtualFolder(aMsgFolder) {
    return new VirtualFolderWrapper(aMsgFolder);
  },
};

/**
 * Abstracts dealing with the properties of a virtual folder that differentiate
 *  it from a non-virtual folder.  A virtual folder is an odd duck.  When
 *  holding an nsIMsgFolder that is a virtual folder, it is distinguished by
 *  the virtual flag and a number of properties that tell us the string
 *  representation of its search, the folders it searches over, and whether we
 *  use online searching or not.
 * Virtual folders and their defining attributes are loaded from
 *  virtualFolders.dat (in the profile directory) by the account manager at
 *  startup, (re-)creating them if need be.  It also saves them back to the
 *  file at shutdown.  The most important thing the account manager does is to
 *  create VirtualFolderChangeListener instances that are registered with the
 *  message database service.  This means that if one of the databases for the
 *  folders that the virtual folder includes is opened for some reason (for
 *  example, new messages are added to the folder because of a filter or they
 *  are delivered there), the virtual folder gets a chance to know about this
 *  and update the virtual folder's "cache" of information, such as the message
 *  counts or the presence of the message in the folder.
 * The odd part is that a lot of the virtual folder logic also happens as a
 *  result of the nsMsgDBView subclasses being told the search query and the
 *  underlying folders.  This makes for an odd collaboration of UI and backend
 *  logic.
 *
 * Justification for this class:  Virtual folders aren't all that complex, but
 *  they are complex enough that we don't want to have the same code duplicated
 *  all over the place.  We also don't want to have a loose assembly of global
 *  functions for working with them.  So here we are.
 *
 * Important! Accessing any of our attributes results in the message database
 *  being loaded so that we can access the dBFolderInfo associated with the
 *  database.  The message database is not automatically forgotten by the
 *  folder, which can lead to an (effective) memory leak.  Please make sure
 *  that you are playing your part in not leaking memory by only using the
 *  wrapper when you have a serious need to access the database, and by
 *  forcing the folder to forget about the database when you are done by
 *  setting the database to null (unless you know with confidence someone else
 *  definitely wants the database around and will clean it up.)
 */
function VirtualFolderWrapper(aVirtualFolder) {
  this.virtualFolder = aVirtualFolder;
}
VirtualFolderWrapper.prototype = {
  /**
   * @return the list of nsIMsgFolders that this virtual folder is a
   *     search over.
   */
  get searchFolders() {
    return this.dbFolderInfo
      .getCharProperty("searchFolderUri")
      .split("|")
      .map(uri => MailUtils.getExistingFolder(uri))
      .filter(Boolean);
  },
  /**
   * Set the search folders that back this virtual folder.
   *
   * @param {string|nsIMsgFolder[]} - aFolders Either a "|"-delimited string of
   *   folder URIs or a list of folders
   */
  set searchFolders(aFolders) {
    if (typeof aFolders == "string") {
      this.dbFolderInfo.setCharProperty("searchFolderUri", aFolders);
    } else {
      let uris = aFolders.map(folder => folder.URI);
      this.dbFolderInfo.setCharProperty("searchFolderUri", uris.join("|"));
    }
  },

  /**
   * @return a "|"-delimited string containing the URIs of the folders that back
   *     this virtual folder.
   */
  get searchFolderURIs() {
    return this.dbFolderInfo.getCharProperty("searchFolderUri");
  },

  /**
   * @return the list of search terms that define this virtual folder.
   */
  get searchTerms() {
    return this.searchTermsSession.searchTerms;
  },
  /**
   * @return a newly created filter with the search terms loaded into it that
   *     define this virtual folder.  The filter is apparently useful as an
   *     nsIMsgSearchSession stand-in to some code.
   */
  get searchTermsSession() {
    // Temporary means it doesn't get exposed to the UI and doesn't get saved to
    //  disk.  Which is good, because this is just a trick to parse the string
    //  into search terms.
    let filterList = MailServices.filters.getTempFilterList(this.virtualFolder);
    let tempFilter = filterList.createFilter("temp");
    filterList.parseCondition(tempFilter, this.searchString);
    return tempFilter;
  },

  /**
   * Set the search string for this virtual folder to the stringified version of
   *  the provided list of nsIMsgSearchTerm search terms.  If you already have
   *  a strinigified version of the search constraint, just set |searchString|
   *  directly.
   *
   * @param {string[]} aTerms - a list of search terms
   */
  set searchTerms(aTerms) {
    let condition = "";
    for (let term of aTerms) {
      if (condition) {
        condition += " ";
      }
      if (term.matchAll) {
        condition = "ALL";
        break;
      }
      condition += term.booleanAnd ? "AND (" : "OR (";
      condition += term.termAsString + ")";
    }
    this.searchString = condition;
  },

  /**
   * @return the set of search terms that define this virtual folder as a
   *     string.  You may prefer to use |searchTerms| which converts them
   *     into a list of nsIMsgSearchTerms instead.
   */
  get searchString() {
    return this.dbFolderInfo.getCharProperty("searchStr");
  },
  /**
   * Set the search that defines this virtual folder from a string.  If you have
   *  a list of nsIMsgSearchTerms, you should use |searchTerms| instead.
   */
  set searchString(aSearchString) {
    this.dbFolderInfo.setCharProperty("searchStr", aSearchString);
  },

  /**
   * @return whether the virtual folder is configured for online search.
   */
  get onlineSearch() {
    return this.dbFolderInfo.getBooleanProperty("searchOnline", false);
  },
  /**
   * Set whether the virtual folder is configured for online search.
   */
  set onlineSearch(aOnlineSearch) {
    this.dbFolderInfo.setBooleanProperty("searchOnline", aOnlineSearch);
  },

  /**
   * @return the dBFolderInfo associated with the virtual folder directly.  May
   *     be null.  Will cause the message database to be opened, which may have
   *     memory bloat/leak ramifications, so make sure the folder's database was
   *     already going to be opened anyways or that you call
   *     |cleanUpMessageDatabase|.
   */
  get dbFolderInfo() {
    let msgDatabase = this.virtualFolder.msgDatabase;
    return msgDatabase && msgDatabase.dBFolderInfo;
  },

  /**
   * Avoid memory bloat by making the virtual folder forget about its database.
   *  If the database is actually in use (read: someone is keeping it alive by
   *  having references to it from places other than the nsIMsgFolder), the
   *  folder will be able to re-establish the reference for minimal cost.
   */
  cleanUpMessageDatabase() {
    this.virtualFolder.msgDatabase.Close(true);
    this.virtualFolder.msgDatabase = null;
  },
};
