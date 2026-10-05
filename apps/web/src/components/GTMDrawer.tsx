import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import React from "react";

interface GTMDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function GTMDrawer({ isOpen, onClose, title, children }: GTMDrawerProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] cursor-pointer"
          />

          {/* Drawer / Half-Window */}
          <motion.div
            initial={{ x: "100%", opacity: 0.5 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0.5 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 h-full w-full max-w-lg bg-surface border-l border-border shadow-2xl z-[101] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-border bg-background/50">
              <h2 className="text-xl font-bold">{title}</h2>
              <button 
                onClick={onClose}
                className="p-2 rounded-full hover:bg-border/50 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5 text-text-muted hover:text-text-main" />
              </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-6">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
