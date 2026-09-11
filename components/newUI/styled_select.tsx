"use client";

import { useState } from "react";
import Popover from "@mui/material/Popover";

type SelectOption = { value: string; label: string; description?: string };

interface StyledSelectProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: SelectOption[];
  searchable?: boolean; // optional prop
  disabled?: boolean;
}

export default function StyledSelect({
  value,
  onChange,
  placeholder,
  options,
  searchable = false,
  disabled = false,
}: StyledSelectProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [search, setSearch] = useState(""); // search term
  const open = Boolean(anchor);
  const safeText = (v: unknown) => String(v ?? "");
  const selectedOpt = options.find((o) => o.value === value);

  // Filter options if searchable
  const filteredOptions = searchable
    ? options.filter((o) =>
        safeText(o?.label).toLowerCase().includes(search.toLowerCase()) ||
        safeText(o?.description).toLowerCase().includes(search.toLowerCase())
      )
    : options;

  return (
    <>
      <div
        onClick={(e) => {
          if (disabled) return;
          setAnchor(e.currentTarget);
        }}
        className={`flex items-center justify-between w-full px-3 py-2 text-sm border rounded-md transition-all duration-200 ${
          disabled
            ? "bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200"
            : open
            ? "ring-[1.5px] ring-[#f08c2b] border-transparent cursor-pointer"
            : "border-gray-300 hover:border-gray-400 cursor-pointer"
        }`}
      >
        <div className="flex flex-col text-left overflow-hidden">
          <span className={value ? "text-gray-900 font-medium truncate" : "text-gray-400 truncate"}>
            {selectedOpt ? safeText(selectedOpt.label) : placeholder}
          </span>
          {selectedOpt?.description && (
            <span className="text-xs text-gray-500 font-normal truncate">
              {safeText(selectedOpt.description)}
            </span>
          )}
        </div>
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform flex-shrink-0 ml-2 ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </div>

      <Popover
        open={open}
        anchorEl={anchor}
        onClose={() => {
          setAnchor(null);
          setSearch(""); // reset search when closing
        }}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        PaperProps={{
          sx: {
            width: anchor?.offsetWidth || 220,
            borderRadius: "10px",
            boxShadow: "0 10px 40px rgba(0,0,0,0.15)",
            mt: 0.5,
          },
        }}
      >
        <div className="p-2">
          {searchable && (
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full px-3 py-2 mb-2 border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#f08c2b]"
            />
          )}

          {/* Scrollable options list */}
          <div className="max-h-60 overflow-y-auto">
            {filteredOptions.map((opt) => {
              const isSelected = value === opt.value;
              return (
                <div
                  key={opt.value}
                  onClick={() => {
                    onChange(opt.value);
                    setAnchor(null);
                    setSearch(""); // reset search after selection
                  }}
                  className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <div
                    className={`relative w-4.5 h-4.5 border-2 flex items-center justify-center rounded-md transition-all mt-0.5 flex-shrink-0 ${
                      isSelected
                        ? "bg-[#f08c2b] border-[#f08c2b]"
                        : "bg-white border-gray-400 hover:border-gray-600"
                    }`}
                  >
                    {isSelected && (
                      <svg
                        className="w-3 h-3 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="text-sm font-medium text-gray-800">{safeText(opt?.label)}</span>
                    {opt.description && (
                      <span className="text-xs text-gray-500 font-normal mt-0.5 leading-snug">
                        {safeText(opt.description)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Popover>
    </>
  );
}
