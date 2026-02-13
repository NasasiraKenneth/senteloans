'use client';

import React, { useState, useEffect } from "react";
import { motion, LayoutGroup } from "framer-motion";
import type { Filter, TabularFiltersProps } from "@/types";

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
      <LayoutGroup>
        <motion.div
            layout
            className="text-xs font-medium text-gray-600 border border-gray-100 bg-white rounded-lg mb-4"
        >
          <motion.ul
              layout
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="flex flex-col md:flex-row w-full"
          >
            {filters.map((filter, idx) => {
              const isActive = activeIndex === idx;

              return (
                  <motion.li
                      layout="position"
                      key={idx}
                      className="w-full md:flex-1"
                      transition={{ type: "spring", stiffness: 250, damping: 25 }}
                  >
                    <motion.button
                        layout="position"
                        onClick={() => handleChange(idx, filter.value)}
                        transition={{ type: "spring", stiffness: 300, damping: 25 }}
                        className={`w-full px-3 py-2 text-xs border-b md:border-b-0 md:border-r border-gray-100 
                                        last:border-0 md:last:border-r-0 transition-colors duration-200
                                        ${
                            isActive
                                ? "bg-[#de4925] text-white font-semibold"
                                : "text-gray-500 hover:text-[#de4925] hover:bg-gray-50"
                        }
                                    `}
                    >
                      {filter.label}
                    </motion.button>
                  </motion.li>
              );
            })}
          </motion.ul>
        </motion.div>
          <hr className="border-gray-400" />
      </LayoutGroup>
  );
};

export default TabularFilters;
