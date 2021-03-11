/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#ifndef nsAbOutlookDirectory_h___
#define nsAbOutlookDirectory_h___

#include "mozilla/Attributes.h"
#include "nsIAbCard.h"
#include "nsAbDirProperty.h"
#include "nsIAbDirectoryQuery.h"
#include "nsIAbDirSearchListener.h"
#include "nsInterfaceHashtable.h"
#include "nsIMutableArray.h"
#include "nsAbWinHelper.h"

struct nsMapiEntry;

class nsAbOutlookDirectory : public nsAbDirProperty,  // nsIAbDirectory
                             public nsIAbDirectoryQuery,
                             public nsIAbDirSearchListener {
 public:
  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_NSIABDIRSEARCHLISTENER

  nsAbOutlookDirectory(void);

  // nsAbDirProperty methods
  NS_IMETHOD GetDirType(int32_t* aDirType) override;
  NS_IMETHOD GetURI(nsACString& aURI) override;
  NS_IMETHOD GetChildCards(nsTArray<RefPtr<nsIAbCard>>& result) override;
  NS_IMETHOD GetChildNodes(nsTArray<RefPtr<nsIAbDirectory>>& result) override;
  NS_IMETHOD HasCard(nsIAbCard* aCard, bool* aHasCard) override;
  NS_IMETHOD HasDirectory(nsIAbDirectory* aDirectory,
                          bool* aHasDirectory) override;
  NS_IMETHOD DeleteCards(const nsTArray<RefPtr<nsIAbCard>>& aCards) override;
  NS_IMETHOD DeleteDirectory(nsIAbDirectory* aDirectory) override;
  NS_IMETHOD AddCard(nsIAbCard* aData, nsIAbCard** addedCard) override;
  NS_IMETHOD ModifyCard(nsIAbCard* aModifiedCard) override;
  NS_IMETHOD DropCard(nsIAbCard* aData, bool needToCopyCard) override;
  NS_IMETHOD AddMailList(nsIAbDirectory* aMailList,
                         nsIAbDirectory** addedList) override;
  NS_IMETHOD EditMailListToDatabase(nsIAbCard* listCard) override;
  NS_IMETHOD CardForEmailAddress(const nsACString& aEmailAddress,
                                 nsIAbCard** aResult) override;

  // nsAbDirProperty method
  NS_IMETHOD Init(const char* aUri) override;
  // nsIAbDirectoryQuery methods
  NS_DECL_NSIABDIRECTORYQUERY
  // Perform a MAPI query.
  nsresult ExecuteQuery(SRestriction* aRestriction,
                        nsIAbDirSearchListener* aListener,
                        int32_t aResultLimit);
  NS_IMETHOD Search(const nsAString& query, const nsAString& searchString,
                    nsIAbDirSearchListener* listener) override;

 protected:
  nsresult StopSearch();
  nsresult ExtractCardEntry(nsIAbCard* aCard, nsCString& aEntry);
  nsresult ExtractDirectoryEntry(nsIAbDirectory* aDirectory, nsCString& aEntry);
  void AlignListEntryStringAndGetUID(nsCString& aEntryString,
                                     nsCString& aOriginalUID);

  // Retrieve hierarchy as cards, with an optional restriction
  nsresult GetCards(nsIMutableArray* aCards, SRestriction* aRestriction);
  // Retrieve hierarchy as directories
  nsresult GetNodes(nsIMutableArray* aNodes);
  nsresult ModifyCardInternal(nsIAbCard* aModifiedCard, bool aIsAddition);
  // Notification for the UI.
  nsresult NotifyItemDeletion(nsISupports* aItem, bool aIsCard,
                              const char* aNotificationUID = nullptr);
  nsresult NotifyItemAddition(nsISupports* aItem, bool aIsCard,
                              const char* aNotificationUID = nullptr);
  nsresult NotifyItemModification(nsISupports* aItem, bool aIsCard,
                                  const char* aNotificationUID = nullptr);
  nsresult NotifyCardPropertyChanges(nsIAbCard* aOld, nsIAbCard* aNew);
  nsresult commonNotification(nsISupports* aItem, const char* aTopic,
                              const char* aNotificationUID);
  // Utility to produce a card from a URI.
  nsresult OutlookCardForURI(const nsACString& aUri, nsIAbCard** card);

  nsMapiEntry* mDirEntry;
  // Keep track of context ID to be passed back from `DoQuery()`.
  int32_t mCurrentQueryId;
  // Data for the search interfaces
  int32_t mSearchContext;

 private:
  virtual ~nsAbOutlookDirectory(void);
  nsCString mParentEntryId;

  // This is totally quirky. `m_AddressList` is defined in
  // class nsAbDirProperty to hold a list of mailing lists,
  // but there is no member to hold a list of cards.
  // It gets worse: For mailing lists, `m_AddressList` holds the
  // list of cards.
  // So we'll do it as the Mac AB does and define a member for it.
  // nsIMutableArray is used, because then it is interchangeable with
  // `m_AddressList`.
  nsCOMPtr<nsIMutableArray> mCardList;
};

enum {
  index_DisplayName = 0,
  index_FirstName,
  index_LastName,
  index_NickName,
  index_WorkPhoneNumber,
  index_HomePhoneNumber,
  index_WorkFaxNumber,
  index_PagerNumber,
  index_MobileNumber,
  index_HomeCity,
  index_HomeState,
  index_HomeZip,
  index_HomeCountry,
  index_WorkCity,
  index_WorkState,
  index_WorkZip,
  index_WorkCountry,
  index_JobTitle,
  index_Department,
  index_Company,
  index_WorkWebPage,
  index_HomeWebPage,
  index_Notes,
  index_LastProp
};

// The following properties are retrieved from the contact associated
// with the address book entry. Email not available on contact,
// the contact has three named email properties.
static const ULONG OutlookCardMAPIProps[] = {
    PR_DISPLAY_NAME_W,
    PR_GIVEN_NAME_W,
    PR_SURNAME_W,
    PR_NICKNAME_W,
    PR_BUSINESS_TELEPHONE_NUMBER_W,
    PR_HOME_TELEPHONE_NUMBER_W,
    PR_BUSINESS_FAX_NUMBER_W,
    PR_PAGER_TELEPHONE_NUMBER_W,
    PR_MOBILE_TELEPHONE_NUMBER_W,
    PR_HOME_ADDRESS_CITY_W,
    PR_HOME_ADDRESS_STATE_OR_PROVINCE_W,
    PR_HOME_ADDRESS_POSTAL_CODE_W,
    PR_HOME_ADDRESS_COUNTRY_W,
    PR_BUSINESS_ADDRESS_CITY_W,
    PR_BUSINESS_ADDRESS_STATE_OR_PROVINCE_W,
    PR_BUSINESS_ADDRESS_POSTAL_CODE_W,
    PR_BUSINESS_ADDRESS_COUNTRY_W,
    PR_TITLE_W,
    PR_DEPARTMENT_NAME_W,
    PR_COMPANY_NAME_W,
    PR_BUSINESS_HOME_PAGE_W,
    PR_PERSONAL_HOME_PAGE_W,
    PR_BODY_W};

static const char* CardStringProperties[] = {
    kFirstNameProperty,   kLastNameProperty,     kDisplayNameProperty,
    kNicknameProperty,    kPriEmailProperty,

    kHomeAddressProperty, kHomeAddress2Property, kHomeCityProperty,
    kHomeStateProperty,   kHomeZipCodeProperty,  kHomeCountryProperty,
    kHomeWebPageProperty,

    kWorkAddressProperty, kWorkAddress2Property, kWorkCityProperty,
    kWorkStateProperty,   kWorkZipCodeProperty,  kWorkCountryProperty,
    kWorkWebPageProperty,

    kHomePhoneProperty,   kWorkPhoneProperty,    kFaxProperty,
    kPagerProperty,       kCellularProperty,

    kJobTitleProperty,    kDepartmentProperty,   kCompanyProperty,
    kNotesProperty};

static const char* CardIntProperties[] = {
    kBirthYearProperty, kBirthMonthProperty, kBirthDayProperty};

#endif  // nsAbOutlookDirectory_h___
