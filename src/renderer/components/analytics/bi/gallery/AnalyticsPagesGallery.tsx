/**
 * Shown when no Analytics page is open: the user's pages and the example
 * dashboards as cards, each with a wireframe of the page.
 */
import React, { useMemo } from 'react';
import { Box, Card, CardActionArea, Chip, Typography } from '@mui/material';
import { LockOutlined } from '@mui/icons-material';
import { useGetAnalyticsPages } from '../../../../controllers/analyticsPages.controller';
import { EXAMPLE_PAGES } from '../examples';
import { PageThumbnail } from './PageThumbnail';

export function timeAgo(iso: string | undefined, now = Date.now()): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const minutes = Math.round((now - then) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString();
}

interface CardItem {
  id: string;
  title: string;
  subtitle: string;
  markdown: string;
  example: boolean;
}

const PageCard: React.FC<{ item: CardItem; onOpen: (id: string) => void }> = ({
  item,
  onOpen,
}) => (
  <Card
    variant="outlined"
    sx={{ borderRadius: 2, overflow: 'hidden' }}
    data-testid="analytics-page-card"
  >
    <CardActionArea
      onClick={() => onOpen(item.id)}
      aria-label={`Open ${item.title}`}
    >
      <PageThumbnail markdown={item.markdown} seed={item.id} />
      <Box sx={{ px: 2, py: 1.25 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="subtitle2" noWrap sx={{ flex: 1, minWidth: 0 }}>
            {item.title}
          </Typography>
          {item.example && (
            <Chip
              size="small"
              icon={<LockOutlined sx={{ fontSize: '12px !important' }} />}
              label="Example"
              variant="outlined"
              sx={{ height: 20, fontSize: '0.68rem' }}
            />
          )}
        </Box>
        <Typography
          variant="caption"
          color="text.secondary"
          noWrap
          sx={{ display: 'block' }}
        >
          {item.subtitle}
        </Typography>
      </Box>
    </CardActionArea>
  </Card>
);

const CardGrid: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box
    sx={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
      gap: 2,
      mb: 4,
    }}
  >
    {children}
  </Box>
);

export const AnalyticsPagesGallery: React.FC<{
  connectionId: string;
  onOpenPage: (pageId: string) => void;
}> = ({ connectionId, onOpenPage }) => {
  const { data: pages = [], isLoading } = useGetAnalyticsPages(connectionId);

  const userCards = useMemo<CardItem[]>(
    () =>
      [...pages]
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
        .map((p) => ({
          id: p.id,
          title: p.title,
          subtitle: [
            p.routePath,
            timeAgo(p.updatedAt) && `Updated ${timeAgo(p.updatedAt)}`,
          ]
            .filter(Boolean)
            .join(' · '),
          markdown: p.markdownContent ?? '',
          example: false,
        })),
    [pages],
  );
  const exampleCards: CardItem[] = EXAMPLE_PAGES.map((e) => ({
    id: e.id,
    title: e.title,
    subtitle: e.description,
    markdown: e.markdown,
    example: true,
  }));

  return (
    <Box
      data-testid="analytics-gallery"
      sx={{
        height: '100%',
        overflow: 'auto',
        bgcolor: 'background.default',
        px: 4,
        py: 3,
      }}
    >
      <Box sx={{ maxWidth: 1280, mx: 'auto' }}>
        {connectionId && (userCards.length > 0 || !isLoading) && (
          <>
            <Typography variant="overline" color="text.secondary">
              Your pages
            </Typography>
            {userCards.length === 0 ? (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mb: 4, mt: 0.5 }}
              >
                No pages yet. Create one with + in the sidebar, or open an
                example below and duplicate it.
              </Typography>
            ) : (
              <CardGrid>
                {userCards.map((item) => (
                  <PageCard key={item.id} item={item} onOpen={onOpenPage} />
                ))}
              </CardGrid>
            )}
          </>
        )}

        <Typography variant="overline" color="text.secondary">
          Examples
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Read-only dashboards on sample data. Open one to see the dashboard and
          the markdown that builds it.
        </Typography>
        <CardGrid>
          {exampleCards.map((item) => (
            <PageCard key={item.id} item={item} onOpen={onOpenPage} />
          ))}
        </CardGrid>
      </Box>
    </Box>
  );
};
