import React from 'react';

interface TableAction<T> {
  label: string;
  onClick: (row: T) => void;
  variant?: 'danger' | 'primary' | 'view' | 'pdf' | string;
  icon?: React.ReactNode;
}

interface ActionButtonsProps<T> {
  actions: TableAction<T>[];
  row: T;
}

export function ActionButtons<T>({ actions, row }: ActionButtonsProps<T>) {
  const getIconStyles = (variant?: string) => {
    switch (variant) {
      case 'danger':
        return 'text-red-500 group-hover:text-red-600';
      case 'primary':
        return 'text-blue-500 group-hover:text-blue-600';
      case 'view':
        return 'text-green-500 group-hover:text-green-600';
      case 'pdf':
        return 'text-orange-500 group-hover:text-orange-600';
      default:
        return 'text-gray-500 group-hover:text-gray-600';
    }
  };

  return (
    <div className="flex items-center gap-2">
      {actions.map((action, index) => (
        <button
          key={index}
          onClick={(e) => {
            e.stopPropagation();
            action.onClick(row);
          }}
          className="group relative inline-flex items-center justify-center w-8 h-8 bg-gray-100 rounded-lg transition-all duration-200 hover:shadow-lg hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-1"
          title={action.label}
        >
          {action.icon && (
            <span
              className={`transition-transform group-hover:scale-110 ${getIconStyles(
                action.variant
              )}`}
            >
              {action.icon}
            </span>
          )}

          {/* Tooltip */}
          <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
            {action.label}
          </div>
        </button>
      ))}
    </div>
  );
}
