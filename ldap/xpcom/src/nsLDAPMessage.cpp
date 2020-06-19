/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsLDAPInternal.h"
#include "nsLDAPMessage.h"
#include "nspr.h"
#include "nsDebug.h"
#include "nsMemory.h"
#include "nsLDAPConnection.h"
#include "nsISupportsUtils.h"
#include "nsLDAPBERValue.h"
#include "nsILDAPErrors.h"
#include "nsIClassInfoImpl.h"
#include "nsLDAPUtils.h"
#include "mozilla/Utf8.h"

NS_IMPL_CLASSINFO(nsLDAPMessage, NULL, nsIClassInfo::THREADSAFE,
                  NS_LDAPMESSAGE_CID)

NS_IMPL_ADDREF(nsLDAPMessage)
NS_IMPL_RELEASE(nsLDAPMessage)
NS_INTERFACE_MAP_BEGIN(nsLDAPMessage)
  NS_INTERFACE_MAP_ENTRY(nsILDAPMessage)
  NS_INTERFACE_MAP_ENTRY_AMBIGUOUS(nsISupports, nsILDAPMessage)
  NS_IMPL_QUERY_CLASSINFO(nsLDAPMessage)
NS_INTERFACE_MAP_END
NS_IMPL_CI_INTERFACE_GETTER(nsLDAPMessage, nsILDAPMessage)

// constructor
//
nsLDAPMessage::nsLDAPMessage()
    : mMsgHandle(0),
      mErrorCode(LDAP_SUCCESS),
      mMatchedDn(0),
      mErrorMessage(0),
      mReferrals(0),
      mServerControls(0) {}

// destructor
//
nsLDAPMessage::~nsLDAPMessage(void) {
  if (mMsgHandle) {
    int rc = ldap_msgfree(mMsgHandle);

    // If you are having problems compiling the following code on a Solaris
    // machine with the Forte 6 Update 1 compilers, then you need to make
    // sure you have applied all the required patches. See:
    // http://www.mozilla.org/unix/solaris-build.html for more details.

    switch (rc) {
      case LDAP_RES_BIND:
      case LDAP_RES_SEARCH_ENTRY:
      case LDAP_RES_SEARCH_RESULT:
      case LDAP_RES_MODIFY:
      case LDAP_RES_ADD:
      case LDAP_RES_DELETE:
      case LDAP_RES_MODRDN:
      case LDAP_RES_COMPARE:
      case LDAP_RES_SEARCH_REFERENCE:
      case LDAP_RES_EXTENDED:
      case LDAP_RES_ANY:
        // success
        break;

      case LDAP_SUCCESS:
        // timed out (dunno why LDAP_SUCCESS is used to indicate this)
        MOZ_LOG(gLDAPLogModule, mozilla::LogLevel::Warning,
                ("nsLDAPMessage::~nsLDAPMessage: ldap_msgfree() timed out"));
        break;

      default:
        // other failure
        MOZ_LOG(gLDAPLogModule, mozilla::LogLevel::Warning,
                ("nsLDAPMessage::~nsLDAPMessage: ldap_msgfree() "
                 "failed: %s",
                 ldap_err2string(rc)));
        break;
    }
  }

  if (mMatchedDn) {
    ldap_memfree(mMatchedDn);
  }

  if (mErrorMessage) {
    ldap_memfree(mErrorMessage);
  }

  if (mReferrals) {
    ldap_value_free(mReferrals);
  }

  if (mServerControls) {
    ldap_controls_free(mServerControls);
  }
}

/**
 * Initializes a message.
 *
 * @param aConnection           The nsLDAPConnection this message is on
 * @param aMsgHandle            The native LDAPMessage to be wrapped.
 *
 * @exception NS_ERROR_ILLEGAL_VALUE        null pointer passed in
 * @exception NS_ERROR_UNEXPECTED           internal err; shouldn't happen
 * @exception NS_ERROR_LDAP_DECODING_ERROR  problem during BER decoding
 * @exception NS_ERROR_OUT_OF_MEMORY        ran out of memory
 */
nsresult nsLDAPMessage::Init(nsILDAPConnection* aConnection,
                             LDAPMessage* aMsgHandle) {
  int parseResult;

  if (!aConnection || !aMsgHandle) {
    NS_WARNING("Null pointer passed in to nsLDAPMessage::Init()");
    return NS_ERROR_ILLEGAL_VALUE;
  }

  // initialize the appropriate member vars
  //
  mConnection = aConnection;
  mMsgHandle = aMsgHandle;

  // cache the connection handle.  we're violating the XPCOM type-system
  // here since we're a friend of the connection class and in the
  // same module.
  //
  mConnectionHandle =
      static_cast<nsLDAPConnection*>(aConnection)->mConnectionHandle;

  // do any useful message parsing
  //
  const int msgType = ldap_msgtype(mMsgHandle);
  if (msgType == -1) {
    NS_ERROR("nsLDAPMessage::Init(): ldap_msgtype() failed");
    return NS_ERROR_UNEXPECTED;
  }

  switch (msgType) {
    case LDAP_RES_SEARCH_REFERENCE:
      // XXX should do something here?
      break;

    case LDAP_RES_SEARCH_ENTRY:
      // nothing to do here
      break;

    case LDAP_RES_EXTENDED:
      // XXX should do something here?
      break;

    case LDAP_RES_BIND:
    case LDAP_RES_SEARCH_RESULT:
    case LDAP_RES_MODIFY:
    case LDAP_RES_ADD:
    case LDAP_RES_DELETE:
    case LDAP_RES_MODRDN:
    case LDAP_RES_COMPARE:
      parseResult = ldap_parse_result(mConnectionHandle, mMsgHandle,
                                      &mErrorCode, &mMatchedDn, &mErrorMessage,
                                      &mReferrals, &mServerControls, 0);
      switch (parseResult) {
        case LDAP_SUCCESS:
          // we're good
          break;

        case LDAP_DECODING_ERROR:
          NS_WARNING(
              "nsLDAPMessage::Init(): ldap_parse_result() hit a "
              "decoding error");
          return NS_ERROR_LDAP_DECODING_ERROR;

        case LDAP_NO_MEMORY:
          NS_WARNING(
              "nsLDAPMessage::Init(): ldap_parse_result() ran out "
              "of memory");
          return NS_ERROR_OUT_OF_MEMORY;

        case LDAP_PARAM_ERROR:
        case LDAP_MORE_RESULTS_TO_RETURN:
        case LDAP_NO_RESULTS_RETURNED:
        default:
          NS_ERROR(
              "nsLDAPMessage::Init(): ldap_parse_result returned "
              "unexpected return code");
          return NS_ERROR_UNEXPECTED;
      }

      break;

    default:
      NS_ERROR("nsLDAPMessage::Init(): unexpected message type");
      return NS_ERROR_UNEXPECTED;
  }

  return NS_OK;
}

/**
 * The result code of the (possibly partial) operation.
 *
 * @exception NS_ERROR_ILLEGAL_VALUE    null pointer passed in
 *
 * readonly attribute long errorCode;
 */
NS_IMETHODIMP
nsLDAPMessage::GetErrorCode(int32_t* aErrorCode) {
  if (!aErrorCode) {
    return NS_ERROR_ILLEGAL_VALUE;
  }

  *aErrorCode = mErrorCode;
  return NS_OK;
}

NS_IMETHODIMP
nsLDAPMessage::GetType(int32_t* aType) {
  if (!aType) {
    return NS_ERROR_ILLEGAL_VALUE;
  }

  *aType = ldap_msgtype(mMsgHandle);
  if (*aType == -1) {
    return NS_ERROR_UNEXPECTED;
  };

  return NS_OK;
}

// Array<AUTF8String> getAttributes();
NS_IMETHODIMP
nsLDAPMessage::GetAttributes(nsTArray<nsCString>& attrs) {
  attrs.Clear();
  BerElement* ber = nullptr;
  char* attr = ldap_first_attribute(mConnectionHandle, mMsgHandle, &ber);
  while (attr) {
    attrs.AppendElement(attr);
    ldap_memfree(attr);
    attr = ldap_next_attribute(mConnectionHandle, mMsgHandle, ber);
  }
  if (ber) {
    ber_free(ber, 0);
  }
  // Finished or failed?
  int32_t lderrno = ldap_get_lderrno(mConnectionHandle, 0, 0);
  switch (lderrno) {
    case LDAP_SUCCESS:
      return NS_OK;  // Hooray!
    case LDAP_PARAM_ERROR:
      NS_WARNING(
          "nsLDAPMessage::GetAttributes() failure; probable bug "
          "or memory corruption encountered");
      return NS_ERROR_UNEXPECTED;
    case LDAP_DECODING_ERROR:
      NS_WARNING("nsLDAPMessage::GetAttributes(): decoding error");
      return NS_ERROR_LDAP_DECODING_ERROR;
    case LDAP_NO_MEMORY:
      return NS_ERROR_OUT_OF_MEMORY;
    default:
      NS_WARNING(
          "nsLDAPMessage::GetAttributes(): LDAP C SDK returned "
          "unexpected value; possible bug or memory corruption");
      return NS_ERROR_UNEXPECTED;
  }
}

// readonly attribute wstring dn;
NS_IMETHODIMP nsLDAPMessage::GetDn(nsACString& aDn) {
  char* rawDn = ldap_get_dn(mConnectionHandle, mMsgHandle);

  if (!rawDn) {
    int32_t lderrno = ldap_get_lderrno(mConnectionHandle, 0, 0);

    switch (lderrno) {
      case LDAP_DECODING_ERROR:
        NS_WARNING("nsLDAPMessage::GetDn(): ldap decoding error");
        return NS_ERROR_LDAP_DECODING_ERROR;

      case LDAP_PARAM_ERROR:
      default:
        NS_ERROR("nsLDAPMessage::GetDn(): internal error");
        return NS_ERROR_UNEXPECTED;
    }
  }

  MOZ_LOG(gLDAPLogModule, mozilla::LogLevel::Debug,
          ("nsLDAPMessage::GetDn(): dn = '%s'", rawDn));

  aDn.Assign(rawDn);
  ldap_memfree(rawDn);

  return NS_OK;
}

// wrapper for ldap_get_values()
//
NS_IMETHODIMP
nsLDAPMessage::GetValues(const char* aAttr, nsTArray<nsString>& aValues) {
  aValues.Clear();
  char** values;

#if defined(DEBUG)
  // We only want this being logged for debug builds so as not to affect
  // performance too much.
  MOZ_LOG(gLDAPLogModule, mozilla::LogLevel::Debug,
          ("nsLDAPMessage::GetValues(): called with aAttr = '%s'", aAttr));
#endif

  values = ldap_get_values(mConnectionHandle, mMsgHandle, aAttr);

  // bail out if there was a problem
  //
  if (!values) {
    int32_t lderrno = ldap_get_lderrno(mConnectionHandle, 0, 0);

    if (lderrno == LDAP_DECODING_ERROR) {
      // this may not be an error; it could just be that the
      // caller has asked for an attribute that doesn't exist.
      //
      MOZ_LOG(gLDAPLogModule, mozilla::LogLevel::Warning,
              ("nsLDAPMessage::GetValues(): ldap_get_values returned "
               "LDAP_DECODING_ERROR"));
      return NS_ERROR_LDAP_DECODING_ERROR;

    } else if (lderrno == LDAP_PARAM_ERROR) {
      NS_ERROR("nsLDAPMessage::GetValues(): internal error: 1");
      return NS_ERROR_UNEXPECTED;

    } else {
      NS_ERROR("nsLDAPMessage::GetValues(): internal error: 2");
      return NS_ERROR_UNEXPECTED;
    }
  }

  // clone the array (except for the trailing NULL entry) using the
  // shared allocator for XPCOM correctness
  //
  uint32_t numVals = ldap_count_values(values);
  aValues.SetCapacity(numVals);
  uint32_t i;
  for (i = 0; i < numVals; i++) {
    nsDependentCString sValue(values[i]);
    if (mozilla::IsUtf8(sValue))
      aValues.AppendElement(NS_ConvertUTF8toUTF16(sValue));
    else
      aValues.AppendElement(NS_ConvertASCIItoUTF16(sValue));
  }
  ldap_value_free(values);

  return NS_OK;
}

// wrapper for get_values_len
//
NS_IMETHODIMP
nsLDAPMessage::GetBinaryValues(const char* aAttr,
                               nsTArray<RefPtr<nsILDAPBERValue>>& aValues) {
  struct berval** values;

  aValues.Clear();
#if defined(DEBUG)
  // We only want this being logged for debug builds so as not to affect
  // performance too much.
  MOZ_LOG(
      gLDAPLogModule, mozilla::LogLevel::Debug,
      ("nsLDAPMessage::GetBinaryValues(): called with aAttr = '%s'", aAttr));
#endif

  values = ldap_get_values_len(mConnectionHandle, mMsgHandle, aAttr);

  // bail out if there was a problem
  //
  if (!values) {
    int32_t lderrno = ldap_get_lderrno(mConnectionHandle, 0, 0);

    if (lderrno == LDAP_DECODING_ERROR) {
      // this may not be an error; it could just be that the
      // caller has asked for an attribute that doesn't exist.
      //
      MOZ_LOG(gLDAPLogModule, mozilla::LogLevel::Warning,
              ("nsLDAPMessage::GetBinaryValues(): ldap_get_values "
               "returned LDAP_DECODING_ERROR"));
      return NS_ERROR_LDAP_DECODING_ERROR;

    } else if (lderrno == LDAP_PARAM_ERROR) {
      NS_ERROR("nsLDAPMessage::GetBinaryValues(): internal error: 1");
      return NS_ERROR_UNEXPECTED;

    } else {
      NS_ERROR("nsLDAPMessage::GetBinaryValues(): internal error: 2");
      return NS_ERROR_UNEXPECTED;
    }
  }

  // count the values
  //
  uint32_t numVals = ldap_count_values_len(values);
  aValues.SetCapacity(numVals);

  // clone the array (except for the trailing NULL entry) using the
  // shared allocator for XPCOM correctness
  //
  uint32_t i;
  nsresult rv;
  for (i = 0; i < numVals; i++) {
    // create an nsBERValue object
    RefPtr<nsLDAPBERValue> berValue = new nsLDAPBERValue();

    // copy the value from the struct into the nsBERValue
    //
    rv = berValue->SetRaw(values[i]->bv_len,
                          reinterpret_cast<uint8_t*>(values[i]->bv_val));
    if (NS_FAILED(rv)) {
      NS_ERROR(
          "nsLDAPMessage::GetBinaryValues(): error setting"
          " nsBERValue");
      ldap_value_free_len(values);
      return rv == NS_ERROR_OUT_OF_MEMORY ? rv : NS_ERROR_UNEXPECTED;
    }

    // put the nsIBERValue object into the out array
    aValues.AppendElement(berValue);
  }

  ldap_value_free_len(values);
  return NS_OK;
}

// readonly attribute nsILDAPOperation operation;
NS_IMETHODIMP nsLDAPMessage::GetOperation(nsILDAPOperation** _retval) {
  if (!_retval) {
    NS_ERROR("nsLDAPMessage::GetOperation: null pointer ");
    return NS_ERROR_NULL_POINTER;
  }

  NS_IF_ADDREF(*_retval = mOperation);
  return NS_OK;
}

NS_IMETHODIMP
nsLDAPMessage::ToUnicode(char16_t** aString) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
nsLDAPMessage::GetErrorMessage(nsACString& aErrorMessage) {
  aErrorMessage.Assign(mErrorMessage);
  return NS_OK;
}

NS_IMETHODIMP
nsLDAPMessage::GetMatchedDn(nsACString& aMatchedDn) {
  aMatchedDn.Assign(mMatchedDn);
  return NS_OK;
}
