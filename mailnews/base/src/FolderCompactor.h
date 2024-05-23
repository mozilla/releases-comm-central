/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#ifndef COMM_MAILNEWS_BASE_SRC_FOLDERCOMPACTOR_H_
#define COMM_MAILNEWS_BASE_SRC_FOLDERCOMPACTOR_H_

#include "nsTArray.h"
#include "mozilla/RefPtr.h"

class nsIMsgFolder;
class nsIMsgWindow;
class nsIUrlListener;
enum class nsresult : uint32_t;

/**
 * Perform compaction on the given folders.
 * Compaction means removing deleted messages from the msgStore and
 * updating the retained messages in the database with new storeTokens
 * (and sizes).
 *
 * - Progress/status updates will be communicated to the GUI window.
 * - When the operation completes, listener.onStopRunningUrl() will be called.
 * - listener.onStartRunningUrl() is never called.
 * - The operation is considered complete when all the folders have been
 *   compacted.
 * - It's safe to call this with an empty list of folders. The listener
 *   will still be called.
 * - The listener will _never_ be called before AsyncCompactFolders()
 *   returns.
 * - If AsyncCompactFolders() returns a failure code, no listener callbacks
 *   will be invoked.
 * - If any errors occur, the failing folder will be rolled back to it's
 *   previous state. Successfully compacted folders will stay compacted.
 *
 * This routine DOES NOT perform an expunge for IMAP folders, or attempt to
 * rebuild missing/out-of-date databases for local folders.
 * Previous compaction code did attempt to handle this, but it was
 * inconsistent and got very confusing. The folder-specific implementations
 * (e.g. nsImapMailFolder::Compact()) deal with that stuff _before_ calling
 * AsyncCompactFolders().
 *
 * @param folders  - The folders to compact.
 * @param listener - Callback to invoke when operation is complete.
 *                   The request param will be nullptr, and the status param
 *                   indicates the success or failure of the operation.
 */
nsresult AsyncCompactFolders(nsTArray<RefPtr<nsIMsgFolder>> const& folders,
                             nsIUrlListener* listener, nsIMsgWindow* window);

#endif  // COMM_MAILNEWS_BASE_SRC_FOLDERCOMPACTOR_H_
