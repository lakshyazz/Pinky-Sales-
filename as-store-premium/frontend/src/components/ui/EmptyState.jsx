import React from 'react';
import { Package, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

export default function EmptyState({ title, description, icon: Icon = Package }) {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.94, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 280, damping: 22 }}
      className="empty flex flex-col items-center justify-center p-10 text-center bg-gradient-to-b from-slate-50/80 to-slate-100/40 border border-dashed border-slate-200/80 rounded-3xl backdrop-blur-md shadow-inner my-4"
    >
      <motion.div 
        animate={{ y: [-4, 4, -4], rotate: [-2, 2, -2] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-600 mb-4 shadow-lg shadow-cyan-500/5"
      >
        <Icon size={26} />
        <span className="absolute -top-1 -right-1 w-3 h-3 bg-cyan-400 rounded-full ping-indicator" />
      </motion.div>
      <span className="text-base font-extrabold text-slate-800 block tracking-tight">{title}</span>
      {description && <small className="text-xs font-semibold text-slate-400 mt-1.5 max-w-sm leading-relaxed block">{description}</small>}
    </motion.div>
  );
}

