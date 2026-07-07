import React, { ReactNode } from 'react';
import { Toolbar, Tooltip, TextField, Box } from '@mui/material';
import { makeStyles } from '@mui/styles';

const useStyles = makeStyles({
  root: {
    paddingLeft: '10px',
    paddingRight: '5px',
  },
  title: {
    flex: '1 1 auto',
    minWidth: 0,
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
  },
  searchContainer: {
    paddingTop: '4px',
    paddingBottom: '4px',
  },
});

type Props = {
  name: ReactNode;
  handleSearch: (keyword: string) => void;
  toolbarContent?: ReactNode;
  showSearch?: boolean;
};

const CustomTableToolbar = ({
  name,
  handleSearch,
  toolbarContent,
  showSearch = true,
}: Props) => {
  const classes = useStyles();
  return (
    <div>
      <Toolbar
        variant="dense"
        style={{ minHeight: '36px', paddingLeft: '8px', paddingRight: '8px' }}
      >
        {name ? (
          <Box className={classes.title} id="tableTitle">
            {name}
          </Box>
        ) : (
          <div className={classes.title} />
        )}

        {toolbarContent && (
          <Box mr={2} sx={{ flex: '0 0 auto' }}>
            {toolbarContent}
          </Box>
        )}

        {showSearch && (
          <Tooltip title="Search by name">
            <TextField
              name="search"
              placeholder="Search..."
              variant="outlined"
              size="small"
              className={classes.searchContainer}
              onChange={(event) => {
                handleSearch(event.target.value);
              }}
              InputProps={{
                style: { height: 32, fontSize: '0.875rem' },
              }}
            />
          </Tooltip>
        )}
      </Toolbar>
    </div>
  );
};

export { CustomTableToolbar };
