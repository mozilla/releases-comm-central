use crate::{local_prelude::*, util};

#[cfg_attr(feature = "serde", derive(serde::Deserialize, serde::Serialize))]
#[cfg_attr(
    feature = "borsh",
    derive(borsh::BorshDeserialize, borsh::BorshSerialize)
)]
#[cfg_attr(
    feature = "miniserde",
    derive(miniserde::Deserialize, miniserde::Serialize)
)]
pub struct BitSet<B: BitBlock = u32> {
    pub(crate) bit_vec: BitVec<B>,
}

impl<B: BitBlock> Clone for BitSet<B> {
    fn clone(&self) -> Self {
        BitSet {
            bit_vec: self.bit_vec.clone(),
        }
    }

    fn clone_from(&mut self, other: &Self) {
        self.bit_vec.clone_from(&other.bit_vec);
    }
}

impl<B: BitBlock> Default for BitSet<B> {
    #[inline]
    fn default() -> Self {
        BitSet {
            bit_vec: Default::default(),
        }
    }
}

impl<B: BitBlock> FromIterator<usize> for BitSet<B> {
    fn from_iter<I: IntoIterator<Item = usize>>(iter: I) -> Self {
        let mut ret = Self::default();
        ret.extend(iter);
        ret
    }
}

impl<B: BitBlock> Extend<usize> for BitSet<B> {
    #[inline]
    fn extend<I: IntoIterator<Item = usize>>(&mut self, iter: I) {
        for i in iter {
            self.insert(i);
        }
    }
}

impl<B: BitBlock> PartialOrd for BitSet<B> {
    #[inline]
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl<B: BitBlock> Ord for BitSet<B> {
    #[inline]
    fn cmp(&self, other: &Self) -> Ordering {
        self.iter().cmp(other)
    }
}

impl<B: BitBlock> PartialEq for BitSet<B> {
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        self.iter().eq(other)
    }
}

impl<B: BitBlock> Eq for BitSet<B> {}

impl BitSet<u32> {
    /// Creates a new empty `BitSet`.
    ///
    /// # Examples
    ///
    /// ```
    /// use bit_set::BitSet;
    ///
    /// let mut s = BitSet::new();
    /// ```
    #[inline]
    pub fn new() -> Self {
        Self::default()
    }

    /// Creates a new `BitSet` with initially no contents, able to
    /// hold `nbits` elements without resizing.
    ///
    /// # Examples
    ///
    /// ```
    /// use bit_set::BitSet;
    ///
    /// let mut s = BitSet::with_capacity(100);
    /// assert!(s.capacity() >= 100);
    /// ```
    #[inline]
    pub fn with_capacity(nbits: usize) -> Self {
        let bit_vec = BitVec::from_elem(nbits, false);
        Self::from_bit_vec(bit_vec)
    }

    /// Creates a new `BitSet` from the given bit vector.
    ///
    /// # Examples
    ///
    /// ```
    /// use bit_vec::BitVec;
    /// use bit_set::BitSet;
    ///
    /// let bv = BitVec::from_bytes(&[0b01100000]);
    /// let s = BitSet::from_bit_vec(bv);
    ///
    /// // Print 1, 2 in arbitrary order
    /// for x in s.iter() {
    ///     println!("{}", x);
    /// }
    /// ```
    #[inline]
    pub fn from_bit_vec(bit_vec: BitVec) -> Self {
        BitSet { bit_vec }
    }

    pub fn from_bytes(bytes: &[u8]) -> Self {
        BitSet {
            bit_vec: BitVec::from_bytes(bytes),
        }
    }
}

#[allow(clippy::multiple_inherent_impl)]
impl<B: BitBlock> BitSet<B> {
    /// Creates a new empty `BitSet`.
    ///
    /// # Examples
    ///
    /// ```
    /// use bit_set::BitSet;
    ///
    /// let mut s = <BitSet>::new_general();
    /// ```
    #[inline]
    pub fn new_general() -> Self {
        Self::default()
    }

    /// Creates a new `BitSet` with initially no contents, able to
    /// hold `nbits` elements without resizing.
    ///
    /// # Examples
    ///
    /// ```
    /// use bit_set::BitSet;
    ///
    /// let mut s = <BitSet>::with_capacity_general(100);
    /// assert!(s.capacity() >= 100);
    /// ```
    #[inline]
    pub fn with_capacity_general(nbits: usize) -> Self {
        let bit_vec = BitVec::from_elem_general(nbits, false);
        Self::from_bit_vec_general(bit_vec)
    }

    /// Creates a new `BitSet` from the given bit vector.
    ///
    /// # Examples
    ///
    /// ```
    /// use bit_vec::BitVec;
    /// use bit_set::BitSet;
    ///
    /// let bv: BitVec<u64> = BitVec::from_bytes_general(&[0b01100000]);
    /// let s = BitSet::from_bit_vec_general(bv);
    ///
    /// // Print 1, 2 in arbitrary order
    /// for x in s.iter() {
    ///     println!("{}", x);
    /// }
    /// ```
    #[inline]
    pub fn from_bit_vec_general(bit_vec: BitVec<B>) -> Self {
        BitSet { bit_vec }
    }

    pub fn from_bytes_general(bytes: &[u8]) -> Self {
        BitSet {
            bit_vec: BitVec::from_bytes_general(bytes),
        }
    }

    /// Returns the capacity in bits for this bit vector. Inserting any
    /// element less than this amount will not trigger a resizing.
    ///
    /// # Examples
    ///
    /// ```
    /// use bit_set::BitSet;
    ///
    /// let mut s = BitSet::with_capacity(100);
    /// assert!(s.capacity() >= 100);
    /// ```
    #[inline]
    pub fn capacity(&self) -> usize {
        self.bit_vec.capacity()
    }

    /// Reserves capacity for the given `BitSet` to contain `len` distinct elements. In the case
    /// of `BitSet` this means reallocations will not occur as long as all inserted elements
    /// are less than `len`.
    ///
    /// The collection may reserve more space to avoid frequent reallocations.
    ///
    ///
    /// # Examples
    ///
    /// ```
    /// use bit_set::BitSet;
    ///
    /// let mut s = BitSet::new();
    /// s.reserve_len(10);
    /// assert!(s.capacity() >= 10);
    /// ```
    pub fn reserve_len(&mut self, len: usize) {
        let cur_len = self.bit_vec.len();
        if len >= cur_len {
            self.bit_vec.reserve(len - cur_len);
        }
    }

    /// Reserves the minimum capacity for the given `BitSet` to contain `len` distinct elements.
    /// In the case of `BitSet` this means reallocations will not occur as long as all inserted
    /// elements are less than `len`.
    ///
    /// Note that the allocator may give the collection more space than it requests. Therefore
    /// capacity can not be relied upon to be precisely minimal. Prefer `reserve_len` if future
    /// insertions are expected.
    ///
    ///
    /// # Examples
    ///
    /// ```
    /// use bit_set::BitSet;
    ///
    /// let mut s = BitSet::new();
    /// s.reserve_len_exact(10);
    /// assert!(s.capacity() >= 10);
    /// ```
    pub fn reserve_len_exact(&mut self, len: usize) {
        let cur_len = self.bit_vec.len();
        if len >= cur_len {
            self.bit_vec.reserve_exact(len - cur_len);
        }
    }

    /// Consumes this set to return the underlying bit vector.
    ///
    /// # Examples
    ///
    /// ```
    /// use bit_set::BitSet;
    ///
    /// let mut s = BitSet::new();
    /// s.insert(0);
    /// s.insert(3);
    ///
    /// let bv = s.into_bit_vec();
    /// assert!(bv[0]);
    /// assert!(bv[3]);
    /// ```
    #[inline]
    pub fn into_bit_vec(self) -> BitVec<B> {
        self.bit_vec
    }

    /// Returns a reference to the underlying bit vector.
    ///
    /// # Examples
    ///
    /// ```
    /// use bit_set::BitSet;
    ///
    /// let mut set = BitSet::new();
    /// set.insert(0);
    ///
    /// let bv = set.get_ref();
    /// assert_eq!(bv[0], true);
    /// ```
    #[inline]
    pub fn get_ref(&self) -> &BitVec<B> {
        &self.bit_vec
    }

    /// Returns a mutable reference to the underlying bit vector.
    ///
    /// # Examples
    ///
    /// ```
    /// use bit_set::BitSet;
    ///
    /// let mut set = BitSet::new();
    /// set.insert(0);
    /// set.insert(3);
    ///
    /// {
    ///     let bv = set.get_mut();
    ///     bv.set(1, true);
    /// }
    ///
    /// assert!(set.contains(0));
    /// assert!(set.contains(1));
    /// assert!(set.contains(3));
    /// ```
    #[inline]
    pub fn get_mut(&mut self) -> &mut BitVec<B> {
        &mut self.bit_vec
    }

    /// # Safety
    ///
    /// Safe and upholds invariant if function `f` does not alter most
    /// significant bits of the first argument where respective bits
    /// in the second argument are equal 0.
    ///
    /// In other words, this is safe if `f` is XOR, OR, AND, but violates
    /// invariant if it is XNOR, NAND.
    ///
    /// See the safety section below.
    #[inline]
    fn other_op<F>(&mut self, other: &Self, mut f: F)
    where
        F: FnMut(B, B) -> B,
    {
        // Unwrap BitVecs
        let self_bit_vec = &mut self.bit_vec;
        let other_bit_vec = &other.bit_vec;

        let self_len = self_bit_vec.len();
        let other_len = other_bit_vec.len();

        // Expand the vector if necessary
        if self_len < other_len {
            self_bit_vec.grow(other_len - self_len, false);
        }

        // virtually pad other with 0's for equal lengths
        let other_words = util::match_words(self_bit_vec, other_bit_vec).1;

        debug_assert!(self_bit_vec.len() >= other_bit_vec.len());

        // Apply values found in other
        for (i, w) in other_words {
            let old = self_bit_vec.storage()[i];
            let new = f(old, w);
            // Safety:
            // We do not change the underlying Vec's size, so this is always ok.
            // - What do we do to uphold the invariant for trailing bits?
            // - We have a debug assert below that guards us against polluting
            //   trailing bits.
            unsafe {
                self_bit_vec.storage_mut()[i] = new;
            }
            if i == self_bit_vec.storage().len() - 1 && self_bit_vec.len() % B::bits() > 0 {
                debug_assert!(new >> (self_bit_vec.len() % B::bits()) == B::zero());
            }
        }
    }

    /// Truncates the underlying vector to the least length required.
    ///
    /// # Examples
    ///
    /// ```
    /// use bit_set::BitSet;
    ///
    /// let mut s = BitSet::new();
    /// s.insert(3231);
    /// s.remove(3231);
    ///
    /// // Internal storage will probably be bigger than necessary
    /// println!("old capacity: {}", s.capacity());
    /// assert!(s.capacity() >= 3231);
    ///
    /// // Now should be smaller
    /// s.shrink_to_fit();
    /// println!("new capacity: {}", s.capacity());
    /// ```
    #[inline]
    pub fn shrink_to_fit(&mut self) {
        let bit_vec = &mut self.bit_vec;
        // Obtain original length
        let old_len = bit_vec.storage().len();
        // Obtain coarse trailing zero length
        let n = bit_vec
            .storage()
            .iter()
            .rev()
            .take_while(|&&n| n == B::zero())
            .count();
        // Truncate away all empty trailing blocks, then shrink_to_fit
        let trunc_len = old_len - n;
        // Safety:
        // Those function calls may seem unsafe, but they are guaranteed
        // not to introduce any memory unsafety.
        // We set the correct length as a multiple of `B::bits()`,
        // thus maintaining the trailing bit invariant.
        unsafe {
            bit_vec.storage_mut().truncate(trunc_len);
            bit_vec.set_len(trunc_len * B::bits());
        }
        bit_vec.shrink_to_fit();
    }

    /// Unions in-place with the specified other bit vector.
    ///
    /// # Examples
    ///
    /// ```
    /// use bit_set::BitSet;
    ///
    /// let a   = 0b01101000;
    /// let b   = 0b10100000;
    /// let res = 0b11101000;
    ///
    /// let mut a = BitSet::from_bytes(&[a]);
    /// let b = BitSet::from_bytes(&[b]);
    /// let res = BitSet::from_bytes(&[res]);
    ///
    /// a.union_with(&b);
    /// assert_eq!(a, res);
    /// ```
    #[inline]
    pub fn union_with(&mut self, other: &Self) {
        self.other_op(other, |w1, w2| w1 | w2);
    }

    /// Intersects in-place with the specified other bit vector.
    ///
    /// # Examples
    ///
    /// ```
    /// use bit_set::BitSet;
    ///
    /// let a   = 0b01101000;
    /// let b   = 0b10100000;
    /// let res = 0b00100000;
    ///
    /// let mut a = BitSet::from_bytes(&[a]);
    /// let b = BitSet::from_bytes(&[b]);
    /// let res = BitSet::from_bytes(&[res]);
    ///
    /// a.intersect_with(&b);
    /// assert_eq!(a, res);
    /// ```
    #[inline]
    pub fn intersect_with(&mut self, other: &Self) {
        self.other_op(other, |w1, w2| w1 & w2);
    }

    /// Makes this bit vector the difference with the specified other bit vector
    /// in-place.
    ///
    /// # Examples
    ///
    /// ```
    /// use bit_set::BitSet;
    ///
    /// let a   = 0b01101000;
    /// let b   = 0b10100000;
    /// let a_b = 0b01001000; // a - b
    /// let b_a = 0b10000000; // b - a
    ///
    /// let mut bva = BitSet::from_bytes(&[a]);
    /// let bvb = BitSet::from_bytes(&[b]);
    /// let bva_b = BitSet::from_bytes(&[a_b]);
    /// let bvb_a = BitSet::from_bytes(&[b_a]);
    ///
    /// bva.difference_with(&bvb);
    /// assert_eq!(bva, bva_b);
    ///
    /// let bva = BitSet::from_bytes(&[a]);
    /// let mut bvb = BitSet::from_bytes(&[b]);
    ///
    /// bvb.difference_with(&bva);
    /// assert_eq!(bvb, bvb_a);
    /// ```
    #[inline]
    pub fn difference_with(&mut self, other: &Self) {
        self.other_op(other, |w1, w2| w1 & !w2);
    }

    /// Makes this bit vector the symmetric difference with the specified other
    /// bit vector in-place.
    ///
    /// # Examples
    ///
    /// ```
    /// use bit_set::BitSet;
    ///
    /// let a   = 0b01101000;
    /// let b   = 0b10100000;
    /// let res = 0b11001000;
    ///
    /// let mut a = BitSet::from_bytes(&[a]);
    /// let b = BitSet::from_bytes(&[b]);
    /// let res = BitSet::from_bytes(&[res]);
    ///
    /// a.symmetric_difference_with(&b);
    /// assert_eq!(a, res);
    /// ```
    #[inline]
    pub fn symmetric_difference_with(&mut self, other: &Self) {
        self.other_op(other, |w1, w2| w1 ^ w2);
    }

    /*
        /// Moves all elements from `other` into `Self`, leaving `other` empty.
        ///
        /// # Examples
        ///
        /// ```
        /// use bit_set::BitSet;
        ///
        /// let mut a = BitSet::new();
        /// a.insert(2);
        /// a.insert(6);
        ///
        /// let mut b = BitSet::new();
        /// b.insert(1);
        /// b.insert(3);
        /// b.insert(6);
        ///
        /// a.append(&mut b);
        ///
        /// assert_eq!(a.len(), 4);
        /// assert_eq!(b.len(), 0);
        /// assert_eq!(a, BitSet::from_bytes(&[0b01110010]));
        /// ```
        pub fn append(&mut self, other: &mut Self) {
            self.union_with(other);
            other.clear();
        }

        /// Splits the `BitSet` into two at the given key including the key.
        /// Retains the first part in-place while returning the second part.
        ///
        /// # Examples
        ///
        /// ```
        /// use bit_set::BitSet;
        ///
        /// let mut a = BitSet::new();
        /// a.insert(2);
        /// a.insert(6);
        /// a.insert(1);
        /// a.insert(3);
        ///
        /// let b = a.split_off(3);
        ///
        /// assert_eq!(a.len(), 2);
        /// assert_eq!(b.len(), 2);
        /// assert_eq!(a, BitSet::from_bytes(&[0b01100000]));
        /// assert_eq!(b, BitSet::from_bytes(&[0b00010010]));
        /// ```
        pub fn split_off(&mut self, at: usize) -> Self {
            let mut other = BitSet::new();

            if at == 0 {
                swap(self, &mut other);
                return other;
            } else if at >= self.bit_vec.len() {
                return other;
            }

            // Calculate block and bit at which to split
            let w = at / BITS;
            let b = at % BITS;

            // Pad `other` with `w` zero blocks,
            // append `self`'s blocks in the range from `w` to the end to `other`
            other.bit_vec.storage_mut().extend(repeat(0u32).take(w)
                                         .chain(self.bit_vec.storage()[w..].iter().cloned()));
            other.bit_vec.nbits = self.bit_vec.nbits;

            if b > 0 {
                other.bit_vec.storage_mut()[w] &= !0 << b;
            }

            // Sets `bit_vec.len()` and fixes the last block as well
            self.bit_vec.truncate(at);

            other
        }
    */

    /// Counts the number of set bits in this set.
    ///
    /// Note that this function scans the set to calculate the number.
    #[inline]
    pub fn count(&self) -> usize {
        self.bit_vec.blocks().fold(0, |acc, n| acc + n.count_ones())
    }

    /// Counts the number of set bits in this set.
    ///
    /// Note that this function scans the set to calculate the number.
    #[inline]
    #[deprecated = "use BitVec::count() instead"]
    pub fn len(&self) -> usize {
        self.count()
    }

    /// Returns whether there are no bits set in this set
    #[inline]
    pub fn is_empty(&self) -> bool {
        self.bit_vec.none()
    }

    /// Removes all elements of this set.
    ///
    /// Different from [`reset`] only in that the capacity is preserved.
    ///
    /// [`reset`]: Self::reset
    #[inline]
    pub fn make_empty(&mut self) {
        self.bit_vec.fill(false);
    }

    /// Resets this set to an empty state.
    ///
    /// Different from [`make_empty`] only in that the capacity may NOT be preserved.
    ///
    /// [`make_empty`]: Self::make_empty
    #[inline]
    pub fn reset(&mut self) {
        self.bit_vec.remove_all();
    }

    /// Clears all bits in this set
    #[deprecated(since = "0.9.0", note = "please use `fn make_empty` instead")]
    #[inline]
    pub fn clear(&mut self) {
        self.make_empty();
    }

    /// Returns `true` if this set contains the specified integer.
    #[inline]
    pub fn contains(&self, value: usize) -> bool {
        let bit_vec = &self.bit_vec;
        value < bit_vec.len() && bit_vec[value]
    }

    /// Returns `true` if the set has no elements in common with `other`.
    /// This is equivalent to checking for an empty intersection.
    #[inline]
    pub fn is_disjoint(&self, other: &Self) -> bool {
        self.intersection(other).next().is_none()
    }

    /// Returns `true` if the set is a subset of another.
    #[inline]
    pub fn is_subset(&self, other: &Self) -> bool {
        let self_bit_vec = &self.bit_vec;
        let other_bit_vec = &other.bit_vec;
        let other_blocks = util::blocks_for_bits::<B>(other_bit_vec.len());

        // Check that `self` intersect `other` is self
        self_bit_vec.blocks().zip(other_bit_vec.blocks()).all(|(w1, w2)| w1 & w2 == w1) &&
        // Make sure if `self` has any more blocks than `other`, they're all 0
        self_bit_vec.blocks().skip(other_blocks).all(|w| w == B::zero())
    }

    /// Returns `true` if the set is a superset of another.
    #[inline]
    pub fn is_superset(&self, other: &Self) -> bool {
        other.is_subset(self)
    }

    /// Adds a value to the set. Returns `true` if the value was not already
    /// present in the set.
    pub fn insert(&mut self, value: usize) -> bool {
        if self.contains(value) {
            return false;
        }

        // Ensure we have enough space to hold the new element
        let len = self.bit_vec.len();
        if value >= len {
            self.bit_vec.grow(value - len + 1, false);
        }

        self.bit_vec.set(value, true);
        true
    }

    /// Removes a value from the set. Returns `true` if the value was
    /// present in the set.
    pub fn remove(&mut self, value: usize) -> bool {
        if !self.contains(value) {
            return false;
        }

        self.bit_vec.set(value, false);

        true
    }

    /// Excludes `element` and all greater elements from the `BitSet`.
    pub fn truncate(&mut self, element: usize) {
        self.bit_vec.truncate(element);
    }
}

impl<B: BitBlock> fmt::Debug for BitSet<B> {
    fn fmt(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        fmt.debug_struct("BitSet")
            .field("bit_vec", &self.bit_vec)
            .finish()
    }
}

impl<B: BitBlock> fmt::Display for BitSet<B> {
    fn fmt(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        fmt.debug_set().entries(self).finish()
    }
}

impl<B: BitBlock> hash::Hash for BitSet<B> {
    fn hash<H: hash::Hasher>(&self, state: &mut H) {
        for pos in self {
            pos.hash(state);
        }
    }
}
