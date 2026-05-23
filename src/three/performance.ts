const loaderPerformanceFlag = "__THREE_MMD_LOADER_PERF__";

let loaderProfileId = 0;

interface LoaderPerformanceGlobal {
  [loaderPerformanceFlag]?: boolean;
}

interface LoaderPerformanceProfile {
  mark(name: string): void;
  measure(name: string, start: string, end: string): void;
  clear(): void;
}

export function createLoaderPerformanceProfile(label: string): LoaderPerformanceProfile | undefined {
  if (!isLoaderPerformanceEnabled()) {
    return undefined;
  }

  const profileId = ++loaderProfileId;
  const prefix = `three-mmd-loader:${profileId}:${sanitizePerformanceLabel(label)}`;
  const marks = new Set<string>();

  return {
    mark(name: string): void {
      const markName = `${prefix}:${name}`;
      performance.mark(markName);
      marks.add(markName);
    },
    measure(name: string, start: string, end: string): void {
      const measureName = `${prefix}:${name}`;
      const startMark = `${prefix}:${start}`;
      const endMark = `${prefix}:${end}`;
      if (!marks.has(startMark) || !marks.has(endMark)) {
        return;
      }
      performance.measure(measureName, startMark, endMark);
    },
    clear(): void {
      for (const mark of marks) {
        performance.clearMarks(mark);
      }
    }
  };
}

function isLoaderPerformanceEnabled(): boolean {
  return (
    typeof performance !== "undefined" &&
    typeof performance.mark === "function" &&
    (globalThis as LoaderPerformanceGlobal)[loaderPerformanceFlag] === true
  );
}

function sanitizePerformanceLabel(label: string): string {
  return label.replace(/\s+/g, " ").slice(0, 80);
}
