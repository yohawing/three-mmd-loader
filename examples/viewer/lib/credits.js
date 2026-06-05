import { dom } from "./dom.js";
import { getLocale } from "./i18n.js";

export function bindCreditPopupControls() {
  dom.creditCloseButton?.addEventListener("click", hideCreditPopup);
}

export function showModelCredits(model, fallbackName) {
  const metadata = model?.mesh?.userData?.mmdModel;
  const comment = formatModelCreditComment(metadata);
  if (!comment) {
    hideCreditPopup();
    return;
  }
  if (!dom.creditPopup || !dom.creditModelText || !dom.creditCommentText) {
    return;
  }
  const modelName = firstNonEmptyString(
    getLocale() === "ja" ? metadata?.name : metadata?.englishName,
    metadata?.englishName,
    metadata?.name,
    fallbackName
  );
  dom.creditModelText.textContent = modelName;
  dom.creditCommentText.textContent = comment;
  dom.creditPopup.hidden = false;
}

export function hideCreditPopup() {
  if (dom.creditPopup) {
    dom.creditPopup.hidden = true;
  }
}

function formatModelCreditComment(metadata) {
  const comment = cleanCreditText(metadata?.comment);
  const englishComment = cleanCreditText(metadata?.englishComment);
  if (getLocale() === "ja") {
    return joinUniqueCreditBlocks(comment, englishComment);
  }
  return joinUniqueCreditBlocks(englishComment, comment);
}

function joinUniqueCreditBlocks(primary, secondary) {
  if (!primary) {
    return secondary;
  }
  if (!secondary || primary === secondary) {
    return primary;
  }
  return `${primary}\n\n${secondary}`;
}

function cleanCreditText(value) {
  if (typeof value !== "string") {
    return "";
  }
  let cleaned = "";
  for (const char of value) {
    const code = char.charCodeAt(0);
    if ((code < 0x20 && char !== "\n" && char !== "\r" && char !== "\t") || code === 0x7f) {
      continue;
    }
    cleaned += char;
  }
  return cleaned.trim();
}

function firstNonEmptyString(...values) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim() ?? "";
}
