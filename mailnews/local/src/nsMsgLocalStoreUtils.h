/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#ifndef nsMsgLocalStoreUtils_h__
#define nsMsgLocalStoreUtils_h__

#include "msgCore.h"
#include "nsString.h"
#include "nsReadLine.h"
#include "nsISeekableStream.h"
#include "nsIMsgHdr.h"
#include "nsMsgLocalFolderHdrs.h"
#include "nsMailHeaders.h"
#include "nsMsgUtils.h"
#include "nsIOutputStream.h"
#include "nsMsgMessageFlags.h"

/**
 * Utility Class for handling local mail stores. Berkeley Mailbox
 * and MailDir stores inherit from this class to share some code.
 */

class nsMsgLocalStoreUtils {
 public:
  nsMsgLocalStoreUtils();

  static nsresult AddDirectorySeparator(nsIFile* path);
  static bool nsShouldIgnoreFile(nsAString& name, nsIFile* path);
  static void ChangeKeywordsHelper(nsIMsgDBHdr* message, uint64_t desiredOffset,
                                   nsLineBuffer<char>& lineBuffer,
                                   nsTArray<nsCString>& keywordArray, bool aAdd,
                                   nsIOutputStream* outputStream,
                                   nsISeekableStream* seekableStream,
                                   nsIInputStream* inputStream);
  static void ResetForceReparse(nsIMsgDatabase* aMsgDB);

  nsresult UpdateFolderFlag(nsIMsgDBHdr* mailHdr, bool bSet,
                            nsMsgMessageFlagType flag,
                            nsIOutputStream* fileStream);
  bool DiskSpaceAvailableInStore(nsIFile* aFile, uint64_t aSpaceRequested);
};

#endif
