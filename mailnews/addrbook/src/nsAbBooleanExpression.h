/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsAbBooleanExpression_h__
#define nsAbBooleanExpression_h__

#include "nsIAbBooleanExpression.h"
#include "nsCOMPtr.h"
#include "nsStringGlue.h"
#include "nsIArray.h"

class nsAbBooleanConditionString : public nsIAbBooleanConditionString
{
public:
    NS_DECL_THREADSAFE_ISUPPORTS
    NS_DECL_NSIABBOOLEANCONDITIONSTRING

    nsAbBooleanConditionString();

protected:
    virtual ~nsAbBooleanConditionString();
    nsAbBooleanConditionType mCondition;
    nsCString mName;
    nsString mValue;
};

class nsAbBooleanExpression: public nsIAbBooleanExpression
{
public:
    NS_DECL_THREADSAFE_ISUPPORTS
    NS_DECL_NSIABBOOLEANEXPRESSION

    nsAbBooleanExpression();

protected:
    virtual ~nsAbBooleanExpression();
    nsAbBooleanOperationType mOperation;
    nsCOMPtr<nsIArray> mExpressions;
};

#endif
