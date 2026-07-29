import {
  isPipelineExecutionRequest,
  shouldBlockDbtToolForPipelineExecution,
} from '../../../../../src/main/services/ai/pipelineIntent';

describe('pipeline execution intent routing', () => {
  it.each([
    'run the pipeline',
    'ok run the new pipeline',
    'Please execute the active pipeline',
    'trigger this pipeline',
    'run .rosetta/pipeline-ci.yml',
    'not dbt run, the pipeline',
  ])('recognizes an execution request: %s', (content) => {
    expect(isPipelineExecutionRequest(content)).toBe(true);
  });

  it.each([
    'do not run the pipeline',
    'how do I run the pipeline?',
    'what happens when the pipeline runs?',
    'show me the pipeline status',
    'run dbt for model customers',
    'explain .rosetta/pipeline-ci.yml',
  ])('does not route a non-execution request: %s', (content) => {
    expect(isPipelineExecutionRequest(content)).toBe(false);
  });

  it('blocks dbt execution tools only for a pipeline execution turn', () => {
    expect(
      shouldBlockDbtToolForPipelineExecution('studio_cli_run_dbt', true),
    ).toBe(true);
    expect(shouldBlockDbtToolForPipelineExecution('runDbtCommand', true)).toBe(
      true,
    );
    expect(
      shouldBlockDbtToolForPipelineExecution(
        'pipeline_cloud_request_run',
        true,
      ),
    ).toBe(false);
    expect(
      shouldBlockDbtToolForPipelineExecution('studio_cli_run_dbt', false),
    ).toBe(false);
  });
});
