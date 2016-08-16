/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef _JaSend_H_
#define _JaSend_H_

#include "DelegateList.h"
#include "msgIOverride.h"
#include "nsMsgSend.h"
#include "nsAutoPtr.h"
#include "nsDataHashtable.h"
#include "nsIInterfaceRequestor.h"

// This file specifies the definition of nsIMsgSend.idl objects
// in the JsAccount system.

namespace mozilla {
namespace mailnews {

/* Header file */

// This class is an XPCOM component, usable in JS, that calls the methods
// in the C++ base class (bypassing any JS override).
class JaBaseCppSend : public nsMsgComposeAndSend,
                      public nsIInterfaceRequestor
{
public:
  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_NSIINTERFACEREQUESTOR
  JaBaseCppSend() { }

protected:
  virtual ~JaBaseCppSend() { }

};

class JaCppSendDelegator : public JaBaseCppSend,
                           public msgIOverride
{
public:
  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_MSGIOVERRIDE

  NS_FORWARD_NSIMSGSEND(DELEGATE_JS(nsIMsgSend, mJsIMsgSend)->)
  NS_FORWARD_NSIMSGOPERATIONLISTENER(
      DELEGATE_JS(nsIMsgOperationListener, mJsIMsgOperationListener)->)
  NS_FORWARD_NSIINTERFACEREQUESTOR(
      DELEGATE_JS(nsIInterfaceRequestor, mJsIInterfaceRequestor)->)

  JaCppSendDelegator();

private:
  virtual ~JaCppSendDelegator() {
  }

  // This class will call a method on the delegator, but force the use of the
  // C++ parent class, bypassing any JS Delegate.
  class Super : public nsIMsgSend,
                public nsIMsgOperationListener,
                public nsIInterfaceRequestor
  {
    public:
      Super(JaCppSendDelegator* aFakeThis) {mFakeThis = aFakeThis;}
      NS_DECL_ISUPPORTS
      // Forward all overridable methods, bypassing JS override.
      NS_FORWARD_NSIMSGSEND(mFakeThis->JaBaseCppSend::)
      NS_FORWARD_NSIMSGOPERATIONLISTENER(mFakeThis->JaBaseCppSend::)
      NS_FORWARD_NSIINTERFACEREQUESTOR(mFakeThis->JaBaseCppSend::)
    private:
      virtual ~Super() {};
      JaCppSendDelegator* mFakeThis;
  };

  // Interfaces that may be overridden by JS.
  nsCOMPtr<nsIMsgSend> mJsIMsgSend;
  nsCOMPtr<nsIMsgOperationListener> mJsIMsgOperationListener;
  nsCOMPtr<nsIInterfaceRequestor> mJsIInterfaceRequestor;

  nsCOMPtr<nsISupports> mJsISupports;

  // Class to bypass JS delegates.
  nsCOMPtr<nsIMsgSend> mCppBase;

  RefPtr<DelegateList> mDelegateList;
  nsDataHashtable<nsCStringHashKey, bool>* mMethods;


};

} // namespace mailnews
} // namespace mozilla

#endif
