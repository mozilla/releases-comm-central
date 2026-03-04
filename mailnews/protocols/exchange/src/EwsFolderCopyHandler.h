/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSFOLDERCOPYHANDLER_H_
#define COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSFOLDERCOPYHANDLER_H_

#include "IEwsClient.h"
#include "EwsFolder.h"

#include "nsHashKeys.h"
#include "nscore.h"

#include "nsIMsgCopyServiceListener.h"
#include "nsIMsgFolder.h"
#include "nsIMsgHdr.h"
#include "nsIMsgWindow.h"
#include "nsTArray.h"
#include "nsTHashMap.h"

class FolderCreateCopyCallbacks;

/**
 * A handler for a single folder copy/move operation.
 *
 * An instance of `FolderCopyHandler` is created for each copy/move operation. A
 * single operation always targets a single folder, but includes its subfolders,
 * meaning we might end up copying or moving multiple folders.
 *
 * The current process of copying or moving a folder is the following (assuming
 * no failure):
 *    1. A consumer requests a folder to be copied to an EWS folder
 *       (`EwsFolder::CopyFolder()`).
 *    2. The EWS folder class instantiates a copy handler, and instructs it to
 *       start the operation (`FolderCopyHandler::CopyNextFolder()`).
 *    3. The copy handler instructs its EWS client to begin creating a folder
 *       with the current source folder's name on the server, underneath its
 *       logical parent in the destination folder's hierarchy
 *       (`IEwsClient::CreateFolder()`). It is called with an instance of
 *       `FolderCreateCopyCallbacks`.
 *    4. Once the folder has been created on the EWS server, the EWS client
 *       instructs its callbacks instance to create the new folder locally
 *       (`FolderCreateCopyCallbacks::OnSuccess()`).
 *    5. The callbacks instance notifies the copy handler of the operation's
 *       success (`FolderCopyHandler::OnFolderCreateFinished()`).
 *    6. The copy handler iterates over all the subfolders in the source
 *       folders, and adds them to the end of the list of folders to copy.
 *    7. The copy handler builds a list of all the messages in the source folder
 *       (non-recursively). If there are messages in this list, it instructs the
 *       newly-created folder to start copying them from the source folder
 *       (`EwsFolder::CopyMessages()`). It is called with an instance of
 *       `MessageCopyListener`. If there are no messages to copy, it skips
 *       straight to step 9.
 *    8. The new folder notifies the listener when all the messages have been
 *       copied (`MessageCopyListener::OnStopCopy()`).
 *    9. `FolderCopyHandler::CopyNextFolder()` is called. If there are more
 *       folders to copy, the copy handler moves to the next folder in the list
 *       and starts the process again from step 3. Otherwise the operation stops
 *       there.
 */
class FolderCopyHandler {
 public:
  MOZ_DECLARE_REFCOUNTED_TYPENAME(FolderCopyHandler)
  NS_INLINE_DECL_REFCOUNTING(FolderCopyHandler)

  FolderCopyHandler(nsIMsgFolder* srcFolder, EwsFolder* dstFolder, bool isMove,
                    nsIMsgWindow* window, IEwsClient* client,
                    nsIMsgCopyServiceListener* copyServiceListener)
      : mDstFolder(dstFolder),
        mIsMove(isMove),
        mWindow(window),
        mFoldersToCopy({srcFolder}),
        mClient(client),
        mCopyServiceListener(copyServiceListener),
        mCurIndex(-1) {
    mDstParents.InsertOrUpdate(srcFolder, dstFolder);
  }

  /**
   * Start copying the next folder in line.
   *
   * Consumers should call his method with the source folder to initiate the
   * copy operation, after which the handler itself will call it for any
   * subfolder that needs to be copied as part of this operation.
   */
  nsresult CopyNextFolder();

  friend class FolderCreateCopyCallbacks;

 protected:
  virtual ~FolderCopyHandler() = default;

  /**
   * The method below is expected to be called by a friend class, such as
   * `FolderCreateCopyCallbacks`.
   */

  /**
   * Signals to the handler that the folder creation has finished, and provides
   * it with a reference to the newly-created folder. If `status` represents a
   * failure, `newFolder` may be null.
   */
  nsresult OnFolderCreateFinished(nsresult status, nsIMsgFolder* newFolder);

 private:
  // Parameters of the copy/move operation.
  RefPtr<EwsFolder> mDstFolder;
  bool mIsMove;
  nsCOMPtr<nsIMsgWindow> mWindow;

  // The folders to copy. This list starts with only the source folder, and may
  // grow as the operation progresses and subfolders are added to it.
  nsTArray<RefPtr<nsIMsgFolder>> mFoldersToCopy;

  // A map tracking the destination folder in which to copy each folder in
  // `mFoldersToCopy` (or in other words, the final parent of each copy from
  // that list).
  //
  // This is necessary because we might not have references to the copy
  // destination of every folder in the list at the start of the whole
  // operation. For instance, if a folder A contains a subfolder B, at the start
  // of the operation we'll have a reference to A's copy destination
  // (`mDstFolder`), but not B's since A hasn't been copied over yet.
  nsTHashMap<nsISupportsHashKey, RefPtr<nsIMsgFolder>> mDstParents;

  // The EWS client to use when creating the folder on the remote server.
  nsCOMPtr<IEwsClient> mClient;

  // The listener to inform of the status of the copy/move operation.
  RefPtr<nsIMsgCopyServiceListener> mCopyServiceListener;

  // The index into `mFoldersToCopy` of the folder currently being copied/moved.
  size_t mCurIndex{};
};

#endif  // COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSFOLDERCOPYHANDLER_H_
