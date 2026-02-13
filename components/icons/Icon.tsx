import React from 'react';
import iconLibraries from './icons';
import { IconType, IconBaseProps } from 'react-icons';

interface ReactIconProps extends IconBaseProps {
  provider: keyof typeof iconLibraries;
  iconName: string;
}

const Icon: React.FC<ReactIconProps> = ({ provider, iconName, ...props }) => {
  const IconComponent: IconType | undefined = iconLibraries[provider]?.[iconName];

  if (!IconComponent) {
    return null;
  }

  return <IconComponent {...props} />;
};

export default Icon;