import React from 'react';
import styles from './splash.module.scss';
import { logo } from '../../../../assets';

type Props = {
  loaderMessage?: string;
};

export const Splash: React.FC<Props> = ({ loaderMessage }) => {
  return (
    <div className={styles.container}>
      <img src={logo} alt="logo" className={styles.image} />
      {loaderMessage && (
        <div className={styles.loaderMessage}>{loaderMessage}</div>
      )}
    </div>
  );
};
