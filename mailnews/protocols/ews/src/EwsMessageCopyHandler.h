/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef __COMM_MAILNEWS_PROTOCOLS_EWS_MESSAGE_COPY_HANDLER_H
#define __COMM_MAILNEWS_PROTOCOLS_EWS_MESSAGE_COPY_HANDLER_H

#include "IEwsClient.h"
#include "EwsFolder.h"

#include "nscore.h"

#include "nsICopyMessageListener.h"
#include "nsIMsgCopyServiceListener.h"
#include "nsIMsgFolder.h"
#include "nsIMsgHdr.h"
#include "nsIMsgWindow.h"
#include "nsTArray.h"

class MessageCreateCallbacks;

/**
 * A handler for a single message copy/move operation, the source for which can
 * be either a file or a folder.
 *
 * An instance of `MessageCopyHandler` is created for each copy/move operation,
 * but a single copy/move operation can target multiple messages.
 *
 * It iterates over each message in the queue sequentially and
 *    1. streams it from the relevant message service
 *    2. creates a new item on the server for the message
 *    3. creates a local copy of the message
 *    4. triggers step 1 for the next message (if there is one)
 *
 * The current process of copying or moving a message from a folder is the
 * following (assuming no failures, and excepting signaling start/stop/progress
 * updates to the source folder and the copy listener):
 *    1. A consumer requests an array of messages to be copied to an EWS folder
 *       (`EwsFolder::CopyMessages()`).
 *    2. The EWS folder class instantiates a copy handler, and instructs it to
 *       start the operation (`MessageCopyHandler::StartCopyingNextMessage()`).
 *    3. The copy handler instructs the message service relevant to the first
 *       message in line to stream said message's content to the handler
 *       (`nsIMsgMessageService::CopyMessage()`).
 *    4. Once the full message content has been streamed, the message service
 *       then signals to the copy handler that it has finished streaming the
 *       message's content (`MessageCopyHandler::EndCopy()`).
 *    5. The copy handler instructs its EWS client to begin creating an item for
 *       the message on the EWS server (`IEwsClient::CreateMessage()`). It is
 *       called with an instance of `MessageCreateCallbacks`, which performs
 *       database operations and notifies the copy handler about the operation's
 *       progress.
 *    6. Once the item has been created on the EWS server, the EWS client
 *       instructs its callbacks instance to save the message's content to the
 *       relevant local database and message store
 *       (`MessageCreateCallbacks::OnRemoteCreateSuccessful()`).
 *    7. The EWS client then notifies the copy handler (through its callbacks)
 *       that the new message has been successfully created, both on the EWS
 *       server and locally (`MessageCopyHandler::OnCreateFinished()`).
 *    8. If the operation is a move, the copy handler deletes the source message
 *       on the source folder.
 *    9. The copy handler repeats this process from steps 3 onwards until every
 *       message in the original array has been copied or moved.
 *    10. Once the operation has completed, or if there has been a failure
 *        during the operation, the copy handler notifies the source folder and
 *        the global copy service about the end and final status of the
 *        operation (`MessageCopyHandler::OnCopyCompleted()`).
 *
 * When copying from a file, the same process is followed, apart from a few
 * changes:
 *    * Step 3 is skipped, as the copy handler already holds a copy of the
 *      message's content (in the file).
 *    * Step 8 is skipped, as we're always dealing with a copy operation when
 *      the source is a file.
 *    * Step 9 is skipped, as we're always dealing with a single message when
 *      the source is a file.
 */
class MessageCopyHandler : public nsICopyMessageListener {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSICOPYMESSAGELISTENER

  /**
   * Constructs a handler which will copy/move the messages specified in
   * `headers` from the source folder into the destination EWS folder.
   */
  MessageCopyHandler(nsIMsgFolder* srcFolder, EwsFolder* dstFolder,
                     const nsTArray<RefPtr<nsIMsgDBHdr>>& headers, bool isMove,
                     nsIMsgWindow* window, nsCString dstFolderId,
                     IEwsClient* client,
                     nsIMsgCopyServiceListener* copyServiceListener)
      : mDstFolder(dstFolder),
        mHeaders(headers.Clone()),
        mIsMove(isMove),
        mIsDraft(false),
        mWindow(window),
        mSrcFolder(mozilla::Some(srcFolder)),
        mSrcFile(mozilla::Nothing()),
        mDstFolderId(std::move(dstFolderId)),
        mClient(client),
        mCopyServiceListener(copyServiceListener),
        mCurIndex(0) {}

  /**
   * Constructs a handler which will copy the message contained in `srcFile`
   * into the destination EWS folder.
   */
  MessageCopyHandler(nsIFile* srcFile, EwsFolder* dstFolder, bool isDraft,
                     nsIMsgWindow* window, nsCString dstFolderId,
                     IEwsClient* client,
                     nsIMsgCopyServiceListener* copyServiceListener)
      : mDstFolder(dstFolder),
        mHeaders({}),
        mIsMove(false),
        mIsDraft(isDraft),
        mWindow(window),
        mSrcFolder(mozilla::Nothing()),
        mSrcFile(mozilla::Some(srcFile)),
        mDstFolderId(std::move(dstFolderId)),
        mClient(client),
        mCopyServiceListener(copyServiceListener),
        mCurIndex(0) {}

  /**
   * Signals that the whole operation has finished with the provided status
   * code.
   *
   * If consumers determine that the copy operation cannot or should not be
   * started, they should call this method to ensure the operation is properly
   * dequeued from the global copy service.
   */
  nsresult OnCopyCompleted(nsresult status);

  /**
   * Start copying the next message in the operation's queue.
   *
   * Consumers should call his method to initiate the copy operation, after
   * which the handler itself will call it for any subsequent messages.
   */
  nsresult StartCopyingNextMessage();

  friend class MessageCreateCallbacks;

 protected:
  virtual ~MessageCopyHandler() = default;

  /**
   * The methods below are expected to be called by a friend class, such as
   * `MessageCreateCallbacks`.
   */

  /**
   * Informs any listener of the message's key, so further processes can be run
   * on the new message (e.g. filtering) once the operation is complete.
   */
  nsresult SetMessageKey(nsMsgKey aKey);

  /**
   * The message that is currently being copied/moved. If the source for the
   * operation is a file, this will be `Nothing()` as there is no source header
   * for the message.
   */
  mozilla::Maybe<RefPtr<nsIMsgDBHdr>> GetCurrentMessageHeader();

  /**
   * Whether the current operation is a move, or simply a copy.
   */
  bool GetIsMove();

  /**
   * Signals to the handler that an item has been created on the EWS server for
   * the current message, or that it failed with the provided status.
   */
  nsresult OnCreateFinished(nsresult status);

 private:
  /**
   * Triggers the creation of an item for the current message on the EWS server.
   */
  nsresult CreateRemoteMessage();

  // Parameters of the copy/move operation.
  RefPtr<EwsFolder> mDstFolder;
  const nsTArray<RefPtr<nsIMsgDBHdr>> mHeaders;
  bool mIsMove;
  bool mIsDraft;
  RefPtr<nsIMsgWindow> mWindow;

  // The source from which to copy/move. This can either be a folder (when
  // copying/moving messages from one folder to another), or a file (when e.g.
  // saving a message draft or storing a copy of a sent message to the "Sent"
  // folder).
  mozilla::Maybe<RefPtr<nsIMsgFolder>> mSrcFolder;
  mozilla::Maybe<RefPtr<nsIFile>> mSrcFile;

  // The EWS client and folder ID to use when creating the message item on the
  // remote server.
  nsCString mDstFolderId;
  RefPtr<IEwsClient> mClient;

  // The listener to inform of the status of the copy/move operation.
  RefPtr<nsIMsgCopyServiceListener> mCopyServiceListener;

  // The index into `mHeaders` of the message currently being copied/move.
  size_t mCurIndex{};

  // A buffer containing the full message content.
  //
  // This isn't great; ideally we'd stream the message to the client as it's
  // provided to `CopyData()`, but the current architecture of the EWS code does
  // not allow this because we require the whole message to be available before
  // we can serialize it.
  nsCString mBuffer;
};

#endif
