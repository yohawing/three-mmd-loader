const query = new window.URLSearchParams(location.search);

export const viewerConfig = {
  mmdFrameRate: readPositiveNumber(query.get("mmdFrameRate"), 30),
  mmdFrameQuantize: readBoolean(query.get("mmdFrameQuantize"), true),
  ikTolerance: readNonNegativeOptionalNumber(readFirstQueryValue("ikTolerance", "ikTorelance")),
  ikMaxIterationsCap: readNonNegativeOptionalInteger(readFirstQueryValue(
    "ikMaxIterationsCap",
    "ikMaxIterations",
    "ikMaxIter",
    "maxIkIterations"
  )),
  runtime: readRuntimeMode(query.get("runtime"))
};

function readPositiveNumber(value, fallback) {
  if (value === null || value.trim() === "") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readBoolean(value, fallback) {
  if (value === null) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (["0", "false", "off", "no"].includes(normalized)) {
    return false;
  }
  if (["1", "true", "on", "yes"].includes(normalized)) {
    return true;
  }
  return fallback;
}

function readFirstQueryValue(...names) {
  for (const name of names) {
    const value = query.get(name);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function readNonNegativeOptionalNumber(value) {
  if (value === null || value.trim() === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function readNonNegativeOptionalInteger(value) {
  const parsed = readNonNegativeOptionalNumber(value);
  return parsed === undefined || Number.isInteger(parsed) ? parsed : undefined;
}

function readRuntimeMode(value) {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "js" || normalized === "default") {
    return "js";
  }
  return "mmd-anim";
}
