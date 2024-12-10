/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef _nsMsgDBView_H_
#define _nsMsgDBView_H_

#include "nsIMsgDBView.h"
#include "nsIMsgTagService.h"
#include "nsIMsgWindow.h"
#include "nsIMessenger.h"
#include "nsIMsgDatabase.h"
#include "nsIMsgHdr.h"
#include "MailNewsTypes.h"
#include "nsIDBChangeListener.h"
#include "nsITreeView.h"
#include "mozilla/dom/XULTreeElement.h"
#include "nsITreeSelection.h"
#include "nsIMsgFolder.h"
#include "nsIMsgThread.h"
#include "nsMsgUtils.h"
#include "nsIImapIncomingServer.h"
#include "nsIMsgFilterPlugin.h"
#include "nsIStringBundle.h"
#include "nsCOMArray.h"
#include "nsTArray.h"
#include "nsTHashtable.h"
#include "nsHashKeys.h"
#include "nsIMsgCustomColumnHandler.h"
#include "nsIWeakReferenceUtils.h"
#include "nsMsgEnumerator.h"

#define MESSENGER_STRING_URL "chrome://messenger/locale/messenger.properties"

typedef AutoTArray<nsMsgViewIndex, 1> nsMsgViewIndexArray;
static_assert(nsMsgViewIndex(nsMsgViewIndexArray::NoIndex) ==
                  nsMsgViewIndex_None,
              "These need to be the same value.");

enum eFieldType { kCollationKey, kU32 };

// This is used in an nsTArray<> to keep track of a multi-column sort.
class MsgViewSortColumnInfo {
 public:
  MsgViewSortColumnInfo(const MsgViewSortColumnInfo& other);
  MsgViewSortColumnInfo()
      : mSortType(nsMsgViewSortType::byNone),
        mSortOrder(nsMsgViewSortOrder::none) {}
  bool operator==(const MsgViewSortColumnInfo& other) const;
  nsMsgViewSortTypeValue mSortType;
  nsMsgViewSortOrderValue mSortOrder;
  // If mSortType == byCustom, info about the custom column sort.
  nsString mCustomColumnName;
  nsCOMPtr<nsIMsgCustomColumnHandler> mColHandler;
};

// Reserve some bits in the msg flags for the view-only flags.
// NOTE: this bit space is shared by nsMsgMessageFlags (and labels).
#define MSG_VIEW_FLAG_ISTHREAD 0x8000000
#define MSG_VIEW_FLAG_DUMMY 0x20000000
#define MSG_VIEW_FLAG_HASCHILDREN 0x40000000
#define MSG_VIEW_FLAGS \
  (MSG_VIEW_FLAG_HASCHILDREN | MSG_VIEW_FLAG_DUMMY | MSG_VIEW_FLAG_ISTHREAD)

// Helper struct for sorting by numeric fields.
// Associates a message with a key for ordering it in the view.
struct IdUint32 {
  nsMsgKey id;
  uint32_t bits;
  uint32_t dword;  // The numeric key.
  nsIMsgFolder* folder;
};

// Extends IdUint32 for sorting by a collation key field (eg subject).
// (Also used as IdUint32 a couple of places to simplify the code, where
// the overhead of an unused nsTArray isn't a big deal).
struct IdKey : public IdUint32 {
  nsTArray<uint8_t> key;
};

class nsMsgDBViewService final : public nsIMsgDBViewService {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIMSGDBVIEWSERVICE

  nsMsgDBViewService() {};

 protected:
  ~nsMsgDBViewService() {};
};

// This is an abstract implementation class.
// The actual view objects will be instances of sub-classes of this class.
class nsMsgDBView : public nsIMsgDBView,
                    public nsIDBChangeListener,
                    public nsITreeView,
                    public nsIJunkMailClassificationListener {
 public:
  friend class nsMsgDBViewService;
  nsMsgDBView();

  NS_DECL_ISUPPORTS
  NS_DECL_NSIMSGDBVIEW
  NS_DECL_NSIDBCHANGELISTENER
  NS_DECL_NSITREEVIEW
  NS_DECL_NSIJUNKMAILCLASSIFICATIONLISTENER

  nsMsgViewIndex GetInsertIndexHelper(nsIMsgDBHdr* msgHdr,
                                      nsTArray<nsMsgKey>& keys,
                                      nsCOMArray<nsIMsgFolder>* folders,
                                      nsMsgViewSortOrderValue sortOrder,
                                      nsMsgViewSortTypeValue sortType);
  int32_t SecondaryCompare(nsMsgKey key1, nsIMsgFolder* folder1, nsMsgKey key2,
                           nsIMsgFolder* folder2,
                           class viewSortInfo* comparisonContext);

 protected:
  virtual ~nsMsgDBView();

  static nsString kHighestPriorityString;
  static nsString kHighPriorityString;
  static nsString kLowestPriorityString;
  static nsString kLowPriorityString;
  static nsString kNormalPriorityString;

  static nsString kReadString;
  static nsString kRepliedString;
  static nsString kForwardedString;
  static nsString kRedirectedString;
  static nsString kNewString;

  // Used for group views.
  static nsString kTodayString;
  static nsString kYesterdayString;
  static nsString kLastWeekString;
  static nsString kTwoWeeksAgoString;
  static nsString kOldMailString;
  static nsString kFutureDateString;

  RefPtr<mozilla::dom::XULTreeElement> mTree;
  nsCOMPtr<nsIMsgJSTree> mJSTree;
  nsCOMPtr<nsITreeSelection> mTreeSelection;
  // We cache this to determine when to push command status notifications.
  uint32_t mNumSelectedRows;
  // Set when the message pane is collapsed.
  bool mSuppressMsgDisplay;
  bool mSuppressCommandUpdating;
  // Set when we're telling the outline a row is being removed. Used to
  // suppress msg loading during delete/move operations.
  bool mRemovingRow;
  bool mCommandsNeedDisablingBecauseOfSelection;
  bool mSuppressChangeNotification;

  virtual const char* GetViewName(void) { return "MsgDBView"; }
  nsresult FetchAuthor(nsIMsgDBHdr* aHdr, nsAString& aAuthorString);
  nsresult FetchRecipients(nsIMsgDBHdr* aHdr, nsAString& aRecipientsString);
  nsresult FetchSubject(nsIMsgDBHdr* aMsgHdr, uint32_t aFlags,
                        nsAString& aValue);
  nsresult FetchDate(nsIMsgDBHdr* aHdr, nsAString& aDateString,
                     bool rcvDate = false);
  nsresult FetchStatus(uint32_t aFlags, nsAString& aStatusString);
  nsresult FetchSize(nsIMsgDBHdr* aHdr, nsAString& aSizeString);
  nsresult FetchPriority(nsIMsgDBHdr* aHdr, nsAString& aPriorityString);
  nsresult FetchLabel(nsIMsgDBHdr* aHdr, nsAString& aLabelString);
  nsresult FetchTags(nsIMsgDBHdr* aHdr, nsAString& aTagString);
  nsresult FetchTagKeys(nsIMsgDBHdr* aHdr, nsAString& aTagString);
  nsresult FetchKeywords(nsIMsgDBHdr* aHdr, nsACString& keywordString);
  nsresult FetchRowKeywords(nsMsgViewIndex aRow, nsIMsgDBHdr* aHdr,
                            nsACString& keywordString);
  nsresult FetchAccount(nsIMsgDBHdr* aHdr, nsAString& aAccount);
  bool IsOutgoingMsg(nsIMsgDBHdr* aHdr);

  // The default enumerator is over the db, but things like
  // quick search views will enumerate just the displayed messages.
  virtual nsresult GetMessageEnumerator(nsIMsgEnumerator** enumerator);
  // this is a message enumerator that enumerates based on the view contents
  virtual nsresult GetViewEnumerator(nsIMsgEnumerator** enumerator);

  // Save and Restore Selection are a pair of routines you should
  // use when performing an operation which is going to change the view
  // and you want to remember the selection. (i.e. for sorting).
  // Call SaveAndClearSelection and we'll give you an array of msg keys for
  // the current selection. We also freeze and clear the selection.
  // When you are done changing the view,
  // call RestoreSelection passing in the same array
  // and we'll restore the selection AND unfreeze selection in the UI.
  nsresult SaveAndClearSelection(nsMsgKey* aCurrentMsgKey,
                                 nsTArray<nsMsgKey>& aMsgKeyArray);
  nsresult RestoreSelection(nsMsgKey aCurrentmsgKey,
                            nsTArray<nsMsgKey>& aMsgKeyArray);

  // This is not safe to use when you have a selection.
  // RowCountChanged() will call AdjustSelection().
  // It should be called after SaveAndClearSelection() and before
  // RestoreSelection().
  nsresult AdjustRowCount(int32_t rowCountBeforeSort,
                          int32_t rowCountAfterSort);

  nsresult GenerateURIForMsgKey(nsMsgKey aMsgKey, nsIMsgFolder* folder,
                                nsACString& aURI);

  // Routines used in building up view.
  virtual bool WantsThisThread(nsIMsgThread* thread);
  virtual nsresult AddHdr(nsIMsgDBHdr* msgHdr,
                          nsMsgViewIndex* resultIndex = nullptr);
  bool GetShowingIgnored() {
    return (m_viewFlags & nsMsgViewFlagsType::kShowIgnored) != 0;
  }
  bool OperateOnMsgsInCollapsedThreads();

  virtual nsresult OnNewHeader(nsIMsgDBHdr* aNewHdr, nsMsgKey parentKey,
                               bool ensureListed);
  virtual nsMsgViewIndex GetInsertIndex(nsIMsgDBHdr* msgHdr);
  nsMsgViewIndex GetIndexForThread(nsIMsgDBHdr* hdr);
  nsMsgViewIndex GetThreadRootIndex(nsIMsgDBHdr* msgHdr);
  virtual nsresult GetMsgHdrForViewIndex(nsMsgViewIndex index,
                                         nsIMsgDBHdr** msgHdr);
  // Given a view index, return the index of the top-level msg in the thread.
  nsMsgViewIndex GetThreadIndex(nsMsgViewIndex msgIndex);

  virtual void InsertMsgHdrAt(nsMsgViewIndex index, nsIMsgDBHdr* hdr,
                              nsMsgKey msgKey, uint32_t flags, uint32_t level);
  virtual void SetMsgHdrAt(nsIMsgDBHdr* hdr, nsMsgViewIndex index,
                           nsMsgKey msgKey, uint32_t flags, uint32_t level);
  virtual void InsertEmptyRows(nsMsgViewIndex viewIndex, int32_t numRows);
  virtual void RemoveRows(nsMsgViewIndex viewIndex, int32_t numRows);
  nsresult ToggleExpansion(nsMsgViewIndex index, uint32_t* numChanged);
  nsresult ExpandByIndex(nsMsgViewIndex index, uint32_t* pNumExpanded);
  nsresult CollapseByIndex(nsMsgViewIndex index, uint32_t* pNumCollapsed);
  nsresult ExpandAll();
  nsresult CollapseAll();
  nsresult ExpandAndSelectThread();

  // Helper routines for thread expanding and collapsing.
  nsresult GetThreadCount(nsMsgViewIndex viewIndex, uint32_t* pThreadCount);
  /**
   * Retrieve the view index of the first displayed message in the given thread.
   * @param threadHdr The thread you care about.
   * @param allowDummy Should dummy headers be returned when the non-dummy
   *     header is available?  If the root node of the thread is a dummy header
   *     and you pass false, then we will return the first child of the thread
   *     unless the thread is elided, in which case we will return the root.
   *     If you pass true, we will always return the root.
   * @return the view index of the first message in the thread, if any.
   */
  nsMsgViewIndex GetIndexOfFirstDisplayedKeyInThread(nsIMsgThread* threadHdr,
                                                     bool allowDummy = false);
  virtual nsresult GetFirstMessageHdrToDisplayInThread(nsIMsgThread* threadHdr,
                                                       nsIMsgDBHdr** result);
  virtual nsMsgViewIndex ThreadIndexOfMsg(
      nsMsgKey msgKey, nsMsgViewIndex msgIndex = nsMsgViewIndex_None,
      int32_t* pThreadCount = nullptr, uint32_t* pFlags = nullptr);
  nsMsgViewIndex ThreadIndexOfMsgHdr(
      nsIMsgDBHdr* msgHdr, nsMsgViewIndex msgIndex = nsMsgViewIndex_None,
      int32_t* pThreadCount = nullptr, uint32_t* pFlags = nullptr);
  nsMsgKey GetKeyOfFirstMsgInThread(nsMsgKey key);
  int32_t CountExpandedThread(nsMsgViewIndex index);
  virtual nsresult ExpansionDelta(nsMsgViewIndex index,
                                  int32_t* expansionDelta);
  void ReverseSort();
  void ReverseThreads();
  nsresult SaveSortInfo(nsMsgViewSortTypeValue sortType,
                        nsMsgViewSortOrderValue sortOrder);
  nsresult RestoreSortInfo();
  nsresult PersistFolderInfo(nsIDBFolderInfo** dbFolderInfo);
  void SetMRUTimeForFolder(nsIMsgFolder* folder);

  nsMsgKey GetAt(nsMsgViewIndex index) {
    return m_keys.SafeElementAt(index, nsMsgKey_None);
  }

  nsMsgViewIndex FindViewIndex(nsMsgKey key) { return FindKey(key, false); }
  /**
   * Find the message header if it is visible in this view.  (Messages in
   *     threads/groups that are elided will not be
   * @param msgHdr Message header to look for.
   * @param startIndex The index to start looking from.
   * @param allowDummy Are dummy headers acceptable?  If yes, then for a group
   *     with a dummy header, we return the root of the thread (the dummy
   *     header), otherwise we return the actual "content" header for the
   *     message.
   * @return The view index of the header found, if any.
   */
  virtual nsMsgViewIndex FindHdr(nsIMsgDBHdr* msgHdr,
                                 nsMsgViewIndex startIndex = 0,
                                 bool allowDummy = false);
  virtual nsMsgViewIndex FindKey(nsMsgKey key, bool expand);
  virtual nsresult GetDBForViewIndex(nsMsgViewIndex index, nsIMsgDatabase** db);
  virtual nsCOMArray<nsIMsgFolder>* GetFolders();

  virtual nsresult ListIdsInThread(nsIMsgThread* threadHdr,
                                   nsMsgViewIndex viewIndex,
                                   uint32_t* pNumListed);
  nsresult ListUnreadIdsInThread(nsIMsgThread* threadHdr,
                                 nsMsgViewIndex startOfThreadViewIndex,
                                 uint32_t* pNumListed);
  nsMsgViewIndex FindParentInThread(nsMsgKey parentKey,
                                    nsMsgViewIndex startOfThreadViewIndex);
  virtual nsresult ListIdsInThreadOrder(nsIMsgThread* threadHdr,
                                        nsMsgKey parentKey, uint32_t level,
                                        nsMsgViewIndex* viewIndex,
                                        uint32_t* pNumListed);
  uint32_t GetSize(void) { return (m_keys.Length()); }

  // For commands.
  virtual nsresult ApplyCommandToIndicesWithFolder(
      nsMsgViewCommandTypeValue command,
      nsTArray<nsMsgViewIndex> const& selection, nsIMsgFolder* destFolder);
  virtual nsresult CopyMessages(nsIMsgWindow* window,
                                nsTArray<nsMsgViewIndex> const& selection,
                                bool isMove, nsIMsgFolder* destFolder);
  virtual nsresult DeleteMessages(nsIMsgWindow* window,
                                  nsTArray<nsMsgViewIndex> const& selection,
                                  bool deleteStorage);
  nsresult GetHeadersFromSelection(nsTArray<nsMsgViewIndex> const& selection,
                                   nsTArray<RefPtr<nsIMsgDBHdr>>& hdrs);
  // ListCollapsedChildren() adds to messageArray (rather than replacing it).
  virtual nsresult ListCollapsedChildren(
      nsMsgViewIndex viewIndex, nsTArray<RefPtr<nsIMsgDBHdr>>& messageArray);

  nsresult SetMsgHdrJunkStatus(nsIJunkMailPlugin* aJunkPlugin,
                               nsIMsgDBHdr* aMsgHdr,
                               nsMsgJunkStatus aNewClassification);
  nsresult SetThreadOfMsgReadByIndex(nsMsgViewIndex index,
                                     nsTArray<nsMsgKey>& keysMarkedRead,
                                     bool read);
  nsresult OrExtraFlag(nsMsgViewIndex index, uint32_t orflag);
  nsresult AndExtraFlag(nsMsgViewIndex index, uint32_t andflag);
  nsresult SetExtraFlag(nsMsgViewIndex index, uint32_t extraflag);
  virtual nsresult RemoveByIndex(nsMsgViewIndex index);
  virtual void OnExtraFlagChanged(nsMsgViewIndex /*index*/,
                                  uint32_t /*extraFlag*/) {}
  virtual void OnHeaderAddedOrDeleted() {}
  nsresult ToggleWatched(nsTArray<nsMsgViewIndex> const& selection);
  nsresult SetThreadWatched(nsIMsgThread* thread, nsMsgViewIndex index,
                            bool watched);
  nsresult SetThreadIgnored(nsIMsgThread* thread, nsMsgViewIndex threadIndex,
                            bool ignored);
  nsresult SetSubthreadKilled(nsIMsgDBHdr* header, nsMsgViewIndex msgIndex,
                              bool ignored);
  nsresult DownloadForOffline(nsIMsgWindow* window,
                              nsTArray<nsMsgViewIndex> const& selection);
  nsresult DownloadFlaggedForOffline(nsIMsgWindow* window);
  nsMsgViewIndex GetThreadFromMsgIndex(nsMsgViewIndex index,
                                       nsIMsgThread** threadHdr);
  /// Should junk commands be enabled for the current message in the view?
  bool JunkControlsEnabled(nsMsgViewIndex aViewIndex);

  // For sorting.
  nsresult GetFieldTypeAndLenForSort(
      nsMsgViewSortTypeValue sortType, uint16_t* pMaxLen,
      eFieldType* pFieldType, nsIMsgCustomColumnHandler* colHandler = nullptr);
  nsresult GetCollationKey(nsIMsgDBHdr* msgHdr, nsMsgViewSortTypeValue sortType,
                           nsTArray<uint8_t>& result,
                           nsIMsgCustomColumnHandler* colHandler = nullptr);
  nsresult GetLongField(nsIMsgDBHdr* msgHdr, nsMsgViewSortTypeValue sortType,
                        uint32_t* result,
                        nsIMsgCustomColumnHandler* colHandler = nullptr);

  static int FnSortIdKey(const IdKey* pItem1, const IdKey* pItem2,
                         viewSortInfo* sortInfo);
  static int FnSortIdUint32(const IdUint32* pItem1, const IdUint32* pItem2,
                            viewSortInfo* sortInfo);

  nsresult GetStatusSortValue(nsIMsgDBHdr* msgHdr, uint32_t* result);
  nsresult GetLocationCollationKey(nsIMsgDBHdr* msgHdr,
                                   nsTArray<uint8_t>& result);
  void PushSort(const MsgViewSortColumnInfo& newSort);
  void UpdateSortInfo(nsMsgViewSortTypeValue sortType,
                      nsMsgViewSortOrderValue sortOrder);
  nsresult EncodeColumnSort(nsString& columnSortString);
  nsresult DecodeColumnSort(nsString& columnSortString);
  // For view navigation.
  nsresult NavigateFromPos(nsMsgNavigationTypeValue motion,
                           nsMsgViewIndex startIndex, nsMsgKey* pResultKey,
                           nsMsgViewIndex* pResultIndex,
                           nsMsgViewIndex* pThreadIndex, bool wrap);
  nsresult FindNextFlagged(nsMsgViewIndex startIndex,
                           nsMsgViewIndex* pResultIndex);
  nsresult FindFirstNew(nsMsgViewIndex* pResultIndex);
  nsresult FindPrevUnread(nsMsgKey startKey, nsMsgKey* pResultKey,
                          nsMsgKey* resultThreadId);
  nsresult FindFirstFlagged(nsMsgViewIndex* pResultIndex);
  nsresult FindPrevFlagged(nsMsgViewIndex startIndex,
                           nsMsgViewIndex* pResultIndex);
  nsresult MarkThreadOfMsgRead(nsMsgKey msgId, nsMsgViewIndex msgIndex,
                               nsTArray<nsMsgKey>& idsMarkedRead, bool bRead);
  nsresult MarkThreadRead(nsIMsgThread* threadHdr, nsMsgViewIndex threadIndex,
                          nsTArray<nsMsgKey>& idsMarkedRead, bool bRead);
  bool IsValidIndex(nsMsgViewIndex index);
  nsresult ToggleIgnored(nsTArray<nsMsgViewIndex> const& selection,
                         nsMsgViewIndex* resultIndex, bool* resultToggleState);
  nsresult ToggleMessageKilled(nsTArray<nsMsgViewIndex> const& selection,
                               nsMsgViewIndex* resultIndex,
                               bool* resultToggleState);
  bool OfflineMsgSelected(nsTArray<nsMsgViewIndex> const& selection);
  bool NonDummyMsgSelected(nsTArray<nsMsgViewIndex> const& selection);
  static void GetString(const char16_t* aStringName, nsAString& aValue);
  static nsresult GetPrefLocalizedString(const char* aPrefName,
                                         nsString& aResult);
  nsresult AppendKeywordProperties(const nsACString& keywords,
                                   nsAString& properties, bool* tagAdded);
  static nsresult InitLabelStrings(void);
  nsresult CopyDBView(nsMsgDBView* aNewMsgDBView,
                      nsIMessenger* aMessengerInstance,
                      nsIMsgWindow* aMsgWindow,
                      nsIMsgDBViewCommandUpdater* aCmdUpdater);
  static void InitializeLiterals();
  virtual int32_t FindLevelInThread(nsIMsgDBHdr* msgHdr,
                                    nsMsgViewIndex startOfThread,
                                    nsMsgViewIndex viewIndex);
  nsresult GetImapDeleteModel(nsIMsgFolder* folder);
  nsresult UpdateDisplayMessage(nsMsgViewIndex viewPosition);
  nsresult GetDBForHeader(nsIMsgDBHdr* msgHdr, nsIMsgDatabase** db);

  bool AdjustReadFlag(nsIMsgDBHdr* msgHdr, uint32_t* msgFlags);
  void FreeAll(nsTArray<void*>* ptrs);
  void ClearHdrCache();

  // The message held in each row.
  nsTArray<nsMsgKey> m_keys;
  // Flags for each row, combining nsMsgMessageFlags and MSG_VIEW_FLAGS.
  nsTArray<uint32_t> m_flags;
  // Threading level of each row (1=top)
  nsTArray<uint8_t> m_levels;

  nsMsgImapDeleteModel mDeleteModel;

  // Cache the most recently asked for header and corresponding msgKey.
  nsCOMPtr<nsIMsgDBHdr> m_cachedHdr;
  nsMsgKey m_cachedMsgKey;

  // We need to store the message key for the message we are currently
  // displaying to ensure we don't try to redisplay the same message just
  // because the selection changed (i.e. after a sort).
  nsMsgKey m_currentlyDisplayedMsgKey;
  nsCString m_currentlyDisplayedMsgUri;
  nsMsgViewIndex m_currentlyDisplayedViewIndex;
  // If we're deleting messages, we want to hold off loading messages on
  // selection changed until the delete is done and we want to batch
  // notifications.
  bool m_deletingRows;
  // For certain special folders and descendants of those folders
  // (like the "Sent" folder, "Sent/Old Sent").
  // The Sender column really shows recipients.

  // Server types for this view's folder
  bool mIsNews;       // We have special icons for news.
  bool mIsRss;        // RSS affects enabling of junk commands.
  bool mIsXFVirtual;  // A virtual folder with multiple folders.

  bool mShowSizeInLines;    // For news we show lines instead of size when true.
  bool mSortThreadsByRoot;  // As opposed to by the newest message.
  bool m_sortValid;
  bool m_checkedCustomColumns;
  bool mSelectionSummarized;
  // We asked the front end to summarize the selection and it did not.
  bool mSummarizeFailed;
  uint8_t m_saveRestoreSelectionDepth;

  nsCOMPtr<nsIMsgDatabase> m_db;
  nsCOMPtr<nsIMsgFolder> m_folder;
  // For virtual folders, the VF db.
  nsCOMPtr<nsIMsgFolder> m_viewFolder;
  nsString mMessageType;
  nsTArray<MsgViewSortColumnInfo> m_sortColumns;
  nsMsgViewSortTypeValue m_sortType;
  nsMsgViewSortOrderValue m_sortOrder;
  nsString m_curCustomColumn;
  nsMsgViewSortTypeValue m_secondarySort;
  nsMsgViewSortOrderValue m_secondarySortOrder;
  nsString m_secondaryCustomColumn;
  nsMsgViewFlagsTypeValue m_viewFlags;

  // I18N date formatter service which we'll want to cache locally.
  nsCOMPtr<nsIMsgTagService> mTagService;
  nsWeakPtr mMessengerWeak;
  nsWeakPtr mMsgWindowWeak;
  // We push command update notifications to the UI from this.
  nsWeakPtr mCommandUpdater;
  static nsCOMPtr<nsIStringBundle> mMessengerStringBundle;

  // Used to determine when to start and end junk plugin batches.
  uint32_t mNumMessagesRemainingInBatch;

  // These are the headers of the messages in the current
  // batch/series of batches of messages manually marked
  // as junk.
  nsTArray<RefPtr<nsIMsgDBHdr>> mJunkHdrs;

  nsTArray<uint32_t> mIndicesToNoteChange;

  nsTHashtable<nsCStringHashKey> mEmails;

  // The saved search views keep track of the XX most recently deleted msg ids,
  // so that if the delete is undone, we can add the msg back to the search
  // results, even if it no longer matches the search criteria (e.g., a saved
  // search over unread messages). We use mRecentlyDeletedArrayIndex to treat
  // the array as a list of the XX most recently deleted msgs.
  nsTArray<nsCString> mRecentlyDeletedMsgIds;
  uint32_t mRecentlyDeletedArrayIndex;
  void RememberDeletedMsgHdr(nsIMsgDBHdr* msgHdr);
  bool WasHdrRecentlyDeleted(nsIMsgDBHdr* msgHdr);

  // These hold pointers (and IDs) for the nsIMsgCustomColumnHandler object
  // that constitutes the custom column handler.
  nsCOMArray<nsIMsgCustomColumnHandler> m_customColumnHandlers;
  nsTArray<nsString> m_customColumnHandlerIDs;

  nsIMsgCustomColumnHandler* GetColumnHandler(const nsAString& colID);
  nsIMsgCustomColumnHandler* GetCurColumnHandler();
  bool CustomColumnsInSortAndNotRegistered();
  void EnsureCustomColumnsValid();

 protected:
  static nsresult InitDisplayFormats();

 private:
  static bool m_dateFormatsInitialized;
  static nsDateFormatSelectorComm m_dateFormatDefault;
  static nsDateFormatSelectorComm m_dateFormatThisWeek;
  static nsDateFormatSelectorComm m_dateFormatToday;
  static nsString m_connectorPattern;

  bool ServerSupportsFilterAfterTheFact();

  nsresult PerformActionsOnJunkMsgs(bool msgsAreJunk);
  nsresult DetermineActionsForJunkChange(bool msgsAreJunk,
                                         nsIMsgFolder* srcFolder,
                                         bool& moveMessages,
                                         bool& changeReadState,
                                         nsIMsgFolder** targetFolder);

  class nsMsgViewHdrEnumerator final : public nsBaseMsgEnumerator {
   public:
    explicit nsMsgViewHdrEnumerator(nsMsgDBView* view);

    // nsIMsgEnumerator support.
    NS_IMETHOD GetNext(nsIMsgDBHdr** aItem) override;
    NS_IMETHOD HasMoreElements(bool* aResult) override;

    RefPtr<nsMsgDBView> m_view;
    nsMsgViewIndex m_curHdrIndex;

   private:
    virtual ~nsMsgViewHdrEnumerator() override;
  };
};

#endif
