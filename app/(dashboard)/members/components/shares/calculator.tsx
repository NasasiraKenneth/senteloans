"use client"

import { motion, AnimatePresence } from "framer-motion"
import ShareCalculatorForm from "../forms/shareCalculator"

interface SharesCalculatorModalProps {
  isOpen: boolean
  onClose: () => void
  shareValue?: number
  currency?: string
  onBuyShares?: () => void
}

export default function SharesCalculatorModal({
  isOpen,
  onClose,
  shareValue,
  currency,
  onBuyShares,
}: SharesCalculatorModalProps) {
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
            className="relative z-10 w-full max-w-sm space-y-4 rounded-xl border border-border bg-card p-5 shadow-xl"
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          >
            <ShareCalculatorForm
              shareValue={shareValue}
              currency={currency}
              onClose={onClose}
              onBuyShares={onBuyShares}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
