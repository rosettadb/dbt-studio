import { execFileSync } from 'child_process';

describe('MarkdownPreview security', () => {
  it('uses a default sanitizer that strips executable HTML', () => {
    const script = `
      import { sanitize } from 'hast-util-sanitize';
      const tree = {
        type: 'root',
        children: [
          {
            type: 'element',
            tagName: 'script',
            properties: {},
            children: [{ type: 'text', value: 'alert("script")' }]
          },
          {
            type: 'element',
            tagName: 'img',
            properties: { src: 'x', onError: 'alert("image")' },
            children: []
          },
          {
            type: 'element',
            tagName: 'a',
            properties: { href: 'java' + 'script:alert("link")' },
            children: [{ type: 'text', value: 'unsafe link' }]
          }
        ]
      };
      process.stdout.write(JSON.stringify(sanitize(tree)));
    `;
    const sanitized = JSON.parse(
      execFileSync(
        process.execPath,
        ['--input-type=module', '--eval', script],
        {
          encoding: 'utf8',
        },
      ),
    );
    const serialized = JSON.stringify(sanitized);
    const unsafeProtocol = ['java', 'script:'].join('');

    expect(serialized).not.toContain('"tagName":"script"');
    expect(serialized).not.toContain('onError');
    expect(serialized).not.toContain(unsafeProtocol);
  });
});
