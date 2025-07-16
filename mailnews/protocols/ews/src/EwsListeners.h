/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSLISTENERS_H_
#define COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSLISTENERS_H_

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
 * `EwsSimpleFailibleListener` below).
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
class EwsSimpleFailibleListener : public EwsSimpleListener,
                                  public EwsFallibleListener {
 public:
  NS_DECL_ISUPPORTS_INHERITED

  EwsSimpleFailibleListener(
      std::function<nsresult(const nsTArray<nsCString>&, bool)> onSuccess,
      std::function<nsresult(nsresult)> onFailure)
      : EwsSimpleListener(std::move(onSuccess)),
        EwsFallibleListener(std::move(onFailure)) {};

 protected:
  virtual ~EwsSimpleFailibleListener() = default;

 private:
  std::function<nsresult(nsresult)> mOnFailure;
};

/**
 * A listener for simple message-related EWS operations which failures we want
 * to capture.
 *
 * See the documentation for `EwsSimpleMessageListener` for instructions
 * regarding when to use this implementation over `EwsSimpleFailibleListener`.
 */
class EwsSimpleFailibleMessageListener : public EwsSimpleMessageListener,
                                         public EwsFallibleListener {
 public:
  NS_DECL_ISUPPORTS_INHERITED

  EwsSimpleFailibleMessageListener(
      const nsTArray<RefPtr<nsIMsgDBHdr>>& headers,
      std::function<nsresult(const nsTArray<RefPtr<nsIMsgDBHdr>>&,
                             const nsTArray<nsCString>&, bool)>
          onSuccess,
      std::function<nsresult(nsresult)> onFailure)
      : EwsSimpleMessageListener(headers, std::move(onSuccess)),
        EwsFallibleListener(std::move(onFailure)) {};

 protected:
  virtual ~EwsSimpleFailibleMessageListener() = default;

 private:
  std::function<nsresult(nsresult)> mOnFailure;
};

#endif  // COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSLISTENERS_H_
