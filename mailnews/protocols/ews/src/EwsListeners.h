/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSLISTENERS_H_
#define COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSLISTENERS_H_

#include <utility>

#include "IEwsClient.h"
#include "nsIMsgHdr.h"

/**
 * A listener for "simple" EWS operations, i.e. operations that only need to
 * report a success to the consumer.
 *
 * When the operation succeeds, the lambda function passed to this class's
 * constructor is called, with an array containing changed/new EWS
 * identifier(s), as well as a boolean indicating whether a resync of the
 * relevant entity (folder list, message list, etc) is required.
 */
class EwsSimpleListener : public IEwsSimpleOperationListener {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_IEWSSIMPLEOPERATIONLISTENER

  explicit EwsSimpleListener(
      std::function<nsresult(const nsTArray<nsCString>&, bool)> onSuccess)
      : mOnSuccess(std::move(onSuccess)) {};

 protected:
  virtual ~EwsSimpleListener() = default;

 private:
  std::function<nsresult(const nsTArray<nsCString>&, bool)> mOnSuccess;
};

/**
 * A listener for simple message-related EWS operations.
 *
 * The main reason to pick this listener implementation over `EwsSimpleListener`
 * is if the consumer requires some processing on the source messages (reading a
 * property, deleting or moving them, etc.) in the success callback.
 *
 * This listener behaves similarly to `EwsSimpleListener` with the exception
 * that the array of source messages (passed to the constructor) is passed to
 * the success callbacks (in the first position) in addition to the other
 * arguments passed to the `EwsSimpleListener` success callback.
 */
class EwsSimpleMessageListener : public IEwsSimpleOperationListener {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_IEWSSIMPLEOPERATIONLISTENER

  explicit EwsSimpleMessageListener(
      const nsTArray<RefPtr<nsIMsgDBHdr>>& headers,
      std::function<nsresult(const nsTArray<RefPtr<nsIMsgDBHdr>>&,
                             const nsTArray<nsCString>&, bool)>
          onSuccess)
      : mHeaders(headers.Clone()), mOnSuccess(std::move(onSuccess)) {};

 protected:
  virtual ~EwsSimpleMessageListener() = default;

 private:
  const nsTArray<RefPtr<nsIMsgDBHdr>> mHeaders;
  std::function<nsresult(const nsTArray<RefPtr<nsIMsgDBHdr>>&,
                         const nsTArray<nsCString>&, bool)>
      mOnSuccess;
};

/**
 * A listener for EWS operations which failures we want to capture.
 *
 * This class is not intended to be used directly, but rather inherited from by
 * another class that will also handle cases besides failures (like with
 * `EwsSimpleFallibleListener` below).
 *
 * Upon failure of the EWS operation, the lambda function passed to this class's
 * constructor is called with an `nsresult` representing the failure.
 */
class EwsFallibleListener : public IEwsFallibleOperationListener {
 public:
  NS_DECL_IEWSFALLIBLEOPERATIONLISTENER

  explicit EwsFallibleListener(std::function<nsresult(nsresult)> onFailure)
      : mOnFailure(std::move(onFailure)) {};

 protected:
  virtual ~EwsFallibleListener() = default;

 private:
  std::function<nsresult(nsresult)> mOnFailure;
};

/**
 * A listener for simple EWS operations which failures we want to capture.
 *
 * See the documentation for `EwsSimpleListener` and `EwsFallibleListener` for
 * instructions regarding the lambda functions passed to this class's
 * constructor.
 */
class EwsSimpleFallibleListener : public EwsSimpleListener,
                                  public EwsFallibleListener {
 public:
  NS_DECL_ISUPPORTS_INHERITED

  EwsSimpleFallibleListener(
      std::function<nsresult(const nsTArray<nsCString>&, bool)> onSuccess,
      std::function<nsresult(nsresult)> onFailure)
      : EwsSimpleListener(std::move(onSuccess)),
        EwsFallibleListener(std::move(onFailure)) {};

 protected:
  virtual ~EwsSimpleFallibleListener() = default;

 private:
  std::function<nsresult(nsresult)> mOnFailure;
};

/**
 * A listener for simple message-related EWS operations which failures we want
 * to capture.
 *
 * See the documentation for `EwsSimpleMessageListener` for instructions
 * regarding when to use this implementation over `EwsSimpleFallibleListener`.
 */
class EwsSimpleFallibleMessageListener : public EwsSimpleMessageListener,
                                         public EwsFallibleListener {
 public:
  NS_DECL_ISUPPORTS_INHERITED

  EwsSimpleFallibleMessageListener(
      const nsTArray<RefPtr<nsIMsgDBHdr>>& headers,
      std::function<nsresult(const nsTArray<RefPtr<nsIMsgDBHdr>>&,
                             const nsTArray<nsCString>&, bool)>
          onSuccess,
      std::function<nsresult(nsresult)> onFailure)
      : EwsSimpleMessageListener(headers, std::move(onSuccess)),
        EwsFallibleListener(std::move(onFailure)) {};

 protected:
  virtual ~EwsSimpleFallibleMessageListener() = default;

 private:
  std::function<nsresult(nsresult)> mOnFailure;
};

/**
 * A listener for EWS message creation operations.
 */
class EwsMessageCreateListener : public IEwsMessageCreateListener {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_IEWSMESSAGECREATELISTENER

  EwsMessageCreateListener(
      std::function<nsresult(nsIMsgDBHdr*)> onHdrPopulated,
      std::function<nsresult(nsMsgKey)> onNewMessageKey,
      std::function<nsresult(const nsACString&, nsIMsgDBHdr**)>
          onRemoteCreateSuccessful,
      std::function<nsresult(nsresult)> onStopCreate)
      : mOnHdrPopulated(std::move(onHdrPopulated)),
        mOnNewMessageKey(std::move(onNewMessageKey)),
        mOnRemoteCreateSuccessful(std::move(onRemoteCreateSuccessful)),
        mOnStopCreate(std::move(onStopCreate)) {}

 protected:
  virtual ~EwsMessageCreateListener() = default;

 private:
  std::function<nsresult(nsIMsgDBHdr*)> mOnHdrPopulated;
  std::function<nsresult(nsMsgKey)> mOnNewMessageKey;
  std::function<nsresult(const nsACString&, nsIMsgDBHdr**)>
      mOnRemoteCreateSuccessful;
  std::function<nsresult(nsresult)> mOnStopCreate;
};

/**
 * A listener for EWS folder sync operations.
 */
class EwsFolderSyncListener : public IEwsFolderListener,
                              public EwsFallibleListener {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_IEWSFOLDERLISTENER

  EwsFolderSyncListener(
      std::function<nsresult(const nsACString&)> onNewRootFolder,
      std::function<nsresult(const nsACString&, const nsACString&,
                             const nsACString&, uint32_t)>
          onFolderCreated,
      std::function<nsresult(const nsACString&, const nsACString&,
                             const nsACString&)>
          onFolderUpdated,
      std::function<nsresult(const nsACString&)> onFolderDeleted,
      std::function<nsresult(const nsACString&)> onSyncStateTokenChanged,
      std::function<nsresult()> onSuccess,
      std::function<nsresult(nsresult)> onError)
      : EwsFallibleListener(std::move(onError)),
        mOnNewRootFolder(std::move(onNewRootFolder)),
        mOnFolderCreated(std::move(onFolderCreated)),
        mOnFolderUpdated(std::move(onFolderUpdated)),
        mOnFolderDeleted(std::move(onFolderDeleted)),
        mOnSyncStateTokenChanged(std::move(onSyncStateTokenChanged)),
        mOnSuccess(std::move(onSuccess)) {}

 protected:
  virtual ~EwsFolderSyncListener() = default;

 private:
  std::function<nsresult(const nsACString&)> mOnNewRootFolder;
  std::function<nsresult(const nsACString&, const nsACString&,
                         const nsACString&, uint32_t)>
      mOnFolderCreated;
  std::function<nsresult(const nsACString&, const nsACString&,
                         const nsACString&)>
      mOnFolderUpdated;
  std::function<nsresult(const nsACString&)> mOnFolderDeleted;
  std::function<nsresult(const nsACString&)> mOnSyncStateTokenChanged;
  std::function<nsresult()> mOnSuccess;
};

/**
 * A listener for fetching the content of a single EWS message.
 *
 * The callbacks follow the same shape as defined by
 * `IEwsMessageFetchListener`, except `onFetchedDataAvailable` is expected to
 * report the number of bytes it has read from the input stream (via its last
 * out parameter), and `onFetchStop` takes an additional parameter representing
 * the total number of bytes read for the whole message.
 */
class EwsMessageFetchListener : public IEwsMessageFetchListener {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_IEWSMESSAGEFETCHLISTENER

  EwsMessageFetchListener(
      std::function<nsresult()> onFetchStart,
      std::function<nsresult(nsIInputStream*, uint64_t*)>
          onFetchedDataAvailable,
      std::function<nsresult(nsresult, uint64_t)> onFetchStop)
      : mOnFetchStart(std::move(onFetchStart)),
        mOnFetchedDataAvailable(std::move(onFetchedDataAvailable)),
        mOnFetchStop(std::move(onFetchStop)) {};

 protected:
  virtual ~EwsMessageFetchListener() = default;

 private:
  std::function<nsresult()> mOnFetchStart;
  std::function<nsresult(nsIInputStream*, uint64_t*)> mOnFetchedDataAvailable;
  std::function<nsresult(nsresult, uint64_t)> mOnFetchStop;

  uint64_t mTotalFetchedBytesCount = 0;
};

#endif  // COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSLISTENERS_H_
