/**
 * Page runtime for analytics pages (Plan 97).
 *
 * Owns query results, statuses, errors and durations (previously local state
 * in AnalyticsEditor) plus the page's input values. Runs queries in
 * dependency order, interpolates `${inputs...}` into SQL, re-runs only the
 * queries downstream of a changed input after a short debounce, and
 * de-duplicates / caches identical SQL.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { QueryExecutionResult } from '../../../../utils/analyticsQueryEngine';
import {
  buildPageGraph,
  defaultFromOptions,
  defaultInputState,
  InputDefinition,
  InputState,
  InputValue,
  PageGraph,
  parsePage,
  queriesAffectedByInputs,
  QueryStatus,
  resolveQuerySql,
} from '../../../../../shared/analyticsBi';
import { ResultCache } from './resultCache';

export type QueryExecutor = (params: {
  queryName: string;
  /** Final SQL: inputs interpolated, {{refs}} expanded. */
  sql: string;
  /** Input values the SQL was built from (used by the example pages). */
  inputs: InputState;
}) => Promise<QueryExecutionResult>;

export interface UseAnalyticsPageRuntimeOptions {
  markdown: string;
  execute: QueryExecutor;
  /** Cache scope, e.g. the connection id. Changing it clears the cache. */
  cacheScope: string;
  /** Run every query once when the page (or scope) changes. */
  autoRun?: boolean;
  /** Called after a successful CREATE / DROP / ALTER / RENAME / TRUNCATE. */
  onSchemaChange?: () => void;
  /** Delay before input changes re-run queries. */
  inputDebounceMs?: number;
}

export interface AnalyticsPageRuntime {
  results: Record<string, any[]>;
  statuses: Record<string, QueryStatus>;
  errors: Record<string, string | null>;
  durations: Record<string, number | undefined>;
  inputs: InputState;
  isRunning: boolean;
  runAll: () => Promise<void>;
  runQuery: (queryName: string) => Promise<void>;
  setInput: (name: string, value: InputValue) => void;
  /** Latest values, for synchronous readers such as the agent bridge. */
  snapshot: () => {
    results: Record<string, any[]>;
    statuses: Record<string, QueryStatus>;
    errors: Record<string, string | null>;
    durations: Record<string, number | undefined>;
  };
}

const DDL_RE = /^\s*(CREATE|DROP|ALTER|RENAME|TRUNCATE)/i;

function inputSignature(defs: InputDefinition[]): string {
  return defs
    .map((d) => `${d.name}:${JSON.stringify(d.defaultState ?? null)}`)
    .join('|');
}

export function useAnalyticsPageRuntime({
  markdown,
  execute,
  cacheScope,
  autoRun = false,
  onSchemaChange,
  inputDebounceMs = 250,
}: UseAnalyticsPageRuntimeOptions): AnalyticsPageRuntime {
  const [results, setResults] = useState<Record<string, any[]>>({});
  const [statuses, setStatuses] = useState<Record<string, QueryStatus>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [durations, setDurations] = useState<
    Record<string, number | undefined>
  >({});
  const [inputs, setInputs] = useState<InputState>({});
  const [isRunning, setIsRunning] = useState(false);

  const resultsRef = useRef(results);
  const statusesRef = useRef(statuses);
  const errorsRef = useRef(errors);
  const durationsRef = useRef(durations);
  const inputsRef = useRef<InputState>(inputs);
  const markdownRef = useRef(markdown);
  const executeRef = useRef(execute);
  const onSchemaChangeRef = useRef(onSchemaChange);
  const runTokens = useRef(new Map<string, number>());
  // Tokens come from one counter so a token is never reused, even after
  // runTokens is cleared for a new page.
  const tokenCounter = useRef(0);
  // Bumped when the page or connection changes: work started for the
  // previous page stops and its results are dropped.
  const generationRef = useRef(0);
  const pendingInputs = useRef(new Set<string>());
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRunningRef = useRef(false);
  const cacheRef = useRef(new ResultCache<QueryExecutionResult>(50));
  const mountedRef = useRef(true);

  markdownRef.current = markdown;
  executeRef.current = execute;
  onSchemaChangeRef.current = onSchemaChange;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  // ── Small state helpers that keep refs in sync ────────────────────────────
  const patch = useCallback(
    <T>(
      ref: { current: Record<string, T> },
      setter: (v: Record<string, T>) => void,
      name: string,
      value: T,
    ) => {
      ref.current = { ...ref.current, [name]: value };
      if (mountedRef.current) setter(ref.current);
    },
    [],
  );

  const setStatus = useCallback(
    (name: string, status: QueryStatus) =>
      patch(statusesRef, setStatuses, name, status),
    [patch],
  );

  const replaceInputs = useCallback((next: InputState) => {
    inputsRef.current = next;
    if (mountedRef.current) setInputs(next);
  }, []);

  // ── Inputs: defaults, kept across edits ───────────────────────────────────
  const graphForInputs = useMemo(() => {
    try {
      return buildPageGraph(parsePage(markdown).nodes);
    } catch {
      return null;
    }
  }, [markdown]);
  const signature = graphForInputs ? inputSignature(graphForInputs.inputs) : '';

  useEffect(() => {
    if (!graphForInputs) return;
    const defaults = defaultInputState(graphForInputs.inputs);
    const names = new Set(graphForInputs.inputs.map((i) => i.name));
    const next: InputState = {};
    let changed = false;
    names.forEach((name) => {
      if (inputsRef.current[name] !== undefined) {
        next[name] = inputsRef.current[name];
      } else if (defaults[name] !== undefined) {
        next[name] = defaults[name];
        changed = true;
      }
    });
    if (Object.keys(inputsRef.current).some((n) => !names.has(n)))
      changed = true;
    if (changed) replaceInputs(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  // ── Execution ─────────────────────────────────────────────────────────────
  const applyOptionDefaults = useCallback(
    (graph: PageGraph, queryName: string, rows: any[]) => {
      let next: InputState | null = null;
      graph.inputs.forEach((def) => {
        if (def.optionsQuery !== queryName) return;
        if (inputsRef.current[def.name] !== undefined) return;
        const value = defaultFromOptions(def, rows);
        if (value) {
          next = { ...(next ?? inputsRef.current), [def.name]: value };
        }
      });
      if (next) replaceInputs(next);
    },
    [replaceInputs],
  );

  const executeOne = useCallback(
    async (graph: PageGraph, name: string, useCache: boolean) => {
      tokenCounter.current += 1;
      const token = tokenCounter.current;
      const generation = generationRef.current;
      runTokens.current.set(name, token);
      setStatus(name, 'running');

      let sql: string;
      try {
        sql = resolveQuerySql(graph, name, inputsRef.current);
      } catch (error) {
        if (runTokens.current.get(name) !== token) return;
        setStatus(name, 'error');
        patch(errorsRef, setErrors, name, (error as Error).message);
        return;
      }

      let result: QueryExecutionResult;
      try {
        result = await cacheRef.current.run(
          `${cacheScope}\u0000${sql}`,
          () =>
            executeRef.current({
              queryName: name,
              sql,
              inputs: inputsRef.current,
            }),
          {
            useCache: useCache && !DDL_RE.test(sql),
            shouldCache: (r) => r.status === 'success' && !DDL_RE.test(sql),
          },
        );
      } catch (error) {
        result = {
          name,
          status: 'error',
          data: [],
          fields: [],
          rowCount: 0,
          error: (error as Error)?.message ?? 'Unexpected error',
        };
      }

      // A newer run of this query started meanwhile, or the page changed:
      // drop this result.
      if (
        generation !== generationRef.current ||
        runTokens.current.get(name) !== token
      ) {
        return;
      }

      patch(resultsRef, setResults, name, result.data ?? []);
      patch(errorsRef, setErrors, name, result.error ?? null);
      patch(durationsRef, setDurations, name, result.duration);
      setStatus(name, result.status);

      if (result.status === 'success') {
        applyOptionDefaults(graph, name, result.data ?? []);
        if (DDL_RE.test(sql)) onSchemaChangeRef.current?.();
      }
    },
    [applyOptionDefaults, cacheScope, patch, setStatus],
  );

  const reportGraphErrors = useCallback(
    (graph: PageGraph) => {
      const fallback = graph.order[0] ?? Array.from(graph.queries.keys())[0];
      graph.errors.forEach((error) => {
        const target = error.blockName ?? fallback;
        if (!target) return;
        setStatus(target, 'error');
        patch(errorsRef, setErrors, target, error.message);
      });
    },
    [patch, setStatus],
  );

  const runNames = useCallback(
    async (graph: PageGraph, names: string[], useCache: boolean) => {
      // Sequential, in dependency order: later queries may need option
      // defaults set by earlier ones. Stops when the page changes.
      const generation = generationRef.current;
      await names.reduce(
        (chain, name) =>
          chain.then(() =>
            generation === generationRef.current
              ? executeOne(graph, name, useCache)
              : undefined,
          ),
        Promise.resolve(),
      );
    },
    [executeOne],
  );

  const runAll = useCallback(async () => {
    if (isRunningRef.current) return;
    const graph = buildPageGraph(parsePage(markdownRef.current).nodes);
    if (graph.queries.size === 0) return;
    if (graph.errors.length > 0) {
      reportGraphErrors(graph);
      return;
    }
    const generation = generationRef.current;
    isRunningRef.current = true;
    setIsRunning(true);
    cacheRef.current.clear();
    graph.order.forEach((name) => setStatus(name, 'running'));
    try {
      await runNames(graph, graph.order, false);
    } finally {
      // After a page change the reset already cleared the running flag, and
      // a run for the new page may own it now.
      if (generation === generationRef.current) {
        isRunningRef.current = false;
        if (mountedRef.current) setIsRunning(false);
      }
    }
  }, [reportGraphErrors, runNames, setStatus]);

  const runQuery = useCallback(
    async (queryName: string) => {
      const graph = buildPageGraph(parsePage(markdownRef.current).nodes);
      const related =
        graph.errors.find((e) => e.blockName === queryName) ?? graph.errors[0];
      if (related) {
        setStatus(queryName, 'error');
        patch(errorsRef, setErrors, queryName, related.message);
        return;
      }
      await executeOne(graph, queryName, false);
    },
    [executeOne, patch, setStatus],
  );

  const flushInputChanges = useCallback(() => {
    const changed = Array.from(pendingInputs.current);
    pendingInputs.current.clear();
    if (changed.length === 0) return;
    const graph = buildPageGraph(parsePage(markdownRef.current).nodes);
    if (graph.errors.length > 0) {
      reportGraphErrors(graph);
      return;
    }
    const affected = queriesAffectedByInputs(graph, changed);
    affected.forEach((name) => setStatus(name, 'running'));
    runNames(graph, affected, true).catch(() => undefined);
  }, [reportGraphErrors, runNames, setStatus]);

  const setInput = useCallback(
    (name: string, value: InputValue) => {
      const previous = inputsRef.current[name];
      if (previous && JSON.stringify(previous) === JSON.stringify(value))
        return;
      replaceInputs({ ...inputsRef.current, [name]: value });
      pendingInputs.current.add(name);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(flushInputChanges, inputDebounceMs);
    },
    [flushInputChanges, inputDebounceMs, replaceInputs],
  );

  // A different page or connection means different data: start clean.
  const graphForInputsRef = useRef(graphForInputs);
  graphForInputsRef.current = graphForInputs;
  const firstScopeRef = useRef(true);
  useEffect(() => {
    cacheRef.current.clear();
    if (firstScopeRef.current) {
      firstScopeRef.current = false;
      return;
    }
    generationRef.current += 1;
    runTokens.current.clear();
    pendingInputs.current.clear();
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    isRunningRef.current = false;
    setIsRunning(false);
    resultsRef.current = {};
    statusesRef.current = {};
    errorsRef.current = {};
    durationsRef.current = {};
    setResults({});
    setStatuses({});
    setErrors({});
    setDurations({});
    const graph = graphForInputsRef.current;
    replaceInputs(graph ? defaultInputState(graph.inputs) : {});
  }, [cacheScope, replaceInputs]);

  // Auto-run once per page, as soon as its content has loaded.
  const autoRanScope = useRef<string | null>(null);
  const hasQueries = (graphForInputs?.queries.size ?? 0) > 0;
  useEffect(() => {
    if (!autoRun || !hasQueries || autoRanScope.current === cacheScope) return;
    autoRanScope.current = cacheScope;
    runAll().catch(() => undefined);
  }, [autoRun, cacheScope, hasQueries, runAll]);

  const snapshot = useCallback(
    () => ({
      results: resultsRef.current,
      statuses: statusesRef.current,
      errors: errorsRef.current,
      durations: durationsRef.current,
    }),
    [],
  );

  return {
    results,
    statuses,
    errors,
    durations,
    inputs,
    isRunning,
    runAll,
    runQuery,
    setInput,
    snapshot,
  };
}
