/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "ldap.h"
#include "nsLDAPService.h"
#include "nsIServiceManager.h"
#include "nsIConsoleService.h"
#include "nsMemory.h"
#include "nsILDAPErrors.h"
#include "mozilla/Logging.h"

using namespace mozilla;

LazyLogModule gLDAPLogModule("LDAP");

NS_IMPL_ISUPPORTS(nsLDAPService, nsILDAPService)

// constructor
//
nsLDAPService::nsLDAPService() {}

// destructor
//
nsLDAPService::~nsLDAPService() {}

// Initializer
//
nsresult nsLDAPService::Init() { return NS_OK; }

/* AString createFilter (in unsigned long aMaxSize, in AString aPattern, in
 * AString aPrefix, in AString aSuffix, in AString aAttr, in AString aValue); */
NS_IMETHODIMP nsLDAPService::CreateFilter(
    uint32_t aMaxSize, const nsACString& aPattern, const nsACString& aPrefix,
    const nsACString& aSuffix, const nsACString& aAttr,
    const nsACString& aValue, nsACString& _retval) {
  if (!aMaxSize) {
    return NS_ERROR_INVALID_ARG;
  }

  // figure out how big of an array we're going to need for the tokens,
  // including a trailing NULL, and allocate space for it.
  //
  const char* iter = aValue.BeginReading();
  const char* iterEnd = aValue.EndReading();
  uint32_t numTokens = CountTokens(iter, iterEnd);
  char** valueWords;
  valueWords =
      static_cast<char**>(moz_xmalloc((numTokens + 1) * sizeof(char*)));
  if (!valueWords) {
    return NS_ERROR_OUT_OF_MEMORY;
  }

  // build the array of values
  //
  uint32_t curToken = 0;
  while (iter != iterEnd && curToken < numTokens) {
    valueWords[curToken] = NextToken(&iter, &iterEnd);
    if (!valueWords[curToken]) {
      NS_FREE_XPCOM_ALLOCATED_POINTER_ARRAY(curToken, valueWords);
      return NS_ERROR_OUT_OF_MEMORY;
    }
    curToken++;
  }
  valueWords[numTokens] = 0;  // end of array signal to LDAP C SDK

  // make buffer to be used for construction
  //
  char* buffer = static_cast<char*>(moz_xmalloc(aMaxSize * sizeof(char)));
  if (!buffer) {
    NS_FREE_XPCOM_ALLOCATED_POINTER_ARRAY(numTokens, valueWords);
    return NS_ERROR_OUT_OF_MEMORY;
  }

  // create the filter itself
  //
  nsresult rv;
  int result = ldap_create_filter(
      buffer, aMaxSize, const_cast<char*>(PromiseFlatCString(aPattern).get()),
      const_cast<char*>(PromiseFlatCString(aPrefix).get()),
      const_cast<char*>(PromiseFlatCString(aSuffix).get()),
      const_cast<char*>(PromiseFlatCString(aAttr).get()),
      const_cast<char*>(PromiseFlatCString(aValue).get()), valueWords);
  switch (result) {
    case LDAP_SUCCESS:
      rv = NS_OK;
      break;

    case LDAP_SIZELIMIT_EXCEEDED:
      MOZ_LOG(gLDAPLogModule, mozilla::LogLevel::Debug,
              ("nsLDAPService::CreateFilter(): "
               "filter longer than max size of %d generated",
               aMaxSize));
      rv = NS_ERROR_NOT_AVAILABLE;
      break;

    case LDAP_PARAM_ERROR:
      rv = NS_ERROR_INVALID_ARG;
      break;

    default:
      NS_ERROR(
          "nsLDAPService::CreateFilter(): ldap_create_filter() "
          "returned unexpected error");
      rv = NS_ERROR_UNEXPECTED;
      break;
  }

  _retval.Assign(buffer);

  // done with the array and the buffer
  //
  NS_FREE_XPCOM_ALLOCATED_POINTER_ARRAY(numTokens, valueWords);
  free(buffer);

  return rv;
}

// Count the number of space-separated tokens between aIter and aIterEnd
//
uint32_t nsLDAPService::CountTokens(const char* aIter, const char* aIterEnd) {
  uint32_t count(0);

  // keep iterating through the string until we hit the end
  //
  while (aIter != aIterEnd) {
    // move past any leading spaces
    //
    while (aIter != aIterEnd && ldap_utf8isspace(const_cast<char*>(aIter))) {
      ++aIter;
    }

    // move past all chars in this token
    //
    while (aIter != aIterEnd) {
      if (ldap_utf8isspace(const_cast<char*>(aIter))) {
        ++count;  // token finished; increment the count
        ++aIter;  // move past the space
        break;
      }

      ++aIter;  // move to next char

      // if we've hit the end of this token and the end of this
      // iterator simultaneous, be sure to bump the count, since we're
      // never going to hit the IsAsciiSpace where it's normally done.
      //
      if (aIter == aIterEnd) {
        ++count;
      }
    }
  }

  return count;
}

// return the next token in this iterator
//
char* nsLDAPService::NextToken(const char** aIter, const char** aIterEnd) {
  // move past any leading whitespace
  //
  while (*aIter != *aIterEnd && ldap_utf8isspace(const_cast<char*>(*aIter))) {
    ++(*aIter);
  }

  const char* start = *aIter;

  // copy the token into our local variable
  //
  while (*aIter != *aIterEnd && !ldap_utf8isspace(const_cast<char*>(*aIter))) {
    ++(*aIter);
  }

  return ToNewCString(Substring(start, *aIter));
}
