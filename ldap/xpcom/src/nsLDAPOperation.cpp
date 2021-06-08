/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsLDAPInternal.h"
#include "nsLDAPOperation.h"
#include "nsLDAPBERValue.h"
#include "nsILDAPMessage.h"
#include "nsILDAPModification.h"
#include "nsIComponentManager.h"
#include "nspr.h"
#include "nsISimpleEnumerator.h"
#include "nsLDAPControl.h"
#include "nsILDAPErrors.h"
#include "nsIClassInfoImpl.h"
#include "nsIAuthModule.h"
#include "nsMemory.h"
#include "nsThreadUtils.h"

// Declare helper fns for dealing with C++ LDAP <-> libldap mismatch.
static nsresult convertValues(nsTArray<RefPtr<nsILDAPBERValue>> const& values,
                              berval*** aBValues);
static void freeValues(berval** aVals);
static nsresult convertMods(nsTArray<RefPtr<nsILDAPModification>> const& aMods,
                            LDAPMod*** aOut);
static void freeMods(LDAPMod** aMods);
static nsresult convertControlArray(
    nsTArray<RefPtr<nsILDAPControl>> const& xpControls, LDAPControl*** aArray);

/**
 * OpRunnable is a helper class to dispatch ldap operations on the socket
 * thread.
 */
class OpRunnable : public mozilla::Runnable {
 public:
  OpRunnable(const char* name, nsLDAPOperation* aOperation)
      : mozilla::Runnable(name), mOp(aOperation) {}
  RefPtr<nsLDAPOperation> mOp;

 protected:
  virtual ~OpRunnable() {}

  // Provide access to protected members we need in nsLDAPOperation, without
  // declaring every individual Runnable as a friend class.
  LDAP* LDAPHandle() { return mOp->mConnectionHandle; }
  void SetID(int32_t id) { mOp->mMsgID = id; }
  nsLDAPConnection* Conn() { return mOp->mConnection; }

  void NotifyLDAPError() {
    // At this point we should be letting the listener know that there's
    // an error, but listener doesn't have a suitable callback.
    // See Bug 1592449.
    // For now, just log it and leave it at that.
    MOZ_LOG(gLDAPLogModule, mozilla::LogLevel::Error,
            ("nsLDAPOperation failed id=%d, lderrno=%d", mOp->mMsgID,
             ldap_get_lderrno(LDAPHandle(), 0, 0)));
  }
};

// Helper function
static nsresult TranslateLDAPErrorToNSError(const int ldapError) {
  switch (ldapError) {
    case LDAP_SUCCESS:
      return NS_OK;

    case LDAP_ENCODING_ERROR:
      return NS_ERROR_LDAP_ENCODING_ERROR;

    case LDAP_CONNECT_ERROR:
      return NS_ERROR_LDAP_CONNECT_ERROR;

    case LDAP_SERVER_DOWN:
      return NS_ERROR_LDAP_SERVER_DOWN;

    case LDAP_NO_MEMORY:
      return NS_ERROR_OUT_OF_MEMORY;

    case LDAP_NOT_SUPPORTED:
      return NS_ERROR_LDAP_NOT_SUPPORTED;

    case LDAP_PARAM_ERROR:
      return NS_ERROR_INVALID_ARG;

    case LDAP_FILTER_ERROR:
      return NS_ERROR_LDAP_FILTER_ERROR;

    default:
      MOZ_LOG(gLDAPLogModule, mozilla::LogLevel::Error,
              ("TranslateLDAPErrorToNSError: "
               "Do not know how to translate LDAP error: 0x%x",
               ldapError));
      return NS_ERROR_UNEXPECTED;
  }
}

// constructor
nsLDAPOperation::nsLDAPOperation() {}

// destructor
nsLDAPOperation::~nsLDAPOperation() {}

NS_IMPL_CLASSINFO(nsLDAPOperation, NULL, nsIClassInfo::THREADSAFE,
                  NS_LDAPOPERATION_CID)

NS_IMPL_ADDREF(nsLDAPOperation)
NS_IMPL_RELEASE(nsLDAPOperation)
NS_INTERFACE_MAP_BEGIN(nsLDAPOperation)
  NS_INTERFACE_MAP_ENTRY(nsILDAPOperation)
  NS_INTERFACE_MAP_ENTRY_AMBIGUOUS(nsISupports, nsILDAPOperation)
  NS_IMPL_QUERY_CLASSINFO(nsLDAPOperation)
NS_INTERFACE_MAP_END
NS_IMPL_CI_INTERFACE_GETTER(nsLDAPOperation, nsILDAPOperation)

/**
 * Initializes this operation.  Must be called prior to use.
 *
 * @param aConnection connection this operation should use
 * @param aMessageListener where are the results are called back to.
 */
NS_IMETHODIMP
nsLDAPOperation::Init(nsILDAPConnection* aConnection,
                      nsILDAPMessageListener* aMessageListener,
                      nsISupports* aClosure) {
  if (!aConnection) {
    return NS_ERROR_ILLEGAL_VALUE;
  }

  // so we know that the operation is not yet running (and therefore don't
  // try and call ldap_abandon_ext() on it) or remove it from the queue.
  //
  mMsgID = 0;

  // set the member vars
  //
  mConnection = static_cast<nsLDAPConnection*>(aConnection);
  mMessageListener = aMessageListener;
  mClosure = aClosure;

  // cache the connection handle
  //
  mConnectionHandle = mConnection->mConnectionHandle;

  return NS_OK;
}

NS_IMETHODIMP
nsLDAPOperation::GetClosure(nsISupports** _retval) {
  if (!_retval) {
    return NS_ERROR_ILLEGAL_VALUE;
  }
  NS_IF_ADDREF(*_retval = mClosure);
  return NS_OK;
}

NS_IMETHODIMP
nsLDAPOperation::SetClosure(nsISupports* aClosure) {
  mClosure = aClosure;
  return NS_OK;
}

NS_IMETHODIMP
nsLDAPOperation::GetConnection(nsILDAPConnection** aConnection) {
  if (!aConnection) {
    return NS_ERROR_ILLEGAL_VALUE;
  }

  *aConnection = mConnection;
  NS_IF_ADDREF(*aConnection);

  return NS_OK;
}

void nsLDAPOperation::Clear() {
  mMessageListener = nullptr;
  mClosure = nullptr;
  mConnection = nullptr;
}

NS_IMETHODIMP
nsLDAPOperation::GetMessageListener(nsILDAPMessageListener** aMessageListener) {
  if (!aMessageListener) {
    return NS_ERROR_ILLEGAL_VALUE;
  }

  *aMessageListener = mMessageListener;
  NS_IF_ADDREF(*aMessageListener);

  return NS_OK;
}

/**
 * SaslBindRunnable - wraps up an ldap_sasl_bind operation so it can
 * be dispatched to the socket thread.
 */
class SaslBindRunnable : public OpRunnable {
 public:
  SaslBindRunnable(nsLDAPOperation* aOperation, const nsACString& bindName,
                   const nsACString& mechanism, uint8_t* credData,
                   unsigned int credLen)
      : OpRunnable("SaslBindRunnable", aOperation),
        mBindName(bindName),
        mMechanism(mechanism) {
    mCreds.bv_val = (char*)credData;
    mCreds.bv_len = credLen;
  }
  virtual ~SaslBindRunnable() { free(mCreds.bv_val); }

  nsCString mBindName;
  nsCString mMechanism;
  BerValue mCreds;

  NS_IMETHOD Run() override {
    int32_t msgID;
    const int ret =
        ldap_sasl_bind(LDAPHandle(), mBindName.get(), mMechanism.get(), &mCreds,
                       NULL, NULL, &msgID);
    if (ret != LDAP_SUCCESS) {
      NotifyLDAPError();
      return NS_OK;
    }

    SetID(msgID);
    // Register the operation to pick up responses.
    Conn()->AddPendingOperation(msgID, mOp);
    return NS_OK;
  }
};

NS_IMETHODIMP
nsLDAPOperation::SaslBind(const nsACString& service,
                          const nsACString& mechanism,
                          const nsACString& authModuleType) {
  nsresult rv;
  nsAutoCString bindName;

  mAuthModule =
      nsIAuthModule::CreateInstance(PromiseFlatCString(authModuleType).get());
  mMechanism.Assign(mechanism);

  rv = mConnection->GetBindName(bindName);
  NS_ENSURE_SUCCESS(rv, rv);

  mAuthModule->Init(PromiseFlatCString(service).get(),
                    nsIAuthModule::REQ_DEFAULT, nullptr,
                    NS_ConvertUTF8toUTF16(bindName).get(), nullptr);

  uint8_t* credData = nullptr;
  unsigned int credLen;
  rv = mAuthModule->GetNextToken(nullptr, 0, (void**)&credData, &credLen);
  if (NS_FAILED(rv) || !credData) return rv;

  nsCOMPtr<nsIRunnable> op =
      new SaslBindRunnable(this, bindName, mMechanism, credData, credLen);
  mConnection->StartOp(op);
  return NS_OK;
}

/**
 * SaslStep is called by nsLDAPConnection behind the scenes to continue
 * a SaslBind.
 * This is called from nsLDAPConnectionRunnable, which will already be running
 * on the socket thread, so we don't need to do any fancy dispatch stuff here.
 */
NS_IMETHODIMP
nsLDAPOperation::SaslStep(const char* token, uint32_t tokenLen) {
  nsresult rv;
  nsAutoCString bindName;
  struct berval clientCreds;
  struct berval serverCreds;
  unsigned int credlen;

  rv = mConnection->RemovePendingOperation(mMsgID);
  NS_ENSURE_SUCCESS(rv, rv);

  serverCreds.bv_val = (char*)token;
  serverCreds.bv_len = tokenLen;

  rv = mConnection->GetBindName(bindName);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = mAuthModule->GetNextToken(serverCreds.bv_val, serverCreds.bv_len,
                                 (void**)&clientCreds.bv_val, &credlen);
  NS_ENSURE_SUCCESS(rv, rv);

  clientCreds.bv_len = credlen;

  const int lderrno =
      ldap_sasl_bind(mConnectionHandle, bindName.get(), mMechanism.get(),
                     &clientCreds, NULL, NULL, &mMsgID);

  free(clientCreds.bv_val);

  if (lderrno != LDAP_SUCCESS) return TranslateLDAPErrorToNSError(lderrno);

  // make sure the connection knows where to call back once the messages
  // for this operation start coming in
  return mConnection->AddPendingOperation(mMsgID, this);
}

/**
 * SimpleBindRunnable - wraps up an ldap_simple_bind operation so it can
 * be dispatched to the socket thread.
 */
class SimpleBindRunnable : public OpRunnable {
 public:
  SimpleBindRunnable(nsLDAPOperation* aOperation, const nsACString& bindName,
                     const nsACString& passwd)
      : OpRunnable("SimpleBindRunnable", aOperation),
        mBindName(bindName),
        mPasswd(passwd) {}
  virtual ~SimpleBindRunnable() {}

  nsCString mBindName;
  nsCString mPasswd;

  NS_IMETHOD Run() override {
    LDAP* ld = LDAPHandle();
    int32_t msgID = ldap_simple_bind(ld, mBindName.get(), mPasswd.get());

    if (msgID == -1) {
      NotifyLDAPError();
      return NS_OK;
    }

    SetID(msgID);
    // Register the operation to pick up responses.
    Conn()->AddPendingOperation(msgID, mOp);
    return NS_OK;
  }
};

// wrapper for ldap_simple_bind()
//
NS_IMETHODIMP
nsLDAPOperation::SimpleBind(const nsACString& passwd) {
  RefPtr<nsLDAPConnection> connection = mConnection;
  // There is a possibility that mConnection can be cleared by another
  // thread. Grabbing a local reference to mConnection may avoid this.
  // See https://bugzilla.mozilla.org/show_bug.cgi?id=557928#c1
  nsresult rv;
  nsAutoCString bindName;
  int32_t originalMsgID = mMsgID;
  // Ugly hack alert:
  // the first time we get called with a passwd, remember it.
  // Then, if we get called again w/o a password, use the
  // saved one. Getting called again means we're trying to
  // fall back to VERSION2.
  // Since LDAP operations are thrown away when done, it won't stay
  // around in memory.
  if (!passwd.IsEmpty()) mSavePassword = passwd;

  NS_ASSERTION(mMessageListener, "MessageListener not set");

  rv = connection->GetBindName(bindName);
  if (NS_FAILED(rv)) return rv;

  MOZ_LOG(gLDAPLogModule, mozilla::LogLevel::Debug,
          ("nsLDAPOperation::SimpleBind(): called; bindName = '%s'; ",
           bindName.get()));

  // this (nsLDAPOperation) may be released by RemovePendingOperation()
  // See https://bugzilla.mozilla.org/show_bug.cgi?id=1063829.
  RefPtr<nsLDAPOperation> kungFuDeathGrip = this;

  // If this is a second try at binding, remove the operation from pending ops
  // because msg id has changed...
  if (originalMsgID) connection->RemovePendingOperation(originalMsgID);
  mMsgID = 0;

  nsCOMPtr<nsIRunnable> op =
      new SimpleBindRunnable(this, bindName, mSavePassword);
  mConnection->StartOp(op);
  return NS_OK;
}

/**
 * Given an array of nsILDAPControls, return the appropriate
 * zero-terminated array of LDAPControls ready to pass in to the C SDK.
 */
static nsresult convertControlArray(
    nsTArray<RefPtr<nsILDAPControl>> const& xpControls, LDAPControl*** aArray) {
  // don't allocate an array if someone passed us in an empty one
  if (xpControls.IsEmpty()) {
    *aArray = nullptr;
    return NS_OK;
  }

  // allocate a local array of the form understood by the C-SDK;
  // +1 is to account for the final null terminator.  PR_Calloc is
  // is used so that ldap_controls_free will work anywhere during the
  // iteration
  LDAPControl** controls = static_cast<LDAPControl**>(
      PR_Calloc(xpControls.Length() + 1, sizeof(LDAPControl)));

  uint32_t i = 0;
  for (auto xpControl : xpControls) {
    nsLDAPControl* ctl = static_cast<nsLDAPControl*>(
        static_cast<nsILDAPControl*>(xpControl.get()));

    // convert it to an LDAPControl structure placed in the new array
    nsresult rv = ctl->ToLDAPControl(&controls[i]);
    if (NS_FAILED(rv)) {
      ldap_controls_free(controls);
      return rv;
    }
    ++i;
  }
  // Terminator for the control array.
  controls[i++] = nullptr;

  *aArray = controls;
  return NS_OK;
}

/* attribute unsigned long requestNum; */
NS_IMETHODIMP nsLDAPOperation::GetRequestNum(uint32_t* aRequestNum) {
  *aRequestNum = mRequestNum;
  return NS_OK;
}

NS_IMETHODIMP nsLDAPOperation::SetRequestNum(uint32_t aRequestNum) {
  mRequestNum = aRequestNum;
  return NS_OK;
}

/**
 * SearchExtRunnable - wraps up an ldap_search_ext operation so it can
 * be dispatched to the socket thread.
 */
class SearchExtRunnable : public OpRunnable {
 public:
  SearchExtRunnable(nsLDAPOperation* aOperation, const nsACString& aBaseDn,
                    int32_t aScope, const nsACString& aFilter, char** aAttrs,
                    LDAPControl** aServerctls, LDAPControl** aClientctls,
                    int32_t aSizeLimit)
      : OpRunnable("SearchExtRunnable", aOperation),
        mBaseDn(aBaseDn),
        mScope(aScope),
        mFilter(aFilter),
        mAttrs(aAttrs),
        mServerctls(aServerctls),
        mClientctls(aClientctls),
        mSizeLimit(aSizeLimit) {}
  virtual ~SearchExtRunnable() {
    // clean up
    ldap_controls_free(mServerctls);
    ldap_controls_free(mClientctls);
    if (!mAttrs) return;
    // The last attr entry is null, so no need to free that.
    int numAttrs = 0;
    while (mAttrs[numAttrs]) {
      ++numAttrs;
    }
    NS_FREE_XPCOM_ALLOCATED_POINTER_ARRAY(numAttrs, mAttrs);
  }

  nsCString mBaseDn;
  int32_t mScope;
  nsCString mFilter;
  char** mAttrs;
  LDAPControl** mServerctls;
  LDAPControl** mClientctls;
  int32_t mSizeLimit;

  NS_IMETHOD Run() override {
    int32_t msgID;
    LDAP* ld = LDAPHandle();
    int retVal =
        ldap_search_ext(ld, PromiseFlatCString(mBaseDn).get(), mScope,
                        PromiseFlatCString(mFilter).get(), mAttrs, 0,
                        mServerctls, mClientctls, 0, mSizeLimit, &msgID);
    // Did the operation succeed?
    if (retVal != LDAP_SUCCESS) {
      NotifyLDAPError();
      return NS_OK;
    }

    SetID(msgID);
    // Register the operation to pick up responses.
    Conn()->AddPendingOperation(msgID, mOp);
    return NS_OK;
  }
};

NS_IMETHODIMP
nsLDAPOperation::SearchExt(const nsACString& aBaseDn, int32_t aScope,
                           const nsACString& aFilter,
                           const nsACString& aAttributes,
                           PRIntervalTime aTimeOut, int32_t aSizeLimit) {
  if (!mMessageListener) {
    NS_ERROR("nsLDAPOperation::SearchExt(): mMessageListener not set");
    return NS_ERROR_NOT_INITIALIZED;
  }

  // XXX add control logging
  MOZ_LOG(gLDAPLogModule, mozilla::LogLevel::Debug,
          ("nsLDAPOperation::SearchExt(): called with aBaseDn = '%s'; "
           "aFilter = '%s'; aAttributes = %s; aSizeLimit = %d",
           PromiseFlatCString(aBaseDn).get(), PromiseFlatCString(aFilter).get(),
           PromiseFlatCString(aAttributes).get(), aSizeLimit));

  LDAPControl** serverctls = nullptr;
  nsresult rv;
  rv = convertControlArray(mServerControls, &serverctls);
  if (NS_FAILED(rv)) {
    MOZ_LOG(gLDAPLogModule, mozilla::LogLevel::Error,
            ("nsLDAPOperation::SearchExt(): error converting server "
             "control array: %" PRIx32,
             static_cast<uint32_t>(rv)));
    return rv;
  }

  LDAPControl** clientctls = nullptr;
  rv = convertControlArray(mClientControls, &clientctls);
  if (NS_FAILED(rv)) {
    MOZ_LOG(gLDAPLogModule, mozilla::LogLevel::Error,
            ("nsLDAPOperation::SearchExt(): error converting client "
             "control array: %" PRIx32,
             static_cast<uint32_t>(rv)));
    ldap_controls_free(serverctls);
    return rv;
  }

  // Convert our comma separated string to one that the C-SDK will like, i.e.
  // convert to a char array and add a last NULL element.
  nsTArray<nsCString> attrArray;
  ParseString(aAttributes, ',', attrArray);
  char** attrs = nullptr;
  uint32_t origLength = attrArray.Length();
  if (origLength) {
    attrs = static_cast<char**>(moz_xmalloc((origLength + 1) * sizeof(char*)));
    if (!attrs) return NS_ERROR_OUT_OF_MEMORY;

    for (uint32_t i = 0; i < origLength; ++i)
      attrs[i] = ToNewCString(attrArray[i]);

    attrs[origLength] = 0;
  }

  // XXX deal with timeout here

  nsCOMPtr<nsIRunnable> op =
      new SearchExtRunnable(this, aBaseDn, aScope, aFilter, attrs, serverctls,
                            clientctls, aSizeLimit);
  mConnection->StartOp(op);
  return NS_OK;
}

NS_IMETHODIMP
nsLDAPOperation::GetMessageID(int32_t* aMsgID) {
  if (!aMsgID) {
    return NS_ERROR_ILLEGAL_VALUE;
  }

  *aMsgID = mMsgID;

  return NS_OK;
}

// as far as I can tell from reading the LDAP C SDK code, abandoning something
// that has already been abandoned does not return an error
//

/**
 * AbandonExtRunnable - wraps up an ldap_abandon_ext operation so it can be
 * dispatched to the socket thread.
 */
class AbandonExtRunnable : public OpRunnable {
 public:
  AbandonExtRunnable(nsLDAPOperation* aOperation, int aMsgID)
      : OpRunnable("AbandonExtRunnable", aOperation), mMsgID(aMsgID) {}
  virtual ~AbandonExtRunnable() {}

  int32_t mMsgID;

  NS_IMETHOD Run() override {
    LDAP* ld = LDAPHandle();
    int retVal = ldap_abandon_ext(ld, mMsgID, 0, 0);
    if (retVal != LDAP_SUCCESS) {
      NotifyLDAPError();
      return NS_OK;
    }

    // try to remove it from the pendingOperations queue, if it's there.
    // even if something goes wrong here, the abandon() has already succeeded
    // succeeded (and there's nothing else the caller can reasonably do),
    // so we only pay attention to this in debug builds.
    //
    // check Connection in case we're getting bit by
    // http://bugzilla.mozilla.org/show_bug.cgi?id=239729, wherein we
    // theorize that ::Clearing the operation is nulling out the mConnection
    // from another thread.
    if (Conn()) {
      nsresult rv = Conn()->RemovePendingOperation(mMsgID);

      if (NS_FAILED(rv)) {
        // XXXdmose should we keep AbandonExt from happening on multiple
        // threads at the same time?  that's when this condition is most
        // likely to occur.  i _think_ the LDAP C SDK is ok with this; need
        // to verify.
        //
        NS_WARNING(
            "nsLDAPOperation::AbandonExt: "
            "mConnection->RemovePendingOperation(this) failed.");
      }
      SetID(0);
    }
    return NS_OK;
  }
};

NS_IMETHODIMP
nsLDAPOperation::AbandonExt() {
  if (!mMessageListener || mMsgID == 0) {
    NS_ERROR(
        "nsLDAPOperation::AbandonExt(): mMessageListener or "
        "mMsgId not initialized");
    return NS_ERROR_NOT_INITIALIZED;
  }

  MOZ_LOG(gLDAPLogModule, mozilla::LogLevel::Debug,
          ("nsLDAPOperation::AbandonExt() called (msgid=%d)", mMsgID));

  // XXX handle controls here
  if (!mServerControls.IsEmpty() || !mClientControls.IsEmpty()) {
    return NS_ERROR_NOT_IMPLEMENTED;
  }

  nsCOMPtr<nsIRunnable> op = new AbandonExtRunnable(this, mMsgID);
  mConnection->StartOp(op);
  return NS_OK;
}

NS_IMETHODIMP
nsLDAPOperation::GetClientControls(
    nsTArray<RefPtr<nsILDAPControl>>& aControls) {
  aControls = mClientControls.Clone();
  return NS_OK;
}

NS_IMETHODIMP
nsLDAPOperation::SetClientControls(
    nsTArray<RefPtr<nsILDAPControl>> const& aControls) {
  mClientControls = aControls.Clone();
  return NS_OK;
}

NS_IMETHODIMP nsLDAPOperation::GetServerControls(
    nsTArray<RefPtr<nsILDAPControl>>& aControls) {
  aControls = mServerControls.Clone();
  return NS_OK;
}

NS_IMETHODIMP nsLDAPOperation::SetServerControls(
    nsTArray<RefPtr<nsILDAPControl>> const& aControls) {
  mServerControls = aControls.Clone();
  return NS_OK;
}

/**
 * AddExtRunnable - wraps up an ldap_add_ext operation so it can be dispatched
 * to the socket thread.
 */
class AddExtRunnable : public OpRunnable {
 public:
  AddExtRunnable(nsLDAPOperation* aOperation, const nsACString& aDn,
                 LDAPMod** aMods)
      : OpRunnable("AddExtRunnable", aOperation), mDn(aDn), mMods(aMods) {}
  virtual ~AddExtRunnable() { freeMods(mMods); }

  nsCString mDn;
  LDAPMod** mMods;

  NS_IMETHOD Run() override {
    int32_t msgID;
    LDAP* ld = LDAPHandle();
    int retVal =
        ldap_add_ext(ld, PromiseFlatCString(mDn).get(), mMods, 0, 0, &msgID);
    if (retVal != LDAP_SUCCESS) {
      NotifyLDAPError();
      return NS_OK;
    }
    SetID(msgID);
    // Register the operation to pick up responses.
    Conn()->AddPendingOperation(msgID, mOp);
    return NS_OK;
  }
};

/**
 * wrapper for ldap_add_ext(): kicks off an async add request.
 *
 * @param aBaseDn           Base DN to search
 * @param aMods             Array of modifications
 *
 * XXX doesn't currently handle LDAPControl params
 *
 */
NS_IMETHODIMP
nsLDAPOperation::AddExt(const nsACString& aBaseDn,
                        nsTArray<RefPtr<nsILDAPModification>> const& aMods) {
  if (!mMessageListener) {
    NS_ERROR("nsLDAPOperation::AddExt(): mMessageListener not set");
    return NS_ERROR_NOT_INITIALIZED;
  }

  MOZ_LOG(gLDAPLogModule, mozilla::LogLevel::Debug,
          ("nsLDAPOperation::AddExt(): called with aBaseDn = '%s'",
           PromiseFlatCString(aBaseDn).get()));
  LDAPMod** rawMods;

  nsresult rv = convertMods(aMods, &rawMods);
  NS_ENSURE_SUCCESS(rv, rv);
#ifdef NS_DEBUG
  // Sanity check - only LDAP_MOD_ADD modifications allowed.
  for (int i = 0; rawMods[i]; ++i) {
    int32_t op = rawMods[i]->mod_op;
    NS_ASSERTION(((op & ~LDAP_MOD_BVALUES) == LDAP_MOD_ADD),
                 "AddExt can only add.");
  }
#endif
  nsCOMPtr<nsIRunnable> op = new AddExtRunnable(this, aBaseDn, rawMods);
  mConnection->StartOp(op);
  return NS_OK;
}

/**
 * DeleteExtRunnable - wraps up an ldap_delete_ext operation so it can be
 * dispatched to the socket thread.
 */
class DeleteExtRunnable : public OpRunnable {
 public:
  DeleteExtRunnable(nsLDAPOperation* aOperation, const nsACString& aDn)
      : OpRunnable("DeleteExtRunnable", aOperation), mDn(aDn) {}
  virtual ~DeleteExtRunnable() {}

  nsCString mDn;

  NS_IMETHOD Run() override {
    int32_t msgID;
    LDAP* ld = LDAPHandle();
    int retVal =
        ldap_delete_ext(ld, PromiseFlatCString(mDn).get(), 0, 0, &msgID);
    if (retVal != LDAP_SUCCESS) {
      NotifyLDAPError();
      return NS_OK;
    }
    SetID(msgID);
    // Register the operation to pick up responses.
    Conn()->AddPendingOperation(msgID, mOp);
    return NS_OK;
  }
};

/**
 * wrapper for ldap_delete_ext(): kicks off an async delete request.
 *
 * @param aBaseDn               Base DN to delete
 *
 * XXX doesn't currently handle LDAPControl params
 *
 * void deleteExt(in AUTF8String aBaseDn);
 */
NS_IMETHODIMP
nsLDAPOperation::DeleteExt(const nsACString& aDn) {
  if (!mMessageListener) {
    NS_ERROR("nsLDAPOperation::DeleteExt(): mMessageListener not set");
    return NS_ERROR_NOT_INITIALIZED;
  }

  MOZ_LOG(gLDAPLogModule, mozilla::LogLevel::Debug,
          ("nsLDAPOperation::DeleteExt(): called with aDn = '%s'",
           PromiseFlatCString(aDn).get()));

  nsCOMPtr<nsIRunnable> op = new DeleteExtRunnable(this, aDn);
  mConnection->StartOp(op);
  return NS_OK;
}

/**
 * ModifyExtRunnable - wraps up an ldap_modify_ext operation so it can be
 * dispatched to the socket thread.
 */
class ModifyExtRunnable : public OpRunnable {
 public:
  ModifyExtRunnable(nsLDAPOperation* aOperation, const nsACString& aDn,
                    LDAPMod** aMods)
      : OpRunnable("ModifyExtRunnable", aOperation), mDn(aDn), mMods(aMods) {}
  virtual ~ModifyExtRunnable() { freeMods(mMods); }

  nsCString mDn;
  LDAPMod** mMods;

  NS_IMETHOD Run() override {
    int32_t msgID;
    LDAP* ld = LDAPHandle();
    int retVal =
        ldap_modify_ext(ld, PromiseFlatCString(mDn).get(), mMods, 0, 0, &msgID);
    if (retVal != LDAP_SUCCESS) {
      NotifyLDAPError();
      return NS_OK;
    }
    SetID(msgID);
    // Register the operation to pick up responses.
    Conn()->AddPendingOperation(msgID, mOp);
    return NS_OK;
  }
};

/**
 * wrapper for ldap_modify_ext(): kicks off an async modify request.
 *
 * @param aBaseDn           Base DN to modify
 * @param aModCount         Number of modifications
 * @param aMods             Array of modifications
 *
 * XXX doesn't currently handle LDAPControl params
 */
NS_IMETHODIMP
nsLDAPOperation::ModifyExt(const nsACString& aBaseDn,
                           nsTArray<RefPtr<nsILDAPModification>> const& aMods) {
  if (!mMessageListener) {
    NS_ERROR("nsLDAPOperation::ModifyExt(): mMessageListener not set");
    return NS_ERROR_NOT_INITIALIZED;
  }

  MOZ_LOG(gLDAPLogModule, mozilla::LogLevel::Debug,
          ("nsLDAPOperation::ModifyExt(): called with aBaseDn = '%s'",
           PromiseFlatCString(aBaseDn).get()));

  LDAPMod** rawMods;
  nsresult rv = convertMods(aMods, &rawMods);
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIRunnable> op = new ModifyExtRunnable(this, aBaseDn, rawMods);
  mConnection->StartOp(op);
  return NS_OK;
}

/**
 * RenameRunnable - wraps up an ldap_modify_ext operation so it can be
 * dispatched to the socket thread.
 */
class RenameRunnable : public OpRunnable {
 public:
  RenameRunnable(nsLDAPOperation* aOperation, const nsACString& aBaseDn,
                 const nsACString& aNewRDn, const nsACString& aNewParent,
                 bool aDeleteOldRDn)
      : OpRunnable("RenameRunnable", aOperation),
        mBaseDn(aBaseDn),
        mNewRDn(aNewRDn),
        mNewParent(aNewParent),
        mDeleteOldRDn(aDeleteOldRDn) {}
  virtual ~RenameRunnable() {}

  nsCString mBaseDn;
  nsCString mNewRDn;
  nsCString mNewParent;
  bool mDeleteOldRDn;

  NS_IMETHOD Run() override {
    int32_t msgID;
    int retVal = ldap_rename(LDAPHandle(), PromiseFlatCString(mBaseDn).get(),
                             PromiseFlatCString(mNewRDn).get(),
                             PromiseFlatCString(mNewParent).get(),
                             mDeleteOldRDn, 0, 0, &msgID);
    if (retVal != LDAP_SUCCESS) {
      NotifyLDAPError();
      return NS_OK;
    }
    SetID(msgID);
    // Register the operation to pick up responses.
    Conn()->AddPendingOperation(msgID, mOp);
    return NS_OK;
  }
};

/**
 * wrapper for ldap_rename(): kicks off an async rename request.
 *
 * @param aBaseDn               Base DN to rename
 * @param aNewRDn               New relative DN
 * @param aNewParent            DN of the new parent under which to move the
 *
 * XXX doesn't currently handle LDAPControl params
 *
 * void rename(in AUTF8String aBaseDn, in AUTF8String aNewRDn,
 *             in AUTF8String aNewParent, in boolean aDeleteOldRDn);
 */
NS_IMETHODIMP
nsLDAPOperation::Rename(const nsACString& aBaseDn, const nsACString& aNewRDn,
                        const nsACString& aNewParent, bool aDeleteOldRDn) {
  if (!mMessageListener) {
    NS_ERROR("nsLDAPOperation::Rename(): mMessageListener not set");
    return NS_ERROR_NOT_INITIALIZED;
  }
  MOZ_LOG(gLDAPLogModule, mozilla::LogLevel::Debug,
          ("nsLDAPOperation::Rename(): called with aBaseDn = '%s'",
           PromiseFlatCString(aBaseDn).get()));

  nsCOMPtr<nsIRunnable> op =
      new RenameRunnable(this, aBaseDn, aNewRDn, aNewParent, aDeleteOldRDn);
  mConnection->StartOp(op);
  return NS_OK;
}

/**
 * Convert nsILDAPBERValue array to null-terminated array of berval ptrs.
 * The returned array should be freed with freeValues().
 */
static nsresult convertValues(nsTArray<RefPtr<nsILDAPBERValue>> const& values,
                              berval*** aBValues) {
  *aBValues = static_cast<berval**>(
      moz_xmalloc((values.Length() + 1) * sizeof(berval*)));

  nsresult rv = NS_OK;
  uint32_t valueIndex = 0;
  for (auto value : values) {
    nsTArray<uint8_t> tmp;
    rv = value->Get(tmp);
    if (NS_FAILED(rv)) break;

    berval* bval = new berval;
    bval->bv_len = tmp.Length() * sizeof(uint8_t);
    bval->bv_val = static_cast<char*>(moz_xmalloc(bval->bv_len));
    if (!bval->bv_val) {
      rv = NS_ERROR_OUT_OF_MEMORY;
      break;
    }
    memcpy(bval->bv_val, tmp.Elements(), bval->bv_len);
    (*aBValues)[valueIndex++] = bval;
  }
  (*aBValues)[valueIndex++] = nullptr;

  if (NS_FAILED(rv)) {
    freeValues(*aBValues);
    *aBValues = nullptr;
    return rv;
  }
  return NS_OK;
}

static void freeValues(berval** aVals) {
  if (!aVals) {
    return;
  }
  for (int i = 0; aVals[i]; ++i) {
    free(aVals[i]->bv_val);
    delete (aVals[i]);
  }
  free(aVals);
}

/**
 * Convert nsILDAPModifications to null-terminated array of LDAPMod ptrs.
 * Will return null upon error.
 * The returned array should be freed with freeMods().
 */
static nsresult convertMods(nsTArray<RefPtr<nsILDAPModification>> const& aMods,
                            LDAPMod*** aOut) {
  *aOut = static_cast<LDAPMod**>(
      moz_xmalloc((aMods.Length() + 1) * sizeof(LDAPMod*)));

  nsresult rv = NS_OK;
  nsAutoCString type;
  uint32_t index = 0;
  for (auto modif : aMods) {
    LDAPMod* mod = new LDAPMod();

    int32_t operation;
    rv = modif->GetOperation(&operation);
    if (NS_FAILED(rv)) break;
    mod->mod_op = operation | LDAP_MOD_BVALUES;

    nsresult rv = modif->GetType(type);
    if (NS_FAILED(rv)) break;
    mod->mod_type = ToNewCString(type);

    nsTArray<RefPtr<nsILDAPBERValue>> values;
    rv = modif->GetValues(values);
    if (NS_FAILED(rv)) break;
    rv = convertValues(values, &mod->mod_bvalues);
    if (NS_FAILED(rv)) {
      free(mod->mod_type);
      break;
    }
    (*aOut)[index++] = mod;
  }
  (*aOut)[index++] = nullptr;  // Always terminate array, even if failed.

  if (NS_FAILED(rv)) {
    // clean up.
    freeMods(*aOut);
    *aOut = nullptr;
    return rv;
  }
  return NS_OK;
}

/**
 * Free an LDAPMod array created by convertMods().
 */
static void freeMods(LDAPMod** aMods) {
  if (!aMods) {
    return;
  }
  int i;
  for (i = 0; aMods[i]; ++i) {
    LDAPMod* mod = aMods[i];
    free(mod->mod_type);
    freeValues(mod->mod_bvalues);
    delete mod;
  }
  free(aMods);
}
