const loaderPerformanceFlag = "__THREE_MMD_LOADER_PERF__";

export const viewerPerformanceEnabled = new window.URLSearchParams(location.search).has("perf");

if (viewerPerformanceEnabled) {
  window[loaderPerformanceFlag] = true;
  window.console?.info("[mmd-viewer] performance profiling enabled");
}

let viewerProfileId = 0;

export function createViewerLoadProfile(label) {
  if (!viewerPerformanceEnabled) {
    return undefined;
  }

  const profileId = ++viewerProfileId;
  const startTime = window.performance.now();
  const prefix = `mmd-viewer:${profileId}:${sanitizePerformanceLabel(label)}`;
  const marks = new Set();

  return {
    mark(name) {
      const markName = `${prefix}:${name}`;
      window.performance.mark(markName);
      marks.add(markName);
    },
    measure(name, start, end) {
      const measureName = `${prefix}:${name}`;
      const startMark = `${prefix}:${start}`;
      const endMark = `${prefix}:${end}`;
      if (!marks.has(startMark) || !marks.has(endMark)) {
        return;
      }
      window.performance.measure(measureName, startMark, endMark);
    },
    report() {
      const entries = window.performance
        .getEntriesByType("measure")
        .filter(
          (entry) =>
            entry.startTime >= startTime &&
            (entry.name.startsWith(prefix) || entry.name.startsWith("three-mmd-loader:"))
        )
        .sort((a, b) => {
          const aTotal = a.name.endsWith(":total") || a.name.endsWith(":failed-total");
          const bTotal = b.name.endsWith(":total") || b.name.endsWith(":failed-total");
          return Number(aTotal) - Number(bTotal) || a.startTime - b.startTime;
        });

      if (entries.length === 0) {
        return;
      }

      window.console?.groupCollapsed(
        `[mmd-viewer] load profile: ${label} (${duration(entries).toFixed(2)} ms)`
      );
      window.console?.table(
        entries.map((entry) => ({
          scope: entry.name.startsWith(prefix) ? "viewer" : "loader",
          stage: entry.name.split(":").at(-1),
          durationMs: Number(entry.duration.toFixed(2)),
          startMs: Number((entry.startTime - startTime).toFixed(2))
        }))
      );
      window.console?.groupEnd();

      for (const mark of marks) {
        window.performance.clearMarks(mark);
      }
      for (const entry of entries) {
        window.performance.clearMeasures(entry.name);
      }
    }
  };
}

export function describeViewerSource(source, label) {
  if (source instanceof window.File) {
    return source.webkitRelativePath || source.name || label;
  }
  return label;
}

function duration(entries) {
  const first = entries[0];
  const last = entries.at(-1);
  return last.startTime + last.duration - first.startTime;
}

function sanitizePerformanceLabel(label) {
  return label.replace(/\s+/g, " ").slice(0, 80);
}
