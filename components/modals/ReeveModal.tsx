'use client';

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@/components/datatables";

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    className?: string;
}

export const ReeveModal: React.FC<ModalProps> = ({
                                                     isOpen,
                                                     onClose,
                                                     title,
                                                     children,
                                                     className = "",
                                                 }) => {
    const modalVariants = {
        hidden: { x: "100%", opacity: 0 },
        visible: { x: 0, opacity: 1 },
        exit: { x: "100%", opacity: 0 },
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    variants={modalVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className={`absolute top-12 right-0 bottom-2 w-[30rem] bg-white rounded-lg shadow-xl border border-gray-200 z-50 flex flex-col ${className}`}
                >
                    <div className="flex justify-between items-center shrink-0 p-4 border-b border-gray-200">
                        <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
                        <button
                            onClick={onClose}
                            className="text-gray-500 hover:text-gray-700 border rounded-lg p-2 border-gray-200"
                        >
                            <Icon provider="io" iconName="IoMdClose" size={20} />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto">{children}</div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
