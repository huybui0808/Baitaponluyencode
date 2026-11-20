// VI: Manifest cho phép thêm part5.json, part6.json... mà không sửa mã tải bài.
// EN: The manifest lets new JSON parts load without changing application code.
export async function bundledPartUrls(moduleUrl) {
  let numbers = [1, 2, 3, 4];
  try {
    const manifestUrl = new URL("../data/manifest.json", moduleUrl);
    const response = await fetch(manifestUrl, { cache: "no-cache" });
    if (response.ok) {
      const manifest = await response.json();
      const parts = manifest?.parts;
      if (!Array.isArray(parts) || !parts.length || parts.length > 99 ||
          new Set(parts).size !== parts.length ||
          parts.some((part) => !Number.isInteger(part) || part < 1 || part > 99)) {
        throw new Error("data/manifest.json không hợp lệ.");
      }
      numbers = parts;
    }
  } catch (error) {
    if (error instanceof SyntaxError || error?.message?.includes("manifest.json không hợp lệ")) throw error;
    // Older deployments have four JSON files but no manifest.
  }
  return numbers.map((number) => new URL(`../data/part${number}.json`, moduleUrl));
}
