import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { StepEditDialog } from '../../../../src/extensions/pipeline/renderer/StepEditDialog';
import type { PipelineNodeData } from '../../../../src/extensions/pipeline/renderer/PipelineNode';

// The designer's plugins come from the runner's plugin manifest.
jest.mock(
  '../../../../src/extensions/pipeline/renderer/pipelineControllers',
  () => {
    const { parsePluginManifest } = jest.requireActual(
      '../../../../src/shared/pluginManifest',
    );
    const data = [
      ...parsePluginManifest(
        jest.requireActual('../../__fixtures__/plugins.json'),
      ),
      ...parsePluginManifest([
        {
          name: 'every_widget@v1',
          widgets: [
            { key: 'flag', type: 'checkbox', label: 'Flag' },
            { key: 'count', type: 'number', label: 'Count' },
            {
              key: 'secret',
              type: 'input',
              label: 'Secret',
              visible_when: { key: 'flag', equals: true },
            },
            { key: 'pairs', type: 'key_value', label: 'Pairs' },
          ],
        },
      ]),
    ];
    return { useGetRunnerPlugins: () => ({ data, isLoading: false }) };
  },
);

const step = (
  plugin: string,
  params: Record<string, unknown>,
): PipelineNodeData => ({
  name: 'My step',
  plugin,
  params,
  stepIndex: 0,
  jobName: 'build',
});

const renderDialog = (data: PipelineNodeData) => {
  const onSave = jest.fn();
  render(
    <StepEditDialog
      open
      data={data}
      existingJobNames={['build']}
      onClose={jest.fn()}
      onSave={onSave}
    />,
  );
  return onSave;
};

describe('StepEditDialog', () => {
  it('shows the form of the plugin manifest and saves what was edited', () => {
    const onSave = renderDialog(
      step('pyspark@v1', { script: 'jobs/a.py', custom: [1, 2] }),
    );

    expect(screen.getByLabelText('Script')).toHaveValue('jobs/a.py');
    expect(screen.getByLabelText('Script arguments')).toHaveValue('');
    // The manifest's "Advanced" group.
    expect(screen.getByText('Advanced')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Script'), {
      target: { value: 'jobs/b.py' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onSave).toHaveBeenCalledWith({
      name: 'My step',
      plugin: 'pyspark@v1',
      jobName: 'build',
      jobType: undefined,
      // A parameter the form does not show is saved back untouched.
      params: { script: 'jobs/b.py', custom: [1, 2] },
    });
  });

  it('shows a rule of the manifest that is not met', () => {
    renderDialog(step('pyspark@v1', {}));
    expect(
      screen.getByText('Provide a script or a command.'),
    ).toBeInTheDocument();
  });

  it('keeps the parameters of a plugin the manifest does not list', () => {
    const onSave = renderDialog(step('future@v9', { anything: 'kept' }));
    expect(screen.getByText(/does not list this plugin/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onSave.mock.calls[0][0].params).toEqual({ anything: 'kept' });
  });

  it('writes typed values and drops fields hidden by visible_when', () => {
    const onSave = renderDialog(
      step('every_widget@v1', {
        flag: true,
        secret: 's3cret',
        pairs: 'A=1\nB=2',
      }),
    );
    expect(screen.getByLabelText('Secret')).toHaveValue('s3cret');
    expect(screen.getAllByPlaceholderText('KEY').map((el) => el)).toHaveLength(
      2,
    );

    fireEvent.change(screen.getByLabelText('Count'), {
      target: { value: '3' },
    });
    fireEvent.change(screen.getAllByPlaceholderText('value')[1], {
      target: { value: 'two' },
    });
    fireEvent.click(screen.getByLabelText('Flag'));
    expect(screen.queryByLabelText('Secret')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onSave.mock.calls[0][0].params).toEqual({
      flag: false,
      count: 3,
      pairs: 'A=1\nB=two',
    });
  });
});
