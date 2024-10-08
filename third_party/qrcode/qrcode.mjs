// QR Code Generator
// Dan Jackson, 2020


// --- Bit Buffer Writing ---

class BitBuffer {
    constructor(bitCapacity) {
        this.bitCapacity = bitCapacity;
        const byteLength = (this.bitCapacity + 7) >> 3;
        this.buffer = new Uint8Array(byteLength);
        this.bitOffset = 0;
    }

    append(value, bitCount) {
        for (let i = 0; i < bitCount; i++) {
            const writeByte = this.buffer[(this.bitOffset) >> 3];
            const writeBit = 7 - (this.bitOffset & 0x07);
            const writeMask = 1 << writeBit;
            const readMask = 1 << (bitCount - 1 - i);
            this.buffer[this.bitOffset >> 3] = (writeByte & ~writeMask) | ((value & readMask) ? writeMask : 0);
            this.bitOffset++;
        }
    }

    position() {
        return this.bitOffset;
    }

    read(bitPosition) {
        const value = (this.buffer[bitPosition >> 3] & (1 << (7 - (bitPosition & 7)))) ? 1 : 0;
        return value;
    }
}


// --- Segment Modes ---

// Segment Mode 0b0001 - Numeric
// Maximal groups of 3/2/1 digits encoded to 10/7/4-bit binary
class SegmentNumeric {
    static MODE = 0x01;
    static CHARSET = '0123456789';

    static canEncode(text) {
        return [...text].every(c => SegmentNumeric.CHARSET.includes(c));
    }

    static payloadSize(text) {
        const charCount = text.length;
        return 10 * Math.floor(charCount / 3) + (charCount % 3 * 4) - Math.floor(charCount % 3 / 2);
    }

    static countSize(version) {
        return (version < 10) ? 10 : (version < 27) ? 12 : 14;
    }

    static totalSize(version, text) {
        return Segment.MODE_BITS + SegmentNumeric.countSize(version) + SegmentNumeric.payloadSize(text);
    }

    static encode(bitBuffer, version, text) {
        const data = [...text].map(c => c.charCodeAt(0) - 0x30);
        bitBuffer.append(SegmentNumeric.MODE, Segment.MODE_BITS);
        bitBuffer.append(data.length, SegmentNumeric.countSize(version));
        for (let i = 0; i < data.length; ) {
            const remain = (data.length - i) > 3 ? 3 : (data.length - i);
            let value = data[i];
            let bits = 4;
            i++;
            // Maximal groups of 3/2/1 digits encoded to 10/7/4-bit binary
            if (i < data.length) { value = value * 10 + data[i]; bits += 3; i++; }
            if (i < data.length) { value = value * 10 + data[i]; bits += 3; i++; }
            bitBuffer.append(value, bits);
        }
    }
}

// Segment Mode 0b0010 - Alphanumeric
class SegmentAlphanumeric {
    static MODE = 0x02;
    static CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

    static canEncode(text) {
        return [...text].every(c => SegmentAlphanumeric.CHARSET.includes(c));
    }

    static payloadSize(text) {
        const charCount = text.length;
        return 11 * Math.floor(charCount / 2) + 6 * (charCount % 2);
    }

    static countSize(version) {
        return (version < 10) ? 9 : (version < 27) ? 11 : 13;
    }

    static totalSize(version, text) {
        return Segment.MODE_BITS + SegmentAlphanumeric.countSize(version) + SegmentAlphanumeric.payloadSize(text);
    }

    static encode(bitBuffer, version, text) {
        const data = [...text].map(c => SegmentAlphanumeric.CHARSET.indexOf(c));
        bitBuffer.append(SegmentAlphanumeric.MODE, Segment.MODE_BITS);
        bitBuffer.append(data.length, SegmentAlphanumeric.countSize(version));
        for (let i = 0; i < data.length; ) {
            let value = data[i];
            let bits = 6;
            i++;
            // Pairs combined(a * 45 + b) encoded as 11-bit; odd remainder encoded as 6-bit.
            if (i < data.length) { value = value * 45 + data[i]; bits += 5; i++; }
            bitBuffer.append(value, bits);
        }
    }
}

// Segment Mode 0b0100 - 8-bit byte
class SegmentEightBit {
    static MODE = 0x04;

    static canEncode(text) {
        return [...text].every(c => c.charCodeAt(0) >= 0x00 && c.charCodeAt(0) <= 0xff);
    }

    static payloadSize(text) {
        const charCount = text.length;
        return 8 * charCount;
    }

    static countSize(version) {
        return (version < 10) ? 8 : (version < 27) ? 16 : 16; // 8-bit
    }

    static totalSize(version, text) {
        return Segment.MODE_BITS + SegmentEightBit.countSize(version) + SegmentEightBit.payloadSize(text);
    }

    static encode(bitBuffer, version, text) {
        const data = [...text].map(c => c.charCodeAt(0));
        bitBuffer.append(SegmentEightBit.MODE, Segment.MODE_BITS);
        bitBuffer.append(data.length, SegmentEightBit.countSize(version));
        for (let i = 0; i < data.length; i++) {
            bitBuffer.append(data[i], 8);
        }
    }
}


class Segment {
    // In descending order of coding efficiency
    static MODES = {
        numeric: SegmentNumeric,
        alphanumeric: SegmentAlphanumeric, 
        eightBit: SegmentEightBit,
    };
    static MODE_BITS = 4;    // 4-bits to indicate mode
    static MODE_INDICATOR_TERMINATOR = 0x0;  // 0b0000
    // ECI Assignment Numbers
    //static ECI_UTF8 = 26; // "\000026" UTF8 - ISO/IEC 10646 UTF-8 encoding


    constructor(text) {
        this.text = text;
        for (let mode of Object.values(Segment.MODES)) {
            if (mode.canEncode(this.text)) {
                this.mode = mode;
                return;
            }
        }
        throw 'Cannot encode text';
    }

}


// --- Reed-Solomon Error-Correction Code ---

// These error-correction functions are derived from https://www.nayuki.io/page/qr-code-generator-library Copyright (c) Project Nayuki. (MIT License)
class ReedSolomon {

    // Product modulo GF(2^8/0x011D)
    static Multiply(a, b) { // both arguments 8-bit
        let value = 0;  // 8-bit
        for (let i = 7; i >= 0; i--) {
            value = ((value << 1) ^ ((value >> 7) * 0x011D)) & 0xff;
            value ^= ((b >> i) & 1) * a;
        }
        return value;
    }

    // Reed-Solomon ECC generator polynomial for given degree
    static Divisor(degree) {
        const result = new Uint8Array(degree); // <= QrCode.ECC_CODEWORDS_MAX
        result.fill(0);
        result[degree - 1] = 1;
        let root = 1;   // 8-bit
        for (let i = 0; i < degree; i++) {
            for (let j = 0; j < degree; j++) {
                result[j] = ReedSolomon.Multiply(result[j], root);
                if (j + 1 < degree) {
                    result[j] ^= result[j + 1];
                }
            }
            root = ReedSolomon.Multiply(root, 0x02) & 0xff; // 8-bit
        }
        return result;
    }

    // Reed-Solomon ECC
    static Remainder(data, dataOffset, dataLen, generator, degree, result, resultOffset) {
        result.fill(0, resultOffset, resultOffset + degree);
        for (let i = 0; i < dataLen; i++) {
            let factor = data[dataOffset + i] ^ result[resultOffset + 0];
            // Move (degree-1) bytes from result[resultOffset+1] to result[resultOffset+0].
            result.copyWithin(resultOffset, resultOffset + 1, resultOffset + 1 + degree - 1)
            result[resultOffset + degree - 1] = 0;
            for (let j = 0; j < degree; j++) {
                result[resultOffset + j] ^= ReedSolomon.Multiply(generator[j], factor);
            }
        }
    }

}


// --- 2D Matrix ---

class Matrix {
    
    static MODULE_LIGHT = 0;
    static MODULE_DARK = 1;

    static FINDER_SIZE = 7;
    static TIMING_OFFSET = 6;
    static VERSION_SIZE = 3;
    static ALIGNMENT_RADIUS = 2;
    static QUIET_NONE = 0;
    static QUIET_STANDARD = 4;

    static calculateDimension(version) {
        return 17 + 4 * version; // V1=21x21; V40=177x177
    }

    static calculateMask(maskPattern, j, i) {
        switch (maskPattern)
        {
            case 0: return ((i + j) & 1) == 0;                          // QRCODE_MASK_000
            case 1: return (i & 1) == 0;                                // QRCODE_MASK_001
            case 2: return j % 3 == 0;                                  // QRCODE_MASK_010
            case 3: return (i + j) % 3 == 0;                            // QRCODE_MASK_011
            case 4: return (((i >> 1) + ((j / 3)|0)) & 1) == 0;         // QRCODE_MASK_100
            case 5: return ((i * j) & 1) + ((i * j) % 3) == 0;          // QRCODE_MASK_101
            case 6: return ((((i * j) & 1) + ((i * j) % 3)) & 1) == 0;  // QRCODE_MASK_110
            case 7: return ((((i * j) % 3) + ((i + j) & 1)) & 1) == 0;  // QRCODE_MASK_111
            default: return false;
        }
    }

    // Returns coordinates to be used in all combinations (unless overlapping finder pattern) as x/y pairs for alignment, <0: end
    static alignmentCoordinates(version) {
        const count = (version <= 1) ? 0 : Math.floor(version / 7) + 2;
        const coords = Array(count);
        const step = (version == 32) ? 26 : Math.floor((version * 4 + count * 2 + 1) / (count * 2 - 2)) * 2; // step to previous
        let location = version * 4 + 10;    // lower alignment marker
        for (let i = count - 1; i > 0; i--) {
            coords[i] = location;
            location -= step;
        }
        if (count > 0) coords[0] = 6;       // first alignment marker is at offset 6
        return coords;
    }

    constructor(version) {
        this.version = version;
        this.dimension = Matrix.calculateDimension(this.version);
        const capacity = this.dimension * this.dimension;
        this.buffer = new Array(capacity);
        this.identity = new Array(capacity);
        this.quiet = Matrix.QUIET_STANDARD;
        this.invert = false;
        this.text = null;
    }

    setModule(x, y, value, identity) {
        if (x < 0 || y < 0 || x >= this.dimension || y >= this.dimension) return;
        const index = y * this.dimension + x;
        this.buffer[index] = value;
        if (typeof identity !== 'undefined') this.identity[index] = identity;
    }

    getModule(x, y) {
        if (x < 0 || y < 0 || x >= this.dimension || y >= this.dimension) return null;
        const index = y * this.dimension + x;
        return this.buffer[index];
    }

    identifyModule(x, y) {
        if (x < 0 || y < 0 || x >= this.dimension || y >= this.dimension) return undefined;
        const index = y * this.dimension + x;
        return this.identity[index];
    }

    // Draw finder and separator
    drawFinder(ox, oy) {
        for (let y = -Math.floor(Matrix.FINDER_SIZE / 2) - 1; y <= Math.floor(Matrix.FINDER_SIZE / 2) + 1; y++) {
            for (let x = -Math.floor(Matrix.FINDER_SIZE / 2) - 1; x <= Math.floor(Matrix.FINDER_SIZE / 2) + 1; x++) {
                let value = (Math.abs(x) > Math.abs(y) ? Math.abs(x) : Math.abs(y)) & 1 ? Matrix.MODULE_DARK : Matrix.MODULE_LIGHT;
                if (x == 0 && y == 0) value = Matrix.MODULE_DARK;
                const id = (x == 0 && y == 0) ? 'FI' : 'Fi';
                this.setModule(ox + x, oy + y, value, id);
            }
        }    
    }

    drawTiming() {
        const id = 'Ti';
        for (let i = Matrix.FINDER_SIZE + 1; i < this.dimension - Matrix.FINDER_SIZE - 1; i++) {
            let value = (~i & 1) ? Matrix.MODULE_DARK : Matrix.MODULE_LIGHT;
            this.setModule(i, Matrix.TIMING_OFFSET, value, id);
            this.setModule(Matrix.TIMING_OFFSET, i, value, id);
        }
    }

    drawAlignment(ox, oy) {
        for (let y = -Matrix.ALIGNMENT_RADIUS; y <= Matrix.ALIGNMENT_RADIUS; y++) {
            for (let x = -Matrix.ALIGNMENT_RADIUS; x <= Matrix.ALIGNMENT_RADIUS; x++) {
                let value = 1 - ((Math.abs(x) > Math.abs(y) ? Math.abs(x) : Math.abs(y)) & 1) ? Matrix.MODULE_DARK : Matrix.MODULE_LIGHT;
                const id = (x == 0 && y == 0) ? 'AL' : 'Al';
                this.setModule(ox + x, oy + y, value, id);
            }
        }
    }

    // Populate the matrix with function patterns: finder, separators, timing, alignment, temporary version & format info
    populateFunctionPatterns() {
        this.drawFinder(Math.floor(Matrix.FINDER_SIZE / 2), Math.floor(Matrix.FINDER_SIZE / 2));
        this.drawFinder(this.dimension - 1 - Math.floor(Matrix.FINDER_SIZE / 2), Math.floor(Matrix.FINDER_SIZE / 2));
        this.drawFinder(Math.floor(Matrix.FINDER_SIZE / 2), this.dimension - 1 - Math.floor(Matrix.FINDER_SIZE / 2));

        this.drawTiming();

        const alignmentCoords = Matrix.alignmentCoordinates(this.version);

        for (let h of alignmentCoords) {
            for (let v of alignmentCoords) {
                if (h <= Matrix.FINDER_SIZE && v <= Matrix.FINDER_SIZE) continue;                        // Obscured by top-left finder
                if (h >= this.dimension - 1 - Matrix.FINDER_SIZE && v <= Matrix.FINDER_SIZE) continue;   // Obscured by top-right finder
                if (h <= Matrix.FINDER_SIZE && v >= this.dimension - 1 - Matrix.FINDER_SIZE) continue;   // Obscured by bottom-left finder
                this.drawAlignment(h, v);
            }
        }
        
        // Draw placeholder format/version info (so that masking does not affect these parts)
        this.drawFormatInfo(0);
        this.drawVersionInfo(0);
    }

    // Set the data drawing cursor to the start position (lower-right corner)
    cursorReset() {
        this.cursorX = this.dimension - 1;
        this.cursorY = this.dimension - 1;
    }
    
    // Advance the data drawing cursor to next position
    cursorAdvance() {
        while (this.cursorX >= 0) {
            // Right-hand side of 2-module column? (otherwise, left-hand side)
            if ((this.cursorX & 1) ^ (this.cursorX > Matrix.TIMING_OFFSET ? 1 : 0)) {
                this.cursorX--;
            } else { // Left-hand side
                this.cursorX++;
                // Upwards? (otherwise, downwards)
                if (((this.cursorX - (this.cursorX > Matrix.TIMING_OFFSET ? 1 : 0)) / 2) & 1) {
                    if (this.cursorY <= 0) this.cursorX -= 2;
                    else this.cursorY--;
                } else {
                    if (this.cursorY >= this.dimension - 1) this.cursorX -= 2;
                    else this.cursorY++;
                }
            }
            if (!this.identifyModule(this.cursorX, this.cursorY)) return true;
        }
        return false;
    }

    cursorWrite(buffer, sourceBit, countBits) {
        let index = sourceBit;
        for (let countWritten = 0; countWritten < countBits; countWritten++) {
            let bit = buffer.read(index);
            this.setModule(this.cursorX, this.cursorY, bit);
            index++;
            if (!this.cursorAdvance()) break;
        }
        return index - sourceBit;
    }

    // Draw 15-bit format information (2-bit error-correction level, 3-bit mask, 10-bit BCH error-correction; all masked)
    drawFormatInfo(value) {
        const id = 'Fo';
        for (let i = 0; i < 15; i++) {
            const v = (value >> i) & 1;

            // 15-bits starting LSB clockwise from top-left finder avoiding timing strips
            if (i < 6) this.setModule(Matrix.FINDER_SIZE + 1, i, v, id);
            else if (i == 6) this.setModule(Matrix.FINDER_SIZE + 1, Matrix.FINDER_SIZE, v, id);
            else if (i == 7) this.setModule(Matrix.FINDER_SIZE + 1, Matrix.FINDER_SIZE + 1, v, id);
            else if (i == 8) this.setModule(Matrix.FINDER_SIZE, Matrix.FINDER_SIZE + 1, v, id);
            else this.setModule(14 - i, Matrix.FINDER_SIZE + 1, v, id);

            // lower 8-bits starting LSB right-to-left underneath top-right finder
            if (i < 8) this.setModule(this.dimension - 1 - i, Matrix.FINDER_SIZE + 1, v, id);
            // upper 7-bits starting LSB top-to-bottom right of bottom-left finder
            else this.setModule(Matrix.FINDER_SIZE + 1, this.dimension - Matrix.FINDER_SIZE - 8 + i, v, id);
        }
        // dark module
        this.setModule(Matrix.FINDER_SIZE + 1, this.dimension - 1 - Matrix.FINDER_SIZE, Matrix.MODULE_DARK, id);
    }

    // Draw 18-bit version information (6-bit version number, 12-bit error-correction (18,6) Golay code)
    drawVersionInfo(value) {
        const id = 'Ve';
        // No version information on V1-V6
        if (value === null || this.version < 7) return;
        for (let i = 0; i < 18; i++) {
            const v = (value >> i) & 1;
            const col = Math.floor(i / Matrix.VERSION_SIZE);
            const row = i % Matrix.VERSION_SIZE;
            this.setModule(col, this.dimension - 1 - Matrix.FINDER_SIZE - Matrix.VERSION_SIZE + row, v, id);
            this.setModule(this.dimension - 1 - Matrix.FINDER_SIZE - Matrix.VERSION_SIZE + row, col, v, id);
        }
    }

    applyMaskPattern(maskPattern) {
        for (let y = 0; y < this.dimension; y++) {
            for (let x = 0; x < this.dimension; x++) {
                const part = this.identifyModule(x, y);
                if (!part) {
                    const mask = Matrix.calculateMask(maskPattern, x, y);
                    if (mask) {
                        const module = this.getModule(x, y);
                        const value = 1 ^ module;
                        this.setModule(x, y, value);
                    }
                }
            }
        }
    }

    evaluatePenalty() {
        // Note: Penalty calculated over entire code (although format information is not yet written)
        const scoreN1 = 3;
        const scoreN2 = 3;
        const scoreN3 = 40;
        const scoreN4 = 10;
        let totalPenalty = 0;

        // Feature 1: Adjacent identical modules in row/column: (5 + i) count, penalty points: N1 + i
        // Feature 3: 1:1:3:1:1 ratio patterns (either polarity) in row/column, penalty points: N3
        for (let swapAxis = 0; swapAxis <= 1; swapAxis++) {
            let runs = Array(5);
            let runsCount = 0;
            for (let y = 0; y < this.dimension; y++) {
                let lastBit = -1;
                let runLength = 0;
                for (let x = 0; x < this.dimension; x++) {
                    let bit = this.getModule(swapAxis ? y : x, swapAxis ? x : y);
                    // Run extended
                    if (bit == lastBit) runLength++;
                    // End of run
                    if (bit != lastBit || x >= this.dimension - 1) {
                        // If not start condition
                        if (lastBit >= 0) {
                            // Feature 1
                            if (runLength >= 5) { // or should this be strictly greater-than?
                                totalPenalty += scoreN1 + (runLength - 5);
                            }

                            // Feature 3
                            runsCount++;
                            runs[runsCount % 5] = runLength;
                            // Once we have a history of 5 lengths, check proportion
                            if (runsCount >= 5) {
                                // Proportion:             1 : 1 : 3 : 1 : 1
                                // Modulo relative index: +3, +4,  0, +1, +2
                                // Check for proportions
                                let v = runs[(runsCount + 1) % 5];
                                if (runs[runsCount % 5] == 3 * v && v == runs[(runsCount + 2) % 5] && v == runs[(runsCount + 3) % 5] && v == runs[(runsCount + 4) % 5]) {
                                    totalPenalty += scoreN3;
                                }
                            }
                        }
                        runLength = 1;
                        lastBit = bit;
                    }
                }
            }
        }

        // Feature 2: Block of identical modules: m * n size, penalty points: N2 * (m-1) * (n-1)
        // (fix from @larsbrinkhoff pull request #3 to danielgjackson/qrcode)
        for (let y = 0; y < this.dimension - 1; y++) {
            for (let x = 0; x < this.dimension - 1; x++) {
                let bits = this.getModule(x, y);
                bits += this.getModule(x+1, y);
                bits += this.getModule(x, y+1);
                bits += this.getModule(x+1, y+1);
                if (bits == 0 || bits == 4) totalPenalty += scoreN2;
            }
        }

        // Feature 4: Dark module percentage: 50 +|- (5*k) to 50 +|- (5*(k+1)), penalty points: N4 * k
        {
            let darkCount = 0;
            for (let y = 0; y < this.dimension; y++) {
                for (let x = 0; x < this.dimension; x++) {
                    let bit = this.getModule(x, y);
                    if (bit == Matrix.MODULE_DARK) darkCount++;
                }
            }
            // Deviation from 50%
            let percentage = (100 * darkCount + (this.dimension * this.dimension / 2)) / (this.dimension * this.dimension);
            let deviation = Math.abs(percentage - 50);
            let rating = Math.floor(deviation / 5);
            let penalty = scoreN4 * rating;
            totalPenalty += penalty;
        }

        return totalPenalty;
    }

}


class QrCode {

    static VERSION_MIN = 1;
    static VERSION_MAX = 40;

    // In ascending order of robustness
    static ErrorCorrectionLevel = {
        L: 0x01, // 0b01 Low (~7%)
        M: 0x00, // 0b00 Medium (~15%)
        Q: 0x03, // 0b11 Quartile (~25%)
        H: 0x02, // 0b10 High (~30%)
    };

    static ECC_CODEWORDS_MAX = 30;
    static PAD_CODEWORDS = 0xec11; // Pad codewords 0b11101100=0xec 0b00010001=0x11

    // Calculate the (square) dimension for a version. V1=21x21; V40=177x177.
    static dimension(version) {
        return 17 + 4 * version;
    }

    // Calculate the total number of data modules in a version (raw: data, ecc and remainder bits); does not include finder/alignment/version/timing.
    static totalDataModules(version) {
        return (((16 * version + 128) * version) + 64 - (version < 2 ? 0 : (25 * (Math.floor(version / 7) + 2) - 10) * (Math.floor(version / 7) + 2) - 55) - (version < 7 ? 0 : 36));
    }

    // Calculate the total number of data bits available in the codewords (cooked: after ecc and remainder)
    static dataCapacity(version, errorCorrectionLevel) {
        const capacityCodewords = Math.floor(QrCode.totalDataModules(version) / 8);
        const eccTotalCodewords = QrCode.eccBlockCodewords(version, errorCorrectionLevel) * QrCode.eccBlockCount(version, errorCorrectionLevel);
        const dataCapacityCodewords = capacityCodewords - eccTotalCodewords;
        return dataCapacityCodewords * 8;
    }

    // Number of error correction blocks
    static eccBlockCount(version, errorCorrectionLevel) {
        const eccBlockCountLookup = [
            [ 0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5,  5,  8,  9,  9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49 ],    // 0b00 Medium
            [ 0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4,  4,  4,  4,  4,  6,  6,  6,  6,  7,  8,  8,  9,  9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25 ],    // 0b01 Low
            [ 0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81 ],    // 0b10 High
            [ 0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8,  8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68 ],    // 0b11 Quartile
        ];
        return eccBlockCountLookup[errorCorrectionLevel][version];
    }

    // Number of error correction codewords in each block
    static eccBlockCodewords(version, errorCorrectionLevel) {
        const eccBlockCodewordsLookup = [
            [ 0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28 ],  // 0b00 Medium
            [ 0,  7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30 ],  // 0b01 Low
            [ 0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30 ],  // 0b10 High
            [ 0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30 ],  // 0b11 Quartile
        ];
        return eccBlockCodewordsLookup[errorCorrectionLevel][version];
    }

    // Calculate 18-bit version information (6-bit version number, 12-bit error-correction (18,6) Golay code)
    static calculateVersionInfo(version) {
        if (version < 7) return null;
        // Calculate 12-bit error-correction (18,6) Golay code
        let golay = version;
        for (let i = 0; i < 12; i++) golay = (golay << 1) ^ ((golay >>> 11) * 0x1f25);
        const value = (version << 12) | golay;
        return value;
    }

    // Calculate 15-bit format information (2-bit error-correction level, 3-bit mask, 10-bit BCH error-correction; all masked)
    static calculateFormatInfo(errorCorrectionLevel, maskPattern) {
        // TODO: Reframe in terms of QRCODE_SIZE_ECL (2) and QRCODE_SIZE_MASK (3)

        // LLMMM
        const value = ((errorCorrectionLevel & 0x03) << 3) | (maskPattern & 0x07);

        // Calculate 10-bit Bose-Chaudhuri-Hocquenghem (15,5) error-correction
        let bch = value;
        for (let i = 0; i < 10; i++) bch = (bch << 1) ^ ((bch >>> 9) * 0x0537);

        // 0LLMMMEEEEEEEEEE
        let format = (value << 10) | (bch & 0x03ff);
        const formatMask = 0x5412;   // 0b0101010000010010
        format ^= formatMask;

        return format;
    }


    // Total number of data bits used (may later require 0-padding to a byte boundary and padding bytes added)
    static measureSegments(segments, version) {
        let total = 0;
        for (let segment of segments) {
            total += segment.mode.totalSize(version, segment.text);
        }
        return total;
    }

    static doSegmentsFit(segments, version, errorCorrectionLevel) {
        const sizeBits = QrCode.measureSegments(segments, version);
        const dataCapacity = QrCode.dataCapacity(version, errorCorrectionLevel);
        return sizeBits <= dataCapacity;
    }

    static findMinimumVersion(segments, errorCorrectionLevel, minVersion = QrCode.VERSION_MIN, maxVersion = QrCode.VERSION_MAX) {
        for (let version = minVersion; version <= maxVersion; version++) {
            if (QrCode.doSegmentsFit(segments, version, errorCorrectionLevel)) {
                return version;
            }
        }
        throw 'Cannot fit data in any allowed versions';
    }

    static tryToImproveErrorCorrectionLevel(segments, version, currentErrorCorrectionLevel) {
        const ranking = Object.values(QrCode.ErrorCorrectionLevel);
        for (let i = 1; i < ranking.length; i++) {
            if (currentErrorCorrectionLevel == ranking[i - 1]) {
                if (QrCode.doSegmentsFit(segments, version, ranking[i])) {
                    currentErrorCorrectionLevel = ranking[i];
                }
            }
        }
        return currentErrorCorrectionLevel;
    }

    // Write segments: header/count/payload
    static writeData(scratchBuffer, version, segments) {   
        // Add segments (mode, count and data)
        for (let segment of segments) {
            segment.mode.encode(scratchBuffer, version, segment.text);
        }
    }

    // Finish segments: given the available space, write terminator, rounding bits, and padding codewords
    static writePadding(scratchBuffer, version, errorCorrectionLevel) {   

        // The total number of data bits available in the codewords (cooked: after ecc and remainder)
        const dataCapacity = QrCode.dataCapacity(version, errorCorrectionLevel)

        // Write only in capacity in any available space
        let remaining;

        // Add terminator 4-bit (0b0000)
        remaining = Math.min(dataCapacity - scratchBuffer.position(), Segment.MODE_BITS);
        scratchBuffer.append(Segment.MODE_INDICATOR_TERMINATOR, remaining);  // all zeros so won't be misaligned by partial write

        // Remainder bits to round up to a whole byte
        remaining = Math.min(dataCapacity - scratchBuffer.position(), (8 - (scratchBuffer.position() & 7)) & 7);
        scratchBuffer.append(0x00, remaining);  // all zeros so won't be misaligned by partial write

        // Remainder padding codewords 
        while ((remaining = Math.min(dataCapacity - scratchBuffer.position(), 16)) > 0) {
            scratchBuffer.append(QrCode.PAD_CODEWORDS >> (16 - remaining), remaining); // align for partial write
        }
        
        // Check position matches expectation
        console.assert(scratchBuffer.position() === dataCapacity, 'Unexpectedly failed to correctly fill the data buffer');
    }


    // Calculate ECC data at the end of the codewords
    // ...and fill the matrix
    // TODO: Split this function into two (but depends on a lot of calculated state)
    static calculateEccAndFillMatrix(scratchBuffer, version, errorCorrectionLevel, matrix) {
        // Number of error correction blocks
        const eccBlockCount = QrCode.eccBlockCount(version, errorCorrectionLevel);

        // Number of error correction codewords in each block
        const eccCodewords = QrCode.eccBlockCodewords(version, errorCorrectionLevel);

        // The total number of data modules in a version (raw: data, ecc and remainder bits); does not include finder/alignment/version/timing.
        const totalCapacity = QrCode.totalDataModules(version);

        // Codeword (byte) position in buffer for ECC data
        const eccOffset = Math.floor((totalCapacity - (8 * eccCodewords * eccBlockCount)) / 8);

        console.assert(8 * eccOffset === scratchBuffer.bitOffset, `Expected current bit position ${scratchBuffer.bitOffset} to match ECC offset *8 ${8 * eccOffset}`);

        // Calculate Reed-Solomon divisor
        const eccDivisor = ReedSolomon.Divisor(eccCodewords);

        const dataCapacityBytes = eccOffset;
        const dataLenShort = Math.floor(dataCapacityBytes / eccBlockCount);
        const countShortBlocks = (eccBlockCount - (dataCapacityBytes - (dataLenShort * eccBlockCount)));
        const dataLenLong = dataLenShort + (countShortBlocks >= eccBlockCount ? 0 : 1);
        for (let block = 0; block < eccBlockCount; block++) {
            // Calculate offset and length (earlier consecutive blocks may be short by 1 codeword)
            let dataOffset;
            if (block < countShortBlocks) {
                dataOffset = block * dataLenShort;
            } else {
                dataOffset = block * dataLenShort + (block - countShortBlocks);
            }
            let dataLen = dataLenShort + (block < countShortBlocks ? 0 : 1);
            // Calculate this block's ECC
            let eccDest = eccOffset + (block * eccCodewords);
            ReedSolomon.Remainder(scratchBuffer.buffer, dataOffset, dataLen, eccDivisor, eccCodewords, scratchBuffer.buffer, eccDest);
        }


        // Fill the matrix with data

        // Write the codewords interleaved between blocks
        matrix.cursorReset();
        let totalWritten = 0;

        // Write data codewords interleaved across ecc blocks -- some early blocks may be short
        for (let i = 0; i < dataLenLong; i++) {
            for (let block = 0; block < eccBlockCount; block++) {
                // Calculate offset and length (earlier consecutive blocks may be short by 1 codeword)
                // Skip codewords due to short block
                if (i >= dataLenShort && block < countShortBlocks) continue;
                const codeword = (block * dataLenShort) + (block > countShortBlocks ? block - countShortBlocks : 0) + i;
                const sourceBit = codeword * 8;
                const countBits = 8;
                totalWritten += matrix.cursorWrite(scratchBuffer, sourceBit, countBits);
            }
        }

        // Write ECC codewords interleaved across ecc blocks
        for (let i = 0; i < eccCodewords; i++) {
            for (let block = 0; block < eccBlockCount; block++) {
                const sourceBit = 8 * eccOffset + (block * eccCodewords * 8) + (i * 8);
                const countBits = 8;
                totalWritten += matrix.cursorWrite(scratchBuffer, sourceBit, countBits);
            }
        }

        // Add any remainder 0 bits (could be 0/3/4/7)
        const bit = Matrix.MODULE_LIGHT;
        while (totalWritten < totalCapacity) {
            matrix.setModule(matrix.cursorX, matrix.cursorY, bit);
            totalWritten++;
            if (!matrix.cursorAdvance()) break;
        }

    }
  

    //
    static findOptimalMaskPattern(matrix, errorCorrectionLevel) {
        let lowestPenalty = -1;
        let bestMaskPattern = null;
        for (let maskPattern = 0; maskPattern <= 7; maskPattern++) {
            // XOR mask pattern
            matrix.applyMaskPattern(maskPattern);

            // Write format information before evaluating penalty
            // (fix from @larsbrinkhoff pull request #2 to danielgjackson/qrcode)
            const formatInfo = QrCode.calculateFormatInfo(errorCorrectionLevel, maskPattern);
            matrix.drawFormatInfo(formatInfo);

            // Find penalty score for this mask pattern
            const penalty = matrix.evaluatePenalty();

            // XOR same mask removes it
            matrix.applyMaskPattern(maskPattern);

            // See if this is the best so far
            if (lowestPenalty < 0 || penalty < lowestPenalty) {
                lowestPenalty = penalty;
                bestMaskPattern = maskPattern;
            }
        }
        return bestMaskPattern;       
    }


    constructor() {
    }

    static generate(text, userOptions) {

        // Generation options
        const options = Object.assign({
            errorCorrectionLevel: QrCode.ErrorCorrectionLevel.M,
            minVersion: QrCode.VERSION_MIN,
            maxVersion: QrCode.VERSION_MAX,
            optimizeEcc: true,
            maskPattern: null,
            quiet: Matrix.QUIET_STANDARD,   // only information for the renderer
            invert: false,                  // only a flag for the renderer
        }, userOptions)

        // Allow either a single text string or an array of text strings likely to encode as different modes
        const textArray = Array.isArray(text) ? text : [text];

        // Create a segment for the text, each with its own best-fit encoding mode
        const segments = textArray.map(text => new Segment(text));

        // Fit the payload to a version (dimension)
        let errorCorrectionLevel = options.errorCorrectionLevel;
        const version = QrCode.findMinimumVersion(segments, errorCorrectionLevel, options.minVersion, options.maxVersion);
        
        // Try to find a better error correction level for the given size
        if (options.optimizeEcc) {
            errorCorrectionLevel = QrCode.tryToImproveErrorCorrectionLevel(segments, version, errorCorrectionLevel);
        }

        // 'scratchBuffer' to contain the entire data bitstream for the QR Code
        // (payload with headers, terminator, rounding bits, padding modules, ECC, remainder bits)
        const totalCapacity = QrCode.totalDataModules(version); // The total number of data modules in a version (raw: data, ecc and remainder bits); does not include finder/alignment/version/timing.
        const scratchBuffer = new BitBuffer(totalCapacity);

        // Write segments: header/count/payload
        QrCode.writeData(scratchBuffer, version, segments);

        // Finish segments: given the available space, write terminator, rounding bits, and padding codewords
        QrCode.writePadding(scratchBuffer, version, errorCorrectionLevel);

        // Create an empty matrix
        const matrix = new Matrix(version);
        matrix.text = text;
        matrix.quiet = options.quiet;
        matrix.invert = options.invert;

        // Populate the matrix with function patterns: finder, separators, timing, alignment, temporary version & format info
        matrix.populateFunctionPatterns();

        // Calculate ECC and fill matrix
        QrCode.calculateEccAndFillMatrix(scratchBuffer, version, errorCorrectionLevel, matrix);

        // Calculate the optimal mask pattern
        let maskPattern = options.maskPattern;
        if (maskPattern === null) {
            maskPattern = QrCode.findOptimalMaskPattern(matrix, errorCorrectionLevel);
        }

        // Apply the chosen mask pattern
        matrix.applyMaskPattern(maskPattern);

        // Populate the matrix with version information
        const versionInfo = QrCode.calculateVersionInfo(version);
        matrix.drawVersionInfo(versionInfo);

        // Fill-in format information
        const formatInfo = QrCode.calculateFormatInfo(errorCorrectionLevel, maskPattern);
        matrix.drawFormatInfo(formatInfo);

        return matrix;
    }

    static render(mode, matrix, renderOptions) {
        const renderers = {
            'debug': renderDebug,
            'large': renderTextLarge,
            'medium': renderTextMedium,
            'compact': renderTextCompact,
            'svg': renderSvg,
            'svg-uri': renderSvgUri,
            'bmp': renderBmp,
            'bmp-uri': renderBmpUri,
        };
        if (!renderers[mode]) throw new Error('ERROR: Invalid render mode: ' + mode);
        return renderers[mode](matrix, renderOptions);
    }

}

// Generate a bitmap from an array of [R,G,B] or [R,G,B,A] pixels
function BitmapGenerate(data, width, height, alpha = false) {
    const bitsPerPixel = alpha ? 32 : 24;
    const fileHeaderSize = 14;
    const bmpHeaderSizeByVersion = {
        BITMAPCOREHEADER: 12,
        BITMAPINFOHEADER: 40,
        BITMAPV2INFOHEADER: 52,
        BITMAPV3INFOHEADER: 56,
        BITMAPV4HEADER: 108,
        BITMAPV5HEADER: 124,
    };
    const version = alpha ? 'BITMAPV4HEADER' : 'BITMAPCOREHEADER'; // V3 provides alpha on Chrome, but V4 required for Firefox
    if (!bmpHeaderSizeByVersion.hasOwnProperty(version))
        throw `Unknown BMP header version: ${version}`;
    const bmpHeaderSize = bmpHeaderSizeByVersion[version];
    const stride = 4 * Math.floor((width * Math.floor((bitsPerPixel + 7) / 8) + 3) / 4); // Byte width of each line
    const biSizeImage = stride * Math.abs(height); // Total number of bytes that will be written
    const bfOffBits = fileHeaderSize + bmpHeaderSize; // + paletteSize
    const bfSize = bfOffBits + biSizeImage;
    const buffer = new ArrayBuffer(bfSize);
    const view = new DataView(buffer);
    // Write 14-byte BITMAPFILEHEADER
    view.setUint8(0, 'B'.charCodeAt(0));
    view.setUint8(1, 'M'.charCodeAt(0)); // @0 WORD bfType
    view.setUint32(2, bfSize, true); // @2 DWORD bfSize
    view.setUint16(6, 0, true); // @6 WORD bfReserved1
    view.setUint16(8, 0, true); // @8 WORD bfReserved2
    view.setUint32(10, bfOffBits, true); // @10 DWORD bfOffBits
    if (bmpHeaderSize == bmpHeaderSizeByVersion.BITMAPCOREHEADER) { // (14+12=26) BITMAPCOREHEADER
        view.setUint32(14, bmpHeaderSize, true); // @14 DWORD biSize
        view.setUint16(18, width, true); // @18 WORD biWidth
        view.setInt16(20, height, true); // @20 WORD biHeight
        view.setUint16(22, 1, true); // @26 WORD biPlanes
        view.setUint16(24, bitsPerPixel, true); // @28 WORD biBitCount
    }
    else if (bmpHeaderSize >= bmpHeaderSizeByVersion.BITMAPINFOHEADER) { // (14+40=54) BITMAPINFOHEADER
        view.setUint32(14, bmpHeaderSize, true); // @14 DWORD biSize
        view.setUint32(18, width, true); // @18 DWORD biWidth
        view.setInt32(22, height, true); // @22 DWORD biHeight
        view.setUint16(26, 1, true); // @26 WORD biPlanes
        view.setUint16(28, bitsPerPixel, true); // @28 WORD biBitCount
        view.setUint32(30, alpha ? 3 : 0, true); // @30 DWORD biCompression (0=BI_RGB, 3=BI_BITFIELDS, 6=BI_ALPHABITFIELDS on Win-CE-5)
        view.setUint32(34, biSizeImage, true); // @34 DWORD biSizeImage
        view.setUint32(38, 2835, true); // @38 DWORD biXPelsPerMeter
        view.setUint32(42, 2835, true); // @42 DWORD biYPelsPerMeter
        view.setUint32(46, 0, true); // @46 DWORD biClrUsed
        view.setUint32(50, 0, true); // @50 DWORD biClrImportant
    }
    if (bmpHeaderSize >= bmpHeaderSizeByVersion.BITMAPV2INFOHEADER) { // (14+52=66) BITMAPV2INFOHEADER (+RGB BI_BITFIELDS)
        view.setUint32(54, alpha ? 0x00ff0000 : 0x00000000, true); // @54 DWORD bRedMask
        view.setUint32(58, alpha ? 0x0000ff00 : 0x00000000, true); // @58 DWORD bGreenMask
        view.setUint32(62, alpha ? 0x000000ff : 0x00000000, true); // @62 DWORD bBlueMask
    }
    if (bmpHeaderSize >= bmpHeaderSizeByVersion.BITMAPV3INFOHEADER) { // (14+56=70) BITMAPV3INFOHEADER (+A BI_BITFIELDS)
        view.setUint32(66, alpha ? 0xff000000 : 0x00000000, true); // @66 DWORD bAlphaMask
    }
    if (bmpHeaderSize >= bmpHeaderSizeByVersion.BITMAPV4HEADER) { // (14+108=122) BITMAPV4HEADER (color space and gamma correction)
        const colorSpace = "Win "; // "BGRs";       // @ 70 DWORD bCSType
        view.setUint8(70, colorSpace.charCodeAt(0));
        view.setUint8(71, colorSpace.charCodeAt(1));
        view.setUint8(72, colorSpace.charCodeAt(2));
        view.setUint8(73, colorSpace.charCodeAt(3));
        // @74 sizeof(CIEXYZTRIPLE)=36 (can be left empty for "Win ")
        view.setUint32(110, 0, true); // @110 DWORD bGammaRed
        view.setUint32(114, 0, true); // @114 DWORD bGammaGreen
        view.setUint32(118, 0, true); // @118 DWORD bGammaBlue
    }
    if (bmpHeaderSize >= bmpHeaderSizeByVersion.BITMAPV5HEADER) { // (14+124=138) BITMAPV5HEADER (ICC color profile)
        view.setUint32(122, 0x4, true); // @122 DWORD bIntent (0x1=LCS_GM_BUSINESS, 0x2=LCS_GM_GRAPHICS, 0x4=LCS_GM_IMAGES, 0x8=LCS_GM_ABS_COLORIMETRIC)
        view.setUint32(126, 0, true); // @126 DWORD bProfileData
        view.setUint32(130, 0, true); // @130 DWORD bProfileSize
        view.setUint32(134, 0, true); // @134 DWORD bReserved
    }
    // If there was one, write the palette here (fileHeaderSize + bmpHeaderSize)
    // Write pixels
    for (let y = 0; y < height; y++) {
        let offset = bfOffBits + (height - 1 - y) * stride;
        for (let x = 0; x < width; x++) {
            const value = data[y * width + x];
            view.setUint8(offset + 0, value[2]); // B
            view.setUint8(offset + 1, value[1]); // G
            view.setUint8(offset + 2, value[0]); // R
            if (alpha) {
                view.setUint8(offset + 3, value[3]); // A
                offset += 4;
            }
            else {
                offset += 3;
            }
        }
    }
    return buffer;
}


function renderDebug(matrix, options) {
    options = Object.assign({
        segments: ['  ', '██'],
        sep: '\n',
    }, options);
    const lines = [];
    for (let y = -matrix.quiet; y < matrix.dimension + matrix.quiet; y++) {
        const parts = [];
        for (let x = -matrix.quiet; x < matrix.dimension + matrix.quiet; x++) {
            let part = matrix.identifyModule(x, y);
            const bit = matrix.getModule(x, y) ? !matrix.invert : matrix.invert;
            const value = bit ? 1 : 0;
            if (typeof part == 'undefined' || part === null) part = options.segments[value];
            parts.push(part);
        }
        lines.push(parts.join(''));
    }    
    return lines.join(options.sep);
}

function renderTextLarge(matrix, options) {
    options = Object.assign({
        segments: ['  ', '██'],
        sep: '\n',
    }, options);
    const lines = [];
    for (let y = -matrix.quiet; y < matrix.dimension + matrix.quiet; y++) {
        const parts = [];
        for (let x = -matrix.quiet; x < matrix.dimension + matrix.quiet; x++) {
            const bit = matrix.getModule(x, y) ? !matrix.invert : matrix.invert;
            const value = bit ? 1 : 0;
            // If an additional segment type is specified, use it to identify data modules differently
            const chars = (options.segments.length >= 3 && bit && !matrix.identifyModule(x, y)) ? options.segments[2] : options.segments[value];
            parts.push(chars);
        }
        lines.push(parts.join(''));
    }    
    return lines.join(options.sep);
}

function renderTextMedium(matrix, options) {
    options = Object.assign({
        segments: [' ', '▀', '▄', '█'],
        sep: '\n',
    }, options);
    const lines = [];
    for (let y = -matrix.quiet; y < matrix.dimension + matrix.quiet; y += 2) {
        const parts = [];
        for (let x = -matrix.quiet; x < matrix.dimension + matrix.quiet; x++) {
            const upper = matrix.getModule(x, y) ? !matrix.invert : matrix.invert;
            const lower = (y + 1 < matrix.dimension ? matrix.getModule(x, y + 1) : 0) ? !matrix.invert : matrix.invert;
            const value = (upper ? 0x01 : 0) | (lower ? 0x02 : 0);
            // '▀', '▄', '█' // '\u{0020}' space, '\u{2580}' upper half block, '\u{2584}' lower half block, '\u{2588}' block
            const c = options.segments[value];
            parts.push(c);
        }
        lines.push(parts.join(''));
    }    
    return lines.join(options.sep);
}

function renderTextCompact(matrix, options) {
    options = Object.assign({
        segments: [' ', '▘', '▝', '▀', '▖', '▌', '▞', '▛', '▗', '▚', '▐', '▜', '▄', '▙', '▟', '█'],
        sep: '\n',
    }, options);
    const lines = [];
    for (let y = -matrix.quiet; y < matrix.dimension + matrix.quiet; y += 2) {
        const parts = [];
        for (let x = -matrix.quiet; x < matrix.dimension + matrix.quiet; x += 2) {
            let value = 0;
            value |= (matrix.getModule(x, y) ? !matrix.invert : matrix.invert) ? 0x01 : 0x00;
            value |= (((x + 1 < matrix.dimension) ? matrix.getModule(x + 1, y) : 0) ? !matrix.invert : matrix.invert) ? 0x02 : 0x00;
            value |= (((y + 1 < matrix.dimension) ? matrix.getModule(x, y + 1) : 0) ? !matrix.invert : matrix.invert) ? 0x04 : 0x00;
            value |= (((y + 1 < matrix.dimension) && (x + 1 < matrix.dimension) ? matrix.getModule(x + 1, y + 1) : 0) ? !matrix.invert : matrix.invert) ? 0x08 : 0x00;
            let c = options.segments[value];
            parts.push(c);
        }
        lines.push(parts.join(''));
    }    
    return lines.join(options.sep);
}

function escape(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/\'/g, "&apos;");
}

function renderSvg(matrix, options) {
    options = Object.assign({
        moduleRound: null,
        finderRound: null,
        alignmentRound: null,
        white: false,    // Output an element for every module, not just black/dark ones but white/light ones too.
        moduleSize: 1,
    }, options);
    
    const vbTopLeft = `${-matrix.quiet - options.moduleSize / 2}`;
    const vbWidthHeight = `${2 * (matrix.quiet + options.moduleSize / 2) + matrix.dimension - 1}`;
    
    const lines = [];
    lines.push(`<?xml version="1.0"?>`);
    // viewport-fill=\"white\" 
    lines.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" fill="currentColor" viewBox="${vbTopLeft} ${vbTopLeft} ${vbWidthHeight} ${vbWidthHeight}" shape-rendering="crispEdges">`);
    lines.push(`<title>${escape(matrix.text)}</title>`);
    //lines.push(`<desc>${escape(matrix.text)}</desc>`);
    lines.push(`<defs>`);

    // module data bit (dark)
    lines.push(`<rect id="b" x="${-options.moduleSize / 2}" y="${-options.moduleSize / 2}" width="${options.moduleSize}" height="${options.moduleSize}" rx="${0.5 * (options.moduleRound || 0) * options.moduleSize}" />`);

    // module data bit (light). 
    if (options.white) { // Light modules as a ref to a placeholder empty element
        lines.push(`<path id="w" d="" visibility="hidden" />`);
    }

    // Use one item for the finder marker
    if (options.finderRound != null) {
        // Hide finder module, use finder part
        lines.push(`<path id="f" d="" visibility="hidden" />`);
        if (options.white) lines.push(`<path id="fw" d="" visibility="hidden" />`);
        lines.push(`<g id="fc"><rect x="-3" y="-3" width="6" height="6" rx="${3.0 * options.finderRound}" stroke="currentColor" stroke-width="1" fill="none" /><rect x="-1.5" y="-1.5" width="3" height="3" rx="${1.5 * options.finderRound}" /></g>`);
        lines.push(`<g id="fc"><rect x="-3" y="-3" width="6" height="6" rx="${3.0 * options.finderRound}" stroke="currentColor" stroke-width="1" fill="none" /><rect x="-1.5" y="-1.5" width="3" height="3" rx="${1.5 * options.finderRound}" /></g>`);
    } else {
        // Use normal module for finder module, hide finder part
        lines.push(`<use id="f" xlink:href="#b" />`);
        if (options.white) lines.push(`<use id="fw" xlink:href="#w" />`);
        lines.push(`<path id="fc" d="" visibility="hidden" />`);
    }

    // Use one item for the alignment marker
    if (options.alignmentRound != null) {
        // Hide alignment module, use alignment part
        lines.push(`<path id="a" d="" visibility="hidden" />`);
        if (options.white) lines.push(`<path id="aw" d="" visibility="hidden" />`);
        lines.push(`<g id="ac"><rect x="-2" y="-2" width="4" height="4" rx="${2.0 * options.alignmentRound}" stroke="currentColor" stroke-width="1" fill="none" /><rect x="-0.5" y="-0.5" width="1" height="1" rx="${0.5 * options.alignmentRound}" /></g>`);
    } else {
        // Use normal module for alignment module, hide alignment part
        lines.push(`<use id="a" xlink:href="#b" />`);
        if (options.white) lines.push(`<use id="aw" xlink:href="#w" />`);
        lines.push(`<path id="ac" d="" visibility="hidden" />`);
    }

    lines.push(`</defs>`);

    for (let y = 0; y < matrix.dimension; y++) {
        for (let x = 0; x < matrix.dimension; x++) {
            const mod = matrix.identifyModule(x, y);
            let bit = matrix.getModule(x, y);
            // IMPORTANT: Inverting the output for SVGs will not be correct if a single finder pattern is used (it would need inverting)
            if (matrix.invert) bit = !bit;
            let type = bit ? 'b' : 'w';

            // Draw finder/alignment as modules (define to nothing if drawing as whole parts)
            if (mod == 'Fi' || mod == 'FI') { type = bit ? 'f' : 'fw'; }
            else if (mod == 'Al' || mod == 'AL') { type = bit ? 'a' : 'aw'; }

            if (bit || options.white) {
                lines.push(`<use x="${x}" y="${y}" xlink:href="#${type}" />`);
            }
        }
    }

    // Draw finder/alignment as whole parts (define to nothing if drawing as modules)
    for (let y = 0; y < matrix.dimension; y++) {
        for (let x = 0; x < matrix.dimension; x++) {
            const mod = matrix.identifyModule(x, y);
            let type = null;
            if (mod == 'FI') type = 'fc';
            else if (mod == 'AL') type = 'ac';
            if (type == null) continue;
            lines.push(`<use x="${x}" y="${y}" xlink:href="#${type}" />`);
        }
    }

    lines.push(`</svg>`);

    const svgString = lines.join('\n');
    return svgString;
}

function renderSvgUri(matrix, options) {
    return 'data:image/svg+xml,' + encodeURIComponent(renderSvg(matrix, options));
}

function renderBmp(matrix, options) {
    options = Object.assign({
        scale: 8,
        alpha: false,
        width: null,
        height: null,
    }, options);
    const size = matrix.dimension + 2 * matrix.quiet;
    if (options.width === null) options.width = Math.floor(size * options.scale);
    if (options.height === null) options.height = options.width;

    const colorData = Array(options.width * options.height).fill(null);
    for (let y = 0; y < options.height; y++) {
        const my = Math.floor(y * size / options.height) - matrix.quiet;
        for (let x = 0; x < options.width; x++) {
            const mx = Math.floor(x * size / options.width) - matrix.quiet;
            let bit = matrix.getModule(mx, my);
            let color;
            if (matrix.invert) {
                color = bit ? [255, 255, 255, 255] : [0, 0, 0, 0];
            } else {
                color = bit ? [0, 0, 0, 255] : [255, 255, 255, 0];
            }
            colorData[y * options.width + x] = color;
        }
    }

    const bmpData = BitmapGenerate(colorData, options.width, options.height, options.alpha);
    return bmpData;
}

function renderBmpUri(matrix, options) {
    const bmpData = renderBmp(matrix, options);
    const encoded = btoa(new Uint8Array(bmpData).reduce((data, v) => data + String.fromCharCode(v), ''))
    return 'data:image/bmp;base64,' + encoded;
}


// Comment-out the following line to convert this into a non-module .js file (e.g. for use in a <script src> tag over the file: protocol)
export default QrCode
