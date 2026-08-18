import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, posix, relative } from "node:path";
import { fileURLToPath } from "node:url";

const apiDocsRoot = fileURLToPath(new URL("../docs/api/reference/", import.meta.url));
const localMarkdownLinkPattern =
  /(\]\()((?![A-Za-z][A-Za-z0-9+.-]*:|\/\/)[^\s)#]+)(#[^\s)]*)?((?:\s+["'][^)]*["'])?\))/g;

function rewriteApiLinks(markdown, file) {
  const relativeFile = relative(apiDocsRoot, file).replaceAll("\\", "/");
  const sourceDirectory = posix.dirname(relativeFile);

  return markdown.replace(
    localMarkdownLinkPattern,
    (match, opener, target, anchor = "", suffix) => {
      const targetWithoutExtension = target.replace(/\.md$/u, "");
      const resolvedTarget = posix.normalize(posix.join(sourceDirectory, targetWithoutExtension));

      if (resolvedTarget === "../index") {
        return `${opener}/api${anchor}${suffix}`;
      }

      const targetWithoutIndex = resolvedTarget.replace(/(?:^|\/)index$/u, "");
      const route = targetWithoutIndex
        ? `/api/reference/${targetWithoutIndex}`
        : "/api/reference";

      return `${opener}${route}${anchor}${suffix}`;
    },
  );
}

async function collectMarkdownFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(path)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(path);
    }
  }
  return files;
}

const files = await collectMarkdownFiles(apiDocsRoot);
let preparedCount = 0;

for (const file of files) {
  const source = await readFile(file, "utf8");
  const titleMatch = source.match(/^# (.+)$/m);
  if (!titleMatch || titleMatch.index === undefined) {
    continue;
  }

  const title = titleMatch[1].trim();
  const withoutPageTitle =
    source.slice(0, titleMatch.index) + source.slice(titleMatch.index + titleMatch[0].length);
  const preparedBody = rewriteApiLinks(withoutPageTitle, file);
  const prepared = `---\ntitle: ${JSON.stringify(title)}\n---\n\n${preparedBody.trimStart()}`;
  await writeFile(file, prepared, "utf8");
  preparedCount += 1;
}

console.log(`[api-docs] Added Blume titles to ${preparedCount} generated pages.`);
