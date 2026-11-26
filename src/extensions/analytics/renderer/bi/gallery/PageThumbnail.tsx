/** Wireframe picture of a page for its gallery card. */
import React, { useMemo } from 'react';
import { Box, useTheme } from '@mui/material';
import {
  buildThumbnail,
  ChartGlyph,
  seededSeries,
  ThumbBlock,
} from './thumbnailModel';

const Line: React.FC<{ width: string; height?: number; strong?: boolean }> = ({
  width,
  height = 4,
  strong,
}) => (
  <Box
    sx={{
      width,
      height,
      borderRadius: 1,
      bgcolor: strong ? 'text.disabled' : 'divider',
      opacity: strong ? 0.6 : 1,
    }}
  />
);

const Glyph: React.FC<{ glyph: ChartGlyph; seed: string; color: string }> = ({
  glyph,
  seed,
  color,
}) => {
  const values = seededSeries(seed, glyph === 'hbar' ? 4 : 16);
  const w = 100;
  const h = 40;
  if (glyph === 'bar') {
    const bw = w / values.length;
    return (
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        width="100%"
        height="100%"
      >
        {values.map((v, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <rect
            key={i}
            x={i * bw + bw * 0.15}
            y={h - v * h}
            width={bw * 0.7}
            height={v * h}
            fill={color}
          />
        ))}
      </svg>
    );
  }
  if (glyph === 'hbar') {
    const bh = h / values.length;
    const sorted = [...values].sort((a, b) => b - a);
    return (
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        width="100%"
        height="100%"
      >
        {sorted.map((v, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <rect
            key={i}
            x={0}
            y={i * bh + bh * 0.15}
            width={v * w}
            height={bh * 0.7}
            fill={color}
          />
        ))}
      </svg>
    );
  }
  if (glyph === 'scatter') {
    const ys = seededSeries(`${seed}y`, values.length);
    return (
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        width="100%"
        height="100%"
      >
        {values.map((v, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <circle
            key={i}
            cx={v * (w - 6) + 3}
            cy={h - ys[i] * (h - 6) - 3}
            r={1.8}
            fill={color}
          />
        ))}
      </svg>
    );
  }
  if (glyph === 'pie') {
    return (
      <svg viewBox="0 0 40 40" width="100%" height="100%">
        <circle
          cx="20"
          cy="20"
          r="14"
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeDasharray="50 88"
        />
        <circle
          cx="20"
          cy="20"
          r="14"
          fill="none"
          stroke={color}
          strokeOpacity={0.45}
          strokeWidth="7"
          strokeDasharray="30 88"
          strokeDashoffset="-50"
        />
        <circle
          cx="20"
          cy="20"
          r="14"
          fill="none"
          stroke={color}
          strokeOpacity={0.2}
          strokeWidth="7"
          strokeDasharray="8 88"
          strokeDashoffset="-80"
        />
      </svg>
    );
  }
  const step = w / (values.length - 1);
  const points = values
    .map((v, i) => `${i * step},${h - v * h * 0.9}`)
    .join(' ');
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      width="100%"
      height="100%"
    >
      {glyph === 'area' && (
        <polygon
          points={`0,${h} ${points} ${w},${h}`}
          fill={color}
          opacity={0.9}
        />
      )}
      {glyph === 'line' && (
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={1.4}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
};

const Block: React.FC<{ block: ThumbBlock; seed: string; color: string }> = ({
  block,
  seed,
  color,
}) => {
  switch (block.kind) {
    case 'title':
      return <Line width="45%" height={7} strong />;
    case 'heading':
      return <Line width="28%" height={5} strong />;
    case 'text':
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {Array.from({ length: block.lines }, (_, i) => (
            <Line key={i} width={i === block.lines - 1 ? '55%' : '92%'} />
          ))}
        </Box>
      );
    case 'alert':
      return (
        <Box sx={{ height: 12, borderRadius: 1, bgcolor: 'action.hover' }} />
      );
    case 'kpis':
      return (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.min(block.count, 4)}, 1fr)`,
            gap: 0.75,
          }}
        >
          {Array.from({ length: Math.min(block.count, 4) }, (_, i) => (
            <Box
              key={i}
              sx={{
                border: 1,
                borderColor: 'divider',
                borderRadius: 0.75,
                p: 0.5,
                display: 'flex',
                flexDirection: 'column',
                gap: 0.4,
              }}
            >
              <Line width="50%" height={3} />
              <Line width="70%" height={6} strong />
            </Box>
          ))}
        </Box>
      );
    case 'filters':
      return (
        <Box sx={{ display: 'flex', gap: 0.75 }}>
          {Array.from({ length: Math.min(block.count, 3) }, (_, i) => (
            <Box
              key={i}
              sx={{
                width: '22%',
                height: 9,
                border: 1,
                borderColor: 'divider',
                borderRadius: 0.5,
              }}
            />
          ))}
        </Box>
      );
    case 'table':
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {Array.from({ length: block.rows }, (_, i) => (
            <Box key={i} sx={{ display: 'flex', gap: 1 }}>
              <Line width="30%" height={3} strong={i === 0} />
              <Line width="20%" height={3} strong={i === 0} />
              <Line width="25%" height={3} strong={i === 0} />
            </Box>
          ))}
        </Box>
      );
    case 'chart':
      return (
        <Box
          sx={{
            height: block.glyph === 'pie' ? 46 : 40,
            display: 'flex',
            justifyContent: block.glyph === 'pie' ? 'center' : 'stretch',
          }}
        >
          <Box
            sx={{ width: block.glyph === 'pie' ? 46 : '100%', height: '100%' }}
          >
            <Glyph glyph={block.glyph} seed={seed} color={color} />
          </Box>
        </Box>
      );
    case 'columns':
      return (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.min(block.cells.length, 3)}, 1fr)`,
            gap: 1,
          }}
        >
          {block.cells.slice(0, 3).map((cell, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <Box
              key={i}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 0.75,
                minWidth: 0,
              }}
            >
              {cell.slice(0, 2).map((b, j) => (
                // eslint-disable-next-line react/no-array-index-key
                <Block
                  key={j}
                  block={b}
                  seed={`${seed}-${i}-${j}`}
                  color={color}
                />
              ))}
            </Box>
          ))}
        </Box>
      );
    default:
      return null;
  }
};

export const PageThumbnail: React.FC<{ markdown: string; seed: string }> = ({
  markdown,
  seed,
}) => {
  const theme = useTheme();
  const blocks = useMemo(() => buildThumbnail(markdown), [markdown]);
  const color = theme.palette.primary.main;
  return (
    <Box
      aria-hidden
      sx={{
        height: 170,
        overflow: 'hidden',
        px: 2,
        pt: 1.75,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        bgcolor: theme.palette.mode === 'dark' ? '#161616' : '#f7f8fa',
        borderBottom: 1,
        borderColor: 'divider',
        maskImage: 'linear-gradient(to bottom, black 80%, transparent)',
      }}
    >
      {blocks.map((block, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <Block key={i} block={block} seed={`${seed}-${i}`} color={color} />
      ))}
    </Box>
  );
};
