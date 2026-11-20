// VI: Giữ metadata chỉ có trong JSON khi xuất bài đã xuất bản từ Supabase.
// EN: Preserve JSON-only metadata while exporting published Supabase tasks.
export function buildExportParts(rows, originalParts) {
  const originalById = new Map(originalParts.flat().map((task) => [task.id, task]));
  const parts = [];
  const ids = new Set();

  for (const row of rows) {
    const part = Number(/^Phần\s+(\d+)(?:\s|\b)/u.exec(row.section || "")?.[1]);
    if (!Number.isInteger(part) || part < 1 || part > 99) {
      throw new Error(`Bài ${row.id}: số phần phải từ 1 đến 99.`);
    }
    if (!Number.isInteger(row.id) || ids.has(row.id)) {
      throw new Error(`ID bài tập không hợp lệ hoặc trùng: ${row.id}.`);
    }
    ids.add(row.id);
    const tests = [...(row.test_cases || [])].sort((a, b) => a.no - b.no);
    if (tests.length < 8 || tests.length > 30) {
      throw new Error(`Bài ${row.id}: cần từ 8 đến 30 test để xuất.`);
    }
    (parts[part - 1] ||= []).push({
      ...(originalById.get(row.id) || {}),
      id: row.id,
      section: row.section,
      title: row.title,
      level: row.level,
      statement: row.statement ?? "",
      input: row.input ?? "",
      output: row.output ?? "",
      constraints: row.constraints ?? "",
      sample_input: row.sample_input ?? "",
      sample_output: row.sample_output ?? "",
      tests: tests.map((test) => ({
        no: test.no,
        input: test.input,
        output: test.output,
      })),
    });
  }
  return Array.from({ length: parts.length }, (_, index) =>
    (parts[index] || []).sort((a, b) => a.id - b.id));
}

// VI: ZIP không nén gồm các phần và manifest, không cần thư viện mạng.
// EN: Store all parts and their manifest in a ZIP without an external dependency.
export function buildJsonZip(parts) {
  if (!Array.isArray(parts) || !parts.length || parts.length > 99) {
    throw new Error("Số phần bài tập không hợp lệ.");
  }
  const encoder = new TextEncoder();
  const files = [
    {
      name: encoder.encode("manifest.json"),
      data: encoder.encode(JSON.stringify({ parts: parts.map((_, index) => index + 1) }, null, 2) + "\n"),
    },
    ...parts.map((part, index) => ({
      name: encoder.encode(`part${index + 1}.json`),
      data: encoder.encode(JSON.stringify(part, null, 2) + "\n"),
    })),
  ];
  const table = new Uint32Array(256);
  for (let i = 0; i < table.length; i++) {
    let value = i;
    for (let bit = 0; bit < 8; bit++) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  for (const file of files) {
    let crc = 0xffffffff;
    for (const byte of file.data) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
    file.crc = (crc ^ 0xffffffff) >>> 0;
  }

  const localSize = files.reduce((sum, file) => sum + 30 + file.name.length + file.data.length, 0);
  const centralSize = files.reduce((sum, file) => sum + 46 + file.name.length, 0);
  const bytes = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(bytes.buffer);
  const u16 = (at, value) => view.setUint16(at, value, true);
  const u32 = (at, value) => view.setUint32(at, value, true);
  let offset = 0;
  for (const file of files) {
    file.offset = offset;
    u32(offset, 0x04034b50);
    u16(offset + 4, 20);
    u16(offset + 6, 0x0800);
    u16(offset + 8, 0);
    u32(offset + 14, file.crc);
    u32(offset + 18, file.data.length);
    u32(offset + 22, file.data.length);
    u16(offset + 26, file.name.length);
    bytes.set(file.name, offset + 30);
    bytes.set(file.data, offset + 30 + file.name.length);
    offset += 30 + file.name.length + file.data.length;
  }
  const centralOffset = offset;
  for (const file of files) {
    u32(offset, 0x02014b50);
    u16(offset + 4, 20);
    u16(offset + 6, 20);
    u16(offset + 8, 0x0800);
    u16(offset + 10, 0);
    u32(offset + 16, file.crc);
    u32(offset + 20, file.data.length);
    u32(offset + 24, file.data.length);
    u16(offset + 28, file.name.length);
    u32(offset + 42, file.offset);
    bytes.set(file.name, offset + 46);
    offset += 46 + file.name.length;
  }
  u32(offset, 0x06054b50);
  u16(offset + 8, files.length);
  u16(offset + 10, files.length);
  u32(offset + 12, centralSize);
  u32(offset + 16, centralOffset);
  return bytes;
}
