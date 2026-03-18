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
    type: 'select' | 'text' |'date-range'
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

    const widthClass = layout === 'horizontal' ? 'w-auto min-w-[300px]' : 'w-full';

    const allSelected = filter.multiple && options.length > 0 &&
        options.every(o => Array.isArray(selectedValues) && selectedValues.includes(o.value));

    const someSelected = filter.multiple && Array.isArray(selectedValues) && selectedValues.length > 0 && !allSelected;

    return (
        <div className={`text-sm ${widthClass}`}>
            {/* Trigger Button */}
            <div
                ref={buttonRef}
                className={`flex items-center gap-3 bg-white p-3 mt-1 border  transition-all duration-200 ${widthClass}
                    ${isTextInputMode ? '' : 'cursor-pointer'}
                    ${hasSelection
                    ? 'border-[#de4925] shadow-[0_0_10px_rgba(222,73,37,0.25)]'
                    : 'border-[#75a6cd] hover:border-teal-500'
                }`}
                onClick={(e) => !isTextInputMode && handleClick(e)}
            >
                {isSelect && (
                    <Icon
                        provider="io5"
                        iconName="IoFilterOutline"
                        size={20}
                        className={hasSelection ? "text-[#de4925]" : "text-gray-600"}
                    />
                )}

                {isTextInputMode ?
                    (
                        <input
                            type="text"
                            placeholder={filter.label}
                            value={selectedValues || ""}
                            onChange={(e) => {
                                setSelectedValues(e.target.value);
                                onChange(e.target.value);
                            }}
                            className="flex-1 outline-none text-gray-700 placeholder-gray-400 text-sm"
                        />
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
                                                    className={hasSelection ? "text-[#de4925]" : "text-gray-600"}
                                                />

                                                <span
                                                    className={`text-sm truncate ${
                                                        hasSelection ? "text-gray-700 font-medium" : "text-gray-500"
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
                                                    className="ml-2 p-1 hover:bg-gray-200 rounded-full transition-colors"
                                                >
                                                    <Icon provider="io5" iconName="IoClose" size={16} className="text-gray-500" />
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
                                <div className="flex-1 min-w-0">
                                    {hasSelection ? (
                                        <div className="flex items-center gap-2">
                                <span className="text-gray-700 font-medium whitespace-nowrap">
                                    {filter.label}:
                                </span>
                                            <div className="flex-1 overflow-x-auto scrollbar-hide">
                                                <div className="inline-flex items-center gap-1.5">
                                                    {filter.multiple ? (
                                                        (Array.isArray(selectedValues) ? selectedValues : []).map(val => {
                                                            const opt = options.find(o => o.value === val);
                                                            return (
                                                                <span
                                                                    key={val}
                                                                    className="inline-flex items-center gap-1.5 bg-[#de4925]/10 text-[#c53e20] text-xs font-medium px-2.5 py-1 rounded-full border border-[#de4925]/30 whitespace-nowrap"
                                                                >
                                                        <span
                                                            className="max-w-[120px] truncate">{opt?.label || val}</span>
                                                        <button
                                                            onClick={(e) => removeTag(val, e)}
                                                            className="flex-shrink-0 w-4 h-4 rounded-full hover:bg-[#de4925]/30 flex items-center justify-center"
                                                        >
                                                            <Icon provider="io5" iconName="IoClose" size={14}
                                                                  className="text-[#c53e20]"/>
                                                        </button>
                                                    </span>
                                                            );
                                                        })
                                                    ) : (
                                                        <span
                                                            className="inline-flex items-center gap-1.5 bg-[#de4925]/10 text-[#c53e20] text-xs font-medium px-2.5 py-1 rounded-full border border-[#de4925]/30">
                                                {options.find(o => o.value === selectedValues)?.label || selectedValues}
                                                            <button
                                                                onClick={(e) => removeTag(selectedValues, e)}
                                                                className="w-4 h-4 rounded-full hover:bg-[#de4925]/30 flex items-center justify-center"
                                                            >
                                                    <Icon provider="io5" iconName="IoClose" size={14}
                                                          className="text-[#c53e20]"/>
                                                </button>
                                            </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <span className="text-gray-700 font-medium">{filter.label}</span>
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
                            borderRadius: "12px",
                            boxShadow: "0 10px 40px rgba(0,0,0,0.15)",
                            mt: 1.5,
                        },
                    }}
                >
                    <motion.div
                        initial={{opacity: 0, scale: 0.95, y: -10}}
                        animate={{opacity: 1, scale: 1, y: 0}}
                        exit={{opacity: 0, scale: 0.95}}
                        transition={{duration: 0.2}}
                    >
                        <div className="p-3 pb-2">
                            <button
                                onClick={handleClose}
                                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 z-10"
                            >
                                <Icon provider="io5" iconName="IoClose" size={22}/>
                            </button>

                            {/* Select All (Only for multiple) */}
                            {filter.multiple && options.length > 0 && (
                                <label
                                    onClick={handleSelectAll}
                                    className="flex items-center gap-3 px-3 py-3 mb-1 cursor-pointer hover:bg-gray-50 rounded-lg transition-colors border-b border-gray-100"
                                >
                                    <div className={`
                                        relative w-5 h-5 border-2 flex items-center justify-center rounded-md transition-all
                                        ${allSelected ? 'bg-[#de4925] border-[#de4925]' :
                                        someSelected ? 'bg-[#de4925] border-[#de4925]' :
                                            'bg-white border-gray-400 hover:border-gray-600'}
                                    `}>
                                        {allSelected && (
                                            <Icon provider="io5" iconName="IoCheckmark" size={18}
                                                  className="text-white font-bold"/>
                                        )}
                                        {someSelected && (
                                            <div className="w-3 h-3 bg-white rounded-sm"></div>
                                        )}
                                    </div>
                                    <span className="text-sm font-semibold text-gray-800">
                                        {allSelected ? 'Deselect All' : 'Select All'}
                                    </span>
                                </label>
                            )}

                            <div className="max-h-60 overflow-y-auto">
                                {options.map((option) => {
                                    const isSelected = filter.multiple
                                        ? Array.isArray(selectedValues) && selectedValues.includes(option.value)
                                        : selectedValues === option.value;

                                    return (
                                        <label
                                            key={option.value}
                                            className="flex items-center gap-3 px-3 py-3 cursor-pointer hover:bg-gray-50 rounded-lg transition-colors"
                                        >
                                            <input
                                                type={filter.multiple ? "checkbox" : "radio"}
                                                className="sr-only"
                                                checked={isSelected}
                                                onChange={() => handleSelectionChange(option.value)}
                                            />

                                            <div className={`
                                                relative w-5 h-5 border-2 flex items-center justify-center rounded-md transition-all
                                                ${isSelected
                                                ? 'bg-[#de4925] border-[#de4925]'
                                                : 'bg-white border-gray-400 hover:border-gray-600'
                                            }
                                            `}>
                                                {isSelected && (
                                                    <Icon
                                                        provider="io5"
                                                        iconName="IoCheckmark"
                                                        size={18}
                                                        className="text-white font-bold"
                                                    />
                                                )}
                                            </div>

                                            <span className="text-sm text-gray-800 select-none">
                                                {option.label}
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>

                            {/* Clear All */}
                            {filter.multiple && hasSelection && (
                                <div className="border-t border-gray-200 mt-3 pt-3 px-3">
                                    <button
                                        onClick={() => {
                                            setSelectedValues([]);
                                            onChange([]);
                                        }}
                                        className="w-full text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 py-2.5 rounded-lg transition-colors"
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
