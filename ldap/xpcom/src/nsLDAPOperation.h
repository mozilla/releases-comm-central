/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef _nsLDAPOperation_h_
#define _nsLDAPOperation_h_

#include "ldap.h"
#include "nsCOMPtr.h"
#include "nsILDAPConnection.h"
#include "nsILDAPOperation.h"
#include "nsILDAPMessageListener.h"
#include "nsString.h"
#include "nsLDAPConnection.h"
#include "nsIAuthModule.h"

// 97a479d0-9a44-47c6-a17a-87f9b00294bb
#define NS_LDAPOPERATION_CID                         \
  {                                                  \
    0x97a479d0, 0x9a44, 0x47c6, {                    \
      0xa1, 0x7a, 0x87, 0xf9, 0xb0, 0x02, 0x94, 0xbb \
    }                                                \
  }

class nsLDAPOperation : public nsILDAPOperation {
 public:
  friend class OpRunnable;
  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSILDAPOPERATION

  // constructor & destructor
  //
  nsLDAPOperation();

  /**
   * used to break cycles
   */
  void Clear();

  // Stores the request number for later check of the operation is still valid
  uint32_t mRequestNum;

 private:
  virtual ~nsLDAPOperation();

 protected:
  nsCOMPtr<nsILDAPMessageListener> mMessageListener;  // results go here
  nsCOMPtr<nsISupports>
      mClosure;  // private parameter (anything caller desires)
  RefPtr<nsLDAPConnection> mConnection;  // connection this op is on

  LDAP* mConnectionHandle;  // cache connection handle
  nsCString mSavePassword;
  nsCString mMechanism;
  nsCOMPtr<nsIAuthModule> mAuthModule;
  int32_t mMsgID;  // opaque handle to outbound message for this op

  nsTArray<RefPtr<nsILDAPControl>> mClientControls;
  nsTArray<RefPtr<nsILDAPControl>> mServerControls;
};

#endif  // _nsLDAPOperation_h
