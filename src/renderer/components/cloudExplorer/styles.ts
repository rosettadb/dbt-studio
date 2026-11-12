import type { SxProps, Theme } from '@mui/material';

// Settings → General uses compact bordered sections and quiet header strips.
// Keep these rules inside Cloud Explorer; the application theme is unchanged.
const cloudExplorerComponentSx = {
  '& h1.MuiTypography-root': { fontSize: 18, fontWeight: 600, lineHeight: 1.4 },
  '& .MuiTypography-body2': { fontSize: 13 },
  '& .MuiTypography-subtitle1, & .MuiTypography-subtitle2': {
    fontSize: 13,
    fontWeight: 600,
  },
  '& .MuiCard-root.MuiPaper-root': {
    border: 1,
    borderColor: 'divider',
    borderRadius: 2,
    boxShadow: 'none',
    bgcolor: 'background.default',
    backgroundImage: 'none',
    '&:hover': { boxShadow: 'none', transform: 'none' },
  },
  '& .MuiCardHeader-root': {
    px: 1.75,
    py: 0.875,
    minHeight: 38,
    bgcolor: 'action.hover',
    borderBottom: 1,
    borderColor: 'divider',
  },
  '& .MuiCardHeader-title': { fontSize: 13, fontWeight: 600 },
  '& .MuiCardHeader-subheader': { fontSize: 12, color: 'text.secondary' },
  '& .MuiCardContent-root': { p: 1.75, '&:last-child': { pb: 1.75 } },
  '& .MuiTableContainer-root': {
    boxShadow: 'none',
    backgroundImage: 'none',
    bgcolor: 'transparent',
  },
  '& .MuiTableCell-root': {
    px: 1.75,
    py: 0.875,
    fontSize: 13,
    borderColor: 'divider',
  },
  '& .MuiTableCell-head': { bgcolor: 'action.hover', fontWeight: 600 },
  '& .MuiTableRow-root:last-child .MuiTableCell-body': { borderBottom: 0 },
  '& .MuiButton-root': {
    minWidth: 0,
    fontSize: 12,
    lineHeight: 1.6,
    px: 1,
    py: 0.25,
    textTransform: 'none',
  },
  '& .MuiButton-startIcon': {
    mr: 0.5,
    '& > *:nth-of-type(1)': { fontSize: 15 },
  },
  '& .MuiIconButton-root': { p: 0.5 },
  '& .MuiIconButton-root .MuiSvgIcon-root': { fontSize: 18 },
  '& .MuiInputBase-root': { fontSize: 13, minHeight: 32 },
  '& .MuiInputBase-root:not(.MuiInputBase-multiline)': { height: 32 },
  '& .MuiInputBase-root:not(.MuiInputBase-multiline) .MuiInputBase-input': {
    py: '6.5px',
  },
  '& .MuiInputLabel-root': { fontSize: 13 },
  '& .MuiInputLabel-outlined:not(.MuiInputLabel-shrink):has(+ .MuiInputBase-root:not(.MuiInputBase-multiline))':
    { transform: 'translate(14px, 7px) scale(1)' },
  '& .MuiChip-root': { height: 24, fontSize: 12 },
} satisfies SxProps<Theme>;

export const cloudExplorerSx: SxProps<Theme> = {
  ...cloudExplorerComponentSx,
  p: '22px 28px 40px',
  bgcolor: 'background.paper',
  minHeight: '100%',
  '& > .MuiBox-root': { p: 0 },
};

// Dialogs render through a portal, outside the screen's style scope.
export const cloudExplorerDialogSx: SxProps<Theme> = {
  ...cloudExplorerComponentSx,
  '& .MuiDialog-paper': {
    border: 1,
    borderColor: 'divider',
    borderRadius: 2,
    backgroundImage: 'none',
  },
  '& .MuiDialogTitle-root': {
    fontSize: 13,
    fontWeight: 600,
    px: 1.75,
    py: 1,
    bgcolor: 'action.hover',
    borderBottom: 1,
    borderColor: 'divider',
  },
  '& .MuiDialogContent-root': { p: 1.75 },
  '& .MuiDialogActions-root': { px: 1.75, py: 1 },
};
