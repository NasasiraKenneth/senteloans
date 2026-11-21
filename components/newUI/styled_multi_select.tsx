"use client";

import { useState } from "react";
import Popover from "@mui/material/Popover";

type SelectOption = { value: string; label: string };

interface StyledMultiSelectProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder: string;
  options: SelectOption[];
  searchable?: boolean;
}

export default function StyledMultiSelect({
  value,
  onChange,
  placeholder,
  options,
  searchable = false,
}: StyledMultiSelectProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [search, setSearch] = useState("");
  const open = Boolean(anchor);
  const safeText = (v: unknown) => String(v ?? "");
  const selectedValues = Array.isArray(value) ? value : [];
  const selectedLabels = options
    .filter((o) => selectedValues.includes(o.value))
    .map((o) => safeText(o.label));

  const selectedLabel =
    selectedLabels.length === 0
      ? ""
      : selectedLabels.length <= 2
        ? selectedLabels.join(", ")
        : `${selectedLabels.length} selected`;

  const filteredOptions = searchable
    ? options.filter((o) =>
        safeText(o?.label).toLowerCase().includes(search.toLowerCase()),
      )
    : options;

  const toggleValue = (nextValue: string) => {
    const next = selectedValues.includes(nextValue)
      ? selectedValues.filter((v) => v !== nextValue)
      : [...selectedValues, nextValue];
    onChange(next);
  };

  const clearAll = () => onChange([]);

  return (
    <>
      <div
        onClick={(e) => setAnchor(e.currentTarget)}
        className={`flex items-center justify-between w-full px-3 py-2.5 text-sm border rounded-md bg-background cursor-pointer transition-all duration-200 ${
          open
            ? "ring-[1.5px] ring-brand border-transparent"
            : "border-input hover:border-brand/50"
        }`}
      >
        <span className={selectedValues.length > 0 ? "text-foreground truncate pr-2" : "text-muted-foreground"}>
          {selectedLabel || placeholder}
        </span>
        <svg
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
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
            width: anchor?.offsetWidth || 200,
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

          <div className="max-h-60 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">No options found.</div>
            ) : null}
            {filteredOptions.map((opt) => {
              const isSelected = selectedValues.includes(opt.value);
              return (
                <div
                  key={opt.value}
                  onClick={() => toggleValue(opt.value)}
                  className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-brand/10 rounded-lg transition-colors"
                >
                  <div
                    className={`relative w-4.5 h-4.5 border-2 flex items-center justify-center rounded-md transition-all ${
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
                  <span className="text-sm text-foreground">{safeText(opt?.label)}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2">
            <button
              type="button"
              onClick={clearAll}
              disabled={selectedValues.length === 0}
              className="px-3 py-1.5 text-xs rounded-md border border-border text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => {
                setAnchor(null);
                setSearch("");
              }}
              className="px-3 py-1.5 text-xs rounded-md bg-brand text-brand-foreground hover:bg-brand-700"
            >
              Done
            </button>
          </div>
        </div>
      </Popover>
    </>
  );
}
