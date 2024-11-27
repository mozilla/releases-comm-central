/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef _nsMsgDatabase_H_
#define _nsMsgDatabase_H_

#include "mozilla/MemoryReporting.h"
#include "nsIFile.h"
#include "nsIMsgDatabase.h"
#include "nsMsgHdr.h"
#include "nsIDBChangeAnnouncer.h"
#include "nsMsgMessageFlags.h"
#include "nsIMsgFolder.h"
#include "nsDBFolderInfo.h"
#include "mozilla/intl/Collator.h"
#include "nsIMimeConverter.h"
#include "nsCOMPtr.h"
#include "nsCOMArray.h"
#include "PLDHashTable.h"
#include "nsTArray.h"
#include "nsTHashMap.h"
#include "nsTObserverArray.h"
#include "prtime.h"

using mozilla::intl::Collator;

class nsMsgThread;
class nsMsgDatabase;
class nsIMsgOfflineOpsDatabase;
class nsIMsgThread;
class nsMsgDBEnumerator;
class nsMsgDBThreadEnumerator;

const int32_t kMsgDBVersion = 1;

// Hopefully we're not opening up lots of databases at the same time, however
// this will give us a buffer before we need to start reallocating the cache
// array.
const uint32_t kInitialMsgDBCacheSize = 20;

class nsMsgDBService final : public nsIMsgDBService {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIMSGDBSERVICE

  nsMsgDBService();

  void AddToCache(nsMsgDatabase* pMessageDB);
  void DumpCache();
  void EnsureCached(nsMsgDatabase* pMessageDB) {
    if (!m_dbCache.Contains(pMessageDB)) m_dbCache.AppendElement(pMessageDB);
  }
  void RemoveFromCache(nsMsgDatabase* pMessageDB) {
    m_dbCache.RemoveElement(pMessageDB);
  }

 protected:
  ~nsMsgDBService();
  void HookupPendingListeners(nsIMsgDatabase* db, nsIMsgFolder* folder);
  void FinishDBOpen(nsIMsgFolder* aFolder, nsMsgDatabase* aMsgDB);
  nsMsgDatabase* FindInCache(nsIFile* dbName);

  nsCOMArray<nsIMsgFolder> m_foldersPendingListeners;
  nsCOMArray<nsIDBChangeListener> m_pendingListeners;
  AutoTArray<nsMsgDatabase*, kInitialMsgDBCacheSize> m_dbCache;
};

namespace mozilla {
namespace mailnews {
class MsgDBReporter;
}
}  // namespace mozilla

class nsMsgDatabase : public nsIMsgOfflineOpsDatabase {
 public:
  friend class nsMsgDBService;
  friend class nsMsgPropertyEnumerator;  // accesses m_mdbEnv and m_mdbStore

  NS_DECL_ISUPPORTS
  NS_DECL_NSIDBCHANGEANNOUNCER
  NS_DECL_NSIMSGDATABASE
  NS_DECL_NSIMSGOFFLINEOPSDATABASE

  /**
   * Opens a database folder.
   *
   * @param aFolderName     The name of the folder to create.
   * @param aCreate         Whether or not the file should be created.
   * @param aLeaveInvalidDB Set to true if you do not want the database to be
   *                        deleted if it is invalid.
   * @exception NS_ERROR_FILE_NOT_FOUND
   *                        The file could not be created.
   * @exception NS_MSG_ERROR_FOLDER_SUMMARY_OUT_OF_DATE
   *                        The database is present (and was opened), but the
   *                        summary file is out of date.
   * @exception NS_MSG_ERROR_FOLDER_SUMMARY_MISSING
   *                        The database is present (and was opened), but the
   *                        summary file is missing.
   */
  virtual nsresult Open(nsMsgDBService* aDBService, nsIFile* aFolderName,
                        bool aCreate, bool aLeaveInvalidDB);
  virtual nsresult IsHeaderRead(nsIMsgDBHdr* hdr, bool* pRead);
  virtual nsresult MarkHdrReadInDB(nsIMsgDBHdr* msgHdr, bool bRead,
                                   nsIDBChangeListener* instigator);
  nsresult OpenInternal(nsMsgDBService* aDBService, nsIFile* summaryFile,
                        bool aCreate, bool aLeaveInvalidDB, bool sync);
  nsresult CheckForErrors(nsresult err, bool sync, nsMsgDBService* aDBService,
                          nsIFile* summaryFile);
  virtual nsresult OpenMDB(nsIFile* dbfile, bool create, bool sync);
  virtual nsresult CloseMDB(bool commit);
  virtual nsresult CreateMsgHdr(nsIMdbRow* hdrRow, nsMsgKey key,
                                nsIMsgDBHdr** result);
  virtual nsresult GetThreadForMsgKey(nsMsgKey msgKey, nsIMsgThread** result);
  virtual nsresult EnumerateMessagesWithFlag(nsIMsgEnumerator** result,
                                             uint32_t* pFlag);
  nsresult GetSearchResultsTable(const nsACString& searchFolderUri,
                                 bool createIfMissing, nsIMdbTable** table);

  //////////////////////////////////////////////////////////////////////////////
  // nsMsgDatabase methods:
  nsMsgDatabase();

  nsresult GetMDBFactory(nsIMdbFactory** aMdbFactory);
  nsIMdbEnv* GetEnv() { return m_mdbEnv; }
  nsIMdbStore* GetStore() { return m_mdbStore; }
  virtual uint32_t GetCurVersion();
  nsresult GetCollationKeyGenerator();
  nsIMimeConverter* GetMimeConverter();

  nsresult GetTableCreateIfMissing(const char* scope, const char* kind,
                                   nsIMdbTable** table, mdb_token& scopeToken,
                                   mdb_token& kindToken);

  // helper function to fill in nsStrings from hdr row cell contents.
  nsresult RowCellColumnTonsString(nsIMdbRow* row, mdb_token columnToken,
                                   nsAString& resultStr);
  nsresult RowCellColumnToUInt32(nsIMdbRow* row, mdb_token columnToken,
                                 uint32_t* uint32Result,
                                 uint32_t defaultValue = 0);
  nsresult RowCellColumnToUInt32(nsIMdbRow* row, mdb_token columnToken,
                                 uint32_t& uint32Result,
                                 uint32_t defaultValue = 0);
  nsresult RowCellColumnToUInt64(nsIMdbRow* row, mdb_token columnToken,
                                 uint64_t* uint64Result,
                                 uint64_t defaultValue = 0);
  nsresult RowCellColumnToMime2DecodedString(nsIMdbRow* row,
                                             mdb_token columnToken,
                                             nsAString& resultStr);
  nsresult RowCellColumnToCollationKey(nsIMdbRow* row, mdb_token columnToken,
                                       nsTArray<uint8_t>& result);
  nsresult RowCellColumnToConstCharPtr(nsIMdbRow* row, mdb_token columnToken,
                                       const char** ptr);
  nsresult RowCellColumnToAddressCollationKey(nsIMdbRow* row,
                                              mdb_token colToken,
                                              nsTArray<uint8_t>& result);

  nsresult GetEffectiveCharset(nsIMdbRow* row, nsACString& resultCharset);

  // these methods take the property name as a string, not a token.
  // they should be used when the properties aren't accessed a lot
  nsresult GetProperty(nsIMdbRow* row, const char* propertyName, char** result);
  nsresult SetProperty(nsIMdbRow* row, const char* propertyName,
                       const char* propertyVal);
  nsresult GetPropertyAsNSString(nsIMdbRow* row, const char* propertyName,
                                 nsAString& result);
  nsresult SetPropertyFromNSString(nsIMdbRow* row, const char* propertyName,
                                   const nsAString& propertyVal);
  nsresult GetUint32Property(nsIMdbRow* row, const char* propertyName,
                             uint32_t* result, uint32_t defaultValue = 0);
  nsresult GetUint64Property(nsIMdbRow* row, const char* propertyName,
                             uint64_t* result, uint64_t defaultValue = 0);
  nsresult SetUint32Property(nsIMdbRow* row, const char* propertyName,
                             uint32_t propertyVal);
  nsresult SetUint64Property(nsIMdbRow* row, const char* propertyName,
                             uint64_t propertyVal);
  nsresult GetBooleanProperty(nsIMdbRow* row, const char* propertyName,
                              bool* result, bool defaultValue = false);
  nsresult SetBooleanProperty(nsIMdbRow* row, const char* propertyName,
                              bool propertyVal);
  // helper function for once we have the token.
  nsresult SetNSStringPropertyWithToken(nsIMdbRow* row, mdb_token aProperty,
                                        const nsAString& propertyStr);

  // helper functions to put values in cells for the passed-in row
  nsresult UInt32ToRowCellColumn(nsIMdbRow* row, mdb_token columnToken,
                                 uint32_t value);
  nsresult CharPtrToRowCellColumn(nsIMdbRow* row, mdb_token columnToken,
                                  const char* charPtr);
  nsresult RowCellColumnToCharPtr(nsIMdbRow* row, mdb_token columnToken,
                                  char** result);
  nsresult UInt64ToRowCellColumn(nsIMdbRow* row, mdb_token columnToken,
                                 uint64_t value);

  // helper functions to copy an nsString to a yarn, int32 to yarn, and vice
  // versa.
  static struct mdbYarn* nsStringToYarn(struct mdbYarn* yarn,
                                        const nsAString& str);
  static struct mdbYarn* UInt32ToYarn(struct mdbYarn* yarn, uint32_t i);
  static struct mdbYarn* UInt64ToYarn(struct mdbYarn* yarn, uint64_t i);
  static void YarnTonsString(struct mdbYarn* yarn, nsAString& str);
  static void YarnTonsCString(struct mdbYarn* yarn, nsACString& str);
  static void YarnToUInt32(struct mdbYarn* yarn, uint32_t* i);
  static void YarnToUInt64(struct mdbYarn* yarn, uint64_t* i);

#ifdef DEBUG
  virtual nsresult DumpContents();
#endif

  friend class nsMsgHdr;     // use this to get access to cached tokens for hdr
                             // fields
  friend class nsMsgThread;  // use this to get access to cached tokens for hdr
                             // fields

  friend class nsMsgDBEnumerator;
  friend class nsMsgDBThreadEnumerator;

 protected:
  virtual ~nsMsgDatabase();

  // prefs stuff - in future, we might want to cache the prefs interface
  nsresult GetBoolPref(const char* prefName, bool* result);
  nsresult GetIntPref(const char* prefName, int32_t* result);
  virtual void GetGlobalPrefs();
  // retrieval methods
  nsIMsgThread* GetThreadForReference(nsCString& msgID, nsIMsgDBHdr** pMsgHdr);
  nsIMsgThread* GetThreadForSubject(nsCString& subject);
  nsIMsgThread* GetThreadForMessageId(nsCString& msgId);
  nsIMsgThread* GetThreadForThreadId(nsMsgKey threadId);
  nsIMsgDBHdr* GetMsgHdrForSubject(nsCString& subject);
  // threading interfaces
  virtual nsresult CreateNewThread(nsMsgKey key, const char* subject,
                                   nsMsgThread** newThread);
  virtual bool ThreadBySubjectWithoutRe();
  virtual bool UseStrictThreading();
  virtual bool UseCorrectThreading();
  virtual nsresult ThreadNewHdr(nsMsgHdr* hdr, bool& newThread);
  virtual nsresult AddNewThread(nsMsgHdr* msgHdr);
  virtual nsresult AddToThread(nsMsgHdr* newHdr, nsIMsgThread* thread,
                               nsIMsgDBHdr* inReplyTo, bool threadInThread);

  static PRTime gLastUseTime;  // global last use time
  PRTime m_lastUseTime;        // last use time for this db
  // inline to make instrumentation as cheap as possible
  inline void RememberLastUseTime() { gLastUseTime = m_lastUseTime = PR_Now(); }

  bool MatchDbName(nsIFile* dbFile);  // returns TRUE if they match

  // Flag handling routines
  virtual nsresult SetKeyFlag(nsMsgKey key, bool set, nsMsgMessageFlagType flag,
                              nsIDBChangeListener* instigator = nullptr);
  virtual nsresult SetMsgHdrFlag(nsIMsgDBHdr* msgHdr, bool set,
                                 nsMsgMessageFlagType flag,
                                 nsIDBChangeListener* instigator);

  virtual bool SetHdrFlag(nsIMsgDBHdr*, bool bSet, nsMsgMessageFlagType flag);
  virtual bool SetHdrReadFlag(nsIMsgDBHdr*, bool bRead);
  virtual uint32_t GetStatusFlags(nsIMsgDBHdr* msgHdr,
                                  nsMsgMessageFlagType origFlags);
  // helper function which doesn't involve thread object

  virtual nsresult RemoveHeaderFromDB(nsMsgHdr* msgHdr);
  virtual nsresult RemoveHeaderFromThread(nsMsgHdr* msgHdr);
  virtual nsresult AdjustExpungedBytesOnDelete(nsIMsgDBHdr* msgHdr);

  mozilla::UniquePtr<mozilla::intl::Collator> m_collationKeyGenerator = nullptr;
  nsCOMPtr<nsIMimeConverter> m_mimeConverter;
  nsCOMPtr<nsIMsgRetentionSettings> m_retentionSettings;
  nsCOMPtr<nsIMsgDownloadSettings> m_downloadSettings;

  nsresult FindMessagesOlderThan(uint32_t daysToKeepHdrs,
                                 bool applyToFlaggedMessages,
                                 nsTArray<RefPtr<nsIMsgDBHdr>>& hdrsToDelete);
  nsresult FindExcessMessages(uint32_t numHeadersToKeep,
                              bool applyToFlaggedMessages,
                              nsTArray<RefPtr<nsIMsgDBHdr>>& hdrsToDelete);

  nsMsgKey FindMsgKeyForUID(uint32_t uid);

  // mdb bookkeeping stuff
  virtual nsresult InitExistingDB();
  virtual nsresult InitNewDB();
  virtual nsresult InitMDBInfo();

  nsCOMPtr<nsIMsgFolder> m_folder;
  RefPtr<nsDBFolderInfo> m_dbFolderInfo;
  nsMsgKey m_nextPseudoMsgKey;
  nsIMdbEnv* m_mdbEnv;  // to be used in all the db calls.
  nsIMdbStore* m_mdbStore;
  nsIMdbTable* m_mdbAllMsgHeadersTable;
  nsIMdbTable* m_mdbAllThreadsTable;
  nsTHashMap<nsCString, RefPtr<nsIMdbTable>> m_mdbSearchResultsTables;

  // Used for asynchronous db opens. If non-null, we're still opening
  // the underlying mork database. If null, the db has been completely opened.
  nsCOMPtr<nsIMdbThumb> m_thumb;
  // used to remember the args to Open for async open.
  bool m_create;
  bool m_leaveInvalidDB;

  nsCOMPtr<nsIFile> m_dbFile;
  nsTArray<nsMsgKey> m_newSet;  // new messages since last open.
  bool m_mdbTokensInitialized;
  nsTObserverArray<nsCOMPtr<nsIDBChangeListener>> m_ChangeListeners;
  mdb_token m_hdrRowScopeToken;
  mdb_token m_threadRowScopeToken;
  mdb_token m_hdrTableKindToken;
  mdb_token m_threadTableKindToken;
  mdb_token m_allThreadsTableKindToken;
  mdb_token m_subjectColumnToken;
  mdb_token m_senderColumnToken;
  mdb_token m_messageIdColumnToken;
  mdb_token m_referencesColumnToken;
  mdb_token m_recipientsColumnToken;
  mdb_token m_dateColumnToken;
  mdb_token m_messageSizeColumnToken;
  mdb_token m_flagsColumnToken;
  mdb_token m_priorityColumnToken;
  mdb_token m_labelColumnToken;
  mdb_token m_numLinesColumnToken;
  mdb_token m_ccListColumnToken;
  mdb_token m_bccListColumnToken;
  mdb_token m_threadFlagsColumnToken;
  mdb_token m_threadIdColumnToken;
  mdb_token m_threadChildrenColumnToken;
  mdb_token m_threadUnreadChildrenColumnToken;
  mdb_token m_messageThreadIdColumnToken;
  mdb_token m_threadSubjectColumnToken;
  mdb_token m_messageCharSetColumnToken;
  mdb_token m_threadParentColumnToken;
  mdb_token m_threadRootKeyColumnToken;
  mdb_token m_threadNewestMsgDateColumnToken;
  mdb_token m_offlineMsgOffsetColumnToken;
  mdb_token m_offlineMessageSizeColumnToken;
  mdb_token m_uidOnServerColumnToken;

  // header caching stuff - MRU headers, keeps them around in memory
  nsresult AddHdrToCache(nsIMsgDBHdr* hdr, nsMsgKey key);
  nsresult ClearHdrCache(bool reInit);
  nsresult RemoveHdrFromCache(nsIMsgDBHdr* hdr, nsMsgKey key);
  // all headers currently instantiated, doesn't hold refs
  // these get added when msg hdrs get constructed, and removed when they get
  // destroyed.
  nsresult GetHdrFromUseCache(nsMsgKey key, nsIMsgDBHdr** result);
  nsresult AddHdrToUseCache(nsIMsgDBHdr* hdr, nsMsgKey key);
  nsresult ClearUseHdrCache();
  nsresult RemoveHdrFromUseCache(nsIMsgDBHdr* hdr, nsMsgKey key);

  // not-reference holding array of threads we've handed out.
  // If a db goes away, it will clean up the outstanding threads.
  // We use an nsTArray because we don't expect to ever have very many
  // of these, rarely more than 5.
  nsTArray<nsMsgThread*> m_threads;
  // Clear outstanding thread objects
  void ClearThreads();
  nsMsgThread* FindExistingThread(nsMsgKey threadId);

  mdb_pos FindInsertIndexInSortedTable(nsIMdbTable* table, mdb_id idToInsert);

  void ClearCachedObjects(bool dbGoingAway);
  void InvalidateEnumerators();
  // all instantiated headers, but doesn't hold refs.
  PLDHashTable* m_headersInUse;
  static PLDHashNumber HashKey(const void* aKey);
  static bool MatchEntry(const PLDHashEntryHdr* aEntry, const void* aKey);
  static void MoveEntry(PLDHashTable* aTable, const PLDHashEntryHdr* aFrom,
                        PLDHashEntryHdr* aTo);
  static void ClearEntry(PLDHashTable* aTable, PLDHashEntryHdr* aEntry);
  static PLDHashTableOps gMsgDBHashTableOps;
  struct MsgHdrHashElement : public PLDHashEntryHdr {
    nsMsgKey mKey;
    nsIMsgDBHdr* mHdr;
  };
  PLDHashTable* m_cachedHeaders;
  bool m_bCacheHeaders;
  nsMsgKey m_cachedThreadId;
  nsCOMPtr<nsIMsgThread> m_cachedThread;
  nsCOMPtr<nsIMdbFactory> mMdbFactory;

  // Message reference hash table
  static PLDHashTableOps gRefHashTableOps;
  struct RefHashElement : public PLDHashEntryHdr {
    const char* mRef;  // Hash entry key, must come first
    nsMsgKey mThreadId;
    uint32_t mCount;
  };
  PLDHashTable* m_msgReferences;
  nsresult GetRefFromHash(nsCString& reference, nsMsgKey* threadId);
  nsresult AddRefToHash(nsCString& reference, nsMsgKey threadId);
  nsresult AddMsgRefsToHash(nsIMsgDBHdr* msgHdr);
  nsresult RemoveRefFromHash(nsCString& reference);
  nsresult RemoveMsgRefsFromHash(nsIMsgDBHdr* msgHdr);
  nsresult InitRefHash();

  // The enumerators add themselves to these lists.
  // If a db goes away - via destruction or ForceClosed() - it needs to
  // invalidate any outstanding enumerators.
  nsTArray<nsMsgDBEnumerator*> m_msgEnumerators;
  nsTArray<nsMsgDBThreadEnumerator*> m_threadEnumerators;

  // Memory reporter details
 public:
  static size_t HeaderHashSizeOf(PLDHashEntryHdr* hdr,
                                 mozilla::MallocSizeOf aMallocSizeOf,
                                 void* arg);
  virtual size_t SizeOfExcludingThis(mozilla::MallocSizeOf aMallocSizeOf) const;
  virtual size_t SizeOfIncludingThis(
      mozilla::MallocSizeOf aMallocSizeOf) const {
    return aMallocSizeOf(this) + SizeOfExcludingThis(aMallocSizeOf);
  }

 private:
  uint32_t m_cacheSize;
  RefPtr<mozilla::mailnews::MsgDBReporter> mMemReporter;
};

class nsMsgRetentionSettings : public nsIMsgRetentionSettings {
 public:
  nsMsgRetentionSettings();

  NS_DECL_ISUPPORTS
  NS_DECL_NSIMSGRETENTIONSETTINGS
 protected:
  virtual ~nsMsgRetentionSettings();
  nsMsgRetainByPreference m_retainByPreference;
  uint32_t m_daysToKeepHdrs;
  uint32_t m_numHeadersToKeep;
  bool m_useServerDefaults;
  bool m_cleanupBodiesByDays;
  uint32_t m_daysToKeepBodies;
  bool m_applyToFlaggedMessages;
};

class nsMsgDownloadSettings : public nsIMsgDownloadSettings {
 public:
  nsMsgDownloadSettings();

  NS_DECL_ISUPPORTS
  NS_DECL_NSIMSGDOWNLOADSETTINGS
 protected:
  virtual ~nsMsgDownloadSettings();
  bool m_useServerDefaults;
  bool m_downloadUnreadOnly;
  bool m_downloadByDate;
  int32_t m_ageLimitOfMsgsToDownload;
};

#endif
