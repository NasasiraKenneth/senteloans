import React from 'react';
import TooltipButton from "@/components/newUI/tooltip_button";

interface TableAction<T> {
  label: string;
  onClick: (row: T) => void;
  variant?: 'danger' | 'primary' | 'view' | 'pdf' | string;
  icon?: React.ReactNode;
  disabled?: boolean | ((row: T) => boolean);
  disabledTooltip?: string;
}

interface ActionButtonsProps<T> {
  actions: TableAction<T>[];
  row: T;
}

export function ActionButtons<T>({ actions, row }: ActionButtonsProps<T>) {
  const getIconStyles = (variant?: string) => {
    switch (variant) {
      case 'danger':
        return 'text-red-500 dark:text-red-400 group-hover:text-red-600 dark:group-hover:text-red-300';
      case 'primary':
        return 'text-brand group-hover:brightness-90 dark:group-hover:brightness-110';
      case 'view':
        return 'text-emerald-500 dark:text-emerald-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-300';
      case 'pdf':
        return 'text-brand group-hover:brightness-90 dark:group-hover:brightness-110';
      default:
        return 'text-gray-500 dark:text-zinc-400 group-hover:text-gray-700 dark:group-hover:text-zinc-200';
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
              tooltip={isDisabled ? (action.disabledTooltip ?? `${action.label} (No permission)`) : action.label}
              disabled={isDisabled}
              onClick={(e) => {
                e.stopPropagation();
                if (isDisabled) return;
                action.onClick(row);
              }}
              className={`group relative inline-flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-brand/30 ${
                isDisabled
                  ? "bg-gray-100 dark:bg-zinc-800/40 border border-transparent text-gray-400 dark:text-zinc-600 opacity-40 cursor-not-allowed"
                  : "bg-gray-100 dark:bg-zinc-800/90 border border-gray-200/60 dark:border-zinc-700/60 hover:bg-brand/10 dark:hover:bg-brand/20 hover:border-brand/40 text-gray-700 dark:text-zinc-200 hover:text-brand dark:hover:text-brand hover:shadow-md hover:scale-105"
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
