use crate::local_prelude::*;

#[allow(type_alias_bounds)]
type MatchWords<'a, B: BitBlock> =
    Chain<Enumerate<Blocks<'a, B>>, Skip<Take<Enumerate<Repeat<B>>>>>;

/// Computes how many blocks are needed to store that many bits
pub(crate) fn blocks_for_bits<B: BitBlock>(bits: usize) -> usize {
    // If we want 17 bits, dividing by 32 will produce 0. So we add 1 to make sure we
    // reserve enough. But if we want exactly a multiple of 32, this will actually allocate
    // one too many. So we need to check if that's the case. We can do that by computing if
    // bitwise AND by `32 - 1` is 0. But LLVM should be able to optimize the semantically
    // superior modulo operator on a power of two to this.
    //
    // Note that we can technically avoid this branch with the expression
    // `(nbits + BITS - 1) / 32::BITS`, but if nbits is almost usize::MAX this will overflow.
    if bits % B::bits() == 0 {
        bits / B::bits()
    } else {
        bits / B::bits() + 1
    }
}

#[allow(clippy::iter_skip_zero)]
// Take two BitVec's, and return iterators of their words, where the shorter one
// has been padded with 0's
pub(crate) fn match_words<'a, 'b, B: BitBlock>(
    a: &'a BitVec<B>,
    b: &'b BitVec<B>,
) -> (MatchWords<'a, B>, MatchWords<'b, B>) {
    let a_len = a.storage().len();
    let b_len = b.storage().len();

    // have to uselessly pretend to pad the longer one for type matching
    if a_len < b_len {
        (
            a.blocks()
                .enumerate()
                .chain(iter::repeat(B::zero()).enumerate().take(b_len).skip(a_len)),
            b.blocks()
                .enumerate()
                .chain(iter::repeat(B::zero()).enumerate().take(0).skip(0)),
        )
    } else {
        (
            a.blocks()
                .enumerate()
                .chain(iter::repeat(B::zero()).enumerate().take(0).skip(0)),
            b.blocks()
                .enumerate()
                .chain(iter::repeat(B::zero()).enumerate().take(a_len).skip(b_len)),
        )
    }
}
