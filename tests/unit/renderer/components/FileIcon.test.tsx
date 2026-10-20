import React from 'react';
import { render, screen } from '@testing-library/react';

import { FileIcon } from '../../../../src/renderer/components/fileIcon';

describe('FileIcon', () => {
  it.each(['dbt_project.yml', 'profiles.yaml', 'SCHEMA.YML'])(
    'shows the YAML icon for %s',
    (fileName) => {
      const { container } = render(<FileIcon fileName={fileName} />);

      expect(screen.getByLabelText('YML')).toBeInTheDocument();
      expect(container.querySelector('.icon')).toBeNull();
    },
  );

  it('keeps the file-icons-js icon for other files', () => {
    const { container } = render(<FileIcon fileName="model.sql" />);

    expect(screen.queryByLabelText('YML')).toBeNull();
    expect(container.querySelector('.icon.mock-icon-class')).not.toBeNull();
  });
});
