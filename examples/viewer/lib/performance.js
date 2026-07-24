const loaderPerformanceFlag = "__THREE_MMD_LOADER_PERF__";

export const viewerPerformanceEnabled = new window.URLSearchParams(location.search).has("perf");

if (viewerPerformanceEnabled) {
  window[loaderPerformanceFlag] = true;
  window.console?.info("[mmd-viewer] performance profiling enabled");
}

let viewerProfileId = 0;
const maxFrameSamples = 3600;
const gpuResolveIntervalFrames = 30;
const frameSamples = [];
const gpuSamples = [];
const gpuComputeSamples = [];
const loadProfiles = [];
let currentFrame;
let frameSequence = 0;
let pendingCommonGpuResolve = false;
let webglTimer;

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

      loadProfiles.push({
        label,
        stages: entries.map((entry) => ({
          scope: entry.name.startsWith(prefix) ? "viewer" : "loader",
          stage: entry.name.split(":").at(-1),
          durationMs: Number(entry.duration.toFixed(3)),
          startMs: Number((entry.startTime - startTime).toFixed(3))
        }))
      });

      for (const mark of marks) {
        window.performance.clearMarks(mark);
      }
      for (const entry of entries) {
        window.performance.clearMeasures(entry.name);
      }
    }
  };
}

export function beginViewerFrameProfile() {
  if (!viewerPerformanceEnabled) return;
  currentFrame = { sequence: frameSequence++, startedAt: window.performance.now(), stages: {} };
}

export function beginViewerStageProfile() {
  return viewerPerformanceEnabled ? window.performance.now() : 0;
}

export function endViewerStageProfile(name, startedAt) {
  if (!currentFrame) return;
  currentFrame.stages[name] = (currentFrame.stages[name] ?? 0) +
    (window.performance.now() - startedAt);
}

export function beginViewerGpuProfile(renderer) {
  if (!currentFrame || renderer?.isWebGLRenderer !== true) return;
  webglTimer ??= createWebglTimer(renderer);
  webglTimer?.poll(gpuSamples, currentFrame.sequence);
  webglTimer?.begin(currentFrame.sequence);
}

export function endViewerGpuProfile(renderer) {
  if (!currentFrame || renderer?.isWebGLRenderer !== true) return;
  webglTimer?.end();
}

export function endViewerFrameProfile(renderer) {
  if (!currentFrame) return;
  const renderInfo = readRenderInfo(renderer);
  currentFrame.totalMs = window.performance.now() - currentFrame.startedAt;
  currentFrame.drawCalls = renderInfo.drawCalls;
  currentFrame.triangles = renderInfo.triangles;
  currentFrame.renderCalls = renderInfo.renderCalls;
  if (frameSamples.length < maxFrameSamples) frameSamples.push(currentFrame);
  currentFrame = undefined;

  if (
    renderer?.isWebGPURenderer === true &&
    typeof renderer.resolveTimestampsAsync === "function" &&
    frameSequence % gpuResolveIntervalFrames === 0 &&
    !pendingCommonGpuResolve
  ) {
    pendingCommonGpuResolve = true;
    const sequence = frameSequence - 1;
    void Promise.all([
      renderer.resolveTimestampsAsync("render"),
      renderer.resolveTimestampsAsync("compute")
    ])
      .then(([renderDurationMs, computeDurationMs]) => {
        const renderMs = Number.isFinite(renderDurationMs) && renderDurationMs >= 0
          ? renderDurationMs
          : 0;
        const computeMs = Number.isFinite(computeDurationMs) && computeDurationMs >= 0
          ? computeDurationMs
          : 0;
        gpuSamples.push({ sequence, durationMs: renderMs + computeMs, renderMs });
        gpuComputeSamples.push({ sequence, durationMs: computeMs });
      })
      .catch(() => {})
      .finally(() => { pendingCommonGpuResolve = false; });
  }
}

export function createViewerPerformanceApi() {
  if (!viewerPerformanceEnabled) return undefined;
  return Object.freeze({
    reset() {
      frameSamples.length = 0;
      gpuSamples.length = 0;
      gpuComputeSamples.length = 0;
      loadProfiles.length = 0;
      frameSequence = 0;
    },
    snapshot() {
      return createPerformanceSnapshot();
    }
  });
}

export function resetViewerFrameProfile() {
  if (!viewerPerformanceEnabled) return;
  frameSamples.length = 0;
  gpuSamples.length = 0;
  gpuComputeSamples.length = 0;
  frameSequence = 0;
}

function createPerformanceSnapshot() {
  const stageNames = new Set();
  for (const frame of frameSamples) {
    for (const name of Object.keys(frame.stages)) stageNames.add(name);
  }
  const stages = {};
  for (const name of stageNames) {
    stages[name] = summarize(frameSamples.map((frame) => frame.stages[name] ?? 0));
  }
  const worst = frameSamples.reduce(
    (candidate, frame) => !candidate || frame.totalMs > candidate.totalMs ? frame : candidate,
    undefined
  );
  return {
    frameCount: frameSamples.length,
    frame: summarize(frameSamples.map((frame) => frame.totalMs)),
    stages,
    gpu: summarize(gpuSamples.map((sample) => sample.durationMs)),
    gpuRender: summarize(gpuSamples.map((sample) => sample.renderMs ?? sample.durationMs)),
    gpuCompute: summarize(gpuComputeSamples.map((sample) => sample.durationMs)),
    drawCalls: summarize(frameSamples.map((frame) => frame.drawCalls)),
    triangles: summarize(frameSamples.map((frame) => frame.triangles)),
    renderCalls: summarize(frameSamples.map((frame) => frame.renderCalls)),
    worstFrame: worst ? {
      sequence: worst.sequence,
      totalMs: round(worst.totalMs),
      stages: Object.fromEntries(
        Object.entries(worst.stages).map(([name, durationMs]) => [name, round(durationMs)])
      ),
      drawCalls: worst.drawCalls,
      triangles: worst.triangles,
      renderCalls: worst.renderCalls
    } : undefined,
    loadProfiles: loadProfiles.map((profile) => ({
      label: profile.label,
      stages: profile.stages.map((stage) => ({ ...stage }))
    }))
  };
}

function readRenderInfo(renderer) {
  if (renderer?.isWebGLRenderer === true) {
    return {
      drawCalls: renderer.info?.render?.calls ?? 0,
      triangles: renderer.info?.render?.triangles ?? 0,
      renderCalls: 1
    };
  }
  return {
    drawCalls: renderer?.info?.render?.drawCalls ?? 0,
    triangles: renderer?.info?.render?.triangles ?? 0,
    renderCalls: renderer?.info?.render?.frameCalls ?? 0
  };
}

function createWebglTimer(renderer) {
  const gl = renderer.getContext?.();
  const extension = gl?.getExtension?.("EXT_disjoint_timer_query_webgl2");
  if (!gl || !extension) return undefined;
  let active;
  let pending;
  return {
    begin(sequence) {
      if (active || pending) return;
      const query = gl.createQuery();
      if (!query) return;
      gl.beginQuery(extension.TIME_ELAPSED_EXT, query);
      active = { query, sequence };
    },
    end() {
      if (!active) return;
      gl.endQuery(extension.TIME_ELAPSED_EXT);
      pending = active;
      active = undefined;
    },
    poll(samples, sequence) {
      if (!pending) return;
      const available = gl.getQueryParameter(pending.query, gl.QUERY_RESULT_AVAILABLE);
      const disjoint = gl.getParameter(extension.GPU_DISJOINT_EXT);
      if (!available) return;
      if (!disjoint) {
        samples.push({
          sequence: pending.sequence ?? sequence,
          durationMs: gl.getQueryParameter(pending.query, gl.QUERY_RESULT) / 1e6
        });
      }
      gl.deleteQuery(pending.query);
      pending = undefined;
    }
  };
}

function summarize(values) {
  if (values.length === 0) return { count: 0, p50: 0, p95: 0, max: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50: round(percentile(sorted, 0.5)),
    p95: round(percentile(sorted, 0.95)),
    max: round(sorted.at(-1))
  };
}

function percentile(sorted, ratio) {
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)] ?? 0;
}

function round(value) {
  return Number(value.toFixed(3));
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
