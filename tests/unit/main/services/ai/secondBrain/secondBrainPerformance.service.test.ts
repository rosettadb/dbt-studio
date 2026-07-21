/* eslint-disable no-await-in-loop -- sequential filesystem timing is intentional */
import { performance } from 'perf_hooks';
import { promises as nodeFs } from 'fs';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import SecondBrainService from '../../../../../../src/main/services/ai/secondBrain/secondBrain.service';
import SecondBrainRuntimeService from '../../../../../../src/main/services/ai/secondBrain/secondBrainRuntime.service';
import type {
  SecondBrainScope,
  SecondBrainSettings,
} from '../../../../../../src/types/backend';

const markdown = (index: number) => `---
type: Benchmark Knowledge
id: benchmark-${index}
title: Benchmark ${index}
scope: global
updated_by: user
sources: []
---

# Benchmark ${index}

Durable benchmark fact ${index} about customer revenue validation.
`;

describe('Second Brain bounded performance gates', () => {
  let temporaryDirectory: string;
  let service: SecondBrainService;

  beforeEach(async () => {
    temporaryDirectory = await nodeFs.mkdtemp(
      path.join(os.tmpdir(), 'dbt-studio-second-brain-performance-'),
    );
    service = new SecondBrainService({
      rootPath: path.join(temporaryDirectory, 'second-brain'),
    });
    await service.initializeRoot();
    for (let index = 0; index < 40; index += 1) {
      await service.writePage({
        pageId: `topics/benchmark-${index}.md`,
        content: markdown(index),
        actor: 'user',
      });
    }
  });

  afterEach(async () => {
    await fs.remove(temporaryDirectory);
  });

  it('keeps expected-size reads, searches, and prompt maps inside hard budgets', async () => {
    const runtime = new SecondBrainRuntimeService(service);
    const scope: SecondBrainScope = {
      screenKey: 'project',
      projectId: 42,
      projectPath: '/tmp/project',
    };
    const settings: SecondBrainSettings = {
      enabled: true,
      initialized: true,
      maxPromptChars: 6000,
      maxPageBytes: 64 * 1024,
      maxTotalBytes: 10 * 1024 * 1024,
      includeGlobalPages: true,
      inlineSelfLearning: true,
    };

    const readStarted = performance.now();
    await service.readPage('topics/benchmark-20.md');
    const readDuration = performance.now() - readStarted;

    const searchDurations: number[] = [];
    for (let index = 0; index < 5; index += 1) {
      const started = performance.now();
      const response = await runtime.search(
        `customer revenue validation ${index}`,
        scope,
        { limit: 50, includeGlobalPages: true },
      );
      searchDurations.push(performance.now() - started);
      expect(response.results.length).toBeLessThanOrEqual(10);
      expect(response.scannedPages).toBeLessThanOrEqual(500);
    }
    const p95Search = [...searchDurations].sort((left, right) => left - right)[
      Math.ceil(searchDurations.length * 0.95) - 1
    ];

    const contextStarted = performance.now();
    const context = await runtime.buildContext(scope, settings);
    const contextDuration = performance.now() - contextStarted;

    expect(readDuration).toBeLessThan(2000);
    expect(p95Search).toBeLessThan(5000);
    expect(contextDuration).toBeLessThan(2000);
    expect(context.context.length).toBeLessThanOrEqual(settings.maxPromptChars);
  });
});
