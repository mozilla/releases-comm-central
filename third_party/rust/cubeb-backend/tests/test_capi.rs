// Copyright © 2017 Mozilla Foundation
//
// This program is made available under an ISC-style license.  See the
// accompanying file LICENSE for details

#![allow(clippy::float_cmp)]

#[macro_use]
extern crate cubeb_backend;

use cubeb_backend::{
    ffi, ContextOps, DeviceId, DeviceInfo, DeviceRef, DeviceType, InputProcessingParams, Ops,
    Result, Stream, StreamOps, StreamParams, StreamParamsRef,
};
use std::ffi::CStr;
use std::mem::ManuallyDrop;
use std::os::raw::c_void;
use std::ptr;
use std::sync::OnceLock;

pub const OPS: Ops = capi_new!(TestContext, TestStream);

struct TestContext {
    #[allow(dead_code)]
    pub ops: *const Ops,
}

impl ContextOps for TestContext {
    fn init(_context_name: Option<&CStr>) -> Result<Box<Self>> {
        Ok(Box::new(TestContext {
            ops: &OPS as *const _,
        }))
    }

    fn backend_id(&mut self) -> &'static CStr {
        unsafe { CStr::from_ptr(b"remote\0".as_ptr() as *const _) }
    }
    fn max_channel_count(&mut self) -> Result<u32> {
        Ok(0u32)
    }
    fn min_latency(&mut self, _params: StreamParams) -> Result<u32> {
        Ok(0u32)
    }
    fn preferred_sample_rate(&mut self) -> Result<u32> {
        Ok(0u32)
    }
    fn supported_input_processing_params(&mut self) -> Result<InputProcessingParams> {
        Ok(InputProcessingParams::NONE)
    }
    fn enumerate_devices(&mut self, _devtype: DeviceType) -> Result<Box<[DeviceInfo]>> {
        Ok(vec![DeviceInfo::default()].into_boxed_slice())
    }
    fn device_collection_destroy(&mut self, collection: Box<[DeviceInfo]>) -> Result<()> {
        assert_eq!(collection.len(), 1);
        assert_ne!(collection[0].as_ptr(), std::ptr::null_mut());
        Ok(())
    }
    fn stream_init(
        &mut self,
        _stream_name: Option<&CStr>,
        _input_device: DeviceId,
        _input_stream_params: Option<&StreamParamsRef>,
        _output_device: DeviceId,
        _output_stream_params: Option<&StreamParamsRef>,
        _latency_frame: u32,
        _data_callback: ffi::cubeb_data_callback,
        _state_callback: ffi::cubeb_state_callback,
        _user_ptr: *mut c_void,
    ) -> Result<Stream> {
        Ok(unsafe { Stream::from_ptr(0xDEAD_BEEF as *mut _) })
    }
    fn register_device_collection_changed(
        &mut self,
        _dev_type: DeviceType,
        _collection_changed_callback: ffi::cubeb_device_collection_changed_callback,
        _user_ptr: *mut c_void,
    ) -> Result<()> {
        Ok(())
    }
}

struct TestStream {}

impl StreamOps for TestStream {
    fn start(&mut self) -> Result<()> {
        Ok(())
    }
    fn stop(&mut self) -> Result<()> {
        Ok(())
    }
    fn position(&mut self) -> Result<u64> {
        Ok(0u64)
    }
    fn latency(&mut self) -> Result<u32> {
        Ok(0u32)
    }
    fn input_latency(&mut self) -> Result<u32> {
        Ok(0u32)
    }
    fn set_volume(&mut self, volume: f32) -> Result<()> {
        assert_eq!(volume, 0.5);
        Ok(())
    }
    fn set_name(&mut self, name: &CStr) -> Result<()> {
        assert_eq!(name, CStr::from_bytes_with_nul(b"test\0").unwrap());
        Ok(())
    }
    fn current_device(&mut self) -> Result<&DeviceRef> {
        Ok(unsafe { DeviceRef::from_ptr(0xDEAD_BEEF as *mut _) })
    }
    fn set_input_mute(&mut self, mute: bool) -> Result<()> {
        assert_eq!(mute, true);
        Ok(())
    }
    fn set_input_processing_params(&mut self, params: InputProcessingParams) -> Result<()> {
        assert_eq!(params, InputProcessingParams::ECHO_CANCELLATION);
        Ok(())
    }
    fn device_destroy(&mut self, device: &DeviceRef) -> Result<()> {
        assert_eq!(device.as_ptr(), 0xDEAD_BEEF as *mut _);
        Ok(())
    }
    fn register_device_changed_callback(
        &mut self,
        _: ffi::cubeb_device_changed_callback,
    ) -> Result<()> {
        Ok(())
    }
}

#[test]
fn test_ops_context_init() {
    let mut c: *mut ffi::cubeb = ptr::null_mut();
    assert_eq!(
        unsafe { OPS.init.unwrap()(&mut c, ptr::null()) },
        ffi::CUBEB_OK
    );
    assert!(!c.is_null());
    unsafe { OPS.destroy.unwrap()(c) }
}

#[test]
fn test_ops_context_max_channel_count() {
    let c: *mut ffi::cubeb = get_ctx();
    let mut max_channel_count = u32::max_value();
    assert_eq!(
        unsafe { OPS.get_max_channel_count.unwrap()(c, &mut max_channel_count) },
        ffi::CUBEB_OK
    );
    assert_eq!(max_channel_count, 0);
}

#[test]
fn test_ops_context_min_latency() {
    let c: *mut ffi::cubeb = get_ctx();
    let params: ffi::cubeb_stream_params = unsafe { ::std::mem::zeroed() };
    let mut latency = u32::max_value();
    assert_eq!(
        unsafe { OPS.get_min_latency.unwrap()(c, params, &mut latency) },
        ffi::CUBEB_OK
    );
    assert_eq!(latency, 0);
}

#[test]
fn test_ops_context_preferred_sample_rate() {
    let c: *mut ffi::cubeb = get_ctx();
    let mut rate = u32::max_value();
    assert_eq!(
        unsafe { OPS.get_preferred_sample_rate.unwrap()(c, &mut rate) },
        ffi::CUBEB_OK
    );
    assert_eq!(rate, 0);
}

#[test]
fn test_ops_context_supported_input_processing_params() {
    let c: *mut ffi::cubeb = get_ctx();
    let mut params: ffi::cubeb_input_processing_params = InputProcessingParams::all().bits();
    assert_eq!(
        unsafe { OPS.get_supported_input_processing_params.unwrap()(c, &mut params) },
        ffi::CUBEB_OK
    );
    assert_eq!(params, ffi::CUBEB_INPUT_PROCESSING_PARAM_NONE);
}

#[test]
fn test_ops_context_enumerate_devices() {
    let c: *mut ffi::cubeb = get_ctx();
    let mut coll = ffi::cubeb_device_collection {
        device: ptr::null_mut(),
        count: 0,
    };
    assert_eq!(
        unsafe { OPS.enumerate_devices.unwrap()(c, 0, &mut coll) },
        ffi::CUBEB_OK
    );
    assert_ne!(coll.device, std::ptr::null_mut());
    assert_eq!(coll.count, 1)
}

#[test]
fn test_ops_context_device_collection_destroy() {
    let c: *mut ffi::cubeb = get_ctx();
    let mut device_infos = ManuallyDrop::new(Box::new([DeviceInfo::default().into()]));

    let mut coll = ffi::cubeb_device_collection {
        device: device_infos.as_mut_ptr(),
        count: device_infos.len(),
    };
    assert_eq!(
        unsafe { OPS.device_collection_destroy.unwrap()(c, &mut coll) },
        ffi::CUBEB_OK
    );
    assert_eq!(coll.device, ptr::null_mut());
    assert_eq!(coll.count, 0);
}

// stream_init: Some($crate::capi::capi_stream_init::<$ctx>),
// stream_destroy: Some($crate::capi::capi_stream_destroy::<$stm>),
// stream_start: Some($crate::capi::capi_stream_start::<$stm>),
// stream_stop: Some($crate::capi::capi_stream_stop::<$stm>),
// stream_get_position: Some($crate::capi::capi_stream_get_position::<$stm>),

#[test]
fn test_ops_stream_latency() {
    let s: *mut ffi::cubeb_stream = get_stream();
    let mut latency = u32::max_value();
    assert_eq!(
        unsafe { OPS.stream_get_latency.unwrap()(s, &mut latency) },
        ffi::CUBEB_OK
    );
    assert_eq!(latency, 0);
}

#[test]
fn test_ops_stream_set_volume() {
    let s: *mut ffi::cubeb_stream = get_stream();
    unsafe {
        OPS.stream_set_volume.unwrap()(s, 0.5);
    }
}

#[test]
fn test_ops_stream_set_name() {
    let s: *mut ffi::cubeb_stream = get_stream();
    unsafe {
        OPS.stream_set_name.unwrap()(s, CStr::from_bytes_with_nul(b"test\0").unwrap().as_ptr());
    }
}

#[test]
fn test_ops_stream_current_device() {
    let s: *mut ffi::cubeb_stream = get_stream();
    let mut device: *mut ffi::cubeb_device = ptr::null_mut();
    assert_eq!(
        unsafe { OPS.stream_get_current_device.unwrap()(s, &mut device) },
        ffi::CUBEB_OK
    );
    assert_eq!(device, 0xDEAD_BEEF as *mut _);
}

#[test]
fn test_ops_stream_set_input_mute() {
    let s: *mut ffi::cubeb_stream = get_stream();
    assert_eq!(
        unsafe { OPS.stream_set_input_mute.unwrap()(s, 1) },
        ffi::CUBEB_OK
    );
}

#[test]
fn test_ops_stream_set_input_processing_params() {
    let s: *mut ffi::cubeb_stream = get_stream();
    assert_eq!(
        unsafe {
            OPS.stream_set_input_processing_params.unwrap()(
                s,
                ffi::CUBEB_INPUT_PROCESSING_PARAM_ECHO_CANCELLATION,
            )
        },
        ffi::CUBEB_OK
    );
}

fn get_ctx() -> *mut ffi::cubeb {
    CONTEXT.get_or_init(TestContextPtr::new).ptr
}

static CONTEXT: OnceLock<TestContextPtr> = OnceLock::new();

struct TestContextPtr {
    ptr: *mut ffi::cubeb,
}

// Safety: ffi::cubeb implementations are expected to be thread-safe.
unsafe impl Send for TestContextPtr {}
unsafe impl Sync for TestContextPtr {}

impl TestContextPtr {
    fn new() -> Self {
        let mut c: *mut ffi::cubeb = ptr::null_mut();
        assert_eq!(
            unsafe { OPS.init.unwrap()(&mut c, ptr::null()) },
            ffi::CUBEB_OK
        );
        assert!(!c.is_null());
        TestContextPtr { ptr: c }
    }
}

impl Drop for TestContextPtr {
    fn drop(&mut self) {
        unsafe { OPS.destroy.unwrap()(self.ptr) }
    }
}

fn get_stream() -> *mut ffi::cubeb_stream {
    STREAM.get_or_init(TestStreamPtr::new).ptr
}

static STREAM: OnceLock<TestStreamPtr> = OnceLock::new();

struct TestStreamPtr {
    ptr: *mut ffi::cubeb_stream,
}

// Safety: ffi::cubeb_stream implementations are expected to be thread-safe.
unsafe impl Send for TestStreamPtr {}
unsafe impl Sync for TestStreamPtr {}

impl TestStreamPtr {
    fn new() -> Self {
        let c: *mut ffi::cubeb = get_ctx();
        let mut s: *mut ffi::cubeb_stream = ptr::null_mut();
        assert_eq!(
            unsafe {
                OPS.stream_init.unwrap()(
                    c,
                    &mut s,
                    ptr::null(),
                    ptr::null(),
                    ptr::null_mut(),
                    ptr::null(),
                    ptr::null_mut(),
                    0,
                    None,
                    None,
                    ptr::null_mut(),
                )
            },
            ffi::CUBEB_OK
        );
        assert!(!s.is_null());
        TestStreamPtr { ptr: s }
    }
}

impl Drop for TestStreamPtr {
    fn drop(&mut self) {
        unsafe { OPS.stream_destroy.unwrap()(self.ptr) }
    }
}
