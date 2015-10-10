/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

Components.utils.import("resource:///modules/ArrayBufferUtils.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource:///modules/yahoo-session.jsm");
var yahoo = {};
Services.scriptloader.loadSubScript("resource:///modules/yahoo-session.jsm", yahoo);

var kPacketIdBytes = StringToBytes(yahoo.kPacketIdentfier);
var kHelloKey = 1;
var kHelloValue = "Hello";
var kWorldKey = 20;
var kWorldValue = "World";
var kNumberKey = 4;
var kNumberValue = 32;
var kParamsKey = 60;
var kParam1Value = "param1";
var kParam2Value = "param2";
var kPacketDataString = "1\xC0\x80Hello\xC0\x8020\xC0\x80World\xC0\x80" +
                          "4\xC0\x8032\xC0\x8060\xC0\x80param1\xC0\x80" +
                          "60\xC0\x80param2\xC0\x80";

function run_test()
{
  add_test(test_headerCreation);
  add_test(test_fullPacketCreation);
  add_test(test_packetDecoding);
  add_test(test_extractPackets);
  add_test(test_malformedPacketExtraction);

  run_next_test();
}

function test_headerCreation()
{
  let packetLength = 0;
  // Random numbers.
  let serviceNumber = 0x57;
  let status = 0x04;
  let sessionId = 0x57842390;

  let packet = new yahoo.YahooPacket(serviceNumber, status, sessionId);
  let buf = packet.toArrayBuffer();
  let view = new DataView(buf);

  // Ensure that the first 4 bytes contain the YMSG identifier.
  for (let i = 0; i < kPacketIdBytes.length; ++i)
    do_check_eq(kPacketIdBytes[i], view.getUint8(i));

  do_check_eq(yahoo.kProtocolVersion, view.getUint16(4));
  do_check_eq(yahoo.kVendorId, view.getUint16(6));
  do_check_eq(packetLength, view.getUint16(8));
  do_check_eq(serviceNumber, view.getUint16(10));
  do_check_eq(status, view.getUint32(12));
  do_check_eq(sessionId, view.getUint32(16));

  run_next_test();
}

function test_fullPacketCreation()
{
  packetLength = kPacketDataString.length;
  // Random numbers.
  let serviceNumber = 0x55;
  let status = 0x02;
  let sessionId = 0x12567800;

  let packet = new yahoo.YahooPacket(serviceNumber, status, sessionId);
  packet.addValue(kHelloKey, kHelloValue);
  packet.addValue(kWorldKey, kWorldValue);
  packet.addValue(kNumberKey, kNumberValue);
  packet.addValues(kParamsKey, [kParam1Value, kParam2Value]);
  let buf = packet.toArrayBuffer();
  let view = new DataView(buf);

  // Header check.

  // Ensure that the first 4 bytes contain the YMSG identifier.
  for (let i = 0; i < kPacketIdBytes.length; ++i)
    do_check_eq(kPacketIdBytes[i], view.getUint8(i));

  do_check_eq(yahoo.kProtocolVersion, view.getUint16(4));
  do_check_eq(yahoo.kVendorId, view.getUint16(6));
  do_check_eq(packetLength, view.getUint16(8));
  do_check_eq(serviceNumber, view.getUint16(10));
  do_check_eq(status, view.getUint32(12));
  do_check_eq(sessionId, view.getUint32(16));

  // Packet data check.
  let dataBytes = StringToBytes(kPacketDataString);
  for (let i = 0; i < dataBytes.length; ++i)
    do_check_eq(dataBytes[i], view.getUint8(yahoo.kPacketHeaderSize + i));
  run_next_test()
}

function test_packetDecoding()
{
  let packetLength = kPacketDataString.length;
  // Random numbers.
  let serviceNumber = 0x20;
  let status = 0x06;
  let sessionId = 0x13319AB2;

  let buf = new ArrayBuffer(yahoo.kPacketHeaderSize + packetLength);
  let view = new DataView(buf);

  for (let i = 0; i < kPacketIdBytes.length; ++i)
    view.setUint8(i, kPacketIdBytes[i]);

  view.setUint16(4, yahoo.kProtocolVersion);
  view.setUint16(6, yahoo.kVendorId);
  view.setUint16(8, packetLength);
  view.setUint16(10, serviceNumber);
  view.setUint32(12, status);
  view.setUint32(16, sessionId);

  let dataBuf = BytesToArrayBuffer(StringToBytes(kPacketDataString));
  copyBytes(buf, dataBuf, 20);

  // Now we decode and test.
  let packet = new yahoo.YahooPacket();
  packet.fromArrayBuffer(buf);

  // Test header information.
  do_check_eq(serviceNumber, packet.service);
  do_check_eq(status, packet.status);
  do_check_eq(sessionId, packet.sessionId);

  // Test the getting of single packet data values.
  do_check_eq(kHelloValue, packet.getValue(kHelloKey));
  do_check_eq(kWorldValue, packet.getValue(kWorldKey));
  do_check_eq(kNumberValue, packet.getValue(kNumberKey));

  // Test the getting of multiple values with a single key.
  let multiValue = packet.getValues(kParamsKey);
  do_check_eq(2, multiValue.length);
  do_check_eq(kParam1Value, multiValue[0]);
  do_check_eq(kParam2Value, multiValue[1]);

  // Test if certain keys are non-existant.
  do_check_true(packet.hasKey(kHelloKey));
  do_check_false(packet.hasKey(500)); // There is no key 500.

  run_next_test();
}

function test_extractPackets()
{
  // Some constants for each packet.
  const kP1Service = 0x47;
  const kP1Status = 0;
  const kP1SessionId = 0x12345678;
  // Used for testing packet verification.
  const kP1FuzzerKey = 42;
  const kP1FuzzerValue = "I am using the YMSG protocol!";

  const kP2Service = 0x57;
  const kP2Status = 5;
  const kP2SessionId = 0x87654321;

  // First, create two packets and obtain their buffers.
  let packet1 = new yahoo.YahooPacket(kP1Service, kP1Status, kP1SessionId);
  packet1.addValue(kHelloKey, kHelloValue);
  packet1.addValue(kP1FuzzerKey, kP1FuzzerValue);
  let packet1Buffer = packet1.toArrayBuffer();

  let packet2 = new yahoo.YahooPacket(kP2Service, kP2Status, kP2SessionId);
  packet2.addValue(kWorldKey, kWorldValue);
  let packet2Buffer = packet2.toArrayBuffer();

  // Create one full buffer with both packets inside.
  let fullBuffer = new ArrayBuffer(packet1Buffer.byteLength +
                                   packet2Buffer.byteLength);
  copyBytes(fullBuffer, packet1Buffer);
  copyBytes(fullBuffer, packet2Buffer, packet1Buffer.byteLength);

  // Now, run the packets through the extractPackets() method.
  let [extractedPackets, bytesHandled] =
      yahoo.YahooPacket.extractPackets(fullBuffer);
  do_check_eq(2, extractedPackets.length);

  // Packet 1 checks.
  let p1 = extractedPackets[0];
  do_check_eq(kP1Service, p1.service);
  do_check_eq(kP1Status, p1.status);
  do_check_eq(kP1SessionId, p1.sessionId);
  do_check_true(p1.hasKey(kHelloKey));
  do_check_eq(kHelloValue, p1.getValue(kHelloKey));

  // Packet 2 checks.
  let p2 = extractedPackets[1];
  do_check_eq(kP2Service, p2.service);
  do_check_eq(kP2Status, p2.status);
  do_check_eq(kP2SessionId, p2.sessionId);
  do_check_true(p2.hasKey(kWorldKey));
  do_check_eq(kWorldValue, p2.getValue(kWorldKey));

  // Check if all the bytes were handled.
  do_check_eq(fullBuffer.byteLength, bytesHandled);

  run_next_test();
}

function test_malformedPacketExtraction()
{
  const kInvalidPacketData = "MSYG1\xC0\x80Hello\xC0\x8020\xC0\x80World\xC0\x80";
  let buffer = BytesToArrayBuffer(StringToBytes(kInvalidPacketData));
  let malformed = false;
  try {
    yahoo.YahooPacket.extractPackets(buffer);
  } catch(e) {
    malformed = true;
  }
  do_check_true(malformed);
  run_next_test();
}
