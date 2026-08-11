"use client"

import { motion, AnimatePresence } from "framer-motion"
import LoanCalculatorForm from "./forms/calculatorForm"

interface LoanCalculatorModalProps {
  isOpen: boolean
  onClose: () => void
  onApplyLoan?: () => void
  currency?: string
  memberId?: string
  memberLoans?: Array<{
    id: string
    application_id?: string
    status?: string
    outstanding_balance?: number
    principal_amount?: number
  }>
  isClientPortal?: boolean
}

export default function LoanCalculatorModal({
  isOpen,
  onClose,
  onApplyLoan,
  currency,
  memberId,
  memberLoans,
  isClientPortal,
}: LoanCalculatorModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/50" onClick={onClose} />
          <motion.div
            className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-4 rounded-xl border border-border bg-card p-5 shadow-xl"
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          >
            <LoanCalculatorForm
              onClose={onClose}
              onApplyLoan={onApplyLoan}
              currency={currency}
              memberId={memberId}
              memberLoans={memberLoans}
              isClientPortal={isClientPortal}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
