import React from 'react';
import { Toolbar, Typography, Tooltip, TextField } from '@mui/material';
import { makeStyles } from '@mui/styles';

const useStyles = makeStyles({
  root: {
    paddingLeft: '10px',
    paddingRight: '5px',
  },
  title: {
    flex: '1 1 45%',
  },
});

type Props = {
  name: string;
  handleSearch: (keyword: string) => void;
};

const CustomTableToolbar = ({ name, handleSearch }: Props) => {
  const classes = useStyles();
  return (
    <div>
      <Toolbar>
        <Typography
          className={classes.title}
          variant="h6"
          id="tableTitle"
          component="div"
        >
          {name}
        </Typography>
        <Tooltip title="Search by name">
          <TextField
            name="search"
            label="Search"
            color="primary"
            onChange={(event) => {
              handleSearch(event.target.value);
            }}
          />
        </Tooltip>
      </Toolbar>
    </div>
  );
};

export { CustomTableToolbar };
