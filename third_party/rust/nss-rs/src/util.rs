// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

use std::{
    convert::TryFrom as _, marker::PhantomData, os::raw::c_uint, ptr::null_mut, slice::Iter,
};

use crate::{Res, nss_prelude::*, null_safe_slice};

/// Implement a smart pointer for NSS objects.
///
/// Most of the time the pointer is like a `Box`, but there are exceptions (e.g.
/// `PK11SymKey` is internally reference counted so its pointer is like an `Arc`.)
///
/// Named "scoped" because that is what NSS calls its `unique_ptr` typedefs.
#[macro_export]
macro_rules! scoped_ptr {
    ($name:ident, $target:ty, $dtor:path) => {
        pub struct $name {
            ptr: *mut $target,
        }

        impl $name {
            /// Create a new instance of `$name` from a pointer.
            ///
            /// # Errors
            /// When passed a null pointer generates an error.
            pub fn from_ptr(raw: *mut $target) -> Result<Self, $crate::err::Error> {
                let ptr = $crate::err::into_result(raw)?;
                Ok(Self { ptr })
            }
        }

        impl $crate::err::IntoResult for *mut $target {
            type Ok = $name;

            fn into_result(self) -> Result<Self::Ok, $crate::err::Error> {
                $name::from_ptr(self)
            }
        }

        impl std::ops::Deref for $name {
            type Target = *mut $target;

            fn deref(&self) -> &*mut $target {
                &self.ptr
            }
        }

        // Original implements DerefMut, but is that really a good idea?

        impl Drop for $name {
            fn drop(&mut self) {
                unsafe { _ = $dtor(self.ptr) };
            }
        }
    };
}

macro_rules! impl_clone {
    ($name:ty, $nss_fn:path) => {
        impl Clone for $name {
            fn clone(&self) -> Self {
                let ptr = unsafe { $nss_fn(self.ptr) };
                assert!(!ptr.is_null());
                Self { ptr }
            }
        }
    };
}

impl SECItem {
    /// Return contents as a slice.
    ///
    /// Unsafe due to calling `from_raw_parts`, or if 'a outlives &self. This
    /// unsafety is encapsulated by the `as_slice` method of `SECItemBorrowed`
    /// and `SECItemMut`.
    ///
    /// Note that safe code can construct a `SECItem` pointing to anything. The
    /// same is not true of the safe wrappers `SECItemMut` and `SECItemBorrowed`
    /// because their inner `SECItem` is private.
    #[must_use]
    pub unsafe fn as_slice<'a>(&self) -> &'a [u8] {
        // Sanity check the type, as some types don't count bytes in `Item::len`.
        assert_eq!(self.type_, SECItemType::siBuffer);
        // Note: `from_raw_parts` requires non-null `data` even for zero-length
        // slices.
        if self.len != 0 {
            unsafe {
                null_safe_slice(
                    self.data,
                    usize::try_from(self.len).expect("Buffer too long"),
                )
            }
        } else {
            &[]
        }
    }
}

unsafe fn destroy_secitem(item: *mut SECItem) {
    unsafe {
        SECITEM_FreeItem(item, PRBool::from(true));
    }
}
scoped_ptr!(ScopedSECItem, SECItem, destroy_secitem);

impl ScopedSECItem {
    /// This dereferences the pointer held by the item and makes a copy of the
    /// content that is referenced there.
    ///
    /// # Safety
    /// This dereferences two pointers.  It doesn't get much less safe.
    #[must_use]
    pub unsafe fn into_vec(self) -> Vec<u8> {
        let b = unsafe { self.ptr.as_ref().expect("Null pointer") };
        // Sanity check the type, as some types don't count bytes in `Item::len`.
        assert_eq!(b.type_, SECItemType::siBuffer);
        let slc =
            unsafe { null_safe_slice(b.data, usize::try_from(b.len).expect("Buffer too long")) };
        Vec::from(slc)
    }
}

unsafe fn destroy_secitem_array(array: *mut SECItemArray) {
    unsafe {
        SECITEM_FreeArray(array, PRBool::from(true));
    }
}
scoped_ptr!(ScopedSECItemArray, SECItemArray, destroy_secitem_array);

#[expect(clippy::into_iter_without_iter)]
impl<'a> IntoIterator for &'a ScopedSECItemArray {
    type Item = &'a [u8];
    type IntoIter = ScopedSECItemArrayIterator<'a>;
    fn into_iter(self) -> Self::IntoIter {
        Self::IntoIter {
            iter: AsRef::<[SECItem]>::as_ref(self).iter(),
        }
    }
}

impl AsRef<[SECItem]> for ScopedSECItemArray {
    fn as_ref(&self) -> &[SECItem] {
        unsafe { null_safe_slice((*self.ptr).items, (*self.ptr).len) }
    }
}

pub struct ScopedSECItemArrayIterator<'a> {
    iter: Iter<'a, SECItem>,
}

impl<'a> Iterator for ScopedSECItemArrayIterator<'a> {
    type Item = &'a [u8];
    fn next(&mut self) -> Option<&'a [u8]> {
        let item = self.iter.next()?;
        unsafe { Some(item.as_slice()) }
    }
}

/// An owned `SECItem`.
///
/// The `SECItem` structure is allocated by Rust. The buffer referenced by the
/// `SECItem` is allocated by NSS. `SECITEM_FreeItem` will be called to free the
/// buffer when the `SECItemMut` is dropped.
///
/// This is used with NSS functions that return a variable amount of data.
#[repr(transparent)]
pub struct SECItemMut {
    inner: SECItem,
}

impl Drop for SECItemMut {
    fn drop(&mut self) {
        // FreeItem unconditionally frees the buffer referenced by the SECItem.
        // If the second argument is true, it also frees the SECItem itself,
        // which we don't want to do, because rust owns that memory.
        unsafe {
            SECITEM_FreeItem(&raw mut self.inner, PRBool::from(false));
        }
    }
}

impl AsRef<SECItem> for SECItemMut {
    fn as_ref(&self) -> &SECItem {
        &self.inner
    }
}

impl AsMut<SECItem> for SECItemMut {
    fn as_mut(&mut self) -> &mut SECItem {
        &mut self.inner
    }
}

impl SECItemMut {
    /// Return contents as a slice.
    #[must_use]
    pub fn as_slice(&self) -> &[u8] {
        unsafe { self.inner.as_slice() }
    }

    /// Make an empty `SECItemMut` for passing as a mutable `*SECItem` argument.
    #[must_use]
    pub const fn make_empty() -> Self {
        Self {
            inner: SECItem {
                type_: SECItemType::siBuffer,
                data: null_mut(),
                len: 0,
            },
        }
    }
}

/// A borrowed `SECItem`.
///
/// The `SECItem` structure is allocated by Rust. The buffer referenced by the
/// `SECItem` may be allocated either by Rust or NSS. The `SECItem` does not own the
/// buffer and will not free it when dropped.
///
/// This is usually used to pass a reference to some borrowed rust memory to
/// NSS. It is occasionally used to accept non-owned output data from NSS.
#[repr(transparent)]
pub struct SECItemBorrowed<'a> {
    inner: SECItem,
    phantom_data: PhantomData<&'a u8>,
}

impl AsRef<SECItem> for SECItemBorrowed<'_> {
    fn as_ref(&self) -> &SECItem {
        &self.inner
    }
}

impl AsMut<SECItem> for SECItemBorrowed<'_> {
    /// Get a mutable reference to the underlying `SECItem` struct.
    ///
    /// Note that even if the `SECItem` struct is mutable, the buffer it
    /// references may not be. Take care not to pass the mutable
    /// `SECItem` to NSS routines that will violate mutability rules.
    //
    // TODO: Should we make the danger more obvious, by using a non-trait method
    // with "unsafe" in the name, or an unsafe method?
    fn as_mut(&mut self) -> &mut SECItem {
        &mut self.inner
    }
}

impl<'a> SECItemBorrowed<'a> {
    /// Return contents as a slice.
    #[must_use]
    pub fn as_slice(&self) -> &'a [u8] {
        unsafe { self.inner.as_slice() }
    }

    /// Create an empty `SECItemBorrowed`.
    ///
    /// This can be used (1) to pass an empty item as an argument, and (2) as an
    /// output parameter when NSS returns a pointer to NSS-owned memory that
    /// should not be freed when the `SECItem` is dropped.  If the memory should
    /// be freed when the `SECItem` is dropped, use `SECItemMut`.
    ///
    /// It is safe to let the caller specify any lifetime here because no
    /// borrowing is actually taking place. However, if the pointer in the
    /// returned item is modified, care must be taken that the specified
    /// lifetime accurately reflects the data referenced by the pointer.
    #[must_use]
    pub const fn make_empty() -> Self {
        SECItemBorrowed {
            inner: SECItem {
                type_: SECItemType::siBuffer,
                data: null_mut(),
                len: 0,
            },
            phantom_data: PhantomData,
        }
    }

    /// Create a `SECItemBorrowed` wrapping a slice.
    ///
    /// Creating this object is technically safe, but using it is extremely dangerous.
    /// Minimally, it can only be passed as a `const SECItem*` argument to functions,
    /// or those that treat their argument as `const`.
    pub fn wrap(buf: &'a [u8]) -> Res<Self> {
        Ok(Self {
            inner: SECItem {
                type_: SECItemType::siBuffer,
                data: buf.as_ptr().cast_mut(),
                len: c_uint::try_from(buf.len())?,
            },
            phantom_data: PhantomData,
        })
    }

    /// Create a `SECItemBorrowed` wrapping a struct.
    ///
    /// Creating this object is technically safe, but using it is extremely dangerous.
    /// Minimally, it can only be passed as a `const SECItem*` argument to functions,
    /// or those that treat their argument as `const`.
    pub fn wrap_struct<T>(v: &'a T) -> Res<Self> {
        let data: *const T = v;
        Ok(Self {
            inner: SECItem {
                type_: SECItemType::siBuffer,
                data: data.cast_mut().cast(),
                len: c_uint::try_from(size_of::<T>())?,
            },
            phantom_data: PhantomData,
        })
    }
}
