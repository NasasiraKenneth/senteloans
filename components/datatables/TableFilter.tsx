'use client';

import React, {useState, useRef, useEffect} from "react";
import {Popover} from "@mui/material";
import {motion} from "framer-motion";
import {Icon} from "@/components/datatables";
import DatePicker from "react-multi-date-picker";
import {convertDate} from "@/app/lib/utils";

export interface SelectFilterProps {
    filter: FilterField;
    onChange: (selectedValues: any) => void;
    value?: any;
    layout?: 'grid' | 'horizontal';
}

export interface FilterField {
    field: string;
    label: string;
    options?: { value: any; label: string }[];
    multiple?: boolean;
    type: 'select' | 'text' | 'date-range'
}

const POPOVER_WIDTH = 320;

const TableFilter: React.FC<SelectFilterProps> = ({filter, onChange, value, layout = 'grid'}) => {
    const [selectedValues, setSelectedValues] = useState<any>(value ?? (filter.multiple ? [] : ''));
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
    const buttonRef = useRef<HTMLDivElement>(null);
    const datePickerRef = useRef<any>(null);

    const isTextInputMode = filter.type === 'text';
    const isDateRange = filter.type === 'date-range';
    const isSelect = filter.type === "select" || (filter.options && filter.options.length > 0)

    const options = filter.options || [];

    useEffect(() => {
        setSelectedValues(value ?? (filter.multiple ? [] : ''));
    }, [value]);

    const handleClick = (event: React.MouseEvent<HTMLElement>) => {
        if (isTextInputMode) return;
        setAnchorEl(event.currentTarget);
    };

    const handleClose = () => setAnchorEl(null);

    const handleSelectionChange = (optionValue: any) => {
        if (!filter.multiple) {
            setSelectedValues(optionValue);
            onChange(optionValue);
            handleClose();
            return;
        }

        const current = Array.isArray(selectedValues) ? selectedValues : [];
        const newSelected = current.includes(optionValue)
            ? current.filter(v => v !== optionValue)
            : [...current, optionValue];

        setSelectedValues(newSelected);
        onChange(newSelected);
    };

    const handleSelectAll = () => {
        const allValues = options.map(o => o.value);
        const current = Array.isArray(selectedValues) ? selectedValues : [];

        const allSelected = allValues.every(v => current.includes(v));
        const newValues = allSelected ? [] : allValues;

        setSelectedValues(newValues);
        onChange(newValues);
    };

    const removeTag = (val: any, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!filter.multiple) {
            setSelectedValues('');
            onChange('');
            return;
        }
        const newSelected = (Array.isArray(selectedValues) ? selectedValues : []).filter(v => v !== val);
        setSelectedValues(newSelected);
        onChange(newSelected);
    };

    const open = Boolean(anchorEl);
    const hasDateSelection = isDateRange
        ? Array.isArray(selectedValues) && selectedValues.some((d) => !!d)
        : false;
    const hasSelection = isDateRange
        ? hasDateSelection
        : filter.multiple
            ? Array.isArray(selectedValues) && selectedValues.length > 0
            : !!selectedValues;

    const widthClass = layout === 'horizontal' ? 'w-auto min-w-[300px] max-w-full' : 'w-full';

    const allSelected = filter.multiple && options.length > 0 &&
        options.every(o => Array.isArray(selectedValues) && selectedValues.includes(o.value));

    const someSelected = filter.multiple && Array.isArray(selectedValues) && selectedValues.length > 0 && !allSelected;

    return (
        <div className={`text-sm ${widthClass}`}>
            {/* Trigger Button */}
            <div
                ref={buttonRef}
                className={`flex items-center gap-3 bg-white dark:bg-zinc-900/90 p-3 mt-1 rounded-xl border transition-all duration-200 ${widthClass}
                    ${isTextInputMode ? '' : 'cursor-pointer'}
                    ${hasSelection
                    ? 'border-brand bg-brand/[0.04] dark:bg-brand/10 shadow-[0_0_12px_rgba(var(--ui-p-rgb,240,140,43),0.2)]'
                    : 'border-gray-200 dark:border-zinc-800 hover:border-brand/40 text-gray-700 dark:text-zinc-300 hover:bg-gray-50/50 dark:hover:bg-zinc-800/40'
                }`}
                onClick={(e) => !isTextInputMode && handleClick(e)}
            >
                {isSelect && (
                    <Icon
                        provider="io5"
                        iconName="IoFilterOutline"
                        size={20}
                        className={hasSelection ? "text-brand" : "text-gray-500 dark:text-zinc-400"}
                    />
                )}

                {isTextInputMode ?
                    (
                        <div className="flex items-center justify-between w-full">
                            <input
                                type="text"
                                placeholder={filter.label}
                                value={selectedValues || ""}
                                onChange={(e) => {
                                    setSelectedValues(e.target.value);
                                    onChange(e.target.value);
                                }}
                                className="flex-1 outline-none bg-transparent text-gray-800 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-500 text-sm"
                            />
                            {selectedValues ? (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setSelectedValues("");
                                        onChange("");
                                    }}
                                    className="ml-2 p-1 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
                                >
                                    <Icon provider="io5" iconName="IoClose" size={16} className="text-gray-400 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200" />
                                </button>
                            ) : null}
                        </div>
                    ) :
                    isDateRange ?
                        (
                            <>
                                <DatePicker
                                    ref={datePickerRef}
                                    range
                                    value={selectedValues}
                                    onChange={(dateObjects) => {
                                        let result;
                                        if (isDateRange) {
                                            result = Array.isArray(dateObjects)
                                                ? dateObjects.map(d => d?.toDate?.() || null)
                                                : [];
                                        } else {
                                            result = dateObjects ? (dateObjects as any)?.toDate?.() : null;
                                        }
                                        setSelectedValues(result);
                                        onChange(result);
                                    }}
                                    // Correct render prop signature
                                    render={(value, openCalendar) => (
                                        <div
                                            onClick={openCalendar}
                                            className="flex items-center justify-between w-full h-full cursor-pointer select-none"
                                        >
                                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                                <Icon
                                                    provider="fa"
                                                    iconName="FaCalendarAlt"
                                                    className={hasSelection ? "text-brand" : "text-gray-500 dark:text-zinc-400"}
                                                />

                                                <span
                                                    className={`text-sm truncate ${
                                                        hasSelection ? "text-gray-900 dark:text-zinc-100 font-medium" : "text-gray-500 dark:text-zinc-400"
                                                    }`}
                                                >
                                                    {hasSelection && selectedValues && selectedValues.length > 1
                                                        ?
                                                            <span>{convertDate(selectedValues[0])} - {convertDate(selectedValues[1], true)}</span>
                                                        :
                                                            filter.label}
                                                  </span>
                                            </div>

                                            {/* Clear button */}
                                            {hasSelection && (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation(); // Prevent opening calendar when clearing
                                                        setSelectedValues(isDateRange ? [] : null);
                                                        onChange(isDateRange ? [] : null);
                                                        datePickerRef.current?.closeCalendar?.();
                                                        handleClose();
                                                    }}
                                                    className="ml-2 p-1 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
                                                >
                                                    <Icon provider="io5" iconName="IoClose" size={16} className="text-gray-400 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200" />
                                                </button>
                                            )}
                                        </div>
                                    )}
                                    // These prevent the default hidden input from breaking layout
                                    inputClass="hidden"
                                    containerClassName="w-full h-full"
                                />
                            </>
                        )

                            : (
                                <div className="flex-1">
                                    {hasSelection ? (
                                        <div className="flex items-center gap-2">
                                <span className="text-gray-700 dark:text-zinc-300 font-medium whitespace-nowrap">
                                    {filter.label}:
                                </span>
                                            <div className="flex-1 overflow-x-auto scrollbar-autohide">
                                                <div className="inline-flex items-center gap-1.5">
                                                    {filter.multiple ? (
                                                        (Array.isArray(selectedValues) ? selectedValues : []).map(val => {
                                                            const opt = options.find(o => o.value === val);
                                                            return (
                                                                <span
                                                                    key={val}
                                                                    className="inline-flex items-center gap-1.5 bg-brand/10 dark:bg-brand/15 text-brand dark:text-brand text-xs font-semibold px-2.5 py-1 rounded-full border border-brand/25 dark:border-brand/35 whitespace-nowrap"
                                                                >
                                                        <span
                                                            className="max-w-[120px] truncate">{opt?.label || val}</span>
                                                        <button
                                                            onClick={(e) => removeTag(val, e)}
                                                            className="flex-shrink-0 w-4 h-4 rounded-full hover:bg-brand/20 dark:hover:bg-brand/30 flex items-center justify-center text-brand transition-colors"
                                                        >
                                                            <Icon provider="io5" iconName="IoClose" size={14}
                                                                  className="text-brand"/>
                                                        </button>
                                                    </span>
                                                            );
                                                        })
                                                    ) : (
                                                        <span
                                                            className="inline-flex items-center gap-1.5 bg-brand/10 dark:bg-brand/15 text-brand dark:text-brand text-xs font-semibold px-2.5 py-1 rounded-full border border-brand/25 dark:border-brand/35">
                                                {options.find(o => o.value === selectedValues)?.label || selectedValues}
                                                            <button
                                                                onClick={(e) => removeTag(selectedValues, e)}
                                                                className="w-4 h-4 rounded-full hover:bg-brand/20 dark:hover:bg-brand/30 flex items-center justify-center text-brand transition-colors"
                                                            >
                                                    <Icon provider="io5" iconName="IoClose" size={14}
                                                          className="text-brand"/>
                                                </button>
                                            </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <span className="text-gray-700 dark:text-zinc-300 font-medium">{filter.label}</span>
                                    )}
                                </div>
                            )}
            </div>

            {/* Popover */}
            {isSelect && (
                <Popover
                    open={open}
                    anchorEl={anchorEl}
                    onClose={handleClose}
                    anchorOrigin={{vertical: "bottom", horizontal: "left"}}
                    transformOrigin={{vertical: "top", horizontal: "left"}}
                    PaperProps={{
                        sx: {
                            width: POPOVER_WIDTH,
                            maxWidth: "none",
                            borderRadius: "16px",
                            boxShadow: "0 16px 40px rgba(0,0,0,0.35)",
                            mt: 1.5,
                            backgroundColor: "var(--color-card, #18181b)",
                            color: "var(--color-foreground, #f4f4f5)",
                            border: "1px solid var(--color-border, rgba(255, 255, 255, 0.1))",
                            overflow: "hidden",
                        },
                    }}
                >
                    <motion.div
                        initial={{opacity: 0, scale: 0.95, y: -10}}
                        animate={{opacity: 1, scale: 1, y: 0}}
                        exit={{opacity: 0, scale: 0.95}}
                        transition={{duration: 0.2}}
                        className="bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 rounded-2xl overflow-hidden"
                    >
                        <div className="p-3 pb-2">
                            <button
                                onClick={handleClose}
                                className="absolute top-3 right-3 text-gray-400 hover:text-gray-700 dark:text-zinc-400 dark:hover:text-white z-10 transition-colors p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800"
                            >
                                <Icon provider="io5" iconName="IoClose" size={18}/>
                            </button>

                            {/* Select All (Only for multiple) */}
                            {filter.multiple && options.length > 0 && (
                                <label
                                    onClick={handleSelectAll}
                                    className="flex items-center gap-3 px-3 py-2.5 mb-1 cursor-pointer hover:bg-brand/5 dark:hover:bg-zinc-800/80 rounded-lg transition-colors border-b border-gray-100 dark:border-zinc-800"
                                >
                                    <div className={`
                                        relative w-5 h-5 border-2 flex items-center justify-center rounded-md transition-all
                                        ${allSelected ? 'bg-brand border-brand shadow-xs shadow-brand/30' :
                                        someSelected ? 'bg-brand border-brand shadow-xs shadow-brand/30' :
                                            'bg-white dark:bg-zinc-800 border-gray-300 dark:border-zinc-700 hover:border-brand/70'}
                                    `}>
                                        {allSelected && (
                                            <Icon provider="io5" iconName="IoCheckmark" size={16}
                                                  className="text-brand-foreground font-bold"/>
                                        )}
                                        {someSelected && (
                                            <div className="w-2.5 h-2.5 bg-brand-foreground rounded-xs"></div>
                                        )}
                                    </div>
                                    <span className="text-sm font-semibold text-gray-800 dark:text-zinc-200">
                                        {allSelected ? 'Deselect All' : 'Select All'}
                                    </span>
                                </label>
                            )}

                            <div className="max-h-60 overflow-y-auto scrollbar-autohide pr-1">
                                {options.map((option) => {
                                    const isSelected = filter.multiple
                                        ? Array.isArray(selectedValues) && selectedValues.includes(option.value)
                                        : selectedValues === option.value;

                                    return (
                                        <label
                                            key={option.value}
                                            className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-brand/5 dark:hover:bg-zinc-800/70 rounded-lg transition-colors"
                                        >
                                            <input
                                                type={filter.multiple ? "checkbox" : "radio"}
                                                className="sr-only"
                                                checked={isSelected}
                                                onChange={() => handleSelectionChange(option.value)}
                                            />

                                            <div className={`
                                                relative w-5 h-5 border-2 flex items-center justify-center ${filter.multiple ? 'rounded-md' : 'rounded-full'} transition-all
                                                ${isSelected
                                                ? 'bg-brand border-brand shadow-xs shadow-brand/30'
                                                : 'bg-white dark:bg-zinc-800 border-gray-300 dark:border-zinc-700 hover:border-brand/70'
                                            }
                                            `}>
                                                {isSelected && (
                                                    filter.multiple ? (
                                                        <Icon
                                                            provider="io5"
                                                            iconName="IoCheckmark"
                                                            size={16}
                                                            className="text-brand-foreground font-bold"
                                                        />
                                                    ) : (
                                                        <div className="w-2 h-2 rounded-full bg-brand-foreground" />
                                                    )
                                                )}
                                            </div>

                                            <span className={`text-sm select-none transition-colors ${isSelected ? 'text-brand dark:text-brand font-medium' : 'text-gray-800 dark:text-zinc-200'}`}>
                                                {option.label}
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>

                            {/* Clear All */}
                            {filter.multiple && hasSelection && (
                                <div className="border-t border-gray-100 dark:border-zinc-800 mt-2 pt-2 px-1">
                                    <button
                                        onClick={() => {
                                            setSelectedValues([]);
                                            onChange([]);
                                        }}
                                        className="w-full text-xs font-semibold text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 py-2 rounded-lg transition-colors"
                                    >
                                        Clear all selections
                                    </button>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </Popover>
            )}
        </div>
    );
};

export default TableFilter;
