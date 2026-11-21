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
  showSelectedDescription?: boolean;
}

export default function StyledSelect({
  value,
  onChange,
  placeholder,
  options,
  searchable = false,
  disabled = false,
  showSelectedDescription = false,
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
        className={`flex items-center justify-between w-full px-3 py-2 text-sm border rounded-md bg-background transition-all duration-200 ${
          disabled
            ? "bg-muted/50 text-muted-foreground cursor-not-allowed border-border"
            : open
            ? "ring-[1.5px] ring-brand border-transparent cursor-pointer"
            : "border-input hover:border-brand/50 cursor-pointer"
        }`}
      >
        <div className="flex flex-col text-left overflow-hidden">
          <span className={value ? "text-foreground font-medium truncate" : "text-muted-foreground truncate"}>
            {selectedOpt ? safeText(selectedOpt.label) : placeholder}
          </span>
          {showSelectedDescription && selectedOpt?.description && (
            <span className="text-xs text-muted-foreground font-normal truncate">
              {safeText(selectedOpt.description)}
            </span>
          )}
        </div>
        <svg
          className={`h-4 w-4 text-muted-foreground transition-transform flex-shrink-0 ml-2 ${open ? "rotate-180" : ""}`}
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
            boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
            mt: 0.5,
            backgroundColor: "var(--color-card, #ffffff)",
            color: "var(--color-foreground, #1a1a1a)",
            border: "1px solid var(--color-border, #e5e7eb)",
          },
        }}
      >
        <div className="p-2">
          {searchable && (
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full px-3 py-2 mb-2 border border-border bg-background text-foreground placeholder:text-muted-foreground rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-brand"
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
                  className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-brand/10 rounded-lg transition-colors"
                >
                  <div
                    className={`relative w-4.5 h-4.5 border-2 flex items-center justify-center rounded-md transition-all mt-0.5 flex-shrink-0 ${
                      isSelected
                        ? "bg-brand border-brand"
                        : "bg-background border-border hover:border-brand/60"
                    }`}
                  >
                    {isSelected && (
                      <svg
                        className="w-3 h-3 text-brand-foreground"
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
                    <span className="text-sm font-medium text-foreground">{safeText(opt?.label)}</span>
                    {opt.description && (
                      <span className="text-xs text-muted-foreground font-normal mt-0.5 leading-snug">
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
