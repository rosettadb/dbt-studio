import React from 'react';

interface CollapseIconProps {
  size?: number;
}

export const CollapseLeftIcon: React.FC<CollapseIconProps> = ({
  size = 24,
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="currentColor"
      role="presentation"
    >
      <g>
        <path d="M23 5H5C3.9 5 3 5.9 3 7V21C3 22.1 3.9 23 5 23H23C24.1 23 25 22.1 25 21V7C25 5.9 24.1 5 23 5ZM5 7H9V21H5V7ZM23 21H11V7H23V21Z" />
        <path d="M14.2901 14.71L18.2901 18.71L19.7001 17.3L16.4101 14.01L19.7001 10.72L18.2901 9.31L14.2901 13.31C13.9001 13.7 13.9001 14.33 14.2901 14.72V14.71Z" />
      </g>
    </svg>
  );
};

export const CollapseRightIcon: React.FC<CollapseIconProps> = ({
  size = 24,
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="currentColor"
      role="presentation"
      style={{
        transform: 'scaleX(-1)', // Flip horizontally for expand state
      }}
    >
      <g>
        <path d="M23 5H5C3.9 5 3 5.9 3 7V21C3 22.1 3.9 23 5 23H23C24.1 23 25 22.1 25 21V7C25 5.9 24.1 5 23 5ZM5 7H9V21H5V7ZM23 21H11V7H23V21Z" />
        <path d="M14.2901 14.71L18.2901 18.71L19.7001 17.3L16.4101 14.01L19.7001 10.72L18.2901 9.31L14.2901 13.31C13.9001 13.7 13.9001 14.33 14.2901 14.72V14.71Z" />
      </g>
    </svg>
  );
};

export const ExpandRightIcon: React.FC<CollapseIconProps> = ({ size = 24 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="currentColor"
      role="presentation"
    >
      <g>
        <path d="M5 5H23C24.1 5 25 5.9 25 7V21C25 22.1 24.1 23 23 23H5C3.9 23 3 22.1 3 21V7C3 5.9 3.9 5 5 5ZM23 7H19V21H23V7ZM5 21H17V7H5V21Z" />
        <path d="M13.7099 14.71L9.70994 18.71L8.29994 17.3L11.5899 14.01L8.29994 10.72L9.70994 9.31L13.7099 13.31C14.0999 13.7 14.0999 14.33 13.7099 14.72V14.71Z" />
      </g>
    </svg>
  );
};
