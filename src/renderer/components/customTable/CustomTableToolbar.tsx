import React, { ReactNode } from 'react';
import { Toolbar, Typography, Tooltip, TextField, Box } from '@mui/material';
import { makeStyles } from '@mui/styles';

const useStyles = makeStyles({
  root: {
    paddingLeft: '10px',
    paddingRight: '5px',
  },
  title: {
    flex: '1 1 45%',
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
          <Typography
            className={classes.title}
            variant="h6"
            id="tableTitle"
            component="div"
          >
            {name}
          </Typography>
        ) : (
          <div className={classes.title} />
        )}

        {toolbarContent && <Box mr={2}>{toolbarContent}</Box>}

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
