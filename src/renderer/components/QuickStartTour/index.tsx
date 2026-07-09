import React from 'react';
import ReactDOM from 'react-dom';
import { Box, Button, Typography, IconButton, Paper } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckIcon from '@mui/icons-material/Check';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import AddIcon from '@mui/icons-material/Add';
import ElectricalServicesIcon from '@mui/icons-material/ElectricalServices';
import SearchIcon from '@mui/icons-material/Search';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';

const TOUR_SEEN_KEY = 'dbt-studio-quickstart-tour-seen';

export const hasSeenTour = (): boolean => {
  try {
    return localStorage.getItem(TOUR_SEEN_KEY) === 'true';
  } catch {
    return false;
  }
};

export const markTourSeen = (): void => {
  try {
    localStorage.setItem(TOUR_SEEN_KEY, 'true');
  } catch {
    // ignore
  }
};

export const resetTour = (): void => {
  try {
    localStorage.removeItem(TOUR_SEEN_KEY);
  } catch {
    // ignore
  }
};

interface TourStep {
  targetId?: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  padding?: number;
}

const TOUR_STEPS: TourStep[] = [
  {
    title: 'Welcome to DBT Studio! 🎉',
    description:
      "We'll give you a quick tour of the key features so you can hit the ground running. This only takes about 30 seconds.",
    icon: <AutoAwesomeIcon sx={{ fontSize: 40, color: '#4f83cc' }} />,
    placement: 'center',
  },
  {
    targetId: 'tour-projects-area',
    title: 'Your Projects',
    description:
      'This is your project workspace. All your dbt projects live here. Click any project to open it and start working.',
    icon: <FolderOpenIcon sx={{ fontSize: 28, color: '#4f83cc' }} />,
    placement: 'bottom',
    padding: 12,
  },
  {
    targetId: 'tour-new-project-btn',
    title: 'Create a New Project',
    description:
      'Click here to create a brand new dbt project from scratch. Give it a name, choose a location, and optionally link a database connection.',
    icon: <AddIcon sx={{ fontSize: 28, color: '#4f83cc' }} />,
    placement: 'bottom',
    padding: 8,
  },
  {
    targetId: 'tour-get-started-btn',
    title: 'Get Started Fast',
    description:
      'New to dbt Studio? Import a pre-built example project with sample data and dbt models — ready to explore instantly. Perfect for learning the ropes.',
    icon: <RocketLaunchIcon sx={{ fontSize: 28, color: '#4f83cc' }} />,
    placement: 'bottom',
    padding: 8,
  },
  {
    targetId: 'tour-import-btn',
    title: 'Import an Existing Project',
    description:
      'Already have a dbt project on your machine? Use Import to load it directly from your filesystem or from a compressed archive (.zip, .tar.gz).',
    icon: <FolderOpenIcon sx={{ fontSize: 28, color: '#4f83cc' }} />,
    placement: 'bottom',
    padding: 8,
  },
  {
    targetId: 'tour-connections-nav',
    title: 'Database Connections',
    description:
      'Manage your database connections here — connect to BigQuery, Snowflake, DuckDB, Redshift, and more. Connections can be shared across multiple projects.',
    icon: <ElectricalServicesIcon sx={{ fontSize: 28, color: '#4f83cc' }} />,
    placement: 'right',
    padding: 8,
  },
  {
    targetId: 'tour-search-bar',
    title: "You're All Set! 🚀",
    description:
      'Start by creating your first project or importing an existing one. Use the search bar to quickly find projects as your list grows. Happy building!',
    icon: <SearchIcon sx={{ fontSize: 28, color: '#4caf50' }} />,
    placement: 'bottom',
    padding: 8,
  },
];

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function getElementRect(id: string, padding = 8): SpotlightRect | null {
  const el = document.querySelector(`[data-tour="${id}"]`);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  return {
    top: rect.top - padding,
    left: rect.left - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

function getPopoverPosition(
  spotlightRect: SpotlightRect | null,
  placement: TourStep['placement'],
  popoverWidth = 340,
  popoverHeight = 220,
): React.CSSProperties {
  if (!spotlightRect || placement === 'center') {
    return {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: popoverWidth,
    };
  }

  const margin = 16;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let top: number;
  let left: number;

  switch (placement) {
    case 'bottom':
      top = spotlightRect.top + spotlightRect.height + margin;
      left = spotlightRect.left + spotlightRect.width / 2 - popoverWidth / 2;
      break;
    case 'top':
      top = spotlightRect.top - popoverHeight - margin;
      left = spotlightRect.left + spotlightRect.width / 2 - popoverWidth / 2;
      break;
    case 'right':
      top = spotlightRect.top + spotlightRect.height / 2 - popoverHeight / 2;
      left = spotlightRect.left + spotlightRect.width + margin;
      break;
    case 'left':
      top = spotlightRect.top + spotlightRect.height / 2 - popoverHeight / 2;
      left = spotlightRect.left - popoverWidth - margin;
      break;
    default:
      top = spotlightRect.top + spotlightRect.height + margin;
      left = spotlightRect.left + spotlightRect.width / 2 - popoverWidth / 2;
  }

  // Clamp within viewport
  left = Math.max(margin, Math.min(left, vw - popoverWidth - margin));
  top = Math.max(margin, Math.min(top, vh - popoverHeight - margin));

  return {
    position: 'fixed',
    top,
    left,
    width: popoverWidth,
  };
}

interface QuickStartTourProps {
  /** If true, always show the tour regardless of localStorage state */
  forceShow?: boolean;
  onClose?: () => void;
}

export const QuickStartTour: React.FC<QuickStartTourProps> = ({
  forceShow = false,
  onClose,
}) => {
  const [visible, setVisible] = React.useState(false);
  const [stepIndex, setStepIndex] = React.useState(0);
  const [spotlightRect, setSpotlightRect] =
    React.useState<SpotlightRect | null>(null);
  const [isAnimating, setIsAnimating] = React.useState(false);

  // Determine whether to show the tour
  React.useEffect(() => {
    if (forceShow || !hasSeenTour()) {
      // Delay slightly so all DOM elements have time to render
      const timer = setTimeout(() => setVisible(true), 700);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [forceShow]);

  // Recompute spotlight rect whenever step changes
  React.useEffect(() => {
    if (!visible) return undefined;

    const step = TOUR_STEPS[stepIndex];
    if (!step.targetId) {
      setSpotlightRect(null);
      return undefined;
    }

    const updateRect = () => {
      const rect = getElementRect(step.targetId!, step.padding);
      setSpotlightRect(rect);
    };

    updateRect();
    window.addEventListener('resize', updateRect);
    return () => window.removeEventListener('resize', updateRect);
  }, [visible, stepIndex]);

  const closeTour = React.useCallback(() => {
    markTourSeen();
    setVisible(false);
    onClose?.();
  }, [onClose]);

  const goToStep = React.useCallback(
    (nextIndex: number) => {
      if (isAnimating) return;
      setIsAnimating(true);
      setTimeout(() => {
        setStepIndex(nextIndex);
        setIsAnimating(false);
      }, 150);
    },
    [isAnimating],
  );

  const handleNext = React.useCallback(() => {
    if (stepIndex < TOUR_STEPS.length - 1) {
      goToStep(stepIndex + 1);
    } else {
      closeTour();
    }
  }, [stepIndex, goToStep, closeTour]);

  const handlePrev = React.useCallback(() => {
    if (stepIndex > 0) {
      goToStep(stepIndex - 1);
    }
  }, [stepIndex, goToStep]);

  if (!visible) return null;

  const step = TOUR_STEPS[stepIndex];
  const isLast = stepIndex === TOUR_STEPS.length - 1;
  const isFirst = stepIndex === 0;
  // eslint-disable-next-line no-nested-ternary
  const buttonLabel = isLast ? 'Done' : isFirst ? "Let's Go!" : 'Next';
  const popoverStyle = getPopoverPosition(spotlightRect, step.placement);
  const totalSteps = TOUR_STEPS.length;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const popoverTransform = (popoverStyle as any).transform as
    | string
    | undefined;

  const tourContent = (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        pointerEvents: 'all',
      }}
    >
      {/* SVG dark overlay with spotlight cutout */}
      <svg
        style={{
          position: 'fixed',
          inset: 0,
          width: '100vw',
          height: '100vh',
          pointerEvents: 'none',
        }}
      >
        <defs>
          <mask id="tour-spotlight-mask">
            <rect width="100%" height="100%" fill="white" />
            {spotlightRect && (
              <rect
                x={spotlightRect.left}
                y={spotlightRect.top}
                width={spotlightRect.width}
                height={spotlightRect.height}
                rx="6"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.65)"
          mask="url(#tour-spotlight-mask)"
        />
        {/* Animated dashed highlight border around spotlighted element */}
        {spotlightRect && (
          <rect
            x={spotlightRect.left}
            y={spotlightRect.top}
            width={spotlightRect.width}
            height={spotlightRect.height}
            rx="6"
            fill="none"
            stroke="#4f83cc"
            strokeWidth="2"
            strokeDasharray="6 3"
            style={{ animation: 'tourBorderDash 1.2s linear infinite' }}
          />
        )}
      </svg>

      {/* Popover tooltip card */}
      <Paper
        elevation={8}
        sx={{
          ...popoverStyle,
          position: 'fixed',
          borderRadius: '12px',
          overflow: 'hidden',
          opacity: isAnimating ? 0 : 1,
          transform: isAnimating
            ? `${popoverTransform ?? ''} translateY(6px)`.trim()
            : (popoverTransform ?? 'none'),
          transition: 'opacity 0.15s ease, transform 0.15s ease',
          border: '1px solid rgba(79, 131, 204, 0.25)',
        }}
      >
        {/* Gradient accent bar */}
        <Box
          sx={{
            height: 4,
            background: 'linear-gradient(90deg, #1a365d, #2c5282, #4f83cc)',
          }}
        />

        <Box sx={{ p: 2.5 }}>
          {/* Title row */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              mb: 1.5,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              {step.icon}
              <Typography
                variant="subtitle1"
                sx={{ fontWeight: 600, lineHeight: 1.3 }}
              >
                {step.title}
              </Typography>
            </Box>
            <IconButton
              size="small"
              onClick={closeTour}
              sx={{
                opacity: 0.4,
                '&:hover': { opacity: 1 },
                ml: 1,
                flexShrink: 0,
              }}
              title="Skip tour"
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>

          {/* Description */}
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ lineHeight: 1.65, mb: 2.5 }}
          >
            {step.description}
          </Typography>

          {/* Footer: dots + buttons */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            {/* Clickable step progress dots */}
            <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}>
              {TOUR_STEPS.map((_, i) => (
                <Box
                  // eslint-disable-next-line react/no-array-index-key
                  key={i}
                  onClick={() => goToStep(i)}
                  sx={{
                    width: i === stepIndex ? 20 : 6,
                    height: 6,
                    borderRadius: '3px',
                    bgcolor:
                      i === stepIndex ? 'primary.main' : 'action.disabled',
                    cursor: 'pointer',
                    transition: 'all 0.25s ease',
                    '&:hover': { bgcolor: 'primary.light' },
                  }}
                />
              ))}
            </Box>

            {/* Navigation buttons */}
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              {isFirst ? (
                <Button
                  size="small"
                  onClick={closeTour}
                  sx={{
                    color: 'text.disabled',
                    fontSize: '0.75rem',
                    px: 1.5,
                    py: 0.5,
                    minWidth: 0,
                  }}
                >
                  Skip
                </Button>
              ) : (
                <Button
                  size="small"
                  variant="outlined"
                  onClick={handlePrev}
                  startIcon={<ArrowBackIcon fontSize="small" />}
                  sx={{ minWidth: 0, px: 1.5, py: 0.5, fontSize: '0.75rem' }}
                >
                  Back
                </Button>
              )}
              <Button
                size="small"
                variant="contained"
                onClick={handleNext}
                endIcon={
                  isLast ? (
                    <CheckIcon fontSize="small" />
                  ) : (
                    <ArrowForwardIcon fontSize="small" />
                  )
                }
                sx={{ px: 2, py: 0.5, fontSize: '0.75rem' }}
              >
                {buttonLabel}
              </Button>
            </Box>
          </Box>
        </Box>

        {/* Step counter */}
        <Box
          sx={{
            px: 2.5,
            pb: 1.5,
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <Typography
            variant="caption"
            sx={{ color: 'text.disabled', fontSize: '0.7rem' }}
          >
            {stepIndex + 1} / {totalSteps}
          </Typography>
        </Box>
      </Paper>

      {/* Keyframe animation for spotlight dashed border */}
      <style>{`
        @keyframes tourBorderDash {
          to { stroke-dashoffset: -18; }
        }
      `}</style>
    </Box>
  );

  return ReactDOM.createPortal(tourContent, document.body);
};
