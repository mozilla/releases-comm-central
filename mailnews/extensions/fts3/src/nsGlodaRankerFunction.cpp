/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsGlodaRankerFunction.h"
#include "mozIStorageValueArray.h"

#include "sqlite3.h"

#include "nsCOMPtr.h"
#include "nsVariant.h"
#include "nsComponentManagerUtils.h"

#ifndef SQLITE_VERSION_NUMBER
#  error "We need SQLITE_VERSION_NUMBER defined!"
#endif

NS_IMPL_ISUPPORTS(nsGlodaRankerFunction, mozIStorageFunction)

nsGlodaRankerFunction::nsGlodaRankerFunction() {}

nsGlodaRankerFunction::~nsGlodaRankerFunction() {}

static uint32_t COLUMN_SATURATION[] = {10, 1, 1, 1, 1};

/**
 * Our ranking function basically just multiplies the weight of the column
 * against the number of (saturating) matches.
 *
 * The original code is a SQLite example ranking function, although somewhat
 * rather modified at this point.  All SQLite code is public domain, so we are
 * subsuming it to MPL1.1/LGPL2/GPL2.
 */
NS_IMETHODIMP
nsGlodaRankerFunction::OnFunctionCall(mozIStorageValueArray* aArguments,
                                      nsIVariant** _result) {
  // all argument names are maintained from the original SQLite code.
  uint32_t nVal;
  nsresult rv = aArguments->GetNumEntries(&nVal);
  NS_ENSURE_SUCCESS(rv, rv);

  /* Check that the number of arguments passed to this function is correct.
   * If not, return an error. Set aArgsData to point to the array
   * of unsigned integer values returned by FTS3 function. Set nPhrase
   * to contain the number of reportable phrases in the users full-text
   * query, and nCol to the number of columns in the table.
   */
  if (nVal < 1) return NS_ERROR_INVALID_ARG;

  uint32_t lenArgsData;
  uint32_t* aArgsData = (uint32_t*)aArguments->AsSharedBlob(0, &lenArgsData);

  uint32_t nPhrase = aArgsData[0];
  uint32_t nCol = aArgsData[1];
  if (nVal != (1 + nCol)) return NS_ERROR_INVALID_ARG;

  double score = 0.0;

  // SQLite 3.6.22 has a different matchinfo layout than SQLite 3.6.23+
#if SQLITE_VERSION_NUMBER <= 3006022
  /* Iterate through each phrase in the users query. */
  for (uint32_t iPhrase = 0; iPhrase < nPhrase; iPhrase++) {
    // in SQ
    for (uint32_t iCol = 0; iCol < nCol; iCol++) {
      uint32_t nHitCount = aArgsData[2 + (iPhrase + 1) * nCol + iCol];
      double weight = aArguments->AsDouble(iCol + 1);
      if (nHitCount > 0) {
        score += (nHitCount > COLUMN_SATURATION[iCol])
                     ? (COLUMN_SATURATION[iCol] * weight)
                     : (nHitCount * weight);
      }
    }
  }
#else
  /* Iterate through each phrase in the users query. */
  for (uint32_t iPhrase = 0; iPhrase < nPhrase; iPhrase++) {
    /* Now iterate through each column in the users query. For each column,
    ** increment the relevancy score by:
    **
    **   (<hit count> / <global hit count>) * <column weight>
    **
    ** aPhraseinfo[] points to the start of the data for phrase iPhrase. So
    ** the hit count and global hit counts for each column are found in
    ** aPhraseinfo[iCol*3] and aPhraseinfo[iCol*3+1], respectively.
    */
    uint32_t* aPhraseinfo = &aArgsData[2 + iPhrase * nCol * 3];
    for (uint32_t iCol = 0; iCol < nCol; iCol++) {
      uint32_t nHitCount = aPhraseinfo[3 * iCol];
      double weight = aArguments->AsDouble(iCol + 1);
      if (nHitCount > 0) {
        score += (nHitCount > COLUMN_SATURATION[iCol])
                     ? (COLUMN_SATURATION[iCol] * weight)
                     : (nHitCount * weight);
      }
    }
  }
#endif

  nsCOMPtr<nsIWritableVariant> result = new nsVariant();

  rv = result->SetAsDouble(score);
  NS_ENSURE_SUCCESS(rv, rv);

  result.forget(_result);
  return NS_OK;
}
