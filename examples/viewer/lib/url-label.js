export function labelFromUrl(url) {
  const label = url.split("/").at(-1) ?? url;
  try {
    return decodeURIComponent(label);
  } catch {
    return label;
  }
}
