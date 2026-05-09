export function crc32(str: string): number {
  let c: number
  const crcTable: number[] = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    }
    crcTable[n] = c
  }
  let crc = 0 ^ (-1)
  for (let i = 0; i < str.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ str.charCodeAt(i)) & 0xFF]
  }
  return (crc ^ (-1)) >>> 0
}

export function formatCRC32(str: string): string {
  return `CRC32 ${crc32(str).toString(16).toUpperCase().padStart(8, '0')}`
}
