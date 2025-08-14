// Copyright © 2018 Mozilla Foundation
//
// This program is made available under an ISC-style license.  See the
// accompanying file LICENSE for details.
use cubeb_backend::SampleFormat as fmt;
use std::mem;

pub fn allocate_array_by_size<T: Clone + Default>(size: usize) -> Vec<T> {
    assert_eq!(size % mem::size_of::<T>(), 0);
    let elements = size / mem::size_of::<T>();
    allocate_array::<T>(elements)
}

pub fn allocate_array<T: Clone + Default>(elements: usize) -> Vec<T> {
    vec![T::default(); elements]
}

pub fn cubeb_sample_size(format: fmt) -> usize {
    match format {
        fmt::S16LE | fmt::S16BE | fmt::S16NE => mem::size_of::<i16>(),
        fmt::Float32LE | fmt::Float32BE | fmt::Float32NE => mem::size_of::<f32>(),
    }
}

pub struct Finalizer<F: FnOnce()>(Option<F>);

impl<F: FnOnce()> Finalizer<F> {
    pub fn dismiss(&mut self) {
        let _ = self.0.take();
        assert!(self.0.is_none());
    }
}

impl<F: FnOnce()> Drop for Finalizer<F> {
    fn drop(&mut self) {
        if let Some(f) = self.0.take() {
            f();
        }
    }
}

pub fn finally<F: FnOnce()>(f: F) -> Finalizer<F> {
    Finalizer(Some(f))
}

#[test]
fn test_cubeb_sample_size() {
    let pairs = [
        (fmt::S16LE, mem::size_of::<i16>()),
        (fmt::S16BE, mem::size_of::<i16>()),
        (fmt::S16NE, mem::size_of::<i16>()),
        (fmt::Float32LE, mem::size_of::<f32>()),
        (fmt::Float32BE, mem::size_of::<f32>()),
        (fmt::Float32NE, mem::size_of::<f32>()),
    ];

    for pair in pairs.iter() {
        let (fotmat, size) = pair;
        assert_eq!(cubeb_sample_size(*fotmat), *size);
    }
}

#[test]
fn test_finally() {
    let mut x = 0;

    {
        let y = &mut x;
        let _finally = finally(|| {
            *y = 100;
        });
    }
    assert_eq!(x, 100);

    {
        let y = &mut x;
        let mut finally = finally(|| {
            *y = 200;
        });
        finally.dismiss();
    }
    assert_eq!(x, 100);
}
