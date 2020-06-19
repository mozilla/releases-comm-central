/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#include "nsAbBaseCID.h"
#include "nsIAbDirectory.h"
#include "nsIAbCard.h"
#include "nsString.h"
#include "nsAbLDIFService.h"
#include "nsIFile.h"
#include "nsILineInputStream.h"
#include "nsIInputStream.h"
#include "nsNetUtil.h"
#include "nsISeekableStream.h"
#include "mdb.h"
#include "plstr.h"
#include "prmem.h"
#include "prprf.h"
#include "nsCRTGlue.h"
#include "nsTArray.h"

#include <ctype.h>

NS_IMPL_ISUPPORTS(nsAbLDIFService, nsIAbLDIFService)

// If we get a line longer than 32K it's just toooooo bad!
#define kTextAddressBufferSz (64 * 1024)

nsAbLDIFService::nsAbLDIFService() {
  mStoreLocAsHome = false;
  mLFCount = 0;
  mCRCount = 0;
}

nsAbLDIFService::~nsAbLDIFService() {}

#define RIGHT2 0x03
#define RIGHT4 0x0f
#define CONTINUED_LINE_MARKER '\001'

// XXX TODO fix me
// use the NSPR base64 library.  see plbase64.h
// see bug #145367
static unsigned char b642nib[0x80] = {
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x3e, 0xff, 0xff, 0xff, 0x3f,
    0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x3b, 0x3c, 0x3d, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06,
    0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10, 0x11, 0x12,
    0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0x21, 0x22, 0x23, 0x24,
    0x25, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x2b, 0x2c, 0x2d, 0x2e, 0x2f, 0x30,
    0x31, 0x32, 0x33, 0xff, 0xff, 0xff, 0xff, 0xff};

NS_IMETHODIMP nsAbLDIFService::ImportLDIFFile(nsIAbDirectory* aDirectory,
                                              nsIFile* aSrc,
                                              bool aStoreLocAsHome,
                                              uint32_t* aProgress) {
  NS_ENSURE_ARG_POINTER(aSrc);
  NS_ENSURE_ARG_POINTER(aDirectory);

  mStoreLocAsHome = aStoreLocAsHome;

  char buf[1024];
  char* pBuf = &buf[0];
  int32_t startPos = 0;
  uint32_t len = 0;
  nsTArray<int32_t> listPosArray;   // where each list/group starts in ldif file
  nsTArray<int32_t> listSizeArray;  // size of the list/group info
  int32_t savedStartPos = 0;
  int32_t filePos = 0;
  uint64_t bytesLeft = 0;

  nsCOMPtr<nsIInputStream> inputStream;
  nsresult rv = NS_NewLocalFileInputStream(getter_AddRefs(inputStream), aSrc);
  NS_ENSURE_SUCCESS(rv, rv);

  // Initialize the parser for a run...
  mLdifLine.Truncate();

  while (NS_SUCCEEDED(inputStream->Available(&bytesLeft)) && bytesLeft > 0) {
    if (NS_SUCCEEDED(inputStream->Read(pBuf, sizeof(buf), &len)) && len > 0) {
      startPos = 0;

      while (NS_SUCCEEDED(GetLdifStringRecord(buf, len, startPos))) {
        if (mLdifLine.Find("groupOfNames") == -1)
          AddLdifRowToDatabase(aDirectory, false);
        else {
          // keep file position for mailing list
          listPosArray.AppendElement(savedStartPos);
          listSizeArray.AppendElement(filePos + startPos - savedStartPos);
          ClearLdifRecordBuffer();
        }
        savedStartPos = filePos + startPos;
      }
      filePos += len;
      if (aProgress) *aProgress = (uint32_t)filePos;
    }
  }
  // last row
  if (!mLdifLine.IsEmpty() && mLdifLine.Find("groupOfNames") == -1)
    AddLdifRowToDatabase(aDirectory, false);

  // mail Lists
  int32_t i, pos;
  uint32_t size;
  int32_t listTotal = listPosArray.Length();
  char* listBuf;
  ClearLdifRecordBuffer();  // make sure the buffer is clean

  nsCOMPtr<nsISeekableStream> seekableStream =
      do_QueryInterface(inputStream, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  for (i = 0; i < listTotal; i++) {
    pos = listPosArray[i];
    size = listSizeArray[i];
    if (NS_SUCCEEDED(
            seekableStream->Seek(nsISeekableStream::NS_SEEK_SET, pos))) {
      // Allocate enough space for the lists/groups as the size varies.
      listBuf = (char*)PR_Malloc(size);
      if (!listBuf) continue;
      if (NS_SUCCEEDED(inputStream->Read(listBuf, size, &len)) && len > 0) {
        startPos = 0;

        while (NS_SUCCEEDED(GetLdifStringRecord(listBuf, len, startPos))) {
          if (mLdifLine.Find("groupOfNames") != -1) {
            AddLdifRowToDatabase(aDirectory, true);
            if (NS_SUCCEEDED(
                    seekableStream->Seek(nsISeekableStream::NS_SEEK_SET, 0)))
              break;
          }
        }
      }
      PR_FREEIF(listBuf);
    }
  }

  rv = inputStream->Close();
  NS_ENSURE_SUCCESS(rv, rv);

  return rv;
}

/*
 * str_parse_line - takes a line of the form "type:[:] value" and splits it
 * into components "type" and "value".  if a double colon separates type from
 * value, then value is encoded in base 64, and parse_line un-decodes it
 * (in place) before returning.
 * in LDIF, non-ASCII data is treated as base64 encoded UTF-8
 */

nsresult nsAbLDIFService::str_parse_line(char* line, char** type, char** value,
                                         int* vlen) const {
  char *p, *s, *d, *byte, *stop;
  char nib;
  int i, b64;

  /* skip any leading space */
  while (isspace(*line)) {
    line++;
  }
  *type = line;

  for (s = line; *s && *s != ':'; s++)
    ; /* NULL */
  if (*s == '\0') {
    return NS_ERROR_FAILURE;
  }

  /* trim any space between type and : */
  for (p = s - 1; p > line && isspace(*p); p--) {
    *p = '\0';
  }
  *s++ = '\0';

  /* check for double : - indicates base 64 encoded value */
  if (*s == ':') {
    s++;
    b64 = 1;
    /* single : - normally encoded value */
  } else {
    b64 = 0;
  }

  /* skip space between : and value */
  while (isspace(*s)) {
    s++;
  }

  /* if no value is present, error out */
  if (*s == '\0') {
    return NS_ERROR_FAILURE;
  }

  /* check for continued line markers that should be deleted */
  for (p = s, d = s; *p; p++) {
    if (*p != CONTINUED_LINE_MARKER) *d++ = *p;
  }
  *d = '\0';

  *value = s;
  if (b64) {
    stop = PL_strchr(s, '\0');
    byte = s;
    for (p = s, *vlen = 0; p < stop; p += 4, *vlen += 3) {
      for (i = 0; i < 3; i++) {
        if (p[i] != '=' && (p[i] & 0x80 || b642nib[p[i] & 0x7f] > 0x3f)) {
          return NS_ERROR_FAILURE;
        }
      }

      /* first digit */
      nib = b642nib[p[0] & 0x7f];
      byte[0] = nib << 2;
      /* second digit */
      nib = b642nib[p[1] & 0x7f];
      byte[0] |= nib >> 4;
      byte[1] = (nib & RIGHT4) << 4;
      /* third digit */
      if (p[2] == '=') {
        *vlen += 1;
        break;
      }
      nib = b642nib[p[2] & 0x7f];
      byte[1] |= nib >> 2;
      byte[2] = (nib & RIGHT2) << 6;
      /* fourth digit */
      if (p[3] == '=') {
        *vlen += 2;
        break;
      }
      nib = b642nib[p[3] & 0x7f];
      byte[2] |= nib;

      byte += 3;
    }
    s[*vlen] = '\0';
  } else {
    *vlen = (int)(d - s);
  }
  return NS_OK;
}

/*
 * str_getline - return the next "line" (minus newline) of input from a
 * string buffer of lines separated by newlines, terminated by \n\n
 * or \0.  this routine handles continued lines, bundling them into
 * a single big line before returning.  if a line begins with a white
 * space character, it is a continuation of the previous line. the white
 * space character (nb: only one char), and preceding newline are changed
 * into CONTINUED_LINE_MARKER chars, to be deleted later by the
 * str_parse_line() routine above.
 *
 * it takes a pointer to a pointer to the buffer on the first call,
 * which it updates and must be supplied on subsequent calls.
 */

char* nsAbLDIFService::str_getline(char** next) const {
  char* lineStr;
  char c;

  if (*next == nullptr || **next == '\n' || **next == '\0') {
    return (nullptr);
  }

  lineStr = *next;
  while ((*next = PL_strchr(*next, '\n')) != NULL) {
    c = *(*next + 1);
    if (isspace(c) && c != '\n') {
      **next = CONTINUED_LINE_MARKER;
      *(*next + 1) = CONTINUED_LINE_MARKER;
    } else {
      *(*next)++ = '\0';
      break;
    }
  }

  return (lineStr);
}

nsresult nsAbLDIFService::GetLdifStringRecord(char* buf, int32_t len,
                                              int32_t& stopPos) {
  for (; stopPos < len; stopPos++) {
    char c = buf[stopPos];

    if (c == 0xA) {
      mLFCount++;
    } else if (c == 0xD) {
      mCRCount++;
    } else {
      if (mLFCount == 0 && mCRCount == 0)
        mLdifLine.Append(c);
      else if ((mLFCount > 1) || (mCRCount > 2 && mLFCount) ||
               (!mLFCount && mCRCount > 1)) {
        return NS_OK;
      } else if ((mLFCount == 1 || mCRCount == 1)) {
        mLdifLine.Append('\n');
        mLdifLine.Append(c);
        mLFCount = 0;
        mCRCount = 0;
      }
    }
  }

  if (((stopPos == len) && (mLFCount > 1)) || (mCRCount > 2 && mLFCount) ||
      (!mLFCount && mCRCount > 1))
    return NS_OK;

  return NS_ERROR_FAILURE;
}

void nsAbLDIFService::AddLdifRowToDatabase(nsIAbDirectory* aDirectory,
                                           bool bIsList) {
  if (!aDirectory) {
    return;
  }

  // If no data to process then reset CR/LF counters and return.
  if (mLdifLine.IsEmpty()) {
    mLFCount = 0;
    mCRCount = 0;
    return;
  }

  nsCOMPtr<nsIAbCard> newCard = do_CreateInstance(NS_ABCARDPROPERTY_CONTRACTID);
  nsTArray<nsCString> members;

  char* cursor = ToNewCString(mLdifLine);
  char* saveCursor = cursor; /* keep for deleting */
  char* line = 0;
  char* typeSlot = 0;
  char* valueSlot = 0;
  int length = 0;  // the length  of an ldif attribute
  while ((line = str_getline(&cursor)) != nullptr) {
    if (NS_SUCCEEDED(str_parse_line(line, &typeSlot, &valueSlot, &length))) {
      nsAutoCString colType(typeSlot);
      nsAutoCString column(valueSlot);

      // 4.x exports attributes like "givenname",
      // mozilla does "givenName" to be compliant with RFC 2798
      ToLowerCase(colType);

      if (colType.EqualsLiteral("member") ||
          colType.EqualsLiteral("uniquemember")) {
        members.AppendElement(column);
      } else {
        AddLdifColToDatabase(aDirectory, newCard, colType, column, bIsList);
      }
    } else
      continue;  // parse error: continue with next loop iteration
  }
  free(saveCursor);

  if (bIsList) {
    nsCOMPtr<nsIAbDirectory> newList =
        do_CreateInstance(NS_ABDIRPROPERTY_CONTRACTID);
    newList->SetIsMailList(true);

    nsAutoString temp;
    newCard->GetDisplayName(temp);
    newList->SetDirName(temp);
    temp.Truncate();
    newCard->GetPropertyAsAString(kNicknameProperty, temp);
    newList->SetListNickName(temp);
    temp.Truncate();
    newCard->GetPropertyAsAString(kNotesProperty, temp);
    newList->SetDescription(temp);

    nsIAbDirectory* outList;
    nsresult rv = aDirectory->AddMailList(newList, &outList);
    NS_ENSURE_SUCCESS_VOID(rv);

    int32_t count = members.Length();
    for (int32_t i = 0; i < count; ++i) {
      nsAutoCString email;
      int32_t emailPos = members[i].Find("mail=");
      emailPos += strlen("mail=");
      email = Substring(members[i], emailPos);

      nsCOMPtr<nsIAbCard> emailCard;
      aDirectory->CardForEmailAddress(email, getter_AddRefs(emailCard));
      if (emailCard) {
        nsIAbCard* outCard;
        outList->AddCard(emailCard, &outCard);
      }
    }
  } else {
    nsIAbCard* outCard;
    aDirectory->AddCard(newCard, &outCard);
  }

  // Clear buffer for next record
  ClearLdifRecordBuffer();
}

void nsAbLDIFService::AddLdifColToDatabase(nsIAbDirectory* aDirectory,
                                           nsIAbCard* newCard,
                                           nsCString colType, nsCString column,
                                           bool bIsList) {
  nsString value = NS_ConvertUTF8toUTF16(column);

  char firstByte = colType.get()[0];
  switch (firstByte) {
    case 'b':
      if (colType.EqualsLiteral("birthyear"))
        newCard->SetPropertyAsAString(kBirthYearProperty, value);
      else if (colType.EqualsLiteral("birthmonth"))
        newCard->SetPropertyAsAString(kBirthMonthProperty, value);
      else if (colType.EqualsLiteral("birthday"))
        newCard->SetPropertyAsAString(kBirthDayProperty, value);
      break;  // 'b'

    case 'c':
      if (colType.EqualsLiteral("cn") || colType.EqualsLiteral("commonname")) {
        newCard->SetDisplayName(value);
      } else if (colType.EqualsLiteral("c") ||
                 colType.EqualsLiteral("countryname")) {
        if (mStoreLocAsHome)
          newCard->SetPropertyAsAString(kHomeCountryProperty, value);
        else
          newCard->SetPropertyAsAString(kWorkCountryProperty, value);
      }

      else if (colType.EqualsLiteral("cellphone"))
        newCard->SetPropertyAsAString(kCellularProperty, value);

      else if (colType.EqualsLiteral("carphone"))
        newCard->SetPropertyAsAString(kCellularProperty, value);

      else if (colType.EqualsLiteral("custom1"))
        newCard->SetPropertyAsAString(kCustom1Property, value);

      else if (colType.EqualsLiteral("custom2"))
        newCard->SetPropertyAsAString(kCustom2Property, value);

      else if (colType.EqualsLiteral("custom3"))
        newCard->SetPropertyAsAString(kCustom3Property, value);

      else if (colType.EqualsLiteral("custom4"))
        newCard->SetPropertyAsAString(kCustom4Property, value);

      else if (colType.EqualsLiteral("company"))
        newCard->SetPropertyAsAString(kCompanyProperty, value);
      break;  // 'c'

    case 'd':
      if (colType.EqualsLiteral("description"))
        newCard->SetPropertyAsAString(kNotesProperty, value);

      else if (colType.EqualsLiteral("department"))
        newCard->SetPropertyAsAString(kDepartmentProperty, value);

      else if (colType.EqualsLiteral("displayname"))
        newCard->SetDisplayName(value);
      break;  // 'd'

    case 'f':

      if (colType.EqualsLiteral("fax") ||
          colType.EqualsLiteral("facsimiletelephonenumber"))
        newCard->SetPropertyAsAString(kFaxProperty, value);
      break;  // 'f'

    case 'g':
      if (colType.EqualsLiteral("givenname")) newCard->SetFirstName(value);
      break;  // 'g'

    case 'h':
      if (colType.EqualsLiteral("homephone"))
        newCard->SetPropertyAsAString(kHomePhoneProperty, value);

      else if (colType.EqualsLiteral("homestreet"))
        newCard->SetPropertyAsAString(kHomeAddressProperty, value);

      else if (colType.EqualsLiteral("homeurl"))
        newCard->SetPropertyAsAString(kHomeWebPageProperty, value);
      break;  // 'h'

    case 'l':
      if (colType.EqualsLiteral("l") || colType.EqualsLiteral("locality")) {
        if (mStoreLocAsHome)
          newCard->SetPropertyAsAString(kHomeCityProperty, value);
        else
          newCard->SetPropertyAsAString(kWorkCityProperty, value);
      }
      // labeledURI contains a URI and, optionally, a label
      // This will remove the label and place the URI as the work URL
      else if (colType.EqualsLiteral("labeleduri")) {
        int32_t index = column.FindChar(' ');
        if (index != -1) column.SetLength(index);

        newCard->SetPropertyAsAString(kWorkWebPageProperty,
                                      NS_ConvertUTF8toUTF16(column));
      }

      break;  // 'l'

    case 'm':
      if (colType.EqualsLiteral("mail"))
        newCard->SetPrimaryEmail(value);

      else if (colType.EqualsLiteral("mobile"))
        newCard->SetPropertyAsAString(kCellularProperty, value);

      else if (colType.EqualsLiteral("mozilla_aimscreenname"))
        newCard->SetPropertyAsAString(kAIMProperty, value);

      else if (colType.EqualsLiteral("mozillacustom1"))
        newCard->SetPropertyAsAString(kCustom1Property, value);

      else if (colType.EqualsLiteral("mozillacustom2"))
        newCard->SetPropertyAsAString(kCustom2Property, value);

      else if (colType.EqualsLiteral("mozillacustom3"))
        newCard->SetPropertyAsAString(kCustom3Property, value);

      else if (colType.EqualsLiteral("mozillacustom4"))
        newCard->SetPropertyAsAString(kCustom4Property, value);

      else if (colType.EqualsLiteral("mozillahomecountryname"))
        newCard->SetPropertyAsAString(kHomeCountryProperty, value);

      else if (colType.EqualsLiteral("mozillahomelocalityname"))
        newCard->SetPropertyAsAString(kHomeCityProperty, value);

      else if (colType.EqualsLiteral("mozillahomestate"))
        newCard->SetPropertyAsAString(kHomeStateProperty, value);

      else if (colType.EqualsLiteral("mozillahomestreet"))
        newCard->SetPropertyAsAString(kHomeAddressProperty, value);

      else if (colType.EqualsLiteral("mozillahomestreet2"))
        newCard->SetPropertyAsAString(kHomeAddress2Property, value);

      else if (colType.EqualsLiteral("mozillahomepostalcode"))
        newCard->SetPropertyAsAString(kHomeZipCodeProperty, value);

      else if (colType.EqualsLiteral("mozillahomeurl"))
        newCard->SetPropertyAsAString(kHomeWebPageProperty, value);

      else if (colType.EqualsLiteral("mozillanickname"))
        newCard->SetPropertyAsAString(kNicknameProperty, value);

      else if (colType.EqualsLiteral("mozillasecondemail"))
        newCard->SetPropertyAsAString(k2ndEmailProperty, value);

      else if (colType.EqualsLiteral("mozillausehtmlmail")) {
        ToLowerCase(column);
        if (-1 != column.Find("true"))
          newCard->SetPropertyAsUint32(kPreferMailFormatProperty,
                                       nsIAbPreferMailFormat::html);
        else if (-1 != column.Find("false"))
          newCard->SetPropertyAsUint32(kPreferMailFormatProperty,
                                       nsIAbPreferMailFormat::plaintext);
        else
          newCard->SetPropertyAsUint32(kPreferMailFormatProperty,
                                       nsIAbPreferMailFormat::unknown);
      }

      else if (colType.EqualsLiteral("mozillaworkstreet2"))
        newCard->SetPropertyAsAString(kWorkAddress2Property, value);

      else if (colType.EqualsLiteral("mozillaworkurl"))
        newCard->SetPropertyAsAString(kWorkWebPageProperty, value);

      break;  // 'm'

    case 'n':
      if (colType.EqualsLiteral("notes"))
        newCard->SetPropertyAsAString(kNotesProperty, value);

      else if (colType.EqualsLiteral("nscpaimscreenname") ||
               colType.EqualsLiteral("nsaimid"))
        newCard->SetPropertyAsAString(kAIMProperty, value);

      break;  // 'n'

    case 'o':
      if (colType.EqualsLiteral("objectclass"))
        break;

      else if (colType.EqualsLiteral("ou") || colType.EqualsLiteral("orgunit"))
        newCard->SetPropertyAsAString(kDepartmentProperty, value);

      else if (colType.EqualsLiteral("o"))  // organization
        newCard->SetPropertyAsAString(kCompanyProperty, value);

      break;  // 'o'

    case 'p':
      if (colType.EqualsLiteral("postalcode")) {
        if (mStoreLocAsHome)
          newCard->SetPropertyAsAString(kHomeZipCodeProperty, value);
        else
          newCard->SetPropertyAsAString(kWorkZipCodeProperty, value);
      }

      else if (colType.EqualsLiteral("postofficebox")) {
        nsAutoCString workAddr1, workAddr2;
        SplitCRLFAddressField(column, workAddr1, workAddr2);
        newCard->SetPropertyAsAString(kWorkAddressProperty,
                                      NS_ConvertUTF8toUTF16(workAddr1));
        newCard->SetPropertyAsAString(kWorkAddress2Property,
                                      NS_ConvertUTF8toUTF16(workAddr2));
      } else if (colType.EqualsLiteral("pager") ||
                 colType.EqualsLiteral("pagerphone"))
        newCard->SetPropertyAsAString(kPagerProperty, value);

      break;  // 'p'

    case 'r':
      if (colType.EqualsLiteral("region")) {
        newCard->SetPropertyAsAString(kWorkStateProperty, value);
      }

      break;  // 'r'

    case 's':
      if (colType.EqualsLiteral("sn") || colType.EqualsLiteral("surname"))
        newCard->SetPropertyAsAString(kLastNameProperty, value);

      else if (colType.EqualsLiteral("street"))
        newCard->SetPropertyAsAString(kWorkAddressProperty, value);

      else if (colType.EqualsLiteral("streetaddress")) {
        nsAutoCString addr1, addr2;
        SplitCRLFAddressField(column, addr1, addr2);
        if (mStoreLocAsHome) {
          newCard->SetPropertyAsAString(kHomeAddressProperty,
                                        NS_ConvertUTF8toUTF16(addr1));
          newCard->SetPropertyAsAString(kHomeAddress2Property,
                                        NS_ConvertUTF8toUTF16(addr2));
        } else {
          newCard->SetPropertyAsAString(kWorkAddressProperty,
                                        NS_ConvertUTF8toUTF16(addr1));
          newCard->SetPropertyAsAString(kWorkAddress2Property,
                                        NS_ConvertUTF8toUTF16(addr2));
        }
      } else if (colType.EqualsLiteral("st")) {
        if (mStoreLocAsHome)
          newCard->SetPropertyAsAString(kHomeStateProperty, value);
        else
          newCard->SetPropertyAsAString(kWorkStateProperty, value);
      }

      break;  // 's'

    case 't':
      if (colType.EqualsLiteral("title"))
        newCard->SetPropertyAsAString(kJobTitleProperty, value);

      else if (colType.EqualsLiteral("telephonenumber")) {
        newCard->SetPropertyAsAString(kWorkPhoneProperty, value);
      }

      break;  // 't'

    case 'w':
      if (colType.EqualsLiteral("workurl"))
        newCard->SetPropertyAsAString(kWorkWebPageProperty, value);

      break;  // 'w'

    case 'x':
      if (colType.EqualsLiteral("xmozillanickname")) {
        newCard->SetPropertyAsAString(kNicknameProperty, value);
      }

      else if (colType.EqualsLiteral("xmozillausehtmlmail")) {
        ToLowerCase(column);
        if (-1 != column.Find("true"))
          newCard->SetPropertyAsUint32(kPreferMailFormatProperty,
                                       nsIAbPreferMailFormat::html);
        else if (-1 != column.Find("false"))
          newCard->SetPropertyAsUint32(kPreferMailFormatProperty,
                                       nsIAbPreferMailFormat::plaintext);
        else
          newCard->SetPropertyAsUint32(kPreferMailFormatProperty,
                                       nsIAbPreferMailFormat::unknown);
      }

      break;  // 'x'

    case 'z':
      if (colType.EqualsLiteral("zip"))  // alias for postalcode
      {
        if (mStoreLocAsHome)
          newCard->SetPropertyAsAString(kHomeZipCodeProperty, value);
        else
          newCard->SetPropertyAsAString(kWorkZipCodeProperty, value);
      }

      break;  // 'z'

    default:
      break;  // default
  }
}

void nsAbLDIFService::ClearLdifRecordBuffer() {
  if (!mLdifLine.IsEmpty()) {
    mLdifLine.Truncate();
    mLFCount = 0;
    mCRCount = 0;
  }
}

// Some common ldif fields, it an ldif file has NONE of these entries
// then it is most likely NOT an ldif file!
static const char* const sLDIFFields[] = {"objectclass", "sn",   "dn",   "cn",
                                          "givenName",   "mail", nullptr};
#define kMaxLDIFLen 14

// Count total number of legal ldif fields and records in the first 100 lines of
// the file and if the average legal ldif field is 3 or higher than it's a valid
// ldif file.
NS_IMETHODIMP nsAbLDIFService::IsLDIFFile(nsIFile* pSrc, bool* _retval) {
  NS_ENSURE_ARG_POINTER(pSrc);
  NS_ENSURE_ARG_POINTER(_retval);

  *_retval = false;

  nsresult rv = NS_OK;

  nsCOMPtr<nsIInputStream> fileStream;
  rv = NS_NewLocalFileInputStream(getter_AddRefs(fileStream), pSrc);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsILineInputStream> lineInputStream(
      do_QueryInterface(fileStream, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  int32_t lineLen = 0;
  int32_t lineCount = 0;
  int32_t ldifFields = 0;  // total number of legal ldif fields.
  char field[kMaxLDIFLen];
  int32_t fLen = 0;
  const char* pChar;
  int32_t recCount = 0;  // total number of records.
  int32_t i;
  bool gotLDIF = false;
  bool more = true;
  nsCString line;

  while (more && NS_SUCCEEDED(rv) && (lineCount < 100)) {
    rv = lineInputStream->ReadLine(line, &more);

    if (NS_SUCCEEDED(rv) && more) {
      pChar = line.get();
      lineLen = line.Length();
      if (!lineLen && gotLDIF) {
        recCount++;
        gotLDIF = false;
      }

      if (lineLen && (*pChar != ' ') && (*pChar != '\t')) {
        fLen = 0;

        while (lineLen && (fLen < (kMaxLDIFLen - 1)) && (*pChar != ':')) {
          field[fLen] = *pChar;
          pChar++;
          fLen++;
          lineLen--;
        }

        field[fLen] = 0;

        if (lineLen && (*pChar == ':') && (fLen < (kMaxLDIFLen - 1))) {
          // see if this is an ldif field (case insensitive)?
          i = 0;
          while (sLDIFFields[i]) {
            if (!PL_strcasecmp(sLDIFFields[i], field)) {
              ldifFields++;
              gotLDIF = true;
              break;
            }
            i++;
          }
        }
      }
    }
    lineCount++;
  }

  // If we just saw ldif address, increment recCount.
  if (gotLDIF) recCount++;

  rv = fileStream->Close();

  if (recCount > 1) ldifFields /= recCount;

  // If the average field number >= 3 then it's a good ldif file.
  if (ldifFields >= 3) {
    *_retval = true;
  }

  return rv;
}

void nsAbLDIFService::SplitCRLFAddressField(nsCString& inputAddress,
                                            nsCString& outputLine1,
                                            nsCString& outputLine2) const {
  int32_t crlfPos = inputAddress.Find("\r\n");
  if (crlfPos != -1) {
    outputLine1 = Substring(inputAddress, 0, crlfPos);
    outputLine2 = Substring(inputAddress, crlfPos + 2);
  } else
    outputLine1.Assign(inputAddress);
}
