import React from 'react';
import { render, screen } from '@testing-library/react';

import { FileIcon } from '../../../../src/renderer/components/fileIcon';

describe('FileIcon', () => {
  it.each(['dbt_project.yml', 'profiles.yaml', 'SCHEMA.YML'])(
    'shows the YML badge for %s',
    (fileName) => {
      const { container } = render(<FileIcon fileName={fileName} />);

      expect(screen.getByText('YML')).toBeInTheDocument();
      expect(container.querySelector('.icon')).toBeNull();
    },
  );

  it('keeps the file-icons-js icon for other files', () => {
    const { container } = render(<FileIcon fileName="model.sql" />);

    expect(screen.queryByText('YML')).toBeNull();
    expect(container.querySelector('.icon.mock-icon-class')).not.toBeNull();
  });
});
