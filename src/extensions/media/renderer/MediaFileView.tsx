import React from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  BrokenImage,
  Code,
  FitScreen,
  GridOn,
  Image as ImageIcon,
  Movie,
  OpenInNew,
  Refresh,
  ZoomIn,
  ZoomOut,
} from '@mui/icons-material';
import type {
  FileViewDefinition,
  FileViewProps,
} from '../../../extensionApi/renderer';
import { Editor } from '../../../extensionApi/studio/editor';
import { useRefreshProjectFiles } from '../../../extensionApi/studio/refreshProjectFiles';
import { useTabs } from '../../../extensionApi/studio/tabs';
import type { MediaFilePayload } from '../main';
import {
  formatDuration,
  formatFileSize,
  getLowerExtension,
  getMediaKind,
  isMediaFile,
} from '../shared/mediaTypes';
import { ipc } from './ipc';

type ZoomMode = 'fit' | number;

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.25;

const CHECKERBOARD_BG =
  'linear-gradient(45deg, rgba(128,128,128,0.16) 25%, transparent 25%), ' +
  'linear-gradient(-45deg, rgba(128,128,128,0.16) 25%, transparent 25%), ' +
  'linear-gradient(45deg, transparent 75%, rgba(128,128,128,0.16) 75%), ' +
  'linear-gradient(-45deg, transparent 75%, rgba(128,128,128,0.16) 75%)';

const clampZoom = (value: number): number =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

const MediaFileView: React.FC<FileViewProps> = ({ tab, project }) => {
  const { updateTabContent, markTabSaved, setTabError, openFile } = useTabs();
  const refreshProjectFiles = useRefreshProjectFiles();

  const mediaKind = getMediaKind(tab.path);
  const ext = getLowerExtension(tab.path);
  const extLabel = ext ? ext.slice(1).toUpperCase() : 'MEDIA';
  const isSvg = ext === '.svg';

  const [objectUrl, setObjectUrl] = React.useState<string | null>(null);
  const [fileSize, setFileSize] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = React.useState(0);

  const [zoomMode, setZoomMode] = React.useState<ZoomMode>('fit');
  const [showCheckerboard, setShowCheckerboard] = React.useState<boolean>(true);
  const [svgCodeMode, setSvgCodeMode] = React.useState<boolean>(false);
  const [dimensions, setDimensions] = React.useState<{
    width: number;
    height: number;
  } | null>(null);
  const [duration, setDuration] = React.useState<number | null>(null);

  React.useEffect(() => {
    setZoomMode('fit');
    setSvgCodeMode(false);
    setDimensions(null);
    setDuration(null);
  }, [tab.path]);

  React.useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;

    const loadMedia = async () => {
      setLoading(true);
      setError(null);
      setObjectUrl(null);
      setFileSize(null);
      setDimensions(null);
      setDuration(null);

      try {
        const payload = (await ipc.invoke(
          'media:readFile',
          tab.path,
        )) as MediaFilePayload;
        if (cancelled) return;

        const bytes = new Uint8Array(payload.data);
        const blob = new Blob([bytes], { type: payload.mimeType });
        createdUrl = URL.createObjectURL(blob);
        setObjectUrl(createdUrl);
        setFileSize(payload.size);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : 'Failed to load media file.',
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadMedia();

    return () => {
      cancelled = true;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [tab.path, reloadNonce]);

  const handleOpenExternal = React.useCallback(async () => {
    try {
      const openError = (await ipc.invoke(
        'media:openExternal',
        tab.path,
      )) as string;
      if (openError) {
        setError(openError);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to open file in external application.',
      );
    }
  }, [tab.path]);

  const handleZoomIn = React.useCallback(() => {
    setZoomMode((prev) => {
      const current = prev === 'fit' ? 1 : prev;
      return clampZoom(current * ZOOM_STEP);
    });
  }, []);

  const handleZoomOut = React.useCallback(() => {
    setZoomMode((prev) => {
      const current = prev === 'fit' ? 1 : prev;
      return clampZoom(current / ZOOM_STEP);
    });
  }, []);

  const handleWheelZoom = React.useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (mediaKind !== 'image' || !(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      if (event.deltaY < 0) {
        handleZoomIn();
      } else if (event.deltaY > 0) {
        handleZoomOut();
      }
    },
    [mediaKind, handleZoomIn, handleZoomOut],
  );

  const zoomLabel =
    zoomMode === 'fit' ? 'Fit' : `${Math.round(zoomMode * 100)}%`;

  const metadataParts: string[] = [];
  if (dimensions) {
    metadataParts.push(`${dimensions.width} × ${dimensions.height}`);
  }
  if (duration !== null) {
    metadataParts.push(formatDuration(duration));
  }
  if (fileSize !== null) {
    metadataParts.push(formatFileSize(fileSize));
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        bgcolor: 'background.default',
      }}
    >
      {/* Toolbar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          px: 2,
          py: 0.75,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
          flexShrink: 0,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            minWidth: 0,
          }}
        >
          {mediaKind === 'video' ? (
            <Movie fontSize="small" color="action" />
          ) : (
            <ImageIcon fontSize="small" color="action" />
          )}
          <Typography variant="body2" fontWeight={500} noWrap>
            {tab.title}
          </Typography>
          <Chip
            label={extLabel}
            size="small"
            variant="outlined"
            sx={{ height: 20, fontSize: 11, fontWeight: 600 }}
          />
          {metadataParts.length > 0 && (
            <Typography
              variant="caption"
              color="text.secondary"
              noWrap
              sx={{ ml: 0.5 }}
            >
              {metadataParts.join(' · ')}
            </Typography>
          )}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {mediaKind === 'image' && !svgCodeMode && (
            <>
              <Tooltip title="Zoom out">
                <IconButton size="small" onClick={handleZoomOut}>
                  <ZoomOut fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Click to toggle Fit / 100%">
                <Button
                  size="small"
                  onClick={() =>
                    setZoomMode((prev) => (prev === 'fit' ? 1 : 'fit'))
                  }
                  sx={{
                    minWidth: 52,
                    px: 1,
                    fontSize: 12,
                    color: 'text.primary',
                    textTransform: 'none',
                  }}
                >
                  {zoomLabel}
                </Button>
              </Tooltip>
              <Tooltip title="Zoom in">
                <IconButton size="small" onClick={handleZoomIn}>
                  <ZoomIn fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Fit to screen">
                <IconButton
                  size="small"
                  color={zoomMode === 'fit' ? 'primary' : 'default'}
                  onClick={() => setZoomMode('fit')}
                >
                  <FitScreen fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Toggle transparency grid">
                <IconButton
                  size="small"
                  color={showCheckerboard ? 'primary' : 'default'}
                  onClick={() => setShowCheckerboard((prev) => !prev)}
                >
                  <GridOn fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          )}

          {isSvg && (
            <Tooltip
              title={svgCodeMode ? 'Show image preview' : 'View SVG source'}
            >
              <IconButton
                size="small"
                color={svgCodeMode ? 'primary' : 'default'}
                onClick={() => setSvgCodeMode((prev) => !prev)}
              >
                <Code fontSize="small" />
              </IconButton>
            </Tooltip>
          )}

          <Tooltip title="Reload">
            <IconButton
              size="small"
              onClick={() => setReloadNonce((n) => n + 1)}
            >
              <Refresh fontSize="small" />
            </IconButton>
          </Tooltip>

          <Tooltip title="Open in external application">
            <IconButton size="small" onClick={handleOpenExternal}>
              <OpenInNew fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Main Content */}
      {isSvg && svgCodeMode ? (
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <Editor
            projectId={project.id}
            projectPath={project.path}
            tabs={[tab]}
            activeTabId={tab.id}
            onTabContentChange={updateTabContent}
            onTabSaved={(tabId) => {
              markTabSaved(tabId);
              refreshProjectFiles();
              setReloadNonce((n) => n + 1);
            }}
            onTabError={setTabError}
            onGitStatusRefresh={refreshProjectFiles}
            onOpenFile={openFile}
          />
        </Box>
      ) : (
        <Box
          onWheel={handleWheelZoom}
          sx={{
            flex: 1,
            minHeight: 0,
            minWidth: 0,
            overflow: zoomMode === 'fit' ? 'hidden' : 'auto',
            display: 'flex',
            alignItems: zoomMode === 'fit' ? 'center' : 'flex-start',
            justifyContent: zoomMode === 'fit' ? 'center' : 'flex-start',
            p: 3,
          }}
        >
          {loading && (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 1.5,
              }}
            >
              <CircularProgress size={28} />
              <Typography variant="body2" color="text.secondary">
                Loading media…
              </Typography>
            </Box>
          )}

          {!loading && error && (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 1.5,
                maxWidth: 420,
                textAlign: 'center',
              }}
            >
              <BrokenImage sx={{ fontSize: 40, color: 'text.secondary' }} />
              <Typography variant="body2" color="text.secondary">
                {error}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<Refresh />}
                  onClick={() => setReloadNonce((n) => n + 1)}
                >
                  Retry
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<OpenInNew />}
                  onClick={handleOpenExternal}
                >
                  Open Externally
                </Button>
              </Box>
            </Box>
          )}

          {!loading && !error && objectUrl && mediaKind === 'image' && (
            <Box
              component="img"
              src={objectUrl}
              alt={tab.title}
              onLoad={(e: React.SyntheticEvent<HTMLImageElement>) => {
                const img = e.currentTarget;
                if (img.naturalWidth && img.naturalHeight) {
                  setDimensions({
                    width: img.naturalWidth,
                    height: img.naturalHeight,
                  });
                }
              }}
              onError={() => {
                setError(
                  'Unable to render this image. The file may be corrupted or use an unsupported format.',
                );
              }}
              sx={{
                display: 'block',
                borderRadius: 1,
                boxShadow: 1,
                ...(showCheckerboard
                  ? {
                      backgroundImage: CHECKERBOARD_BG,
                      backgroundSize: '16px 16px',
                      backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
                    }
                  : {}),
                ...(zoomMode === 'fit'
                  ? {
                      maxWidth: '100%',
                      maxHeight: '100%',
                      width: 'auto',
                      height: 'auto',
                      objectFit: 'contain',
                    }
                  : {
                      margin: 'auto',
                      flexShrink: 0,
                      width: dimensions
                        ? `${Math.round(dimensions.width * zoomMode)}px`
                        : 'auto',
                      height: dimensions
                        ? `${Math.round(dimensions.height * zoomMode)}px`
                        : 'auto',
                      maxWidth: 'none',
                      maxHeight: 'none',
                    }),
              }}
            />
          )}

          {!loading && !error && objectUrl && mediaKind === 'video' && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                height: '100%',
              }}
            >
              <Box
                component="video"
                key={objectUrl}
                src={objectUrl}
                controls
                playsInline
                preload="metadata"
                onLoadedMetadata={(
                  e: React.SyntheticEvent<HTMLVideoElement>,
                ) => {
                  const video = e.currentTarget;
                  if (video.videoWidth && video.videoHeight) {
                    setDimensions({
                      width: video.videoWidth,
                      height: video.videoHeight,
                    });
                  }
                  if (Number.isFinite(video.duration)) {
                    setDuration(video.duration);
                  }
                }}
                onError={() => {
                  setError(
                    `Unable to play "${tab.title}" in the built-in viewer. The video codec may not be supported by the browser engine.`,
                  );
                }}
                sx={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  borderRadius: 1,
                  bgcolor: 'common.black',
                  boxShadow: 2,
                  outline: 'none',
                }}
              />
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
};

export const mediaFileView: FileViewDefinition = {
  id: 'media',
  priority: 10,
  matches: (tab) => isMediaFile(tab.path),
  Component: MediaFileView,
};
