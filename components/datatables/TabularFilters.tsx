'use client';

import React, { useState, useEffect } from "react";
import { LayoutGroup, motion } from "framer-motion";
import type { Filter, TabularFiltersProps } from "@/types";

const slideTransition = { type: "tween", duration: 0.28, ease: [0.22, 1, 0.36, 1] } as const;
const tapTransition = { type: "spring", stiffness: 520, damping: 32 } as const;

const TabularFilters: React.FC<TabularFiltersProps> = ({ filters, onChange, value }) => {
  const [activeIndex, setActiveIndex] = useState<number>(0);

  useEffect(() => {
    if (value !== undefined) {
      const index = filters.findIndex(filter => filter.value === value);
      if (index !== -1) setActiveIndex(index);
    }
  }, [value, filters]);

  const handleChange = (idx: number, val: Filter["value"]) => {
    setActiveIndex(idx);
    onChange(val);
  };

  return (
      <>
        <div className="text-xs font-medium text-gray-600 dark:text-zinc-400 border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-xl mb-4 overflow-x-auto scrollbar-autohide shadow-xs">
          <LayoutGroup id="tabular-filters">
            <ul className="flex flex-col md:flex-row w-full min-w-max md:min-w-0">
              {filters.map((filter, idx) => {
                const isActive = activeIndex === idx;

                return (
                    <li
                        key={idx}
                        className="w-full md:flex-1 border-b md:border-b-0 md:border-r border-gray-100 dark:border-zinc-800/80 last:border-0 md:last:border-r-0"
                    >
                      <motion.button
                          onClick={() => handleChange(idx, filter.value)}
                          whileTap={{ scale: 0.985 }}
                          transition={tapTransition}
                          className="relative w-full px-4 py-2.5 text-xs overflow-hidden isolate cursor-pointer hover:bg-gray-50/60 dark:hover:bg-zinc-800/50 transition-colors"
                      >
                        {isActive && (
                          <motion.span
                            layoutId="active-tabular-filter-bg"
                            className="absolute inset-0 bg-brand shadow-xs shadow-brand/20"
                            transition={slideTransition}
                          />
                        )}
                        <span className={`relative z-10 inline-block transition-colors duration-200 ${isActive ? "text-white font-semibold" : "text-gray-600 dark:text-zinc-400 hover:text-brand dark:hover:text-zinc-100"}`}>
                          {filter.label}
                        </span>
                      </motion.button>
                    </li>
                );
              })}
            </ul>
          </LayoutGroup>
        </div>
        <hr className="border-gray-200 dark:border-zinc-800" />
      </>
  );
};

export default TabularFilters;
