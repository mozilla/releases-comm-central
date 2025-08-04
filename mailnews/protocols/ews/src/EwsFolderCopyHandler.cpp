/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "EwsFolderCopyHandler.h"

#include "EwsListeners.h"
#include "nsIMsgMessageService.h"
#include "nsMsgUtils.h"
#include "nsNetUtil.h"

constexpr auto kEwsIdProperty = "ewsId";

///////////////////////////////////////////////////////////////////////////////
// Definition of `MessageCopyListener`, which implements
// `nsIMsgCopyServiceListener`, and is used to let the copy handler know once
// every message in a folder has been copied over to the new folder. We don't
// want to track anything else, so all the methods are stubbed out except
// `OnStopCopy`.
///////////////////////////////////////////////////////////////////////////////

class MessageCopyListener : public nsIMsgCopyServiceListener {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIMSGCOPYSERVICELISTENER

  MessageCopyListener(nsIMsgFolder* srcFolder, FolderCopyHandler* handler,
                      nsIMsgWindow* msgWindow)
      : mSrcFolder(srcFolder), mHandler(handler), mWindow(msgWindow) {};

 protected:
  virtual ~MessageCopyListener() = default;

 private:
  nsCOMPtr<nsIMsgFolder> mSrcFolder;
  RefPtr<FolderCopyHandler> mHandler;
  nsCOMPtr<nsIMsgWindow> mWindow;
};

NS_IMPL_ISUPPORTS(MessageCopyListener, nsIMsgCopyServiceListener)

NS_IMETHODIMP MessageCopyListener::OnStartCopy() { return NS_OK; }
NS_IMETHODIMP MessageCopyListener::OnProgress(uint32_t progress,
                                              uint32_t progressMax) {
  return NS_OK;
}
NS_IMETHODIMP MessageCopyListener::SetMessageKey(nsMsgKey key) { return NS_OK; }
NS_IMETHODIMP MessageCopyListener::GetMessageId(nsACString& _retval) {
  return NS_OK;
}

NS_IMETHODIMP MessageCopyListener::OnStopCopy(nsresult aStatus) {
  NS_ENSURE_SUCCESS(aStatus, aStatus);

  return mHandler->CopyNextFolder();
}

///////////////////////////////////////////////////////////////////////////////
// Definition of `FolderCopyHandler`, which handles a single folder copy
// operation (including subfolders, if any). See `EwsFolderCopyHandler.h` for
// more documentation.
///////////////////////////////////////////////////////////////////////////////

nsresult FolderCopyHandler::CopyNextFolder() {
  mCurIndex++;

  if (mCurIndex >= mFoldersToCopy.Length()) {
    if (mCurIndex > mFoldersToCopy.Length()) {
      NS_WARNING("should have already finished copying");
    }

    // We've reached the end of our queue.
    //
    // TODO: If we're on the same server/account, we should also delete the
    // source folder (i.e `mFoldersToCopy[0]`). However, in order to preserve
    // folder properties Thunderbird might not care about, we should move
    // `MoveFolder` instead:
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1956554
    return NS_OK;
  }

  nsCOMPtr<nsIMsgFolder> currentFolder(mFoldersToCopy[mCurIndex]);

  // Get the name for the new folder.
  nsCString folderName;
  MOZ_TRY(currentFolder->GetName(folderName));

  // Retrieve the destination folder in which to create the new folder.
  auto parent = mDstParents.Extract(currentFolder);
  if (!parent) {
    NS_ERROR(nsPrintfCString("CopyNextFolder: folder %s has no parent",
                             folderName.get())
                 .get());
    return NS_ERROR_UNEXPECTED;
  }

  const nsCOMPtr<nsIMsgFolder> parentFolder = parent.value();

  // We expect all destination folders to be valid EWS folders, and so to have
  // an EWS ID set.
  nsCString parentId;
  MOZ_TRY(parent.value()->GetStringProperty(kEwsIdProperty, parentId));

  const RefPtr<EwsSimpleFailibleListener> listener =
      new EwsSimpleFailibleListener(
          [self = RefPtr(this), parentFolder, folderName](
              const nsTArray<nsCString>& ids, bool useLegacyFallback) {
            NS_ENSURE_TRUE(ids.Length() == 1, NS_ERROR_UNEXPECTED);

            nsCOMPtr<nsIMsgFolder> newFolder;
            nsresult rv = CreateNewLocalEwsFolder(
                parentFolder, ids[0], folderName, getter_AddRefs(newFolder));
            NS_ENSURE_SUCCESS(rv, rv);

            return self->OnFolderCreateFinished(NS_OK, newFolder);
          },
          [self = RefPtr(this)](nsresult status) {
            return self->OnFolderCreateFinished(status, nullptr);
          });

  return mClient->CreateFolder(listener, parentId, folderName);
}

// Protected method on `FolderCopyHandler`, intended to be called by its
// friend class `FolderCreateCopyCallbacks`.

nsresult FolderCopyHandler::OnFolderCreateFinished(nsresult status,
                                                   nsIMsgFolder* newFolder) {
  NS_ENSURE_SUCCESS(status, status);

  NS_ENSURE_ARG_POINTER(newFolder);
  MOZ_ASSERT(mCurIndex < mFoldersToCopy.Length());

  nsCOMPtr<nsIMsgFolder> currentFolder(mFoldersToCopy[mCurIndex]);

  // Get the list of immediate children (non-recursively) of the current folder,
  // append them to the list of folders to copy, and register `newFolder` as
  // their copy destination.
  nsTArray<RefPtr<nsIMsgFolder>> subfolders;
  MOZ_TRY(currentFolder->GetSubFolders(subfolders));

  for (auto folder : subfolders) {
    mFoldersToCopy.AppendElement(folder);
    mDstParents.InsertOrUpdate(folder, newFolder);
  }

  nsCOMPtr<nsIMsgEnumerator> messages;
  MOZ_TRY(currentFolder->GetMessages(getter_AddRefs(messages)));

  nsTArray<RefPtr<nsIMsgDBHdr>> msgArray;
  bool hasMoreElements = false;

  if (messages) {
    MOZ_TRY(messages->HasMoreElements(&hasMoreElements));
  }

  while (hasMoreElements) {
    nsCOMPtr<nsIMsgDBHdr> msg;
    MOZ_TRY(messages->GetNext(getter_AddRefs(msg)));

    msgArray.AppendElement(msg);
    MOZ_TRY(messages->HasMoreElements(&hasMoreElements));
  }

  // Copy any message in the folder.
  if (msgArray.Length() > 0) {
    RefPtr<MessageCopyListener> listener =
        new MessageCopyListener(currentFolder, this, mWindow);

    // If the folder has messages in it, we want to wait for them to copy before
    // we move onto the next folder. The `MessageCopyListener` will call
    // `CopyNextFolder()` once all the messages have been copied (or moved).
    return newFolder->CopyMessages(currentFolder, msgArray, mIsMove, mWindow,
                                   listener, true /* is folder*/,
                                   false /* allowUndo */);
  }

  return CopyNextFolder();
}
