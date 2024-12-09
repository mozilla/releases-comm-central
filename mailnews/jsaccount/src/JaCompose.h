/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef _JaCompose_H_
#define _JaCompose_H_

#include "nsISupports.h"
#include "DelegateList.h"
#include "msgIOverride.h"
#include "nsMsgCompose.h"
#include "nsIMsgCompose.h"
#include "nsTHashMap.h"
#include "nsIInterfaceRequestor.h"

// This file specifies the definition of nsIMsgCompose.idl objects
// in the JsAccount system.

namespace mozilla {
namespace mailnews {

/* Header file */

// This class is an XPCOM component, usable in JS, that calls the methods
// in the C++ base class (bypassing any JS override).
class JaBaseCppCompose : public nsMsgCompose, public nsIInterfaceRequestor {
 public:
  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_NSIINTERFACEREQUESTOR
  JaBaseCppCompose() {}

 protected:
  virtual ~JaBaseCppCompose() {}
};

class JaCppComposeDelegator : public JaBaseCppCompose, public msgIOverride {
 public:
  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_MSGIOVERRIDE

  NS_FORWARD_NSIMSGCOMPOSE(DELEGATE_JS(mJsIMsgCompose, mMethods, mCppBase)->)
  NS_FORWARD_NSIMSGSENDLISTENER(
      DELEGATE_JS(mJsIMsgSendListener, mMethods, mCppBase.get())->)
  NS_FORWARD_NSIINTERFACEREQUESTOR(
      DELEGATE_JS(
          mJsIInterfaceRequestor, mMethods,
          (nsCOMPtr<nsIInterfaceRequestor>(do_QueryInterface(mCppBase))))
          ->)

  JaCppComposeDelegator();

 private:
  virtual ~JaCppComposeDelegator() {}

  // This class will call a method on the delegator, but force the use of the
  // C++ cppBase class, bypassing any JS Delegate.
  class Super : public nsIMsgCompose, public nsIInterfaceRequestor {
   public:
    explicit Super(JaCppComposeDelegator* aFakeThis) { mFakeThis = aFakeThis; }
    NS_DECL_ISUPPORTS
    // Forward all overridable methods, bypassing JS override.
    NS_FORWARD_NSIMSGCOMPOSE(mFakeThis->JaBaseCppCompose::)
    NS_FORWARD_NSIMSGSENDLISTENER(mFakeThis->JaBaseCppCompose::)
    NS_FORWARD_NSIINTERFACEREQUESTOR(mFakeThis->JaBaseCppCompose::)
   private:
    virtual ~Super() {};
    JaCppComposeDelegator* mFakeThis;
  };

  // Interfaces that may be overridden by JS.
  nsCOMPtr<nsIMsgCompose> mJsIMsgCompose;
  nsCOMPtr<nsIMsgSendListener> mJsIMsgSendListener;
  nsCOMPtr<nsIInterfaceRequestor> mJsIInterfaceRequestor;

  nsCOMPtr<nsISupports> mJsISupports;

  // Class to bypass JS delegates.
  nsCOMPtr<nsIMsgCompose> mCppBase;

  RefPtr<DelegateList> mDelegateList;
  nsTHashMap<nsCStringHashKey, bool>* mMethods;
};

}  // namespace mailnews
}  // namespace mozilla

#endif
