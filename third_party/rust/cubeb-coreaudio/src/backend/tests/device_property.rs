use super::utils::{test_get_default_device, Scope};
use super::*;

// get_device_uid
// ------------------------------------
#[test]
fn test_get_device_uid() {
    // Input device.
    if let Some(input) = test_get_default_device(Scope::Input) {
        let uid = run_serially(|| get_device_uid(input, DeviceType::INPUT)).unwrap();
        let uid = uid.into_string();
        assert!(!uid.is_empty());
    }

    // Output device.
    if let Some(output) = test_get_default_device(Scope::Output) {
        let uid = run_serially(|| get_device_uid(output, DeviceType::OUTPUT)).unwrap();
        let uid = uid.into_string();
        assert!(!uid.is_empty());
    }
}

#[test]
#[should_panic]
fn test_get_device_uid_by_unknwon_device() {
    // Unknown device.
    assert!(
        run_serially_forward_panics(|| get_device_uid(kAudioObjectUnknown, DeviceType::INPUT))
            .is_err()
    );
}

// get_device_model_uid
// ------------------------------------
// Some devices (e.g., AirPods) fail to get model uid.
#[test]
fn test_get_device_model_uid() {
    if let Some(device) = test_get_default_device(Scope::Input) {
        match run_serially(|| get_device_model_uid(device, DeviceType::INPUT)) {
            Ok(uid) => println!("input model uid: {}", uid.into_string()),
            Err(e) => println!("No input model uid. Error: {}", e),
        }
    } else {
        println!("No input device.");
    }

    if let Some(device) = test_get_default_device(Scope::Output) {
        match run_serially(|| get_device_model_uid(device, DeviceType::OUTPUT)) {
            Ok(uid) => println!("output model uid: {}", uid.into_string()),
            Err(e) => println!("No output model uid. Error: {}", e),
        }
    } else {
        println!("No output device.");
    }
}

#[test]
#[should_panic]
fn test_get_device_model_uid_by_unknown_device() {
    assert!(run_serially_forward_panics(|| get_device_model_uid(
        kAudioObjectUnknown,
        DeviceType::INPUT
    ))
    .is_err());
}

// get_device_transport_type
// ------------------------------------
#[test]
fn test_get_device_transport_type() {
    if let Some(device) = test_get_default_device(Scope::Input) {
        match run_serially(|| get_device_transport_type(device, DeviceType::INPUT)) {
            Ok(trans_type) => println!(
                "input transport type: {:X}, {:?}",
                trans_type,
                convert_uint32_into_string(trans_type)
            ),
            Err(e) => println!("No input transport type. Error: {}", e),
        }
    } else {
        println!("No input device.");
    }

    if let Some(device) = test_get_default_device(Scope::Output) {
        match run_serially(|| get_device_transport_type(device, DeviceType::OUTPUT)) {
            Ok(trans_type) => println!(
                "output transport type: {:X}, {:?}",
                trans_type,
                convert_uint32_into_string(trans_type)
            ),
            Err(e) => println!("No output transport type. Error: {}", e),
        }
    } else {
        println!("No output device.");
    }
}

#[test]
#[should_panic]
fn test_get_device_transport_type_by_unknown_device() {
    assert!(run_serially_forward_panics(|| get_device_transport_type(
        kAudioObjectUnknown,
        DeviceType::INPUT
    ))
    .is_err());
}

// get_device_source
// ------------------------------------
// Some USB headsets (e.g., Plantronic .Audio 628) fails to get data source.
#[test]
fn test_get_device_source() {
    if let Some(device) = test_get_default_device(Scope::Input) {
        match run_serially(|| get_device_source(device, DeviceType::INPUT)) {
            Ok(source) => println!(
                "input source: {:X}, {:?}",
                source,
                convert_uint32_into_string(source)
            ),
            Err(e) => println!("No input data source. Error: {}", e),
        }
    } else {
        println!("No input device.");
    }

    if let Some(device) = test_get_default_device(Scope::Output) {
        match run_serially(|| get_device_source(device, DeviceType::OUTPUT)) {
            Ok(source) => println!(
                "output source: {:X}, {:?}",
                source,
                convert_uint32_into_string(source)
            ),
            Err(e) => println!("No output data source. Error: {}", e),
        }
    } else {
        println!("No output device.");
    }
}

#[test]
#[should_panic]
fn test_get_device_source_by_unknown_device() {
    assert!(run_serially_forward_panics(|| get_device_source(
        kAudioObjectUnknown,
        DeviceType::INPUT
    ))
    .is_err());
}

// get_device_source_name
// ------------------------------------
#[test]
fn test_get_device_source_name() {
    if let Some(device) = test_get_default_device(Scope::Input) {
        match run_serially(|| get_device_source_name(device, DeviceType::INPUT)) {
            Ok(name) => println!("input: {}", name.into_string()),
            Err(e) => println!("No input data source name. Error: {}", e),
        }
    } else {
        println!("No input device.");
    }

    if let Some(device) = test_get_default_device(Scope::Output) {
        match run_serially(|| get_device_source_name(device, DeviceType::OUTPUT)) {
            Ok(name) => println!("output: {}", name.into_string()),
            Err(e) => println!("No output data source name. Error: {}", e),
        }
    } else {
        println!("No output device.");
    }
}

#[test]
#[should_panic]
fn test_get_device_source_name_by_unknown_device() {
    assert!(run_serially_forward_panics(|| get_device_source_name(
        kAudioObjectUnknown,
        DeviceType::INPUT
    ))
    .is_err());
}

// get_device_name
// ------------------------------------
#[test]
fn test_get_device_name() {
    if let Some(device) = test_get_default_device(Scope::Input) {
        let name = run_serially(|| get_device_name(device, DeviceType::INPUT)).unwrap();
        println!("input device name: {}", name.into_string());
    } else {
        println!("No input device.");
    }

    if let Some(device) = test_get_default_device(Scope::Output) {
        let name = run_serially(|| get_device_name(device, DeviceType::OUTPUT).unwrap());
        println!("output device name: {}", name.into_string());
    } else {
        println!("No output device.");
    }
}

#[test]
#[should_panic]
fn test_get_device_name_by_unknown_device() {
    assert!(run_serially_forward_panics(|| get_device_name(
        kAudioObjectUnknown,
        DeviceType::INPUT
    ))
    .is_err());
}

// get_device_manufacturer
// ------------------------------------
#[test]
fn test_get_device_manufacturer() {
    if let Some(device) = test_get_default_device(Scope::Input) {
        // Some devices like AirPods cannot get the vendor info so we print the error directly.
        // TODO: Replace `map` and `unwrap_or_else` by `map_or_else`
        let name = run_serially(|| get_device_manufacturer(device, DeviceType::INPUT))
            .map(|name| name.into_string())
            .unwrap_or_else(|e| format!("Error: {}", e));
        println!("input device vendor: {}", name);
    } else {
        println!("No input device.");
    }

    if let Some(device) = test_get_default_device(Scope::Output) {
        // Some devices like AirPods cannot get the vendor info so we print the error directly.
        // TODO: Replace `map` and `unwrap_or_else` by `map_or_else`
        let name =
            run_serially_forward_panics(|| get_device_manufacturer(device, DeviceType::OUTPUT))
                .map(|name| name.into_string())
                .unwrap_or_else(|e| format!("Error: {}", e));
        println!("output device vendor: {}", name);
    } else {
        println!("No output device.");
    }
}

#[test]
#[should_panic]
fn test_get_device_manufacturer_by_unknown_device() {
    assert!(run_serially_forward_panics(|| get_device_manufacturer(
        kAudioObjectUnknown,
        DeviceType::INPUT
    ))
    .is_err());
}

// get_device_buffer_frame_size_range
// ------------------------------------
#[test]
fn test_get_device_buffer_frame_size_range() {
    if let Some(device) = test_get_default_device(Scope::Input) {
        let range =
            run_serially(|| get_device_buffer_frame_size_range(device, DeviceType::INPUT)).unwrap();
        println!(
            "range of input buffer frame size: {}-{}",
            range.mMinimum, range.mMaximum
        );
    } else {
        println!("No input device.");
    }

    if let Some(device) = test_get_default_device(Scope::Output) {
        let range = run_serially(|| get_device_buffer_frame_size_range(device, DeviceType::OUTPUT))
            .unwrap();
        println!(
            "range of output buffer frame size: {}-{}",
            range.mMinimum, range.mMaximum
        );
    } else {
        println!("No output device.");
    }
}

#[test]
#[should_panic]
fn test_get_device_buffer_frame_size_range_by_unknown_device() {
    assert!(
        run_serially_forward_panics(|| get_device_buffer_frame_size_range(
            kAudioObjectUnknown,
            DeviceType::INPUT
        ))
        .is_err()
    );
}

// get_device_latency
// ------------------------------------
#[test]
fn test_get_device_latency() {
    if let Some(device) = test_get_default_device(Scope::Input) {
        let latency = run_serially(|| get_device_latency(device, DeviceType::INPUT)).unwrap();
        println!("latency of input device: {}", latency);
    } else {
        println!("No input device.");
    }

    if let Some(device) = test_get_default_device(Scope::Output) {
        let latency = run_serially(|| get_device_latency(device, DeviceType::OUTPUT)).unwrap();
        println!("latency of output device: {}", latency);
    } else {
        println!("No output device.");
    }
}

#[test]
#[should_panic]
fn test_get_device_latency_by_unknown_device() {
    assert!(run_serially_forward_panics(|| get_device_latency(
        kAudioObjectUnknown,
        DeviceType::INPUT
    ))
    .is_err());
}

// get_device_streams
// ------------------------------------
#[test]
fn test_get_device_streams() {
    if let Some(device) = test_get_default_device(Scope::Input) {
        let streams = run_serially(|| get_device_streams(device, DeviceType::INPUT)).unwrap();
        println!("streams on the input device: {:?}", streams);
        assert!(!streams.is_empty());
    } else {
        println!("No input device.");
    }

    if let Some(device) = test_get_default_device(Scope::Output) {
        let streams = run_serially(|| get_device_streams(device, DeviceType::OUTPUT)).unwrap();
        println!("streams on the output device: {:?}", streams);
        assert!(!streams.is_empty());
    } else {
        println!("No output device.");
    }
}

#[test]
#[should_panic]
fn test_get_device_streams_by_unknown_device() {
    assert!(run_serially_forward_panics(|| get_device_streams(
        kAudioObjectUnknown,
        DeviceType::INPUT
    ))
    .is_err());
}

// get_device_sample_rate
// ------------------------------------
#[test]
fn test_get_device_sample_rate() {
    if let Some(device) = test_get_default_device(Scope::Input) {
        let rate = run_serially(|| get_device_sample_rate(device, DeviceType::INPUT)).unwrap();
        println!("input sample rate: {}", rate);
    } else {
        println!("No input device.");
    }

    if let Some(device) = test_get_default_device(Scope::Output) {
        let rate = run_serially(|| get_device_sample_rate(device, DeviceType::OUTPUT).unwrap());
        println!("output sample rate: {}", rate);
    } else {
        println!("No output device.");
    }
}

#[test]
#[should_panic]
fn test_get_device_sample_rate_by_unknown_device() {
    assert!(run_serially_forward_panics(|| get_device_sample_rate(
        kAudioObjectUnknown,
        DeviceType::INPUT
    ))
    .is_err());
}

// get_ranges_of_device_sample_rate
// ------------------------------------
#[test]
fn test_get_ranges_of_device_sample_rate() {
    if let Some(device) = test_get_default_device(Scope::Input) {
        let ranges =
            run_serially(|| get_ranges_of_device_sample_rate(device, DeviceType::INPUT)).unwrap();
        println!("ranges of input sample rate: {:?}", ranges);
    } else {
        println!("No input device.");
    }

    if let Some(device) = test_get_default_device(Scope::Output) {
        let ranges =
            run_serially(|| get_ranges_of_device_sample_rate(device, DeviceType::OUTPUT)).unwrap();
        println!("ranges of output sample rate: {:?}", ranges);
    } else {
        println!("No output device.");
    }
}

#[test]
#[should_panic]
fn test_get_ranges_of_device_sample_rate_by_unknown_device() {
    assert!(
        run_serially_forward_panics(|| get_ranges_of_device_sample_rate(
            kAudioObjectUnknown,
            DeviceType::INPUT
        ))
        .is_err()
    );
}

// get_stream_latency
// ------------------------------------
#[test]
fn test_get_stream_latency() {
    if let Some(device) = test_get_default_device(Scope::Input) {
        let devstreams = run_serially(|| get_device_streams(device, DeviceType::INPUT)).unwrap();
        for ds in devstreams {
            let latency = run_serially(|| get_stream_latency(ds.stream)).unwrap();
            println!("latency of the input stream {} is {}", ds.stream, latency);
        }
    } else {
        println!("No input device.");
    }

    if let Some(device) = test_get_default_device(Scope::Output) {
        let devstreams = run_serially(|| get_device_streams(device, DeviceType::OUTPUT)).unwrap();
        for ds in devstreams {
            let latency = run_serially(|| get_stream_latency(ds.stream)).unwrap();
            println!("latency of the output stream {} is {}", ds.stream, latency);
        }
    } else {
        println!("No output device.");
    }
}

#[test]
#[should_panic]
fn test_get_stream_latency_by_unknown_device() {
    assert!(get_stream_latency(kAudioObjectUnknown).is_err());
}

// get_stream_virtual_format
// ------------------------------------
#[test]
fn test_get_stream_virtual_format() {
    if let Some(device) = test_get_default_device(Scope::Input) {
        let devstreams = run_serially(|| get_device_streams(device, DeviceType::INPUT)).unwrap();
        let formats = devstreams
            .iter()
            .map(|ds| run_serially(|| get_stream_virtual_format(ds.stream)))
            .collect::<Vec<std::result::Result<AudioStreamBasicDescription, OSStatus>>>();
        println!("input stream formats: {:?}", formats);
        assert!(!formats.is_empty());
    } else {
        println!("No input device.");
    }

    if let Some(device) = test_get_default_device(Scope::Output) {
        let devstreams = run_serially(|| get_device_streams(device, DeviceType::OUTPUT)).unwrap();
        let formats = devstreams
            .iter()
            .map(|ds| run_serially(|| get_stream_virtual_format(ds.stream)))
            .collect::<Vec<std::result::Result<AudioStreamBasicDescription, OSStatus>>>();
        println!("output stream formats: {:?}", formats);
        assert!(!formats.is_empty());
    } else {
        println!("No output device.");
    }
}

#[test]
#[should_panic]
fn test_get_stream_virtual_format_by_unknown_stream() {
    assert!(
        run_serially_forward_panics(|| get_stream_virtual_format(kAudioObjectUnknown)).is_err()
    );
}

// get_devices
// ------------------------------------

#[test]
fn test_get_devices() {
    if let Some(device) = test_get_default_device(Scope::Input) {
        let devices = run_serially(|| get_devices());
        assert!(devices.contains(&device));
    } else {
        println!("No input device.");
    }

    if let Some(device) = test_get_default_device(Scope::Output) {
        let devices = run_serially(|| get_devices());
        assert!(devices.contains(&device));
    } else {
        println!("No output device.");
    }
}
