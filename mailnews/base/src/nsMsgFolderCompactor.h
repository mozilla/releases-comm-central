/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef _nsMsgFolderCompactor_h
#define _nsMsgFolderCompactor_h

#include "nsIMsgFolderCompactor.h"

class nsIMsgFolder;
class nsIMsgWindow;
class nsFolderCompactState;

/**
 * nsMsgFolderCompactor implements nsIMsgFolderCompactor, which allows the
 * caller to kick off a batch of folder compactions (via compactFolders()).
 */
class nsMsgFolderCompactor : public nsIMsgFolderCompactor {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIMSGFOLDERCOMPACTOR

  nsMsgFolderCompactor();

 protected:
  virtual ~nsMsgFolderCompactor();
  // The folders waiting to be compacted.
  nsTArray<RefPtr<nsIMsgFolder>> mQueue;

  // If any individual folders fail to compact, we stash the latest fail code
  // here (to return via listener upon overall completion).
  nsresult mOverallStatus{NS_OK};

  // If set, OnStopRunningUrl() will be called when all folders done.
  nsCOMPtr<nsIUrlListener> mListener;
  // If set, progress status updates will be sent here.
  nsCOMPtr<nsIMsgWindow> mWindow;
  RefPtr<nsMsgFolderCompactor> mKungFuDeathGrip;
  uint64_t mTotalBytesGained{0};

  // The currently-running compactor.
  RefPtr<nsFolderCompactState> mCompactor;

  void NextFolder();
  void ShowDoneStatus();
};
#endif
