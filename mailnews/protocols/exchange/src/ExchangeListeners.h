/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_PROTOCOLS_EXCHANGE_SRC_EXCHANGELISTENERS_H_
#define COMM_MAILNEWS_PROTOCOLS_EXCHANGE_SRC_EXCHANGELISTENERS_H_

#include <utility>

#include "IExchangeClient.h"
#include "nsIMsgHdr.h"

/**
 * A listener for "simple" Exchange operations, i.e. operations that only need
 * to report a success to the consumer.
 *
 * When the operation succeeds, the lambda function passed to this class's
 * constructor is called, with an array containing changed/new Exchange
 * identifier(s), as well as a boolean indicating whether a resync of the
 * relevant entity (folder list, message list, etc) is required.
 */
class ExchangeSimpleListener : public IExchangeSimpleOperationListener {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_IEXCHANGESIMPLEOPERATIONLISTENER

  explicit ExchangeSimpleListener(
      std::function<nsresult(const nsTArray<nsCString>&, bool)> onSuccess)
      : mOnSuccess(std::move(onSuccess)) {};

 protected:
  virtual ~ExchangeSimpleListener() = default;

 private:
  std::function<nsresult(const nsTArray<nsCString>&, bool)> mOnSuccess;
};

/**
 * A listener for simple message-related Exchange operations.
 *
 * The main reason to pick this listener implementation over
 * `ExchangeSimpleListener` is if the consumer requires some processing on the
 * source messages (reading a property, deleting or moving them, etc.) in the
 * success callback.
 *
 * This listener behaves similarly to `ExchangeSimpleListener` with the
 * exception that the array of source messages (passed to the constructor) is
 * passed to the success callbacks (in the first position) in addition to the
 * other arguments passed to the `ExchangeSimpleListener` success callback.
 */
class ExchangeSimpleMessageListener : public IExchangeSimpleOperationListener {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_IEXCHANGESIMPLEOPERATIONLISTENER

  explicit ExchangeSimpleMessageListener(
      const nsTArray<RefPtr<nsIMsgDBHdr>>& headers,
      std::function<nsresult(const nsTArray<RefPtr<nsIMsgDBHdr>>&,
                             const nsTArray<nsCString>&, bool)>
          onSuccess)
      : mHeaders(headers.Clone()), mOnSuccess(std::move(onSuccess)) {};

 protected:
  virtual ~ExchangeSimpleMessageListener() = default;

 private:
  const nsTArray<RefPtr<nsIMsgDBHdr>> mHeaders;
  std::function<nsresult(const nsTArray<RefPtr<nsIMsgDBHdr>>&,
                         const nsTArray<nsCString>&, bool)>
      mOnSuccess;
};

/**
 * A listener for Exchange operations which failures we want to capture.
 *
 * This class is not intended to be used directly, but rather inherited from by
 * another class that will also handle cases besides failures (like with
 * `ExchangeSimpleFallibleListener` below).
 *
 * Upon failure of the Exchange operation, the lambda function passed to this
 * class's constructor is called with an `nsresult` representing the failure.
 */
class ExchangeFallibleListener : public IExchangeFallibleOperationListener {
 public:
  NS_DECL_IEXCHANGEFALLIBLEOPERATIONLISTENER

  explicit ExchangeFallibleListener(std::function<nsresult(nsresult)> onFailure)
      : mOnFailure(std::move(onFailure)) {};

 protected:
  virtual ~ExchangeFallibleListener() = default;

 private:
  std::function<nsresult(nsresult)> mOnFailure;
};

/**
 * A listener for simple Exchange operations which failures we want to capture.
 *
 * See the documentation for `ExchangeSimpleListener` and
 * `ExchangeFallibleListener` for instructions regarding the lambda functions
 * passed to this class's constructor.
 */
class ExchangeSimpleFallibleListener : public ExchangeSimpleListener,
                                       public ExchangeFallibleListener {
 public:
  NS_DECL_ISUPPORTS_INHERITED

  ExchangeSimpleFallibleListener(
      std::function<nsresult(const nsTArray<nsCString>&, bool)> onSuccess,
      std::function<nsresult(nsresult)> onFailure)
      : ExchangeSimpleListener(std::move(onSuccess)),
        ExchangeFallibleListener(std::move(onFailure)) {};

 protected:
  virtual ~ExchangeSimpleFallibleListener() = default;

 private:
  std::function<nsresult(nsresult)> mOnFailure;
};

/**
 * A listener for simple message-related Exchange operations which failures we
 * want to capture.
 *
 * See the documentation for `ExchangeSimpleMessageListener` for instructions
 * regarding when to use this implementation over
 * `ExchangeSimpleFallibleListener`.
 */
class ExchangeSimpleFallibleMessageListener
    : public ExchangeSimpleMessageListener,
      public ExchangeFallibleListener {
 public:
  NS_DECL_ISUPPORTS_INHERITED

  ExchangeSimpleFallibleMessageListener(
      const nsTArray<RefPtr<nsIMsgDBHdr>>& headers,
      std::function<nsresult(const nsTArray<RefPtr<nsIMsgDBHdr>>&,
                             const nsTArray<nsCString>&, bool)>
          onSuccess,
      std::function<nsresult(nsresult)> onFailure)
      : ExchangeSimpleMessageListener(headers, std::move(onSuccess)),
        ExchangeFallibleListener(std::move(onFailure)) {};

 protected:
  virtual ~ExchangeSimpleFallibleMessageListener() = default;

 private:
  std::function<nsresult(nsresult)> mOnFailure;
};

/**
 * A listener for Exchange message creation operations.
 */
class ExchangeMessageCreateListener : public IExchangeMessageCreateListener {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_IEXCHANGEMESSAGECREATELISTENER
  ExchangeMessageCreateListener() = delete;
  explicit ExchangeMessageCreateListener(
      std::function<nsresult(nsresult, nsACString const&)>
          onRemoteCreateFinished)
      : mOnRemoteCreateFinished(std::move(onRemoteCreateFinished)) {}

 protected:
  virtual ~ExchangeMessageCreateListener() = default;

 private:
  std::function<nsresult(nsresult, nsACString const&)> mOnRemoteCreateFinished;
};

/**
 * A listener for Exchange folder sync operations.
 */
class ExchangeFolderSyncListener : public IExchangeFolderListener,
                                   public ExchangeFallibleListener {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_IEXCHANGEFOLDERLISTENER

  ExchangeFolderSyncListener(
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
      : ExchangeFallibleListener(std::move(onError)),
        mOnNewRootFolder(std::move(onNewRootFolder)),
        mOnFolderCreated(std::move(onFolderCreated)),
        mOnFolderUpdated(std::move(onFolderUpdated)),
        mOnFolderDeleted(std::move(onFolderDeleted)),
        mOnSyncStateTokenChanged(std::move(onSyncStateTokenChanged)),
        mOnSuccess(std::move(onSuccess)) {}

 protected:
  virtual ~ExchangeFolderSyncListener() = default;

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
 * A listener for fetching the content of a single Exchange message.
 *
 * The callbacks follow the same shape as defined by
 * `IExchangeMessageFetchListener`, except `onFetchedDataAvailable` is expected
 * to report the number of bytes it has read from the input stream (via its last
 * out parameter), and `onFetchStop` takes an additional parameter representing
 * the total number of bytes read for the whole message.
 */
class ExchangeMessageFetchListener : public IExchangeMessageFetchListener {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_IEXCHANGEMESSAGEFETCHLISTENER

  ExchangeMessageFetchListener(
      std::function<nsresult()> onFetchStart,
      std::function<nsresult(nsIInputStream*, uint64_t*)>
          onFetchedDataAvailable,
      std::function<nsresult(nsresult, uint64_t)> onFetchStop)
      : mOnFetchStart(std::move(onFetchStart)),
        mOnFetchedDataAvailable(std::move(onFetchedDataAvailable)),
        mOnFetchStop(std::move(onFetchStop)) {};

 protected:
  virtual ~ExchangeMessageFetchListener() = default;

 private:
  std::function<nsresult()> mOnFetchStart;
  std::function<nsresult(nsIInputStream*, uint64_t*)> mOnFetchedDataAvailable;
  std::function<nsresult(nsresult, uint64_t)> mOnFetchStop;

  uint64_t mTotalFetchedBytesCount = 0;
};

#endif  // COMM_MAILNEWS_PROTOCOLS_EXCHANGE_SRC_EXCHANGELISTENERS_H_
