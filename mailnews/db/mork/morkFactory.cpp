/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-  */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef _MDB_
#  include "mdb.h"
#endif

#ifndef _MORK_
#  include "mork.h"
#endif

#ifndef _MORKNODE_
#  include "morkNode.h"
#endif

#ifndef _MORKOBJECT_
#  include "morkObject.h"
#endif

#ifndef _MORKENV_
#  include "morkEnv.h"
#endif

#ifndef _MORKFACTORY_
#  include "morkFactory.h"
#endif

#ifndef _ORKINHEAP_
#  include "orkinHeap.h"
#endif

#ifndef _MORKFILE_
#  include "morkFile.h"
#endif

#ifndef _MORKSTORE_
#  include "morkStore.h"
#endif

#ifndef _MORKTHUMB_
#  include "morkThumb.h"
#endif

#ifndef _MORKWRITER_
#  include "morkWriter.h"
#endif
#include "prmem.h"

// 456789_123456789_123456789_123456789_123456789_123456789_123456789_123456789

// ````` ````` ````` ````` `````
// { ===== begin morkNode interface =====

/*public virtual*/ void morkFactory::CloseMorkNode(
    morkEnv* ev) /*i*/  // CloseFactory() only if open
{
  if (this->IsOpenNode()) {
    this->MarkClosing();
    this->CloseFactory(ev);
    this->MarkShut();
  }
}

/*public virtual*/
morkFactory::~morkFactory() /*i*/  // assert CloseFactory() executed earlier
{
  CloseFactory(&mFactory_Env);
  MORK_ASSERT(mFactory_Env.IsShutNode());
  MORK_ASSERT(this->IsShutNode());
}

/*public non-poly*/
morkFactory::morkFactory()  // uses orkinHeap
    : morkObject(morkUsage::kGlobal, (nsIMdbHeap*)0, morkColor_kNone),
      mFactory_Env(morkUsage::kMember, (nsIMdbHeap*)0, this, new orkinHeap()),
      mFactory_Heap() {
  if (mFactory_Env.Good()) {
    mNode_Derived = morkDerived_kFactory;
    mNode_Refs += morkFactory_kWeakRefCountBonus;
  }
}

/*public non-poly*/
morkFactory::morkFactory(nsIMdbHeap* ioHeap)
    : morkObject(morkUsage::kHeap, ioHeap, morkColor_kNone),
      mFactory_Env(morkUsage::kMember, (nsIMdbHeap*)0, this, ioHeap),
      mFactory_Heap() {
  if (mFactory_Env.Good()) {
    mNode_Derived = morkDerived_kFactory;
    mNode_Refs += morkFactory_kWeakRefCountBonus;
  }
}

/*public non-poly*/
morkFactory::morkFactory(morkEnv* ev, /*i*/
                         const morkUsage& inUsage, nsIMdbHeap* ioHeap)
    : morkObject(ev, inUsage, ioHeap, morkColor_kNone, (morkHandle*)0),
      mFactory_Env(morkUsage::kMember, (nsIMdbHeap*)0, this, ioHeap),
      mFactory_Heap() {
  if (ev->Good()) {
    mNode_Derived = morkDerived_kFactory;
    mNode_Refs += morkFactory_kWeakRefCountBonus;
  }
}

NS_IMPL_ISUPPORTS_INHERITED(morkFactory, morkObject, nsIMdbFactory)

extern "C" nsIMdbFactory* MakeMdbFactory() {
  return new morkFactory(new orkinHeap());
}

/*public non-poly*/ void morkFactory::CloseFactory(
    morkEnv* ev) /*i*/  // called by CloseMorkNode();
{
  if (this->IsNode()) {
    mFactory_Env.CloseMorkNode(ev);
    this->CloseObject(ev);
    this->MarkShut();
  } else
    this->NonNodeError(ev);
}

// } ===== end morkNode methods =====
// ````` ````` ````` ````` `````

morkEnv* morkFactory::GetInternalFactoryEnv(nsresult* outErr) {
  morkEnv* outEnv = 0;
  if (IsNode() && IsOpenNode() && IsFactory()) {
    morkEnv* fenv = &mFactory_Env;
    if (fenv && fenv->IsNode() && fenv->IsOpenNode() && fenv->IsEnv()) {
      fenv->ClearMorkErrorsAndWarnings();  // drop any earlier errors
      outEnv = fenv;
    } else
      *outErr = morkEnv_kBadFactoryEnvError;
  } else
    *outErr = morkEnv_kBadFactoryError;

  return outEnv;
}

void morkFactory::NonFactoryTypeError(morkEnv* ev) {
  ev->NewError("non morkFactory");
}

NS_IMETHODIMP
morkFactory::OpenOldFile(nsIMdbEnv* mev, nsIMdbHeap* ioHeap,
                         const PathChar* inFilePath, mork_bool inFrozen,
                         nsIMdbFile** acqFile)
// Choose some subclass of nsIMdbFile to instantiate, in order to read
// (and write if not frozen) the file known by inFilePath.  The file
// returned should be open and ready for use, and presumably positioned
// at the first byte position of the file.  The exact manner in which
// files must be opened is considered a subclass specific detail, and
// other portions or Mork source code don't want to know how it's done.
{
  nsresult outErr = NS_OK;
  morkEnv* ev = morkEnv::FromMdbEnv(mev);
  morkFile* file = nullptr;
  if (ev) {
    if (!ioHeap) ioHeap = &mFactory_Heap;

    file = morkFile::OpenOldFile(ev, ioHeap, inFilePath, inFrozen);
    NS_IF_ADDREF(file);

    outErr = ev->AsErr();
  }
  if (acqFile) *acqFile = file;

  return outErr;
}

NS_IMETHODIMP
morkFactory::CreateNewFile(nsIMdbEnv* mev, nsIMdbHeap* ioHeap,
                           const PathChar* inFilePath, nsIMdbFile** acqFile)
// Choose some subclass of nsIMdbFile to instantiate, in order to read
// (and write if not frozen) the file known by inFilePath.  The file
// returned should be created and ready for use, and presumably positioned
// at the first byte position of the file.  The exact manner in which
// files must be opened is considered a subclass specific detail, and
// other portions or Mork source code don't want to know how it's done.
{
  nsresult outErr = NS_OK;
  morkEnv* ev = morkEnv::FromMdbEnv(mev);
  morkFile* file = nullptr;
  if (ev) {
    if (!ioHeap) ioHeap = &mFactory_Heap;

    file = morkFile::CreateNewFile(ev, ioHeap, inFilePath);
    if (file) NS_ADDREF(file);

    outErr = ev->AsErr();
  }
  if (acqFile) *acqFile = file;

  return outErr;
}
// } ----- end file methods -----

// { ----- begin env methods -----
NS_IMETHODIMP
morkFactory::MakeEnv(nsIMdbHeap* ioHeap, nsIMdbEnv** acqEnv)
// ioHeap can be nil, causing a MakeHeap() style heap instance to be used
{
  nsresult outErr = NS_OK;
  nsIMdbEnv* outEnv = 0;
  mork_bool ownsHeap = (ioHeap == 0);
  if (!ioHeap) ioHeap = new orkinHeap();

  if (acqEnv && ioHeap) {
    morkEnv* fenv = this->GetInternalFactoryEnv(&outErr);
    if (fenv) {
      morkEnv* newEnv =
          new (*ioHeap, fenv) morkEnv(morkUsage::kHeap, ioHeap, this, ioHeap);

      if (newEnv) {
        newEnv->mEnv_OwnsHeap = ownsHeap;
        newEnv->mNode_Refs += morkEnv_kWeakRefCountEnvBonus;
        NS_ADDREF(newEnv);
        newEnv->mEnv_SelfAsMdbEnv = newEnv;
        outEnv = newEnv;
      } else
        outErr = morkEnv_kOutOfMemoryError;
    }

    *acqEnv = outEnv;
  } else
    outErr = morkEnv_kNilPointerError;

  return outErr;
}
// } ----- end env methods -----

// { ----- begin heap methods -----
NS_IMETHODIMP
morkFactory::MakeHeap(nsIMdbEnv* mev, nsIMdbHeap** acqHeap) {
  nsresult outErr = NS_OK;
  nsIMdbHeap* outHeap = 0;
  morkEnv* ev = morkEnv::FromMdbEnv(mev);
  if (ev) {
    outHeap = new orkinHeap();
    if (!outHeap) ev->OutOfMemoryError();
  }
  MORK_ASSERT(acqHeap);
  if (acqHeap)
    *acqHeap = outHeap;
  else
    PR_Free(outHeap);
  return outErr;
}
// } ----- end heap methods -----

// { ----- begin row methods -----
NS_IMETHODIMP
morkFactory::MakeRow(nsIMdbEnv* mev, nsIMdbHeap* ioHeap, nsIMdbRow** acqRow) {
  NS_ASSERTION(false, "not implemented");
  return NS_ERROR_NOT_IMPLEMENTED;
}
// ioHeap can be nil, causing the heap associated with ev to be used
// } ----- end row methods -----

// { ----- begin port methods -----
NS_IMETHODIMP
morkFactory::CanOpenFilePort(
    nsIMdbEnv* mev,  // context
    // const char* inFilePath, // the file to investigate
    // const mdbYarn* inFirst512Bytes,
    nsIMdbFile* ioFile,    // db abstract file interface
    mdb_bool* outCanOpen,  // whether OpenFilePort() might succeed
    mdbYarn* outFormatVersion) {
  nsresult outErr = NS_OK;
  if (outFormatVersion) {
    outFormatVersion->mYarn_Fill = 0;
  }
  mdb_bool canOpenAsPort = morkBool_kFalse;
  morkEnv* ev = morkEnv::FromMdbEnv(mev);
  if (ev) {
    if (ioFile && outCanOpen) {
      canOpenAsPort = this->CanOpenMorkTextFile(ev, ioFile);
    } else
      ev->NilPointerError();

    outErr = ev->AsErr();
  }

  if (outCanOpen) *outCanOpen = canOpenAsPort;

  return outErr;
}

NS_IMETHODIMP
morkFactory::OpenFilePort(
    nsIMdbEnv* mev,      // context
    nsIMdbHeap* ioHeap,  // can be nil to cause ev's heap attribute to be used
    // const char* inFilePath, // the file to open for readonly import
    nsIMdbFile* ioFile,                 // db abstract file interface
    const mdbOpenPolicy* inOpenPolicy,  // runtime policies for using db
    nsIMdbThumb** acqThumb) {
  NS_ASSERTION(false, "this doesn't look implemented");
  MORK_USED_1(ioHeap);
  nsresult outErr = NS_OK;
  nsIMdbThumb* outThumb = 0;
  morkEnv* ev = morkEnv::FromMdbEnv(mev);
  if (ev) {
    if (ioFile && inOpenPolicy && acqThumb) {
    } else
      ev->NilPointerError();

    outErr = ev->AsErr();
  }
  if (acqThumb) *acqThumb = outThumb;
  return outErr;
}
// Call nsIMdbThumb::DoMore() until done, or until the thumb is broken, and
// then call nsIMdbFactory::ThumbToOpenPort() to get the port instance.

NS_IMETHODIMP
morkFactory::ThumbToOpenPort(  // redeeming a completed thumb from
                               // OpenFilePort()
    nsIMdbEnv* mev,            // context
    nsIMdbThumb* ioThumb,      // thumb from OpenFilePort() with done status
    nsIMdbPort** acqPort) {
  nsresult outErr = NS_OK;
  nsIMdbPort* outPort = 0;
  morkEnv* ev = morkEnv::FromMdbEnv(mev);
  if (ev) {
    if (ioThumb && acqPort) {
      morkThumb* thumb = (morkThumb*)ioThumb;
      morkStore* store = thumb->ThumbToOpenStore(ev);
      if (store) {
        store->mStore_CanAutoAssignAtomIdentity = morkBool_kTrue;
        store->mStore_CanDirty = morkBool_kTrue;
        store->SetStoreAndAllSpacesCanDirty(ev, morkBool_kTrue);

        NS_ADDREF(store);
        outPort = store;
      }
    } else
      ev->NilPointerError();

    outErr = ev->AsErr();
  }
  if (acqPort) *acqPort = outPort;
  return outErr;
}
// } ----- end port methods -----

mork_bool morkFactory::CanOpenMorkTextFile(morkEnv* ev,
                                           // const mdbYarn* inFirst512Bytes,
                                           nsIMdbFile* ioFile) {
  MORK_USED_1(ev);
  mork_bool outBool = morkBool_kFalse;
  mork_size headSize = strlen(morkWriter_kFileHeader);

  char localBuf[256 + 4];  // for extra for sloppy safety
  mdbYarn localYarn;
  mdbYarn* y = &localYarn;
  y->mYarn_Buf = localBuf;  // space to hold content
  y->mYarn_Fill = 0;        // no logical content yet
  y->mYarn_Size = 256;      // physical capacity is 256 bytes
  y->mYarn_More = 0;
  y->mYarn_Form = 0;
  y->mYarn_Grow = 0;

  if (ioFile) {
    nsIMdbEnv* menv = ev->AsMdbEnv();
    mdb_size actualSize = 0;
    ioFile->Get(menv, y->mYarn_Buf, y->mYarn_Size, /*pos*/ 0, &actualSize);
    y->mYarn_Fill = actualSize;

    if (y->mYarn_Buf && actualSize >= headSize && ev->Good()) {
      mork_u1* buf = (mork_u1*)y->mYarn_Buf;
      outBool = (MORK_MEMCMP(morkWriter_kFileHeader, buf, headSize) == 0);
    }
  } else
    ev->NilPointerError();

  return outBool;
}

// { ----- begin store methods -----
NS_IMETHODIMP
morkFactory::CanOpenFileStore(
    nsIMdbEnv* mev,  // context
    // const char* inFilePath, // the file to investigate
    // const mdbYarn* inFirst512Bytes,
    nsIMdbFile* ioFile,           // db abstract file interface
    mdb_bool* outCanOpenAsStore,  // whether OpenFileStore() might succeed
    mdb_bool* outCanOpenAsPort,   // whether OpenFilePort() might succeed
    mdbYarn* outFormatVersion) {
  mdb_bool canOpenAsStore = morkBool_kFalse;
  mdb_bool canOpenAsPort = morkBool_kFalse;
  if (outFormatVersion) {
    outFormatVersion->mYarn_Fill = 0;
  }
  nsresult outErr = NS_OK;
  morkEnv* ev = morkEnv::FromMdbEnv(mev);
  if (ev) {
    if (ioFile && outCanOpenAsStore) {
      // right now always say true; later we should look for magic patterns
      canOpenAsStore = this->CanOpenMorkTextFile(ev, ioFile);
      canOpenAsPort = canOpenAsStore;
    } else
      ev->NilPointerError();

    outErr = ev->AsErr();
  }
  if (outCanOpenAsStore) *outCanOpenAsStore = canOpenAsStore;

  if (outCanOpenAsPort) *outCanOpenAsPort = canOpenAsPort;

  return outErr;
}

NS_IMETHODIMP
morkFactory::OpenFileStore(  // open an existing database
    nsIMdbEnv* mev,          // context
    nsIMdbHeap* ioHeap,  // can be nil to cause ev's heap attribute to be used
    // const char* inFilePath, // the file to open for general db usage
    nsIMdbFile* ioFile,                 // db abstract file interface
    const mdbOpenPolicy* inOpenPolicy,  // runtime policies for using db
    nsIMdbThumb** acqThumb) {
  nsresult outErr = NS_OK;
  nsIMdbThumb* outThumb = 0;
  morkEnv* ev = morkEnv::FromMdbEnv(mev);
  if (ev) {
    if (!ioHeap)  // need to use heap from env?
      ioHeap = ev->mEnv_Heap;

    if (ioFile && inOpenPolicy && acqThumb) {
      morkStore* store = new (*ioHeap, ev)
          morkStore(ev, morkUsage::kHeap, ioHeap, this, ioHeap);

      if (store) {
        mork_bool frozen = morkBool_kFalse;  // open store mutable access
        if (store->OpenStoreFile(ev, frozen, ioFile, inOpenPolicy)) {
          morkThumb* thumb = morkThumb::Make_OpenFileStore(ev, ioHeap, store);
          if (thumb) {
            outThumb = thumb;
            thumb->AddRef();
          }
        }
        //        store->CutStrongRef(mev); // always cut ref (handle has its
        //        own ref)
      }
    } else
      ev->NilPointerError();

    outErr = ev->AsErr();
  }
  if (acqThumb) *acqThumb = outThumb;
  return outErr;
}
// Call nsIMdbThumb::DoMore() until done, or until the thumb is broken, and
// then call nsIMdbFactory::ThumbToOpenStore() to get the store instance.

NS_IMETHODIMP
morkFactory::ThumbToOpenStore(  // redeem completed thumb from OpenFileStore()
    nsIMdbEnv* mev,             // context
    nsIMdbThumb* ioThumb,       // thumb from OpenFileStore() with done status
    nsIMdbStore** acqStore) {
  nsresult outErr = NS_OK;
  nsIMdbStore* outStore = 0;
  morkEnv* ev = morkEnv::FromMdbEnv(mev);
  if (ev) {
    if (ioThumb && acqStore) {
      morkThumb* thumb = (morkThumb*)ioThumb;
      morkStore* store = thumb->ThumbToOpenStore(ev);
      if (store) {
        store->mStore_CanAutoAssignAtomIdentity = morkBool_kTrue;
        store->mStore_CanDirty = morkBool_kTrue;
        store->SetStoreAndAllSpacesCanDirty(ev, morkBool_kTrue);

        outStore = store;
        NS_ADDREF(store);
      }
    } else
      ev->NilPointerError();

    outErr = ev->AsErr();
  }
  if (acqStore) *acqStore = outStore;
  return outErr;
}

NS_IMETHODIMP
morkFactory::CreateNewFileStore(  // create a new db with minimal content
    nsIMdbEnv* mev,               // context
    nsIMdbHeap* ioHeap,  // can be nil to cause ev's heap attribute to be used
    // const char* inFilePath, // name of file which should not yet exist
    nsIMdbFile* ioFile,                 // db abstract file interface
    const mdbOpenPolicy* inOpenPolicy,  // runtime policies for using db
    nsIMdbStore** acqStore) {
  nsresult outErr = NS_OK;
  nsIMdbStore* outStore = 0;
  morkEnv* ev = morkEnv::FromMdbEnv(mev);
  if (ev) {
    if (!ioHeap)  // need to use heap from env?
      ioHeap = ev->mEnv_Heap;

    if (ioFile && inOpenPolicy && acqStore && ioHeap) {
      morkStore* store = new (*ioHeap, ev)
          morkStore(ev, morkUsage::kHeap, ioHeap, this, ioHeap);

      if (store) {
        store->mStore_CanAutoAssignAtomIdentity = morkBool_kTrue;
        store->mStore_CanDirty = morkBool_kTrue;
        store->SetStoreAndAllSpacesCanDirty(ev, morkBool_kTrue);

        if (store->CreateStoreFile(ev, ioFile, inOpenPolicy)) outStore = store;
        NS_ADDREF(store);
      }
    } else
      ev->NilPointerError();

    outErr = ev->AsErr();
  }
  if (acqStore) *acqStore = outStore;
  return outErr;
}
// } ----- end store methods -----

// } ===== end nsIMdbFactory methods =====

// 456789_123456789_123456789_123456789_123456789_123456789_123456789_123456789
