use crate::dispatch::*;
use coreaudio_sys::*;
use std::fmt;
use std::mem;
use std::os::raw::c_void;
use std::ptr;

pub fn audio_object_has_property(id: AudioObjectID, address: &AudioObjectPropertyAddress) -> bool {
    unsafe { AudioObjectHasProperty(id, address) != 0 }
}

pub fn audio_object_get_property_data<T>(
    id: AudioObjectID,
    address: &AudioObjectPropertyAddress,
    size: *mut usize,
    data: *mut T,
) -> OSStatus {
    unsafe {
        AudioObjectGetPropertyData(
            id,
            address,
            0,
            ptr::null(),
            size as *mut UInt32,
            data as *mut c_void,
        )
    }
}

pub fn audio_object_get_property_data_with_qualifier<T, Q>(
    id: AudioObjectID,
    address: &AudioObjectPropertyAddress,
    qualifier_size: usize,
    qualifier_data: *const Q,
    size: *mut usize,
    data: *mut T,
) -> OSStatus {
    unsafe {
        AudioObjectGetPropertyData(
            id,
            address,
            qualifier_size as UInt32,
            qualifier_data as *const c_void,
            size as *mut UInt32,
            data as *mut c_void,
        )
    }
}

pub fn audio_object_get_property_data_size(
    id: AudioObjectID,
    address: &AudioObjectPropertyAddress,
    size: *mut usize,
) -> OSStatus {
    unsafe { AudioObjectGetPropertyDataSize(id, address, 0, ptr::null(), size as *mut UInt32) }
}

pub fn audio_object_get_property_data_size_with_qualifier<Q>(
    id: AudioObjectID,
    address: &AudioObjectPropertyAddress,
    qualifier_size: usize,
    qualifier_data: *const Q,
    size: *mut usize,
) -> OSStatus {
    unsafe {
        AudioObjectGetPropertyDataSize(
            id,
            address,
            qualifier_size as UInt32,
            qualifier_data as *const c_void,
            size as *mut UInt32,
        )
    }
}

/// Read an array-typed property. Its size is queried first, then the data is read into a buffer
/// of that size. The property may change between the two calls, so the result is truncated to the
/// number of elements actually read.
pub fn audio_object_get_property_array<T: Clone + Default>(
    id: AudioObjectID,
    address: &AudioObjectPropertyAddress,
) -> Result<Vec<T>, OSStatus> {
    audio_object_get_property_array_with_qualifier::<T, ()>(id, address, 0, ptr::null())
}

pub fn audio_object_get_property_array_with_qualifier<T: Clone + Default, Q>(
    id: AudioObjectID,
    address: &AudioObjectPropertyAddress,
    qualifier_size: usize,
    qualifier_data: *const Q,
) -> Result<Vec<T>, OSStatus> {
    const NO_ERR: OSStatus = 0;
    let mut size: usize = 0;
    let status = audio_object_get_property_data_size_with_qualifier(
        id,
        address,
        qualifier_size,
        qualifier_data,
        &mut size,
    );
    if status != NO_ERR {
        return Err(status);
    }
    assert_eq!(size % mem::size_of::<T>(), 0);
    let mut data = vec![T::default(); size / mem::size_of::<T>()];
    let status = audio_object_get_property_data_with_qualifier(
        id,
        address,
        qualifier_size,
        qualifier_data,
        &mut size,
        data.as_mut_ptr(),
    );
    if status != NO_ERR {
        return Err(status);
    }
    data.truncate(size / mem::size_of::<T>());
    Ok(data)
}

pub fn audio_object_set_property_data<T>(
    id: AudioObjectID,
    address: &AudioObjectPropertyAddress,
    size: usize,
    data: *const T,
) -> OSStatus {
    debug_assert_running_serially();
    unsafe {
        AudioObjectSetPropertyData(
            id,
            address,
            0,
            ptr::null(),
            size as UInt32,
            data as *const c_void,
        )
    }
}

#[allow(non_camel_case_types)]
pub type audio_object_property_listener_proc =
    extern "C" fn(AudioObjectID, u32, *const AudioObjectPropertyAddress, *mut c_void) -> OSStatus;

pub fn audio_object_add_property_listener<T>(
    id: AudioObjectID,
    address: &AudioObjectPropertyAddress,
    listener: audio_object_property_listener_proc,
    data: *mut T,
) -> OSStatus {
    debug_assert_running_serially();
    unsafe { AudioObjectAddPropertyListener(id, address, Some(listener), data as *mut c_void) }
}

pub fn audio_object_remove_property_listener<T>(
    id: AudioObjectID,
    address: &AudioObjectPropertyAddress,
    listener: audio_object_property_listener_proc,
    data: *mut T,
) -> OSStatus {
    debug_assert_running_serially();
    unsafe { AudioObjectRemovePropertyListener(id, address, Some(listener), data as *mut c_void) }
}

#[derive(Debug, PartialEq)]
pub enum PropertySelector {
    DefaultOutputDevice,
    DefaultInputDevice,
    DeviceIsAlive,
    DataSource,
    Unknown,
}

impl From<AudioObjectPropertySelector> for PropertySelector {
    fn from(p: AudioObjectPropertySelector) -> Self {
        use coreaudio_sys as sys;
        match p {
            sys::kAudioHardwarePropertyDefaultOutputDevice => Self::DefaultOutputDevice,
            sys::kAudioHardwarePropertyDefaultInputDevice => Self::DefaultInputDevice,
            sys::kAudioDevicePropertyDeviceIsAlive => Self::DeviceIsAlive,
            sys::kAudioDevicePropertyDataSource => Self::DataSource,
            _ => Self::Unknown,
        }
    }
}

impl fmt::Display for PropertySelector {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        let s = match self {
            Self::DefaultOutputDevice => "kAudioHardwarePropertyDefaultOutputDevice",
            Self::DefaultInputDevice => "kAudioHardwarePropertyDefaultInputDevice",
            Self::DeviceIsAlive => "kAudioDevicePropertyDeviceIsAlive",
            Self::DataSource => "kAudioDevicePropertyDataSource",
            _ => "Unknown",
        };
        write!(f, "{s}")
    }
}
