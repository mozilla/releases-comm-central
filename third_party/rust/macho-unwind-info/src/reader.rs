use zerocopy::{FromBytes, Immutable, KnownLayout, Ref};

pub trait Reader {
    fn read_at<T>(&self, offset: u64) -> Option<&T>
    where
        T: FromBytes + KnownLayout + Immutable;
    fn read_slice_at<T>(&self, offset: u64, len: usize) -> Option<&[T]>
    where
        T: FromBytes + KnownLayout + Immutable;
}

impl Reader for [u8] {
    fn read_at<T>(&self, offset: u64) -> Option<&T>
    where
        T: FromBytes + KnownLayout + Immutable,
    {
        let offset: usize = offset.try_into().ok()?;
        let end: usize = offset.checked_add(core::mem::size_of::<T>())?;
        let lv = Ref::<&[u8], T>::from_bytes(self.get(offset..end)?).ok()?;
        Some(Ref::into_ref(lv))
    }

    fn read_slice_at<T>(&self, offset: u64, len: usize) -> Option<&[T]>
    where
        T: FromBytes + KnownLayout + Immutable,
    {
        let offset: usize = offset.try_into().ok()?;
        let end: usize = offset.checked_add(core::mem::size_of::<T>().checked_mul(len)?)?;
        let lv = Ref::<&[u8], [T]>::from_bytes(self.get(offset..end)?).ok()?;
        Some(Ref::into_ref(lv))
    }
}
