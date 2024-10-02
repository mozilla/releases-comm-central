/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsMsgDBFolder_h__
#define nsMsgDBFolder_h__

#include "mozilla/Attributes.h"
#include "msgCore.h"
#include "nsIMsgFolder.h"
#include "nsIMsgDatabase.h"
#include "nsIMsgIncomingServer.h"
#include "nsCOMPtr.h"
#include "nsIDBChangeListener.h"
#include "nsIMsgPluggableStore.h"
#include "nsIFile.h"
#include "nsWeakReference.h"
#include "nsIWeakReferenceUtils.h"
#include "nsIMsgFilterList.h"
#include "nsIUrlListener.h"
#include "nsIMsgHdr.h"
#include "nsIOutputStream.h"
#include "nsITransport.h"
#include "nsIStringBundle.h"
#include "nsTObserverArray.h"
#include "nsCOMArray.h"
#include "nsMsgKeySet.h"
#include "nsMsgMessageFlags.h"
#include "nsIMsgFilterPlugin.h"
#include "mozilla/intl/Collator.h"

// We declare strings for folder properties and events.
// Properties:
extern const nsLiteralCString kBiffState;
extern const nsLiteralCString kCanFileMessages;
extern const nsLiteralCString kDefaultServer;
extern const nsLiteralCString kFlagged;
extern const nsLiteralCString kFolderFlag;
extern const nsLiteralCString kFolderSize;
extern const nsLiteralCString kIsDeferred;
extern const nsLiteralCString kIsSecure;
extern const nsLiteralCString kJunkStatusChanged;
extern const nsLiteralCString kKeywords;
extern const nsLiteralCString kMRMTimeChanged;
extern const nsLiteralCString kMRUTimeChanged;
extern const nsLiteralCString kMsgLoaded;
extern const nsLiteralCString kName;
extern const nsLiteralCString kNewMailReceived;
extern const nsLiteralCString kNewMessages;
extern const nsLiteralCString kOpen;
extern const nsLiteralCString kSortOrder;
extern const nsLiteralCString kStatus;
extern const nsLiteralCString kSynchronize;
extern const nsLiteralCString kTotalMessages;
extern const nsLiteralCString kTotalUnreadMessages;

// Events:
extern const nsLiteralCString kAboutToCompact;
extern const nsLiteralCString kCompactCompleted;
extern const nsLiteralCString kDeleteOrMoveMsgCompleted;
extern const nsLiteralCString kDeleteOrMoveMsgFailed;
extern const nsLiteralCString kFiltersApplied;
extern const nsLiteralCString kFolderCreateCompleted;
extern const nsLiteralCString kFolderCreateFailed;
extern const nsLiteralCString kFolderLoaded;
extern const nsLiteralCString kNumNewBiffMessages;
extern const nsLiteralCString kRenameCompleted;

using mozilla::intl::Collator;

class nsIMsgFolderCacheElement;
class nsMsgKeySetU;

class nsMsgFolderService final : public nsIMsgFolderService {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIMSGFOLDERSERVICE

  nsMsgFolderService() {};

 protected:
  ~nsMsgFolderService() {};
};

/*
 * nsMsgDBFolder
 * Class derived from nsIMsgFolder for those folders that use an nsIMsgDatabase.
 */
class nsMsgDBFolder : public nsSupportsWeakReference,
                      public nsIMsgFolder,
                      public nsIDBChangeListener,
                      public nsIUrlListener,
                      public nsIJunkMailClassificationListener,
                      public nsIMsgTraitClassificationListener {
 public:
  friend class nsMsgFolderService;

  nsMsgDBFolder(void);
  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIMSGFOLDER
  NS_DECL_NSIDBCHANGELISTENER
  NS_DECL_NSIURLLISTENER
  NS_DECL_NSIJUNKMAILCLASSIFICATIONLISTENER
  NS_DECL_NSIMSGTRAITCLASSIFICATIONLISTENER

  nsCString URI() { return mURI; }  // C++ Shortcut.

  NS_IMETHOD WriteToFolderCacheElem(nsIMsgFolderCacheElement* element);
  NS_IMETHOD ReadFromFolderCacheElem(nsIMsgFolderCacheElement* element);

  nsresult CreateDirectoryForFolder(nsIFile** result);
  nsresult CreateBackupDirectory(nsIFile** result);
  nsresult GetBackupSummaryFile(nsIFile** result, const nsACString& newName);
  nsresult GetMsgPreviewTextFromStream(nsIMsgDBHdr* msgHdr,
                                       nsIInputStream* stream);
  nsresult HandleAutoCompactEvent(nsIMsgWindow* aMsgWindow);
  static int gIsEnglishApp;

 protected:
  virtual ~nsMsgDBFolder();

  virtual nsresult CreateBaseMessageURI(const nsACString& aURI);

  void compressQuotesInMsgSnippet(const nsString& aMessageText,
                                  nsAString& aCompressedQuotesStr);
  void decodeMsgSnippet(const nsACString& aEncodingType, bool aIsComplete,
                        nsCString& aMsgSnippet);

  // helper routine to parse the URI and update member variables
  nsresult parseURI(bool needServer = false);
  nsresult GetBaseStringBundle(nsIStringBundle** aBundle);
  nsresult GetStringFromBundle(const char* msgName, nsString& aResult);
  nsresult ThrowConfirmationPrompt(nsIMsgWindow* msgWindow,
                                   const nsAString& confirmString,
                                   bool* confirmed);
  nsresult GetWarnFilterChanged(bool* aVal);
  nsresult SetWarnFilterChanged(bool aVal);
  nsresult CreateCollationKey(const nsString& aSource, uint8_t** aKey,
                              uint32_t* aLength);

  virtual nsresult ReadDBFolderInfo(bool force);
  virtual nsresult FlushToFolderCache();
  virtual nsresult GetDatabase() = 0;
  virtual nsresult SendFlagNotifications(nsIMsgDBHdr* item, uint32_t oldFlags,
                                         uint32_t newFlags);

  nsresult CheckWithNewMessagesStatus(bool messageAdded);
  void UpdateNewMessages();
  nsresult OnHdrAddedOrDeleted(nsIMsgDBHdr* hdrChanged, bool added);

  nsresult GetFolderCacheKey(nsIFile** aFile);
  nsresult GetFolderCacheElemFromFile(nsIFile* file,
                                      nsIMsgFolderCacheElement** cacheElement);
  nsresult AddDirectorySeparator(nsIFile* path);
  nsresult CheckIfFolderExists(const nsAString& newFolderName,
                               nsIMsgFolder* parentFolder,
                               nsIMsgWindow* msgWindow);
  bool ConfirmAutoFolderRename(nsIMsgWindow* aMsgWindow,
                               const nsString& aOldName,
                               const nsString& aNewName);

  // Returns true if: a) there is no need to prompt or b) the user is already
  // logged in or c) the user logged in successfully.
  static bool PromptForMasterPasswordIfNecessary();

  // Offline support methods. Used by IMAP and News folders, but not local
  // folders.
  nsresult StartNewOfflineMessage();
  nsresult EndNewOfflineMessage(nsresult status);

  nsresult AutoCompact(nsIMsgWindow* aWindow);
  // this is a helper routine that ignores whether nsMsgMessageFlags::Offline is
  // set for the folder
  nsresult MsgFitsDownloadCriteria(nsMsgKey msgKey, bool* result);
  nsresult GetPromptPurgeThreshold(bool* aPrompt);
  nsresult GetPurgeThreshold(int32_t* aThreshold);
  nsresult ApplyRetentionSettings(bool deleteViaFolder);
  MOZ_CAN_RUN_SCRIPT_BOUNDARY nsresult AddMarkAllReadUndoAction(
      nsIMsgWindow* msgWindow, nsMsgKey* thoseMarked, uint32_t numMarked);

  nsresult PerformBiffNotifications(
      void);  // if there are new, non spam messages, do biff

  // Helper function for Move code to call to update the MRU and MRM time.
  void UpdateTimestamps(bool allowUndo);
  void SetMRUTime();
  void SetMRMTime();
  /**
   * Clear all processing flags, presumably because message keys are no longer
   * valid.
   */
  void ClearProcessingFlags();

  nsresult NotifyHdrsNotBeingClassified();
  static nsresult BuildFolderSortKey(nsIMsgFolder* aFolder,
                                     nsTArray<uint8_t>& aKey);
  /**
   * Produce an array of messages ordered like the input keys.
   */
  nsresult MessagesInKeyOrder(nsTArray<nsMsgKey> const& aKeyArray,
                              nsIMsgFolder* srcFolder,
                              nsTArray<RefPtr<nsIMsgDBHdr>>& messages);
  nsCString mURI;

  nsCOMPtr<nsIMsgDatabase> mDatabase;
  nsCOMPtr<nsIMsgDatabase> mBackupDatabase;
  bool mAddListener;
  bool mNewMessages;
  bool mGettingNewMessages;
  nsMsgKey mLastMessageLoaded;

  /*
   * Start of offline-message-writing vars.
   * These track offline message writing for IMAP and News folders.
   * But *not* for local folders, which do their own thing.
   * They are set up by StartNewOfflineMessage() and cleaned up
   * by EndNewOfflineMessage().
   * IMAP folder also uses these vars when saving messages to disk.
   */

  // The header of the message currently being written.
  nsCOMPtr<nsIMsgDBHdr> m_offlineHeader;
  int32_t m_numOfflineMsgLines;
  // Number of bytes added due to add X-Mozilla-* headers.
  int32_t m_bytesAddedToLocalMsg;
  // This is currently used when we do a save as of an imap or news message..
  // Also used by IMAP/News offline messsage writing.
  nsCOMPtr<nsIOutputStream> m_tempMessageStream;
  // The number of bytes written to m_tempMessageStream so far.
  uint32_t m_tempMessageStreamBytesWritten;

  /*
   * End of offline message tracking vars
   */

  nsCOMPtr<nsIMsgRetentionSettings> m_retentionSettings;
  nsCOMPtr<nsIMsgDownloadSettings> m_downloadSettings;
  static nsrefcnt mInstanceCount;

  uint32_t mFlags;
  nsWeakPtr mParent;          // This won't be refcounted for ownership reasons.
  int32_t mNumUnreadMessages; /* count of unread messages (-1 means unknown; -2
                                 means unknown but we already tried to find
                                 out.) */
  int32_t mNumTotalMessages;  /* count of existing messages. */
  bool mNotifyCountChanges;
  int64_t mExpungedBytes;
  nsCOMArray<nsIMsgFolder> mSubFolders;
  nsTObserverArray<nsCOMPtr<nsIFolderListener>> mListeners;

  bool mInitializedFromCache;
  nsISupports* mSemaphoreHolder;  // set when the folder is being written to
                                  // Due to ownership issues, this won't be
                                  // AddRef'd.

  nsWeakPtr mServer;

  // These values are used for tricking the front end into thinking that we have
  // more messages than are really in the DB.  This is usually after and IMAP
  // message copy where we don't want to do an expensive select until the user
  // actually opens that folder
  int32_t mNumPendingUnreadMessages;
  int32_t mNumPendingTotalMessages;
  int64_t mFolderSize;

  int32_t mNumNewBiffMessages;

  // these are previous set of new msgs, which we might
  // want to run junk controls on. This is in addition to "new" hdrs
  // in the db, which might get cleared because the user clicked away
  // from the folder.
  nsTArray<nsMsgKey> m_saveNewMsgs;

  // These are the set of new messages for a folder who has had
  // its db closed, without the user reading the folder. This
  // happens with pop3 mail filtered to a different local folder.
  nsTArray<nsMsgKey> m_newMsgs;

  //
  // stuff from the uri
  //
  bool mHaveParsedURI;  // is the URI completely parsed?
  bool mIsServerIsValid;
  bool mIsServer;
  nsString mName;
  nsString mOriginalName;
  nsCOMPtr<nsIFile> mPath;
  nsCString mBaseMessageURI;  // The uri with the message scheme

  // static stuff for cross-instance objects like atoms
  static nsrefcnt gInstanceCount;

  static nsresult initializeStrings();
  static nsresult createCollationKeyGenerator();

  static nsString kLocalizedInboxName;
  static nsString kLocalizedTrashName;
  static nsString kLocalizedSentName;
  static nsString kLocalizedDraftsName;
  static nsString kLocalizedTemplatesName;
  static nsString kLocalizedUnsentName;
  static nsString kLocalizedJunkName;
  static nsString kLocalizedArchivesName;

  static nsString kLocalizedBrandShortName;

  static mozilla::UniquePtr<mozilla::intl::Collator> gCollationKeyGenerator;
  static bool gInitializeStringsDone;

  // store of keys that have a processing flag set
  struct {
    uint32_t bit;
    nsMsgKeySetU* keys;
  } mProcessingFlag[nsMsgProcessingFlags::NumberOfFlags];

  // list of nsIMsgDBHdrs for messages to process post-bayes
  nsTArray<RefPtr<nsIMsgDBHdr>> mPostBayesMessagesToFilter;

  /**
   * The list of message keys that have been classified for msgsClassified
   * batch notification purposes.  We add to this list in OnMessageClassified
   * when we are told about a classified message (a URI is provided), and we
   * notify for the list and clear it when we are told all the messages in
   * the batch were classified (a URI is not provided).
   */
  nsTArray<nsMsgKey> mClassifiedMsgKeys;
  // Is the current bayes filtering doing junk classification?
  bool mBayesJunkClassifying;
  // Is the current bayes filtering doing trait classification?
  bool mBayesTraitClassifying;
};

// This class is a kludge to allow nsMsgKeySet to be used with uint32_t keys
class nsMsgKeySetU {
 public:
  // Creates an empty set.
  static nsMsgKeySetU* Create();
  ~nsMsgKeySetU();
  // IsMember() returns whether the given key is a member of this set.
  bool IsMember(nsMsgKey key);
  // Add() adds the given key to the set.  (Returns 1 if a change was
  // made, 0 if it was already there, and negative on error.)
  int Add(nsMsgKey key);
  // Remove() removes the given article from the set.
  int Remove(nsMsgKey key);
  // Add the keys in the set to aArray.
  nsresult ToMsgKeyArray(nsTArray<nsMsgKey>& aArray);

 protected:
  nsMsgKeySetU();
  RefPtr<nsMsgKeySet> loKeySet;
  RefPtr<nsMsgKeySet> hiKeySet;
};

#endif
