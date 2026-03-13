import React from 'react';
import TooltipButton from "@/components/newUI/tooltip_button";

interface TableAction<T> {
  label: string;
  onClick: (row: T) => void;
  variant?: 'danger' | 'primary' | 'view' | 'pdf' | string;
  icon?: React.ReactNode;
  disabled?: boolean | ((row: T) => boolean);
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
        (() => {
          const isDisabled = typeof action.disabled === "function" ? action.disabled(row) : !!action.disabled;
          return (
        <TooltipButton
          key={index}
          tooltip={isDisabled ? `${action.label} (No permission)` : action.label}
          disabled={isDisabled}
          onClick={(e) => {
            e.stopPropagation();
            if (isDisabled) return;
            action.onClick(row);
          }}
          className={`group relative inline-flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-1 ${
            isDisabled
              ? "bg-gray-100 opacity-50 cursor-not-allowed"
              : "bg-gray-100 hover:shadow-lg hover:scale-105"
          }`}
        >
          {action.icon && (
            <span
              className={`transition-transform ${isDisabled ? "" : "group-hover:scale-110"} ${getIconStyles(
                action.variant
              )}`}
            >
              {action.icon}
            </span>
          )}
        </TooltipButton>
          );
        })()
      ))}
    </div>
  );
}
