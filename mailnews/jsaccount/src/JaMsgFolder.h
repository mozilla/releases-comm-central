/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef _JaMsgFolder_H_
#define _JaMsgFolder_H_

#include "DelegateList.h"
#include "msgIOverride.h"
#include "nsMsgDBFolder.h"
#include "nsAutoPtr.h"
#include "nsCycleCollectionParticipant.h"
#include "nsDataHashtable.h"
#include "nsIInterfaceRequestor.h"
#include "nsWeakReference.h"
#include "nsNetUtil.h"

namespace mozilla {
namespace mailnews {

/* Header file */

// This class is an XPCOM component, usable in JS, that calls the methods
// in the C++ base class (bypassing any JS override).
class JaBaseCppMsgFolder : public nsMsgDBFolder,
                           public nsIInterfaceRequestor

{
public:
  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_NSIINTERFACEREQUESTOR
  JaBaseCppMsgFolder() { }

  // nsMsgDBFolder overrides

  nsresult CreateChildFromURI(const nsCString &uri, nsIMsgFolder **folder) override;
  nsresult GetDatabase() override;

  // Local Utility Functions

  // Create a placeholder file to represent a folder.
  nsresult CreateDummyFile(nsIMsgFolder* aMailFolder);

protected:
  virtual ~JaBaseCppMsgFolder() { }

};

class JaCppMsgFolderDelegator : public JaBaseCppMsgFolder,
                                public msgIOverride
{
public:
  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_MSGIOVERRIDE

  // Note that we do not support override of RDF methods.
  NS_FORWARD_NSIRDFRESOURCE(JaBaseCppMsgFolder::)
  NS_FORWARD_NSIRDFNODE(JaBaseCppMsgFolder::)
  NS_FORWARD_NSIMSGFOLDER(DELEGATE_JS(nsIMsgFolder, mJsIMsgFolder)->)
  NS_FORWARD_NSIDBCHANGELISTENER(
    DELEGATE_JS(nsIDBChangeListener, mJsIDBChangeListener)->)
  NS_FORWARD_NSIURLLISTENER(DELEGATE_JS(nsIUrlListener, mJsIUrlListener)->)
  NS_FORWARD_NSIJUNKMAILCLASSIFICATIONLISTENER(
      DELEGATE_JS(nsIJunkMailClassificationListener,
                  mJsIJunkMailClassificationListener)->)
  NS_FORWARD_NSIMSGTRAITCLASSIFICATIONLISTENER(
      DELEGATE_JS(nsIMsgTraitClassificationListener,
                  mJsIMsgTraitClassificationListener)->)
  NS_FORWARD_NSIINTERFACEREQUESTOR(
      DELEGATE_JS(nsIInterfaceRequestor, mJsIInterfaceRequestor)->)

  JaCppMsgFolderDelegator();

private:
  virtual ~JaCppMsgFolderDelegator() {
  }

  class Super : public nsIMsgFolder,
                public nsIRDFResource,
                public nsIDBChangeListener,
                public nsIUrlListener,
                public nsIJunkMailClassificationListener,
                public nsIMsgTraitClassificationListener,
                public nsIInterfaceRequestor
  {
    public:
      // Why fake this? Because this method is fully owned by
      // JaCppMsgFolderDelegator, and this reference is to the "this" of the
      // main method. But it is not really the local "this".
      Super(JaCppMsgFolderDelegator* aFakeThis) {mFakeThis = aFakeThis;}
      NS_DECL_ISUPPORTS
      NS_FORWARD_NSIMSGFOLDER(mFakeThis->JaBaseCppMsgFolder::)
      NS_FORWARD_NSIRDFRESOURCE(mFakeThis->JaBaseCppMsgFolder::)
      NS_FORWARD_NSIRDFNODE(mFakeThis->JaBaseCppMsgFolder::)
      NS_FORWARD_NSIDBCHANGELISTENER(mFakeThis->JaBaseCppMsgFolder::)
      NS_FORWARD_NSIURLLISTENER(mFakeThis->JaBaseCppMsgFolder::)
      NS_FORWARD_NSIJUNKMAILCLASSIFICATIONLISTENER(mFakeThis->JaBaseCppMsgFolder::)
      NS_FORWARD_NSIMSGTRAITCLASSIFICATIONLISTENER(mFakeThis->JaBaseCppMsgFolder::)
      NS_FORWARD_NSIINTERFACEREQUESTOR(mFakeThis->JaBaseCppMsgFolder::)
    private:
      virtual ~Super() {}
      JaCppMsgFolderDelegator* mFakeThis;
  };

  // Interfaces that may be overridden by JS.
  nsCOMPtr<nsIMsgFolder> mJsIMsgFolder;
  nsCOMPtr<nsIDBChangeListener> mJsIDBChangeListener;
  nsCOMPtr<nsIUrlListener> mJsIUrlListener;
  nsCOMPtr<nsIJunkMailClassificationListener> mJsIJunkMailClassificationListener;
  nsCOMPtr<nsIMsgTraitClassificationListener> mJsIMsgTraitClassificationListener;
  nsCOMPtr<nsIInterfaceRequestor> mJsIInterfaceRequestor;

  nsCOMPtr<nsISupports> mJsISupports;

  nsCOMPtr<nsIMsgFolder> mCppBase;
  RefPtr<DelegateList> mDelegateList;
  nsDataHashtable<nsCStringHashKey, bool>* mMethods;

};

} // namespace mailnews
} // namespace mozilla

#endif
