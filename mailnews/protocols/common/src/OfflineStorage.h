/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_PROTOCOLS_COMMON_SRC_OFFLINESTORAGE_H_
#define COMM_MAILNEWS_PROTOCOLS_COMMON_SRC_OFFLINESTORAGE_H_

#include "nsIChannel.h"
#include "nsIMsgFolder.h"
#include "nsIStreamListener.h"

/**
 * A stream listener that forwards method calls to another stream listener,
 * while substituting the request argument with the provided channel.
 *
 * Consumers are expected to call `OnStartRequest` themselves, so that their own
 * consumers are informed of the entire operation (which might involve e.g.
 * downloading the message from a remote server). Any call to `OnStartRequest`
 * after the first one is silently ignored.
 *
 * `ReadMessageFromStore` can be called from a channel ran within an
 * `nsIDocShell` to render the message. The stream listener that `nsIDocShell`
 * calls `AsyncOpen` with expects the request used in method calls to be
 * channel-like (i.e. it can be QI'd as an `nsIChannel`). Additionally, we want
 * to use `nsIInputStreamPump` to pump the data from the message content's input
 * stream (which we get from the message store) into the provided stream
 * listener. However, the default `nsIInputStreamPump` implementation calls the
 * stream listener methods with itself as the request argument, but only
 * implements `nsIRequest` (and not `nsIChannel`), causing the operation to
 * fail.
 *
 * Therefore we need this "proxy" listener to forward the method calls to the
 * listener `AsyncOpen` is originally provided with, while subsituting the
 * request arguments with an actual channel.
 *
 * Additionally, it's a good place to check for read errors when streaming a
 * message to the destination, and clearing malformed messages from the offline
 * storage (so they can be downloaded again).
 */
class OfflineMessageReadListener : public nsIStreamListener {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIREQUESTOBSERVER
  NS_DECL_NSISTREAMLISTENER

  OfflineMessageReadListener(nsIStreamListener* destination,
                             nsIChannel* channel, nsMsgKey msgKey,
                             nsIMsgFolder* folder)
      : mShouldStart(true),
        mDestination(destination),
        mChannel(channel),
        mMsgKey(msgKey),
        mFolder(folder) {};

  // Disable the default and copy constructors.
  OfflineMessageReadListener() = delete;
  OfflineMessageReadListener(const OfflineMessageReadListener&) = delete;

 protected:
  virtual ~OfflineMessageReadListener();

 private:
  // Whether `OnStartRequest` should be called.
  //
  // This boolean is set to `false` after the first `OnStartRequest` call to
  // avoid calling it more than once.
  bool mShouldStart;

  // The listener to which to forward any method call.
  nsCOMPtr<nsIStreamListener> mDestination;

  // The channel to use (instead of the original `nsIRequest`) when forwarding
  // method calls.
  nsCOMPtr<nsIChannel> mChannel;

  // The database key for the message we're currently reading, used to discard
  // the message in case of a read failure.
  nsMsgKey mMsgKey;

  // The folder in which the message we're currently reading resides, used to
  // discard the message in case of a read failure.
  nsCOMPtr<nsIMsgFolder> mFolder;
};

/**
 * A protocol-agnostic helper for reading a message from an offline store.
 *
 * This function is intended to be called from within a channel (and for this
 * channel to be passed as `srcChannel`). It looks up the content of the message
 * it's given, and streams its content to the given listener.
 *
 * If `convertData` is `true`, the message will be passed through our
 * `message/rfc822` converter, which output will be streamed to the listener
 * (instead of the raw RFC822 message). Depending on the query parameters in the
 * channel's URI, the converter will either output HTML for display, plain text
 * for showing the message's source, or, if the URI is for a specific part of
 * the message (specified via the `part=` parameter), serve the raw data for
 * that section.
 *
 * If an error arises from the process of reading the message, it is discarded
 * from the offline store (and the failure is propagated to any consumer) so it
 * can be downloaded again later.
 *
 * It returns an `nsIRequest` representing the read operation, that can be
 * cancelled or suspended as the consumer requests it.
 */
nsresult AsyncReadMessageFromStore(nsIMsgDBHdr* message,
                                   nsIStreamListener* streamListener,
                                   bool convertData, nsIChannel* srcChannel,
                                   nsIRequest** readRequest);

/**
 * A protocol-agnostic helper for locally renaming or reparenting a folder.
 *
 * This function recursively moves the folder specified by `sourceFolder` held
 * in the local data store to the parent specified by `newParentFolder` with the
 * name specified by `name`. The folder specified by `newParentFolder` may be
 * the same as `sourceFolder`'s current parent, and the name specified by `name`
 * may be the same as `sourceFolder`'s current name. If both the parent and the
 * name are unchanged, then this function will do nothing and return `NS_OK`. If
 * the operation cannot be completed because a child with the specified name
 * already exists within the parent, then this function will return
 * `NS_MSG_FOLDER_EXISTS`. The specified `msgWindow` will be used for
 * notifications.
 *
 * This implementation also moves the database storage, maintaining properties
 * and metadata associated with the folder through the rename/reparent
 * operation.
 *
 * Returns an `nsresult` to indicate whether or not the operation succeeded.
 */
nsresult LocalRenameOrReparentFolder(nsIMsgFolder* sourceFolder,
                                     nsIMsgFolder* newParentFolder,
                                     const nsACString& name,
                                     nsIMsgWindow* msgWindow);

/**
 * A protocol-agnostic helper for locally deleting messages within a folder.
 *
 * This function will delete the messages identified by their headers in the
 * `messageHeaders` parameter. The messages are assumed to be located in the
 * given `folder`. If the message includes content that has been downloaded
 * locally, that content will be deleted as well.
 *
 * @returns an `nsresult` to indicate whether or not the operation succeeded.
 */
nsresult LocalDeleteMessages(
    nsIMsgFolder* folder, const nsTArray<RefPtr<nsIMsgDBHdr>>& messageHeaders);

/**
 * A protocol-agnostic helper for locally copying messages between folders.
 *
 * This function copies the messages identified by `sourceHeaders` from the
 * given `sourceFolder` into the given `destinationFolder`. The newly created
 * headers are returned in `newHeaders`. The ordering of the returned headers
 * is guaranteed to be stable with respect to the ordering of the source
 * headers. In addition, if a message in the collection of messages to be
 * copied includes content that has been downloaded locally, that content will
 * be copied into the destination as well.
 *
 * @returns an `nsresult to indicate whether or not the operation succeeded.
 */
nsresult LocalCopyMessages(nsIMsgFolder* sourceFolder,
                           nsIMsgFolder* destinationFolder,
                           const nsTArray<RefPtr<nsIMsgDBHdr>>& sourceHeaders,
                           nsTArray<RefPtr<nsIMsgDBHdr>>& newHeaders);

/**
 * A protocol-agnostic helper for creating a header in the local database.
 *
 * This function creates a new message header in the given `destinationFolder`.
 * The resulting header is returned in `newHeader`.
 *
 * @returns an `nsresult to indicate whether or not the operation succeeded.
 */
nsresult LocalCreateHeader(nsIMsgFolder* destinationFolder,
                           nsIMsgDBHdr** newHeader);

/**
 * A protocol-agnostic helper for copying offline message content.
 *
 * This function copies the downloaded content for a message accessed by the
 * given `inputStream` to the given `destinationFolder`. Once complete, it sets
 * the required properties and flags on `messageHeader` to indicate the
 * existence and size of the downloaded content.
 *
 * @returns an `nsresult to indicate whether or not the operation succeeded.
 */
nsresult LocalCopyOfflineMessageContent(nsIMsgFolder* destinationFolder,
                                        nsIInputStream* msgInputStream,
                                        nsIMsgDBHdr* messageHeader);

/**
 * A protocol-agnostic helper for making a complete copy of a message locally.
 *
 * This function takes the message content within the given `msgInputStream`
 * and copies it to the given `destinationFolder`. In addition, this function
 * creates a header for the newly copied message in the message database
 * for the given folder.
 *
 * @returns an `nsresult to indicate whether or not the operation succeeded.
 */
nsresult LocalCopyMessage(nsIMsgFolder* destinationFolder,
                          nsIInputStream* msgInputStream,
                          nsIMsgDBHdr** newHeader);

/**
 * A protocol-agnostic helper for copying headers from one message to another.
 *
 * This function copies the header data stored in `sourceHeader` to
 * `destinationHeader`.  The `excludeProperties` parameter is a list of property
 * names to exclude from the copy operation. The `isMove` parameter is used to
 * check preferences for which properties should be maintained on a move versus
 * a copy operation to determine additional properties to exclude.
 *
 * @returns an `nsresult to indicate whether or not the operation succeeded.
 */
nsresult LocalCopyHeaders(nsIMsgDBHdr* sourceHeader,
                          nsIMsgDBHdr* destinationHeader,
                          const nsTArray<nsCString>& excludeProperties,
                          bool isMove);

#endif  // COMM_MAILNEWS_PROTOCOLS_COMMON_SRC_OFFLINESTORAGE_H_
