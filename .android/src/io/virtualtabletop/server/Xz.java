package io.virtualtabletop.server;

import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.util.Arrays;

/**
 * Decodes xz streams that use a single LZMA2 filter, which is how the data of a Debian package -
 * and therefore of every package this app installs - is compressed. Android has no xz decoder in
 * its API and the app deliberately ships no libraries, so this is how the packages get unpacked.
 *
 * The check value at the end of a block is skipped - a package is verified through the SHA-256 the
 * repository index states for it before it is unpacked at all - but the number of bytes a block
 * says it holds is compared against what came out of it, so a decoding error cannot pass as a
 * shorter file.
 */
final class Xz extends InputStream {
  private static final int LZMA2_FILTER = 0x21;
  private static final int STATES = 12;
  private static final int POSITION_STATES = 16;
  private static final int LITERAL_CODERS = 0x300;
  private static final int MATCH_MINIMUM = 2;
  private static final int PROBABILITY_INITIAL = 1024;
  private static final int MAXIMUM_DICTIONARY = 1 << 26;
  private static final int[] CHECK_SIZES = { 0, 4, 4, 4, 8, 8, 8, 16, 16, 16, 32, 32, 32, 64, 64, 64 };

  private final InputStream in;
  private int checkSize;
  private long blockBytes;
  private long blockOutput;
  private long blockOutputExpected;
  private boolean blockDone;
  private boolean streamDone;

  /** the sliding window matches are copied from, written circularly */
  private byte[] dictionary = new byte[0];
  private int dictionaryPosition;
  private int dictionaryStart;
  private int dictionaryFull;

  /** the chunk being decoded, held as a whole because LZMA2 chunks are at most 64 KiB */
  private final byte[] chunk = new byte[1 << 16];
  private int chunkPosition;
  private int chunkRemaining;
  private boolean chunkIsUncompressed;

  private int range;
  private int code;

  private int literalContextBits;
  private int literalPositionBits;
  private int positionBits;
  private int state;
  private int rep0;
  private int rep1;
  private int rep2;
  private int rep3;
  private int pendingLength;
  private int pendingDistance;

  private short[] literal;
  private final short[] isMatch = new short[STATES * POSITION_STATES];
  private final short[] isRep = new short[STATES];
  private final short[] isRepG0 = new short[STATES];
  private final short[] isRepG1 = new short[STATES];
  private final short[] isRepG2 = new short[STATES];
  private final short[] isRep0Long = new short[STATES * POSITION_STATES];
  private final short[] distanceSlot = new short[4 * 64];
  private final short[] distanceAlign = new short[16];
  private final short[][] distanceSpecial = {
    new short[2], new short[2], new short[4], new short[4], new short[8],
    new short[8], new short[16], new short[16], new short[32], new short[32]
  };
  private final Length matchLength = new Length();
  private final Length repeatLength = new Length();

  Xz(InputStream in) throws IOException {
    this.in = in;
    readStreamHeader();
    readBlockHeader();
  }

  @Override
  public int read() throws IOException {
    byte[] single = new byte[1];
    return read(single, 0, 1) == -1 ? -1 : single[0] & 0xFF;
  }

  @Override
  public int read(byte[] buffer, int offset, int length) throws IOException {
    if(length == 0)
      return 0;
    while(dictionaryStart == dictionaryPosition)
      if(!produce())
        return -1;
    int count = Math.min(length, dictionaryPosition - dictionaryStart);
    System.arraycopy(dictionary, dictionaryStart, buffer, offset, count);
    dictionaryStart += count;
    blockOutput += count;
    return count;
  }

  /** Decodes until there is output to hand out. False once the stream is over. */
  private boolean produce() throws IOException {
    if(dictionaryPosition == dictionary.length) {
      dictionaryPosition = 0;
      dictionaryStart = 0;
      dictionaryFull = dictionary.length;
    }
    while(dictionaryStart == dictionaryPosition) {
      if(streamDone)
        return false;
      if(blockDone) {
        endBlock();
      } else if(chunkRemaining == 0) {
        readChunkHeader();
      } else {
        int limit = Math.min(dictionary.length, dictionaryPosition + chunkRemaining);
        if(chunkIsUncompressed)
          copyChunk(limit);
        else
          decode(limit);
      }
    }
    return true;
  }

  private void readStreamHeader() throws IOException {
    byte[] header = new byte[12];
    readFully(header, 0, header.length);
    if(header[0] != (byte)0xFD || header[1] != '7' || header[2] != 'z' || header[3] != 'X'
        || header[4] != 'Z' || header[5] != 0)
      throw new IOException("not an xz stream");
    checkSize = CHECK_SIZES[header[7] & 0x0F];
  }

  private void readBlockHeader() throws IOException {
    int first = in.read();
    if(first == -1)
      throw new EOFException("truncated xz stream");
    if(first == 0) {
      // the block sequence is terminated by the index indicator
      streamDone = true;
      return;
    }

    byte[] header = new byte[(first + 1) * 4];
    readFully(header, 1, header.length - 1);
    int flags = header[1] & 0xFF;
    if((flags & 0x03) != 0 || (flags & 0x3C) != 0)
      throw new IOException("unsupported xz block flags");

    int[] position = { 2 };
    if((flags & 0x40) != 0)
      readVariableLength(header, position);
    blockOutputExpected = (flags & 0x80) != 0 ? readVariableLength(header, position) : -1;
    if(readVariableLength(header, position) != LZMA2_FILTER)
      throw new IOException("unsupported xz filter");
    if(readVariableLength(header, position) != 1)
      throw new IOException("unsupported xz filter properties");

    int properties = header[position[0]] & 0xFF;
    if(properties > 40)
      throw new IOException("unsupported dictionary size");
    int size = properties == 40 ? MAXIMUM_DICTIONARY : (2 | (properties & 1)) << (properties / 2 + 11);
    if(size > MAXIMUM_DICTIONARY)
      throw new IOException("dictionary of " + size + " bytes is too large");
    if(dictionary.length < size)
      dictionary = new byte[size];

    resetDictionary();
    chunkRemaining = 0;
    blockBytes = 0;
    blockOutput = 0;
  }

  private void endBlock() throws IOException {
    // everything a finished block decoded to has been handed out by now, so this is where the
    // size the block header states can be held against it
    if(blockOutputExpected >= 0 && blockOutput != blockOutputExpected)
      throw new IOException("the block decoded to " + blockOutput + " bytes instead of " + blockOutputExpected);
    skipFully((int)((4 - blockBytes % 4) % 4) + checkSize);
    blockDone = false;
    readBlockHeader();
  }

  private void readChunkHeader() throws IOException {
    int control = readByte();
    if(control == 0x00) {
      blockDone = true;
      return;
    }

    if(control < 0x80) {
      if(control > 0x02)
        throw new IOException("unsupported LZMA2 chunk " + control);
      if(control == 0x01)
        resetDictionary();
      chunkRemaining = (readByte() << 8 | readByte()) + 1;
      chunkIsUncompressed = true;
      chunkPosition = 0;
      readFully(chunk, 0, chunkRemaining);
      return;
    }

    chunkRemaining = ((control & 0x1F) << 16) + (readByte() << 8) + readByte() + 1;
    int compressed = (readByte() << 8 | readByte()) + 1;
    int mode = (control >> 5) & 0x03;
    if(mode >= 2)
      setProperties(readByte());
    if(mode >= 1)
      resetState();
    if(mode == 3)
      resetDictionary();
    if(literal == null)
      throw new IOException("LZMA2 chunk without properties");

    chunkIsUncompressed = false;
    chunkPosition = 0;
    readFully(chunk, 0, compressed);
    if(chunk[chunkPosition++] != 0)
      throw new IOException("corrupt LZMA2 chunk");
    range = -1;
    code = 0;
    for(int i = 0; i < 4; i++)
      code = (code << 8) | (chunk[chunkPosition++] & 0xFF);
  }

  private void setProperties(int properties) throws IOException {
    if(properties > 224)
      throw new IOException("unsupported LZMA properties");
    positionBits = properties / 45;
    int remainder = properties % 45;
    literalPositionBits = remainder / 9;
    literalContextBits = remainder % 9;
    if(literalContextBits + literalPositionBits > 4)
      throw new IOException("unsupported LZMA properties");
    literal = new short[LITERAL_CODERS << (literalContextBits + literalPositionBits)];
  }

  private void resetState() {
    state = 0;
    rep0 = rep1 = rep2 = rep3 = 0;
    pendingLength = 0;
    reset(literal);
    reset(isMatch);
    reset(isRep);
    reset(isRepG0);
    reset(isRepG1);
    reset(isRepG2);
    reset(isRep0Long);
    reset(distanceSlot);
    reset(distanceAlign);
    for(short[] probabilities : distanceSpecial)
      reset(probabilities);
    matchLength.reset();
    repeatLength.reset();
  }

  private static void reset(short[] probabilities) {
    if(probabilities != null)
      Arrays.fill(probabilities, (short)PROBABILITY_INITIAL);
  }

  private void resetDictionary() {
    dictionaryPosition = 0;
    dictionaryStart = 0;
    dictionaryFull = 0;
    pendingLength = 0;
  }

  private void copyChunk(int limit) {
    int count = Math.min(limit - dictionaryPosition, chunkRemaining);
    System.arraycopy(chunk, chunkPosition, dictionary, dictionaryPosition, count);
    chunkPosition += count;
    dictionaryPosition += count;
    chunkRemaining -= count;
    if(dictionaryFull < dictionaryPosition)
      dictionaryFull = dictionaryPosition;
  }

  /** Decodes symbols until the dictionary reaches the limit or the chunk is done. */
  private void decode(int limit) throws IOException {
    if(pendingLength > 0) {
      pendingLength = repeat(pendingDistance, pendingLength, limit);
      if(pendingLength > 0)
        return;
    }

    while(dictionaryPosition < limit) {
      int positionState = dictionaryPosition & ((1 << positionBits) - 1);
      if(decodeBit(isMatch, state * POSITION_STATES + positionState) == 0) {
        decodeLiteral();
        chunkRemaining--;
        continue;
      }

      int length;
      if(decodeBit(isRep, state) == 1) {
        if(decodeBit(isRepG0, state) == 0) {
          if(decodeBit(isRep0Long, state * POSITION_STATES + positionState) == 0) {
            state = state < 7 ? 9 : 11;
            put(byteAt(rep0));
            chunkRemaining--;
            continue;
          }
        } else {
          int distance;
          if(decodeBit(isRepG1, state) == 0) {
            distance = rep1;
          } else {
            if(decodeBit(isRepG2, state) == 0) {
              distance = rep2;
            } else {
              distance = rep3;
              rep3 = rep2;
            }
            rep2 = rep1;
          }
          rep1 = rep0;
          rep0 = distance;
        }
        length = repeatLength.decode(positionState) + MATCH_MINIMUM;
        state = state < 7 ? 8 : 11;
      } else {
        rep3 = rep2;
        rep2 = rep1;
        rep1 = rep0;
        length = matchLength.decode(positionState) + MATCH_MINIMUM;
        state = state < 7 ? 7 : 10;
        rep0 = decodeDistance(length);
        if(rep0 == -1 || rep0 >= dictionary.length)
          throw new IOException("corrupt LZMA2 data");
      }

      chunkRemaining -= length;
      if(chunkRemaining < 0)
        throw new IOException("corrupt LZMA2 data");
      pendingDistance = rep0;
      pendingLength = repeat(rep0, length, limit);
      if(pendingLength > 0)
        return;
    }
  }

  private void decodeLiteral() {
    int previous = dictionaryPosition > 0 || dictionaryFull > 0 ? byteAt(0) & 0xFF : 0;
    int literalState = ((dictionaryPosition & ((1 << literalPositionBits) - 1)) << literalContextBits)
        + (previous >>> (8 - literalContextBits));
    int offset = LITERAL_CODERS * literalState;

    int symbol = 1;
    if(state >= 7) {
      int matchByte = byteAt(rep0) & 0xFF;
      do {
        int matchBit = (matchByte >> 7) & 1;
        matchByte <<= 1;
        int bit = decodeBit(literal, offset + ((1 + matchBit) << 8) + symbol);
        symbol = (symbol << 1) | bit;
        if(matchBit != bit)
          break;
      } while(symbol < 0x100);
    }
    while(symbol < 0x100)
      symbol = (symbol << 1) | decodeBit(literal, offset + symbol);

    put((byte)symbol);
    state = state < 4 ? 0 : (state < 10 ? state - 3 : state - 6);
  }

  private int decodeDistance(int length) {
    int lengthState = Math.min(length - MATCH_MINIMUM, 3);
    int slot = decodeBitTree(distanceSlot, lengthState * 64, 6);
    if(slot < 4)
      return slot;

    int footerBits = (slot >> 1) - 1;
    int distance = (2 | (slot & 1)) << footerBits;
    if(slot < 14)
      return distance + decodeBitTreeReverse(distanceSpecial[slot - 4], 0, footerBits);
    return distance + (decodeDirectBits(footerBits - 4) << 4) + decodeBitTreeReverse(distanceAlign, 0, 4);
  }

  private int decodeBit(short[] probabilities, int index) {
    normalize();
    int probability = probabilities[index];
    int bound = (range >>> 11) * probability;
    if((code ^ 0x80000000) < (bound ^ 0x80000000)) {
      range = bound;
      probabilities[index] = (short)(probability + ((2 * PROBABILITY_INITIAL - probability) >>> 5));
      return 0;
    }
    range -= bound;
    code -= bound;
    probabilities[index] = (short)(probability - (probability >>> 5));
    return 1;
  }

  private int decodeBitTree(short[] probabilities, int offset, int bits) {
    int symbol = 1;
    for(int i = 0; i < bits; i++)
      symbol = (symbol << 1) | decodeBit(probabilities, offset + symbol);
    return symbol - (1 << bits);
  }

  private int decodeBitTreeReverse(short[] probabilities, int offset, int bits) {
    int symbol = 1;
    int result = 0;
    for(int i = 0; i < bits; i++) {
      int bit = decodeBit(probabilities, offset + symbol);
      symbol = (symbol << 1) | bit;
      result |= bit << i;
    }
    return result;
  }

  private int decodeDirectBits(int count) {
    int result = 0;
    do {
      normalize();
      range >>>= 1;
      code -= range;
      int negative = code >>> 31;
      code += range & -negative;
      result = (result << 1) | (1 - negative);
    } while(--count > 0);
    return result;
  }

  private void normalize() {
    if((range & 0xFF000000) == 0) {
      range <<= 8;
      code = (code << 8) | (chunk[chunkPosition++] & 0xFF);
    }
  }

  private void put(byte value) {
    dictionary[dictionaryPosition++] = value;
    if(dictionaryFull < dictionaryPosition)
      dictionaryFull = dictionaryPosition;
  }

  private byte byteAt(int distance) {
    int index = dictionaryPosition - distance - 1;
    if(index < 0)
      index += dictionaryFull;
    return dictionary[index];
  }

  /** Copies a match out of the dictionary and returns what did not fit before the limit. */
  private int repeat(int distance, int length, int limit) {
    int back = dictionaryPosition - distance - 1;
    if(back < 0)
      back += dictionaryFull;
    while(length > 0 && dictionaryPosition < limit) {
      dictionary[dictionaryPosition++] = dictionary[back++];
      if(back == dictionary.length)
        back = 0;
      length--;
    }
    if(dictionaryFull < dictionaryPosition)
      dictionaryFull = dictionaryPosition;
    return length;
  }

  private long readVariableLength(byte[] buffer, int[] position) throws IOException {
    long value = 0;
    for(int i = 0; i < 9; i++) {
      int b = buffer[position[0]++] & 0xFF;
      value |= (long)(b & 0x7F) << (7 * i);
      if((b & 0x80) == 0)
        return value;
    }
    throw new IOException("corrupt xz block header");
  }

  private int readByte() throws IOException {
    int value = in.read();
    if(value == -1)
      throw new EOFException("truncated xz stream");
    blockBytes++;
    return value;
  }

  private void readFully(byte[] buffer, int offset, int length) throws IOException {
    while(length > 0) {
      int count = in.read(buffer, offset, length);
      if(count == -1)
        throw new EOFException("truncated xz stream");
      blockBytes += count;
      offset += count;
      length -= count;
    }
  }

  private void skipFully(int count) throws IOException {
    while(count-- > 0)
      readByte();
  }

  @Override
  public void close() throws IOException {
    in.close();
  }

  /** The length coder LZMA uses for matches, once for new and once for repeated distances. */
  private final class Length {
    private final short[] choice = new short[2];
    private final short[] low = new short[POSITION_STATES * 8];
    private final short[] middle = new short[POSITION_STATES * 8];
    private final short[] high = new short[256];

    void reset() {
      Xz.reset(choice);
      Xz.reset(low);
      Xz.reset(middle);
      Xz.reset(high);
    }

    int decode(int positionState) {
      if(decodeBit(choice, 0) == 0)
        return decodeBitTree(low, positionState * 8, 3);
      if(decodeBit(choice, 1) == 0)
        return 8 + decodeBitTree(middle, positionState * 8, 3);
      return 16 + decodeBitTree(high, 0, 8);
    }
  }
}
