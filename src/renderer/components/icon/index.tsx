/* eslint react/jsx-props-no-spreading: off, react/no-danger: off */
import React, { useEffect, useRef, useState } from 'react';

interface InlineSvgProps extends React.HTMLAttributes<HTMLDivElement> {
  src: string;
  width?: string | number;
  height?: string | number;
  color?: string;
}

export const Icon: React.FC<InlineSvgProps> = ({
  src,
  width = 18,
  height = 18,
  color = 'currentColor',
  style,
  ...props
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgContent, setSvgContent] = useState('');

  useEffect(() => {
    fetch(src)
      .then((res) => res.text())
      .then(setSvgContent)
      .catch(() => {});
  }, [src]);

  useEffect(() => {
    if (containerRef.current && svgContent) {
      const div = containerRef.current;
      div.innerHTML = svgContent;

      const svg = div.querySelector('svg');
      if (svg) {
        svg.setAttribute('width', `${width}`);
        svg.setAttribute('height', `${height}`);
        svg.setAttribute('fill', 'currentColor');
      }
    }
  }, [svgContent, width, height]);

  return (
    <div
      ref={containerRef}
      {...props}
      style={{ width, height, color, display: 'inline-block', ...style }}
    />
  );
};
