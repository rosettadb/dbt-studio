import React, { useRef, useState, useEffect } from 'react';
import { Tooltip, TooltipProps } from '@mui/material';

type Props = {
  children: React.ReactNode;
  style?: React.CSSProperties;
  placement?: TooltipProps['placement'];
};

export const OverflowTip: React.FC<Props> = ({
  children,
  style,
  placement,
}) => {
  const [isOverflowed, setIsOverflow] = useState(false);
  const textElementRef: any = useRef();
  useEffect(() => {
    setIsOverflow(
      textElementRef.current.scrollWidth > textElementRef.current.clientWidth,
    );
  }, []);

  return (
    <Tooltip
      title={children}
      disableHoverListener={!isOverflowed}
      placement={placement}
    >
      <div
        ref={textElementRef}
        style={{
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          ...style,
        }}
      >
        {children}
      </div>
    </Tooltip>
  );
};
