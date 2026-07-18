use crate::{local_prelude::*, BitSet};

#[derive(Clone)]
struct BlockIter<T, B: BitBlock> {
    head: B,
    head_offset: usize,
    tail: T,
}

impl<T, B: BitBlock> BlockIter<T, B>
where
    T: Iterator<Item = B>,
{
    fn from_blocks(mut blocks: T) -> Self {
        let h = blocks.next().unwrap_or(B::zero());
        BlockIter {
            tail: blocks,
            head: h,
            head_offset: 0,
        }
    }
}

#[allow(clippy::multiple_inherent_impl)]
impl<B: BitBlock> BitSet<B> {
    /// Iterator over each usize stored in `self` union `other`.
    /// See [`union_with`] for an efficient in-place version.
    ///
    /// # Examples
    ///
    /// ```
    /// use bit_set::BitSet;
    ///
    /// let a = BitSet::from_bytes(&[0b01101000]);
    /// let b = BitSet::from_bytes(&[0b10100000]);
    ///
    /// // Print 0, 1, 2, 4 in arbitrary order
    /// for x in a.union(&b) {
    ///     println!("{}", x);
    /// }
    /// ```
    ///
    /// [`union_with`]: Self::union_with
    #[inline]
    pub fn union<'a>(&'a self, other: &'a Self) -> Union<'a, B> {
        fn or<B: BitBlock>(w1: B, w2: B) -> B {
            w1 | w2
        }

        Union(BlockIter::from_blocks(TwoBitPositions {
            set: self.bit_vec.blocks(),
            other: other.bit_vec.blocks(),
            merge: or,
        }))
    }

    /// Iterator over each usize stored in `self` intersect `other`.
    /// See [`intersect_with`] for an efficient in-place version.
    ///
    /// # Examples
    ///
    /// ```
    /// use bit_set::BitSet;
    ///
    /// let a = BitSet::from_bytes(&[0b01101000]);
    /// let b = BitSet::from_bytes(&[0b10100000]);
    ///
    /// // Print 2
    /// for x in a.intersection(&b) {
    ///     println!("{}", x);
    /// }
    /// ```
    ///
    /// [`intersect_with`]: Self::intersect_with
    #[inline]
    pub fn intersection<'a>(&'a self, other: &'a Self) -> Intersection<'a, B> {
        fn bitand<B: BitBlock>(w1: B, w2: B) -> B {
            w1 & w2
        }
        let min = cmp::min(self.bit_vec.len(), other.bit_vec.len());

        Intersection {
            iter: BlockIter::from_blocks(TwoBitPositions {
                set: self.bit_vec.blocks(),
                other: other.bit_vec.blocks(),
                merge: bitand,
            }),
            n: min,
        }
    }

    /// Iterator over each usize stored in the `self` setminus `other`.
    /// See [`difference_with`] for an efficient in-place version.
    ///
    /// # Examples
    ///
    /// ```
    /// use bit_set::BitSet;
    ///
    /// let a = BitSet::from_bytes(&[0b01101000]);
    /// let b = BitSet::from_bytes(&[0b10100000]);
    ///
    /// // Print 1, 4 in arbitrary order
    /// for x in a.difference(&b) {
    ///     println!("{}", x);
    /// }
    ///
    /// // Note that difference is not symmetric,
    /// // and `b - a` means something else.
    /// // This prints 0
    /// for x in b.difference(&a) {
    ///     println!("{}", x);
    /// }
    /// ```
    ///
    /// [`difference_with`]: Self::difference_with
    #[inline]
    pub fn difference<'a>(&'a self, other: &'a Self) -> Difference<'a, B> {
        fn diff<B: BitBlock>(w1: B, w2: B) -> B {
            w1 & !w2
        }

        Difference(BlockIter::from_blocks(TwoBitPositions {
            set: self.bit_vec.blocks(),
            other: other.bit_vec.blocks(),
            merge: diff,
        }))
    }

    /// Iterator over each usize stored in the symmetric difference of `self` and `other`.
    /// See [`symmetric_difference_with`] for an efficient in-place version.
    ///
    /// # Examples
    ///
    /// ```
    /// use bit_set::BitSet;
    ///
    /// let a = BitSet::from_bytes(&[0b01101000]);
    /// let b = BitSet::from_bytes(&[0b10100000]);
    ///
    /// // Print 0, 1, 4 in arbitrary order
    /// for x in a.symmetric_difference(&b) {
    ///     println!("{}", x);
    /// }
    /// ```
    ///
    /// [`symmetric_difference_with`]: Self::symmetric_difference_with
    #[inline]
    pub fn symmetric_difference<'a>(&'a self, other: &'a Self) -> SymmetricDifference<'a, B> {
        fn bitxor<B: BitBlock>(w1: B, w2: B) -> B {
            w1 ^ w2
        }

        SymmetricDifference(BlockIter::from_blocks(TwoBitPositions {
            set: self.bit_vec.blocks(),
            other: other.bit_vec.blocks(),
            merge: bitxor,
        }))
    }

    /// Iterator over each usize stored in the `BitSet`.
    ///
    /// # Examples
    ///
    /// ```
    /// use bit_set::BitSet;
    ///
    /// let s = BitSet::from_bytes(&[0b01001010]);
    ///
    /// // Print 1, 4, 6 in arbitrary order
    /// for x in s.iter() {
    ///     println!("{}", x);
    /// }
    /// ```
    #[inline]
    pub fn iter(&self) -> Iter<'_, B> {
        Iter(BlockIter::from_blocks(self.bit_vec.blocks()))
    }
}

/// An iterator combining two `BitSet` iterators.
#[derive(Clone)]
struct TwoBitPositions<'a, B: 'a + BitBlock> {
    set: Blocks<'a, B>,
    other: Blocks<'a, B>,
    merge: fn(B, B) -> B,
}

/// An iterator for `BitSet`.
#[derive(Clone)]
pub struct Iter<'a, B: 'a + BitBlock>(BlockIter<Blocks<'a, B>, B>);
#[derive(Clone)]
pub struct Union<'a, B: 'a + BitBlock>(BlockIter<TwoBitPositions<'a, B>, B>);
#[derive(Clone)]
pub struct Intersection<'a, B: 'a + BitBlock> {
    iter: BlockIter<TwoBitPositions<'a, B>, B>,
    // as an optimization, we compute the maximum possible
    // number of elements in the intersection, and count it
    // down as we return elements. If we reach zero, we can
    // stop.
    n: usize,
}
#[derive(Clone)]
pub struct Difference<'a, B: 'a + BitBlock>(BlockIter<TwoBitPositions<'a, B>, B>);
#[derive(Clone)]
pub struct SymmetricDifference<'a, B: 'a + BitBlock>(BlockIter<TwoBitPositions<'a, B>, B>);

impl<T, B: BitBlock> Iterator for BlockIter<T, B>
where
    T: Iterator<Item = B>,
{
    type Item = usize;

    fn next(&mut self) -> Option<Self::Item> {
        while self.head == B::zero() {
            match self.tail.next() {
                Some(w) => self.head = w,
                None => return None,
            }
            self.head_offset += B::bits();
        }

        // from the current block, isolate the
        // LSB and subtract 1, producing k:
        // a block with a number of set bits
        // equal to the index of the LSB
        let k = (self.head & (!self.head + B::one())) - B::one();
        // update block, removing the LSB
        self.head = self.head & (self.head - B::one());
        // return offset + (index of LSB)
        Some(self.head_offset + B::count_ones(k))
    }

    fn count(self) -> usize {
        self.head.count_ones() + self.tail.map(|block| block.count_ones()).sum::<usize>()
    }

    #[inline]
    fn size_hint(&self) -> (usize, Option<usize>) {
        match self.tail.size_hint() {
            (_, Some(h)) => (0, Some((1 + h) * B::bits())),
            _ => (0, None),
        }
    }
}

impl<B: BitBlock> Iterator for TwoBitPositions<'_, B> {
    type Item = B;

    fn next(&mut self) -> Option<Self::Item> {
        match (self.set.next(), self.other.next()) {
            (Some(a), Some(b)) => Some((self.merge)(a, b)),
            (Some(a), None) => Some((self.merge)(a, B::zero())),
            (None, Some(b)) => Some((self.merge)(B::zero(), b)),
            _ => None,
        }
    }

    #[inline]
    fn size_hint(&self) -> (usize, Option<usize>) {
        let (first_lower_bound, first_upper_bound) = self.set.size_hint();
        let (second_lower_bound, second_upper_bound) = self.other.size_hint();

        let upper_bound = first_upper_bound.zip(second_upper_bound);

        let get_max = |(a, b)| cmp::max(a, b);
        (
            cmp::max(first_lower_bound, second_lower_bound),
            upper_bound.map(get_max),
        )
    }
}

impl<B: BitBlock> Iterator for Iter<'_, B> {
    type Item = usize;

    #[inline]
    fn next(&mut self) -> Option<usize> {
        self.0.next()
    }
    #[inline]
    fn size_hint(&self) -> (usize, Option<usize>) {
        self.0.size_hint()
    }
    #[inline]
    fn count(self) -> usize {
        self.0.count()
    }
}

impl<B: BitBlock> Iterator for Union<'_, B> {
    type Item = usize;

    #[inline]
    fn next(&mut self) -> Option<usize> {
        self.0.next()
    }
    #[inline]
    fn size_hint(&self) -> (usize, Option<usize>) {
        self.0.size_hint()
    }
    #[inline]
    fn count(self) -> usize {
        self.0.count()
    }
}

impl<B: BitBlock> Iterator for Intersection<'_, B> {
    type Item = usize;

    #[inline]
    fn next(&mut self) -> Option<usize> {
        if self.n != 0 {
            self.n -= 1;
            self.iter.next()
        } else {
            None
        }
    }
    #[inline]
    fn size_hint(&self) -> (usize, Option<usize>) {
        // We could invoke self.iter.size_hint() and incorporate that into the hint.
        // In practice, that does not seem worthwhile because the lower bound will
        // always be zero and the upper bound could only possibly less then n in a
        // partially iterated iterator. However, it makes little sense ask for size_hint
        // in a partially iterated iterator, so it did not seem worthwhile.
        (0, Some(self.n))
    }
    #[inline]
    fn count(self) -> usize {
        self.iter.count()
    }
}

impl<B: BitBlock> Iterator for Difference<'_, B> {
    type Item = usize;

    #[inline]
    fn next(&mut self) -> Option<usize> {
        self.0.next()
    }
    #[inline]
    fn size_hint(&self) -> (usize, Option<usize>) {
        self.0.size_hint()
    }
    #[inline]
    fn count(self) -> usize {
        self.0.count()
    }
}

impl<B: BitBlock> Iterator for SymmetricDifference<'_, B> {
    type Item = usize;

    #[inline]
    fn next(&mut self) -> Option<usize> {
        self.0.next()
    }
    #[inline]
    fn size_hint(&self) -> (usize, Option<usize>) {
        self.0.size_hint()
    }
    #[inline]
    fn count(self) -> usize {
        self.0.count()
    }
}

impl<'a, B: BitBlock> IntoIterator for &'a BitSet<B> {
    type Item = usize;
    type IntoIter = Iter<'a, B>;

    fn into_iter(self) -> Iter<'a, B> {
        self.iter()
    }
}
