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

export const LowModal: React.FC<ModalProps> = ({
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
                    className={`absolute bottom-12 right-0 w-[30rem] bg-card text-card-foreground rounded-lg shadow-xl border border-border z-50 ${className}`}
                >
                    <div className="flex justify-between items-center p-4 border-b border-border">
                        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
                        <button
                            onClick={onClose}
                            className="text-muted-foreground hover:text-foreground hover:bg-muted border rounded-lg p-2 border-border transition-colors"
                        >
                            <Icon provider="io" iconName="IoMdClose" size={20} />
                        </button>
                    </div>
                    <div>{children}</div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
