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
        <div className="text-xs font-medium text-gray-600 border border-gray-100 bg-white rounded-lg mb-4">
          <LayoutGroup id="tabular-filters">
            <ul className="flex flex-col md:flex-row w-full">
              {filters.map((filter, idx) => {
                const isActive = activeIndex === idx;

                return (
                    <li
                        key={idx}
                        className="w-full md:flex-1 border-b md:border-b-0 md:border-r border-gray-100 last:border-0 md:last:border-r-0"
                    >
                      <motion.button
                          onClick={() => handleChange(idx, filter.value)}
                          whileTap={{ scale: 0.985 }}
                          transition={tapTransition}
                          className="relative w-full px-3 py-2 text-xs overflow-hidden isolate"
                      >
                        {isActive && (
                          <motion.span
                            layoutId="active-tabular-filter-bg"
                            className="absolute inset-0 rounded-none md:rounded-none bg-[#de4925]"
                            transition={slideTransition}
                          />
                        )}
                        <span className={`relative z-10 inline-block transition-colors duration-200 ${isActive ? "text-white font-semibold" : "text-gray-500 hover:text-[#de4925]"}`}>
                          {filter.label}
                        </span>
                      </motion.button>
                    </li>
                );
              })}
            </ul>
          </LayoutGroup>
        </div>
        <hr className="border-gray-400" />
      </>
  );
};

export default TabularFilters;
