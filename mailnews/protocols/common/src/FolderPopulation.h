/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#ifndef COMM_MAILNEWS_PROTOCOLS_COMMON_SRC_FOLDERPOPULATION_H_
#define COMM_MAILNEWS_PROTOCOLS_COMMON_SRC_FOLDERPOPULATION_H_

#include "ErrorList.h"

class nsIMsgFolder;
class nsIMsgPluggableStore;

/**
 * Populate the recursive folder hierarchy rooted at `parent`.
 *
 * Use the provided `messageStore` to discover child folders at each level in
 * the hierarchy. If `deep` is true, child folder hierarchies will be
 * recursively populated.
 */
nsresult PopulateFolderHierarchy(nsIMsgFolder* parent,
                                 nsIMsgPluggableStore* messageStore, bool deep);

#endif  // COMM_MAILNEWS_PROTOCOLS_COMMON_SRC_FOLDERPOPULATION_H_
