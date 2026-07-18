# stackoverflow question

Rust: Mark the method as unsafe, or just add "unsafe" to its name? Dilemma with library API design.

Hi. I am maintaining a dynamic array of bits just like C++'s `vector<bool>`.

The thing in question, is the method for getting access to the underlying `Vec<u32>`, which may let the caller mess up the dynamic array. It's not inherently memory-unsafe, but currently marked as such. My idea is to change this unsafe fn to be marked as safe, while adding a prefix `unsafe_` to its name.

# code review request

maintainer of `bit-vec` here. It's a Rust library for lists of booleans.

The library is used by a couple thousand people, so I'd appreciate thorough review. You have a compact dynamic arrays of bits like `vector<bool>` in C++ and fill all elements with the given value, or remove one of the elements at the given index. This is basically it. But I had to deprecate `fn clear` by renaming it to `fn fill` because the name was inconsistent with other collections having `clear` truncate the list to zero elements:  https://github.com/contain-rs/bit-vec/issues/16

You may see the code here: https://github.com/contain-rs/bit-vec/pull/134/changes  https://github.com/contain-rs/bit-vec/pull/135/changes All of it except the tests is included below.

```rust
    /// Assigns all bits in this vector to the given boolean value.
    ///
    /// # Invariants
    ///
    /// - After a call to `.fill(true)`, the result of [`all`] is `true`.
    /// - After a call to `.fill(false)`, the result of [`none`] is `true`.
    ///
    /// [`all`]: Self::all
    /// [`none`]: Self::none
    #[inline]
    pub fn fill(&mut self, bit: bool) {
        self.ensure_invariant();
        let block = if bit { !B::zero() } else { B::zero() };
        for w in &mut self.storage {
            *w = block;
        }
        if bit {
            self.fix_last_block();
        }
    }

    /// Clears all bits in this vector.
    #[inline]
    #[deprecated(since = "0.9.0", note = "please use `.fill(false)` instead")]
    pub fn clear(&mut self) {
        self.ensure_invariant();
        for w in &mut self.storage {
            *w = B::zero();
        }
    }

    /// Remove a bit at index `at`, shifting all bits after by one.
    ///
    /// # Panics
    /// Panics if `at` is out of bounds for `BitVec`'s length (that is, if `at >= BitVec::len()`)
    ///
    /// # Examples
    ///```
    /// use bit_vec::BitVec;
    ///
    /// let mut b = BitVec::new();
    ///
    /// b.push(true);
    /// b.push(false);
    /// b.push(false);
    /// b.push(true);
    /// assert!(!b.remove(1));
    ///
    /// assert!(b.eq_vec(&[true, false, true]));
    ///```
    ///
    /// # Time complexity
    /// Takes O([`len`]) time. All items after the removal index must be
    /// shifted to the left. In the worst case, all elements are shifted when
    /// the removal index is 0.
    ///
    /// [`len`]: Self::len
    pub fn remove(&mut self, at: usize) -> bool {
        assert!(
            at < self.nbits,
            "removal index (is {at}) should be < len (is {nbits})",
            nbits = self.nbits
        );
        self.ensure_invariant();

        self.nbits -= 1;

        let last_block_bits = self.nbits % B::bits();
        let block_at = at / B::bits(); // needed block
        let bit_at = at % B::bits(); // index within the block

        let lsbits_mask = (B::one() << bit_at) - B::one();

        let mut carry = B::zero();

        for block_ref in self.storage[block_at + 1..].iter_mut().rev() {
            let curr_carry = *block_ref & B::one();
            *block_ref = *block_ref >> 1 | (carry << (B::bits() - 1));
            carry = curr_carry;
        }

        // Safety: thanks to the assert above.
        let result = unsafe { self.get_unchecked(at) };

        self.storage[block_at] = (self.storage[block_at] & lsbits_mask)
            | ((self.storage[block_at] & (!lsbits_mask << 1)) >> 1)
            | carry << (B::bits() - 1);

        if last_block_bits == 0 {
            self.storage.pop();
        }

        result
    }
```

```rust
pub struct BitVec<B = u32> {
    /// Internal representation of the bit vector
    storage: Vec<B>,
    /// The number of valid bits in the internal representation
    nbits: usize,
}

/// Abstracts over a pile of bits (basically unsigned primitives)
pub trait BitBlock:
    Copy
    + Add<Self, Output = Self>
    + Sub<Self, Output = Self>
    + Shl<usize, Output = Self>
    + Shr<usize, Output = Self>
    + Not<Output = Self>
    + BitAnd<Self, Output = Self>
    + BitOr<Self, Output = Self>
    + BitXor<Self, Output = Self>
    + Rem<Self, Output = Self>
    + Eq
    + Ord
    + hash::Hash
{
    /// How many bits it has
    fn bits() -> usize;
    /// How many bytes it has
    #[inline]
    fn bytes() -> usize {
        Self::bits() / 8
    }
    /// Convert a byte into this type (lowest-order bits set)
    fn from_byte(byte: u8) -> Self;
    /// Count the number of 1's in the bitwise repr
    fn count_ones(self) -> usize;
    /// Count the number of 0's in the bitwise repr
    fn count_zeros(self) -> usize {
        Self::bits() - self.count_ones()
    }
    /// Get `0`
    fn zero() -> Self;
    /// Get `1`
    fn one() -> Self;
}

macro_rules! bit_block_impl {
    ($(($t: ident, $size: expr)),*) => ($(
        impl BitBlock for $t {
            #[inline]
            fn bits() -> usize { $size }
            #[inline]
            fn from_byte(byte: u8) -> Self { $t::from(byte) }
            #[inline]
            fn count_ones(self) -> usize { self.count_ones() as usize }
            #[inline]
            fn count_zeros(self) -> usize { self.count_zeros() as usize }
            #[inline]
            fn one() -> Self { 1 }
            #[inline]
            fn zero() -> Self { 0 }
        }
    )*)
}

bit_block_impl! {
    (u8, 8),
    (u16, 16),
    (u32, 32),
    (u64, 64),
    (usize, core::mem::size_of::<usize>() * 8)
}
```