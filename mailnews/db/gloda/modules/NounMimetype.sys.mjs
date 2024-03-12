/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Gloda } from "resource:///modules/gloda/Gloda.sys.mjs";

import { GlodaConstants } from "resource:///modules/gloda/GlodaConstants.sys.mjs";

var LOG = console.createInstance({
  prefix: "gloda.noun.mimetype",
  maxLogLevel: "Warn",
  maxLogLevelPref: "gloda.loglevel",
});

var CategoryStringMap = {};

/**
 * Input data structure to allow us to build a fast mapping from mime type to
 *  category name.  The keys in MimeCategoryMapping are the top-level
 *  categories.  Each value can either be a list of MIME types or a nested
 *  object which recursively defines sub-categories.  We currently do not use
 *  the sub-categories.  They are just there to try and organize the MIME types
 *  a little and open the door to future enhancements.
 *
 * Do _not_ add additional top-level categories unless you have added
 *  corresponding entries to gloda.properties under the
 *  "gloda.mimetype.category" branch and are making sure localizers are aware
 *  of the change and have time to localize it.
 *
 * Entries with wildcards in them are part of a fallback strategy by the
 *  |mimeTypeNoun| and do not actually use regular expressions or anything like
 *  that.  Everything is a straight string lookup.  Given "foo/bar" we look for
 *  "foo/bar", then "foo/*", and finally "*".
 */
var MimeCategoryMapping = {
  archives: [
    "application/java-archive",
    "application/x-java-archive",
    "application/x-jar",
    "application/x-java-jnlp-file",

    "application/mac-binhex40",
    "application/vnd.ms-cab-compressed",

    "application/x-arc",
    "application/x-arj",
    "application/x-compress",
    "application/x-compressed-tar",
    "application/x-cpio",
    "application/x-cpio-compressed",
    "application/x-deb",

    "application/x-bittorrent",

    "application/x-rar",
    "application/x-rar-compressed",
    "application/x-7z-compressed",
    "application/zip",
    "application/x-zip-compressed",
    "application/x-zip",

    "application/x-bzip",
    "application/x-bzip-compressed-tar",
    "application/x-bzip2",
    "application/x-gzip",
    "application/x-tar",
    "application/x-tar-gz",
    "application/x-tarz",
  ],
  documents: {
    database: [
      "application/vnd.ms-access",
      "application/x-msaccess",
      "application/msaccess",
      "application/vnd.msaccess",
      "application/x-msaccess",
      "application/mdb",
      "application/x-mdb",

      "application/vnd.oasis.opendocument.database",
    ],
    graphics: [
      "application/postscript",
      "application/x-bzpostscript",
      "application/x-dvi",
      "application/x-gzdvi",

      "application/illustrator",

      "application/vnd.corel-draw",
      "application/cdr",
      "application/coreldraw",
      "application/x-cdr",
      "application/x-coreldraw",
      "image/cdr",
      "image/x-cdr",
      "zz-application/zz-winassoc-cdr",

      "application/vnd.oasis.opendocument.graphics",
      "application/vnd.oasis.opendocument.graphics-template",
      "application/vnd.oasis.opendocument.image",

      "application/x-dia-diagram",
    ],
    presentation: [
      "application/vnd.ms-powerpoint.presentation.macroenabled.12",
      "application/vnd.ms-powerpoint.template.macroenabled.12",
      "application/vnd.ms-powerpoint",
      "application/powerpoint",
      "application/mspowerpoint",
      "application/x-mspowerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.openxmlformats-officedocument.presentationml.template",

      "application/vnd.oasis.opendocument.presentation",
      "application/vnd.oasis.opendocument.presentation-template",
    ],
    spreadsheet: [
      "application/vnd.lotus-1-2-3",
      "application/x-lotus123",
      "application/x-123",
      "application/lotus123",
      "application/wk1",

      "application/x-quattropro",

      "application/vnd.ms-excel.sheet.binary.macroenabled.12",
      "application/vnd.ms-excel.sheet.macroenabled.12",
      "application/vnd.ms-excel.template.macroenabled.12",
      "application/vnd.ms-excel",
      "application/msexcel",
      "application/x-msexcel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.template",

      "application/vnd.oasis.opendocument.formula",
      "application/vnd.oasis.opendocument.formula-template",
      "application/vnd.oasis.opendocument.chart",
      "application/vnd.oasis.opendocument.chart-template",
      "application/vnd.oasis.opendocument.spreadsheet",
      "application/vnd.oasis.opendocument.spreadsheet-template",

      "application/x-gnumeric",
    ],
    wordProcessor: [
      "application/msword",
      "application/vnd.ms-word",
      "application/x-msword",
      "application/msword-template",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.template",
      "application/vnd.ms-word.document.macroenabled.12",
      "application/vnd.ms-word.template.macroenabled.12",
      "application/x-mswrite",
      "application/x-pocket-word",

      "application/rtf",
      "text/rtf",

      "application/vnd.oasis.opendocument.text",
      "application/vnd.oasis.opendocument.text-master",
      "application/vnd.oasis.opendocument.text-template",
      "application/vnd.oasis.opendocument.text-web",

      "application/vnd.wordperfect",

      "application/x-abiword",
      "application/x-amipro",
    ],
    suite: ["application/vnd.ms-works"],
  },
  images: ["image/*"],
  media: {
    audio: ["audio/*"],
    video: ["video/*"],
    container: [
      "application/ogg",

      "application/smil",
      "application/vnd.ms-asf",
      "application/vnd.rn-realmedia",
      "application/x-matroska",
      "application/x-quicktime-media-link",
      "application/x-quicktimeplayer",
    ],
  },
  other: ["*"],
  pdf: [
    "application/pdf",
    "application/x-pdf",
    "image/pdf",
    "file/pdf",
    "application/x-bzpdf",
    "application/x-gzpdf",
  ],
};

/**
 * Mime type abstraction that exists primarily so we can map mime types to
 *  integer id's.
 *
 * Instances of this class should only be retrieved via |MimeTypeNoun|; no one
 *  should ever create an instance directly.
 */
export function MimeType(aID, aType, aSubType, aFullType, aCategory) {
  this._id = aID;
  this._type = aType;
  this._subType = aSubType;
  this._fullType = aFullType;
  this._category = aCategory;
}

MimeType.prototype = {
  /**
   * The integer id we have associated with the mime type.  This is stable for
   *  the lifetime of the database, which means that anything in the Gloda
   *  database can use this without fear.  Things not persisted in the database
   *  should use the actual string mime type, retrieval via |fullType|.
   */
  get id() {
    return this._id;
  },
  /**
   * The first part of the MIME type; "text/plain" gets you "text".
   */
  get type() {
    return this._type;
  },
  set fullType(aFullType) {
    if (!this._fullType) {
      this._fullType = aFullType;
      [this._type, this._subType] = this._fullType.split("/");
      this._category = MimeTypeNoun._getCategoryForMimeType(
        aFullType,
        this._type
      );
    }
  },
  /**
   * If the |fullType| is "text/plain", subType is "plain".
   */
  get subType() {
    return this._subType;
  },
  /**
   * The full MIME type; "text/plain" returns "text/plain".
   */
  get fullType() {
    return this._fullType;
  },
  toString() {
    return this.fullType;
  },

  /**
   * @returns the category we believe this mime type belongs to.  This category
   *     name should never be shown directly to the user.  Instead, use
   *     |categoryLabel| to get the localized name for the category.  The
   *     category mapping comes from mimeTypesCategories.js.
   */
  get category() {
    return this._category;
  },
  /**
   * @returns The localized label for the category from gloda.properties in the
   *     "gloda.mimetype.category.CATEGORY.label" definition using the value
   *     from |category|.
   */
  get categoryLabel() {
    return CategoryStringMap[this._category];
  },
};

/**
 * Mime type noun provider.
 *
 * The set of MIME Types is sufficiently limited that we can keep them all in
 *  memory.  In theory it is also sufficiently limited that we could use the
 *  parameter mechanism in the database.  However, it is more efficient, for
 *  both space and performance reasons, to store the specific mime type as a
 *  value.  For future-proofing reasons, we opt to use a database table to
 *  persist the mapping rather than a hard-coded list.  A preferences file or
 *  other text file would arguably suffice, but for consistency reasons, the
 *  database is not a bad thing.
 */
export var MimeTypeNoun = {
  name: "mime-type",
  clazz: MimeType, // gloda supports clazz as well as class
  allowsArbitraryAttrs: false,

  _strings: Services.strings.createBundle(
    "chrome://messenger/locale/gloda.properties"
  ),

  // note! update test_noun_mimetype if you change our internals!
  _mimeTypes: {},
  _mimeTypesByID: {},
  TYPE_BLOCK_SIZE: 16384,
  _mimeTypeHighID: {},
  _mimeTypeRangeDummyObjects: {},
  _highID: 0,

  // we now use the exciting 'schema' mechanism of defineNoun to get our table
  //  created for us, plus some helper methods that we simply don't use.
  schema: {
    name: "mimeTypes",
    columns: [
      ["id", "INTEGER PRIMARY KEY", "_id"],
      ["mimeType", "TEXT", "fullType"],
    ],
  },

  _init() {
    LOG.debug("loading MIME types");
    this._loadCategoryMapping();
    this._loadMimeTypes();
  },

  /**
   * A map from MIME type to category name.
   */
  _mimeTypeToCategory: {},
  /**
   * Load the contents of MimeTypeCategories and populate
   */
  _loadCategoryMapping() {
    const mimeTypeToCategory = this._mimeTypeToCategory;

    function procMapObj(aSubTree, aCategories) {
      for (const key in aSubTree) {
        const value = aSubTree[key];
        // Add this category to our nested categories list.  Use concat since
        //  the list will be long-lived and each list needs to be distinct.
        const categories = aCategories.concat();
        categories.push(key);

        if (categories.length == 1) {
          CategoryStringMap[key] = MimeTypeNoun._strings.GetStringFromName(
            "gloda.mimetype.category." + key + ".label"
          );
        }

        // Is it an array? If so, just process this depth
        if (Array.isArray(value)) {
          for (const mimeTypeStr of value) {
            mimeTypeToCategory[mimeTypeStr] = categories;
          }
        } else {
          // it's yet another sub-tree branch
          procMapObj(value, categories);
        }
      }
    }
    procMapObj(MimeCategoryMapping, []);
  },

  /**
   * Lookup the category associated with a MIME type given its full type and
   *  type.  (So, "foo/bar" and "foo" for "foo/bar".)
   */
  _getCategoryForMimeType(aFullType, aType) {
    if (aFullType in this._mimeTypeToCategory) {
      return this._mimeTypeToCategory[aFullType][0];
    }
    const wildType = aType + "/*";
    if (wildType in this._mimeTypeToCategory) {
      return this._mimeTypeToCategory[wildType][0];
    }
    return this._mimeTypeToCategory["*"][0];
  },

  /**
   * In order to allow the gloda query mechanism to avoid hitting the database,
   *  we need to either define the noun type as cacheable and have a super-large
   *  cache or simply have a collection with every MIME type in it that stays
   *  alive forever.
   * This is that collection.  It is initialized by |_loadMimeTypes|.  As new
   *  MIME types are created, we add them to the collection.
   */
  _universalCollection: null,

  /**
   * Kick off a query of all the mime types in our database, leaving
   *  |_processMimeTypes| to actually do the legwork.
   */
  _loadMimeTypes() {
    // get all the existing mime types!
    const query = Gloda.newQuery(this.id);
    const nullFunc = function () {};
    this._universalCollection = query.getCollection(
      {
        onItemsAdded: nullFunc,
        onItemsModified: nullFunc,
        onItemsRemoved: nullFunc,
        onQueryCompleted(aCollection) {
          MimeTypeNoun._processMimeTypes(aCollection.items);
        },
      },
      null
    );
  },

  /**
   * For the benefit of our Category queryHelper, we need dummy ranged objects
   *  that cover the numerical address space allocated to the category.  We
   *  can't use a real object for the upper-bound because the upper-bound is
   *  constantly growing and there is the chance the query might get persisted,
   *  which means these values need to be long-lived.  Unfortunately, our
   *  solution to this problem (dummy objects) complicates the second case,
   *  should it ever occur.  (Because the dummy objects cannot be persisted
   *  on their own... but there are other issues that will come up that we will
   *  just have to deal with then.)
   */
  _createCategoryDummies(aId, aCategory) {
    const blockBottom = aId - (aId % this.TYPE_BLOCK_SIZE);
    const blockTop = blockBottom + this.TYPE_BLOCK_SIZE - 1;
    this._mimeTypeRangeDummyObjects[aCategory] = [
      new MimeType(
        blockBottom,
        "!category-dummy!",
        aCategory,
        "!category-dummy!/" + aCategory,
        aCategory
      ),
      new MimeType(
        blockTop,
        "!category-dummy!",
        aCategory,
        "!category-dummy!/" + aCategory,
        aCategory
      ),
    ];
  },

  _processMimeTypes(aMimeTypes) {
    for (const mimeType of aMimeTypes) {
      if (mimeType.id > this._highID) {
        this._highID = mimeType.id;
      }
      this._mimeTypes[mimeType] = mimeType;
      this._mimeTypesByID[mimeType.id] = mimeType;

      const blockHighID =
        mimeType.category in this._mimeTypeHighID
          ? this._mimeTypeHighID[mimeType.category]
          : undefined;
      // create the dummy range objects
      if (blockHighID === undefined) {
        this._createCategoryDummies(mimeType.id, mimeType.category);
      }
      if (blockHighID === undefined || mimeType.id > blockHighID) {
        this._mimeTypeHighID[mimeType.category] = mimeType.id;
      }
    }
  },

  _addNewMimeType(aMimeTypeName) {
    const [typeName, subTypeName] = aMimeTypeName.split("/");
    const category = this._getCategoryForMimeType(aMimeTypeName, typeName);

    if (!(category in this._mimeTypeHighID)) {
      const nextID =
        this._highID -
        (this._highID % this.TYPE_BLOCK_SIZE) +
        this.TYPE_BLOCK_SIZE;
      this._mimeTypeHighID[category] = nextID;
      this._createCategoryDummies(nextID, category);
    }

    const nextID = ++this._mimeTypeHighID[category];

    const mimeType = new MimeType(
      nextID,
      typeName,
      subTypeName,
      aMimeTypeName,
      category
    );
    if (mimeType.id > this._highID) {
      this._highID = mimeType.id;
    }

    this._mimeTypes[aMimeTypeName] = mimeType;
    this._mimeTypesByID[nextID] = mimeType;

    // As great as the gloda extension mechanisms are, we don't think it makes
    //  a lot of sense to use them in this case.  So we directly trigger object
    //  insertion without any of the grokNounItem stuff.
    this.objInsert.call(this.datastore, mimeType);
    // Since we bypass grokNounItem and its fun, we need to explicitly add the
    //  new MIME-type to _universalCollection ourselves.  Don't try this at
    //  home, kids.
    this._universalCollection._onItemsAdded([mimeType]);

    return mimeType;
  },

  /**
   * Map a mime type to a |MimeType| instance, creating it if necessary.
   *
   * @param aMimeTypeName The mime type.  It may optionally include parameters
   *     (which will be ignored).  A mime type is of the form "type/subtype".
   *     A type with parameters would look like 'type/subtype; param="value"'.
   */
  getMimeType(aMimeTypeName) {
    // first, lose any parameters
    const semiIndex = aMimeTypeName.indexOf(";");
    if (semiIndex >= 0) {
      aMimeTypeName = aMimeTypeName.substring(0, semiIndex);
    }
    aMimeTypeName = aMimeTypeName.trim().toLowerCase();

    if (aMimeTypeName in this._mimeTypes) {
      return this._mimeTypes[aMimeTypeName];
    }
    return this._addNewMimeType(aMimeTypeName);
  },

  /**
   * Query helpers contribute additional functions to the query object for the
   *  attributes that use the noun type.  For example, we define Category, so
   *  for the "attachmentTypes" attribute, "attachmentTypesCategory" would be
   *  exposed.
   */
  queryHelpers: {
    /**
     * Query for MIME type categories based on one or more MIME type objects
     *  passed in.  We want the range to span the entire block allocated to the
     *  category.
     *
     * @param aAttrDef The attribute that is using us.
     * @param aArguments The actual arguments object that
     */
    Category(aAttrDef, aArguments) {
      const rangePairs = [];
      // If there are no arguments then we want to fall back to the 'in'
      //  constraint which matches on any attachment.
      if (!aArguments || aArguments.length == 0) {
        return this._inConstraintHelper(aAttrDef, []);
      }

      for (let iArg = 0; iArg < aArguments.length; iArg++) {
        const arg = aArguments[iArg];
        rangePairs.push(MimeTypeNoun._mimeTypeRangeDummyObjects[arg.category]);
      }
      return this._rangedConstraintHelper(aAttrDef, rangePairs);
    },
  },

  comparator(a, b) {
    if (a == null) {
      if (b == null) {
        return 0;
      }
      return 1;
    } else if (b == null) {
      return -1;
    }
    return a.fullType.localeCompare(b.fullType);
  },

  toParamAndValue(aMimeType) {
    return [null, aMimeType.id];
  },
  toJSON(aMimeType) {
    return aMimeType.id;
  },
  fromJSON(aMimeTypeID) {
    return this._mimeTypesByID[aMimeTypeID];
  },
};

Gloda.defineNoun(MimeTypeNoun, GlodaConstants.NOUN_MIME_TYPE);
try {
  MimeTypeNoun._init();
} catch (ex) {
  LOG.error(
    "problem init-ing: " + ex.fileName + ":" + ex.lineNumber + ": " + ex
  );
}
