/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-  */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_DB_MORK_MORKCURSOR_H_
#define COMM_MAILNEWS_DB_MORK_MORKCURSOR_H_

#ifndef _MORK_
#  include "mork.h"
#endif

#ifndef _MORKOBJECT_
#  include "morkObject.h"
#endif

// 456789_123456789_123456789_123456789_123456789_123456789_123456789_123456789

#define morkDerived_kCursor /*i*/ 0x4375 /* ascii 'Cu' */

class morkCursor : public morkObject,
                   public nsIMdbCursor {  // collection iterator

  // public: // slots inherited from morkObject (meant to inform only)
  // nsIMdbHeap*     mNode_Heap;
  // mork_able    mNode_Mutable; // can this node be modified?
  // mork_load    mNode_Load;    // is this node clean or dirty?
  // mork_base    mNode_Base;    // must equal morkBase_kNode
  // mork_derived mNode_Derived; // depends on specific node subclass
  // mork_access  mNode_Access;  // kOpen, kClosing, kShut, or kDead
  // mork_usage   mNode_Usage;   // kHeap, kStack, kMember, kGlobal, kNone
  // mork_uses    mNode_Uses;    // refcount for strong refs
  // mork_refs    mNode_Refs;    // refcount for strong refs + weak refs

  // mork_color   mBead_Color;   // ID for this bead
  // morkHandle*  mObject_Handle;  // weak ref to handle for this object

 public:  // state is public because the entire Mork system is private
  NS_DECL_ISUPPORTS_INHERITED

  // { ----- begin attribute methods -----
  NS_IMETHOD IsFrozenMdbObject(nsIMdbEnv* ev, mdb_bool* outIsReadonly) override;
  // same as nsIMdbPort::GetIsPortReadonly() when this object is inside a port.
  // } ----- end attribute methods -----

  // { ----- begin ref counting for well-behaved cyclic graphs -----
  NS_IMETHOD GetWeakRefCount(nsIMdbEnv* ev,  // weak refs
                             mdb_count* outCount) override;
  NS_IMETHOD GetStrongRefCount(nsIMdbEnv* ev,  // strong refs
                               mdb_count* outCount) override;

  NS_IMETHOD AddWeakRef(nsIMdbEnv* ev) override;
#ifndef _MSC_VER
  // The first declaration of AddStrongRef is to suppress
  // -Werror,-Woverloaded-virtual.
  NS_IMETHOD_(mork_uses) AddStrongRef(morkEnv* ev) override;
#endif
  NS_IMETHOD_(mork_uses) AddStrongRef(nsIMdbEnv* ev) override;

  NS_IMETHOD CutWeakRef(nsIMdbEnv* ev) override;
#ifndef _MSC_VER
  // The first declaration of CutStrongRef is to suppress
  // -Werror,-Woverloaded-virtual.
  NS_IMETHOD_(mork_uses) CutStrongRef(morkEnv* ev) override;
#endif
  NS_IMETHOD CutStrongRef(nsIMdbEnv* ev) override;

  NS_IMETHOD CloseMdbObject(
      nsIMdbEnv* ev) override;  // called at strong refs zero
  NS_IMETHOD IsOpenMdbObject(nsIMdbEnv* ev, mdb_bool* outOpen) override;
  // } ----- end ref counting -----

  // } ===== end nsIMdbObject methods =====

  // { ===== begin nsIMdbCursor methods =====

  // { ----- begin attribute methods -----
  NS_IMETHOD GetCount(nsIMdbEnv* ev, mdb_count* outCount) override;  // readonly
  NS_IMETHOD GetSeed(nsIMdbEnv* ev, mdb_seed* outSeed) override;     // readonly

  NS_IMETHOD SetPos(nsIMdbEnv* ev, mdb_pos inPos) override;  // mutable
  NS_IMETHOD GetPos(nsIMdbEnv* ev, mdb_pos* outPos) override;

  NS_IMETHOD SetDoFailOnSeedOutOfSync(nsIMdbEnv* ev, mdb_bool inFail) override;
  NS_IMETHOD GetDoFailOnSeedOutOfSync(nsIMdbEnv* ev,
                                      mdb_bool* outFail) override;
  // } ----- end attribute methods -----

  // } ===== end nsIMdbCursor methods =====

  // } ----- end attribute methods -----

  mork_seed mCursor_Seed;
  mork_pos mCursor_Pos;
  mork_bool mCursor_DoFailOnSeedOutOfSync;
  mork_u1 mCursor_Pad[3];  // explicitly pad to u4 alignment

  // { ===== begin morkNode interface =====
 public:  // morkNode virtual methods
  virtual void CloseMorkNode(
      morkEnv* ev) override;  // CloseCursor() only if open

 public:  // morkCursor construction & destruction
  morkCursor(morkEnv* ev, const morkUsage& inUsage, nsIMdbHeap* ioHeap);
  void CloseCursor(morkEnv* ev);  // called by CloseMorkNode();

 protected:
  virtual ~morkCursor();  // assert that CloseCursor() executed earlier

 private:  // copying is not allowed
  morkCursor(const morkCursor& other);
  morkCursor& operator=(const morkCursor& other);

 public:  // dynamic type identification
  mork_bool IsCursor() const {
    return IsNode() && mNode_Derived == morkDerived_kCursor;
  }
  // } ===== end morkNode methods =====

 public:  // other cursor methods
 public:  // typesafe refcounting inlines calling inherited morkNode methods
  static void SlotWeakCursor(morkCursor* me, morkEnv* ev, morkCursor** ioSlot) {
    morkNode::SlotWeakNode((morkNode*)me, ev, (morkNode**)ioSlot);
  }

  static void SlotStrongCursor(morkCursor* me, morkEnv* ev,
                               morkCursor** ioSlot) {
    morkNode::SlotStrongNode((morkNode*)me, ev, (morkNode**)ioSlot);
  }
};

// 456789_123456789_123456789_123456789_123456789_123456789_123456789_123456789

#endif  // COMM_MAILNEWS_DB_MORK_MORKCURSOR_H_
